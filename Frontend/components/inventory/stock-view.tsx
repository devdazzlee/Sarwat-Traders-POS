"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  RefreshCw, 
  Package, 
  MapPin, 
  Filter, 
  ArrowUpDown, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  TrendingDown,
  LayoutGrid,
  ClipboardList,
  Database,
  ArrowRight
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/page-loader";
import { usePosData } from "@/hooks/use-pos-data";
import { cn } from "@/lib/utils";

// --- PROFESSIONAL KPI CARD ---
function KpiCard({ title, value, icon: Icon, color, description }: any) {
  const colorMap: any = {
    blue: "from-blue-500 to-indigo-600 shadow-blue-100",
    amber: "from-amber-400 to-orange-500 shadow-amber-100",
    green: "from-emerald-500 to-green-600 shadow-emerald-100",
    rose: "from-rose-500 to-red-600 shadow-rose-100",
    slate: "from-slate-600 to-slate-800 shadow-slate-100"
  };

  const isLoading = value === undefined || value === null;

  return (
    <Card className="overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300 group">
      <CardContent className="p-0">
        <div className={cn("p-6 flex items-start justify-between text-white bg-gradient-to-br", colorMap[color])}>
          <div className="space-y-1 w-full">
            <p className="text-xs font-black uppercase tracking-widest opacity-80">{title}</p>
            {isLoading ? (
               <div className="h-9 w-24 bg-white/20 animate-pulse rounded-lg mt-1" />
            ) : (
               <h3 className="text-3xl font-black tracking-tight">{value}</h3>
            )}
            <p className="text-[10px] font-medium opacity-70 mt-1">{description}</p>
          </div>
          <div className="p-3 bg-white/20 backdrop-blur-md rounded-xl group-hover:scale-110 transition-transform duration-500 flex-shrink-0">
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
        <div className="h-1 bg-slate-100">
           <div className={cn("h-full bg-gradient-to-r", colorMap[color])} style={{ width: '100%' }} />
        </div>
      </CardContent>
    </Card>
  );
}

