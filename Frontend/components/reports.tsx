"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageLoader } from "@/components/ui/page-loader"
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  Download,
  Loader2,
  Mail,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Filter,
  CalendarDays,
} from "lucide-react"
import { cn } from "@/lib/utils"
import apiClient from "@/lib/apiClient"
import { formatReportingPeriodStartLabel, getReportingPeriodForCalendarDate } from "@/lib/reporting-period"
import { useToast } from "@/hooks/use-toast"
import { shareAnalyticsReportOnEmail, type AnalyticsReportData } from "@/lib/pdf-generator"
import { downloadReportsExcel, downloadReportsPdf, type ReportsExportData } from "@/lib/reports-export"
import { format, subDays, startOfMonth, endOfMonth } from "date-fns"

interface DailySale {
  date: string
  sales: number
  orders: number
  customers: number
}

interface TopProduct {
  name: string
  quantity: number
  revenue: number
  percentage: number
  margin?: number
  cogs?: number
}

interface CategorySale {
  category: string
  sales: number
  percentage: number
}

interface EmployeePerformance {
  name: string
  sales: number
  orders: number
  avgOrder: number
}

type DatePreset = "today" | "7d" | "30d" | "month" | "custom"

const money = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function toInputDate(d: Date) {
  return format(d, "yyyy-MM-dd")
}

function datesForPreset(preset: DatePreset): { from: string; to: string } {
  const today = new Date()
  if (preset === "today") {
    const d = toInputDate(today)
    return { from: d, to: d }
  }
  if (preset === "7d") {
    return { from: toInputDate(subDays(today, 6)), to: toInputDate(today) }
  }
  if (preset === "30d") {
    return { from: toInputDate(subDays(today, 29)), to: toInputDate(today) }
  }
  if (preset === "month") {
    return { from: toInputDate(startOfMonth(today)), to: toInputDate(endOfMonth(today)) }
  }
  return { from: toInputDate(subDays(today, 6)), to: toInputDate(today) }
}

