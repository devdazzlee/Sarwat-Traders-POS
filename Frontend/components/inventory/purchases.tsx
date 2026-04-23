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
  FileSpreadsheet
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
}

interface PurchaseResponse {
  id: string;
  purchase_date: string;
  invoice_ref: string;
  supplier: { name: string };
  warehouse_branch: { name: string };
  product: { name: string };
  quantity: string;
  cost_price: string;
  delivery_status: string;
}

export function Purchases() {
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<"HISTORY" | "CREATE">("HISTORY");
  
  // Master Data
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
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
        warehouseBranchId: "",
        purchaseDate: new Date().toISOString().slice(0, 10),
        invoiceRef: "",
        notes: "",
        deliveryStatus: "COMPLETE" as "PARTIAL" | "COMPLETE",
  });

  const [stagedItems, setStagedItems] = useState<PurchaseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

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

  // Bulk Import State
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Fetch Data
  const fetchMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [pRes, sRes, bRes] = await Promise.all([
        apiClient.get(`${API_BASE}/products`, { params: { fetch_all: true, is_active: true } }),
        apiClient.get(`${API_BASE}/suppliers`),
        apiClient.get(`${API_BASE}/branches`, { params: { fetch_all: true } }),
      ]);
      setProducts(pRes.data?.data || []);
      setSuppliers(sRes.data?.data || []);
      setBranches(bRes.data?.data || []);
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
      const res = await apiClient.get(`${API_BASE}/purchases`, { params });
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
  const warehouseBranches = branches.filter(b => b.branch_type === "WAREHOUSE" || b.name.toLowerCase().includes("warehouse"));
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
    if (!header.supplierId || !header.warehouseBranchId || stagedItems.length === 0) {
      toast({ title: "Incomplete Stock In", description: "Supplier, Warehouse, and items are mandatory.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post(`${API_BASE}/purchases`, {
        ...header,
        items: stagedItems
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

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet) as any[];

    const newItems: PurchaseItem[] = [];
    for (const row of json) {
      const sku = row.sku || row.SKU;
      const product = products.find(p => p.sku === sku || p.name === row.product_name);
      if (product) {
        const qty = parseFloat(row.quantity || 0);
        const cost = parseFloat(row.cost_price || product.purchase_rate);
        newItems.push({
          id: Math.random().toString(36).substr(2, 9),
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: qty,
          costPrice: cost,
          salePrice: parseFloat(row.sale_price || product.sales_rate_inc_dis_and_tax),
          batchNo: row.batch_no || "",
          expiryDate: row.expiry_date || "",
          total: qty * cost,
        });
      }
    }

    if (newItems.length > 0) {
      setStagedItems([...stagedItems, ...newItems]);
      toast({ title: "Import Successful", description: `${newItems.length} items added to staging.` });
    } else {
      toast({ title: "Import Failed", description: "No matching products found by SKU/Name", variant: "destructive" });
    }
  };

  if (loadingMeta) {
    return <PageLoader />;
  }

  return (
    <div className="p-4 md:p-8 space-y-8 bg-slate-50 min-h-screen">
      {/* Header Navigation */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
             <div className="bg-slate-900 p-2 rounded-xl">
                <Truck className="h-6 w-6 text-blue-400" />
             </div>
             <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic">Stock In Engine</h1>
          </div>
          <p className="text-slate-500 font-medium">Log wholesale arrivals and synchronize inventory across branches</p>
        </div>
        
        <div className="flex p-1 bg-white rounded-2xl shadow-sm border border-slate-200">
           <Button 
            variant={activeView === "HISTORY" ? "default" : "ghost"}
            className={cn("rounded-xl px-8 font-black", activeView === "HISTORY" ? "bg-slate-900 text-white" : "text-slate-500")}
            onClick={() => setActiveView("HISTORY")}
           >
             History
           </Button>
           <Button 
            variant={activeView === "CREATE" ? "default" : "ghost"}
            className={cn("rounded-xl px-8 font-black", activeView === "CREATE" ? "bg-slate-900 text-white" : "text-slate-500")}
            onClick={() => setActiveView("CREATE")}
           >
             New Entry
           </Button>
        </div>
      </div>

      {activeView === "HISTORY" ? (
        <div className="space-y-6">
          {/* History Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="space-y-2 text-left">
              <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Supplier</Label>
              <Select value={filters.supplierId} onValueChange={(v) => setFilters({...filters, supplierId: v === "all" ? "" : v})}>
                <SelectTrigger className="rounded-xl border-slate-200 font-bold bg-slate-50/50">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 text-left">
              <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Start Date</Label>
              <Input type="date" value={filters.startDate} onChange={(e) => setFilters({...filters, startDate: e.target.value})} className="rounded-xl bg-slate-50/50 border-slate-200 font-bold" />
            </div>
            <div className="space-y-2 text-left">
              <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">End Date</Label>
              <Input type="date" value={filters.endDate} onChange={(e) => setFilters({...filters, endDate: e.target.value})} className="rounded-xl bg-slate-50/50 border-slate-200 font-bold" />
            </div>
            <div className="flex items-end">
               <Button className="w-full bg-slate-900 text-white h-10 rounded-xl font-black shadow-lg" onClick={fetchHistory} disabled={loadingHistory}>
                  {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                  REFRESH LOG
               </Button>
            </div>
          </div>

          {/* History Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
             <Table>
               <TableHeader className="bg-slate-50 font-black">
                 <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="w-[150px] uppercase text-[10px] tracking-widest font-black text-slate-400">Date/Time</TableHead>
                    <TableHead className="uppercase text-[10px] tracking-widest font-black text-slate-400">Invoice Ref</TableHead>
                    <TableHead className="uppercase text-[10px] tracking-widest font-black text-slate-400">Supplier</TableHead>
                    <TableHead className="uppercase text-[10px] tracking-widest font-black text-slate-400">Product</TableHead>
                    <TableHead className="uppercase text-[10px] tracking-widest font-black text-slate-400">Warehouse</TableHead>
                    <TableHead className="text-right uppercase text-[10px] tracking-widest font-black text-slate-400">Qty</TableHead>
                    <TableHead className="text-right uppercase text-[10px] tracking-widest font-black text-slate-400">Unit Cost</TableHead>
                    <TableHead className="text-right uppercase text-[10px] tracking-widest font-black text-slate-400">Status</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {purchases.length === 0 ? (
                   <TableRow>
                     <TableCell colSpan={8} className="h-64 text-center">
                        <div className="flex flex-col items-center gap-4">
                           <FileText className="h-12 w-12 text-slate-200" />
                           <p className="text-slate-400 font-bold">No purchase logs found matching current filters.</p>
                        </div>
                     </TableCell>
                   </TableRow>
                 ) : (
                   purchases.map((p) => (
                    <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-slate-50">
                      <TableCell className="font-bold text-slate-600 text-xs">
                         <div className="flex flex-col">
                            <span>{format(new Date(p.purchase_date), "dd MMM yy")}</span>
                            <span className="text-[10px] text-slate-400">{format(new Date(p.purchase_date), "hh:mm a")}</span>
                         </div>
                      </TableCell>
                      <TableCell className="font-black text-blue-600 uppercase text-xs">{p.invoice_ref || "---"}</TableCell>
                      <TableCell className="font-bold text-slate-900">{p.supplier?.name}</TableCell>
                      <TableCell>
                         <div className="flex items-center gap-2">
                            <Package className="h-3 w-3 text-slate-400" />
                            <span className="font-bold">{p.product?.name}</span>
                         </div>
                      </TableCell>
                      <TableCell className="font-medium text-slate-500">{p.warehouse_branch?.name}</TableCell>
                      <TableCell className="text-right font-black text-slate-900">{Number(p.quantity)}</TableCell>
                      <TableCell className="text-right font-black text-slate-900">Rs {Number(p.cost_price).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                         <Badge variant="outline" className={cn("rounded-lg text-[10px] font-black uppercase tracking-widest", p.delivery_status === "COMPLETE" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100")}>
                            {p.delivery_status}
                         </Badge>
                      </TableCell>
                    </TableRow>
                   ))
                 )}
               </TableBody>
             </Table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Entry Panel */}
          <div className="lg:col-span-8 space-y-6">
            <Card className="rounded-3xl border-slate-200 shadow-lg bg-white overflow-hidden">
               <CardHeader className="bg-slate-900 text-white rounded-t-3xl">
                  <div className="flex items-center justify-between">
                     <div>
                        <CardTitle className="text-xl font-black uppercase italic tracking-tighter">Arrival Manifest</CardTitle>
                        <CardDescription className="text-slate-400 font-bold">Log multiple items from a single wholesale invoice</CardDescription>
                     </div>
                     <div className="flex gap-2">
                        <input type="file" id="bulk-import" className="hidden" accept=".xlsx,.csv" onChange={handleBulkImport} />
                        <Button variant="outline" className="bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700 font-bold rounded-xl h-9" onClick={() => document.getElementById('bulk-import')?.click()}>
                           <FileSpreadsheet className="h-4 w-4 mr-2" /> 
                           Bulk Sheet
                        </Button>
                     </div>
                  </div>
               </CardHeader>
               <CardContent className="p-6 space-y-8">
                  {/* Header Form */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-6 border-b border-dashed border-slate-200">
                     <div className="space-y-2 text-left">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Supplier/Source *</Label>
                        <Select value={header.supplierId} onValueChange={(v) => setHeader({...header, supplierId: v})}>
                           <SelectTrigger className="rounded-xl border-slate-200 focus:ring-slate-900 bg-slate-50/30">
                              <SelectValue placeholder="Select Supplier" />
                           </SelectTrigger>
                           <SelectContent>
                              {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                           </SelectContent>
                        </Select>
                     </div>
                     <div className="space-y-2 text-left">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Destination Warehouse *</Label>
                        <Select value={header.warehouseBranchId} onValueChange={(v) => setHeader({...header, warehouseBranchId: v})}>
                           <SelectTrigger className="rounded-xl border-slate-200 focus:ring-slate-900 bg-slate-50/30">
                               <SelectValue placeholder="Select Warehouse" />
                           </SelectTrigger>
                           <SelectContent>
                              {branches.map(b => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.name} {b.branch_type === "WAREHOUSE" ? "(Warehouse)" : ""}
                                </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                     <div className="space-y-2 text-left">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Arrival Date</Label>
                        <Input type="date" value={header.purchaseDate} onChange={(e) => setHeader({...header, purchaseDate: e.target.value})} className="rounded-xl border-slate-200 bg-slate-50/30" />
                     </div>
                     <div className="space-y-2 text-left">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Invoice Ref / LR #</Label>
                        <Input value={header.invoiceRef} onChange={(e) => setHeader({...header, invoiceRef: e.target.value})} placeholder="WH-0001" className="rounded-xl border-slate-200 bg-slate-50/30 font-bold uppercase placeholder:text-slate-300" />
                     </div>
                  </div>

                  {/* Item Entry Section */}
                  <div className="space-y-4">
                     <p className="text-[10px] font-black uppercase text-slate-900 tracking-widest flex items-center gap-2">
                        <Plus className="h-3 w-3" /> ADD LINE ITEM
                     </p>
                     <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 items-end">
                           <div className="md:col-span-2 lg:col-span-4 space-y-2 text-left">
                              <Label className="text-[10px] font-black text-slate-500 uppercase ml-1 whitespace-nowrap">Asset (SKU / Name)</Label>
                              <Popover open={openProductCombo} onOpenChange={setOpenProductCombo}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="w-full justify-between rounded-xl border-slate-200 h-11 font-bold text-slate-700 bg-white shadow-sm"
                                  >
                                    <span className="truncate pr-4">{selectedProduct ? selectedProduct.name : "Start typing SKU or name..."}</span>
                                    <ChevronRight className={cn("ml-2 h-4 w-4 shrink-0 transition-transform text-slate-400 font-black", openProductCombo ? "rotate-90 text-slate-900" : "")} />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[400px] p-0 rounded-2xl shadow-2xl border-slate-200" align="start">
                                  <Command>
                                    <CommandInput placeholder="Search catalog..." />
                                    <CommandList className="max-h-[300px]">
                                      <CommandEmpty>No products found.</CommandEmpty>
                                      <CommandGroup>
                                        {products.map((p) => (
                                          <CommandItem
                                            key={p.id}
                                            value={`${p.sku} ${p.name}`}
                                            onSelect={() => selectProduct(p)}
                                            className="px-4 py-3 font-bold cursor-pointer hover:bg-slate-50"
                                          >
                                            <div className="flex flex-col">
                                               <span>{p.name}</span>
                                               <span className="text-[10px] text-slate-400 uppercase tracking-widest">{p.sku}</span>
                                            </div>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                           </div>
                           
                           <div className="lg:col-span-2 space-y-2 text-left">
                              <Label className="text-[10px] font-black text-slate-500 uppercase ml-1 whitespace-nowrap">Arrival Qty</Label>
                              <Input type="number" value={itemForm.quantity} onChange={(e) => setItemForm({...itemForm, quantity: e.target.value})} className="rounded-xl border-slate-200 bg-white font-black text-slate-900 h-11" placeholder="0" />
                           </div>

                           <div className="lg:col-span-2 space-y-2 text-left">
                              <Label className="text-[10px] font-black text-slate-500 uppercase ml-1 whitespace-nowrap">Cost Rate</Label>
                              <div className="relative">
                                 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs pointer-events-none">Rs</span>
                                 <Input type="number" value={itemForm.costPrice} onChange={(e) => setItemForm({...itemForm, costPrice: e.target.value})} className="rounded-xl border-slate-200 bg-white pl-8 font-black text-blue-600 h-11" placeholder="0.00" />
                              </div>
                           </div>

                           <div className="lg:col-span-2 space-y-2 text-left">
                              <Label className="text-[10px] font-black text-slate-500 uppercase ml-1 whitespace-nowrap">Sale Rate</Label>
                              <div className="relative">
                                 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs pointer-events-none">Rs</span>
                                 <Input type="number" value={itemForm.salePrice} onChange={(e) => setItemForm({...itemForm, salePrice: e.target.value})} className="rounded-xl border-slate-200 bg-white pl-8 font-black text-emerald-600 h-11" placeholder="0.00" />
                              </div>
                           </div>

                           <div className="lg:col-span-2">
                              <Button className="w-full bg-slate-900 hover:bg-black text-white rounded-xl h-11 font-black shadow-lg transition-all active:scale-[0.98] gap-2" onClick={handleAddStagedItem}>
                                <Plus className="h-4 w-4" /> ADD
                              </Button>
                           </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                           <div className="space-y-2 text-left">
                              <Label className="text-[10px] font-black text-slate-500 uppercase ml-1">Batch / Lot Number</Label>
                              <Input value={itemForm.batchNo} onChange={(e) => setItemForm({...itemForm, batchNo: e.target.value})} className="rounded-xl border-slate-100 bg-white/50 text-xs uppercase" placeholder="BATCH-123" />
                           </div>
                           <div className="space-y-2 text-left">
                              <Label className="text-[10px] font-black text-slate-500 uppercase ml-1">Expiry Date (If applicable)</Label>
                              <Input type="date" value={itemForm.expiryDate} onChange={(e) => setItemForm({...itemForm, expiryDate: e.target.value})} className="rounded-xl border-slate-100 bg-white/50 text-xs" />
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Staged Items List */}
                  <div className="space-y-4">
                     <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase text-slate-900 tracking-widest flex items-center gap-2">
                           <Save className="h-3 w-3" /> STAGING GRID ({stagedItems.length})
                        </p>
                        {stagedItems.length > 0 && (
                          <Button variant="ghost" className="text-[10px] font-black uppercase text-red-500 hover:bg-red-50 p-0 h-auto" onClick={() => setStagedItems([])}>
                             Clear All
                          </Button>
                        )}
                     </div>
                     <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-inner bg-slate-50/30">
                        <ScrollArea className="h-[300px]">
                        <Table>
                           <TableHeader className="bg-slate-100">
                              <TableRow className="hover:bg-transparent">
                                 <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">Item Details</TableHead>
                                 <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">Qty</TableHead>
                                 <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">Unit Cost</TableHead>
                                 <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">Total</TableHead>
                                 <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500 w-[50px]"></TableHead>
                              </TableRow>
                           </TableHeader>
                           <TableBody>
                              {stagedItems.length === 0 ? (
                                <TableRow>
                                   <TableCell colSpan={5} className="h-32 text-center text-slate-300 italic font-medium">Staging grid empty. Select product and click Add to stage for Stock In.</TableCell>
                                </TableRow>
                              ) : (
                                stagedItems.map((item) => (
                                  <TableRow key={item.id} className="hover:bg-white group transition-all">
                                     <TableCell>
                                        <div className="flex flex-col">
                                           <span className="font-black text-slate-900">{item.productName}</span>
                                           <div className="flex gap-2 items-center">
                                              <span className="text-[9px] font-bold text-slate-400 font-mono">{item.sku}</span>
                                              {item.batchNo && <Badge className="text-[8px] h-3 px-1 bg-blue-50 text-blue-500 border-blue-100 font-black">LOT: {item.batchNo}</Badge>}
                                           </div>
                                        </div>
                                     </TableCell>
                                     <TableCell className="font-black text-slate-900">{item.quantity}</TableCell>
                                     <TableCell className="font-black text-blue-600 italic">Rs {item.costPrice}</TableCell>
                                     <TableCell className="font-black text-slate-950">Rs {item.total.toLocaleString()}</TableCell>
                                     <TableCell>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-200 group-hover:text-red-500 hover:bg-red-50 rounded-lg p-0" onClick={() => handleRemoveStagedItem(item.id)}>
                                           <Trash2 className="h-3 w-3" />
                                        </Button>
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
             <Card className="rounded-3xl border-slate-200 shadow-xl bg-white p-8 space-y-8 sticky top-8">
                <div className="flex items-center gap-3">
                   <div className="bg-blue-100 p-2 rounded-xl">
                      <Calculator className="h-5 w-5 text-blue-600" />
                   </div>
                   <h2 className="text-xl font-black italic uppercase tracking-tighter">Manifest Summary</h2>
                </div>

                <div className="space-y-4">
                   <div className="flex justify-between items-center pb-4 border-b border-slate-100 border-dashed">
                      <span className="font-bold text-slate-500 uppercase text-[10px] tracking-widest italic">Total Arrival Count</span>
                      <span className="font-black text-slate-900 text-lg">{stagedItems.length} SKUs</span>
                   </div>
                   <div className="flex justify-between items-center pb-4 border-b border-slate-100 border-dashed">
                      <span className="font-bold text-slate-500 uppercase text-[10px] tracking-widest italic">Total Units Incoming</span>
                      <span className="font-black text-slate-900 text-lg">{stagedItems.reduce((s, i) => s + i.quantity, 0)} Pcs</span>
                   </div>
                   <div className="flex justify-between items-center pb-4 border-b border-slate-100 border-dashed">
                      <span className="font-bold text-slate-500 uppercase text-[10px] tracking-widest italic">Inventory Valuation (Arrival)</span>
                      <span className="font-black text-blue-600 text-xl font-mono">Rs {grandTotal.toLocaleString()}</span>
                   </div>
                </div>

                <div className="space-y-2 text-left">
                   <Label className="text-[10px] font-black uppercase text-slate-400 ml-1 italic">Remarks / Arrival Notes</Label>
                   <Textarea 
                    value={header.notes} 
                    onChange={(e) => setHeader({...header, notes: e.target.value})} 
                    placeholder="Log truck details, cargo damage, or any unloading notes here..." 
                    className="rounded-2xl border-slate-100 bg-slate-50/50 resize-none h-32 focus:ring-slate-900 font-medium"
                   />
                </div>

                <div className="pt-4">
                   <Button 
                    className="w-full bg-slate-900 text-white h-14 rounded-2xl font-black text-lg shadow-2xl hover:bg-slate-800 transition-all active:scale-[0.98] border-b-4 border-slate-950"
                    disabled={submitting || stagedItems.length === 0}
                    onClick={handleSubmitPurchase}
                   >
                     {submitting ? (
                        <div className="flex items-center gap-3">
                           <Loader2 className="h-5 w-5 animate-spin" />
                           UPDATING INVENTORY...
                        </div>
                     ) : (
                       <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400 shadow-xl" />
                          COMMIT TO STOCK
                       </div>
                     )}
                   </Button>
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 border-dashed flex gap-3">
                   <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                   <p className="text-[10px] text-amber-700 font-medium leading-relaxed uppercase tracking-tight italic">
                      Committing will instantly update warehouse quantities and log professional stock movement entries for audit trail.
                   </p>
                </div>
             </Card>
          </div>
        </div>
      )}
    </div>
  );
}
