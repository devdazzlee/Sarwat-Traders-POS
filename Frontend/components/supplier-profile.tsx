"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Package,
  Phone,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  TrendingUp,
  Wallet,
  FileSpreadsheet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";
import { SupplierLedger } from "@/components/supplier-ledger";

type PaymentStatus = "PAID" | "PARTIAL" | "DUE" | "ADVANCE" | "NONE";

interface SupplierProfileProps {
  supplierId: string;
  onBack: () => void;
  initialTab?: string;
}

const money = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const statusBadge = (status: PaymentStatus) => {
  switch (status) {
    case "PAID":
      return { label: "Paid", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    case "PARTIAL":
      return { label: "Partial", className: "bg-amber-100 text-amber-800 border-amber-200" };
    case "DUE":
      return { label: "Due", className: "bg-rose-100 text-rose-800 border-rose-200" };
    case "ADVANCE":
      return { label: "Advance", className: "bg-sky-100 text-sky-800 border-sky-200" };
    default:
      return { label: "No Activity", className: "bg-slate-100 text-slate-700 border-slate-200" };
  }
};

export function SupplierProfile({ supplierId, onBack, initialTab = "ledger" }: SupplierProfileProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [productSearch, setProductSearch] = useState("");
  const [data, setData] = useState<any>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/supplier-ledger/${supplierId}`, {
        params: { limit: 500 },
        headers: { "X-Skip-Offline-Cache": "true" },
      });
      setData(res.data.data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to load supplier profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [supplierId, toast]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const filteredProducts = useMemo(() => {
    const products = data?.productSummary ?? [];
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter(
      (p: any) =>
        p.productName?.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q),
    );
  }, [data, productSearch]);

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        (data.entries ?? []).map((e: any) => ({
          Date: e.date,
          Type: e.type,
          Description: e.description,
          Reference: e.reference_no,
          Debit: e.debit,
          Credit: e.credit,
          Balance: e.balance,
        })),
      ),
      "Ledger",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(data.productSummary ?? []),
      "Products",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(data.purchaseInvoices ?? []),
      "Purchases",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(data.payments ?? []),
      "Payments",
    );
    XLSX.writeFile(wb, `${data.supplier?.name || "supplier"}_ledger.xlsx`);
  };

  if (loading) return <PageLoader message="Loading supplier profile..." />;
  if (!data?.supplier) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-500">Supplier not found</p>
        <Button variant="outline" onClick={onBack}>Back to Suppliers</Button>
      </div>
    );
  }

  const supplier = data.supplier;
  const summary = data.summary ?? {};
  const badge = statusBadge(summary.paymentStatus ?? "NONE");
  const contact = supplier.mobile_number || supplier.phone_number || "—";

  const overviewCards = [
    {
      label: "Total Purchases",
      value: money(summary.purchaseHistoryTotal ?? summary.totalPurchases ?? 0),
      icon: ShoppingCart,
      tone: "text-rose-700 bg-rose-50 border-rose-100",
    },
    {
      label: "Total Paid",
      value: money(summary.totalPayments ?? 0),
      icon: Wallet,
      tone: "text-emerald-700 bg-emerald-50 border-emerald-100",
    },
    {
      label: "Outstanding",
      value: money(summary.balanceDue ?? 0),
      icon: CreditCard,
      tone: "text-amber-700 bg-amber-50 border-amber-100",
    },
    {
      label: "Advance Paid",
      value: money(summary.advanceBalance ?? 0),
      icon: TrendingUp,
      tone: "text-sky-700 bg-sky-50 border-sky-100",
    },
    {
      label: "Products",
      value: String(summary.productCount ?? data.productSummary?.length ?? 0),
      icon: Package,
      tone: "text-indigo-700 bg-indigo-50 border-indigo-100",
    },
    {
      label: "Purchase Orders",
      value: String(summary.purchaseOrderCount ?? 0),
      icon: Receipt,
      tone: "text-violet-700 bg-violet-50 border-violet-100",
    },
  ];

  return (
    <div className="flex flex-col min-h-0 flex-1 bg-slate-100 h-full">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 lg:px-6 py-4 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <Button
                size="sm"
                onClick={onBack}
                className="h-9 shrink-0 gap-1.5 bg-sky-600 text-white hover:bg-sky-700"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900 truncate">{supplier.name}</h1>
                  <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{supplier.code}</span>
                  <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{contact}</span>
                  {supplier.email && <span>{supplier.email}</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setActiveTab("ledger")}>View Ledger</Button>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("products")}>View Products</Button>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("purchases")}>View Purchases</Button>
              <Button variant="outline" size="sm" onClick={exportExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1.5" /> Print
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {overviewCards.map((card) => (
              <div key={card.label} className={cn("rounded-xl border p-3", card.tone)}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{card.label}</p>
                  <card.icon className="h-4 w-4 opacity-70" />
                </div>
                <p className="mt-2 text-lg font-bold tabular-nums">{card.value}</p>
              </div>
            ))}
          </div>

          {(data.trends?.length ?? 0) > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-800 mb-3">Purchase vs Payment Trend</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.trends}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Legend />
                      <Bar dataKey="purchases" name="Purchases" fill="#e11d48" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="payments" name="Payments" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-800 mb-3">Outstanding Balance Trend</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={(data.entries ?? [])
                        .slice()
                        .reverse()
                        .slice(-12)
                        .map((e: any) => ({
                          date: format(new Date(e.date), "dd MMM"),
                          balance: e.balance,
                        }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Line type="monotone" dataKey="balance" stroke="#d97706" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4 lg:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="w-full justify-start overflow-x-auto bg-white border border-slate-200 p-1 h-auto flex-wrap">
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="purchases">Purchase History</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="flex-1 overflow-auto mt-4 data-[state=inactive]:hidden">
            <SupplierLedger supplierId={supplierId} embedded />
          </TabsContent>

          <TabsContent value="products" className="flex-1 overflow-auto mt-4 data-[state=inactive]:hidden">
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <h2 className="font-semibold text-slate-900">Products Purchased</h2>
                <div className="relative max-w-sm w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
                {filteredProducts.length === 0 ? (
                  <p className="col-span-full text-center py-12 text-slate-400">No products found</p>
                ) : (
                  filteredProducts.map((p: any) => (
                    <div key={p.productId} className="rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                      <div className="flex gap-3">
                        <div className="h-16 w-16 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageUrl} alt={p.productName} className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-6 w-6 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 truncate">{p.productName}</p>
                          <p className="text-xs text-slate-500">{p.sku || "No SKU"}</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{money(p.totalAmount)}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <div><span className="text-slate-400">Qty:</span> {money(p.totalQuantity)}</div>
                        <div><span className="text-slate-400">Rate:</span> {money(p.lastRate)}</div>
                        <div className="col-span-2"><span className="text-slate-400">Last purchase:</span> {format(new Date(p.lastPurchaseDate), "dd MMM yyyy")}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="purchases" className="flex-1 overflow-auto mt-4 data-[state=inactive]:hidden">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Purchase Invoices</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs uppercase text-slate-500">Invoice</th>
                      <th className="text-left px-4 py-3 text-xs uppercase text-slate-500">Date</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-slate-500">Amount</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-slate-500">Paid</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-slate-500">Due</th>
                      <th className="text-left px-4 py-3 text-xs uppercase text-slate-500">Status</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.purchaseInvoices ?? []).map((inv: any) => {
                      const st = statusBadge(
                        inv.paymentStatus === "PAID"
                          ? "PAID"
                          : inv.paymentStatus === "PARTIAL"
                            ? "PARTIAL"
                            : "DUE",
                      );
                      return (
                        <tr key={inv.purchaseNumber} className="border-b border-slate-100 hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-mono text-xs">{inv.invoiceRef || inv.purchaseNumber}</td>
                          <td className="px-4 py-3">{format(new Date(inv.purchaseDate), "dd MMM yyyy")}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{money(inv.totalAmount)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{money(inv.paymentMade)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-amber-700">{money(inv.paymentDue)}</td>
                          <td className="px-4 py-3"><Badge variant="outline" className={st.className}>{st.label}</Badge></td>
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" variant="outline" onClick={() => setActiveTab("ledger")}>View</Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="flex-1 overflow-auto mt-4 data-[state=inactive]:hidden">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Payment Records</h2>
                <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setActiveTab("ledger")}>
                  Add Payment
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs uppercase text-slate-500">Date</th>
                      <th className="text-right px-4 py-3 text-xs uppercase text-slate-500">Amount</th>
                      <th className="text-left px-4 py-3 text-xs uppercase text-slate-500">Reference</th>
                      <th className="text-left px-4 py-3 text-xs uppercase text-slate-500">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.payments ?? []).length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400">No payments recorded</td></tr>
                    ) : (
                      (data.payments ?? []).map((p: any) => (
                        <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                          <td className="px-4 py-3">{format(new Date(p.date), "dd MMM yyyy, hh:mm a")}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">{money(p.amount)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{p.referenceNo || p.purchaseId || "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{p.description || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
