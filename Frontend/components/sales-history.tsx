"use client";

import React, { useState, useEffect, useRef } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PageLoader } from "@/components/ui/page-loader";
import {
  Search,
  RefreshCw,
  Download,
  Printer,
  CalendarIcon,
  Eye,
  Edit3,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  format,
  parseISO,
} from "date-fns";
import { isKioskMode } from "@/utils/kiosk-printing";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { printReceiptViaServer, type ReceiptData } from "@/lib/print-server";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { SaleEditor } from "./sale-editor";

interface SaleItem {
  id: string;
  product: {
    name: string;
    sku?: string;
    unit?: { name?: string };
    unit_name?: string;
  };
  quantity: number;
  unit_price?: string;
  line_total: string;
  unit?: { name?: string };
  unit_name?: string;
}

interface Customer {
  id: string;
  email: string;
}

interface Branch {
  id: string;
  name: string;
  address?: string;
}

interface Sale {
  id: string;
  sale_number: string;
  sale_date: string;
  total_amount: string;
  subtotal?: string;
  tax_amount?: string;
  discount_amount?: string;
  payment_method: string;
  payment_status?: string;
  status: string;
  customer: Customer | null;
  sale_items: SaleItem[];
  notes?: string;
  created_at?: string;
  branch?: Branch | null;
}

interface BranchInfo {
  name: string;
  address: string;
}

const normalizeReceiptAddress = (address?: string): string => {
  const normalized = typeof address === "string" ? address.trim() : "";

  if (!normalized) {
    return "Karachi, Pakistan";
  }

  if (/pakistan/i.test(normalized)) {
    return normalized;
  }

  if (/karachi/i.test(normalized)) {
    return `${normalized}, Pakistan`;
  }

  return `${normalized}, Karachi, Pakistan`;
};

const buildReceiptBranchLine = (
  storeName?: string,
  _address?: string
): string => {
  const name = typeof storeName === "string" ? storeName.trim() : "";
  
  if (!name || ["ADMIN", "SARWAT TRADERS"].includes(name.toUpperCase())) {
    return "Karachi, Pakistan";
  }

  // Strictly follow: [Branch Name], Karachi, Pakistan
  return `${name}, Karachi, Pakistan`;
};

