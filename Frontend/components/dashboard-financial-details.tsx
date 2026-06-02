"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageLoader } from "@/components/ui/page-loader";
import apiClient from "@/lib/apiClient";

type DetailMode = "revenue" | "cash" | "credit" | "expenses";

interface SaleRow {
  id: string;
  sale_number: string;
  total_amount: number | string;
  payment_method?: string;
  sale_date: string;
  customer?: { name?: string | null; email?: string | null } | null;
}

interface DashboardStatsPayload {
  todaySales: SaleRow[];
  dailyRevenue: number;
  dailyCash: number;
  dailyCredit: number;
  dailyExpense: number;
}

interface ExpenseRow {
  id: string;
  amount: number | string;
  notes?: string | null;
  created_at: string;
}

interface DashboardFinancialDetailsProps {
  mode: DetailMode;
  onBack: () => void;
}

const TITLES: Record<DetailMode, { heading: string; sub: string }> = {
  revenue: { heading: "Total Revenue (Today)", sub: "All cash + credit sales posted today" },
  cash: { heading: "Cash Sales (Today)", sub: "Paid cash transactions posted today" },
  credit: { heading: "Credit Sales (Today)", sub: "Credit transactions posted today" },
  expenses: { heading: "Expenses (Today)", sub: "All outgoing cash entries posted today" },
};

const money = (n: number) =>
  `Rs ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function DashboardFinancialDetails({ mode, onBack }: DashboardFinancialDetailsProps) {
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [statsTotals, setStatsTotals] = useState({
    dailyRevenue: 0,
    dailyCash: 0,
    dailyCredit: 0,
    dailyExpense: 0,
  });

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const statsRes = await apiClient.get("/dashboard/stats");
        const stats = (statsRes.data?.data || {}) as DashboardStatsPayload;
        setStatsTotals({
          dailyRevenue: Number(stats.dailyRevenue || 0),
          dailyCash: Number(stats.dailyCash || 0),
          dailyCredit: Number(stats.dailyCredit || 0),
          dailyExpense: Number(stats.dailyExpense || 0),
        });

        if (mode === "expenses") {
          const res = await apiClient.get("/expenses", { params: { page: 1, limit: 200 } });
          const rows = Array.isArray(res.data?.data) ? res.data.data : [];
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const windowRows = rows.filter((e: any) => {
            const d = new Date(e.created_at);
            return d >= since;
          });
          setExpenses(windowRows);
          setSales([]);
        } else {
          const rows = Array.isArray(stats.todaySales) ? stats.todaySales : [];
          const filtered = rows.filter((s: any) => {
            if (mode === "cash") return String(s.payment_method || "").toUpperCase() === "CASH";
            if (mode === "credit") return String(s.payment_method || "").toUpperCase() === "CREDIT";
            return true;
          });
          setSales(filtered);
          setExpenses([]);
        }
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [mode]);

  const total = useMemo(() => {
    if (mode === "expenses") {
      return statsTotals.dailyExpense;
    }
    if (mode === "cash") {
      return statsTotals.dailyCash;
    }
    if (mode === "credit") {
      return statsTotals.dailyCredit;
    }
    return statsTotals.dailyRevenue;
  }, [mode, statsTotals]);

  if (loading) return <PageLoader message="Loading details..." />;

  const title = TITLES[mode];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title.heading}</h1>
          <p className="text-sm text-muted-foreground">{title.sub}</p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            {mode === "expenses" ? <Receipt className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
            Today Total: {money(total)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mode === "expenses" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      No expense entries found for today.
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{new Date(e.created_at).toLocaleString()}</TableCell>
                      <TableCell>{e.notes || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{money(Number(e.amount || 0))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No sales found for this segment today.
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.sale_number}</TableCell>
                      <TableCell>{s.customer?.name || s.customer?.email || "Walk-in Customer"}</TableCell>
                      <TableCell>{s.payment_method || "—"}</TableCell>
                      <TableCell>{new Date(s.sale_date).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium">{money(Number(s.total_amount || 0))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

