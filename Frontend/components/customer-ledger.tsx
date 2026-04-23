"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Download, 
  Calendar, 
  DollarSign, 
  Receipt, 
  ArrowUpCircle, 
  ArrowDownCircle,
  FileText,
  Loader2,
  Filter
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
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalPayments: 0,
    balance: 0
  });

  const fetchLedgerData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch customer details
      const custRes = await apiClient.get(`${API_BASE}/customer/${customerId}`);
      setCustomer(custRes.data.data);

      // Fetch ledger entries
      const ledgerRes = await apiClient.get(`${API_BASE}/customer-ledger/${customerId}`);
      const data = ledgerRes.data.data;
      
      setEntries(data.entries || []);
      setSummary({
        totalSales: data.summary?.totalSales || 0,
        totalPayments: data.summary?.totalPayments || 0,
        balance: data.summary?.currentBalance || 0
      });
    } catch (error: any) {
      console.error("Ledger fetch error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to load ledger data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [customerId, toast]);

  useEffect(() => {
    fetchLedgerData();
  }, [fetchLedgerData]);

  if (loading) {
    return <PageLoader message="Fetching customer ledger..." />;
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <ArrowLeft className="h-12 w-12 text-gray-300 mb-4 cursor-pointer" onClick={onBack} />
        <h2 className="text-xl font-semibold">Customer not found</h2>
        <Button variant={"outline"} onClick={onBack} className="mt-4">Go Back</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}'s Ledger</h1>
            <p className="text-sm text-gray-500">Transaction history and statement</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Calendar className="h-4 w-4" /> Filter Date
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-emerald-50 border-emerald-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-emerald-600 tracking-wider">Total Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-700">Rs {summary.totalSales.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-blue-600 tracking-wider">Payments Received</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-blue-700">Rs {summary.totalPayments.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className={`${summary.balance > 0 ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100"} shadow-sm`}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-xs font-bold uppercase ${summary.balance > 0 ? "text-amber-600" : "text-emerald-600"} tracking-wider`}>Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-black ${summary.balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>Rs {summary.balance.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50 border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-gray-600 tracking-wider">Credit Limit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-gray-700">Rs {customer.credit_limit.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Ledger Table */}
      <Card className="border-slate-200 overflow-hidden shadow-md">
        <CardHeader className="bg-slate-50 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-slate-800">Statement of Account</CardTitle>
            <Badge variant="outline" className="bg-white border-slate-300 font-mono">ID: {customer.id.substring(0, 8)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 underline-offset-4 decoration-slate-300">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[120px] font-bold">Date</TableHead>
                  <TableHead className="font-bold">Transaction Description</TableHead>
                  <TableHead className="w-[150px] font-bold">Reference #</TableHead>
                  <TableHead className="text-right font-bold w-[130px]">Debit (+)</TableHead>
                  <TableHead className="text-right font-bold w-[130px]">Credit (-)</TableHead>
                  <TableHead className="text-right font-bold w-[150px] bg-slate-100/50">Running Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-400 italic font-medium">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-8 w-8 opacity-20" />
                        No transaction history available for this period.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => (
                    <TableRow key={entry.id} className="hover:bg-slate-50 transition-colors border-slate-100">
                      <TableCell className="text-sm font-medium text-slate-600">
                        {(() => {
                           try {
                             const d = new Date(entry.date);
                             return isNaN(d.getTime()) ? "---" : format(d, "dd MMM yyyy");
                           } catch {
                             return "---";
                           }
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">{entry.description}</span>
                          {entry.payment_method && (
                            <span className="text-xs text-slate-500 uppercase tracking-tighter font-black">Method: {entry.payment_method}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-blue-600 font-bold uppercase">
                        {entry.reference_no || "---"}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${entry.debit > 0 ? "text-red-600" : "text-slate-300"}`}>
                        {entry.debit > 0 ? `Rs ${(entry.debit || 0).toLocaleString()}` : "0"}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${entry.credit > 0 ? "text-emerald-600" : "text-slate-300"}`}>
                        {entry.credit > 0 ? `Rs ${(entry.credit || 0).toLocaleString()}` : "0"}
                      </TableCell>
                      <TableCell className="text-right font-black bg-slate-100/30 text-slate-950 border-l border-slate-100">
                        Rs {(entry.balance || 0).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Branding Footer for Print */}
      <div className="hidden print:flex flex-col items-center mt-12 pt-8 border-t border-slate-200">
        <p className="text-slate-500 text-sm italic font-medium">This is a system-generated statement authenticated via Sarwat Traders ERP.</p>
        <div className="flex items-center gap-2 mt-2">
           <span className="text-slate-900 font-black tracking-widest text-[10px] uppercase">Powered By</span>
           <span className="text-indigo-600 font-black tracking-widest text-[10px] uppercase underline decoration-2 underline-offset-4">Ace Studios</span>
        </div>
      </div>
    </div>
  );
}
