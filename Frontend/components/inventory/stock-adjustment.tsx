"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { 
  Edit, 
  Loader2, 
  Plus, 
  Search, 
  MapPin, 
  Package, 
  ClipboardCheck, 
  History, 
  ArrowRightLeft, 
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Download,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Info,
  X
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { usePosData } from "@/hooks/use-pos-data";

// --- PROFESSIONAL LOADER ---
function ProfessionalLoader({ message = "Loading Adjustment Ledger..." }: { message?: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
      <div className="h-12 w-12 rounded-full border-4 border-slate-100 border-t-indigo-600 animate-spin mb-4" />
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{message}</h3>
    </div>
  );
}

export function StockAdjustment() {
  const { 
    products, 
    branches, 
    productsLoading, 
    fetchProducts,
    fetchBranches
  } = usePosData();

  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Custom Search Dropdown States
  const [searchTerm, setSearchTerm] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    productId: "",
    branchId: "",
    adjustmentType: "RECONCILIATION" as any,
    adjustmentCategory: "CORRECTION" as any,
    physicalCount: "",
    changeQuantity: "",
    referenceNo: "",
    reason: "",
  });

  const fetchAdjustments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`${API_BASE}/stock-adjustments`, {
        params: { page: 1, limit: 100 },
      });
      setAdjustments(res.data?.data || []);
    } catch (e: any) {
      toast({
        title: "Sync Error",
        description: e?.response?.data?.message || "Failed to load adjustment history",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  }, [toast]);

  const fetchStockLevels = useCallback(async () => {
    try {
      const sRes = await apiClient.get(`${API_BASE}/stock`, { params: { limit: 1000 } });
      const stockList = sRes.data?.data || [];
      const map: Record<string, number> = {};
      stockList.forEach((s: any) => {
        map[`${s.product_id}-${s.branch_id}`] = Number(s.current_quantity || 0);
      });
      setStocks(map);
    } catch (e) {
      console.error("Failed to fetch stock levels", e);
    }
  }, []);

  useEffect(() => {
    fetchAdjustments();
    fetchStockLevels();
    fetchProducts();
    fetchBranches();
  }, [fetchAdjustments, fetchStockLevels, fetchProducts, fetchBranches]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProductDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return products.slice(0, 50);
    return products.filter(p => 
      p.name.toLowerCase().includes(term) || 
      (p.sku && p.sku.toLowerCase().includes(term))
    ).slice(0, 50);
  }, [products, searchTerm]);

  const selectedProduct = useMemo(() => 
    products.find(p => p.id === form.productId),
    [products, form.productId]
  );

  const systemQty = useMemo(() => {
    if (form.productId && form.branchId) {
      return stocks[`${form.productId}-${form.branchId}`] ?? 0;
    }
    return 0;
  }, [form.productId, form.branchId, stocks]);

  const difference = useMemo(() => {
    if (form.adjustmentType === 'RECONCILIATION') {
       if (form.physicalCount === "") return null;
       return Number(form.physicalCount) - systemQty;
    } else if (form.adjustmentType === 'ADDITION') {
       return Number(form.changeQuantity || 0);
    } else {
       return -Math.abs(Number(form.changeQuantity || 0));
    }
  }, [form.adjustmentType, form.physicalCount, form.changeQuantity, systemQty]);

  const handleSubmit = async () => {
    if (!form.productId || !form.branchId) {
      toast({ title: "Validation Error", description: "Product and Branch are required", variant: "destructive" });
      return;
    }

    const payload: any = {
      productId: form.productId,
      branchId: form.branchId,
      systemQuantity: systemQty,
      adjustmentType: form.adjustmentType,
      adjustmentCategory: form.adjustmentCategory,
      reason: form.reason || `${form.adjustmentType} via POS Portal`,
      referenceNo: form.referenceNo,
    };

    if (form.adjustmentType === 'RECONCILIATION') {
       if (form.physicalCount === "") {
          toast({ title: "Missing Count", description: "Physical count is required for reconciliation", variant: "destructive" });
          return;
       }
       payload.physicalCount = Number(form.physicalCount);
    } else {
       if (form.changeQuantity === "") {
          toast({ title: "Missing Quantity", description: "Change quantity is required", variant: "destructive" });
          return;
       }
       payload.changeQuantity = Number(form.changeQuantity);
    }

    try {
      setSubmitting(true);
      await apiClient.post(`${API_BASE}/stock-adjustments`, payload);
      toast.success("Inventory record successfully synchronized.");
      setDialogOpen(false);
      setForm({
         productId: "", branchId: "", adjustmentType: "RECONCILIATION", 
         adjustmentCategory: "CORRECTION", physicalCount: "", changeQuantity: "", 
         referenceNo: "", reason: "" 
      });
      setSearchTerm("");
      fetchAdjustments();
      fetchStockLevels();
    } catch (e: any) {
      const backendMessage = e?.response?.data?.message || e?.message || "Failed to execute stock adjustment";
      toast.error(backendMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const exportCSV = () => {
    if (adjustments.length === 0) return;
    const headers = ["Date", "Product", "Branch", "Type", "Category", "System Qty", "Change/Phys", "Difference", "Staff", "Reason"];
    const rows = adjustments.map(a => [
      new Date(a.adjustment_date).toLocaleString(),
      a.product?.name || "",
      a.branch?.name || "",
      a.adjustment_type,
      a.adjustment_category,
      a.system_quantity,
      a.adjustment_type === 'RECONCILIATION' ? a.physical_count : a.change_quantity,
      a.difference,
      a.user?.email || "N/A",
      a.reason || ""
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-adjustments-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const stats = useMemo(() => {
    const totalCount = adjustments.length;
    let shrink = 0;
    let gain = 0;
    adjustments.forEach(a => {
       const diff = Number(a.difference);
       if (diff < 0) shrink += Math.abs(diff);
       else gain += diff;
    });
    return { totalCount, shrink: shrink.toFixed(2), gain: gain.toFixed(2) };
  }, [adjustments]);

  if (loading && adjustments.length === 0) return <ProfessionalLoader />;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      
      {/* PROFESSIONAL HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-2xl font-black text-slate-800 tracking-tight">STOCK ADJUSTMENTS</h1>
           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5 italic">Physical Inventory Reconciliation & Operational Correction Ledger</p>
        </div>

        <div className="flex items-center gap-3">
           <Button variant="outline" onClick={exportCSV} className="border-slate-200 h-10 font-bold text-xs gap-2 text-slate-600 shadow-sm">
             <Download className="h-4 w-4" /> Export CSV
           </Button>

           <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-2 shadow-lg shadow-blue-200 tracking-wider">
                  <Plus className="h-4 w-4" /> NEW ADJUSTMENT
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl p-0 overflow-hidden border-none shadow-2xl rounded-2xl">
                <DialogHeader className="p-6 bg-slate-900 border-b border-slate-800">
                  <DialogTitle className="text-white text-lg font-black tracking-tight">INVENTORY CORRECTION FORM</DialogTitle>
                  <DialogDescription className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Submit formal stock level adjustments and audit notes</DialogDescription>
                </DialogHeader>
                
                <div className="p-6 space-y-6 bg-white overflow-y-auto max-h-[80vh]">
                   <div className="grid grid-cols-2 gap-4">
                      {/* PRODUCT SEARCH */}
                      <div className="space-y-1.5 relative" ref={dropdownRef}>
                         <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Asset Selection</Label>
                         <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input 
                              placeholder="Search SKU or Name..."
                              className="h-10 pl-9 rounded-xl border-slate-100 bg-slate-50 font-bold text-slate-700 text-xs"
                              value={form.productId ? selectedProduct?.name : searchTerm}
                              onFocus={() => {
                                setProductDropdownOpen(true);
                                if (form.productId) {
                                  setSearchTerm("");
                                  setForm(f => ({ ...f, productId: "" }));
                                }
                              }}
                              onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setProductDropdownOpen(true);
                              }}
                            />
                            {form.productId && (
                              <button 
                                onClick={() => {
                                  setForm(f => ({ ...f, productId: "" }));
                                  setSearchTerm("");
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2"
                              >
                                <X className="h-4 w-4 text-slate-400" />
                              </button>
                            )}
                         </div>

                         {productDropdownOpen && (
                            <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-100 bg-white shadow-xl">
                               {filteredProducts.length === 0 ? (
                                  <div className="p-3 text-center text-[10px] text-slate-400 font-bold uppercase">No Products Found</div>
                               ) : (
                                  filteredProducts.map(p => (
                                    <button
                                      key={p.id}
                                      onClick={() => {
                                        setForm(f => ({ ...f, productId: p.id }));
                                        setProductDropdownOpen(false);
                                        setSearchTerm(p.name);
                                      }}
                                      className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b last:border-none border-slate-50"
                                    >
                                       <span className="block font-bold text-slate-800 text-[11px] uppercase truncate">{p.name}</span>
                                       <span className="block text-[9px] font-medium text-slate-400 uppercase">SKU: {p.sku || "N/A"}</span>
                                    </button>
                                  ))
                               )}
                            </div>
                         )}
                      </div>

                      <div className="space-y-1.5">
                         <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Operation Branch</Label>
                         <Select value={form.branchId} onValueChange={(v) => setForm(f => ({...f, branchId: v}))}>
                           <SelectTrigger className="h-10 rounded-xl border-slate-100 bg-slate-50 text-xs font-bold">
                             <SelectValue placeholder="Select Branch" />
                           </SelectTrigger>
                           <SelectContent>
                             {branches.map(b => <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>)}
                           </SelectContent>
                         </Select>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                         <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Adjustment Type</Label>
                         <Select value={form.adjustmentType} onValueChange={(v) => setForm(f => ({...f, adjustmentType: v}))}>
                            <SelectTrigger className="h-10 rounded-xl border-slate-100 bg-slate-100/50 text-xs font-bold">
                               <SelectValue placeholder="Select Type" />
                            </SelectTrigger>
                            <SelectContent>
                               <SelectItem value="RECONCILIATION">Reconciliation (Reset)</SelectItem>
                               <SelectItem value="ADDITION">Addition (+)</SelectItem>
                               <SelectItem value="SUBTRACTION">Subtraction (-)</SelectItem>
                            </SelectContent>
                         </Select>
                      </div>

                      <div className="space-y-1.5">
                         <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Operational Category</Label>
                         <Select value={form.adjustmentCategory} onValueChange={(v) => setForm(f => ({...f, adjustmentCategory: v}))}>
                            <SelectTrigger className="h-10 rounded-xl border-slate-100 bg-slate-100/50 text-xs font-bold text-blue-600">
                               <SelectValue placeholder="Select Category" />
                            </SelectTrigger>
                            <SelectContent>
                               <SelectItem value="CORRECTION">Standard Correction</SelectItem>
                               <SelectItem value="DAMAGE">Damaged / Broken</SelectItem>
                               <SelectItem value="EXPIRED">Expired Stock</SelectItem>
                               <SelectItem value="THEFT">Missing / Theft</SelectItem>
                               <SelectItem value="RETURN_TO_SUPPLIER">Return to Supplier</SelectItem>
                               <SelectItem value="ADMINISTRATIVE">Administrative Change</SelectItem>
                            </SelectContent>
                         </Select>
                      </div>
                   </div>

                   <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 grid grid-cols-2 gap-6 items-center">
                       <div className="space-y-0.5">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Current System Qty</p>
                          <h4 className="text-xl font-black text-slate-900 tracking-tighter">{form.productId && form.branchId ? systemQty : "—"} <span className="text-[10px] text-slate-400 font-bold uppercase">Units</span></h4>
                       </div>
                       
                       <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase text-blue-600">
                             {form.adjustmentType === 'RECONCILIATION' ? 'New Physical Count' : 'Quantity Change'}
                          </Label>
                          <Input 
                            type="number"
                            className="h-10 rounded-xl border-blue-100 bg-white shadow-sm text-sm font-black text-blue-600 text-center"
                            placeholder="0"
                            value={form.adjustmentType === 'RECONCILIATION' ? form.physicalCount : form.changeQuantity}
                            onChange={(e) => {
                               if (form.adjustmentType === 'RECONCILIATION') setForm(f => ({...f, physicalCount: e.target.value}));
                               else setForm(f => ({...f, changeQuantity: e.target.value}));
                            }}
                          />
                       </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                         <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reference / Batch ID</Label>
                         <Input 
                           className="h-10 rounded-xl border-slate-100 bg-slate-50/50 text-xs font-bold italic"
                           placeholder="REF-XXXXX"
                           value={form.referenceNo}
                           onChange={(e) => setForm(f => ({...f, referenceNo: e.target.value}))}
                         />
                      </div>
                      
                      <div className="space-y-1.5 opacity-60">
                         <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Stock Variance</Label>
                         <div className={`h-10 rounded-xl flex items-center px-4 font-black text-xs uppercase tracking-tight ${Number(difference) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {difference !== null ? (
                               <>{difference > 0 ? "+" : ""}{difference} Units</>
                            ) : "Pending Input"}
                         </div>
                      </div>
                   </div>

                   <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Internal Remarks / Reason</Label>
                      <Textarea 
                        className="rounded-xl border-slate-100 bg-slate-50/30 text-xs text-slate-600 min-h-[60px] resize-none"
                        placeholder="Detailed explanation for audit log..."
                        value={form.reason}
                        onChange={(e) => setForm(f => ({...f, reason: e.target.value}))}
                      />
                   </div>

                   <Button onClick={handleSubmit} disabled={submitting} className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-[0.1em] shadow-lg shadow-blue-200">
                      {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "SUBMIT ADJUSTMENT"}
                   </Button>
                </div>
              </DialogContent>
           </Dialog>
        </div>
      </div>

      {/* COMPACT KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card className="rounded-2xl border-none shadow-sm bg-white p-5 border border-slate-100">
             <div className="flex items-center gap-4">
                <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600"><History className="h-5 w-5" /></div>
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Audit Cycles</p>
                   <h3 className="text-xl font-black text-slate-800">{stats.totalCount}</h3>
                </div>
             </div>
          </Card>
          <Card className="rounded-2xl border-none shadow-sm bg-white p-5 border border-slate-100">
             <div className="flex items-center gap-4">
                <div className="bg-rose-50 p-3 rounded-xl text-rose-600"><TrendingDown className="h-5 w-5" /></div>
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inventory Shrinkage</p>
                   <h3 className="text-xl font-black text-rose-600">-{stats.shrink}</h3>
                </div>
             </div>
          </Card>
          <Card className="rounded-2xl border-none shadow-sm bg-white p-5 border border-slate-100">
             <div className="flex items-center gap-4">
                <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600"><TrendingUp className="h-5 w-5" /></div>
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Procedural Gains</p>
                   <h3 className="text-xl font-black text-emerald-600">+{stats.gain}</h3>
                </div>
             </div>
          </Card>
      </div>

      {/* PROFESSIONAL HISTORY TABLE */}
      <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white border border-slate-100">
        <div className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="px-6 py-4 font-black text-[9px] uppercase tracking-widest text-slate-500">Execution Date</TableHead>
                <TableHead className="py-4 font-black text-[9px] uppercase tracking-widest text-slate-500">Adjustment SKU / Item</TableHead>
                <TableHead className="py-4 font-black text-[9px] uppercase tracking-widest text-slate-500">Location</TableHead>
                <TableHead className="py-4 font-black text-[9px] uppercase tracking-widest text-slate-500">Type / Category</TableHead>
                <TableHead className="py-4 font-black text-[9px] uppercase tracking-widest text-slate-500 text-right">Variance</TableHead>
                <TableHead className="py-4 font-black text-[9px] uppercase tracking-widest text-slate-500 text-right">Audit Status / Remarks</TableHead>
                <TableHead className="px-6 py-4 font-black text-[9px] uppercase tracking-widest text-slate-500 text-right">Staff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustments.map((a) => {
                const isLoss = Number(a.difference) < 0;
                return (
                  <TableRow key={a.id} className="border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <TableCell className="px-6 py-4">
                       <div className="flex flex-col">
                          <span className="font-bold text-slate-700 text-xs">{new Date(a.adjustment_date).toLocaleDateString()}</span>
                          <span className="text-[9px] font-medium text-slate-400 uppercase">{new Date(a.adjustment_date).toLocaleTimeString()}</span>
                       </div>
                    </TableCell>
                    <TableCell className="py-4">
                       <div className="flex flex-col">
                          <span className="font-bold text-slate-800 text-xs truncate max-w-[150px] uppercase">{a.product?.name}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{a.product?.sku}</span>
                       </div>
                    </TableCell>
                    <TableCell className="py-4">
                       <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 text-[10px] font-black text-slate-600 uppercase italic">
                          <MapPin className="h-2.5 w-2.5 text-indigo-500" /> {a.branch?.name}
                       </span>
                    </TableCell>
                    <TableCell className="py-4">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{a.adjustment_type}</span>
                          <span className={`text-[9px] font-bold uppercase italic ${a.adjustment_category === 'DAMAGE' ? 'text-rose-500' : 'text-blue-500'}`}>{a.adjustment_category}</span>
                       </div>
                    </TableCell>
                    <TableCell className="py-4 text-right">
                       <div className={`font-black text-xs ${isLoss ? "text-rose-500" : "text-emerald-500"}`}>
                          {Number(a.difference) > 0 ? "+" : ""}{a.difference}
                       </div>
                       <div className="text-[9px] font-bold text-slate-300 uppercase">Total: {a.physical_count ?? a.change_quantity}</div>
                    </TableCell>
                    <TableCell className="py-4 text-right max-w-[180px]">
                       <div className="flex items-center justify-end gap-1.5 text-[10px] font-medium text-slate-500 italic truncate">
                          {a.reason || "Automatic Policy Adjust"}
                       </div>
                       {a.reference_no && <div className="text-[9px] font-black text-slate-400 uppercase opacity-50"># {a.reference_no}</div>}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                       <span className="text-[10px] font-black text-slate-600 uppercase italic border-b border-slate-200 pb-1">{a.user?.email?.split('@')[0] || "Operator"}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {adjustments.length === 0 && !loading && (
             <div className="p-20 flex flex-col items-center justify-center text-center">
                <History className="h-12 w-12 text-slate-100 mb-4" />
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">No matching history found</h4>
             </div>
          )}
        </div>
      </Card>

      <div className="flex justify-between items-center px-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">
         <span>System Integrity: Verified</span>
         <span className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm" /> Operational Nodes Online
         </span>
      </div>
    </div>
  );
}
