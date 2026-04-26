"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Download,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  Search,
  Receipt,
  Phone,
  Mail,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  DollarSign,
  Plus,
  Loader2,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";
import { format } from "date-fns";

interface LedgerEntry {
  id: string;
  date: string;
  type: string;
  description: string;
  reference_no: string | null;
  debit: number;
  credit: number;
  balance: number;
  payment_method: string | null;
}

interface CustomerDetails {
  id: string;
  name: string;
  phone_number: string | null;
  mobile_number: string | null;
  email: string;
  outstanding_balance: number;
  credit_limit: number;
}

interface CustomerLedgerProps {
  customerId: string;
  onBack: () => void;
}

export function CustomerLedger({ customerId, onBack }: CustomerLedgerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalPayments: 0,
    balance: 0,
  });
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const fetchLedgerData = useCallback(async () => {
    setLoading(true);
    try {
      const [custRes, ledgerRes] = await Promise.all([
        apiClient.get(`${API_BASE}/customer/${customerId}`),
        apiClient.get(`${API_BASE}/customer-ledger/${customerId}`, {
          params: {
            limit: 200,
            ...(dateFrom ? { startDate: dateFrom } : {}),
            ...(dateTo ? { endDate: dateTo } : {}),
          },
        }),
      ]);

      setCustomer(custRes.data.data);

      const data = ledgerRes.data.data;
      setEntries(data.entries || []);
      setSummary({
        totalSales: data.summary?.totalSales || 0,
        totalPayments: data.summary?.totalPayments || 0,
        balance: data.summary?.currentBalance || 0,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to load ledger",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [customerId, dateFrom, dateTo, toast]);

  useEffect(() => {
    fetchLedgerData();
  }, [fetchLedgerData]);

  const filteredEntries = entries
    .filter((e) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        e.description.toLowerCase().includes(q) ||
        (e.reference_no || "").toLowerCase().includes(q) ||
        (e.type || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return sortOrder === "desc" ? db - da : da - db;
    });

  const formatDate = (d: string) => {
    try {
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? "—" : format(dt, "dd MMM yyyy");
    } catch {
      return "—";
    }
  };

  const formatTime = (d: string) => {
    try {
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? "" : format(dt, "hh:mm a");
    } catch {
      return "";
    }
  };

  if (loading) return <PageLoader message="Loading ledger..." />;

  const handlePaymentSubmit = async () => {
    if (!paymentAmount || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingPayment(true);
    try {
      await apiClient.post(`${API_BASE}/customer-ledger/${customerId}/payment`, {
        amount: Number(paymentAmount),
        description: paymentDescription,
        referenceNo: selectedEntry?.reference_no || null,
      });

      toast({
        title: "Success",
        description: "Payment recorded successfully",
      });
      setIsPaymentModalOpen(false);
      fetchLedgerData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-500">Customer not found</p>
        <Button variant="outline" onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  const creditUsed = customer.credit_limit > 0
    ? Math.min(100, Math.round((summary.balance / customer.credit_limit) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">{customer.name}</h1>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {customer.phone_number && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Phone className="h-3 w-3" /> {customer.phone_number}
                  </span>
                )}
                {customer.email && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Mail className="h-3 w-3" /> {customer.email}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchLedgerData} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button 
                size="sm" 
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                onClick={() => {
                    setSelectedEntry(null);
                    setPaymentAmount("");
                    setPaymentDescription("Account Payment");
                    setIsPaymentModalOpen(true);
                }}
            >
              <Plus className="h-3.5 w-3.5" /> Receive Payment
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Sales</span>
              <div className="bg-rose-50 p-1.5 rounded-lg">
                <TrendingUp className="h-3.5 w-3.5 text-rose-500" />
              </div>
            </div>
            <div className="text-xl font-black text-slate-900">Rs {summary.totalSales.toLocaleString()}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Credit purchases</div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payments</span>
              <div className="bg-emerald-50 p-1.5 rounded-lg">
                <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
              </div>
            </div>
            <div className="text-xl font-black text-slate-900">Rs {summary.totalPayments.toLocaleString()}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Received from customer</div>
          </div>

          <div className={`rounded-2xl border p-4 shadow-sm ${summary.balance > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold uppercase tracking-wide ${summary.balance > 0 ? "text-amber-600" : "text-emerald-600"}`}>Balance Due</span>
              <div className={`p-1.5 rounded-lg ${summary.balance > 0 ? "bg-amber-100" : "bg-emerald-100"}`}>
                <Wallet className={`h-3.5 w-3.5 ${summary.balance > 0 ? "text-amber-600" : "text-emerald-600"}`} />
              </div>
            </div>
            <div className={`text-xl font-black ${summary.balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              Rs {summary.balance.toLocaleString()}
            </div>
            <div className={`text-[10px] mt-0.5 ${summary.balance > 0 ? "text-amber-500" : "text-emerald-500"}`}>
              {summary.balance > 0 ? "Outstanding receivable" : "Fully paid"}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Credit Limit</span>
              <div className="bg-blue-50 p-1.5 rounded-lg">
                <CreditCard className="h-3.5 w-3.5 text-blue-500" />
              </div>
            </div>
            <div className="text-xl font-black text-slate-900">Rs {Number(customer.credit_limit).toLocaleString()}</div>
            {customer.credit_limit > 0 && (
              <div className="mt-1.5">
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${creditUsed >= 90 ? "bg-red-500" : creditUsed >= 60 ? "bg-amber-400" : "bg-emerald-400"}`}
                    style={{ width: `${creditUsed}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{creditUsed}% used</div>
              </div>
            )}
          </div>
        </div>

        {/* Statement Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table Header / Filters */}
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Receipt className="h-4 w-4 text-blue-500" />
                Statement of Account
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{entries.length} transaction{entries.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar py-1">
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs w-[140px] md:w-[180px] border-slate-200"
                />
              </div>
              
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 text-[11px] border border-slate-200 rounded-md px-2 text-slate-600 bg-white focus:ring-1 focus:ring-blue-500/20 outline-none"
                />
                <span className="text-[10px] font-bold text-slate-300 uppercase">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 text-[11px] border border-slate-200 rounded-md px-2 text-slate-600 bg-white focus:ring-1 focus:ring-blue-500/20 outline-none"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs gap-1 text-slate-500 border-slate-200 shrink-0"
                onClick={() => setSortOrder(o => o === "desc" ? "asc" : "desc")}
              >
                {sortOrder === "desc" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{sortOrder === "desc" ? "Newest" : "Oldest"}</span>
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[130px]">Date & Time</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[150px]">Reference</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[120px]">Debit</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[120px]">Credit</th>
                  <th className="text-right px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[130px]">Balance</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[80px]">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Receipt className="h-8 w-8 opacity-20" />
                        <p className="text-sm font-medium">No transactions found</p>
                        {search && <p className="text-xs">Try clearing the search filter</p>}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry, idx) => (
                    <tr
                      key={entry.id}
                      className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/20"}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-800 text-xs">{formatDate(entry.date)}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{formatTime(entry.date)}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${entry.type === "CREDIT_SALE" ? "bg-rose-400" : "bg-emerald-400"}`} />
                          <div>
                            <div className="font-semibold text-slate-800 text-xs">{entry.description}</div>
                            {entry.payment_method && (
                              <Badge variant="outline" className="mt-0.5 text-[9px] h-4 px-1.5 border-slate-200 text-slate-500 font-bold uppercase">
                                {entry.payment_method.replace("_", " ")}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-[11px] text-blue-600 font-bold">
                          {entry.reference_no || <span className="text-slate-300 font-normal">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {entry.debit > 0 ? (
                          <span className="font-bold text-rose-600 text-xs">Rs {entry.debit.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-200 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {entry.credit > 0 ? (
                          <span className="font-bold text-emerald-600 text-xs">Rs {entry.credit.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-200 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={`font-black text-xs ${entry.balance > 0 ? "text-amber-700" : "text-emerald-600"}`}>
                          Rs {entry.balance.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {entry.type.includes("SALE") && entry.balance > 0 && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-7 px-2 text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-md"
                            onClick={() => {
                                setSelectedEntry(entry);
                                setPaymentAmount(entry.balance.toString());
                                setPaymentDescription(`Payment for ${entry.reference_no}`);
                                setIsPaymentModalOpen(true);
                            }}
                          >
                            Collect
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredEntries.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={3} className="px-5 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide">
                      Totals
                    </td>
                    <td className="px-4 py-3 text-right font-black text-rose-600 text-xs">
                      Rs {filteredEntries.reduce((s, e) => s + e.debit, 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-emerald-600 text-xs">
                      Rs {filteredEntries.reduce((s, e) => s + e.credit, 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right font-black text-amber-700 text-xs text-nowrap">
                      Rs {summary.balance.toLocaleString()}
                    </td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Print footer */}
        <div className="hidden print:block text-center pt-8 border-t border-slate-200 text-xs text-slate-400">
          System-generated statement — Sarwat Trader ERP
        </div>
      </div>

      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Receive Payment
            </DialogTitle>
            <DialogDescription>
              {selectedEntry 
                ? `Recording payment for transaction ${selectedEntry.reference_no}`
                : "Record a general payment to the customer's account balance."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount (Rs)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">Rs</span>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  className="pl-10 h-11 text-lg font-black"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  autoFocus
                />
              </div>
              {selectedEntry && (
                 <p className="text-[10px] text-amber-600 font-bold uppercase tracking-tight">
                    Full balance for this entry: Rs {selectedEntry.balance.toLocaleString()}
                 </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-slate-500">Description / Remarks</Label>
              <Input
                id="description"
                placeholder="e.g., Partial cash payment"
                className="h-10 text-sm"
                value={paymentDescription}
                onChange={(e) => setPaymentDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)} disabled={isSubmittingPayment}>
              Cancel
            </Button>
            <Button 
                onClick={handlePaymentSubmit} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={isSubmittingPayment}
            >
              {isSubmittingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Save Payment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
