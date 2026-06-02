"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Printer,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";
import { format } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface LedgerEntry {
  id: string;
  date: string;
  type: string;
  description: string;
  reference_no: string | null;
  debit: number;
  credit: number;
  balance: number;
  invoiceDue?: number;
  invoicePaid?: number;
  invoiceTotal?: number;
  saleId?: string | null;
  paymentStatus?: string | null;
  isCollectable?: boolean;
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

const money = (n: number) =>
  `Rs ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function entryTypeLabel(type: string) {
  if (type === "CREDIT_SALE") return "Credit Sale";
  if (type === "PAYMENT_RECEIVED") return "Payment";
  if (type === "ADJUSTMENT") return "Adjustment";
  if (type === "REFUND") return "Refund";
  return type.replace(/_/g, " ");
}

/** Positive = customer owes; negative = advance credit stored in DB */
function formatRunningBalance(running: number) {
  if (running > 0) {
    return {
      text: `Rs ${running.toLocaleString()}`,
      className: "text-amber-700",
      hint: "Total amount customer owed on the account after this entry (cumulative, not this invoice only)",
    };
  }
  if (running < 0) {
    return {
      text: `Rs ${Math.abs(running).toLocaleString()} Adv`,
      className: "text-emerald-700",
      hint: "Advance credit after this entry",
    };
  }
  return { text: "Rs 0", className: "text-slate-500", hint: "Settled" };
}

export function CustomerLedger({ customerId, onBack }: CustomerLedgerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalPayments: 0,
    balance: 0,
    balanceDue: 0,
    advanceBalance: 0,
  });
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [paymentSaleKey, setPaymentSaleKey] = useState<string>("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLedgerData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (silent) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const [custRes, ledgerRes] = await Promise.all([
        apiClient.get(`${API_BASE}/customer/${customerId}`, {
          headers: { "X-Skip-Offline-Cache": "true" },
        }),
        apiClient.get(`${API_BASE}/customer-ledger/${customerId}`, {
          params: {
            limit: 200,
            ...(dateFrom ? { startDate: format(dateFrom, "yyyy-MM-dd") } : {}),
            ...(dateTo ? { endDate: format(dateTo, "yyyy-MM-dd") } : {}),
          },
          headers: { "X-Skip-Offline-Cache": "true" },
        }),
      ]);

      setCustomer(custRes.data.data);

      const data = ledgerRes.data.data;
      setEntries(data.entries || []);
      const bal = Number(data.summary?.currentBalance ?? 0);
      setSummary({
        totalSales: data.summary?.totalSales || 0,
        totalPayments: data.summary?.totalPayments || 0,
        balance: bal,
        balanceDue: data.summary?.balanceDue ?? Math.max(0, bal),
        advanceBalance: data.summary?.advanceBalance ?? Math.max(0, -bal),
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to load ledger",
        variant: "destructive",
      });
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setLoading(false);
      }
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

  const openInvoices = useMemo(() => {
    const seen = new Set<string>();
    const list: {
      key: string;
      saleId: string | null;
      reference_no: string;
      invoiceDue: number;
      debit: number;
      date: string;
    }[] = [];

    for (const e of entries) {
      if (e.type !== "CREDIT_SALE" || (e.invoiceDue ?? 0) <= 0) continue;
      const key = e.saleId || e.reference_no || e.id;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push({
        key,
        saleId: e.saleId ?? null,
        reference_no: e.reference_no ?? key,
        invoiceDue: e.invoiceDue ?? 0,
        debit: e.debit,
        date: e.date,
      });
    }

    return list.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [entries]);

  const resolvePaymentTarget = useCallback(
    (saleKey: string) => {
      if (!saleKey || saleKey === "__general__") {
        return { saleId: null as string | null, referenceNo: null as string | null };
      }
      const inv = openInvoices.find(
        (i) => i.key === saleKey || i.saleId === saleKey || i.reference_no === saleKey
      );
      return {
        saleId: inv?.saleId || inv?.reference_no || saleKey,
        referenceNo: inv?.reference_no ?? null,
      };
    },
    [openInvoices]
  );

  const openPaymentModal = useCallback(
    (entry?: LedgerEntry | null) => {
      setSelectedEntry(entry ?? null);

      if (entry) {
        const key = entry.saleId || entry.reference_no || "";
        setPaymentSaleKey(key);
        setPaymentAmount(String(entry.invoiceDue ?? entry.debit ?? ""));
        setPaymentDescription(`Payment for ${entry.reference_no}`);
      } else if (openInvoices.length === 1) {
        const inv = openInvoices[0];
        setPaymentSaleKey(inv.key);
        setPaymentAmount(String(inv.invoiceDue));
        setPaymentDescription(`Payment for ${inv.reference_no}`);
      } else if (openInvoices.length > 1) {
        setPaymentSaleKey("");
        setPaymentAmount("");
        setPaymentDescription("Payment received");
      } else {
        setPaymentSaleKey("__general__");
        setPaymentAmount("");
        setPaymentDescription("Account Payment");
      }

      setIsPaymentModalOpen(true);
    },
    [openInvoices]
  );

  const resetPaymentModal = useCallback(() => {
    setSelectedEntry(null);
    setPaymentAmount("");
    setPaymentDescription("");
    setPaymentSaleKey("");
  }, []);

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

  const buildLedgerDoc = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header Color Bar
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("STATEMENT OF ACCOUNT", 15, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, 15, 30);

    // Customer Info Box
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.roundedRect(15, 45, pageWidth - 30, 35, 3, 3, 'F');
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(customer.name.toUpperCase(), 20, 55);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Phone: ${customer.phone_number || "N/A"}`, 20, 63);
    doc.text(`Email: ${customer.email || "N/A"}`, 20, 68);
    doc.text(`Address: ${customer.mobile_number || "N/A"}`, 20, 73);

    // Summary Mini-Cards in PDF
    const cardWidth = (pageWidth - 30) / 3;
    
    // Total Sales
    doc.setFillColor(255, 251, 251);
    doc.roundedRect(15, 85, cardWidth - 5, 20, 2, 2, 'F');
    doc.setTextColor(225, 29, 72);
    doc.setFontSize(8);
    doc.text("TOTAL SALES", 18, 92);
    doc.setFontSize(11);
    doc.text(`Rs ${summary.totalSales.toLocaleString()}`, 18, 100);

    // Total Payments
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(15 + cardWidth, 85, cardWidth - 5, 20, 2, 2, 'F');
    doc.setTextColor(21, 128, 61);
    doc.setFontSize(8);
    doc.text("TOTAL PAYMENTS", 18 + cardWidth, 92);
    doc.setFontSize(11);
    doc.text(`Rs ${summary.totalPayments.toLocaleString()}`, 18 + cardWidth, 100);

    // Balance Due / Advance
    const isAdvance = summary.advanceBalance > 0;
    doc.setFillColor(isAdvance ? 240 : 255, isAdvance ? 253 : 251, isAdvance ? 244 : 235);
    doc.roundedRect(15 + (cardWidth * 2), 85, cardWidth - 5, 20, 2, 2, 'F');
    doc.setTextColor(isAdvance ? 21 : 180, isAdvance ? 128 : 83, isAdvance ? 61 : 9);
    doc.setFontSize(8);
    doc.text(isAdvance ? "ADVANCE CREDIT" : "BALANCE DUE", 18 + (cardWidth * 2), 92);
    doc.setFontSize(11);
    doc.text(
      isAdvance
        ? `Rs ${summary.advanceBalance.toLocaleString()}`
        : `Rs ${summary.balanceDue.toLocaleString()}`,
      18 + (cardWidth * 2),
      100
    );

    // Table
    const tableData = filteredEntries.map(entry => [
      `${formatDate(entry.date)}\n${formatTime(entry.date)}`,
      entry.description,
      entry.reference_no || "—",
      entry.debit > 0 ? `Rs ${entry.debit.toLocaleString()}` : "—",
      entry.credit > 0 ? `Rs ${entry.credit.toLocaleString()}` : "—",
      formatRunningBalance(entry.balance).text
    ]);

    autoTable(doc, {
      startY: 115,
      head: [["Date & Time", "Description", "Reference", "Debit", "Credit", "Running Bal."]],
      body: tableData,
      theme: 'striped',
      headStyles: { 
        fillColor: [51, 65, 85], 
        textColor: 255, 
        fontSize: 9, 
        fontStyle: 'bold',
        halign: 'left'
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 35 },
        3: { halign: 'right', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 25 },
        5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' }
      },
      styles: { fontSize: 8, cellPadding: 4 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 15, right: 15 },
      didDrawPage: (data: any) => {
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text("Sarwat Trader ERP - System Generated Statement", 15, doc.internal.pageSize.height - 10);
        doc.text(`Page ${data.pageNumber}`, pageWidth - 25, doc.internal.pageSize.height - 10);
      }
    });

    return doc;
  };

  const handleDownloadPDF = () => {
    const doc = buildLedgerDoc();
    doc.save(`${customer.name}_Statement_${format(new Date(), "yyyyMMdd")}.pdf`);
  };

  const handlePrint = () => {
    const doc = buildLedgerDoc();
    doc.autoPrint();
    const blobUrl = URL.createObjectURL(doc.output("blob"));
    const win = window.open(blobUrl, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentAmount || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    const saleKey =
      paymentSaleKey ||
      selectedEntry?.saleId ||
      selectedEntry?.reference_no ||
      "";

    if (openInvoices.length > 0 && !saleKey) {
      toast({
        title: "Select invoice",
        description: "Choose which sale this payment is for",
        variant: "destructive",
      });
      return;
    }

    const { saleId } = resolvePaymentTarget(saleKey);

    setIsSubmittingPayment(true);
    try {
      const operationId = crypto.randomUUID();
      await apiClient.post(`${API_BASE}/customer-ledger/${customerId}/payment`, {
        amount: Number(paymentAmount),
        description: paymentDescription,
        saleId,
      }, {
        headers: { "X-Operation-Id": operationId },
      });

      toast({
        title: "Success",
        description: "Payment recorded successfully",
      });
      setIsPaymentModalOpen(false);
      resetPaymentModal();
      await fetchLedgerData({ silent: true });
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

  if (loading) return <PageLoader message="Loading ledger..." />;

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
    <div className="flex flex-col h-[95vh] bg-slate-50 overflow-hidden">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 pr-20 py-4 shrink-0">
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
          <div className="flex items-center gap-2 mr-8 md:mr-10">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLedgerData({ silent: true })}
              disabled={isRefreshing}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="gap-1.5 border-blue-200 text-blue-600 hover:bg-blue-50">
              <Download className="h-3.5 w-3.5" /> Export PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50">
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
            <Button 
                size="sm" 
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                onClick={() => openPaymentModal(null)}
            >
              <Plus className="h-3.5 w-3.5" /> Receive Payment
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 w-full max-w-[1600px] mx-auto">

        {/* Summary Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
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

          <div
            className={`rounded-2xl border p-4 shadow-sm ${
              summary.balanceDue > 0
                ? "bg-amber-50 border-amber-200"
                : summary.advanceBalance > 0
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-slate-50 border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={`text-xs font-semibold uppercase tracking-wide ${
                  summary.advanceBalance > 0 ? "text-emerald-600" : summary.balanceDue > 0 ? "text-amber-600" : "text-slate-500"
                }`}
              >
                {summary.advanceBalance > 0 ? "Advance Credit" : "Balance Due"}
              </span>
              <div
                className={`p-1.5 rounded-lg ${
                  summary.advanceBalance > 0 ? "bg-emerald-100" : summary.balanceDue > 0 ? "bg-amber-100" : "bg-slate-100"
                }`}
              >
                <Wallet
                  className={`h-3.5 w-3.5 ${
                    summary.advanceBalance > 0 ? "text-emerald-600" : summary.balanceDue > 0 ? "text-amber-600" : "text-slate-500"
                  }`}
                />
              </div>
            </div>
            <div
              className={`text-xl font-black ${
                summary.advanceBalance > 0 ? "text-emerald-700" : summary.balanceDue > 0 ? "text-amber-700" : "text-slate-600"
              }`}
            >
              {summary.advanceBalance > 0
                ? money(summary.advanceBalance)
                : summary.balanceDue > 0
                  ? money(summary.balanceDue)
                  : "Rs 0"}
            </div>
            <div className="text-[10px] mt-0.5 text-slate-500">
              {summary.advanceBalance > 0
                ? "Customer paid more than total due (prepaid)"
                : summary.balanceDue > 0
                  ? "Amount still owed by customer"
                  : "No outstanding due"}
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
              <p className="text-xs text-slate-400 mt-0.5">
                {entries.length} transaction{entries.length !== 1 ? "s" : ""}
                {" · "}
                <span className="text-slate-500">
                  Running balance = total owed on account after each row (use <strong className="font-semibold">Due</strong> for per-invoice amount)
                </span>
              </p>
            </div>
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar py-1">
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search transactions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10 text-sm w-[200px] md:w-[250px] border-slate-200"
                />
              </div>
              
              <div className="flex items-center gap-1.5 shrink-0">
                <DatePicker 
                  date={dateFrom} 
                  onDateChange={setDateFrom} 
                  placeholder="From Date" 
                />
                <span className="text-[10px] font-bold text-slate-300 uppercase px-1">to</span>
                <DatePicker 
                  date={dateTo} 
                  onDateChange={setDateTo} 
                  placeholder="To Date" 
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-10 px-3 text-sm gap-2 text-slate-500 border-slate-200 shrink-0"
                onClick={() => setSortOrder(o => o === "desc" ? "asc" : "desc")}
              >
                {sortOrder === "desc" ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                <span className="hidden sm:inline">{sortOrder === "desc" ? "Newest First" : "Oldest First"}</span>
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[150px]">Date & Time</th>
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Description</th>
                  <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[180px]">Reference</th>
                  <th className="text-right px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[140px]">Debit</th>
                  <th className="text-right px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[130px]">Due</th>
                  <th className="text-right px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[140px]">Credit</th>
                  <th
                    className="text-right px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[150px]"
                    title="Cumulative account balance after this entry"
                  >
                    Running Bal.
                  </th>
                  <th className="text-right px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[100px]">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
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
                      <td className="px-6 py-5">
                        <div className="font-bold text-slate-800 text-sm">{formatDate(entry.date)}</div>
                        <div className="text-xs text-slate-400 mt-1">{formatTime(entry.date)}</div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${entry.type === "CREDIT_SALE" ? "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.4)]" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]"}`} />
                          <div>
                            <div className="font-bold text-slate-800 text-sm leading-snug">{entry.description}</div>
                            <Badge variant="outline" className="mt-1 text-[10px] h-5 px-2 border-slate-200 text-slate-500 font-bold uppercase">
                              {entryTypeLabel(entry.type)}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="font-mono text-xs text-blue-600 font-bold px-2 py-1 bg-blue-50 rounded-md">
                          {entry.reference_no || <span className="text-slate-300 font-normal">—</span>}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        {entry.debit > 0 ? (
                          <div>
                            <span className="font-black text-rose-600 text-sm">Rs {entry.debit.toLocaleString()}</span>
                            {(entry.invoicePaid ?? 0) > 0 && (
                              <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                                Paid Rs {(entry.invoicePaid ?? 0).toLocaleString()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-200 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        {entry.type === "CREDIT_SALE" ? (
                          (entry.invoiceDue ?? 0) > 0 ? (
                            <span className="font-black text-amber-700 text-sm">
                              Rs {(entry.invoiceDue ?? 0).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-600 uppercase">Paid</span>
                          )
                        ) : (
                          <span className="text-slate-200 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        {entry.credit > 0 ? (
                          <span className="font-black text-emerald-600 text-sm">Rs {entry.credit.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-200 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        {(() => {
                          const rb = formatRunningBalance(entry.balance);
                          return (
                            <span className={`font-black text-sm ${rb.className}`} title={rb.hint}>
                              {rb.text}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-5 text-right">
                        {entry.isCollectable && (entry.invoiceDue ?? 0) > 0 && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 px-3 text-[11px] uppercase font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-lg shadow-sm"
                            onClick={() => openPaymentModal(entry)}
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
                    <td className="px-4 py-3 text-right font-black text-amber-700 text-xs">
                      {summary.balanceDue > 0
                        ? `Rs ${summary.balanceDue.toLocaleString()}`
                        : summary.advanceBalance > 0
                          ? "—"
                          : "Rs 0"}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-emerald-600 text-xs">
                      Rs {filteredEntries.reduce((s, e) => s + e.credit, 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right text-xs font-black text-nowrap">
                      {summary.advanceBalance > 0 ? (
                        <span className="text-emerald-700">Adv {money(summary.advanceBalance)}</span>
                      ) : summary.balanceDue > 0 ? (
                        <span className="text-amber-700">Due {money(summary.balanceDue)}</span>
                      ) : (
                        <span className="text-slate-500">Rs 0</span>
                      )}
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

      <Dialog
        open={isPaymentModalOpen}
        onOpenChange={(open) => {
          setIsPaymentModalOpen(open);
          if (!open) resetPaymentModal();
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Receive Payment
            </DialogTitle>
            <DialogDescription>
              {selectedEntry
                ? `Apply payment toward invoice ${selectedEntry.reference_no}. Extra amount becomes advance credit.`
                : summary.balanceDue > 0
                  ? `Outstanding due: ${money(summary.balanceDue)}. Overpayment is stored as advance credit.`
                  : summary.advanceBalance > 0
                    ? `Current advance credit: ${money(summary.advanceBalance)}.`
                    : "No outstanding due on this account."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {openInvoices.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Apply to invoice
                </Label>
                <Select
                  value={paymentSaleKey || undefined}
                  onValueChange={(value) => {
                    setPaymentSaleKey(value);
                    if (value === "__general__") {
                      setPaymentDescription("Account Payment");
                      return;
                    }
                    const inv = openInvoices.find(
                      (i) => i.key === value || i.reference_no === value
                    );
                    if (inv) {
                      setPaymentDescription(`Payment for ${inv.reference_no}`);
                      setPaymentAmount(String(inv.invoiceDue));
                    }
                  }}
                >
                  <SelectTrigger className="h-10 text-sm font-medium">
                    <SelectValue placeholder="Select sale / invoice…" />
                  </SelectTrigger>
                  <SelectContent>
                    {openInvoices.map((inv) => (
                      <SelectItem key={inv.key} value={inv.key}>
                        {inv.reference_no} — Due Rs {inv.invoiceDue.toLocaleString()}
                        {inv.debit !== inv.invoiceDue
                          ? ` (of Rs ${inv.debit.toLocaleString()})`
                          : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value="__general__">
                      General payment (auto-allocate to open invoices)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

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
              {(() => {
                const key = paymentSaleKey || selectedEntry?.saleId || selectedEntry?.reference_no;
                const inv = openInvoices.find(
                  (i) => i.key === key || i.reference_no === key
                );
                const due = inv?.invoiceDue ?? selectedEntry?.invoiceDue ?? 0;
                if (due > 0) {
                  return (
                    <p className="text-[10px] text-amber-600 font-bold uppercase tracking-tight">
                      Amount due on selected invoice: Rs {due.toLocaleString()}
                    </p>
                  );
                }
                return null;
              })()}
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
            <Button
              variant="outline"
              onClick={() => {
                setIsPaymentModalOpen(false);
                resetPaymentModal();
              }}
              disabled={isSubmittingPayment}
            >
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
