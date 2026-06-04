"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Download,
  Search,
  Receipt,
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

/** Replace em/en dashes in API copy with simpler punctuation for display */
function cleanDisplayText(text: string) {
  return text.replace(/\s*[\u2013\u2014]\s*/g, ": ").trim();
}

function entryTypeLabel(type: string) {
  if (type === "CREDIT_SALE") return "Credit Sale";
  if (type === "PAYMENT_RECEIVED") return "Payment";
  if (type === "ADJUSTMENT") return "Adjustment";
  if (type === "REFUND") return "Refund";
  return type.replace(/_/g, " ");
}

/** Positive outstanding = customer owes you; negative = prepaid credit in customer's favor */
function getNetBalancePresentation(balance: number) {
  if (balance > 0.009) {
    return {
      label: "Amount Due",
      amount: balance,
      className: "text-amber-700",
      cardClass: "bg-amber-50 border-amber-200",
      labelClass: "text-amber-600",
      hint: "Customer owes this amount on the account",
      variant: "due" as const,
    };
  }
  if (balance < -0.009) {
    return {
      label: "Available Credit",
      amount: Math.abs(balance),
      className: "text-emerald-700",
      cardClass: "bg-emerald-50 border-emerald-200",
      labelClass: "text-emerald-600",
      hint: "Customer has prepaid credit. Not an amount they need to pay now.",
      variant: "credit" as const,
    };
  }
  return {
    label: "Account Balance",
    amount: 0,
    className: "text-slate-600",
    cardClass: "bg-slate-50 border-slate-200",
    labelClass: "text-slate-500",
    hint: "No outstanding balance on this account",
    variant: "settled" as const,
  };
}

