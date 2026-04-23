"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, ArrowRightLeft, RefreshCw, TrendingUp, TrendingDown, Package, Loader2, Calendar, Edit, MapPin, Filter, Trash2, X, FileDown } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { usePosData } from "@/hooks/use-pos-data";
import { PageLoader } from "@/components/ui/page-loader";
import { Textarea } from "@/components/ui/textarea";

interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Stock {
  id: string;
  product: Product;
  branch: Branch;
  current_quantity: number;
  last_updated: string;
}

interface Movement {
  id: string;
  product: Product;
  branch: Branch;
  movement_type: string;
  quantity_change: number;
  previous_qty: number;
  new_qty: number;
  created_at: string;
  notes?: string;
  user?: { email: string };
}

export function StockManagement() {
  // Global store data
  const { 
    products: globalProducts, 
    categories,
    isAnyLoading: globalLoading,
    refreshAllData: triggerGlobalRefresh 
  } = usePosData();
  
  // Data lists
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [history, setHistory] = useState<Movement[]>([]);
  const [todayMovements, setTodayMovements] = useState<Movement[]>([]);
  
  // Pagination and meta
  const [totalStocks, setTotalStocks] = useState(0);
  const [stockMeta, setStockMeta] = useState({ page: 1, limit: 20, totalPages: 1, totalQuantity: 0, lowStockCount: 0 });

  // UI state
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Product search state
  const [productSearch, setProductSearch] = useState("");

  // Pagination for stock table
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(20);

  // Dialog state
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  // Dropdown state for product selection
  const [addProductDropdownOpen, setAddProductDropdownOpen] = useState(false);
  const [adjustProductDropdownOpen, setAdjustProductDropdownOpen] = useState(false);
  const [transferProductDropdownOpen, setTransferProductDropdownOpen] = useState(false);
  const [removeProductDropdownOpen, setRemoveProductDropdownOpen] = useState(false);
  
  // Refs for dropdown containers
  const addProductDropdownRef = React.useRef<HTMLDivElement>(null);
  const adjustProductDropdownRef = React.useRef<HTMLDivElement>(null);
  const transferProductDropdownRef = React.useRef<HTMLDivElement>(null);
  const removeProductDropdownRef = React.useRef<HTMLDivElement>(null);

  // Form state
  const [transferForm, setTransferForm] = useState({
    productId: "",
    fromBranchId: "",
    toBranchId: "",
    quantity: "" as string | number,
    notes: "",
  });

  const [addForm, setAddForm] = useState({
    productId: "",
    branchId: "",
    quantity: "" as string | number,
    supplierId: "",
    unitCost: "" as string | number,
  });

  const [adjustForm, setAdjustForm] = useState({
    productId: "",
    branchId: "",
    quantityChange: "" as string | number,
    reason: "",
  });

  const [removeForm, setRemoveForm] = useState({
    productId: "",
    branchId: "",
    quantity: "" as string | number,
    reason: "WASTE",
    notes: "",
  });

  // Instant filtered products from global store
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return globalProducts.slice(0, 50);
    const search = productSearch.toLowerCase().trim();
    return globalProducts.filter(p => 
      p.name.toLowerCase().includes(search) || 
      p.sku?.toLowerCase().includes(search) || 
      p.barcode?.includes(search)
    ).slice(0, 50);
  }, [globalProducts, productSearch]);

  // 1) Fetch branches on mount
  useEffect(() => {
    const loadMeta = async () => {
      setIsInitialLoading(true);
      try {
        const bRes = await apiClient.get(`${API_BASE}/branches?fetch_all=true`);
        setBranches(bRes.data.data);
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to load branches");
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadMeta();
  }, []);

  const showErrorToast = (e: any) => {
    console.error("Inventory Operation Error:", e);
    const message = e.response?.data?.message || e.message || "An unexpected operation failure occurred";
    toast.error(message);
  };

  // Reset to page 1 when search changes
  useEffect(() => {
    setStockPage(1);
  }, [searchTerm]);

  const refreshAllData = useCallback(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: stockPage.toString(),
          limit: stockPageSize.toString(),
        });
        
        if (branchFilter && branchFilter !== "all") params.append('branchId', branchFilter);
        if (categoryFilter && categoryFilter !== "all") params.append('categoryId', categoryFilter);
        if (searchTerm.trim()) params.append('search', searchTerm.trim());
        
        const [sRes, hRes, tRes] = await Promise.all([
          apiClient.get(`${API_BASE}/stock?${params}`),
          apiClient.get(`${API_BASE}/stock/history?${params}`),
          apiClient.get(`${API_BASE}/stock/today?${params}`),
        ]);
        
        setAllStocks(sRes.data.data || []);
        setTotalStocks(sRes.data.meta?.total || 0);
        if (sRes.data.meta) setStockMeta(sRes.data.meta);
        setHistory(hRes.data.data || []);
        setTodayMovements(tRes.data.data || []);
      } catch (e: any) {
        toast.error("Failed to load stock data");
      } finally {
        setIsLoading(false);
      }
    }, [branchFilter, categoryFilter, stockPage, stockPageSize, searchTerm]);

    useEffect(() => {
      refreshAllData();
    }, [refreshAllData]);

  // Fetch initial data
  const { suppliers, fetchSuppliers } = usePosData();
  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Handle clicks outside dropdowns to close them
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addProductDropdownRef.current && !addProductDropdownRef.current.contains(event.target as Node)) setAddProductDropdownOpen(false);
      if (adjustProductDropdownRef.current && !adjustProductDropdownRef.current.contains(event.target as Node)) setAdjustProductDropdownOpen(false);
      if (transferProductDropdownRef.current && !transferProductDropdownRef.current.contains(event.target as Node)) setTransferProductDropdownOpen(false);
      if (removeProductDropdownRef.current && !removeProductDropdownRef.current.contains(event.target as Node)) setRemoveProductDropdownOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Derived analytics
  const paginationOptions = [20, 50, 100, 500];
  const totalUnits = stockMeta.totalQuantity || 0;
  const alerts = stockMeta.lowStockCount || 0;
  const totalStockPages = stockMeta.totalPages || 1;

  // Handlers
  const handleTransfer = async () => {
    const quantity = typeof transferForm.quantity === "string" 
      ? (transferForm.quantity === "" ? 0 : Number(transferForm.quantity) || 0)
      : transferForm.quantity;
    
    if (!transferForm.productId || !transferForm.fromBranchId || !transferForm.toBranchId || quantity <= 0) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.post(`${API_BASE}/stock/transfer`, {
        productId: transferForm.productId,
        fromBranchId: transferForm.fromBranchId,
        toBranchId: transferForm.toBranchId,
        quantity: quantity,
        notes: transferForm.notes,
      });

      setIsTransferOpen(false);
      setTransferForm({ productId: "", fromBranchId: "", toBranchId: "", quantity: "", notes: "" });
      setProductSearch("");
      setTransferProductDropdownOpen(false);
      refreshAllData();

      toast.success("Stock transferred successfully");
    } catch (e: any) {
      showErrorToast(e);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleAddStock = async () => {
    const quantity = typeof addForm.quantity === "string" 
      ? (addForm.quantity === "" ? 0 : Number(addForm.quantity) || 0)
      : addForm.quantity;
    
    if (!addForm.productId || !addForm.branchId || !quantity || quantity <= 0) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.post(`${API_BASE}/stock`, {
        productId: addForm.productId,
        branchId: addForm.branchId,
        quantity: quantity,
        supplierId: addForm.supplierId,
        unitCost: addForm.unitCost ? Number(addForm.unitCost) : undefined
      });

      setIsAddOpen(false);
      clearProductUI();
      refreshAllData();

      toast.success("Stock added successfully");
    } catch (e: any) {
      showErrorToast(e);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleAdjustStock = async () => {
    const quantityChange = typeof adjustForm.quantityChange === "string" 
      ? (adjustForm.quantityChange === "" || adjustForm.quantityChange === "-" ? 0 : Number(adjustForm.quantityChange) || 0)
      : adjustForm.quantityChange;
    
    if (!adjustForm.productId || !adjustForm.branchId || quantityChange === 0) {
      toast.error("Please enter a valid change amount");
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.patch(`${API_BASE}/stock/adjust`, {
        productId: adjustForm.productId,
        branchId: adjustForm.branchId,
        quantityChange: quantityChange,
        reason: adjustForm.reason,
      });

      setIsAdjustOpen(false);
      setAdjustForm({ productId: "", branchId: "", quantityChange: "", reason: "" });
      setProductSearch("");
      setAdjustProductDropdownOpen(false);
      refreshAllData();

      toast.success("Stock adjusted successfully");
    } catch (e: any) {
      showErrorToast(e);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleRemoveStock = async () => {
    const quantity = typeof removeForm.quantity === "string" 
      ? (removeForm.quantity === "" ? 0 : Number(removeForm.quantity) || 0)
      : removeForm.quantity;
    
    if (!removeForm.productId || !removeForm.branchId || !quantity || quantity <= 0) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.delete(`${API_BASE}/stock/remove`, {
        data: {
          productId: removeForm.productId,
          branchId: removeForm.branchId,
          quantity: quantity,
          reason: removeForm.reason,
        },
      });

      setIsRemoveOpen(false);
      setRemoveForm({ productId: "", branchId: "", quantity: "", reason: "WASTE", notes: "" });
      setProductSearch("");
      setRemoveProductDropdownOpen(false);
      refreshAllData();

      toast.success("Stock removed successfully");
    } catch (e: any) {
      showErrorToast(e);
    } finally {
      setIsTransferring(false);
    }
  };

  const getMovementBadge = (type: string) => {
    const incoming = ["PURCHASE", "TRANSFER_IN", "RETURN"];
    const outgoing = ["SALE", "TRANSFER_OUT", "DAMAGE", "EXPIRED"];
    if (incoming.includes(type)) return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">{type}</Badge>;
    if (outgoing.includes(type)) return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">{type}</Badge>;
    if (type === "ADJUSTMENT") return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">{type}</Badge>;
    return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">{type}</Badge>;
  };

  const formatQty = (value: number) => {
    const num = Number(value || 0);
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const getStockStatusMeta = (qty: number) => {
    if (qty <= 0) return { label: "Out", className: "bg-red-100 text-red-800 border-red-200" };
    if (qty <= 10) return { label: "Low", className: "bg-amber-100 text-amber-800 border-amber-200" };
    return { label: "In Stock", className: "bg-green-100 text-green-800 border-green-200" };
  };

  const handleProductSearch = (search: string) => {
    setProductSearch(search);
  };

  const clearProductUI = () => {
    setProductSearch("");
    setAddProductDropdownOpen(false);
    setAdjustProductDropdownOpen(false);
    setTransferProductDropdownOpen(false);
    setRemoveProductDropdownOpen(false);
    // Reset forms to default
    setAddForm({ productId: "", branchId: "", quantity: "", supplierId: "", unitCost: "" });
    setAdjustForm({ productId: "", branchId: "", quantityChange: "", reason: "CORRECTION" });
    setRemoveForm({ productId: "", branch_id: "", quantity: "", reason: "WASTE", notes: "" });
    setTransferForm({ productId: "", fromBranchId: "", toBranchId: "", quantity: "", notes: "" });
  };

  const handleExport = () => {
    if (allStocks.length === 0) return;
    
    const headers = ["Product", "Branch", "SKU", "Category", "Quantity", "Last Updated"];
    const csvContent = [
      headers.join(","),
      ...allStocks.map(s => [
        `"${s.product.name}"`,
        `"${s.branch?.name || 'N/A'}"`,
        `"${s.product.sku || 'N/A'}"`,
        `"${categories.find(c => c.id === s.product.category_id)?.name || 'N/A'}"`,
        s.current_quantity,
        new Date(s.last_updated).toLocaleString()
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export Protocol Success", { description: "The inventory ledger has been serialized and downloaded." });
  };

  if (isInitialLoading) {
    return (
      <PageLoader message="Loading inventory engine..." />
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 bg-slate-50/30 min-h-screen">
      {/* HEADER SECTION: THE COMMAND CENTER */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
               <Package className="h-5 w-5 text-white" />
             </div>
             <div>
               <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                 Stock Management
                 <Badge className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-none font-bold px-2 py-0.5 rounded text-[10px]">PRO</Badge>
               </h1>
               <p className="text-slate-400 font-bold text-xs uppercase tracking-widest italic tracking-tighter">Inventory Integrity · Real-time Operational Insights</p>
             </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
           <Button 
             variant="outline" 
             onClick={handleExport}
             className="hidden sm:flex text-slate-600 border-slate-200 bg-white hover:bg-slate-50 font-black h-11 px-6 rounded-xl text-[11px] tracking-widest uppercase gap-3 transition-all shadow-sm"
           >
             <FileDown className="h-4 w-4 text-indigo-500" /> Export Ledger
           </Button>

           <Button variant="outline" size="icon" onClick={() => { refreshAllData(); triggerGlobalRefresh(); }} disabled={isLoading || globalLoading} className="rounded-xl h-11 w-11 border-slate-200 bg-white shadow-sm">
             <RefreshCw className={`h-4 w-4 ${isLoading || globalLoading ? 'animate-spin' : ''}`} />
           </Button>

           <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm gap-1">
              <Dialog 
                open={isAddOpen} 
                onOpenChange={(open) => {
                  setIsAddOpen(open);
                  if (!open) clearProductUI();
                }}
              >
                <DialogTrigger asChild>
                  <Button className="bg-slate-900 hover:bg-black text-white font-black h-9 px-4 rounded-lg text-xs gap-2">
                    <Plus className="h-3.5 w-3.5" /> RECORD
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg bg-white rounded-2xl border-none shadow-2xl p-0 overflow-hidden">
                  <DialogHeader className="p-6 bg-indigo-600">
                    <DialogTitle className="text-lg font-black text-white uppercase tracking-tight">Stock Registration</DialogTitle>
                    <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest mt-0.5 opacity-80">Procurement & Log</p>
                  </DialogHeader>
                  <div className="p-6 space-y-6">
                    {/* PRODUCT SELECTOR */}
                    <div className="space-y-2 relative" ref={addProductDropdownRef}>
                      <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Inventory Asset</Label>
                      <div className="relative group">
                        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                        <Input
                          placeholder="Search product..."
                          value={productSearch}
                          onFocus={() => setAddProductDropdownOpen(true)}
                          autoComplete="off"
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setAddProductDropdownOpen(true);
                          }}
                          className="pl-11 h-12 bg-slate-50 border-none rounded-xl font-bold text-slate-800 focus:bg-white transition-all shadow-sm"
                        />
                        {addProductDropdownOpen && (
                          <Card className="absolute left-0 right-0 z-[100] mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-100 bg-white shadow-2xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
                            {filteredProducts.length === 0 ? (
                               <div className="p-6 text-center">
                                 <Package className="h-6 w-6 text-slate-200 mx-auto mb-1" />
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter italic">No matching assets</p>
                               </div>
                            ) : (
                              <div className="p-1">
                                {filteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-indigo-50 transition-all rounded-lg group"
                                    onClick={() => {
                                      setAddForm({ ...addForm, productId: p.id });
                                      setProductSearch(p.name);
                                      setAddProductDropdownOpen(false);
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-black text-slate-800 uppercase text-[11px] group-hover:text-indigo-700">{p.name}</span>
                                      <span className="text-[9px] font-bold text-slate-400 group-hover:text-indigo-400 tracking-tighter uppercase">{p.sku || p.id.slice(0, 8)}</span>
                                    </div>
                                    <Badge variant="outline" className="text-[8px] font-black border-slate-200 bg-white group-hover:bg-indigo-600 group-hover:text-white transition-all uppercase">Pick</Badge>
                                  </button>
                                ))}
                              </div>
                            )}
                          </Card>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Node</Label>
                        <Select value={addForm.branchId} onValueChange={(v) => setAddForm({ ...addForm, branchId: v })}>
                          <SelectTrigger className="h-12 bg-slate-50 border-none rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-indigo-600/20">
                            <SelectValue placeholder="Target Node" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-none shadow-xl">
                            {branches.map(b => <SelectItem key={b.id} value={b.id} className="font-bold text-[11px] py-2">{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Quantity</Label>
                        <div className="relative">
                           <Input
                            type="number"
                            placeholder="0"
                            value={addForm.quantity}
                            onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                            className="h-12 bg-slate-50 border-none rounded-xl font-black text-indigo-600 text-lg pr-12 focus:ring-2 focus:ring-indigo-600/20"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400 uppercase">Qty</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Supplier</Label>
                        <Select value={addForm.supplierId} onValueChange={(v) => setAddForm({ ...addForm, supplierId: v })}>
                          <SelectTrigger className="h-11 bg-slate-50 border-none rounded-xl font-bold text-slate-600 text-[11px] focus:ring-2 focus:ring-indigo-600/20">
                            <SelectValue placeholder="Provider" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-none shadow-xl">
                            {suppliers?.map((s: any) => <SelectItem key={s.id} value={s.id} className="font-bold text-[11px]">{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Cost Point</Label>
                        <Input
                          placeholder="Cost"
                          type="number"
                          value={addForm.unitCost}
                          onChange={(e) => setAddForm({ ...addForm, unitCost: e.target.value })}
                          className="h-11 bg-slate-50 border-none rounded-xl font-bold text-slate-700 text-[11px] focus:ring-2 focus:ring-indigo-600/20"
                        />
                      </div>
                    </div>

                    <Button className="w-full h-14 bg-indigo-600 hover:bg-slate-900 text-white font-black rounded-xl shadow-lg shadow-indigo-100 text-xs tracking-widest uppercase transition-all gap-2" onClick={handleAddStock} disabled={isTransferring}>
                      {isTransferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Authorize Registration
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog 
                open={isAdjustOpen} 
                onOpenChange={(open) => {
                  setIsAdjustOpen(open);
                  if (!open) clearProductUI();
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="ghost" className="text-slate-600 hover:bg-slate-50 font-bold h-9 px-4 rounded-lg text-xs gap-2">
                    <Edit className="h-3.5 w-3.5 text-amber-500" /> ADJUST
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md bg-white rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
                   <DialogHeader className="p-8 bg-amber-500">
                    <DialogTitle className="text-xl font-black text-white uppercase tracking-tight text-center">Precision Adjustment</DialogTitle>
                  </DialogHeader>
                  <div className="p-8 space-y-6">
                    <div className="space-y-2 relative" ref={adjustProductDropdownRef}>
                      <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Asset for Adjustment</Label>
                      <div className="relative group">
                        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="Search asset..."
                          value={productSearch}
                          onFocus={() => setAdjustProductDropdownOpen(true)}
                          autoComplete="off"
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setAdjustProductDropdownOpen(true);
                          }}
                          className="pl-11 h-12 bg-slate-50 border-none rounded-xl font-bold text-slate-800 focus:bg-white shadow-sm"
                        />
                        {adjustProductDropdownOpen && (
                          <Card className="absolute left-0 right-0 z-[100] mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-100 bg-white shadow-2xl dropdown-animate">
                            {filteredProducts.length === 0 ? (
                               <div className="p-4 text-center text-[10px] font-bold text-slate-300 uppercase">Target missed</div>
                            ) : (
                              <div className="p-1">
                                {filteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-amber-50 transition-all rounded-lg group"
                                    onClick={() => {
                                      setAdjustForm({ ...adjustForm, productId: p.id });
                                      setProductSearch(p.name);
                                      setAdjustProductDropdownOpen(false);
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-black text-slate-700 uppercase text-[11px] group-hover:text-amber-600">{p.name}</span>
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{p.sku || p.id.slice(0, 8)}</span>
                                    </div>
                                    <ArrowRightLeft className="w-3 h-3 text-slate-200 group-hover:text-amber-500" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </Card>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Node Location</Label>
                        <Select value={adjustForm.branchId} onValueChange={(v) => setAdjustForm({ ...adjustForm, branchId: v })}>
                          <SelectTrigger className="h-12 bg-slate-50 border-none rounded-xl font-bold text-slate-700">
                             <SelectValue placeholder="Branch" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-none shadow-xl">
                             {branches.map(b => <SelectItem key={b.id} value={b.id} className="font-bold text-xs py-2">{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Adjustment (±)</Label>
                        <Input
                          type="number"
                          placeholder="Delta"
                          value={adjustForm.quantityChange}
                          onChange={(e) => setAdjustForm({ ...adjustForm, quantityChange: e.target.value })}
                          className="h-12 bg-slate-50 border-none rounded-xl font-black text-amber-600 text-xl text-center"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Correction Category</Label>
                      <Select value={adjustForm.reason} onValueChange={(v) => setAdjustForm({ ...adjustForm, reason: v })}>
                        <SelectTrigger className="h-12 bg-slate-100/50 border-none rounded-xl font-bold text-slate-700">
                          <SelectValue placeholder="Select Reason" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none shadow-xl">
                          <SelectItem value="CORRECTION" className="font-bold text-xs">Inventory Correction</SelectItem>
                          <SelectItem value="LOST" className="font-bold text-xs">Lost / Unaccounted</SelectItem>
                          <SelectItem value="FOUND" className="font-bold text-xs">Found / Surprise Entry</SelectItem>
                          <SelectItem value="PROMOTIONAL" className="font-bold text-xs">Promotional Redistribution</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl shadow-lg shadow-amber-100 uppercase tracking-widest text-xs gap-3" onClick={handleAdjustStock} disabled={isTransferring}>
                      {isTransferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Execute Delta Update
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog 
                open={isRemoveOpen} 
                onOpenChange={(open) => {
                  setIsRemoveOpen(open);
                  if (!open) clearProductUI();
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="ghost" className="text-slate-600 hover:bg-slate-50 font-bold h-9 px-4 rounded-lg text-xs gap-2">
                    <TrendingDown className="h-3.5 w-3.5 text-rose-500" /> DISPOSE
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg bg-white rounded-2xl border-none shadow-2xl p-0 overflow-hidden">
                  <DialogHeader className="p-6 bg-rose-600">
                    <DialogTitle className="text-lg font-black text-white uppercase tracking-tight text-center">Stock Disposal Protocol</DialogTitle>
                  </DialogHeader>
                  <div className="p-6 space-y-6">
                    <div className="space-y-2 relative" ref={removeProductDropdownRef}>
                      <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Asset for Disposal</Label>
                      <div className="relative group">
                        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="Search asset..."
                          value={productSearch}
                          onFocus={() => setRemoveProductDropdownOpen(true)}
                          autoComplete="off"
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setRemoveProductDropdownOpen(true);
                          }}
                          className="pl-11 h-12 bg-slate-50 border-none rounded-xl font-bold text-slate-800 focus:bg-white shadow-sm"
                        />
                        {removeProductDropdownOpen && (
                          <Card className="absolute left-0 right-0 z-[100] mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-100 bg-white shadow-2xl dropdown-animate">
                             {filteredProducts.length === 0 ? (
                               <div className="p-4 text-center text-[10px] font-bold text-slate-300 uppercase italic">Entity not identified</div>
                            ) : (
                              <div className="p-1">
                                {filteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-rose-50 transition-all rounded-lg group"
                                    onClick={() => {
                                      setRemoveForm({ ...removeForm, productId: p.id });
                                      setProductSearch(p.name);
                                      setRemoveProductDropdownOpen(false);
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-black text-slate-700 uppercase text-[11px] group-hover:text-rose-600">{p.name}</span>
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{p.sku || p.id.slice(0, 8)}</span>
                                    </div>
                                    <X className="w-3 h-3 text-slate-200 group-hover:text-rose-500" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </Card>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Storage Node</Label>
                        <Select value={removeForm.branchId} onValueChange={(v) => setRemoveForm({ ...removeForm, branchId: v })}>
                          <SelectTrigger className="h-12 bg-slate-50 border-none rounded-xl font-bold text-slate-700">
                             <SelectValue placeholder="Branch" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-none shadow-xl">
                             {branches.map(b => <SelectItem key={b.id} value={b.id} className="font-bold text-xs py-2">{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                         <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Disposal Quantity</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={removeForm.quantity}
                          onChange={(e) => setRemoveForm({ ...removeForm, quantity: e.target.value })}
                          className="h-12 bg-slate-50 border-none rounded-xl font-black text-rose-600 text-xl text-center"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Disposal Reason</Label>
                      <Select value={removeForm.reason} onValueChange={(v) => setRemoveForm({ ...removeForm, reason: v })}>
                        <SelectTrigger className="h-12 bg-slate-50 border-none rounded-xl font-bold text-slate-700">
                          <SelectValue placeholder="Method" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none shadow-xl">
                          <SelectItem value="DAMAGE" className="font-bold text-xs">Damaged / Defected</SelectItem>
                          <SelectItem value="WASTE" className="font-bold text-xs">Wastage / Garbage</SelectItem>
                          <SelectItem value="THEFT" className="font-bold text-xs">Theft / Loss</SelectItem>
                          <SelectItem value="EXPIRED" className="font-bold text-xs">Expired Goods</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button className="w-full h-14 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl shadow-lg shadow-rose-100 uppercase tracking-widest text-xs gap-3" onClick={handleRemoveStock} disabled={isTransferring}>
                      {isTransferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Authorize Elimination
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog 
                open={isTransferOpen} 
                onOpenChange={(open) => {
                  setIsTransferOpen(open);
                  if (!open) clearProductUI();
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="ghost" className="text-slate-600 hover:bg-slate-50 font-bold h-9 px-4 rounded-lg text-xs gap-2">
                    <ArrowRightLeft className="h-3.5 w-3.5 text-indigo-500" /> TRANSFER
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg bg-white rounded-2xl border-none shadow-2xl p-0 overflow-hidden">
                   <DialogHeader className="p-6 bg-slate-900">
                    <DialogTitle className="text-lg font-black text-white uppercase tracking-tight">Inter-Branch Logistic Flow</DialogTitle>
                    <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest mt-0.5">Multi-Node Movement</p>
                  </DialogHeader>
                  <div className="p-6 space-y-6">
                     <div className="space-y-3 relative" ref={transferProductDropdownRef}>
                      <Label className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Asset for Transit</Label>
                      <div className="relative group">
                        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                        <Input
                          placeholder="Search asset for movement..."
                          value={productSearch}
                          onFocus={() => setTransferProductDropdownOpen(true)}
                          autoComplete="off"
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setTransferProductDropdownOpen(true);
                          }}
                          className="pl-12 h-14 bg-slate-50 border-none rounded-2xl font-bold text-slate-800 shadow-sm"
                        />
                        {transferProductDropdownOpen && (
                          <Card className="absolute left-0 right-0 z-[100] mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-2xl dropdown-animate">
                            {filteredProducts.length === 0 ? (
                               <div className="p-8 text-center">
                                 <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">No assets matching criteria</p>
                               </div>
                            ) : (
                              <div className="p-2">
                                {filteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-indigo-50 transition-all rounded-xl group"
                                    onClick={() => {
                                      setTransferForm({ ...transferForm, productId: p.id });
                                      setProductSearch(p.name);
                                      setTransferProductDropdownOpen(false);
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-black text-slate-800 uppercase text-xs group-hover:text-indigo-700">{p.name}</span>
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{p.sku || p.id.slice(0, 8)}</span>
                                    </div>
                                    <MapPin className="w-4 h-4 text-slate-200 group-hover:text-indigo-500" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </Card>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-6">
                      <div className="flex-1 w-full space-y-3">
                        <Label className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Point of Origin (Source)</Label>
                        <Select value={transferForm.fromBranchId} onValueChange={(v) => setTransferForm({ ...transferForm, fromBranchId: v })}>
                          <SelectTrigger className="h-14 bg-slate-50 border-none rounded-2xl font-bold text-slate-700">
                             <SelectValue placeholder="Select Source" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-none shadow-xl">
                             {branches.map(b => (
                               <SelectItem 
                                 key={b.id} 
                                 value={b.id} 
                                 disabled={b.id === transferForm.toBranchId}
                                 className="font-bold text-xs py-3"
                               >
                                 <div className="flex items-center justify-between w-full gap-4">
                                   <span>{b.name}</span>
                                   {b.id === transferForm.toBranchId && <Badge variant="outline" className="text-[9px] border-amber-200 text-amber-600 bg-amber-50">SELECTED DEST</Badge>}
                                 </div>
                               </SelectItem>
                             ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center rotate-90 md:rotate-0">
                        <ArrowRightLeft className="h-5 w-5 text-slate-400" />
                      </div>

                      <div className="flex-1 w-full space-y-3">
                         <Label className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Target Node (Destination)</Label>
                        <Select value={transferForm.toBranchId} onValueChange={(v) => setTransferForm({ ...transferForm, toBranchId: v })}>
                          <SelectTrigger className="h-14 bg-white border-2 border-indigo-600/10 rounded-2xl font-bold text-slate-700 hover:border-indigo-600/30 transition-all">
                             <SelectValue placeholder="Select Destination" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-none shadow-xl">
                             {branches.map(b => (
                               <SelectItem 
                                 key={b.id} 
                                 value={b.id} 
                                 disabled={b.id === transferForm.fromBranchId}
                                 className="font-bold text-xs py-3"
                               >
                                 <div className="flex items-center justify-between w-full gap-4">
                                   <span>{b.name}</span>
                                   {b.id === transferForm.fromBranchId && <Badge variant="outline" className="text-[9px] border-indigo-200 text-indigo-600 bg-indigo-50">SELECTED SOURCE</Badge>}
                                 </div>
                               </SelectItem>
                             ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-3">
                         <Label className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Transit Volume</Label>
                         <Input
                          type="number"
                          placeholder="Quantity"
                          value={transferForm.quantity}
                          onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
                          className="h-14 bg-slate-50 border-none rounded-2xl font-black text-indigo-600 text-2xl pr-12"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Dispatcher / Notes</Label>
                        <Input
                          placeholder="Carrier name or ref..."
                          value={transferForm.notes}
                          onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                          className="h-14 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 text-sm"
                        />
                      </div>
                    </div>

                    <Button className="w-full h-16 bg-indigo-600 hover:bg-slate-900 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 mt-2 uppercase tracking-[0.2em] text-sm transition-all" onClick={handleTransfer} disabled={isTransferring}>
                      {isTransferring ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <ArrowRightLeft className="h-5 w-5 mr-3" />}
                      Initiate Inter-Branch Transit
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

           </div>
        </div>
      </div>

      {/* KPI GRID: THE POWER PANEL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* TOTAL SKUs */}
        <Card className="border-none shadow-md bg-white rounded-3xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Inventory SKUs</p>
                {isLoading ? (
                  <div className="h-9 w-20 bg-slate-100 animate-pulse rounded-lg mt-1" />
                ) : (
                  <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{totalStocks}</h3>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Package className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
            <div className="mt-4">
              <div className="h-1 w-full bg-slate-50 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: '100%' }} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AGGREGATE QUANTITY */}
        <Card className="border-none shadow-md bg-white rounded-3xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Total Units</p>
                {isLoading ? (
                  <div className="h-9 w-24 bg-emerald-50 animate-pulse rounded-lg mt-1" />
                ) : (
                  <h3 className="text-3xl font-black text-emerald-600 tracking-tighter">{formatQty(totalUnits)}</h3>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <p className="mt-4 text-[9px] font-bold text-slate-300 uppercase italic">Across Active Clusters</p>
          </CardContent>
        </Card>

        {/* LOW STOCK */}
        <Card className="border-none shadow-md bg-white rounded-3xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5 border-l-4 border-l-rose-500">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Restock Alerts</p>
                {isLoading ? (
                  <div className="h-9 w-16 bg-rose-50 animate-pulse rounded-lg mt-1" />
                ) : (
                  <h3 className="text-3xl font-black text-rose-600 tracking-tighter">{alerts}</h3>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-rose-600" />
              </div>
            </div>
            <p className="mt-4 text-[9px] font-black text-rose-400/80 uppercase">Threshold: &le; 10 Units</p>
          </CardContent>
        </Card>

        {/* TODAY'S MOVEMENTS */}
        <Card className="border-none shadow-md bg-white rounded-3xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Daily Events</p>
                {isLoading ? (
                  <div className="h-9 w-12 bg-blue-50 animate-pulse rounded-lg mt-1" />
                ) : (
                  <h3 className="text-3xl font-black text-blue-600 tracking-tighter">{todayMovements.length}</h3>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="mt-4 text-[9px] font-bold text-blue-400 uppercase tracking-tight">Recent LifeCycle Logs</p>
          </CardContent>
        </Card>
      </div>

      {/* FILTER STATIONS */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-6">
        <div className="flex-1 w-full relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <Input
            placeholder="Search by Product Name or SKU Identity..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 h-12 rounded-2xl bg-slate-50 border-none font-bold text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-500/10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <Select value={branchFilter || "all"} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-full md:w-48 h-12 rounded-2xl border-slate-100 bg-white font-bold text-slate-600 shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/10">
              <MapPin className="h-3.5 w-3.5 mr-2 text-indigo-500 shadow-sm" />
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl shadow-xl border-slate-100">
              <SelectItem value="all" className="font-bold text-xs uppercase tracking-tight">All Locations</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id} className="font-bold text-xs uppercase tracking-tight">{b.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full md:w-48 h-12 rounded-2xl border-slate-100 bg-white font-bold text-slate-600 shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/10">
              <Filter className="h-3.5 w-3.5 mr-2 text-indigo-500 shadow-sm" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl shadow-xl border-slate-100">
              <SelectItem value="all" className="font-bold text-xs uppercase tracking-tight">All Categories</SelectItem>
              {categories.map((c: any) => <SelectItem key={c.id} value={c.id} className="font-bold text-xs uppercase tracking-tight">{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-2">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mr-2">Status Legend:</span>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-none font-black text-[9px] px-3 py-1 uppercase rounded-full">In Stock</Badge>
        <Badge variant="outline" className="bg-amber-50 text-amber-600 border-none font-black text-[9px] px-3 py-1 uppercase rounded-full">Low</Badge>
        <Badge variant="outline" className="bg-rose-50 text-rose-600 border-none font-black text-[9px] px-3 py-1 uppercase rounded-full">Out</Badge>
      </div>

      {/* Tabs for Stock and History */}
      <Tabs defaultValue="stock" className="space-y-6">
        <div className="flex px-1">
          <TabsList className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm h-11 shrink-0 w-full max-w-md grid grid-cols-3">
            <TabsTrigger value="stock" className="rounded-lg h-9 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all">Stock List</TabsTrigger>
            <TabsTrigger value="history" className="rounded-lg h-9 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all">Movement Log</TabsTrigger>
            <TabsTrigger value="today" className="rounded-lg h-9 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all">Today's Phase</TabsTrigger>
          </TabsList>
        </div>

        {/* Current Stock Tab Content */}
        <TabsContent value="stock" className="mt-0 outline-none animate-in fade-in duration-500">
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 px-8 py-5 border-b border-slate-100">
               <div className="flex items-center justify-between">
                 <div>
                   <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight">Active Inventory Ledger</CardTitle>
                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 tracking-tighter">Total Assets Registered: {totalStocks}</p>
                 </div>
                 <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black uppercase text-slate-400">Density:</span>
                    <Select value={String(stockPageSize)} onValueChange={(v) => { setStockPageSize(Number(v)); setStockPage(1); }}>
                      <SelectTrigger className="w-20 h-8 border-slate-200 bg-white rounded-lg text-xs font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-slate-100">
                        {paginationOptions.map((size) => <SelectItem key={size} value={String(size)} className="font-bold text-xs">{size}</SelectItem>)}
                      </SelectContent>
                    </Select>
                 </div>
               </div>
            </CardHeader>
            <CardContent className="p-0 relative">
              {isLoading && (
                <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-20">
                   <div className="h-14 w-14 rounded-full border-4 border-slate-100 border-t-indigo-600 animate-spin mb-4" />
                   <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 animate-pulse">Syncing Operational Data...</div>
                </div>
              )}
              
              <Table>
                <TableHeader className="bg-slate-50/30">
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="w-[300px] font-black text-[10px] uppercase tracking-widest text-slate-400 p-8 py-4">Product Detail</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 py-4">Identity / SKU</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 py-4 text-center">In-Hand Units</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 py-4">Status</TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-400 p-8 py-4 text-right">Synchronization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allStocks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center p-24">
                        <div className="flex flex-col items-center opacity-20">
                          <Package className="h-12 w-12 mb-3 text-slate-300" />
                          <p className="font-black text-xs uppercase tracking-widest italic">Inventory Domain Empty</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    allStocks.map((s) => {
                      const qty = Number(s.current_quantity || 0);
                      const status = getStockStatusMeta(qty);
                      return (
                        <TableRow key={s.id} className="hover:bg-slate-50/50 group transition-all duration-200 border-slate-50">
                          <TableCell className="p-8 py-5">
                            <div className="flex flex-col">
                              <span className="font-black text-slate-800 text-sm group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{s.product.name}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">{s.branch?.name} Cluster</span>
                            </div>
                          </TableCell>
                          <TableCell>
                             <div className="font-mono text-[11px] font-extrabold text-slate-500 bg-slate-50 px-2 py-1 rounded inline-block uppercase italic">
                               {s.product.sku || (s.product.id ? s.product.id.slice(0, 8) : 'N/A')}
                             </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`text-sm font-black text-slate-900 ${qty <= 10 ? 'text-rose-600' : ''}`}>{formatQty(qty)}</span>
                          </TableCell>
                          <TableCell>
                            <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase inline-block border ${status.className.split(' ').slice(0, 2).join(' ')}`}>
                              {status.label}
                            </div>
                          </TableCell>
                          <TableCell className="p-8 py-5 text-right">
                             <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{new Date(s.last_updated).toLocaleDateString()}</span>
                                <span className="text-[9px] font-medium text-slate-300 uppercase italic">Checked: {new Date(s.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                             </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              
              {/* Pagination Section */}
              {totalStockPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between p-8 bg-slate-50/30 border-t border-slate-100 gap-4">
                  <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Cluster Domain Partition {stockPage} of {totalStockPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStockPage(p => Math.max(1, p - 1))}
                      disabled={stockPage === 1}
                      className="rounded-xl font-black text-[10px] border-slate-200 h-9 px-4 hover:bg-white"
                    >
                      PREVIOUS
                    </Button>
                    <div className="px-4 py-1.5 bg-white border border-slate-200 rounded-xl font-black text-xs text-indigo-600">{stockPage}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStockPage(p => Math.min(totalStockPages, p + 1))}
                      disabled={stockPage === totalStockPages}
                      className="rounded-xl font-black text-[10px] border-slate-200 h-9 px-4 hover:bg-white"
                    >
                      NEXT PHASE
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Movement History Tab Content */}
        <TabsContent value="history" className="mt-0 outline-none animate-in fade-in duration-500">
           <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-slate-50/30">
                  <TableRow className="border-slate-100">
                    <TableHead className="font-black text-[10px] uppercase p-8 py-4 text-slate-400 tracking-widest">Chronology</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Entity Profile</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Action Protocol</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-center text-slate-400 tracking-widest">$\Delta$ Quantity</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">State Sync (Old &rarr; New)</TableHead>
                    <TableHead className="font-black text-[10px] uppercase p-8 py-4 text-right text-slate-400 tracking-widest">Executor ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center p-20 italic text-slate-300 text-xs uppercase font-black">No movement history discovered</TableCell>
                    </TableRow>
                  ) : (
                    history.map((m) => (
                      <TableRow key={m.id} className="hover:bg-slate-50/50 border-slate-50 transition-colors">
                        <TableCell className="p-8 py-4 text-[10px] font-bold text-slate-500 whitespace-nowrap">
                          {new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </TableCell>
                        <TableCell>
                           <div className="flex flex-col min-w-[200px]">
                              <span className="font-black text-slate-800 text-xs uppercase tracking-tighter">{m.product.name}</span>
                              <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{m.branch?.name}</span>
                           </div>
                        </TableCell>
                        <TableCell>{getMovementBadge(m.movement_type)}</TableCell>
                        <TableCell className="text-center">
                          <span className={`text-sm font-black ${m.quantity_change > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {m.quantity_change > 0 ? "+" : ""}{formatQty(Number(m.quantity_change))}
                          </span>
                        </TableCell>
                        <TableCell>
                           <div className="flex items-center gap-2 font-mono text-[10px] font-bold text-slate-400">
                             <span className="bg-slate-50 px-2 py-0.5 rounded">{formatQty(Number(m.previous_qty))}</span>
                             <ArrowRightLeft className="h-2.5 w-2.5 opacity-30" />
                             <span className="bg-slate-900 text-white px-2 py-0.5 rounded font-black">{formatQty(Number(m.new_qty))}</span>
                           </div>
                        </TableCell>
                        <TableCell className="p-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-tighter max-w-[120px] truncate">
                          {m.user?.email.split('@')[0] || "SYSTEM"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
           </Card>
        </TabsContent>

        {/* Today's Movement Tab */}
        <TabsContent value="today" className="mt-0 outline-none animate-in fade-in duration-500">
           <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-slate-50/30">
                   <TableRow className="border-slate-100">
                    <TableHead className="font-black text-[10px] uppercase p-8 py-4 text-slate-400 tracking-widest">Timestamp</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Target Entity</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Protocol</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-center text-slate-400 tracking-widest">Variance</TableHead>
                    <TableHead className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Final State</TableHead>
                    <TableHead className="font-black text-[10px] uppercase p-8 py-4 text-right text-slate-400 tracking-widest">Audit Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                   {todayMovements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center p-20 italic text-slate-300 text-xs uppercase font-black">No events recorded today</TableCell>
                      </TableRow>
                   ) : (
                     todayMovements.map((m) => (
                        <TableRow key={m.id} className="hover:bg-slate-50/50 border-slate-50 transition-colors">
                          <TableCell className="p-8 py-4 text-[10px] font-black text-indigo-600 uppercase">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell className="font-black text-slate-700 text-xs uppercase tracking-tighter">{m.product.name}</TableCell>
                          <TableCell>{getMovementBadge(m.movement_type)}</TableCell>
                          <TableCell className="text-center font-black text-sm text-slate-900">{m.quantity_change > 0 ? "+" : ""}{formatQty(Number(m.quantity_change))}</TableCell>
                          <TableCell>
                             <div className="bg-slate-900 text-white px-2 py-0.5 rounded font-black text-[10px] inline-block">{formatQty(Number(m.new_qty))}</div>
                          </TableCell>
                          <TableCell className="p-8 py-4 text-right text-[10px] font-bold text-slate-400 max-w-[150px] truncate italic uppercase tracking-tighter">
                            {m.notes || "-"}
                          </TableCell>
                        </TableRow>
                     ))
                   )}
                </TableBody>
              </Table>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