function eachCalendarDay(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
  const days: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    days.push(toInputDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export function Reports() {
  const { toast } = useToast()
  const initial = datesForPreset("7d")

  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<"pdf" | "excel" | "email" | null>(null)
  const [preset, setPreset] = useState<DatePreset>("7d")
  const [dateFrom, setDateFrom] = useState(initial.from)
  const [dateTo, setDateTo] = useState(initial.to)
  const [paymentMethod, setPaymentMethod] = useState("ALL")
  const [appliedFrom, setAppliedFrom] = useState(initial.from)
  const [appliedTo, setAppliedTo] = useState(initial.to)
  const [appliedPayment, setAppliedPayment] = useState("ALL")

  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalCogs, setTotalCogs] = useState(0)
  const [grossMargin, setGrossMargin] = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [avgOrderValue, setAvgOrderValue] = useState(0)
  const [uniqueCustomers, setUniqueCustomers] = useState(0)
  const [dailySales, setDailySales] = useState<DailySale[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [categoryWiseSales, setCategoryWiseSales] = useState<CategorySale[]>([])
  const [employeePerformance, setEmployeePerformance] = useState<EmployeePerformance[]>([])

  const dateRangeLabel = useMemo(() => {
    if (appliedFrom === appliedTo) return format(new Date(`${appliedFrom}T00:00:00`), "dd MMM yyyy")
    return `${format(new Date(`${appliedFrom}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${appliedTo}T00:00:00`), "dd MMM yyyy")}`
  }, [appliedFrom, appliedTo])

  const applyPreset = (next: DatePreset) => {
    setPreset(next)
    if (next === "custom") return
    const { from, to } = datesForPreset(next)
    setDateFrom(from)
    setDateTo(to)
  }

  const fetchReportsData = useCallback(async (from: string, to: string, method: string) => {
    setLoading(true)
    try {
      const userRole = localStorage.getItem("role")
      const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN"

      const params: Record<string, string | boolean | number> = {
        fetch_all: true,
        startDate: from,
        endDate: to,
        limit: 10,
      }

      if (method && method !== "ALL") {
        params.paymentMethod = method
      }

      if (!isAdmin) {
        const branchStr = localStorage.getItem("branch")
        if (branchStr && branchStr !== "Not Found") {
          try {
            const branchObj = JSON.parse(branchStr)
            params.branch_id = branchObj.id || branchStr
          } catch {
            params.branch_id = branchStr
          }
        }
      }

      const reportsRes = await apiClient.get("/reports", { params })
      const reportsData = reportsRes.data?.data || {}
      const sales = reportsData.sales || []
      const bestSellingProducts = reportsData.bestSellingProducts || []
      const stats = reportsData.stats || {}

      const revenue =
        stats.totalRevenue ||
        sales.reduce((sum: number, sale: any) => sum + Math.abs(Number(sale.total_amount || 0)), 0)
      const orders = stats.totalSales || sales.length
      const avgOrder = orders > 0 ? revenue / orders : 0
      const uniqueCusts =
        stats.uniqueCustomers ||
        new Set(sales.map((sale: any) => sale.customer_id || sale.customer?.id).filter(Boolean)).size

      setTotalRevenue(revenue)
      setTotalCogs(stats.totalCogs || 0)
      setGrossMargin(stats.grossMargin || 0)
      setTotalOrders(orders)
      setAvgOrderValue(avgOrder)
      setUniqueCustomers(uniqueCusts)

      const days = eachCalendarDay(from, to)
      const dailySalesData: DailySale[] = days.map((day) => {
        const period = getReportingPeriodForCalendarDate(day)
        const daySales = sales.filter((sale: any) => {
          const saleDateField = sale.sale_date || sale.created_at || sale.createdAt || sale.date
          if (!saleDateField) return false
          const d = new Date(saleDateField)
          if (Number.isNaN(d.getTime())) return false
          // Calendar-day match (local) — keeps the HTML date picker intuitive
          const saleDay = toInputDate(d)
          return saleDay === day
        })

        return {
          date: formatReportingPeriodStartLabel(period),
          sales: daySales.reduce((sum: number, sale: any) => sum + Math.abs(Number(sale.total_amount || 0)), 0),
          orders: daySales.length,
          customers: new Set(daySales.map((s: any) => s.customer_id || s.customer?.id).filter(Boolean)).size,
        }
      })
      setDailySales(dailySalesData.reverse())

      const totalProductRevenue = bestSellingProducts.reduce((sum: number, p: any) => {
        return sum + Number(p.price || 0) * Number(p.quantity_sold || 0)
      }, 0)

      setTopProducts(
        bestSellingProducts.slice(0, 5).map((product: any) => {
          const quantity = product.quantity_sold || 0
          const price = product.price || 0
          const cost = product.purchase_rate || 0
          const prodRevenue = price * quantity
          return {
            name: product.name || "Unknown",
            quantity,
            revenue: prodRevenue,
            cogs: cost * quantity,
            margin: prodRevenue - cost * quantity,
            percentage: totalProductRevenue > 0 ? (prodRevenue / totalProductRevenue) * 100 : 0,
          }
        }),
      )

      const categoryMap = new Map<string, number>()
      sales.forEach((sale: any) => {
        const saleItems = sale.sale_items || sale.items || []
        saleItems.forEach((item: any) => {
          const categoryName =
            item.product?.category?.name ||
            item.product?.category_name ||
            item.category?.name ||
            item.category_name ||
            "Uncategorized"
          const itemTotal = Math.abs(
            Number(
              item.line_total ||
                item.total ||
                Number(item.unit_price || item.price || 0) * Number(item.quantity || 0) ||
                0,
            ),
          )
          categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + itemTotal)
        })
      })

      const totalCategorySales = Array.from(categoryMap.values()).reduce((sum, val) => sum + val, 0)
      setCategoryWiseSales(
        Array.from(categoryMap.entries())
          .map(([category, catSales]) => ({
            category,
            sales: catSales,
            percentage: totalCategorySales > 0 ? (catSales / totalCategorySales) * 100 : 0,
          }))
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 5),
      )

      const employeeMap = new Map<string, { name: string; sales: number; orders: number }>()
      sales.forEach((sale: any) => {
        const name = sale.user?.email || sale.created_by_email || "Unassigned"
        const key = sale.user?.id || sale.created_by || name
        const current = employeeMap.get(key) || { name, sales: 0, orders: 0 }
        current.sales += Math.abs(Number(sale.total_amount || 0))
        current.orders += 1
        employeeMap.set(key, current)
      })
      setEmployeePerformance(
        Array.from(employeeMap.values())
          .map((e) => ({
            ...e,
            avgOrder: e.orders > 0 ? e.sales / e.orders : 0,
          }))
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 8),
      )
    } catch (error: any) {
      console.error("Error fetching reports data:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.message || "Failed to load reports data. Please try again.",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchReportsData(appliedFrom, appliedTo, appliedPayment)
  }, [appliedFrom, appliedTo, appliedPayment, fetchReportsData])

  const handleApplyFilters = () => {
    if (!dateFrom || !dateTo) {
      toast({ variant: "destructive", title: "Select dates", description: "From and To dates are required." })
      return
    }
    if (dateFrom > dateTo) {
      toast({
        variant: "destructive",
        title: "Invalid range",
        description: "From date cannot be after To date.",
      })
      return
    }
    setAppliedFrom(dateFrom)
    setAppliedTo(dateTo)
    setAppliedPayment(paymentMethod)
    setPreset("custom")
  }

  const handleClearFilters = () => {
    const next = datesForPreset("7d")
    setPreset("7d")
    setDateFrom(next.from)
    setDateTo(next.to)
    setPaymentMethod("ALL")
    setAppliedFrom(next.from)
    setAppliedTo(next.to)
    setAppliedPayment("ALL")
  }

  const buildAnalyticsPayload = (): AnalyticsReportData => ({
    storeName: "SARWAT TRADER",
    dateRange: dateRangeLabel,
    totalRevenue,
    totalOrders,
    avgOrderValue,
    uniqueCustomers,
    grossMargin,
    topProducts: topProducts.map((p) => ({
      name: p.name,
      revenue: p.revenue,
      quantity: p.quantity,
    })),
  })

  const buildExportData = (): ReportsExportData => ({
    storeName: "SARWAT TRADER",
    dateRangeLabel,
    paymentMethodLabel: appliedPayment === "ALL" ? "All methods" : appliedPayment,
    metrics: {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      uniqueCustomers,
      totalCogs,
      grossMargin,
    },
    dailySales,
    topProducts,
    categories: categoryWiseSales,
    employees: employeePerformance,
  })

  const exportPdf = async () => {
    setExporting("pdf")
    try {
      await downloadReportsPdf(buildExportData())
      toast({ title: "PDF exported", description: "Branded report downloaded successfully." })
    } catch (e) {
      console.error(e)
      toast({ variant: "destructive", title: "Export failed", description: "Could not create PDF." })
    } finally {
      setExporting(null)
    }
  }

  const exportExcel = async () => {
    setExporting("excel")
    try {
      downloadReportsExcel(buildExportData())
      toast({ title: "Excel exported", description: "Workbook with all report sheets downloaded." })
    } catch (e) {
      console.error(e)
      toast({ variant: "destructive", title: "Export failed", description: "Could not create Excel file." })
    } finally {
      setExporting(null)
    }
  }

  const emailReport = async () => {
    setExporting("email")
    try {
      await shareAnalyticsReportOnEmail(buildAnalyticsPayload())
      toast({ title: "Report shared", description: "PDF ready to send by email." })
    } catch {
      toast({ variant: "destructive", title: "Failed to share report" })
    } finally {
      setExporting(null)
    }
  }

  if (loading && dailySales.length === 0 && totalOrders === 0) {
    return <PageLoader message="Loading reports..." />
  }

  const marginPct = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-100 via-slate-50 to-white">
      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-slate-900 text-white overflow-hidden shadow-lg">
          <div className="relative px-5 py-5 md:px-7 md:py-6">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.25),_transparent_55%)]" />
            <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium tracking-wide uppercase text-emerald-200 mb-2">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Business Insights
                </div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Reports & Analytics</h1>
                <p className="text-sm text-slate-300 mt-1">
                  Showing <span className="text-white font-medium">{dateRangeLabel}</span>
                  {appliedPayment !== "ALL" ? (
                    <>
                      {" "}
                      · Payment <span className="text-emerald-300 font-medium">{appliedPayment}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="h-9 bg-white/10 text-white border-white/20 hover:bg-white/20"
                  onClick={() => fetchReportsData(appliedFrom, appliedTo, appliedPayment)}
                  disabled={loading || !!exporting}
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refresh
                </Button>
                <Button
                  variant="secondary"
                  className="h-9 bg-white/10 text-white border-white/20 hover:bg-white/20"
                  onClick={emailReport}
                  disabled={!!exporting || loading}
                >
                  {exporting === "email" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Email
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="h-9 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold" disabled={!!exporting || loading}>
                      {exporting === "pdf" || exporting === "excel" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={exportPdf}>
                      <FileText className="h-4 w-4 mr-2 text-rose-600" />
                      Export PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportExcel}>
                      <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />
                      Export Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Filter className="h-4 w-4 text-emerald-600" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["today", "Today"],
                  ["7d", "Last 7 days"],
                  ["30d", "Last 30 days"],
                  ["month", "This month"],
                  ["custom", "Custom"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors",
                    preset === key
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="report-from" className="text-xs text-slate-500 flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> From
                </Label>
                <input
                  id="report-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setPreset("custom")
                  }}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-to" className="text-xs text-slate-500 flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> To
                </Label>
                <input
                  id="report-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setPreset("custom")
                  }}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Payment method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-10 bg-white">
                    <SelectValue placeholder="All methods" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All methods</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="CREDIT">Credit</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
                <Button
                  className="h-10 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleApplyFilters}
                  disabled={loading}
                >
                  Apply filters
                </Button>
                <Button variant="outline" className="h-10" onClick={handleClearFilters} disabled={loading}>
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50 to-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-emerald-800">Total Revenue</CardTitle>
              <div className="rounded-lg bg-emerald-100 p-2">
                <DollarSign className="h-4 w-4 text-emerald-700" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">Rs {money(totalRevenue)}</div>
              <p className="text-xs text-slate-500 mt-1">For selected date range</p>
            </CardContent>
          </Card>

          <Card className="border-sky-100 bg-gradient-to-br from-sky-50 to-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-sky-800">Total Orders</CardTitle>
              <div className="rounded-lg bg-sky-100 p-2">
                <ShoppingCart className="h-4 w-4 text-sky-700" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">{totalOrders.toLocaleString()}</div>
              <p className="text-xs text-slate-500 mt-1">Completed sales</p>
            </CardContent>
          </Card>

          <Card className="border-amber-100 bg-gradient-to-br from-amber-50 to-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-amber-800">Avg Order Value</CardTitle>
              <div className="rounded-lg bg-amber-100 p-2">
                <TrendingUp className="h-4 w-4 text-amber-700" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">Rs {money(avgOrderValue)}</div>
              <p className="text-xs text-slate-500 mt-1">Revenue ÷ orders</p>
            </CardContent>
          </Card>

          <Card className="border-orange-100 bg-gradient-to-br from-orange-50 to-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-800">Unique Customers</CardTitle>
              <div className="rounded-lg bg-orange-100 p-2">
                <Users className="h-4 w-4 text-orange-700" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">{uniqueCustomers.toLocaleString()}</div>
              <p className="text-xs text-slate-500 mt-1">Buyers in this period</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Daily Sales</CardTitle>
              <p className="text-xs text-slate-500">Day-by-day breakdown for the selected range</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-1">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Customers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailySales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-slate-400">
                          No sales in this range
                        </TableCell>
                      </TableRow>
                    ) : (
                      dailySales.map((day) => (
                        <TableRow key={day.date}>
                          <TableCell className="font-medium text-slate-800">
                            {format(new Date(`${day.date}T00:00:00`), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">Rs {money(day.sales)}</TableCell>
                          <TableCell className="text-right tabular-nums">{day.orders}</TableCell>
                          <TableCell className="text-right tabular-nums">{day.customers}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top Selling Products</CardTitle>
              <p className="text-xs text-slate-500">Highest quantity sold in this period</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topProducts.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">No product data available</div>
                ) : (
                  topProducts.map((product, index) => (
                    <div
                      key={`${product.name}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-sky-700" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">{product.name}</p>
                          <p className="text-xs text-slate-500">{product.quantity} units · {product.percentage.toFixed(1)}%</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-slate-900 tabular-nums">Rs {money(product.revenue)}</p>
                        {product.margin !== undefined && (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 mt-1">
                            Profit Rs {money(product.margin)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <Card className="border-emerald-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-emerald-50/80 border-b border-emerald-100 pb-3">
              <CardTitle className="text-emerald-900 flex items-center gap-2 text-base">
                <DollarSign className="h-5 w-5" />
                Profit & Loss Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <span className="text-slate-600 font-medium">Gross Revenue</span>
                <span className="text-slate-900 font-bold tabular-nums">Rs {money(totalRevenue)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-3 text-rose-600">
                <span className="font-medium">Cost of Goods Sold</span>
                <span className="font-bold tabular-nums">− Rs {money(totalCogs)}</span>
              </div>
              <div className="flex justify-between items-center rounded-xl bg-slate-50 border border-slate-100 p-4">
                <span className="text-slate-900 font-bold uppercase tracking-wide text-sm">Gross Margin</span>
                <span className={cn("font-black text-xl tabular-nums", grossMargin >= 0 ? "text-emerald-600" : "text-rose-500")}>
                  Rs {money(grossMargin)}
                </span>
              </div>
              {totalRevenue > 0 && (
                <div className="text-center">
                  <Badge className="bg-slate-900 text-white font-semibold px-4 py-1.5">
                    Net Margin {marginPct.toFixed(2)}%
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Category-wise Sales</CardTitle>
              <p className="text-xs text-slate-500">Share of revenue by category</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {categoryWiseSales.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">No category data available</div>
                ) : (
                  categoryWiseSales.map((category, index) => (
                    <div key={`${category.category}-${index}`} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="rounded-lg bg-emerald-100 p-2 shrink-0">
                          <BarChart3 className="h-4 w-4 text-emerald-700" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 truncate">{category.category}</p>
                          <div className="mt-1.5 h-2 w-full max-w-[180px] rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.min(100, category.percentage)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-slate-900 tabular-nums">Rs {money(category.sales)}</p>
                        <Badge variant="secondary" className="mt-1">
                          {category.percentage.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Employee Performance</CardTitle>
            <p className="text-xs text-slate-500">Sales attributed to each cashier / user</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Avg Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeePerformance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-10 text-slate-400">
                        No employee performance data for this range
                      </TableCell>
                    </TableRow>
                  ) : (
                    employeePerformance.map((employee, index) => (
                      <TableRow key={`${employee.name}-${index}`}>
                        <TableCell className="font-medium">{employee.name}</TableCell>
                        <TableCell className="text-right tabular-nums">Rs {money(employee.sales)}</TableCell>
                        <TableCell className="text-right tabular-nums">{employee.orders}</TableCell>
                        <TableCell className="text-right tabular-nums">Rs {money(employee.avgOrder)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