export function SalesHistory() {
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [branchInfo, setBranchInfo] = useState<BranchInfo>({
    name: "SARWAT TRADERS",
    address: "Karachi",
  });
  const [receiptHtml, setReceiptHtml] = useState<string>("");
  const [iframeHeight, setIframeHeight] = useState<number>(620);
  const receiptIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  // Global printer settings (configured in Printer Settings page)
  const { receiptPrinter, getReceiptPrinterObj, printers } = usePrinterSettings();
  const [kioskMode, setKioskMode] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalSales, setTotalSales] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Helper function to safely format currency
  const formatCurrency = (
    value: string | number | undefined,
    showNegativeSymbol: boolean = true
  ): string => {
    if (!value && value !== 0) return "Rs 0.00";

    const numValue = typeof value === "string" ? parseFloat(value) : value;

    // Check if the number is valid
    if (isNaN(numValue)) return "Rs 0.00";

    // Handle negative values
    if (numValue < 0) {
      const absValue = Math.abs(numValue);
      if (showNegativeSymbol) {
        return `-Rs ${absValue.toFixed(2)}`;
      } else {
        // For display purposes, show absolute value
        return `Rs ${absValue.toFixed(2)}`;
      }
    }

    return `Rs ${numValue.toFixed(2)}`;
  };

  // Helper function to get sale type based on total amount
  const getSaleType = (totalAmount: string): "sale" | "refund" | "return" => {
    const amount = parseFloat(totalAmount);
    if (isNaN(amount)) return "sale";
    return amount < 0 ? "refund" : "sale";
  };

  // Fetch sales
  const fetchSales = async () => {
    setLoading(true);
    try {
      // Get branch ID from localStorage - ALWAYS use it if available
      // Backend will filter by this branchId regardless of admin status
      const branchId = localStorage.getItem("branch");
      const userRole = localStorage.getItem("role");
      const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
      
      // Build query parameters
      // ALWAYS send branchId from localStorage if it exists and is valid
      // Backend will filter by this branchId (even for admins)
      // If no branchId in localStorage, backend will show all for admins or use JWT branch_id for non-admins
      const params: Record<string, string> = {};
      if (branchId && branchId !== "Not Found" && branchId.trim()) {
        params.branchId = branchId.trim();
      }

      if (pageSize > 0) {
        params.page = String(currentPage);
        params.limit = String(pageSize);
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }
      if (startDate) {
        params.startDate = startDate.toISOString();
      }
      if (endDate) {
        const inclusiveEnd = new Date(endDate);
        inclusiveEnd.setHours(23, 59, 59, 999);
        params.endDate = inclusiveEnd.toISOString();
      }
      
      // Debug logging
      console.log("Fetching sales with params:", { 
        branchId: params.branchId, 
        isAdmin, 
        userRole,
        localStorageBranchId: branchId 
      });
      
      const res = await apiClient.get<{
        data: Sale[];
        meta?: { total?: number; totalPages?: number; page?: number; limit?: number };
      }>("/sale", { params });

      // Filter out or handle invalid sales data
      const validSales = res.data.data.filter((sale) => {
        // Basic validation
        return (
          sale.id &&
          sale.sale_number &&
          sale.sale_date &&
          sale.total_amount !== undefined
        );
      });

      setSales(validSales);
      setTotalSales(res.data.meta?.total ?? validSales.length);
      setTotalPages(res.data.meta?.totalPages ?? 1);
    } catch (err) {
      console.error("Failed to fetch sales:", err);
      toast({ title: "Failed to load sales", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [currentPage, pageSize, searchTerm, startDate, endDate]);

  useEffect(() => {
    const loadBranchInfo = async () => {
      try {
        const branchStr = localStorage.getItem("branch");
        if (!branchStr) return;
        // Skip if branch is "Not Found" or user is admin
        const userRole = localStorage.getItem("role");
        const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
        
        if (branchStr === "Not Found" || isAdmin) {
          setBranchInfo({
            name: "Admin",
            address: "",
          });
          return;
        }
        
        setBranchInfo((prev) => ({
          ...prev,
          name: branchInfo.name, // Keep existing if error, though we use state here
        }));
        const branchRes = await apiClient.get(`/branches/${branchStr}`);
        setBranchInfo({
          name: branchRes.data.data.name || branchStr,
          address: branchRes.data.data.address || "Karachi",
        });
      } catch (error) {
        console.warn("Failed to load branch info", error);
      }
    };
    loadBranchInfo();
  }, []);

  useEffect(() => {
    setKioskMode(isKioskMode());
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate]);

  // Export CSV
  const exportCSV = () => {
    const header = [
      "Sale #",
      "Date",
      "Customer",
      "Payment",
      "Total",
      "Status",
      "Type",
    ];
    const rows = sales.map((s) => [
      s.sale_number,
      format(parseISO(s.sale_date), "yyyy-MM-dd"),
      s.customer?.email || "—",
      s.payment_method,
      formatCurrency(s.total_amount, true), // Include negative symbol in export
      s.status,
      getSaleType(s.total_amount).toUpperCase(),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales_history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print
  const printTable = () => window.print();

  const prepareReceiptDataFromSale = (sale: Sale, branch: BranchInfo): ReceiptData => {
    const subtotalFromApi = sale.subtotal ? parseFloat(sale.subtotal) : NaN;
    const subtotal =
      !isNaN(subtotalFromApi) && subtotalFromApi > 0
        ? subtotalFromApi
        : sale.sale_items.reduce((sum, item) => sum + parseFloat(item.line_total || "0"), 0);
    const discount = sale.discount_amount ? parseFloat(sale.discount_amount) : 0;
    const taxAmount = sale.tax_amount ? parseFloat(sale.tax_amount) : 0;
    const total = parseFloat(sale.total_amount);
    const taxable = Math.max(0, subtotal - discount);
    const taxPercent =
      taxable > 0 && taxAmount > 0 ? (taxAmount / taxable) * 100 : undefined;

    const items = sale.sale_items.map((item) => {
      const lineTotal = parseFloat(item.line_total || "0");
      const unitPrice =
        item.unit_price !== undefined
          ? parseFloat(item.unit_price)
          : lineTotal / Math.max(1, item.quantity);

      const unitLabel =
        (item.product as any)?.unit?.name ||
        (item.product as any)?.unit_name ||
        (item as any)?.unit?.name ||
        (item as any)?.unit_name ||
        (item as any)?.unitName ||
        undefined;

      return {
        name: item.product?.name || "Unnamed Item",
        quantity: item.quantity,
        price: unitPrice,
        unit: unitLabel,
      };
    });

    const storeName = sale.branch?.name || branch.name || "SARWAT TRADERS";
    const storeAddress = sale.branch?.address || branch.address || "";

    return {
      storeName,
      tagline: "Quality • Service • Value",
      address: storeAddress,
      transactionId: sale.sale_number,
      timestamp: sale.created_at || sale.sale_date,
      cashier: "Walk-in",
      customerType: sale.customer?.email || "Walk-in",
      items,
      subtotal,
      discount: discount > 0 ? discount : undefined,
      taxPercent,
      total,
      paymentMethod: sale.payment_method,
      amountPaid: total,
      changeAmount: 0,
      promo: sale.notes,
      thankYouMessage: "Thank you for shopping!",
      footerMessage: "Visit us again soon!",
    };
  };

  const generateReceiptHtml = (data: ReceiptData) => {
    const subtotal = Number(data.subtotal || 0);
    const discount = Number(data.discount || 0);
    const taxPercent = data.taxPercent || 0;
    const tax = taxPercent > 0 ? (subtotal - discount) * (taxPercent / 100) : 0;
    const total = data.total ?? Math.max(0, subtotal - discount + tax);
    const paid = data.amountPaid ?? total;
    const change = data.changeAmount ?? 0;
    const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
    
    const money = (n: number) => {
      return Number(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };
    
    const itemsHtml = (data.items || [])
      .map((item) => {
        const name = String(item.name || '');
        const qty = (item.quantity ?? 0).toString() + (item.unit ? ` ${item.unit}` : '');
        const rate = money(Number(item.price || 0) * Number(item.quantity || 0));
        return `<div class="item-row">
  <div class="item-name">${name}</div>
  <div class="item-qty">${qty}</div>
  <div class="item-rate">${rate}</div>
</div>`;
      })
      .join("");
    
    const promoHtml = data.promo ? `<div class="promo">Promo: ${data.promo}</div>` : "";
    const branchLine = buildReceiptBranchLine(data.storeName, data.address);
    
    const footerLines = [
      'Branch: 021 34892110',
      'Delivery Hotline WhatsApp: +92 342 3344040',
      'Website: sarwattraders.com'
    ];
    
    const footerHtml = footerLines.map(line => `<div class="footer-line">${line}</div>`).join('');
    
    const aceHtml = `
<div class="divider-thin"></div>
<div class="powered-by">Powered by Ace Studios</div>
<div class="ace-line">+92 336 2500357</div>`;
    
    return `
<div class="receipt">
<div class="logo">
<img 
  src="${window.location.origin}/logo.png" 
  alt="Logo" 
  class="logo-img" />
</div>
<div class="store-name">${branchLine}</div>
<div class="tagline">${data.tagline || "Quality - Service - Value"}</div>
${data.strn ? `<div class="strn">${data.strn}</div>` : ''}

<div class="divider"></div>

<div class="row-lr">
  <span class="label">Receipt #</span>
  <span class="value">${data.transactionId}</span>
</div>
<div class="row-lr">
  <span class="label">Date</span>
  <span class="value">${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}</span>
</div>
<div class="row-lr">
  <span class="label">Cashier</span>
  <span class="value">${data.cashier || "Walk-in"}</span>
</div>
<div class="row-lr">
  <span class="label">Customer</span>
  <span class="value">${data.customerType || "Walk-in"}</span>
</div>

<div class="divider"></div>

<div class="items-header">
  <div class="item-col">ITEM</div>
  <div class="qty-col">QTY</div>
  <div class="rate-col">RATE</div>
</div>
<div class="items-divider"></div>

${itemsHtml}

<div class="divider"></div>

<div class="row-lr">
  <span class="label">Subtotal</span>
  <span class="value">PKR ${money(subtotal)}</span>
</div>
${discount > 0
        ? `<div class="row-lr">
  <span class="label">Discount</span>
  <span class="value">- PKR ${money(discount)}</span>
</div>`
        : ""
      }
<div class="row-lr total-row">
  <span class="label">Grand Total</span>
  <span class="value">PKR ${money(total)}</span>
</div>

<div class="divider"></div>

<div class="row-lr">
  <span class="label">Payment</span>
  <span class="value">${(data.paymentMethod || "CASH").toUpperCase()}</span>
</div>
${paid !== undefined && paid !== null
        ? `<div class="row-lr">
  <span class="label">Paid</span>
  <span class="value">PKR ${money(paid)}</span>
</div>`
        : ""
      }
${change > 0
        ? `<div class="row-lr">
  <span class="label">Change</span>
  <span class="value">PKR ${money(change)}</span>
</div>`
        : ""
      }

${promoHtml}

<div class="divider"></div>

<div class="barcode-section">
  <svg id="barcode-svg"></svg>
  <div class="barcode-number" id="barcode-number">${data.transactionId}</div>
</div>

<div class="thank-you">${data.thankYouMessage || "Thank you for shopping!"}</div>
${footerHtml}
${aceHtml}
</div>
`;
  };

  const receiptPageWrapper = (content: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Receipt</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: white;
            height: 100%;
            min-height: 100%;
            overflow-x: hidden;
            overflow-y: auto;
            font-family: 'Helvetica', 'Arial', sans-serif;
            width: 100%;
            max-width: 100%;
          }
          body {
            display: block;
            width: 100%;
            box-sizing: border-box;
            padding: 0;
          }
          .receipt {
            width: 100%;
            max-width: 100%;
            background: #ffffff;
            color: #000000;
            padding: 20px 16px 24px 16px;
            margin: 0;
            overflow: hidden;
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-weight: bold;
            box-sizing: border-box;
            display: block;
          }
          .logo {
            text-align: center;
            margin-bottom: 3mm;
          }
          .logo-img {
            max-width: 48mm;
            max-height: 24mm;
            width: auto;
            height: auto;
            display: block;
            margin: 0 auto 3mm auto;
            object-fit: contain;
            filter: grayscale(100%) contrast(200%);
            image-rendering: pixelated;
          }
          .store-name {
            font-weight: bold;
            font-size: 11pt;
            text-align: center;
            margin-bottom: 2mm;
            color: #000000;
            line-height: 1.2;
          }
          .tagline {
            font-size: 9.4pt;
            text-align: center;
            margin-bottom: 2mm;
            color: #000000;
            font-weight: bold;
            line-height: 1.2;
          }
          .divider {
            border-top: 1px dotted #000;
            margin: 3mm 0;
            height: 0;
            width: 100%;
          }
          .divider-thin {
            border-top: 0.5px dotted #000;
            margin: 3mm 0;
            height: 0;
            width: 100%;
          }
          .row-lr {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            margin: 2mm 0;
            font-size: 9.4pt;
            line-height: 1.3;
            word-break: break-word;
          }
          .row-lr .label {
            flex: 0 0 45%;
            text-align: left;
            font-weight: bold;
            color: #000000;
          }
          .row-lr .value {
            flex: 1;
            text-align: right;
            font-weight: bold;
            color: #000000;
            word-break: break-all;
          }
          .total-row {
            font-size: 11.2pt;
            margin-top: 2mm;
            font-weight: bold;
          }
          .items-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            font-weight: bold;
            font-size: 11.2pt;
            margin-bottom: 1mm;
            color: #000000;
          }
          .items-divider {
            border-top: 1px solid #000;
            margin: 1mm 0 2mm 0;
            height: 0;
            width: 100%;
          }
          .item-col {
            flex: 0 0 48%;
            text-align: left;
          }
          .qty-col {
            flex: 0 0 18%;
            text-align: center;
          }
          .rate-col {
            flex: 1;
            text-align: right;
          }
          .item-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            width: 100%;
            margin: 1.5mm 0;
            font-size: 9.4pt;
            line-height: 1.3;
            word-break: break-word;
          }
          .item-name {
            flex: 0 0 48%;
            text-align: left;
            padding-right: 2mm;
            word-break: break-word;
          }
          .item-qty {
            flex: 0 0 18%;
            text-align: center;
            word-break: break-word;
          }
          .item-rate {
            flex: 1;
            text-align: right;
            word-break: break-all;
          }
          .barcode-section {
            text-align: center;
            margin: 4mm 0;
          }
          .barcode-section svg {
            max-width: 48mm;
            height: 14mm;
            display: block;
            margin: 0 auto;
          }
          .barcode-number {
            font-size: 9.8pt;
            margin-top: 2mm;
            font-weight: bold;
            letter-spacing: 1px;
            color: #000000;
            text-align: center;
          }
          .thank-you {
            font-size: 10.6pt;
            margin-top: 4mm;
            margin-bottom: 2mm;
            font-weight: bold;
            text-align: center;
            color: #000000;
            line-height: 1.2;
          }
          .footer-line {
            font-size: 9.8pt;
            margin: 1mm 0;
            font-weight: bold;
            text-align: center;
            color: #000000;
            line-height: 1.2;
          }
          .promo {
            font-size: 9.4pt;
            text-align: center;
            margin: 2mm 0;
            color: #000000;
            font-weight: bold;
            line-height: 1.3;
            word-break: break-word;
          }
          .powered-by {
            font-size: 8.5pt;
            text-align: center;
            margin: 3mm 0 1mm 0;
            color: #000000;
            font-weight: bold;
            line-height: 1.2;
          }
          .ace-line {
            font-size: 8pt;
            text-align: center;
            margin: 1mm 0;
            color: #000000;
            font-weight: bold;
            line-height: 1.2;
          }
        </style>
      </head>
      <body>
        ${content}
        <script>
          window.onload = function() {
            const barcodeElement = document.getElementById('barcode-svg');
            const barcodeNumber = document.getElementById('barcode-number')?.textContent || '';
            if (barcodeElement && barcodeNumber && window.JsBarcode) {
              try {
                JsBarcode(barcodeElement, barcodeNumber, {
                  format: "CODE128",
                  width: 2,
                  height: 50,
                  displayValue: false,
                  margin: 0,
                  background: "#ffffff",
                  lineColor: "#000000"
                });
              } catch (err) {
                console.error('Barcode generation failed:', err);
              }
            }
          };
        </script>
      </body>
    </html>
  `;

  // Fetch single sale (simulate API call, but use local data for now)
  const handleViewSale = async (saleId: string) => {
    setViewLoading(true);
    // Simulate API call delay
    const sale = sales.find((s) => s.id === saleId) || null;
    setTimeout(() => {
      setViewSale(sale);
      setViewLoading(false);
    }, 300); // Simulate network delay
  };

  const closeViewModal = () => {
    setViewSale(null);
    setViewLoading(false);
  };

  useEffect(() => {
    if (viewSale) {
      const data = prepareReceiptDataFromSale(viewSale, branchInfo);
      const content = generateReceiptHtml(data);
      setReceiptData(data);
      setReceiptHtml(receiptPageWrapper(content));
    } else {
      setReceiptHtml("");
      setReceiptData(null);
    }
  }, [viewSale, branchInfo]);

  useEffect(() => {
    const iframe = receiptIframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const body = doc.body;
        const html = doc.documentElement;
        
        // Wait a bit for content to render
        setTimeout(() => {
          const height = Math.max(
            body?.scrollHeight ?? 0,
            body?.offsetHeight ?? 0,
            html?.clientHeight ?? 0,
            html?.scrollHeight ?? 0,
            html?.offsetHeight ?? 0
          );
          // Limit height to prevent overflow, with max of 65vh for better modal fit
          const maxHeight = Math.min(window.innerHeight * 0.65, height + 40);
          setIframeHeight(Math.max(500, maxHeight));
        }, 100);
      } catch (error) {
        console.warn("Failed to measure receipt height", error);
      }
    };

    iframe.addEventListener("load", handleLoad);
    // Also check on window resize
    window.addEventListener("resize", handleLoad);
    return () => {
      iframe.removeEventListener("load", handleLoad);
      window.removeEventListener("resize", handleLoad);
    };
  }, [receiptHtml]);

  const handleBrowserPrintReceipt = () => {
    if (!receiptHtml) return;
    const printWindow = window.open("", "_blank", "width=420,height=600");
    if (!printWindow) {
      toast({ title: "Unable to open print window", variant: "destructive" });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
      } catch (error) {
        console.error("Print failed", error);
      }
    }, 500);
  };

  const handleServerPrint = async () => {
    if (!receiptData) {
      toast({ title: "No receipt data available", variant: "destructive" });
      return;
    }
    const printerInfo = getReceiptPrinterObj();
    const printerName = printerInfo?.name || (kioskMode ? "Default Printer" : "");
    if (!printerName) {
      toast({
        variant: "destructive",
        title: "No receipt printer configured",
        description: "Go to Printer Settings to select a receipt printer.",
      });
      return;
    }
    const printerObj = {
      name: printerName,
      columns: printerInfo?.receiptProfile?.columns || { fontA: 48, fontB: 64 },
    };
    const job = { copies: 1, cut: true, openDrawer: false };
    try {
      const result = await printReceiptViaServer(printerObj, receiptData, job);
      if (result.success) {
        toast({
          title: "Receipt sent to printer",
          description: `Printer: ${printerName}`,
        });
      } else {
        throw new Error(result.error || "Print server error");
      }
    } catch (error: any) {
      console.error("Server print failed:", error);
      toast({
        variant: "destructive",
        title: "Print failed",
        description: error?.message || "Unable to print via print server.",
      });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Sales History</h1>
          <p className="text-sm md:text-base text-gray-600">View and export past sales</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={fetchSales} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" onClick={printTable}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 sm:max-w-sm relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-10"
            placeholder="Search sale # or customer"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="flex items-center">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate && endDate
                ? `${format(startDate, "MM/dd/yyyy")} - ${format(
                    endDate,
                    "MM/dd/yyyy"
                  )}`
                : "Select date range"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>From</Label>
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => date && setStartDate(date)}
                />
              </div>
              <div>
                <Label>To</Label>
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => date && setEndDate(date)}
                />
              </div>
            </div>
            <Separator className="my-2" />
            <Button
              onClick={() => {
                setStartDate(undefined);
                setEndDate(undefined);
              }}
              className="w-full"
            >
              Clear Dates
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sales History ({totalSales})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <div className="inline-block min-w-full align-middle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Sale #</TableHead>
                    <TableHead className="min-w-[120px]">Date</TableHead>
                    <TableHead className="min-w-[150px]">Branch</TableHead>
                    <TableHead className="min-w-[150px]">Customer</TableHead>
                    <TableHead className="min-w-[100px]">Payment</TableHead>
                    <TableHead className="min-w-[100px]">Total</TableHead>
                    <TableHead className="min-w-[100px]">Type</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10">
                      <PageLoader message="Loading sales..." />
                    </TableCell>
                  </TableRow>
                ) : sales.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-10 text-gray-500"
                    >
                      No sales found
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map((s) => {
                    const saleType = getSaleType(s.total_amount);
                    const isNegative = parseFloat(s.total_amount) < 0;

                    return (
                      <TableRow
                        key={s.id}
                        className={isNegative ? "bg-red-50" : ""}
                      >
                        <TableCell className="font-medium">
                          {s.sale_number}
                        </TableCell>
                        <TableCell>
                          {format(parseISO(s.sale_date), "MM/dd/yyyy")}
                        </TableCell>
                        <TableCell>
                          {s.branch?.name || "—"}
                        </TableCell>
                        <TableCell>{s.customer?.email || "—"}</TableCell>
                        <TableCell>{s.payment_method}</TableCell>
                        <TableCell
                          className={
                            isNegative ? "text-red-600 font-medium" : ""
                          }
                        >
                          {formatCurrency(s.total_amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              saleType === "refund" ? "destructive" : "default"
                            }
                          >
                            {saleType.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              s.status === "COMPLETED" ? "default" : "outline"
                            }
                          >
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewSale(s.id)}
                            title="View Receipt"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditSale(s)}
                            title="Edit Sale"
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </div>
          
          {/* Pagination */}
          {totalSales > 0 && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="page-size" className="text-sm font-medium whitespace-nowrap">
                  Items per page:
                </Label>
                <Select 
                  value={String(pageSize)} 
                  onValueChange={value => { 
                    setPageSize(Number(value)); 
                    setCurrentPage(1); 
                  }}
                >
                  <SelectTrigger className="w-32" id="page-size">
                    <SelectValue placeholder="Page Size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="0">All</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-gray-600">
                  Showing {totalSales === 0 ? 0 : ((currentPage - 1) * pageSize) + 1} to {Math.min((currentPage - 1) * pageSize + sales.length, totalSales)} of {totalSales} sales
                </span>
              </div>

              {pageSize !== 0 && totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 5) {
                        page = i + 1;
                      } else if (currentPage <= 3) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        page = totalPages - 4 + i;
                      } else {
                        page = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className="min-w-[40px]"
                        >
                          {page}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    Last
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sale Receipt Modal */}
      <Dialog open={!!viewSale || viewLoading} onOpenChange={closeViewModal}>
        <DialogContent className="max-w-3xl w-[90vw] max-h-[96vh] flex flex-col p-0 gap-0 overflow-hidden shadow-2xl">
          {viewLoading ? (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
              <PageLoader message="Loading sale details..." />
            </div>
          ) : viewSale ? (
            <>
              <DialogHeader className="px-8 pt-8 pb-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-2xl font-bold text-gray-900 mb-2">Sale Receipt</DialogTitle>
                    <DialogDescription className="text-sm text-gray-600">
                      View and print the receipt exactly as it appears at checkout.
                    </DialogDescription>
                  </div>
                  <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-md font-medium">
                    {viewSale.sale_number}
                  </div>
                </div>
              </DialogHeader>
              
              <div className="flex-1 overflow-hidden bg-gray-50">
                <div className="h-full overflow-auto p-3 sm:p-4 flex justify-center items-start">
                  {receiptHtml ? (
                    <div className="w-full max-w-5xl mx-auto">
                      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-3 sm:p-4 overflow-hidden">
                        <iframe
                          ref={receiptIframeRef}
                          title="Receipt Preview"
                          srcDoc={receiptHtml}
                          className="block w-full bg-white"
                          style={{
                            width: "100%",
                            minHeight: "400px",
                            height: `${Math.min(iframeHeight, window.innerHeight * 0.65)}px`,
                            border: "none",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-20 w-full">
                      <div className="text-lg font-medium mb-2">Receipt preview unavailable</div>
                      <div className="text-sm">Unable to load receipt data</div>
                    </div>
                  )}
                </div>
              </div>
              
              <DialogFooter className="px-6 py-4 border-t border-gray-200 bg-white flex-shrink-0">
                <div className="w-full space-y-3">
                  {/* First line: Sale info and Printer */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full">
                    <div className="text-sm text-gray-700 flex items-center">
                      <span className="font-semibold text-gray-900">Sale #{viewSale.sale_number}</span>
                      <span className="mx-2 text-gray-400">•</span>
                      <span className="text-gray-600">{format(parseISO(viewSale.sale_date), "PPpp")}</span>
                    </div>
                    {receiptPrinter && (
                      <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                        🖨️ <span className="font-medium">{receiptPrinter}</span>
                      </div>
                    )}
                  </div>
                  {/* Second line: Action buttons */}
                  <div className="flex items-center justify-between gap-2.5 w-full">
                    <div className="flex items-center gap-2.5">
                      {(printers.length > 0 || kioskMode) && (
                        <Button 
                          onClick={handleServerPrint} 
                          disabled={!receiptPrinter && !kioskMode}
                          className="whitespace-nowrap shadow-sm hover:shadow-md transition-all"
                          size="default"
                        >
                          <Printer className="h-4 w-4 mr-2" />
                          Print to Printer
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        onClick={handleBrowserPrintReceipt}
                        className="whitespace-nowrap shadow-sm hover:shadow-md transition-all"
                        size="default"
                      >
                        Browser Print
                      </Button>
                    </div>
                    <Button 
                      variant="default" 
                      onClick={closeViewModal}
                      className="whitespace-nowrap bg-black hover:bg-gray-800 text-white h-9"
                      size="default"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <SaleEditor 
        sale={editSale as any} 
        open={!!editSale} 
        onOpenChange={(open) => !open && setEditSale(null)} 
        onSuccess={fetchSales}
      />
    </div>
  );
}
