"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  Search, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  MapPin, 
  Package, 
  Calendar, 
  Filter, 
  RefreshCw,
  Archive,
  History,
  TrendingUp,
  FileText,
  AlertTriangle,
  X,
  Loader2
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { Label } from "@/components/ui/label";

// --- PREMIUM LOADER ---
function PremiumLoader({ message = "Loading history..." }: { message?: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in duration-500">
      <div className="relative mb-8 pt-10">
        <div className="h-20 w-20 rounded-full border-4 border-slate-100 border-t-indigo-600 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center mt-10">
           <div className="h-10 w-10 bg-indigo-50 rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-indigo-100">
              <History className="h-5 w-5 text-indigo-600" />
           </div>
        </div>
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-lg font-black text-slate-800 tracking-tight uppercase">{message}</h3>
        <p className="text-slate-400 font-bold text-[9px] tracking-tight animate-pulse">Retrieving stock records...</p>
      </div>
    </div>
  );
}

const MOVEMENT_TYPES = [
  { value: "PURCHASE", label: "Inventory Purchase", icon: Archive },
  { value: "SALE", label: "Point of Sale", icon: TrendingUp },
  { value: "ADJUSTMENT", label: "Stock Adjustment", icon: Filter },
  { value: "TRANSFER_IN", label: "Inbound Transfer", icon: ArrowUpRight },
  { value: "TRANSFER_OUT", label: "Outbound Transfer", icon: ArrowDownRight },
  { value: "RETURN", label: "Customer Return", icon: History },
  { value: "DAMAGE", label: "Damage / Loss", icon: AlertTriangle },
];

