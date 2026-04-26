"use client";

import { useState, useEffect, useRef, useMemo, startTransition } from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useLoading } from "@/hooks/use-loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  DollarSign,
  Scan,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { offlineAPIClient } from "@/lib/offline-api-client";
import { offlineDB } from "@/lib/offline-db";
import { syncManager } from "@/lib/offline-sync";
import { usePosData } from "@/hooks/use-pos-data";
import { printReceiptViaServer, type ReceiptData } from "@/lib/print-server";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHoldSales } from "@/hooks/use-hold-sales";
import { usePosBranch } from "@/hooks/use-pos-branch";

interface CartItem {
  id: string; // Unique cart item ID (product.id + timestamp for separate entries)
  productId?: string; // Original product ID for reference (optional for backward compatibility)
  name: string;
  price: number; // Display price (barcode price if scanned, otherwise original price)
  originalPrice: number; // Original product price (used for line total calculations)
  actualUnitPrice: number; // Actual unit price for calculations (always original product price)
  quantity: number;
  category: string;
  discount: number;
  unitId?: string;
  unitName?: string;
  unit?: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  categoryId: string;
  barcode?: string;
  available_stock?: number;
  current_stock?: number;
  reserved_stock?: number;
  minimum_stock?: number;
  maximum_stock?: number;
  unitId?: string;
  unitName?: string;
}

// Printer type from global hook
type Printer = ReturnType<typeof usePrinterSettings>["printers"][number];


