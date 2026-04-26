"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Search, 
  Trash2, 
  Package, 
  Calculator, 
  Calendar as CalendarIcon, 
  FileText, 
  Truck, 
  ChevronRight, 
  Save, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  X,
  FileSpreadsheet,
  Info,
  RefreshCw
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PageLoader } from "@/components/ui/page-loader";
import * as XLSX from "xlsx";

interface Product {
  id: string;
  name: string;
  sku: string;
  purchase_rate: number;
  sales_rate_inc_dis_and_tax: number;
}

interface Supplier {
  id: string;
  name: string;
  code: string;
}

interface Branch {
  id: string;
  name: string;
  branch_type: string;
}

interface PurchaseItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
  batchNo: string;
  expiryDate: string;
  total: number;
  ctns?: number;
  piecePerCtn?: number;
  cbmPerCtn?: number;
  tCbm?: number;
  gwPerCtn?: number;
  tGw?: number;
}

interface PurchaseResponse {
  id: string;
  purchase_date: string;
  invoice_ref: string;
  supplier: { name: string };
  warehouse_branch: { name: string };
  product?: { name: string };
  quantity?: number;
  cost_price?: number;
  delivery_status: string;
  items?: any[];
}

export function Purchases() {
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<"HISTORY" | "CREATE">("HISTORY");
  
  // Master Data
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // History State
  const [purchases, setPurchases] = useState<PurchaseResponse[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filters, setFilters] = useState({
    supplierId: "",
    startDate: "",
    endDate: "",
  });

  // Creation State
  const [header, setHeader] = useState({
        supplierId: "",
        purchaseDate: new Date().toISOString().slice(0, 10),
        invoiceRef: "",
        notes: "",
        deliveryStatus: "COMPLETE" as "PARTIAL" | "COMPLETE",
  });

  const [stagedItems, setStagedItems] = useState<PurchaseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Bulk import progress
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, label: "" });

  // Selector States
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [itemForm, setItemForm] = useState({
    quantity: "",
    costPrice: "",
    salePrice: "",
    batchNo: "",
    expiryDate: "",
  });
  const [productSearch, setProductSearch] = useState("");
  const [openProductCombo, setOpenProductCombo] = useState(false);

  // Fetch Data
  const fetchMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [pRes, sRes] = await Promise.all([
        apiClient.get('/products', { params: { fetch_all: true, is_active: true } }),
        apiClient.get('/suppliers', { params: { is_active: true, display_on_pos: undefined } }),
      ]);
      setProducts(pRes.data?.data || []);
      setSuppliers(sRes.data?.data || []);
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to load master data", variant: "destructive" });
    } finally {
      setLoadingMeta(false);
    }
  }, [toast]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params: any = { page: 1, limit: 50 };
      if (filters.supplierId) params.supplierId = filters.supplierId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const res = await apiClient.get('/purchases', { params });
      setPurchases(res.data?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  }, [filters]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { if (activeView === "HISTORY") fetchHistory(); }, [activeView, fetchHistory]);

  // Derived Values
  const grandTotal = stagedItems.reduce((sum, item) => sum + item.total, 0);

  // Business Logic
  const handleAddStagedItem = () => {
    if (!selectedProduct || !itemForm.quantity || !itemForm.costPrice) {
      toast({ title: "Product & Quantity Required", variant: "destructive" });
      return;
    }

    const qty = parseFloat(itemForm.quantity);
    const cost = parseFloat(itemForm.costPrice);
    
    const newItem: PurchaseItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      sku: selectedProduct.sku,
      quantity: qty,
      costPrice: cost,
      salePrice: parseFloat(itemForm.salePrice) || selectedProduct.sales_rate_inc_dis_and_tax,
      batchNo: itemForm.batchNo,
      expiryDate: itemForm.expiryDate,
      total: qty * cost,
    };

    setStagedItems([...stagedItems, newItem]);
    // Reset item form
    setSelectedProduct(null);
    setItemForm({
      quantity: "",
      costPrice: "",
      salePrice: "",
      batchNo: "",
      expiryDate: "",
    });
    setProductSearch("");
  };

  const handleRemoveStagedItem = (id: string) => {
    setStagedItems(stagedItems.filter(i => i.id !== id));
  };

  const handleSubmitPurchase = async () => {
    if (!header.supplierId || stagedItems.length === 0) {
      toast({ title: "Incomplete Stock In", description: "Supplier and items are mandatory.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/purchases', {
        ...header,
        items: stagedItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          costPrice: item.costPrice,
          salePrice: item.salePrice,
          batchNo: item.batchNo || undefined,
          expiryDate: item.expiryDate || undefined,
          ctns: item.ctns,
          piecePerCtn: item.piecePerCtn,
          cbmPerCtn: item.cbmPerCtn,
          tCbm: item.tCbm,
          gwPerCtn: item.gwPerCtn,
          tGw: item.tGw,
        })),
      });
      toast({ title: "Stock Updated", description: `Successfully logged ${stagedItems.length} items to inventory.` });
      setStagedItems([]);
      setHeader({
        ...header,
        invoiceRef: "",
        notes: "",
      });
      setActiveView("HISTORY");
    } catch (e: any) {
      toast({ title: "Submission Failed", description: e?.response?.data?.message || "Check your network connection", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const selectProduct = (p: Product) => {
    setSelectedProduct(p);
    setItemForm({
      ...itemForm,
      costPrice: p.purchase_rate.toString(),
      salePrice: p.sales_rate_inc_dis_and_tax.toString(),
    });
    setOpenProductCombo(false);
  };

  // Bulk Import Handlers
  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet) as any[];

    if (json.length === 0) {
      toast({ title: "Empty File", description: "No data rows found in the sheet.", variant: "destructive" });
      return;
    }

    // Filter out truly blank rows upfront
    // Skip instruction/example rows: row 2 starts with "---" or "REQUIRED"
    const validRows = json.filter((row: any) => {
      const sku = String(row["Item no"] || row["Item No (SKU)"] || row.sku || row.SKU || "").trim();
      const name = String(row.Name || row["Product Name"] || row.name || row.product_name || "").trim();
      if (!sku && !name) return false;
      if (sku === "---" || name.startsWith("REQUIRED") || sku.startsWith("REQUIRED")) return false;
      return true;
    });

    setImporting(true);
    setImportProgress({ current: 0, total: validRows.length, label: "Reading file…" });

    // Keep a fresh copy of products so newly created ones are findable
    let productsCopy = [...products];
    const newItems: PurchaseItem[] = [];
    let created = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i] as any;
      // Supports both packing list schema and the client template schema
      const sku     = String(row["Item No (SKU)"] || row["Item no"] || row.sku || row.SKU || "").trim();
      const nameCol = String(row["Product Name"] || row.Name || row.name || row.product_name || "").trim();
      // "Initial Stock Qty" takes priority over T Pieces for qty; T Pieces used as packing info
      const initialStockQty = parseFloat(row["Initial Stock Qty"] ?? 0) || 0;
      const tPieces = parseFloat(row["T Pieces"] ?? row.quantity ?? 0) || 0;
      const qty     = initialStockQty || tPieces;
      const minStock  = parseFloat(row["Min Stock (Reorder)"] ?? row.min_qty ?? 0) || 0;
      const buyPrice  = parseFloat(row["Buy Price (Rs)"] || row.cost_price || row.purchase_rate || 0) || 0;
      const sellPrice = parseFloat(row["Sell Price (Rs)"] || row.sale_price || row.sales_rate_inc_dis_and_tax || 0) || 0;
      const ctns        = parseFloat(row.Ctns ?? 0) || undefined;
      const piecePerCtn = parseFloat(row["Pieces Per Ctn"] ?? row.Pieces ?? 0) || undefined;
      const cbmPerCtn   = parseFloat(row["Cbm Per Ctn"] ?? row.Cbm ?? 0) || undefined;
      const tCbm        = parseFloat(row["T Cbm"] ?? row["T cbm"] ?? 0) || undefined;
      const gwPerCtn    = parseFloat(row["GW Per Ctn"] ?? row.GW ?? 0) || undefined;
      const tGw         = parseFloat(row["T GW"] ?? 0) || undefined;
      const categoryName = String(row.Category || row.category_name || row.category || "").trim() || undefined;
      const unitName     = String(row.Unit || row.unit_name || row.unit || "").trim() || undefined;

      const displayName = nameCol || sku;
      setImportProgress({ current: i + 1, total: validRows.length, label: displayName });

      // 1. Try to find existing product
      let product = productsCopy.find(
        (p) => (sku && p.sku === sku) || (nameCol && p.name === nameCol)
      );

      // 2. If not found, auto-create it
      if (!product && (sku || nameCol)) {
        try {
          const res = await apiClient.post("/products", {
            name: nameCol || sku,
            sku: sku || undefined,
            purchase_rate: buyPrice,
            sales_rate_exc_dis_and_tax: sellPrice,
            sales_rate_inc_dis_and_tax: sellPrice,
            min_qty: minStock || 10,
            max_qty: minStock ? minStock * 3 : 10,
            category_name: categoryName,
            unit_name: unitName,
          });
          const created_product = res.data?.data || res.data;
          product = {
            id: created_product.id,
            name: created_product.name,
            sku: created_product.sku,
            purchase_rate: buyPrice,
            sales_rate_inc_dis_and_tax: sellPrice,
          };
          productsCopy = [...productsCopy, product];
          setProducts(productsCopy);
          created++;
        } catch {
          // product creation failed (e.g. duplicate name) — try lookup again
          try {
            const lookupRes = await apiClient.get("/products", { params: { search: nameCol || sku, fetch_all: true } });
            const found = (lookupRes.data?.data || []).find(
              (p: any) => p.sku === sku || p.name === nameCol
            );
            if (found) {
              product = found;
              productsCopy = [...productsCopy, found];
              setProducts(productsCopy);
            }
          } catch { /* skip row */ }
        }
      }

      if (product && qty > 0) {
        const cost = buyPrice || parseFloat(row.cost_price || product.purchase_rate) || 0;
        const sell = sellPrice || parseFloat(row.sale_price || product.sales_rate_inc_dis_and_tax) || 0;
        newItems.push({
          id: Math.random().toString(36).substr(2, 9),
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: qty,
          costPrice: cost,
          salePrice: sell,
          batchNo: row.batch_no || "",
          expiryDate: row.expiry_date || "",
          total: qty * cost,
          ctns,
          piecePerCtn,
          cbmPerCtn,
          tCbm,
          gwPerCtn,
          tGw,
        });
      }
    }

    setImporting(false);
    setImportProgress({ current: 0, total: 0, label: "" });

    if (newItems.length > 0) {
      setStagedItems((prev) => [...prev, ...newItems]);
      toast({
        title: "Import Successful",
        description: `${newItems.length} items staged.${created > 0 ? ` ${created} new products auto-created.` : ""}`,
      });
    } else {
      toast({ title: "Import Failed", description: "No valid rows found. Make sure T Pieces > 0.", variant: "destructive" });
    }
  };

  if (loadingMeta) {
    return <PageLoader />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      {/* Background Logo */}
      <img src="https://i.ibb.co/hL77L3H/Sarwat-POS-Logo.png" alt="Logo" className="opacity-5 absolute pointer-events-none" style={{ top: '20px', left: '20px', width: '100px' }} />

      <div className="relative z-10 h-full flex flex-col p-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 p-3 rounded-2xl shadow-xl shadow-slate-200">
              <Plus className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Stock In / Arrivals</h1>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mt-0.5">Wholesale inventory management portal</p>
            </div>
          </div>
          
          <div className="flex p-1 bg-slate-50 rounded-xl border border-slate-200">
             <button 
              onClick={() => setActiveView("HISTORY")}
              className={cn(
                "px-6 h-9 rounded-lg font-black text-[10px] tracking-widest transition-all uppercase",
                activeView === "HISTORY" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
             >
               History logs
             </button>
             <button 
              onClick={() => setActiveView("CREATE")}
              className={cn(
                "px-6 h-9 rounded-lg font-black text-[10px] tracking-widest transition-all uppercase",
                activeView === "CREATE" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
             >
               New Entry
             </button>
          </div>
        </div>

        {activeView === "HISTORY" ? (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            {/* History Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-slate-500 ml-1">Supplier Entity</Label>
                <Select value={filters.supplierId} onValueChange={(v) => setFilters({...filters, supplierId: v === "all" ? "" : v})}>
                  <SelectTrigger className="rounded-lg h-10 border-slate-200 font-bold bg-white text-xs">
                    <SelectValue placeholder="All Sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL SUPPLIERS</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-slate-500 ml-1">Date Range Start</Label>
                <Input type="date" value={filters.startDate} onChange={(e) => setFilters({...filters, startDate: e.target.value})} className="rounded-lg h-10 border-slate-200 bg-white font-bold text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-slate-500 ml-1">Date Range End</Label>
                <Input type="date" value={filters.endDate} onChange={(e) => setFilters({...filters, endDate: e.target.value})} className="rounded-lg h-10 border-slate-200 bg-white font-bold text-xs" />
              </div>
              <div className="flex items-end">
                 <Button className="w-full bg-slate-900 text-white h-10 rounded-lg font-black text-[10px] tracking-widest uppercase" onClick={fetchHistory} disabled={loadingHistory}>
                    {loadingHistory ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                    REFRESH
                 </Button>
              </div>
            </div>

            {/* History Table */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0">
               <ScrollArea className="flex-1">
                 <Table>
                   <TableHeader className="bg-slate-50 sticky top-0 z-10">
                     <TableRow className="border-slate-100">
                        <TableHead className="w-[120px] uppercase text-[9px] font-black text-slate-400 px-6 h-10">Timestamp</TableHead>
                        <TableHead className="uppercase text-[9px] font-black text-slate-400 h-10">Doc Ref</TableHead>
                        <TableHead className="uppercase text-[9px] font-black text-slate-400 h-10">Supplier</TableHead>
                        <TableHead className="uppercase text-[9px] font-black text-slate-400 h-10">Branch</TableHead>
                        <TableHead className="text-right uppercase text-[9px] font-black text-slate-400 h-10">Valuation</TableHead>
                        <TableHead className="text-right uppercase text-[9px] font-black text-slate-400 px-6 h-10">Status</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {purchases.length === 0 ? (
                       <TableRow>
                         <TableCell colSpan={6} className="h-64 text-center">
                            <div className="flex flex-col items-center gap-2 opacity-20">
                               <FileText className="h-10 w-10 text-slate-900" />
                               <p className="text-[10px] text-slate-900 font-black uppercase tracking-widest">No matching records</p>
                            </div>
                         </TableCell>
                       </TableRow>
                     ) : (
                       purchases.map((p) => (
                        <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-slate-50">
                          <TableCell className="px-6 py-4">
                             <p className="font-black text-slate-900 text-xs uppercase">{format(new Date(p.purchase_date), "dd MMM yy")}</p>
                             <p className="text-[9px] font-bold text-slate-400 uppercase">{format(new Date(p.purchase_date), "hh:mm a")}</p>
                          </TableCell>
                          <TableCell className="font-black text-slate-900 text-[10px] uppercase">{p.invoice_ref || "SYSTEM_GEN"}</TableCell>
                          <TableCell className="font-black text-slate-900 text-xs uppercase">{p.supplier?.name}</TableCell>
                          <TableCell className="font-bold text-slate-500 text-[10px] uppercase">{p.warehouse_branch?.name}</TableCell>
                          <TableCell className="text-right font-black text-slate-900 text-xs tabular-nums">
                            {/* Assuming purchases list might show total or first item if items aren't nested, but backend returns expanded items usually */}
                            {p.items ? `Rs ${p.items.reduce((sum: number, it: any) => sum + (Number(it.quantity) * Number(it.cost_price)), 0).toLocaleString()}` : "---"}
                          </TableCell>
                          <TableCell className="text-right px-6">
                             <Badge className={cn("px-2 py-0 h-5 rounded-md text-[8px] font-black uppercase border-none", p.delivery_status === "COMPLETE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                                {p.delivery_status}
                             </Badge>
                          </TableCell>
                        </TableRow>
                       ))
                     )}
                   </TableBody>
                 </Table>
               </ScrollArea>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-hidden">
            {/* Main Entry Panel */}
            <div className="lg:col-span-8 flex flex-col min-h-0 space-y-4">
              <Card className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden flex flex-col min-h-0 relative">
                 {/* Import progress overlay */}
                 {importing && (
                   <div className="absolute inset-0 z-20 bg-slate-900/95 flex flex-col items-center justify-center rounded-xl gap-5">
                     <Loader2 className="h-10 w-10 text-white animate-spin" />
                     <div className="w-80 space-y-3 text-center">
                       <p className="text-[9px] font-black uppercase tracking-widest text-white/50">
                         Processing Packing List
                       </p>
                       <p className="text-sm font-black text-white truncate px-4">
                         {importProgress.label}
                       </p>
                       {/* Progress bar */}
                       <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                         <div
                           className="h-2 bg-emerald-400 rounded-full transition-all duration-300"
                           style={{ width: importProgress.total > 0 ? `${(importProgress.current / importProgress.total) * 100}%` : "0%" }}
                         />
                       </div>
                       <p className="text-[10px] font-black text-white/60 tabular-nums">
                         {importProgress.current} / {importProgress.total} ROWS
                       </p>
                     </div>
                   </div>
                 )}

                 <div className="p-4 border-b border-slate-100 bg-slate-900 flex items-center justify-between text-white">
                    <div>
                       <h3 className="text-xs font-black uppercase tracking-widest">Entry Manifest</h3>
                       <p className="text-[9px] font-bold text-white/50 uppercase">Current Inventory In-flow</p>
                    </div>
                    <div className="flex gap-2">
                       <input type="file" id="bulk-import" className="hidden" accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleBulkImport} />
                       <Button
                          variant="secondary"
                          disabled={importing}
                          className="bg-white text-slate-900 hover:bg-slate-100 font-black rounded-lg h-8 text-[10px] uppercase border-none disabled:opacity-50"
                          onClick={() => !importing && document.getElementById('bulk-import')?.click()}
                       >
                         {importing ? (
                           <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Importing…</>
                         ) : (
                           <><FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Bulk Load</>
                         )}
                       </Button>
                    </div>
                 </div>

                 <CardContent className="p-6 flex-1 flex flex-col min-h-0 space-y-8">
                    {/* Header Form */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div className="space-y-2 text-left">
                          <Label className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Supplier</Label>
                          <Select value={header.supplierId} onValueChange={(v) => setHeader({...header, supplierId: v})}>
                             <SelectTrigger className="rounded-xl border-slate-200 h-11 bg-white text-xs font-black uppercase">
                                <SelectValue placeholder="SELECT ENTITY" />
                             </SelectTrigger>
                             <SelectContent>
                                {suppliers.map(s => <SelectItem key={s.id} value={s.id} className="text-xs font-black uppercase">{s.name}</SelectItem>)}
                             </SelectContent>
                          </Select>
                       </div>
                       <div className="space-y-2 text-left">
                          <Label className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Arrival Date</Label>
                          <Input type="date" value={header.purchaseDate} onChange={(e) => setHeader({...header, purchaseDate: e.target.value})} className="rounded-xl h-11 border-slate-200 bg-white text-xs font-black tabular-nums" />
                       </div>
                       <div className="space-y-2 text-left">
                          <Label className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Invoice Code</Label>
                          <Input value={header.invoiceRef} onChange={(e) => setHeader({...header, invoiceRef: e.target.value})} placeholder="REF-0000" className="rounded-xl h-11 border-slate-200 bg-white text-xs font-black uppercase" />
                       </div>
                    </div>

                    {/* Item Entry Section */}
                    <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-6">
                       <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
                          <div className="md:col-span-6 space-y-2 text-left">
                             <Label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Asset Search</Label>
                             <Popover open={openProductCombo} onOpenChange={setOpenProductCombo}>
                               <PopoverTrigger asChild>
                                 <Button variant="outline" className="w-full justify-between rounded-xl border-slate-200 h-11 font-black text-slate-900 bg-white text-xs uppercase shadow-sm">
                                   <span className="truncate pr-4">{selectedProduct ? selectedProduct.name : "TYPE SKU OR NAME..."}</span>
                                   <Search className="h-4 w-4 opacity-30" />
                                 </Button>
                               </PopoverTrigger>
                               <PopoverContent className="w-[500px] p-0 rounded-2xl shadow-2xl border-none overflow-hidden" align="start">
                                 <Command>
                                   <CommandInput placeholder="SEARCH CATALOG..." className="text-xs font-black h-12 uppercase" />
                                   <CommandList className="max-h-[350px]">
                                     <CommandEmpty className="text-xs font-black py-8 text-center text-slate-400">No assets found</CommandEmpty>
                                     <CommandGroup>
                                       {products.map((p) => (
                                         <CommandItem key={p.id} value={`${p.sku} ${p.name}`} onSelect={() => selectProduct(p)} className="px-5 py-4 font-black cursor-pointer hover:bg-slate-50 border-b border-slate-50 last:border-none">
                                           <div className="flex flex-col gap-1">
                                              <span className="text-xs uppercase">{p.name}</span>
                                              <span className="text-[9px] text-slate-400 tracking-tighter">SKU: {p.sku}</span>
                                           </div>
                                         </CommandItem>
                                       ))}
                                     </CommandGroup>
                                   </CommandList>
                                 </Command>
                               </PopoverContent>
                             </Popover>
                          </div>
                          
                          <div className="md:col-span-2 space-y-2 text-left">
                             <Label className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center block">Arrival Qty</Label>
                             <Input type="number" value={itemForm.quantity} onChange={(e) => setItemForm({...itemForm, quantity: e.target.value})} className="rounded-xl border-slate-200 bg-white font-black text-slate-900 h-11 text-sm text-center tabular-nums" placeholder="0" />
                          </div>

                          <div className="md:col-span-2 space-y-2 text-left">
                             <Label className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center block">Unit Cost</Label>
                             <Input type="number" value={itemForm.costPrice} onChange={(e) => setItemForm({...itemForm, costPrice: e.target.value})} className="rounded-xl border-slate-200 bg-white font-black text-slate-900 h-11 text-sm text-center tabular-nums" placeholder="0.00" />
                          </div>

                          <div className="md:col-span-2">
                             <Button className="w-full bg-slate-900 hover:bg-black text-white rounded-xl h-11 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-slate-200 transition-all active:scale-95" onClick={handleAddStagedItem}>
                               ADD ITEM
                             </Button>
                          </div>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-200/50">
                          <div className="space-y-2 text-left">
                             <Label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Batch / Lot Identifier</Label>
                             <Input value={itemForm.batchNo} onChange={(e) => setItemForm({...itemForm, batchNo: e.target.value})} className="rounded-xl border-slate-100 bg-white h-9 text-[10px] font-black uppercase" placeholder="BATCH-ID-00" />
                          </div>
                          <div className="space-y-2 text-left">
                             <Label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Expiry Date</Label>
                             <Input type="date" value={itemForm.expiryDate} onChange={(e) => setItemForm({...itemForm, expiryDate: e.target.value})} className="rounded-xl border-slate-100 bg-white h-9 text-[10px] font-black tabular-nums" />
                          </div>
                       </div>
                    </div>

                    {/* Staged Items List */}
                    <div className="flex-1 flex flex-col min-h-0 space-y-3">
                       <h4 className="text-[10px] font-black uppercase text-slate-900 tracking-[0.2em] px-1">STaging grid</h4>
                       <div className="flex-1 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                          <ScrollArea className="h-full max-h-[350px]">
                          <Table>
                             <TableHeader className="bg-slate-50 border-b border-slate-100">
                                <TableRow className="hover:bg-transparent h-10">
                                   <TableHead className="text-[9px] font-black uppercase text-slate-400 px-6">Asset Desc</TableHead>
                                   <TableHead className="text-[9px] font-black uppercase text-slate-400 text-center">Unit Qty</TableHead>
                                   <TableHead className="text-[9px] font-black uppercase text-slate-400 text-right">Acquisition cost</TableHead>
                                   <TableHead className="text-[9px] font-black uppercase text-slate-400 text-right">Sum total</TableHead>
                                   <TableHead className="w-[40px] px-6"></TableHead>
                                </TableRow>
                             </TableHeader>
                             <TableBody>
                                {stagedItems.length === 0 ? (
                                  <TableRow>
                                     <TableCell colSpan={5} className="py-20 text-center">
                                       <div className="opacity-10 scale-75">
                                          <Package className="h-10 w-10 mx-auto mb-2" />
                                          <p className="text-[10px] font-black uppercase tracking-widest">No Items Staged</p>
                                       </div>
                                     </TableCell>
                                  </TableRow>
                                ) : (
                                  stagedItems.map((item) => (
                                    <TableRow key={item.id} className="hover:bg-slate-50/50 h-14 group transition-all border-b border-slate-50 last:border-none italic-none">
                                       <TableCell className="px-6">
                                          <div className="flex flex-col">
                                             <span className="font-black text-slate-900 text-xs uppercase">{item.productName}</span>
                                             <span className="text-[9px] font-bold text-slate-400 uppercase">{item.sku} {item.batchNo && `| LOT: ${item.batchNo}`}</span>
                                          </div>
                                       </TableCell>
                                       <TableCell className="font-black text-slate-900 text-center text-xs tabular-nums">{item.quantity}</TableCell>
                                       <TableCell className="font-black text-slate-600 text-right text-xs tabular-nums">Rs {item.costPrice.toLocaleString()}</TableCell>
                                       <TableCell className="font-black text-slate-900 text-right text-xs tabular-nums">Rs {item.total.toLocaleString()}</TableCell>
                                       <TableCell className="px-6">
                                          <button className="text-slate-200 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-lg" onClick={() => handleRemoveStagedItem(item.id)}>
                                             <X className="h-4 w-4" />
                                          </button>
                                       </TableCell>
                                    </TableRow>
                                  ))
                                )}
                             </TableBody>
                          </Table>
                          </ScrollArea>
                       </div>
                    </div>
                 </CardContent>
              </Card>
            </div>

            {/* Sidebar / Summary */}
            <div className="lg:col-span-4 space-y-6">
               <Card className="rounded-2xl border border-slate-200 shadow-xl bg-white p-8 space-y-8 sticky top-4">
                  <div className="flex items-center justify-between">
                     <div className="bg-slate-900 p-3 rounded-2xl">
                        <Calculator className="h-5 w-5 text-white" />
                     </div>
                     <Badge variant="outline" className="text-[9px] font-black uppercase px-3 py-1 border-slate-200">AUDIT READY</Badge>
                  </div>

                  <div className="space-y-5">
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active SKUs</span>
                        <span className="font-black text-slate-900 text-xs">{stagedItems.length}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gross Volume</span>
                        <span className="font-black text-slate-900 text-xs">{stagedItems.reduce((s, i) => s + i.quantity, 0)} Units</span>
                     </div>
                     <div className="pt-6 border-t border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Net Valuation</span>
                        <span className="text-4xl font-black text-slate-900 tracking-tighter tabular-nums truncate block">
                          Rs {grandTotal.toLocaleString()}
                        </span>
                     </div>
                  </div>

                  <div className="space-y-2 text-left pt-2">
                     <Label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Internal Remarks</Label>
                     <Textarea 
                      value={header.notes} 
                      onChange={(e) => setHeader({...header, notes: e.target.value})} 
                      placeholder="ENTER LOGISTICS OR INVENTORY NOTES..." 
                      className="rounded-xl border-slate-200 bg-slate-50/50 resize-none h-28 focus:ring-slate-900 text-xs font-bold uppercase"
                     />
                  </div>

                  <Button 
                   className="w-full bg-slate-900 text-white h-16 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-slate-200 hover:bg-black transition-all active:scale-[0.98] disabled:opacity-30"
                   disabled={submitting || stagedItems.length === 0}
                   onClick={handleSubmitPurchase}
                  >
                    {submitting ? (
                       <div className="flex items-center gap-3">
                          <RefreshCw className="h-5 w-5 animate-spin" />
                          SYNCING...
                       </div>
                    ) : "COMMIT TO STOCK"}
                  </Button>

                  <div className="p-4 bg-slate-900/5 rounded-2xl border border-slate-900/5 flex gap-3">
                     <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                     <p className="text-[9px] text-slate-600 font-bold leading-relaxed uppercase tracking-tight">
                        Transaction will update physical ledger levels and adjust cost basis for all staged assets. THIS ACTION IS PERMANENT.
                     </p>
                  </div>
               </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
