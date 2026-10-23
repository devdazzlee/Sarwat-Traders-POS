"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageLoader } from "@/components/ui/page-loader"
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Scale,
  Clock3,
} from "lucide-react"
import apiClient from "@/lib/apiClient"
import { API_BASE } from "@/config/constants"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface LedgerIntegrityAlert {
  id: string
  customer_id: string
  customer_name: string
  stored_balance: string
  computed_balance: string
  detected_at: string
  resolved: boolean
}

const money = (n: number) =>
  Number(n || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })

export function LedgerIntegrityAlerts() {
  const { toast } = useToast()
  const [alerts, setAlerts] = useState<LedgerIntegrityAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const fetchAlerts = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) setRefreshing(true)
      else setLoading(true)
      try {
        const res = await apiClient.get(`${API_BASE}/customer-ledger/integrity-alerts`)
        setAlerts(res.data?.data ?? [])
      } catch (error) {
        console.error("Failed to load ledger integrity alerts:", error)
        toast({ title: "Failed to load alerts", variant: "destructive" })
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    void fetchAlerts()
  }, [fetchAlerts])

  const handleResolve = async (alertId: string) => {
    setResolvingId(alertId)
    try {
      await apiClient.patch(`${API_BASE}/customer-ledger/integrity-alerts/${alertId}/resolve`)
      setAlerts((prev) => prev.filter((a) => a.id !== alertId))
      toast({ title: "Alert marked as resolved" })
    } catch (error) {
      console.error("Failed to resolve alert:", error)
      toast({ title: "Failed to resolve alert", variant: "destructive" })
    } finally {
      setResolvingId(null)
    }
  }

  const stats = useMemo(() => {
    const diffs = alerts.map((a) => Math.abs(Number(a.computed_balance) - Number(a.stored_balance)))
    const largest = diffs.length ? Math.max(...diffs) : 0
    const totalGap = diffs.reduce((sum, n) => sum + n, 0)
    return {
      open: alerts.length,
      largest,
      totalGap,
    }
  }, [alerts])

  if (loading) return <PageLoader message="Loading ledger alerts..." />

  const hasAlerts = alerts.length > 0

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-100 via-slate-50 to-white">
      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-slate-900 text-white overflow-hidden shadow-lg">
          <div className="relative px-5 py-5 md:px-7 md:py-6">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(245,158,11,0.22),_transparent_55%)]" />
            <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 rounded-xl p-2.5 border",
                    hasAlerts
                      ? "bg-amber-400/15 border-amber-300/30 text-amber-300"
                      : "bg-emerald-400/15 border-emerald-300/30 text-emerald-300",
                  )}
                >
                  {hasAlerts ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <ShieldCheck className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/90 mb-1">
                    Balance health check
                  </p>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                    {hasAlerts ? "Mismatches need review" : "All clear, nothing to review"}
                  </h1>
                  <p className="text-sm text-slate-300 mt-1 max-w-2xl">
                    Nightly check compares each customer&apos;s stored balance with the live Statement of Account.
                    Open alerts need a quick review.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                className="h-9 bg-white/10 text-white border-white/20 hover:bg-white/20 self-start lg:self-auto"
                onClick={() => fetchAlerts({ silent: true })}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <Card
            className={cn(
              "shadow-sm overflow-hidden",
              hasAlerts
                ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
                : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
            )}
          >
            <CardContent className="p-4 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p
                    className={cn(
                      "text-[11px] font-medium",
                      hasAlerts ? "text-amber-800/80" : "text-emerald-800/80",
                    )}
                  >
                    Open alerts
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums mt-1",
                      hasAlerts ? "text-amber-900" : "text-emerald-900",
                    )}
                  >
                    {stats.open}
                  </p>
                  <p className={cn("text-[11px] mt-1", hasAlerts ? "text-amber-700/70" : "text-emerald-700/70")}>
                    {hasAlerts ? "Need review" : "Nothing pending"}
                  </p>
                </div>
                <div
                  className={cn(
                    "rounded-lg p-2",
                    hasAlerts ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700",
                  )}
                >
                  {hasAlerts ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-rose-100 bg-gradient-to-br from-rose-50 to-white shadow-sm">
            <CardContent className="p-4 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium text-rose-700/80">Largest gap</p>
                  <p className="text-2xl font-bold text-rose-900 tabular-nums mt-1">
                    Rs {money(stats.largest)}
                  </p>
                  <p className="text-[11px] text-rose-600/70 mt-1">Biggest single mismatch</p>
                </div>
                <div className="rounded-lg bg-rose-100 p-2 text-rose-700">
                  <Scale className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-sky-100 bg-gradient-to-br from-sky-50 to-white shadow-sm">
            <CardContent className="p-4 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium text-sky-700/80">Total absolute gap</p>
                  <p className="text-2xl font-bold text-sky-900 tabular-nums mt-1">
                    Rs {money(stats.totalGap)}
                  </p>
                  <p className="text-[11px] text-sky-600/70 mt-1">Across all open alerts</p>
                </div>
                <div className="rounded-lg bg-sky-100 p-2 text-sky-700">
                  <Clock3 className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Content */}
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base text-slate-900">
                  {hasAlerts
                    ? `${alerts.length} open alert${alerts.length === 1 ? "" : "s"}`
                    : "Balance check status"}
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Stored balance vs live ledger computation
                </p>
              </div>
              <Badge
                className={cn(
                  "self-start sm:self-auto border font-semibold",
                  hasAlerts
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-emerald-50 text-emerald-800 border-emerald-200",
                )}
              >
                {hasAlerts ? "Action needed" : "Healthy"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!hasAlerts ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="h-16 w-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">All customer balances match</h3>
                <p className="text-sm text-slate-500 mt-2 max-w-md leading-relaxed">
                  The nightly integrity check did not find any Statement-of-Account mismatches.
                  You&apos;re clear, nothing to review right now.
                </p>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl text-left">
                  {[
                    {
                      title: "What we compare",
                      body: "Stored customer balance vs recomputed ledger balance",
                    },
                    {
                      title: "When it runs",
                      body: "Automatic nightly scan across all customer accounts",
                    },
                    {
                      title: "If something drifts",
                      body: "It will appear here with stored, computed, and difference values",
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3"
                    >
                      <p className="text-xs font-semibold text-slate-800">{item.title}</p>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/90 hover:bg-slate-50/90">
                      <TableHead className="min-w-[180px]">Customer</TableHead>
                      <TableHead className="text-right">Stored</TableHead>
                      <TableHead className="text-right">Computed</TableHead>
                      <TableHead className="text-right">Difference</TableHead>
                      <TableHead>Detected</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((alert) => {
                      const stored = Number(alert.stored_balance)
                      const computed = Number(alert.computed_balance)
                      const diff = computed - stored
                      return (
                        <TableRow key={alert.id} className="hover:bg-amber-50/30">
                          <TableCell>
                            <div>
                              <p className="font-semibold text-slate-900">{alert.customer_name}</p>
                              <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-[220px]">
                                {alert.customer_id}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-slate-700">
                            Rs {money(stored)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-slate-700">
                            Rs {money(computed)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              className={cn(
                                "font-semibold tabular-nums border",
                                Math.abs(diff) > 0.009
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-slate-50 text-slate-600 border-slate-200",
                              )}
                            >
                              {diff > 0 ? "+" : ""}
                              Rs {money(diff)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-600 text-sm whitespace-nowrap">
                            {format(new Date(alert.detected_at), "dd MMM yyyy, hh:mm a")}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              className="h-8 bg-slate-900 hover:bg-slate-800 text-white"
                              disabled={resolvingId === alert.id}
                              onClick={() => handleResolve(alert.id)}
                            >
                              {resolvingId === alert.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Mark resolved"
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