export function StockView() {
  const { 
    branches, 
    categories, 
    branchesLoading, 
    categoriesLoading,
    fetchBranches,
    fetchCategories
  } = usePosData();

  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [branchFilter, setBranchFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("current_quantity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage] = useState(25);

  const fetchStocks = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const params: any = { 
        page: currentPage, 
        limit: itemsPerPage,
        branchId: branchFilter === "all" ? "" : branchFilter,
        categoryId: categoryFilter === "all" ? "" : categoryFilter,
        search: search.trim()
      };
      
      const res = await apiClient.get(`${API_BASE}/stock`, { params });
      setStocks(res.data?.data || []);
      setTotalPages(res.data?.meta?.totalPages || 1);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to synchronize stock ledger");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchFilter, categoryFilter, search, currentPage, itemsPerPage]);

  useEffect(() => {
    fetchStocks();
    fetchBranches();
    fetchCategories();
  }, [fetchStocks, fetchBranches, fetchCategories]);

  const handleRefresh = () => {
    setCurrentPage(1);
    fetchStocks(true);
    toast.success("Synchronizing inventory...");
  };

  const sortedStocks = useMemo(() => {
    return [...stocks].sort((a, b) => {
      let valA, valB;
      
      switch(sortField) {
        case 'product': valA = a.product?.name || ""; valB = b.product?.name || ""; break;
        case 'branch': valA = a.branch?.name || ""; valB = b.branch?.name || ""; break;
        case 'quantity': valA = Number(a.current_quantity); valB = Number(b.current_quantity); break;
        default: valA = a.current_quantity; valB = b.current_quantity;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [stocks, sortField, sortOrder]);

  const stats = useMemo(() => {
    const totalItems = stocks.reduce((acc, s) => acc + Number(s.current_quantity || 0), 0);
    const lowStock = stocks.filter(s => {
      const qty = Number(s.current_quantity || 0);
      const min = Number(s.product?.min_qty || 0);
      return qty > 0 && qty <= min;
    }).length;
    const outOfStock = stocks.filter(s => Number(s.current_quantity || 0) <= 0).length;
    
    return { totalItems, lowStock, outOfStock };
  }, [stocks]);

  const getStatusDisplay = (s: any) => {
    const qty = Number(s.current_quantity || 0);
    const min = Number(s.product?.min_qty || 0);

    if (qty <= 0) return {
      label: "Out of Stock",
      color: "bg-rose-50 text-rose-700 border-rose-100",
      icon: XCircle
    };
    if (qty <= min) return {
      label: "Low Stock",
      color: "bg-amber-50 text-amber-700 border-amber-100",
      icon: AlertTriangle
    };
    return {
      label: "Healthy",
      color: "bg-emerald-50 text-emerald-700 border-emerald-100",
      icon: CheckCircle2
    };
  };

  const exportCSV = () => {
    const headers = ["Product", "SKU", "Branch", "Category", "Quantity", "Status"];
    const rows = stocks.map((s) => {
      const status = getStatusDisplay(s).label;
      return [
        s.product?.name || "",
        s.product?.sku || "",
        s.branch?.name || "",
        s.product?.category?.name || "N/A",
        s.current_quantity,
        status,
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enterprise-stock-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV Ledger Exported Successfully");
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
      
      {/* HEADER & MAIN ACTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-100 rotate-3 group-hover:rotate-0 transition-transform">
                <LayoutGrid className="h-6 w-6 text-white" />
             </div>
             <h1 className="text-3xl font-black text-slate-900 tracking-tight">Stock by Location</h1>
          </div>
          <p className="text-slate-500 font-medium flex items-center gap-2 pl-1">
            <Database className="h-4 w-4 text-slate-400" />
            Live Enterprise Inventory Distribution Network
          </p>
        </div>

        <div className="flex items-center gap-3">
           <Button 
            variant="outline" 
            onClick={handleRefresh} 
            disabled={refreshing}
            className="h-12 px-6 rounded-xl border-slate-200 bg-white shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
           >
             <RefreshCw className={cn("h-4 w-4 mr-2 text-indigo-500", refreshing && "animate-spin")} />
             Sync Ledger
           </Button>
           <Button 
            onClick={exportCSV} 
            className="h-12 px-6 rounded-xl bg-slate-900 text-white shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-95 transition-all"
           >
             <Download className="h-4 w-4 mr-2" />
             Export CSV
           </Button>
        </div>
      </div>

      {/* KPI DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 hidden" /> {/* Pre-load classes */}
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 hidden" />
        <div className="bg-gradient-to-br from-rose-500 to-red-600 hidden" />
        
        <KpiCard title="Total Inventory Units" value={loading ? undefined : stats.totalItems.toLocaleString()} icon={Package} color="blue" description="cumulative items across all nodes" />
        <KpiCard title="Low Stock Alerts" value={loading ? undefined : stats.lowStock} icon={AlertTriangle} color="amber" description="units below critical threshold" />
        <KpiCard title="Deficit (Out of Stock)" value={loading ? undefined : stats.outOfStock} icon={XCircle} color="rose" description="unfulfilled product variants" />
      </div>

      {/* FILTER PANEL */}
      <Card className="border-none shadow-sm overflow-hidden bg-white/60 backdrop-blur-md">
        <CardContent className="p-6">
          <div className="flex flex-col xl:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1 group">
               <div className="absolute left-4 top-1/2 -translate-y-1/2 p-1 rounded-md bg-slate-50 group-focus-within:bg-indigo-50 transition-colors">
                  <Search className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
               </div>
               <Input
                 placeholder="Search by product name or SKU..."
                 value={search}
                 onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                 className="pl-14 h-14 bg-white border-slate-100 rounded-2xl focus:ring-indigo-500 shadow-sm transition-all"
               />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full xl:w-auto">
              {/* Branch Filter */}
              <div className="min-w-[200px]">
                <Select
                  value={branchFilter}
                  onValueChange={(v) => { setBranchFilter(v); setCurrentPage(1); }}
                >
                  <SelectTrigger className="h-14 bg-white border-slate-100 rounded-2xl shadow-sm focus:ring-indigo-500">
                    <div className="flex items-center gap-3">
                       <MapPin className="h-4 w-4 text-indigo-500" />
                       <SelectValue placeholder="All Locations" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-100">
                    <SelectItem value="all" className="py-3">Global (All Locations)</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="py-3">{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category Filter */}
              <div className="min-w-[200px]">
                 <Select
                  value={categoryFilter}
                  onValueChange={(v) => { setCategoryFilter(v); setCurrentPage(1); }}
                >
                  <SelectTrigger className="h-14 bg-white border-slate-100 rounded-2xl shadow-sm focus:ring-indigo-500">
                    <div className="flex items-center gap-3">
                       <Filter className="h-4 w-4 text-emerald-500" />
                       <SelectValue placeholder="All Categories" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-100">
                    <SelectItem value="all" className="py-3">Entire Catalog</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="py-3">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* STOCK TABLE */}
      <Card className="border-none shadow-sm overflow-hidden bg-white">
        <CardHeader className="p-8 pb-0">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl font-black flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-indigo-500" />
                Inventory Distribution Ledger
              </CardTitle>
              <CardDescription className="font-medium text-slate-500">Dynamic overview of stock density across the supply chain.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm shadow-slate-50">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="py-6 pl-8">
                    <Button variant="ghost" className="p-0 hover:bg-transparent font-black uppercase text-[10px] tracking-widest text-slate-500" onClick={() => toggleSort('product')}>
                      Product Entity <ArrowUpDown className="ml-2 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 py-6">Unique SKU</TableHead>
                  <TableHead className="py-6">
                    <Button variant="ghost" className="p-0 hover:bg-transparent font-black uppercase text-[10px] tracking-widest text-slate-500" onClick={() => toggleSort('branch')}>
                      Branch Node <ArrowUpDown className="ml-2 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="py-6 text-center">
                    <Button variant="ghost" className="p-0 mx-auto hover:bg-transparent font-black uppercase text-[10px] tracking-widest text-slate-500" onClick={() => toggleSort('quantity')}>
                      Density <ArrowUpDown className="ml-2 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 py-6 text-center">Node Safety</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 py-6 text-right pr-8">Intel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                     <TableCell colSpan={6} className="h-96">
                        <PageLoader message="Decrypting Stock Distribution..." />
                     </TableCell>
                  </TableRow>
                ) : stocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                       <div className="space-y-3">
                          <Package className="h-10 w-10 text-slate-100 mx-auto" />
                          <p className="text-slate-400 font-bold tracking-tight italic">No inventory nodes matching criteria.</p>
                       </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedStocks.map((s) => {
                    const status = getStatusDisplay(s);
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={s.id} className="border-slate-50 hover:bg-slate-50/50 transition-colors group">
                        <TableCell className="pl-8 py-6">
                           <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 font-bold group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                 {s.product?.name?.charAt(0) || 'P'}
                              </div>
                              <div className="flex flex-col">
                                 <span className="font-black text-slate-800 text-sm tracking-tight">{s.product?.name}</span>
                                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.product?.category?.name || 'General Product'}</span>
                              </div>
                           </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px] text-slate-500 border-slate-100 px-2 py-0.5">
                            {s.product?.sku}
                          </Badge>
                        </TableCell>
                        <TableCell>
                           <div className="flex items-center gap-2">
                              <MapPin className="h-3 w-3 text-slate-300" />
                              <span className="text-sm font-bold text-slate-600">{s.branch?.name}</span>
                           </div>
                        </TableCell>
                        <TableCell className="text-center">
                           <div className="inline-flex items-center justify-center min-w-[60px] h-9 px-3 rounded-lg bg-slate-50 border border-slate-100 font-black text-slate-800 text-sm">
                              {Number(s.current_quantity || 0).toLocaleString()}
                           </div>
                        </TableCell>
                        <TableCell className="text-center">
                           <Badge className={cn("px-3 py-1.5 rounded-xl border font-black uppercase text-[9px] tracking-widest gap-2", status.color)}>
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                           </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-8">
                           <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100">
                              <ArrowRight className="h-4 w-4" />
                           </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* PAGINATION PANEL */}
          {totalPages > 1 && (
             <div className="mt-8 flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-xs font-bold text-slate-500 pl-4 uppercase tracking-widest">
                  Page <span className="text-indigo-600">{currentPage}</span> of {totalPages}
                </p>
                <div className="flex gap-2 pr-2">
                   <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="h-10 px-6 rounded-xl border-slate-200 font-bold active:scale-95"
                   >
                     Previous
                   </Button>
                   <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="h-10 px-6 rounded-xl bg-slate-900 text-white border-none hover:bg-slate-800 font-bold active:scale-95"
                   >
                     Next Page
                   </Button>
                </div>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