function formatRunningBalance(running: number) {
  const net = getNetBalancePresentation(running);
  return {
    text: net.variant === "settled" ? "Rs 0" : money(net.amount),
    className: net.className,
    hint: net.hint,
  };
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
    totalDebits: 0,
    totalCredits: 0,
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
        totalDebits: data.summary?.totalDebits ?? data.summary?.totalSales ?? 0,
        totalCredits: data.summary?.totalCredits ?? data.summary?.totalPayments ?? 0,
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

  type PaymentTarget = {
    key: string;
    saleId: string | null;
    referenceNo: string | null;
    label: string;
    detail: string;
    suggestedAmount: number;
    kind: "invoice" | "account";
  };

  const paymentTargets = useMemo(() => {
    const seen = new Set<string>();
    const targets: PaymentTarget[] = [];

    for (const e of entries) {
      const ref = e.saleId || e.reference_no;
      if (!ref || seen.has(ref)) continue;
      const due = e.invoiceDue ?? 0;
      if (due <= 0.009) continue;
      seen.add(ref);
      targets.push({
        key: ref,
        saleId: e.saleId ?? ref,
        referenceNo: e.reference_no ?? ref,
        label: e.reference_no ?? ref,
        detail: cleanDisplayText(entryTypeLabel(e.type)),
        suggestedAmount: due,
        kind: "invoice",
      });
    }

    if (summary.balanceDue > 0.009) {
      targets.push({
        key: "__account__",
        saleId: null,
        referenceNo: null,
        label: "Whole account balance",
        detail: "Applies to total amount due on this customer account",
        suggestedAmount: summary.balanceDue,
        kind: "account",
      });
    }

    return targets;
  }, [entries, summary.balanceDue]);

  const resolvePaymentTarget = useCallback(
    (targetKey: string) => {
      if (!targetKey || targetKey === "__account__") {
        return { saleId: null as string | null, referenceNo: null as string | null };
      }
      const t = paymentTargets.find(
        (i) => i.key === targetKey || i.saleId === targetKey || i.referenceNo === targetKey
      );
      return {
        saleId: t?.saleId || t?.referenceNo || targetKey,
        referenceNo: t?.referenceNo ?? null,
      };
    },
    [paymentTargets]
  );

  const applyPaymentTarget = useCallback((targetKey: string) => {
    setPaymentSaleKey(targetKey);
    const t = paymentTargets.find((x) => x.key === targetKey);
    if (!t) return;
    if (t.kind === "account") {
      setPaymentDescription("Payment toward account balance");
      setPaymentAmount(String(t.suggestedAmount));
      return;
    }
    setPaymentDescription(`Payment for ${t.referenceNo ?? t.label}`);
    setPaymentAmount(String(t.suggestedAmount));
  }, [paymentTargets]);

  const resetPaymentModal = useCallback(() => {
    setSelectedEntry(null);
    setPaymentAmount("");
    setPaymentDescription("");
    setPaymentSaleKey("");
  }, []);

  const openPaymentModal = useCallback(
    (entry?: LedgerEntry | null) => {
      setSelectedEntry(entry ?? null);

      if (entry) {
        const ref = entry.saleId || entry.reference_no || "";
        const match = paymentTargets.find(
          (t) => t.key === ref || t.saleId === ref || t.referenceNo === ref
        );
        if (match) {
          applyPaymentTarget(match.key);
        } else if (summary.balanceDue > 0) {
          applyPaymentTarget("__account__");
        } else {
          setPaymentSaleKey(ref);
          setPaymentAmount(String(entry.invoiceDue ?? entry.debit ?? ""));
          setPaymentDescription(
            entry.reference_no ? `Payment for ${entry.reference_no}` : "Payment received"
          );
        }
      } else if (paymentTargets.length === 1) {
        applyPaymentTarget(paymentTargets[0].key);
      } else {
        setPaymentSaleKey("");
        setPaymentAmount("");
        setPaymentDescription("");
      }

      setIsPaymentModalOpen(true);
    },
    [paymentTargets, summary.balanceDue, applyPaymentTarget]
  );

  const formatDate = (d: string) => {
    try {
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? "N/A" : format(dt, "dd MMM yyyy");
    } catch {
      return "N/A";
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
    
    const pdfNet = getNetBalancePresentation(summary.balance);

    doc.setFillColor(255, 251, 251);
    doc.roundedRect(15, 85, cardWidth - 5, 20, 2, 2, 'F');
    doc.setTextColor(225, 29, 72);
    doc.setFontSize(8);
    doc.text("TOTAL DEBITS", 18, 92);
    doc.setFontSize(11);
    doc.text(`Rs ${summary.totalDebits.toLocaleString()}`, 18, 100);

    doc.setFillColor(240, 253, 244);
    doc.roundedRect(15 + cardWidth, 85, cardWidth - 5, 20, 2, 2, 'F');
    doc.setTextColor(21, 128, 61);
    doc.setFontSize(8);
    doc.text("TOTAL CREDITS", 18 + cardWidth, 92);
    doc.setFontSize(11);
    doc.text(`Rs ${summary.totalCredits.toLocaleString()}`, 18 + cardWidth, 100);

    doc.setFillColor(
      pdfNet.variant === "credit" ? 240 : pdfNet.variant === "due" ? 255 : 248,
      pdfNet.variant === "credit" ? 253 : pdfNet.variant === "due" ? 251 : 250,
      pdfNet.variant === "credit" ? 244 : pdfNet.variant === "due" ? 235 : 252
    );
    doc.roundedRect(15 + cardWidth * 2, 85, cardWidth - 5, 20, 2, 2, 'F');
    doc.setTextColor(
      pdfNet.variant === "credit" ? 21 : pdfNet.variant === "due" ? 180 : 100,
      pdfNet.variant === "credit" ? 128 : pdfNet.variant === "due" ? 83 : 116,
      pdfNet.variant === "credit" ? 61 : pdfNet.variant === "due" ? 9 : 139
    );
    doc.setFontSize(8);
    doc.text(pdfNet.label.toUpperCase(), 18 + cardWidth * 2, 92);
    doc.setFontSize(11);
    doc.text(
      pdfNet.variant === "settled" ? "Rs 0" : `Rs ${pdfNet.amount.toLocaleString()}`,
      18 + cardWidth * 2,
      100
    );

    // Table
    const tableData = filteredEntries.map(entry => [
      `${formatDate(entry.date)}\n${formatTime(entry.date)}`,
      entry.description,
      entry.reference_no || "",
      entry.debit > 0 ? `Rs ${entry.debit.toLocaleString()}` : "",
      entry.credit > 0 ? `Rs ${entry.credit.toLocaleString()}` : "",
      formatRunningBalance(entry.balance).text
    ]);

    autoTable(doc, {
      startY: 115,
      head: [["Date & Time", "Description", "Reference", "Debit", "Credit", "Running Balance"]],
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

    const targetKey =
      paymentSaleKey ||
      selectedEntry?.saleId ||
      selectedEntry?.reference_no ||
      "";

    if (paymentTargets.length > 0 && !targetKey) {
      toast({
        title: "Select payment for",
        description: "Choose which invoice or account balance this payment applies to",
        variant: "destructive",
      });
      return;
    }

    const { saleId } = resolvePaymentTarget(targetKey);

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
    ? Math.min(100, Math.round((Math.max(0, summary.balance) / customer.credit_limit) * 100))
    : 0;

  const netBalance = getNetBalancePresentation(summary.balance);
  const selectedTarget = paymentTargets.find((t) => t.key === paymentSaleKey);

  return (
    <div className="flex flex-col min-h-0 flex-1 bg-slate-100 h-full">
      <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              size="sm"
              onClick={onBack}
              className="h-9 shrink-0 gap-1.5 bg-sky-600 font-medium text-white shadow-sm hover:bg-sky-700"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">{customer.name}</h1>
              {customer.phone_number && (
                <p className="text-xs text-slate-500 truncate">{customer.phone_number}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLedgerData({ silent: true })}
              disabled={isRefreshing}
              className="h-9"
            >
              <RefreshCw className={`h-4 w-4 sm:mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="h-9 hidden md:inline-flex">
              <Download className="h-4 w-4 mr-1.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="h-9 hidden md:inline-flex">
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>
            <Button
              size="sm"
              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => openPaymentModal(null)}
            >
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Receive Payment</span>
              <span className="sm:hidden">Pay</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6">
        <div className="max-w-[1400px] mx-auto w-full space-y-5">

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Total Debits</p>
            <p className="text-lg font-semibold text-rose-600 mt-1 tabular-nums">{money(summary.totalDebits)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3.5">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Total Credits</p>
            <p className="text-lg font-semibold text-emerald-600 mt-1 tabular-nums">{money(summary.totalCredits)}</p>
          </div>
          <div className={`rounded-xl border p-3.5 ${netBalance.cardClass}`}>
            <p className={`text-[11px] font-medium uppercase ${netBalance.labelClass}`}>{netBalance.label}</p>
            <p className={`text-lg font-semibold mt-1 tabular-nums ${netBalance.className}`}>
              {netBalance.variant === "settled" ? "Rs 0" : money(netBalance.amount)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3.5">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Credit Limit</p>
            <p className="text-lg font-semibold text-slate-900 mt-1 tabular-nums">
              {money(Number(customer.credit_limit))}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Statement of Account</h2>
              <span className="text-xs text-slate-500">{entries.length} entries</span>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm bg-white"
                />
              </div>
              <DatePicker date={dateFrom} onDateChange={setDateFrom} placeholder="From" />
              <DatePicker date={dateTo} onDateChange={setDateTo} placeholder="To" />
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full justify-center text-slate-600 bg-white"
                onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
              >
                {sortOrder === "desc" ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronUp className="h-4 w-4 mr-1" />}
                {sortOrder === "desc" ? "Newest" : "Oldest"}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[720px] text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-[110px]">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 min-w-[200px]">Details</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 w-[100px]">Debit</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 w-[100px]">Credit</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 w-[120px]">Balance</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 w-[88px]"></th>
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
                  filteredEntries.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <p className="font-medium text-slate-800 text-xs">{formatDate(entry.date)}</p>
                        <p className="text-[11px] text-slate-400">{formatTime(entry.date)}</p>
                      </td>
                      <td className="px-4 py-3 align-top min-w-0">
                        <p className="text-sm text-slate-800 leading-snug break-words">
                          {cleanDisplayText(entry.description)}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                          <span className="text-[11px] text-slate-500">{entryTypeLabel(entry.type)}</span>
                          {entry.reference_no && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="text-[11px] font-mono text-slate-600">{entry.reference_no}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right align-top tabular-nums whitespace-nowrap">
                        {entry.debit > 0 ? (
                          <span className="font-semibold text-rose-600">{money(entry.debit)}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-top tabular-nums whitespace-nowrap">
                        {entry.credit > 0 ? (
                          <span className="font-semibold text-emerald-600">{money(entry.credit)}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-top tabular-nums whitespace-nowrap">
                        {(() => {
                          const rb = formatRunningBalance(entry.balance);
                          return (
                            <span className={`font-semibold text-sm ${rb.className}`} title={rb.hint}>
                              {rb.text}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        {entry.isCollectable && (entry.invoiceDue ?? 0) > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
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
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-slate-600">
                      Totals
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-600 tabular-nums">
                      {money(filteredEntries.reduce((s, e) => s + e.debit, 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600 tabular-nums">
                      {money(filteredEntries.reduce((s, e) => s + e.credit, 0))}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${netBalance.className}`}>
                      {netBalance.variant === "settled" ? "Rs 0" : money(netBalance.amount)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
        </div>
      </div>

      <Dialog
        open={isPaymentModalOpen}
        onOpenChange={(open) => {
          setIsPaymentModalOpen(open);
          if (!open) resetPaymentModal();
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Receive Payment
            </DialogTitle>
            <DialogDescription>
              {netBalance.variant === "due"
                ? `${netBalance.label}: ${money(netBalance.amount)}`
                : netBalance.variant === "credit"
                  ? `${netBalance.label}: ${money(netBalance.amount)}`
                  : "Account is settled."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-target">
                Payment applies to <span className="text-destructive">*</span>
              </Label>
              {paymentTargets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open balance to collect.</p>
              ) : (
                <Select
                  value={paymentSaleKey || undefined}
                  onValueChange={applyPaymentTarget}
                >
                  <SelectTrigger id="payment-target" className="h-10">
                    <SelectValue placeholder="Select invoice or account" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentTargets.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="truncate">
                            {t.label}
                            {t.kind === "invoice" && t.detail ? (
                              <span className="text-muted-foreground"> · {t.detail}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {money(t.suggestedAmount)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedTarget?.kind === "account" && (
                <p className="text-xs text-muted-foreground">
                  Applies to total amount due on this account.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (Rs)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  Rs
                </span>
                <Input
                  id="amount"
                  type="number"
                  className="pl-10"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
              {selectedTarget && selectedTarget.suggestedAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Due on selection: {money(selectedTarget.suggestedAmount)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
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
              disabled={
                isSubmittingPayment ||
                (paymentTargets.length > 0 && !paymentSaleKey) ||
                !paymentAmount ||
                Number(paymentAmount) <= 0
              }
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