export function StockMovementLog() {
  const { 
    products, 
    branches, 
    productsLoading, 
    fetchProducts,
    fetchBranches
  } = usePosData();

  const [movements, setMovements] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Custom Search States
  const [prodSearch, setProdSearch] = useState("");
  const [prodDropdownOpen, setProdDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState({
    branchId: "all",
    productId: "all",
    movementType: "all",
    startDate: "",
    endDate: "",
  });

  const fetchMovements = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = { page: 1, limit: 100 };
      if (filters.branchId !== "all") params.branchId = filters.branchId;
      if (filters.productId !== "all") params.productId = filters.productId;
      if (filters.movementType !== "all") params.movementType = filters.movementType;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const res = await apiClient.get(`${API_BASE}/inventory/movements`, { params });
      setMovements(res.data?.data || []);
      setSummary(res.data?.summary || null);
    } catch (e: any) {
      const backendMessage = e?.response?.data?.message || e?.message || "Failed to load stock audit trail";
      toast.error(backendMessage);
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  }, [filters, toast]);

  useEffect(() => {
    fetchProducts();
    fetchBranches();
  }, [fetchProducts, fetchBranches]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProdDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProd = useMemo(() => {
    const term = prodSearch.toLowerCase();
    if (!term) return products.slice(0, 50);
    return products.filter(p => 
      p.name.toLowerCase().includes(term) || 
      (p.sku && p.sku.toLowerCase().includes(term))
    ).slice(0, 50);
  }, [products, prodSearch]);

  const selectedProdName = products.find(p => p.id === filters.productId)?.name || "";

  const exportCSV = () => {
    if (movements.length === 0) return;
    const headers = ["Timestamp", "Activity", "Product", "Identifier", "Delta", "Prev", "Final", "Location", "Ref", "Operator"];
    const rows = movements.map((m) => [
      new Date(m.created_at).toLocaleString(),
      m.movement_type,
      m.product?.name || "",
      m.product?.sku || "",
      m.quantity_change,
      m.previous_qty,
      m.new_qty,
      m.branch?.name || "",
      m.reference_id || "",
      m.user?.email || "System",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enterprise-stock-audit-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit Exported", { description: "CSV record has been saved safely." });
  };

  const getMovementStyle = (type: string, qty: number) => {
    if (qty > 0) return { color: "text-emerald-600", bg: "bg-emerald-50", icon: <ArrowUpRight className="h-3 w-3" /> };
    if (qty < 0) return { color: "text-rose-600", bg: "bg-rose-50", icon: <ArrowDownRight className="h-3 w-3" /> };
    return { color: "text-slate-500", bg: "bg-slate-50", icon: <Activity className="h-3 w-3" /> };
  };

  if (loading && movements.length === 0) return <PremiumLoader />;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[32px] shadow-sm border border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-4 mb-2">
            <div className="bg-slate-900 p-3 rounded-2xl shadow-xl shadow-slate-200">
              <History className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight ">Stock Movement Log</h1>
              <p className="text-slate-400 font-bold text-[10px] tracking-tight">Detailed history of stock changes</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
           <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
              <Select value={filters.branchId} onValueChange={(v) => setFilters(f => ({...f, branchId: v}))}>
                <SelectTrigger className="w-[180px] h-10 border-none bg-transparent shadow-none focus:ring-0 font-bold text-slate-700 text-xs">
                  <MapPin className="h-3.5 w-3.5 mr-2 text-indigo-500" />
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl shadow-2xl">
                  <SelectItem value="all" className="font-bold text-xs uppercase">All Branches</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              
              <div className="h-6 w-[1px] bg-slate-200" />
              
              <div className="flex items-center gap-2 px-3">
                 <Calendar className="h-3.5 w-3.5 text-slate-400" />
                 <input 
                  type="date"
                  className="bg-transparent border-none text-[10px] font-black text-slate-600 focus:ring-0 outline-none w-28 uppercase"
                  value={filters.startDate}
                  onChange={(e) => setFilters(f => ({...f, startDate: e.target.value}))}
                 />
                 <span className="text-slate-300 text-[10px] font-black">TO</span>
                 <input 
                  type="date"
                  className="bg-transparent border-none text-[10px] font-black text-slate-600 focus:ring-0 outline-none w-28 uppercase"
                  value={filters.endDate}
                  onChange={(e) => setFilters(f => ({...f, endDate: e.target.value}))}
                 />
              </div>
           </div>

           <Button 
            onClick={exportCSV}
            className="rounded-2xl h-12 px-6 bg-slate-900 hover:bg-black text-white font-black text-xs gap-2 shadow-xl shadow-slate-900/10 tracking-widest"
           >
             <Download className="h-4 w-4" /> EXPORT LEDGER
           </Button>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="rounded-[32px] border-none shadow-sm bg-emerald-600 text-white overflow-hidden relative group">
           <CardContent className="p-6">
              <div className="relative z-10">
                <p className="text-[10px] font-bold tracking-widest text-emerald-100/60 mb-1 font-bold">Stock In</p>
                <h3 className="text-3xl font-bold">+{summary?.totalIncrease || 0}</h3>
                <div className="mt-4 flex items-center gap-2">
                   <Badge className="bg-white/20 text-white border-none font-black text-[9px] uppercase tracking-widest">Received</Badge>
                </div>
              </div>
              <ArrowUpRight className="absolute -right-4 -bottom-4 h-32 w-32 text-white/10" />
           </CardContent>
        </Card>

        <Card className="rounded-[32px] border-none shadow-sm bg-rose-600 text-white overflow-hidden relative group">
           <CardContent className="p-6">
              <div className="relative z-10">
                <p className="text-[10px] font-bold tracking-widest text-rose-100/60 mb-1 font-bold">Stock Out</p>
                <h3 className="text-3xl font-bold">-{summary?.totalDecrease || 0}</h3>
                <div className="mt-4 flex items-center gap-2">
                   <Badge className="bg-white/20 text-white border-none font-black text-[9px] uppercase tracking-widest">Removed</Badge>
                </div>
              </div>
              <ArrowDownRight className="absolute -right-4 -bottom-4 h-32 w-32 text-white/10" />
           </CardContent>
        </Card>

        <Card className="rounded-[32px] border-none shadow-sm bg-slate-900 text-white overflow-hidden relative group">
           <CardContent className="p-6">
              <div className="relative z-10">
                <p className="text-[10px] font-bold tracking-widest text-slate-500 mb-1 font-bold">Net Change</p>
                <h3 className="text-3xl font-bold">{(summary?.totalIncrease || 0) - (summary?.totalDecrease || 0)}</h3>
                <div className="mt-4 flex items-center gap-2 text-indigo-400 font-black text-[9px] italic tracking-widest uppercase">
                   <RefreshCw className="h-3 w-3 mr-1" /> Current Trend
                </div>
              </div>
              <Activity className="absolute -right-4 -bottom-4 h-32 w-32 text-white/5" />
           </CardContent>
        </Card>

        <Card className="rounded-[32px] border-none shadow-sm bg-white overflow-hidden relative group border border-slate-100">
           <CardContent className="p-6">
              <div className="relative z-10">
                <p className="text-[10px] font-bold tracking-widest text-slate-400 mb-1 font-bold">Records</p>
                <h3 className="text-3xl font-black text-slate-900 italic">{summary?.count || movements.length}</h3>
                <div className="mt-4 flex items-center gap-2">
                   <Badge variant="outline" className="border-slate-200 text-slate-400 font-black text-[9px] tracking-tight">History</Badge>
                </div>
              </div>
              <Archive className="absolute -right-4 -bottom-4 h-32 w-32 text-slate-50" />
           </CardContent>
        </Card>
      </div>

      {/* SEARCH & DETAILED FILTER BAR */}
      <div className="flex flex-wrap gap-4 items-end bg-slate-50/50 p-6 rounded-[32px] border border-slate-100">
         <div className="flex-1 min-w-[200px] space-y-2">
            <Label className="text-[10px] font-bold tracking-widest text-slate-400 ml-1">Activity Type</Label>
            <Select value={filters.movementType} onValueChange={(v) => setFilters(f => ({...f, movementType: v}))}>
              <SelectTrigger className="h-12 rounded-2xl bg-white border-slate-200 font-black text-slate-700 text-xs shadow-sm ">
                <SelectValue placeholder="All Activities" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all" className="font-black text-[10px] ">All Activity Types</SelectItem>
                {MOVEMENT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-xs font-bold ">
                    <div className="flex items-center gap-2">
                      <t.icon className="h-3.5 w-3.5 text-slate-400" />
                      {t.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
         </div>

         <div className="flex-1 min-w-[350px] space-y-2 relative" ref={dropdownRef}>
            <Label className="text-[10px] font-bold tracking-widest text-slate-400 ml-1">Search Product (SKU/Name)</Label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search SKU or Name..."
                className="h-12 pl-11 rounded-2xl bg-white border-slate-200 font-bold text-slate-700 text-xs shadow-sm"
                value={filters.productId === "all" ? prodSearch : selectedProdName}
                onFocus={() => {
                  setProdDropdownOpen(true);
                  if (filters.productId !== "all") {
                    setFilters(f => ({ ...f, productId: "all" }));
                    setProdSearch("");
                  }
                }}
                onChange={(e) => {
                  setProdSearch(e.target.value);
                  setProdDropdownOpen(true);
                }}
              />
              {filters.productId !== "all" && (
                <button 
                  onClick={() => {
                    setFilters(f => ({ ...f, productId: "all" }));
                    setProdSearch("");
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full"
                >
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              )}
            </div>

            {prodDropdownOpen && (
              <div className="absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                  <button
                    onClick={() => {
                      setFilters(f => ({ ...f, productId: "all" }));
                      setProdDropdownOpen(false);
                      setProdSearch("");
                    }}
                    className="w-full p-4 text-left font-black text-[10px] uppercase text-slate-400 hover:bg-slate-50 border-b border-slate-50 italic"
                  >
                    Global Assets Search
                  </button>
                  {productsLoading ? (
                    <div className="p-4 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-indigo-500" /></div>
                  ) : filteredProd.length === 0 ? (
                    <div className="p-4 text-center text-xs font-black text-slate-400 ">No Matches Found</div>
                  ) : (
                    filteredProd.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setFilters(f => ({ ...f, productId: p.id }));
                          setProdDropdownOpen(false);
                          setProdSearch(p.name);
                        }}
                        className="w-full p-4 text-left hover:bg-slate-50 border-b border-slate-50 last:border-none group transition-colors"
                      >
                         <div className="flex flex-col">
                            <span className="font-black text-slate-800 text-xs uppercase group-hover:text-indigo-600">{p.name}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">SKU: {p.sku || "N/A"}</span>
                         </div>
                      </button>
                    ))
                  )}
              </div>
            )}
         </div>

         <Button 
          variant="outline" 
          onClick={fetchMovements}
          className="h-12 rounded-2xl border-indigo-200 bg-indigo-50/30 text-indigo-600 font-black text-[10px] tracking-widest uppercase hover:bg-indigo-50 px-8 flex items-center gap-2"
         >
           <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
           Refresh
         </Button>
      </div>

      {/* AUDIT TABLE */}
      <Card className="rounded-[40px] border-none shadow-sm overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-slate-50 hover:bg-transparent">
                <TableHead className="p-8 py-5 font-black text-[10px] uppercase tracking-widest text-slate-400 w-[200px]">Timestamp</TableHead>
                <TableHead className="py-5 font-black text-[10px] uppercase tracking-widest text-slate-400">Activity</TableHead>
                <TableHead className="py-5 font-black text-[10px] uppercase tracking-widest text-slate-400">Product</TableHead>
                <TableHead className="py-5 font-black text-[10px] uppercase tracking-widest text-slate-400 text-right">Identifier</TableHead>
                <TableHead className="py-5 font-black text-[10px] uppercase tracking-widest text-slate-400 text-right w-[150px]">Quantity Change</TableHead>
                <TableHead className="py-5 font-black text-[10px] uppercase tracking-widest text-slate-400 text-right">Prev / New</TableHead>
                <TableHead className="py-5 font-black text-[10px] uppercase tracking-widest text-slate-400 text-right p-8">Branch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m, i) => {
                const style = getMovementStyle(m.movement_type, Number(m.quantity_change));
                return (
                  <TableRow key={m.id} className="border-slate-50/50 hover:bg-slate-50/30 transition-colors group">
                    <TableCell className="p-8 py-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-xs">{new Date(m.created_at).toLocaleDateString()}</span>
                        <span className="text-[10px] font-medium text-slate-400 tracking-tight">{new Date(m.created_at).toLocaleTimeString()}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${style.bg} ${style.color} border-none font-black text-[9px] uppercase py-1 px-3 rounded-lg flex items-center w-fit gap-1.5 shadow-sm`}>
                        {style.icon}
                        {m.movement_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                         <div className="h-10 w-10 bg-slate-100 rounded-[14px] flex items-center justify-center font-black text-slate-400 text-xs group-hover:bg-indigo-50 group-hover:text-indigo-400 transition-colors shadow-inner">
                            {m.product?.name?.charAt(0)}
                         </div>
                         <div>
                            <p className="font-black text-slate-800 text-sm italic">{m.product?.name}</p>
                            <span className="text-[10px] font-bold text-slate-400 ">Ref: {m.reference_id?.slice(0, 8) || "—"}</span>
                         </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-black text-slate-400 text-[10px] ">
                      {m.product?.sku || "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                       <div className={`p-2 rounded-xl border inline-flex items-center justify-end gap-2 ${style.bg} ${style.color} border-current/10 ml-auto w-24`}>
                          <span className="font-black text-xs">{Number(m.quantity_change) > 0 ? "+" : ""}{m.quantity_change}</span>
                       </div>
                    </TableCell>
                    <TableCell className="text-right">
                       <div className="flex flex-col items-end">
                          <span className="text-xs font-black text-slate-800 tracking-tight italic">{m.new_qty} Units</span>
                          <span className="text-[9px] font-bold text-slate-400 tracking-tight">Was {m.previous_qty}</span>
                       </div>
                    </TableCell>
                    <TableCell className="p-8 py-6 text-right">
                       <div className="inline-flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                          <MapPin className="h-3 w-3 text-indigo-500" />
                          <span className="text-xs font-black text-slate-700 tracking-tight ">{m.branch?.name || "Warehouse"}</span>
                       </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {movements.length === 0 && !loading && (
             <div className="p-32 flex flex-col items-center justify-center text-center space-y-6">
                <div className="h-24 w-24 bg-slate-50 rounded-[40px] flex items-center justify-center shadow-inner">
                   <Archive className="h-10 w-10 text-slate-200" />
                </div>
                <div className="space-y-1">
                   <h4 className="text-sm font-black text-slate-400 tracking-tight">No records found</h4>
                   <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Try changing your filters or dates.</p>
                </div>
             </div>
          )}
        </CardContent>
      </Card>
      
      {/* AUDIT FOOTER */}
      <div className="flex justify-between items-center px-4 pt-2">
         <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">System Node: {filters.branchId === "all" ? "Main System" : `Branch Node-${filters.branchId.slice(0, 6)}`}</p>
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
               <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
               <span className="text-[10px] font-black text-slate-700 tracking-widest  shadow-sm">Data Updated</span>
            </div>
         </div>
      </div>
    </div>
  );
}
