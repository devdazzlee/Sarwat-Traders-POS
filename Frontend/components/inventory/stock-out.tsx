"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  Trash2, 
  Plus, 
  Search, 
  ShoppingCart, 
  Calculator, 
  FileText, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  X,
  User,
  Barcode,
  History,
  TrendingDown,
  ChevronRight
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

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  sales_rate_inc_dis_and_tax: number;
}

interface StockItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  availableStock: number;
  salePrice: number;
  total: number;
  notes?: string;
}

interface Branch {
  id: string;
  name: string;
}

interface Customer {
  id: string;
  name: string;
  mobile?: string;
}

interface HistoryItem {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: number;
  notes: string;
  product: { name: string; sku: string };
  branch: { name: string };
  user?: { name: string };
}

export function StockOut() {
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<"HISTORY" | "CREATE">("HISTORY");
  
  // Master Data
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({
    branchId: "",
    reason: "",
  });

  // Creation State
  const [header, setHeader] = useState({
    branchId: "",
    customerId: "",
    reason: "SALE",
    notes: "",
    reference: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const [stagedItems, setStagedItems] = useState<StockItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Item Form
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [availableStock, setAvailableStock] = useState<number>(0);
  const [itemForm, setItemForm] = useState({
    quantity: "",
    price: "",
    notes: "",
  });
  const [openProductCombo, setOpenProductCombo] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Fetch Metadata
  const fetchMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [pRes, bRes, cRes] = await Promise.all([
        apiClient.get(`${API_BASE}/products`, { params: { fetch_all: true, is_active: true } }),
        apiClient.get(`${API_BASE}/branches`, { params: { fetch_all: true } }),
        apiClient.get(`${API_BASE}/customers`, { params: { fetch_all: true } }),
      ]);
      setProducts(pRes.data?.data || []);
      setBranches(bRes.data?.data || []);
      setCustomers(cRes.data?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await apiClient.get(`${API_BASE}/stock-out/history`, { params: historyFilters });
      setHistory(res.data?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyFilters]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { if (activeView === "HISTORY") fetchHistory(); }, [activeView, fetchHistory]);

  // Fetch Available Stock when product/branch changes
  useEffect(() => {
    if (selectedProduct && header.branchId) {
      apiClient.get(`${API_BASE}/stock`, { 
        params: { productId: selectedProduct.id, branchId: header.branchId } 
      }).then(res => {
        const stocks = res.data?.data || [];
        const qty = stocks.length > 0 ? Number(stocks[0].current_quantity) : 0;
        setAvailableStock(qty);
      });
    } else {
      setAvailableStock(0);
    }
  }, [selectedProduct, header.branchId]);

  // Derived
  const grandTotal = stagedItems.reduce((sum, item) => sum + item.total, 0);

  // Handlers
  const handleAddStagedItem = () => {
    if (!selectedProduct || !itemForm.quantity) {
      toast({ title: "Validation Error", description: "Product and Quantity are required", variant: "destructive" });
      return;
    }

    const qty = parseFloat(itemForm.quantity);
    if (qty > availableStock && header.reason !== "ADJUSTMENT") {
       toast({ title: "Insufficient Stock", description: `You only have ${availableStock} units available.`, variant: "destructive" });
       return;
    }

    const price = parseFloat(itemForm.price) || selectedProduct.sales_rate_inc_dis_and_tax;
    
    const newItem: StockItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      sku: selectedProduct.sku,
      quantity: qty,
      availableStock: availableStock,
      salePrice: price,
      total: qty * price,
      notes: itemForm.notes,
    };

    setStagedItems([...stagedItems, newItem]);
    setSelectedProduct(null);
    setItemForm({ quantity: "", price: "", notes: "" });
    setProductSearch("");
  };

  const handleRemoveItem = (id: string) => {
    setStagedItems(stagedItems.filter(i => i.id !== id));
  };

  const handleSubmitDispatch = async () => {
    if (!header.branchId || stagedItems.length === 0) {
      toast({ title: "Incomplete Form", description: "Branch and at least one item are required.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post(`${API_BASE}/stock-out/bulk`, {
        ...header,
        items: stagedItems.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          notes: i.notes
        }))
      });
      toast({ title: "Inventory Dispatched", description: "Stock levels updated successfully." });
      setStagedItems([]);
      setActiveView("HISTORY");
    } catch (e: any) {
      toast({ title: "Dispatch Failed", description: e?.response?.data?.message || "Check network connection", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const selectProduct = (p: Product) => {
    setSelectedProduct(p);
    setItemForm({ ...itemForm, price: p.sales_rate_inc_dis_and_tax.toString() });
    setOpenProductCombo(false);
  };

  if (loadingMeta) {
    return <PageLoader />;
  }

  return (
    <div className="p-4 md:p-8 space-y-8 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
             <div className="bg-rose-600 p-2 rounded-xl">
                <TrendingDown className="h-6 w-6 text-white" />
             </div>
             <h1 className="text-3xl font-black text-slate-900 tracking-tight">Dispatched Stock</h1>
          </div>
          <p className="text-slate-500 font-medium">View and manage stock leaving branches</p>
        </div>
        
        <div className="flex p-1 bg-white rounded-2xl shadow-sm border border-slate-200">
           <Button 
            variant={activeView === "HISTORY" ? "default" : "ghost"}
            className={cn("rounded-xl px-8 font-black", activeView === "HISTORY" ? "bg-slate-900 text-white" : "text-slate-500")}
            onClick={() => setActiveView("HISTORY")}
           >
             Log
           </Button>
           <Button 
            variant={activeView === "CREATE" ? "default" : "ghost"}
            className={cn("rounded-xl px-8 font-black", activeView === "CREATE" ? "bg-slate-900 text-white" : "text-slate-500")}
            onClick={() => setActiveView("CREATE")}
           >
             New Dispatch
           </Button>
        </div>
      </div>

      {activeView === "HISTORY" ? (
        <div className="space-y-6">
           <Card className="rounded-3xl border-slate-200 shadow-sm bg-white p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="space-y-2">
                   <Label className="text-[10px] font-bold text-slate-400">Filter By Branch</Label>
                   <Select value={historyFilters.branchId} onValueChange={(v) => setHistoryFilters({...historyFilters, branchId: v === "all" ? "" : v})}>
                      <SelectTrigger className="rounded-xl border-slate-200 bg-slate-50/50">
                         <SelectValue placeholder="All Branches" />
                      </SelectTrigger>
                      <SelectContent>
                         <SelectItem value="all">All Branches</SelectItem>
                         {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                   </Select>
                 </div>
                 <div className="space-y-2">
                   <Label className="text-[10px] font-bold text-slate-400">Filter By Reason</Label>
                   <Select value={historyFilters.reason} onValueChange={(v) => setHistoryFilters({...historyFilters, reason: v === "all" ? "" : v})}>
                      <SelectTrigger className="rounded-xl border-slate-200 bg-slate-50/50">
                         <SelectValue placeholder="All Reasons" />
                      </SelectTrigger>
                      <SelectContent>
                         <SelectItem value="all">All Reasons</SelectItem>
                         <SelectItem value="SALE">Sale</SelectItem>
                         <SelectItem value="DAMAGE">Damage</SelectItem>
                         <SelectItem value="LOSS">Loss</SelectItem>
                         <SelectItem value="EXPIRED">Expired Goods</SelectItem>
                      </SelectContent>
                   </Select>
                 </div>
                 <div className="flex items-end">
                    <Button className="w-full bg-slate-900 rounded-xl font-bold gap-2" onClick={fetchHistory} disabled={loadingHistory}>
                       {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                       SEARCH LOGS
                    </Button>
                 </div>
              </div>
           </Card>

           <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
             <Table>
               <TableHeader className="bg-slate-50">
                 <TableRow className="border-slate-100">
                    <TableHead className="uppercase text-[10px] font-black tracking-widest text-slate-400">Date</TableHead>
                    <TableHead className="uppercase text-[10px] font-black tracking-widest text-slate-400">Product</TableHead>
                    <TableHead className="uppercase text-[10px] font-black tracking-widest text-slate-400">Branch</TableHead>
                    <TableHead className="uppercase text-[10px] font-black tracking-widest text-slate-400 text-right">Qty</TableHead>
                    <TableHead className="uppercase text-[10px] font-black tracking-widest text-slate-400">Reason</TableHead>
                    <TableHead className="uppercase text-[10px] font-black tracking-widest text-slate-400">Notes</TableHead>
                    <TableHead className="uppercase text-[10px] font-black tracking-widest text-slate-400">By</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {history.length === 0 ? (
                   <TableRow>
                     <TableCell colSpan={7} className="h-64 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-30">
                           <History className="h-12 w-12" />
                           <p className="font-bold">No dispatch history recorded.</p>
                        </div>
                     </TableCell>
                   </TableRow>
                 ) : (
                   history.map((h) => (
                    <TableRow key={h.id} className="border-slate-50 hover:bg-slate-50 transition-colors">
                      <TableCell className="text-xs font-bold text-slate-600 italic">
                         {format(new Date(h.created_at), "dd MMM yy")}
                      </TableCell>
                      <TableCell>
                         <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{h.product?.name}</span>
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest">{h.product?.sku}</span>
                         </div>
                      </TableCell>
                      <TableCell className="font-bold text-slate-600">{h.branch?.name}</TableCell>
                      <TableCell className="text-right font-black text-rose-600">
                         {Math.abs(h.quantity_change)}
                      </TableCell>
                      <TableCell>
                         <Badge variant="outline" className={cn("rounded-lg text-[9px] font-bold tracking-tighter", 
                            h.movement_type === "SALE" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100")}>
                            {h.movement_type}
                         </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400 max-w-[150px] truncate">{h.notes}</TableCell>
                      <TableCell className="text-[10px] font-bold text-slate-400">{h.user?.email || "System"}</TableCell>
                    </TableRow>
                   ))
                 )}
               </TableBody>
             </Table>
           </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
           {/* Manifest Entry Container */}
           <div className="lg:col-span-8 space-y-6">
              <Card className="rounded-3xl border-slate-200 shadow-lg bg-white overflow-hidden">
                 <CardHeader className="bg-slate-900 text-white rounded-t-3xl">
                    <div className="flex items-center justify-between">
                       <div>
                          <CardTitle className="text-xl font-bold italic tracking-tighter">Dispatch Manifest</CardTitle>
                          <CardDescription className="text-slate-400 font-bold">Prepare inventory for shipment, sale, or disposal</CardDescription>
                       </div>
                       <Barcode className="h-10 w-10 text-slate-700" />
                    </div>
                 </CardHeader>
                 <CardContent className="p-6 space-y-8">
                    {/* Header Logic */}
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 pb-6 border-b border-dashed border-slate-200">
                       <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-slate-400 ml-1">Origin Branch *</Label>
                          <Select value={header.branchId} onValueChange={(v) => { setHeader({...header, branchId: v}); setStagedItems([]); }}>
                             <SelectTrigger className="rounded-xl border-slate-200 bg-slate-50/30">
                                <SelectValue placeholder="Select Branch" />
                             </SelectTrigger>
                             <SelectContent>
                                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                             </SelectContent>
                          </Select>
                       </div>
                       <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-slate-400 ml-1">Dispatch Type *</Label>
                          <Select value={header.reason} onValueChange={(v) => setHeader({...header, reason: v})}>
                             <SelectTrigger className="rounded-xl border-slate-200 bg-slate-50/30">
                                <SelectValue placeholder="Select Reason" />
                             </SelectTrigger>
                             <SelectContent>
                                <SelectItem value="SALE">Sale / Order Delivery</SelectItem>
                                <SelectItem value="DAMAGE">Damage / QC Failure</SelectItem>
                                <SelectItem value="INTERNAL_USE">Internal Usage</SelectItem>
                                <SelectItem value="EXPIRED">Expiry Disposal</SelectItem>
                             </SelectContent>
                          </Select>
                       </div>
                       {header.reason === "SALE" && (
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-slate-400 ml-1">Target Customer</Label>
                            <Select value={header.customerId} onValueChange={(v) => setHeader({...header, customerId: v})}>
                               <SelectTrigger className="rounded-xl border-slate-200 bg-slate-50/30">
                                  <SelectValue placeholder="Walk-in Customer" />
                               </SelectTrigger>
                               <SelectContent>
                                  <SelectItem value="none">Walk-in Customer</SelectItem>
                                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                               </SelectContent>
                            </Select>
                          </div>
                       )}
                       <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-slate-400 ml-1">Dispatch Date</Label>
                          <Input type="date" value={header.date} onChange={(e) => setHeader({...header, date: e.target.value})} className="rounded-xl border-slate-200 bg-slate-50/30" />
                       </div>
                       <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-slate-400 ml-1">Ref / Invoice #</Label>
                          <Input value={header.reference} onChange={(e) => setHeader({...header, reference: e.target.value})} placeholder="INV-0000" className="rounded-xl border-slate-200 bg-slate-50/30" />
                       </div>
                    </div>

                    {/* Line Item Entry */}
                    <div className="space-y-4">
                       <p className="text-[10px] font-bold text-slate-900 tracking-widest flex items-center gap-2">
                          <Plus className="h-3 w-3" /> ADD LINE ASSET
                       </p>
                       <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                             <div className="md:col-span-12 lg:col-span-5 space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase ml-1">Asset Search (Scan / Name)</Label>
                                <Popover open={openProductCombo} onOpenChange={setOpenProductCombo}>
                                   <PopoverTrigger asChild>
                                      <Button variant="outline" className="w-full justify-between rounded-xl h-12 font-bold bg-white">
                                         {selectedProduct ? selectedProduct.name : "Start typing SKU or Scan..."}
                                         <Search className="h-4 w-4 opacity-50" />
                                      </Button>
                                   </PopoverTrigger>
                                   <PopoverContent className="w-[400px] p-0 rounded-2xl shadow-2xl border-slate-200" align="start">
                                      <Command>
                                         <CommandInput placeholder="Search catalog..." />
                                         <CommandList className="max-h-[300px]">
                                            <CommandEmpty>No matches found.</CommandEmpty>
                                            <CommandGroup>
                                               {products.map(p => (
                                                  <CommandItem key={p.id} value={`${p.sku} ${p.name}`} onSelect={() => selectProduct(p)} className="px-4 py-3 font-bold cursor-pointer">
                                                     <div className="flex flex-col">
                                                        <span>{p.name}</span>
                                                        <span className="text-[10px] text-slate-400 uppercase">{p.sku}</span>
                                                     </div>
                                                  </CommandItem>
                                               ))}
                                            </CommandGroup>
                                         </CommandList>
                                      </Command>
                                   </PopoverContent>
                                </Popover>
                                {selectedProduct && (
                                   <div className="flex justify-between items-center px-1">
                                      <span className="text-[9px] font-bold text-slate-400">Available in Branch:</span>
                                      <span className={cn("text-[10px] font-black", availableStock > 0 ? "text-emerald-600" : "text-rose-600")}>
                                         {availableStock} Units
                                      </span>
                                   </div>
                                )}
                             </div>

                             <div className="md:col-span-4 lg:col-span-2 space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase ml-1">Dispatch Qty</Label>
                                <Input type="number" value={itemForm.quantity} onChange={(e) => setItemForm({...itemForm, quantity: e.target.value})} className="rounded-xl h-12 font-black text-center text-lg" placeholder="1" />
                             </div>
                             
                             <div className="md:col-span-4 lg:col-span-2 space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase ml-1">Price per unit</Label>
                                <div className="relative">
                                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Rs</span>
                                   <Input type="number" value={itemForm.price} onChange={(e) => setItemForm({...itemForm, price: e.target.value})} className="rounded-xl h-12 pl-8 font-black text-slate-700" />
                                </div>
                             </div>

                             <div className="md:col-span-4 lg:col-span-3 flex items-end pb-0.5">
                                <Button className="w-full bg-slate-900 rounded-xl h-12 font-black shadow-lg" onClick={handleAddStagedItem}>
                                   <Plus className="h-4 w-4 mr-1" /> STAGE ASSET
                                </Button>
                             </div>
                          </div>
                       </div>
                    </div>

                    {/* Staging Area */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                           <p className="text-[10px] font-bold text-slate-900 tracking-widest flex items-center gap-2">
                              <ShoppingCart className="h-3 w-3" /> STAGING GRID ({stagedItems.length})
                           </p>
                           <Button variant="ghost" className="text-[10px] font-black text-rose-500 p-0 h-auto" onClick={() => setStagedItems([])}>CLEAR ALL</Button>
                        </div>
                        <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-inner bg-slate-50/30">
                           <ScrollArea className="h-[300px]">
                              <Table>
                                 <TableHeader className="bg-slate-100">
                                    <TableRow>
                                       <TableHead className="text-[9px] font-bold tracking-widest">Asset Details</TableHead>
                                       <TableHead className="text-[9px] font-bold tracking-widest text-right">Qty</TableHead>
                                       <TableHead className="text-[9px] font-bold tracking-widest text-right">Selling Rate</TableHead>
                                       <TableHead className="text-[9px] font-bold tracking-widest text-right">Valuation</TableHead>
                                       <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                    {stagedItems.length === 0 ? (
                                       <TableRow>
                                          <TableCell colSpan={5} className="h-32 text-center text-slate-300 italic font-medium uppercase text-[10px]">Staging Grid empty. Ready to scan line items.</TableCell>
                                       </TableRow>
                                    ) : (
                                       stagedItems.map((item) => (
                                          <TableRow key={item.id} className="hover:bg-white group transition-all">
                                             <TableCell>
                                                <div className="flex flex-col">
                                                   <span className="font-bold text-slate-900">{item.productName}</span>
                                                   <span className="text-[9px] text-slate-400 font-mono">{item.sku}</span>
                                                </div>
                                             </TableCell>
                                             <TableCell className="text-right font-black text-slate-900">{item.quantity}</TableCell>
                                             <TableCell className="text-right font-black text-slate-600">Rs {item.salePrice.toLocaleString()}</TableCell>
                                             <TableCell className="text-right font-black text-rose-600">Rs {item.total.toLocaleString()}</TableCell>
                                             <TableCell>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-300 hover:text-rose-500 rounded-lg" onClick={() => handleRemoveItem(item.id)}>
                                                   <X className="h-4 w-4" />
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

           {/* Summary Panel */}
           <div className="lg:col-span-4 space-y-6">
               <Card className="rounded-3xl border-slate-200 shadow-xl bg-white p-8 space-y-8 sticky top-8">
                  <div className="flex items-center gap-3">
                     <div className="bg-rose-100 p-2 rounded-xl">
                        <Calculator className="h-5 w-5 text-rose-600" />
                     </div>
                     <h2 className="text-xl font-bold uppercase tracking-tighter">Manifest Totals</h2>
                  </div>

                  <div className="space-y-4">
                     <div className="flex justify-between items-center pb-4 border-b border-slate-100 border-dashed">
                        <span className="font-bold text-slate-500 uppercase text-[10px] tracking-widest italic">Total SKU Count</span>
                        <span className="font-black text-slate-900 text-lg">{stagedItems.length} Lines</span>
                     </div>
                     <div className="flex justify-between items-center pb-4 border-b border-slate-100 border-dashed">
                        <span className="font-bold text-slate-500 uppercase text-[10px] tracking-widest italic">Inventory Volume Out</span>
                        <span className="font-black text-slate-900 text-lg">{stagedItems.reduce((s, i) => s + i.quantity, 0)} Units</span>
                     </div>
                     <div className="flex justify-between items-center pb-4 border-b border-slate-100 border-dashed">
                        <span className="font-bold text-slate-500 uppercase text-[10px] tracking-widest italic">Total Valuation (Out)</span>
                        <span className="font-black text-rose-600 text-2xl font-mono">Rs {grandTotal.toLocaleString()}</span>
                     </div>
                  </div>

                  <div className="space-y-2">
                     <Label className="text-[10px] font-bold text-slate-400 ml-1 italic">Dispatch Remarks / Reference</Label>
                     <Textarea 
                       value={header.notes} 
                       onChange={(e) => setHeader({...header, notes: e.target.value})} 
                       placeholder="Enter delivery ref, logistics notes, or reason details..." 
                       className="rounded-2xl border-slate-100 bg-slate-50/50 h-32 focus:ring-rose-500"
                     />
                  </div>

                  <div>
                     <Button 
                       className="w-full bg-rose-600 text-white h-14 rounded-2xl font-black text-lg shadow-2xl hover:bg-rose-700 transition-all active:scale-[0.98] border-b-4 border-rose-800"
                       disabled={submitting || stagedItems.length === 0}
                       onClick={handleSubmitDispatch}
                     >
                        {submitting ? (
                           <div className="flex items-center gap-3">
                              <Loader2 className="h-5 w-5 animate-spin" />
                              UPDATING STOCK...
                           </div>
                        ) : (
                           <div className="flex items-center gap-3">
                              <CheckCircle2 className="h-5 w-5 text-rose-200" />
                              AUTHORIZE DISPATCH
                           </div>
                        )}
                     </Button>
                  </div>

                  <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 border-dashed flex gap-3">
                     <AlertCircle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                     <p className="text-[10px] text-orange-700 font-medium leading-relaxed tracking-tight">
                        Authorizing will instantly deduct quantities from the selected branch and log professional movement entries.
                     </p>
                  </div>
               </Card>
           </div>
        </div>
      )}
    </div>
  );
}
