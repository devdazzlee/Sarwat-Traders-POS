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
  Clock,
  CheckCircle2, 
  AlertCircle,
  Loader2,
  X,
  User,
  Barcode,
  History,
  TrendingDown,
  ChevronRight,
  Info
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { usePosData } from "@/hooks/use-pos-data";
import { toast } from "sonner";
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
  user?: { name: string };
}

const formatCurrency = (n: number) =>
  `Rs ${Number(n).toLocaleString(undefined, { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  })}`;

export function StockOut() {
  const {
    products: allProducts,
    categories,
    productsLoading,
    fetchProducts,
    fetchCategories,
  } = usePosData();

  const [activeView, setActiveView] = useState<"HISTORY" | "CREATE" | "LOG">("HISTORY");
  
  // Master Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({
    reason: "",
  });

  // Creation State
  const [header, setHeader] = useState({
    customerId: "none",
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
      const cRes = await apiClient.get('/customers', { params: { fetch_all: true } });
      setCustomers(cRes.data?.data || []);
      await fetchProducts();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMeta(false);
    }
  }, [fetchProducts]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await apiClient.get('/stock-out/history', { params: historyFilters });
      setHistory(res.data?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyFilters]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { if (activeView === "HISTORY") fetchHistory(); }, [activeView, fetchHistory]);

  const fetchAvailableStock = useCallback(async (productId: string) => {
    try {
      const res = await apiClient.get('/stock', { params: { productId } });
      const stocks = res.data?.data || [];
      const qty = stocks.reduce((sum: number, s: any) => sum + Number(s.current_quantity), 0);
      setAvailableStock(qty);
    } catch (e) {
      setAvailableStock(0);
    }
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      fetchAvailableStock(selectedProduct.id);
    } else {
      setAvailableStock(0);
    }
  }, [selectedProduct, fetchAvailableStock]);

  const grandTotal = stagedItems.reduce((sum, item) => sum + item.total, 0);

  const handleAddStagedItem = () => {
    if (!selectedProduct || !itemForm.quantity) {
      toast.error("Please select a product and enter quantity");
      return;
    }

    const qty = parseFloat(itemForm.quantity);
    if (qty <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }

    if (qty > availableStock && header.reason === "SALE") {
       toast.error(`Low stock: Only ${Math.max(0, availableStock)} units available`);
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
    if (stagedItems.length === 0) {
      toast.error("Please add at least one item to dispatch");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...header,
        customerId: header.customerId === "none" ? undefined : header.customerId,
        items: stagedItems.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          notes: i.notes
        }))
      };

      await apiClient.post('/stock-out/bulk', payload);
      toast.success("Inventory dispatched successfully");
      setStagedItems([]);
      setActiveView("HISTORY");
      fetchHistory();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Dispatch failed");
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
    return <PageLoader message="Loading inventory data..." />;
  }

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-2 rounded-lg border border-slate-200">
            <TrendingDown className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Dispatched Stock</h1>
            <p className="text-slate-500 text-xs translate-y-[-2px]">Manage inventory removals and logs</p>
          </div>
        </div>

        <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
           <Button 
            variant={activeView === "HISTORY" ? "secondary" : "ghost"}
            size="sm"
            className={cn("rounded-lg h-9 text-xs font-bold px-6", activeView === "HISTORY" ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
            onClick={() => setActiveView("HISTORY")}
           >
             Log
           </Button>
           <Button 
            variant={activeView === "CREATE" ? "secondary" : "ghost"}
            size="sm"
            className={cn("rounded-lg h-9 text-xs font-bold px-6", activeView === "CREATE" ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
            onClick={() => setActiveView("CREATE")}
           >
             New Dispatch
           </Button>
        </div>
      </div>

      {activeView === "HISTORY" ? (
        <div className="space-y-4">
           {/* FILTER BAR */}
           <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Filter Reason</p>
                 <Select value={historyFilters.reason} onValueChange={(v) => { 
                    setHistoryFilters({reason: v === "all" ? "" : v});
                 }}>
                    <SelectTrigger className="rounded-lg h-10 border-slate-200 text-xs">
                       <SelectValue placeholder="All Reasons" />
                    </SelectTrigger>
                    <SelectContent>
                       <SelectItem value="all">All Reasons</SelectItem>
                       <SelectItem value="SALE">Sale</SelectItem>
                       <SelectItem value="DAMAGE">Damage</SelectItem>
                       <SelectItem value="LOSS">Loss</SelectItem>
                       <SelectItem value="EXPIRED">Expired</SelectItem>
                    </SelectContent>
                 </Select>
              </div>

              <div className="flex items-end">
                 <Button disabled={loadingHistory} onClick={fetchHistory} className="h-10 px-6 font-bold bg-slate-900 text-white rounded-lg text-xs gap-2">
                    {loadingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    SEARCH LOGS
                 </Button>
              </div>
           </div>

           {/* LOG TABLE */}
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             <Table>
               <TableHeader className="bg-slate-50">
                 <TableRow className="border-slate-100">
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-6">Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Product</TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Qty</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-4">Movement</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-slate-500 h-10 px-6">Operator</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {history.map((h) => (
                  <TableRow key={h.id} className="border-slate-100 hover:bg-slate-50 transition-colors">
                    <TableCell className="px-6 py-3">
                       <p className="text-xs font-semibold text-slate-700">{format(new Date(h.created_at), "dd MMM yy")}</p>
                       <p className="text-[10px] text-slate-400">{format(new Date(h.created_at), "HH:mm")}</p>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                       <p className="font-bold text-slate-800 text-xs">{h.product?.name}</p>
                       <p className="text-[10px] text-slate-400 uppercase tracking-tighter">{h.product?.sku}</p>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                       <span className="font-bold text-xs text-rose-600">
                          -{Math.abs(h.quantity_change)}
                       </span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                       <Badge variant="outline" className={cn("rounded-md text-[9px] font-bold uppercase px-2 py-0.5 border-slate-200", 
                          h.movement_type === "SALE" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100")}>
                          {h.movement_type}
                       </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-3">
                       <p className="text-[10px] font-bold text-slate-500 uppercase">{h.user?.name || "System"}</p>
                    </TableCell>
                  </TableRow>
                 ))}
                 {history.length === 0 && !loadingHistory && (
                    <TableRow>
                       <TableCell colSpan={6} className="py-20 text-center">
                          <History className="h-10 w-10 text-slate-200 mx-auto mb-2" />
                          <p className="text-xs font-bold text-slate-400 uppercase">No log history found</p>
                       </TableCell>
                    </TableRow>
                 )}
               </TableBody>
             </Table>
           </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
           {/* CREATE MANIFEST */}
           <div className="lg:col-span-8 space-y-4">
              <Card className="rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden">
                 <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div>
                       <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Dispatch Manifest</h2>
                       <p className="text-[10px] font-semibold text-slate-400 uppercase">Prepare stock for removal</p>
                    </div>
                    <Barcode className="h-6 w-6 text-slate-300" />
                 </div>
                 
                 <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dispatch Type</Label>
                          <Select value={header.reason} onValueChange={(v) => setHeader({...header, reason: v})}>
                             <SelectTrigger className="rounded-lg h-10 border-slate-200 text-xs">
                                <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                                <SelectItem value="SALE">Sale Delivery</SelectItem>
                                <SelectItem value="DAMAGE">Damage / Scrap</SelectItem>
                                <SelectItem value="LOSS">Loss</SelectItem>
                                <SelectItem value="EXPIRED">Expiry</SelectItem>
                             </SelectContent>
                          </Select>
                       </div>
                       
                       <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer</Label>
                          <Select value={header.customerId} onValueChange={(v) => setHeader({...header, customerId: v})}>
                             <SelectTrigger className="rounded-lg h-10 border-slate-200 text-xs">
                                <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                                <SelectItem value="none">General Walk-in</SelectItem>
                                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                             </SelectContent>
                          </Select>
                       </div>

                       <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ref / Invoice</Label>
                          <Input value={header.reference} onChange={(e) => setHeader({...header, reference: e.target.value})} placeholder="REF-000" className="rounded-lg h-10 border-slate-200 text-xs" />
                       </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                       <Label className="text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-3 block">Add Items</Label>
                       <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="md:col-span-12 lg:col-span-5 space-y-1.5 relative">
                             <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Asset Search</Label>
                             <Popover open={openProductCombo} onOpenChange={setOpenProductCombo}>
                                <PopoverTrigger asChild>
                                   <Button variant="outline" className="w-full justify-between rounded-lg h-10 text-xs border-slate-200 bg-white">
                                      {selectedProduct ? selectedProduct.name : "Search product or scan SKU..."}
                                      <Search className="h-3.5 w-3.5 opacity-40" />
                                   </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 rounded-lg shadow-xl border-slate-200 w-[400px]" align="start">
                                   <Command className="rounded-lg">
                                      <CommandInput placeholder="Type SKU or Name..." className="h-9 text-xs" />
                                      <CommandList className="max-h-[300px]">
                                         <CommandEmpty className="text-xs py-4">No results.</CommandEmpty>
                                         <CommandGroup>
                                            {allProducts.map(p => (
                                               <CommandItem key={p.id} value={`${p.sku} ${p.name}`} onSelect={() => selectProduct(p)} className="px-4 py-2 border-b border-slate-50 last:border-none cursor-pointer">
                                                  <div className="flex flex-col">
                                                     <span className="font-bold text-xs">{p.name}</span>
                                                     <span className="text-[10px] text-slate-400">SKU: {p.sku}</span>
                                                  </div>
                                               </CommandItem>
                                            ))}
                                         </CommandGroup>
                                      </CommandList>
                                   </Command>
                                </PopoverContent>
                             </Popover>
                             {selectedProduct && (
                                <p className={cn("text-[9px] font-bold absolute -bottom-5 right-1 uppercase", availableStock > 0 ? "text-emerald-600" : "text-rose-500")}>
                                   Available: {Math.max(0, availableStock)} Units
                                </p>
                             )}
                          </div>

                          <div className="md:col-span-6 lg:col-span-2 space-y-1.5">
                             <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Qty</Label>
                             <Input type="number" value={itemForm.quantity} onChange={(e) => setItemForm({...itemForm, quantity: e.target.value})} className="rounded-lg h-10 border-slate-200 text-center font-bold text-xs" placeholder="0" />
                          </div>
                          
                          <div className="md:col-span-6 lg:col-span-2 space-y-1.5">
                             <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Rate</Label>
                             <Input type="number" value={itemForm.price} onChange={(e) => setItemForm({...itemForm, price: e.target.value})} className="rounded-lg h-10 border-slate-200 text-center font-bold text-xs" placeholder="0.00" />
                          </div>

                          <div className="md:col-span-12 lg:col-span-3">
                             <Button className="w-full bg-slate-900 rounded-lg h-10 font-bold text-xs gap-2" onClick={handleAddStagedItem}>
                                <Plus className="h-3.5 w-3.5" /> STAGE ITEM
                             </Button>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                           <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Staged Assets ({stagedItems.length})</h3>
                           <Button variant="ghost" size="sm" className="text-[10px] font-bold text-rose-500 h-auto p-0" onClick={() => setStagedItems([])}>CLEAR GRID</Button>
                        </div>
                        <div className="border border-slate-100 rounded-lg overflow-hidden bg-slate-50/30">
                           <ScrollArea className="h-[260px]">
                              <Table>
                                 <TableHeader className="bg-slate-100/50">
                                    <TableRow className="h-8">
                                       <TableHead className="text-[9px] font-bold uppercase h-8 px-4">Item</TableHead>
                                       <TableHead className="text-[9px] font-bold uppercase h-8 text-right">Qty</TableHead>
                                       <TableHead className="text-[9px] font-bold uppercase h-8 text-right">Total</TableHead>
                                       <TableHead className="w-10"></TableHead>
                                    </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                    {stagedItems.map((item) => (
                                       <TableRow key={item.id} className="hover:bg-white h-10">
                                          <TableCell className="px-4">
                                             <div className="flex flex-col">
                                                <span className="font-bold text-slate-800 text-xs">{item.productName}</span>
                                                <span className="text-[9px] text-slate-400">{item.sku}</span>
                                             </div>
                                          </TableCell>
                                          <TableCell className="text-right font-bold text-slate-900 text-xs">{item.quantity}</TableCell>
                                          <TableCell className="text-right font-bold text-rose-600 text-xs">{formatCurrency(item.total)}</TableCell>
                                          <TableCell className="pr-4">
                                             <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:text-rose-500" onClick={() => handleRemoveItem(item.id)}>
                                                <X className="h-3.5 w-3.5" />
                                             </Button>
                                          </TableCell>
                                       </TableRow>
                                    ))}
                                    {stagedItems.length === 0 && (
                                       <TableRow>
                                          <TableCell colSpan={4} className="h-20 text-center text-slate-300 text-[10px] font-bold uppercase">Grid is empty</TableCell>
                                       </TableRow>
                                    )}
                                 </TableBody>
                              </Table>
                           </ScrollArea>
                        </div>
                    </div>
                 </CardContent>
              </Card>
           </div>

           {/* SUMMARY PANEL */}
           <div className="lg:col-span-4 space-y-4">
              <Card className="rounded-xl border border-slate-200 shadow-sm bg-white p-6 sticky top-4">
                 <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                    <div className="bg-slate-100 p-2 rounded-lg">
                       <Calculator className="h-4 w-4 text-slate-600" />
                    </div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">Dispatch Summary</h2>
                 </div>

                 <div className="space-y-3.5">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100 border-dashed">
                       <span className="text-xs font-bold text-slate-500 uppercase">Items</span>
                       <span className="font-bold text-slate-900">{stagedItems.length} SKUs</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100 border-dashed">
                       <span className="text-xs font-bold text-slate-500 uppercase">Qty Total</span>
                       <span className="font-bold text-slate-900">{stagedItems.reduce((s, i) => s + i.quantity, 0)} Units</span>
                    </div>
                    <div className="flex justify-between items-center pb-1">
                       <span className="text-xs font-bold text-slate-500 uppercase">Total Value</span>
                       <span className="text-2xl font-bold text-rose-600">{formatCurrency(grandTotal)}</span>
                    </div>
                 </div>

                 <div className="mt-8 space-y-2">
                    <Label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">Dispatch Remarks</Label>
                    <Textarea 
                      value={header.notes} 
                      onChange={(e) => setHeader({...header, notes: e.target.value})} 
                      placeholder="Special handling instructions..." 
                      className="rounded-lg border-slate-200 bg-slate-50/30 h-24 text-xs"
                    />
                 </div>

                 <Button 
                   className="w-full bg-slate-900 hover:bg-black text-white h-12 rounded-xl font-bold text-xs uppercase tracking-wider mt-6 shadow-lg shadow-slate-900/10"
                   disabled={submitting || stagedItems.length === 0}
                   onClick={handleSubmitDispatch}
                 >
                    {submitting ? (
                       <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                       <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    {submitting ? "PROCESSING..." : "AUTHORIZE DISPATCH"}
                 </Button>

                 <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-100 flex gap-2">
                    <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-blue-700 font-semibold leading-relaxed">
                       Quantities will be deducted from your branch stock immediately upon authorization.
                    </p>
                 </div>
              </Card>
           </div>
        </div>
      )}
    </div>
  );
}