export function ManualSale() {
  const [cart, setCart] = useState<CartItem[]>([]);
  // Track input values as strings to allow decimal point typing
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentMethodPending, setPaymentMethodPending] = useState<"Cash" | "Card" | null>(null);
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [calculatedChange, setCalculatedChange] = useState(0);
  const [paymentError, setPaymentError] = useState("");
  const {
    adminMode,
    branchLoading,
    branches: availableBranches,
    selectedBranchId,
    setSelectedBranchId,
    branchInfo,
    hasBranch,
  } = usePosBranch();
  const { holdSales, holdSale, retrieveHoldSale, holdSalesLoading, refreshHoldSales } =
    useHoldSales(selectedBranchId);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [globalDiscountType, setGlobalDiscountType] = useState<'percentage' | 'amount'>('percentage');
  const [discountInput, setDiscountInput] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Refs for price and quantity inputs for keyboard navigation
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const quantityInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lastAddedProductId = useRef<string | null>(null);
  // Refs for cart items and scrollable container
  const cartItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cartScrollContainerRef = useRef<HTMLDivElement | null>(null);
  // Manual sale doesn't need scan-related refs
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(
    null
  );
  const { loading: paymentLoading, withLoading: withPaymentLoading } =
    useLoading();
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  // Global printer settings (configured in Printer Settings page)
  const { receiptPrinter, getReceiptPrinterObj, printers } = usePrinterSettings();
  const [showHeldSales, setShowHeldSales] = useState(false);
  const [isHoldingSale, setIsHoldingSale] = useState(false);
  const [isViewingHeldSales, setIsViewingHeldSales] = useState(false);
  const [resumingHoldIndex, setResumingHoldIndex] = useState<number | null>(null);

  // Global store with custom hook
  const {
    products,
    categories,
    customers,
    productsLoading,
    categoriesLoading,
    customersLoading,
    isAnyLoading,
    fetchProducts,
    fetchCategories,
    fetchCustomers,
  } = usePosData();
  // Fetch initial data and focus search input
  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      if (!mounted) return;

      try {
        await Promise.all([
          fetchProducts(),
          fetchCategories(),
          fetchCustomers(),
        ]);
      } catch (error) {
        // Error loading data - no toast shown
      }
    };

    fetchData();

    // Focus the search input
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }

    // Cleanup function to prevent memory leaks and state updates after unmount
    return () => {
      mounted = false;
    };
  }, []); // Empty dependency array since we only want to fetch once on mount

  // Client-side filtering for instant search results
  // This provides instant feedback without API calls
  const filteredProducts = products.filter((product) => {
    // Filter by category
    const matchesCategory =
      selectedCategory === "all" || product.categoryId === selectedCategory;

    // Filter by search term (client-side)
    const matchesSearch = !searchTerm || (() => {
      const searchLower = searchTerm.toLowerCase().trim();
      if (searchLower.length === 0) return true;
      
      // Search in name, barcode, SKU
      const nameMatch = product.name?.toLowerCase().includes(searchLower);
      const barcodeMatch = product.barcode?.toLowerCase().includes(searchLower);
      const skuMatch = product.sku?.toLowerCase().includes(searchLower);
      
      return nameMatch || barcodeMatch || skuMatch;
    })();

    return matchesCategory && matchesSearch;
  });

  const addToCart = (product: Product, quantity: number = 1, customPrice?: number) => {
    // For testing: Allow negative sales (stock can go below 0)
    // Comment out stock validation for testing purposes
    /*
    const availableStock = product.available_stock ?? product.stock
    const currentQuantity = cart.find((item) => item.id === product.id)?.quantity || 0
    if (currentQuantity >= availableStock) {
      toast({
        variant: "destructive",
        title: "Insufficient Stock",
        description: `Only ${availableStock} units available for ${product.name}`,
      })
      return
    }
    */

    // When custom price is provided, it represents the TOTAL PRICE from barcode
    // Calculate quantity: barcodePrice / originalPrice
    // Original price is the price of 1 unit
    // Barcode price is the total price
    const originalProductPrice = product.price;
    
    // Calculate quantity from scanned price if custom price is provided
    let finalQuantity = quantity;
    let displayPrice = originalProductPrice; // Price to display in price field
    let actualUnitPrice = originalProductPrice; // Actual unit price for line total calculations (always original)
    
    if (customPrice !== undefined && originalProductPrice > 0) {
      // Calculate quantity: barcodePrice / originalPrice
      finalQuantity = customPrice / originalProductPrice;
      finalQuantity = Math.max(0.01, finalQuantity); // Ensure minimum quantity
      
      // Show the scanned price (barcode value) in the price field for display
      displayPrice = customPrice; // Display barcode price in price field
      // But keep actualUnitPrice as original for calculations
      actualUnitPrice = originalProductPrice; // Always use original price for line total
    } else {
      // If no custom price, ensure minimum quantity of 1
      finalQuantity = Math.max(1, quantity);
    }
    
    console.log('addToCart - Barcode price:', customPrice, 'Original price:', originalProductPrice, 'Calculated quantity:', finalQuantity, 'Display price:', displayPrice, 'Actual unit price:', actualUnitPrice);

    // Always create a NEW separate line item for each scan (don't increment existing)
    // Generate unique ID for each scan to allow multiple separate entries
    const uniqueCartItemId = `${product.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Use functional state update to avoid stale closure issues
    setCart((prevCart) => [
      ...prevCart,
      {
        id: uniqueCartItemId, // Unique ID for this cart entry (each scan = new entry)
        productId: product.id, // Store original product ID for reference
        name: product.name,
        price: displayPrice, // Display price (barcode price if scanned, otherwise original)
        originalPrice: originalProductPrice, // Store original product price
        actualUnitPrice: actualUnitPrice, // Actual unit price for line total calculations
        quantity: finalQuantity, // Calculated quantity (barcodePrice / originalPrice)
        category: product.category,
        discount: 0,
        unitId: product.unitId,
        unitName: product.unitName,
        unit: product.unitName,
      },
    ]);

    lastAddedProductId.current = uniqueCartItemId;
    
    // Use startTransition for non-urgent UI updates (scroll, focus) - doesn't block main thread
    startTransition(() => {
      // Instant scroll to newly added item (use unique cart item ID)
      setTimeout(() => {
        const cartItem = cartItemRefs.current[uniqueCartItemId];
        if (cartItem && cartScrollContainerRef.current) {
          cartItem.scrollIntoView({ 
            behavior: 'auto', // Instant scroll
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }, 0);

      // DISABLED: Auto-focus on price input - removed to prevent interference with scanning
      // Keep focus on search input for rapid scanning
      /*
      if (customPrice === undefined) {
        setTimeout(() => {
          const priceInput = priceInputRefs.current[uniqueCartItemId];
          if (priceInput) {
            priceInput.focus();
            priceInput.select();
          }
        }, 0);
      }
      */
    });

    // Toast removed as per user request - no toast when selecting products
  };

  // Helper function to format quantity with unit
  const formatQuantityWithUnit = (quantity: number, unitName?: string): string => {
    if (!unitName) return quantity.toFixed(2);
    
    const unitLower = unitName.toLowerCase();
    const qty = quantity;
    
    // For weight units (kgs, kg, kilograms)
    if (unitLower.includes('kg') || unitLower.includes('kilogram')) {
      if (qty >= 1) {
        return `${qty.toFixed(2)} kg`;
      } else {
        // Convert to grams for values less than 1kg
        const grams = qty * 1000;
        return `${grams.toFixed(0)} g`;
      }
    }
    
    // For gram units
    if (unitLower.includes('gram') || unitLower === 'g') {
      if (qty >= 1000) {
        const kg = qty / 1000;
        return `${kg.toFixed(2)} kg`;
      } else {
        return `${qty.toFixed(0)} g`;
      }
    }
    
    // For piece units (pcs, pieces, piece)
    if (unitLower.includes('pc') || unitLower.includes('piece')) {
      return `${qty.toFixed(0)} pcs`;
    }
    
    // For other units, show with unit name
    return `${qty.toFixed(2)} ${unitName}`;
  };

  // Helper function to get quantity increment based on unit
  const getQuantityIncrement = (unitName?: string): number => {
    if (!unitName) return 1;
    const unitLower = unitName.toLowerCase();
    
    // For weight units (kgs, kg, kilograms, gram, grams, g)
    if (unitLower.includes('kg') || unitLower.includes('kilogram') || 
        unitLower.includes('gram') || unitLower === 'g') {
      // Increment by 0.1 (100 grams) for weight units
      return 0.1;
    }
    
    // For piece units (pcs, pieces, piece)
    if (unitLower.includes('pc') || unitLower.includes('piece')) {
      return 1;
    }
    
    // Default increment
    return 1;
  };

  const updateQuantity = (id: string, change: number) => {
    const item = cart.find((item) => item.id === id);
    // Find product by productId if item has it, otherwise fallback to id (for backward compatibility)
    const product = item && (item as any).productId 
      ? products.find((p) => p.id === (item as any).productId)
      : products.find((p) => p.id === id);

    // For testing: Allow negative sales (stock can go below 0)
    // Comment out stock validation for testing purposes
    /*
    if (item && product) {
      const newQuantity = item.quantity + change
      const availableStock = product.available_stock ?? product.stock

      if (newQuantity > availableStock) {
        toast({
          variant: "destructive",
          title: "Insufficient Stock",
          description: `Only ${availableStock} units available`,
        })
        return
      }
    }
    */

    // Get unit-aware increment
    const unitName = item?.unitName || item?.unit || product?.unitName;
    const increment = getQuantityIncrement(unitName);
    const actualChange = change > 0 ? increment : -increment;

    setCart(
      cart.map((item) => {
        if (item.id === id) {
          const newQuantity = Number(item.quantity) + actualChange;
          return { ...item, quantity: Math.max(0.01, newQuantity) };
        }
        return item;
      })
    );
  };

  const updateQuantityManual = (id: string, newQuantity: number) => {
    // Ensure quantity is valid (>= 0.01)
    const validQuantity = Math.max(0.01, Number(newQuantity));
    setCart(
      cart.map((item) => {
        if (item.id === id) {
          return { ...item, quantity: validQuantity };
        }
        return item;
      })
    );
  };

  const updateItemPrice = (id: string, newPrice: number) => {
    // Ensure price is valid (>= 0)
    const validPrice = Math.max(0, Number(newPrice));
    setCart(
      cart.map((item) => {
        if (item.id === id) {
          return { ...item, price: validPrice };
        }
        return item;
      })
    );
  };

  const updateItemDiscount = (id: string, discountPercentage: number) => {
    if (discountPercentage < 0 || discountPercentage > 100) return;
    setCart(
      cart.map((item) => {
        if (item.id === id) {
          const discountAmount =
            (item.originalPrice * discountPercentage) / 100;
          return {
            ...item,
            discount: discountPercentage,
            price: item.originalPrice - discountAmount,
          };
        }
        return item;
      })
    );
  };

  const holdCurrentSale = async () => {
    if (cart.length === 0 || !hasBranch) {
      return;
    }
    setIsHoldingSale(true);
    const held = await holdSale(cart, selectedCustomer || undefined);
    if (held) {
      setCart([]);
    }
    setIsHoldingSale(false);
  };

  const handleRetrieveHoldSale = async (index: number) => {
    if (cart.length > 0) {
      const shouldReplace = window.confirm(
        "Current cart will be replaced. Continue?"
      );
      if (!shouldReplace) return;
    }
    setResumingHoldIndex(index);
    const heldSale = await retrieveHoldSale(index);
    if (heldSale) {
      setCart(
        heldSale.map((item) => ({
          ...item,
          discount: Number(item.discount || 0),
          originalPrice: Number(item.originalPrice ?? item.price ?? 0),
          actualUnitPrice: Number(item.actualUnitPrice ?? item.price ?? 0),
        }))
      );
    }
    setResumingHoldIndex(null);
  };

  const handleViewHeldSales = async () => {
    if (showHeldSales) {
      setShowHeldSales(false);
      return;
    }

    setIsViewingHeldSales(true);
    await refreshHoldSales();
    setShowHeldSales(true);
    setIsViewingHeldSales(false);
    const element = document.getElementById('held-sales-list');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Printer loading is handled globally by usePrinterSettings hook

  const removeFromCart = (id: string) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
  };

  const subtotal = cart.reduce(
    (sum, item) => sum + (item.actualUnitPrice || item.price) * item.quantity,
    0
  );

  const discountAmount =
    globalDiscountType === "percentage"
      ? (subtotal * globalDiscount) / 100
      : globalDiscount;

  const total = Math.max(0, subtotal - discountAmount);
  const totalQuantity = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  useEffect(() => {
    if (!paymentDialogOpen) {
      return;
    }

    const numericValue = parseFloat(tenderedAmount);
    if (Number.isNaN(numericValue)) {
      setCalculatedChange(0);
      return;
    }

    setCalculatedChange(Math.max(0, numericValue - total));
  }, [paymentDialogOpen, tenderedAmount, total]);

  const generateTransactionId = () => {
    return `TXN${Date.now().toString().slice(-6)}`;
  };

  const generateReceiptData = (
    transactionId: string,
    paymentMethod: string,
    cart: CartItem[],
    subtotal: number,
    total: number,
    amountPaid: number,
    changeAmount: number,
    discount?: number
  ) => {
    return {
      transactionId,
      timestamp: new Date().toISOString(),
      items: cart,
      subtotal,
      total,
      paymentMethod,
      cashier: "Muhammad",
      store: "Sarwat Trader #001",
      amountPaid,
      changeAmount,
      discount,
    };
  };


  const resetPaymentState = () => {
    setPaymentDialogOpen(false);
    setPaymentMethodPending(null);
    setTenderedAmount("");
    setCalculatedChange(0);
    setPaymentError("");
  };

  const handlePaymentDialogOpenChange = (open: boolean) => {
    if (open) {
      setPaymentDialogOpen(true);
      return;
    }
    resetPaymentState();
  };

  const startPayment = (method: "Cash" | "Card") => {
    if (!hasBranch) {
      return;
    }

    setPaymentMethodPending(method);
    setTenderedAmount(total.toFixed(2));
    setPaymentError("");
    setCalculatedChange(0);
    setPaymentDialogOpen(true);
  };

  const handleTenderedInputChange = (value: string) => {
    setTenderedAmount(value);
    if (paymentError) {
      setPaymentError("");
    }
  };

  const confirmPayment = async () => {
    if (!paymentMethodPending) {
      return;
    }

    const amountNumber = parseFloat(tenderedAmount);
    if (Number.isNaN(amountNumber)) {
      setPaymentError("Enter a valid amount received.");
      return;
    }

    if (amountNumber < total) {
      setPaymentError("Received amount cannot be less than the payable total.");
      return;
    }

    const change = Math.max(0, amountNumber - total);
    setPaymentError("");

    const success = await handlePayment(paymentMethodPending, amountNumber, change);
    if (success) {
      resetPaymentState();
    }
  };

  const handlePayment = async (
    method: "Cash" | "Card",
    amountPaid: number,
    changeAmount: number
  ) => {
    const cartSnapshot = cart.map((item) => ({ ...item }));

    return await withPaymentLoading(async () => {
      try {
        // Prepare items for API
        const saleItems = cartSnapshot.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price,
        }));

        const branchId = selectedBranchId;

        if (!branchId) {
          throw new Error("A branch must be selected before creating a sale.");
        }

        // Prepare payload
        const payload: any = {
          items: saleItems,
          paymentMethod: method === "Cash" ? "CASH" : "CARD",
          branchId,
        };
        if (selectedCustomer) {
          payload.customerId = selectedCustomer;
        }

        // Check if online
        const isOnline = syncManager.canMakeRequest();
        
        let saleData: any;
        let transactionId: string;
        
        if (isOnline) {
          // Online: Call create sale API
          try {
            const saleResponse = await apiClient.post("/sale", payload);
            saleData = saleResponse.data.data;
            transactionId = saleData.sale_number || generateTransactionId();
          } catch (error: any) {
            // If API call fails, fall back to offline mode
            console.warn("API call failed, saving offline:", error);
            transactionId = generateTransactionId();
            saleData = {
              sale_number: transactionId,
              id: `offline_${transactionId}`,
              _pending: true,
              _offline: true
            };
            
            // Save sale to IndexedDB for later sync
            await offlineDB.saveSale({
              id: transactionId,
              products: saleItems,
              total: total,
              customer: selectedCustomer ? { id: selectedCustomer } : null,
              payment: {
                method: method === "Cash" ? "CASH" : "CARD",
                amountPaid,
                changeAmount
              },
              employeeId: localStorage.getItem("userId") || undefined,
              branchId: branchId || undefined,
              timestamp: Date.now(),
              synced: false
            });
            
            // Queue the API request for when online
            await offlineAPIClient.post("/sale", payload, {
              priority: 10 // High priority for sales
            });
          }
        } else {
          // Offline: Generate local sale ID and save to IndexedDB
          transactionId = generateTransactionId();
          saleData = {
            sale_number: transactionId,
            id: `offline_${transactionId}`,
            _pending: true,
            _offline: true
          };
          
          // Save sale to IndexedDB for later sync
          await offlineDB.saveSale({
            id: transactionId,
            products: saleItems,
            total: total,
            customer: selectedCustomer ? { id: selectedCustomer } : null,
            payment: {
              method: method === "Cash" ? "CASH" : "CARD",
              amountPaid,
              changeAmount
            },
            employeeId: localStorage.getItem("userId") || undefined,
            branchId: branchId || undefined,
            timestamp: Date.now(),
            synced: false
          });
          
          // Also queue the API request for when online
          await offlineAPIClient.post("/sale", payload, {
            priority: 10 // High priority for sales
          });
          
          console.log("💾 Sale saved offline, will sync when connection restored");
        }
        const receiptData = generateReceiptData(
          transactionId,
          method,
          cartSnapshot,
          subtotal,
          total,
          amountPaid,
          changeAmount,
          discountAmount > 0 ? discountAmount : undefined
        );

        // Save transaction to local storage (simulate database)
        const transactions = JSON.parse(
          localStorage.getItem("transactions") || "[]"
        );
        transactions.push(receiptData);
        localStorage.setItem("transactions", JSON.stringify(transactions));

        setLastTransactionId(transactionId);
        setCart([]);
        // Clear discount after sale
        setGlobalDiscount(0);
        setGlobalDiscountType('percentage');
        setDiscountInput("");

        // Auto-print receipt
        try {
          // Get branch name from localStorage (correct source)
          const storedBranchName = localStorage.getItem("branchName");
          
          console.log("🏢 Current Branch:", storedBranchName);
          
          const fullAddress = "Karachi, Pakistan";
         
          console.log("fullAddress", fullAddress);
          const receiptDataForServer: ReceiptData = {
            storeName: storedBranchName || branchInfo.name || "SARWAT TRADERS",
            tagline: "Quality • Service • Value",
            address: fullAddress,
            transactionId: transactionId,
            timestamp: new Date().toISOString(),
            cashier: receiptData.cashier || "Walk-in",
            customerType: selectedCustomer
              ? customers.find((c) => c.id === selectedCustomer)?.name ||
                "Walk-in"
              : "Walk-in",
            items: cartSnapshot.map((item) => {
              const unitLabel =
                (item as any)?.unit?.name ||
                (item as any)?.unitName ||
                (item as any)?.unit_name ||
                (item as any)?.unit ||
                undefined;
              return {
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                unit: unitLabel,
              };
            }),
            subtotal: subtotal,
            discount: discountAmount > 0 ? discountAmount : undefined,
            total: total,
            paymentMethod: method === "Cash" ? "CASH" : "CARD",
            amountPaid,
            changeAmount: changeAmount > 0 ? changeAmount : undefined,
            thankYouMessage: "Thank you for shopping!",
            footerMessage: "Visit us again soon!",
          };

          // Get printer from global settings (Printer Settings page)
          const printerToUse = getReceiptPrinterObj();
          if (!printerToUse) {
            throw new Error("No receipt printer configured. Go to Printer Settings to select one.");
          }

          const printerObj = {
            ...printerToUse,
            columns: printerToUse.receiptProfile?.columns || { fontA: 48, fontB: 64 },
          };

          const job = {
            copies: 1,
            cut: true,
            openDrawer: false,
          };

          // Print via print server
          // Use same API format as backend: printer, receiptData, job
          await printReceiptViaServer(
            printerObj,
            receiptDataForServer,
            job
          );
        } catch (printError) {
          console.error("Print error:", printError);
          // Print failed - no toast shown
        }

        return true;
      } catch (error) {
        console.error("Payment error:", error);
        // Payment failed - no toast shown
        return false;
      }
    });
  };

  // Create optimized lookup maps for O(1) product access
  const barcodeMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach(product => {
      if (product.barcode) {
        const barcodeLower = product.barcode.toLowerCase();
        // Store exact barcode
        map.set(barcodeLower, product);
        // Also store prefixes for partial matching (up to 5 chars)
        for (let i = 1; i <= Math.min(5, barcodeLower.length); i++) {
          const prefix = barcodeLower.substring(0, i);
          if (!map.has(prefix)) {
            map.set(prefix, product);
          }
        }
      }
    });
    return map;
  }, [products]);

  const findProductByBarcode = (barcode: string): Product | null => {
    if (!barcode) return null;
    
    const searchKey = barcode.toLowerCase();
    
    // Try exact match first (fastest - O(1))
    const exactMatch = barcodeMap.get(searchKey);
    if (exactMatch) {
      // Quick validation - if it's in the map, it's likely correct
      return exactMatch;
    }
    
    // Try prefix matches (for partial codes like "FO(EB" from "FO(EBA0")
    // Check progressively shorter prefixes (O(1) lookup)
    const maxLen = Math.min(searchKey.length, 5);
    for (let len = maxLen; len >= 4; len--) {
      const prefix = searchKey.substring(0, len);
      const match = barcodeMap.get(prefix);
      if (match) {
        return match;
      }
    }
    
    // Fallback: linear search for contains match (rare case - only if not found in map)
    // This is optimized to break early
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      if (product.barcode?.toLowerCase().includes(searchKey)) {
        return product;
      }
    }
    
    return null;
  };

  // Manual sale - no barcode scanning needed
  // Products are added by clicking or searching

  const handleProductClick = (product: Product) => {
    addToCart(product, 1);
  };

  const handleCategoryChange = async (categoryId: string) => {
    setSelectedCategory(categoryId);
    // No need to set loading state as we're using cached data
  };

  // Global keyboard shortcuts - ENABLED for manual entry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs or dialogs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // If it's the search input, allow normal typing
        if (target === searchInputRef.current) {
          return;
        }
        // For other inputs, only handle special shortcuts
        // 'C' for Cash, 'D' for Card when in payment dialog
        if (paymentDialogOpen) {
          if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            if (!paymentMethodPending) {
              startPayment("Cash");
            }
            return;
          }
          if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            if (!paymentMethodPending) {
              startPayment("Card");
            }
            return;
          }
        }
        return;
      }

      // Global shortcuts (when not in input)
      // Ctrl+Enter for Cash payment
      if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Cash");
        }
        return;
      }

      // Shift+Enter for Card payment
      if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Card");
        }
        return;
      }

      // 'C' for Cash payment
      if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Cash");
        }
        return;
      }

      // 'D' for Card payment
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (cart.length > 0 && total > 0 && !paymentDialogOpen) {
          startPayment("Card");
        }
        return;
      }

      // Any alphabet key (a-z, A-Z) focuses search input - ENABLED for manual entry
      if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cart, total, paymentDialogOpen, paymentMethodPending, startPayment]);

  return (
    <div className="flex flex-col lg:flex-row h-screen">
      {/* Products Section */}
      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Manual Sales</h1>
              {lastTransactionId && (
                <p className="text-sm text-green-600">
                  Last transaction: {lastTransactionId}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {cart.length > 0 && (
                <Button
                  variant="outline"
                  onClick={holdCurrentSale}
                  disabled={isHoldingSale || branchLoading || !hasBranch}
                >
                  {isHoldingSale ? "Saving..." : "Hold Sale"}
                </Button>
              )}
              {holdSales.length > 0 && (
                <div className="flex items-center">
                  <Badge
                    variant="secondary"
                    className="mr-2 bg-blue-100 text-blue-800"
                  >
                    {holdSales.length} held
                  </Badge>
                  <Button
                    variant="outline"
                    onClick={handleViewHeldSales}
                    disabled={isViewingHeldSales || holdSalesLoading || branchLoading || !hasBranch}
                  >
                    {isViewingHeldSales || holdSalesLoading ? "Loading..." : "View Held Sales"}
                  </Button>
                </div>
              )}
            </div>
          </div>
          {adminMode && (
            <div className="mb-4 max-w-sm">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                POS Branch
              </label>
              <Select
                value={selectedBranchId || "none"}
                onValueChange={(value) => setSelectedBranchId(value === "none" ? "" : value)}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder={branchLoading ? "Loading branches..." : "Select branch"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select branch</SelectItem>
                  {availableBranches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!hasBranch && !branchLoading && (
                <p className="mt-2 text-sm text-amber-700">
                  Select a branch to use Hold Sale and complete sales.
                </p>
              )}
            </div>
          )}
          <div className="flex items-center space-x-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                ref={searchInputRef}
                placeholder="Search products by name, barcode, or SKU..."
                value={searchTerm}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchTerm(value);
                }}
                onKeyDown={(e) => {
                  // Enter key: Search for products (no barcode scanning in manual mode)
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    // Just keep focus on search - user can click products or continue typing
                  }
                }}
                className="pl-10"
                autoFocus
              />
            </div>
          </div>
        </div>

          {/* Printer info - configured globally in Printer Settings */}
          {receiptPrinter && (
            <div className="mb-4 px-4 py-2.5 rounded-xl border border-blue-100 bg-blue-50/60 flex items-center gap-2 text-sm text-blue-800">
              <span className="font-medium">🖨️ {receiptPrinter}</span>
              <span className="text-blue-600 text-xs">(change in Printer Settings)</span>
            </div>
          )}

        {/* Categories */}
        <div className="flex space-x-2 mb-6 overflow-x-auto">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? "default" : "outline"}
              onClick={() => handleCategoryChange(category.id)}
              className="whitespace-nowrap"
              disabled={productsLoading}
            >
              {productsLoading && selectedCategory === category.id && (
                <LoadingSpinner size="sm" className="mr-2" />
              )}
              {category.name}
            </Button>
          ))}
        </div>

        <div className="mb-4 max-w-xs bg-white text-black">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Customer (optional)
          </label>
          <Select
            value={selectedCustomer || "none"}
            onValueChange={(value) => setSelectedCustomer(value === "none" ? null : value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select customer</SelectItem>
              {customers.map((customer: any) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Products Grid */}
        {productsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="aspect-square bg-gray-200 rounded-lg mb-3" />
                  <div className="h-4 bg-gray-200 rounded mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 col-span-full">
            <span className="text-2xl mb-2">🛒</span>
            <p className="text-gray-500 text-lg">
              No products found in this category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.map((product) => {
              // Find cart items by productId (for separate entries) or id (backward compatibility)
              const cartItems = cart.filter((item) => 
                (item as any).productId === product.id || item.id === product.id
              );
              const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:shadow-sm transition-shadow"
                  onClick={() => handleProductClick(product)}
                >
                  <CardContent className="p-2 space-y-1">
                    <h3 className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 flex items-center justify-between gap-1">
                      <span className="flex-1">{product.name}</span>
                      <span className="shrink-0 text-[11px] font-medium text-gray-700">
                        {product.price.toFixed(2)}
                      </span>
                    </h3>
                    {totalQuantity > 0 && (
                      <Badge className="bg-blue-600 text-[10px] px-1.5 py-0.5">
                        {totalQuantity.toFixed(2)}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart Section */}
      <div className="w-full lg:w-[400px] bg-white lg:border-l border-gray-200 flex flex-col">
        <div className="border-b border-gray-200 bg-slate-50/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Sale Summary</h2>
              {cart.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Search for products or click to add items to cart.
                </p>
              )}
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
              {cart.length} item{cart.length === 1 ? "" : "s"}
            </div>
          </div>

          {cart.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                <p className="text-[9px] uppercase tracking-wide text-gray-500">Items</p>
                <p className="text-sm font-semibold text-gray-900">{cart.length}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                <p className="text-[9px] uppercase tracking-wide text-gray-500">Quantity</p>
                <p className="text-sm font-semibold text-gray-900">{totalQuantity.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                <p className="text-[9px] uppercase tracking-wide text-gray-500">Total</p>
                <p className="text-sm font-semibold text-gray-900">Rs {total.toFixed(2)}</p>
              </div>
            </div>
          )}

          {cart.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearCart}
                className="flex-1 min-w-[120px] border-dashed"
              >
                Clear Cart
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={holdCurrentSale}
                className="flex-1 min-w-[120px]"
                disabled={isHoldingSale || branchLoading || !hasBranch}
              >
                {isHoldingSale ? "Saving..." : "Hold Sale"}
              </Button>
            </div>
          )}

          {holdSales.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewHeldSales}
              className="mt-3 w-full justify-between border border-gray-200 bg-white hover:bg-white"
              disabled={isViewingHeldSales || holdSalesLoading || branchLoading || !hasBranch}
            >
              <span className="text-sm font-medium text-gray-700">
                {isViewingHeldSales || holdSalesLoading
                  ? "Loading held sales..."
                  : `Held Sales (${holdSales.length})`}
              </span>
              {showHeldSales ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}

          {showHeldSales && holdSalesLoading && (
            <div className="mt-2 rounded-lg border border-dashed border-blue-200 bg-white p-3 text-xs text-gray-500">
              Loading held sales...
            </div>
          )}

          {holdSales.length > 0 && showHeldSales && !holdSalesLoading && (
            <div id="held-sales-list" className="mt-2 rounded-lg border border-dashed border-blue-200 bg-white p-3">
              <ScrollArea className="max-h-32">
                <div className="space-y-2 pr-2">
                  {holdSales.map((sale, index) => {
                    const saleTotal = sale.items.reduce(
                      (sum, item) => sum + (item.actualUnitPrice || item.price) * item.quantity,
                      0
                    );
                    return (
                      <Button
                        key={sale.id}
                        variant="outline"
                        onClick={() => handleRetrieveHoldSale(index)}
                        className="h-auto w-full justify-between border-gray-200 py-2"
                        disabled={resumingHoldIndex === index}
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium text-gray-900">Sale #{index + 1} - {sale.branchName}</span>
                          <span className="text-xs text-gray-500">
                            {sale.items.length} items • Rs {saleTotal.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-blue-600">
                          {resumingHoldIndex === index ? "Resuming..." : "Resume"}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

        </div>

        <div className="flex-1 overflow-hidden">
          <div ref={cartScrollContainerRef} className="h-full overflow-auto px-4 py-3">
            {cart.length === 0 ? (
              <div className="mt-8 text-center text-gray-500">
                <p className="font-medium text-gray-600">Your cart is empty</p>
                <p className="text-sm text-gray-500">Add products to see them here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    ref={(el) => {
                      cartItemRefs.current[item.id] = el;
                    }}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-gray-900 leading-snug">{item.name}</h4>
                        <p className="text-xs text-gray-500">
                          Unit: Rs {(item.actualUnitPrice || item.price).toFixed(2)} • Line Total: Rs {((item.actualUnitPrice || item.price) * item.quantity).toFixed(2)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromCart(item.id)}
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Price (Rs)
                        </label>
                          <Input
                            ref={(el) => {
                              priceInputRefs.current[item.id] = el;
                              if (el) {
                                el.setAttribute('data-price-input', 'true');
                              }
                            }}
                            type="text"
                            inputMode="decimal"
                            value={priceInputs[item.id] !== undefined ? priceInputs[item.id] : (item.price === 0 ? "" : String(item.price))}
                          onKeyDown={(e) => {
                            // Enter or Tab: Move to quantity input
                            if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault();
                              const quantityInput = quantityInputRefs.current[item.id];
                              if (quantityInput) {
                                quantityInput.focus();
                                quantityInput.select();
                              }
                            }
                          }}
                          onChange={(e) => {
                            const value = e.target.value;
                            
                            // Update local input state
                            setPriceInputs(prev => ({ ...prev, [item.id]: value }));
                            
                            // Allow empty string - clear the value
                            if (value === "") {
                              setCart(
                                cart.map((cartItem) => {
                                  if (cartItem.id === item.id) {
                                    return { ...cartItem, price: 0 };
                                  }
                                  return cartItem;
                                })
                              );
                              return;
                            }
                            
                            // Allow decimal point and numbers - validate format
                            if (/^(\d*\.?\d*)$/.test(value)) {
                              // If it's just a decimal point, don't update cart yet
                              if (value === ".") {
                                return;
                              }
                              
                              const numValue = parseFloat(value);
                              if (!isNaN(numValue) && numValue >= 0) {
                                updateItemPrice(item.id, numValue);
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            // Clear local input state
                            setPriceInputs(prev => {
                              const newState = { ...prev };
                              delete newState[item.id];
                              return newState;
                            });
                            
                            // If empty or just a decimal point, set to 0
                            if (value === "" || value === "." || value === "0") {
                              setCart(
                                cart.map((cartItem) => {
                                  if (cartItem.id === item.id) {
                                    return { ...cartItem, price: 0 };
                                  }
                                  return cartItem;
                                })
                              );
                            } else {
                              // Ensure valid number on blur
                              const numValue = parseFloat(value);
                              if (!isNaN(numValue) && numValue >= 0) {
                                updateItemPrice(item.id, numValue);
                              } else {
                                // Invalid, reset to 0
                                setCart(
                                  cart.map((cartItem) => {
                                    if (cartItem.id === item.id) {
                                      return { ...cartItem, price: 0 };
                                    }
                                    return cartItem;
                                  })
                                );
                              }
                            }
                          }}
                          className="mt-1 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Quantity
                        </label>
                        <div className="mt-1 flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const currentItem = cart.find((cartItem) => cartItem.id === item.id);
                              if (currentItem && currentItem.quantity > 0.01) {
                                updateQuantity(item.id, -1);
                              }
                            }}
                            className="h-8 w-8 p-0"
                            disabled={item.quantity <= 0.01}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            ref={(el) => {
                              quantityInputRefs.current[item.id] = el;
                              if (el) {
                                el.setAttribute('data-quantity-input', 'true');
                              }
                            }}
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={quantityInputs[item.id] !== undefined 
                              ? quantityInputs[item.id] 
                              : (item.quantity === 0 || item.quantity === 0.01 
                                  ? "" 
                                  : item.quantity.toFixed(2))}
                            onKeyDown={(e) => {
                              // Enter: Move to payment (open payment dialog)
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (cart.length > 0 && total > 0) {
                                  startPayment("Cash");
                                }
                              }
                              // Tab: Move to next item or payment
                              if (e.key === "Tab" && !e.shiftKey) {
                                const currentIndex = cart.findIndex(cartItem => cartItem.id === item.id);
                                if (currentIndex < cart.length - 1) {
                                  // Move to next item's price
                                  e.preventDefault();
                                  const nextItem = cart[currentIndex + 1];
                                  const nextPriceInput = priceInputRefs.current[nextItem.id];
                                  if (nextPriceInput) {
                                    nextPriceInput.focus();
                                    nextPriceInput.select();
                                  }
                                } else {
                                  // Last item, allow default tab behavior (might go to payment button)
                                }
                              }
                            }}
                            onChange={(e) => {
                              const value = e.target.value;
                              
                              // Remove unit from value if present (e.g., "2.5 kg" -> "2.5", "250 g" -> "250")
                              const cleanValue = value.replace(/\s*(kg|g|pcs|ml|l|gram|grams|piece|pieces|pc)\s*$/i, '').trim();
                              
                              // Update local input state
                              setQuantityInputs(prev => ({ ...prev, [item.id]: cleanValue }));
                              
                              // Allow empty string - clear the value
                              if (cleanValue === "") {
                                setCart(
                                  cart.map((cartItem) => {
                                    if (cartItem.id === item.id) {
                                      return { ...cartItem, quantity: 0 };
                                    }
                                    return cartItem;
                                  })
                                );
                                return;
                              }
                              
                              // Allow decimal point and numbers - validate format
                              if (/^(\d*\.?\d*)$/.test(cleanValue)) {
                                // If it's just a decimal point, don't update cart yet
                                if (cleanValue === ".") {
                                  return;
                                }
                                
                                const numValue = parseFloat(cleanValue);
                                if (!isNaN(numValue) && numValue >= 0) {
                                  updateQuantityManual(item.id, numValue);
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const value = e.target.value.trim();
                              // Clear local input state
                              setQuantityInputs(prev => {
                                const newState = { ...prev };
                                delete newState[item.id];
                                return newState;
                              });
                              
                              // If empty or just a decimal point, set to minimum
                              if (value === "" || value === "." || value === "0") {
                                setCart(
                                  cart.map((cartItem) => {
                                    if (cartItem.id === item.id) {
                                      return { ...cartItem, quantity: 0.01 };
                                    }
                                    return cartItem;
                                  })
                                );
                              } else {
                                // Ensure valid number on blur
                                const numValue = parseFloat(value);
                                if (!isNaN(numValue) && numValue > 0) {
                                  updateQuantityManual(item.id, numValue);
                                } else {
                                  // Invalid or <= 0, set to minimum
                                  setCart(
                                    cart.map((cartItem) => {
                                      if (cartItem.id === item.id) {
                                        return { ...cartItem, quantity: 0.01 };
                                      }
                                      return cartItem;
                                    })
                                  );
                                }
                              }
                            }}
                            className="h-8 w-16 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.id, 1)}
                            className="h-8 w-8 p-0"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCart(
                                cart.map((cartItem) => {
                                  if (cartItem.id === item.id) {
                                    return { ...cartItem, quantity: 0 };
                                  }
                                  return cartItem;
                                })
                              );
                            }}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                            title="Clear quantity"
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {cart.length > 0 && (
          <div className="border-t border-gray-200 bg-white/95 px-3 py-3 shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.4)] backdrop-blur">
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2.5">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Discount
                  </label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Select
                      value={globalDiscountType}
                      onValueChange={(value) => {
                        setGlobalDiscountType(value as "percentage" | "amount");
                        setDiscountInput("");
                        setGlobalDiscount(0);
                      }}
                    >
                      <SelectTrigger data-discount-select="true" className="h-8 w-[82px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">%</SelectItem>
                        <SelectItem value="amount">Rs</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      data-discount-input="true"
                      type="text"
                      inputMode="decimal"
                      value={discountInput}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        
                        // If empty or just a decimal point, clear discount
                        if (value === "" || value === "." || value === "0") {
                          setDiscountInput("");
                          setGlobalDiscount(0);
                        } else {
                          // Ensure valid number on blur
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue >= 0) {
                            // Validate max for percentage
                            if (globalDiscountType === "percentage" && numValue > 100) {
                              setDiscountInput("100");
                              setGlobalDiscount(100);
                            } else {
                              setDiscountInput(value);
                              setGlobalDiscount(numValue);
                            }
                          } else {
                            // Invalid, clear
                            setDiscountInput("");
                            setGlobalDiscount(0);
                          }
                        }
                      }}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDiscountInput(value);
                        
                        // Allow empty string - clear the value
                        if (value === "") {
                          setGlobalDiscount(0);
                          return;
                        }
                        
                        // Allow decimal point and numbers - validate format
                        if (/^(\d*\.?\d*)$/.test(value)) {
                          // If it's just a decimal point, don't update discount yet
                          if (value === ".") {
                            return;
                          }
                          
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue >= 0) {
                            // Validate max for percentage
                            if (globalDiscountType === "percentage" && numValue > 100) {
                              return;
                            }
                            setGlobalDiscount(numValue);
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        
                        // If empty or just a decimal point, clear discount
                        if (value === "" || value === "." || value === "0") {
                          setDiscountInput("");
                          setGlobalDiscount(0);
                        } else {
                          // Ensure valid number on blur
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue >= 0) {
                            // Validate max for percentage
                            if (globalDiscountType === "percentage" && numValue > 100) {
                              setDiscountInput("100");
                              setGlobalDiscount(100);
                            } else {
                              setDiscountInput(value);
                              setGlobalDiscount(numValue);
                            }
                          } else {
                            // Invalid, clear
                            setDiscountInput("");
                            setGlobalDiscount(0);
                          }
                        }
                      }}
                      className="h-8 flex-1 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-slate-50 p-2.5 text-xs">
                  <div className="flex items-center justify-between text-gray-600 text-xs font-medium">
                    <span>Subtotal</span>
                    <span className="text-sm font-semibold text-blue-700">{subtotal.toFixed(2)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="mt-1 flex items-center justify-between text-green-600 text-xs font-medium">
                      <span>Discount</span>
                      <span>- {discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between text-blue-700 text-sm font-semibold">
                    <span>Payable</span>
                    <span>{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  onClick={() => startPayment("Cash")}
                  disabled={paymentLoading || branchLoading || !hasBranch}
                  className="h-10 text-sm"
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  Cash
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startPayment("Card")}
                  disabled={paymentLoading || branchLoading || !hasBranch}
                  className="h-10 text-sm"
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Card
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={paymentDialogOpen}
        onOpenChange={handlePaymentDialogOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {paymentMethodPending ? `${paymentMethodPending} Payment` : "Payment"}
            </DialogTitle>
            <DialogDescription>
              Enter the amount received to calculate the change due.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between text-gray-600">
                <span>Payable Amount</span>
                <span className="font-semibold text-gray-900">
                  Rs {total.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-green-600 font-semibold">
                <span>Change Due</span>
                <span>Rs {calculatedChange.toFixed(2)}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Amount Received
              </label>
              <Input
                type="number"
                autoFocus
                value={tenderedAmount}
                onChange={(e) => handleTenderedInputChange(e.target.value)}
                onKeyDown={(e) => {
                  // Enter: Confirm payment
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmPayment();
                  }
                  // Escape: Cancel payment
                  if (e.key === "Escape") {
                    e.preventDefault();
                    resetPaymentState();
                  }
                }}
                className="mt-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                min="0"
                step="0.01"
              />
            </div>
            {paymentError && (
              <p className="text-sm text-red-600">{paymentError}</p>
            )}
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={resetPaymentState}
              disabled={paymentLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmPayment}
              disabled={paymentLoading || !paymentMethodPending}
            >
              {paymentLoading
                ? "Processing..."
                : `Confirm ${paymentMethodPending ?? "Payment"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
