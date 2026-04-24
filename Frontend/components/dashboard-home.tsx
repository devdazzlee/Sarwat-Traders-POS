"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LoadingButton } from "@/components/ui/loading-button"
import { Button } from "@/components/ui/button"
import { PageLoader } from "@/components/ui/page-loader"
import { useLoading } from "@/hooks/use-loading"
import { useToast } from "@/hooks/use-toast"
import { DollarSign, ShoppingCart, Users, Package, TrendingUp, TrendingDown, RefreshCw, Download, Truck, Plus, CreditCard, Banknote, Receipt } from "lucide-react"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import apiClient from "@/lib/apiClient"
import { normalizeUserRole, type UserRole } from "@/lib/role-utils"

const PURCHASE_ENTRY_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"]
const TRANSFER_ENTRY_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"]
const STOCK_OUT_ENTRY_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"]
const INVENTORY_NAV_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
]

interface TopProduct {
  id: string
  name: string
  sku: string
  sales_rate_inc_dis_and_tax: string
  _count: {
    order_items: number
  }
}

interface RecentSale {
  productName: string
  price: string
}

interface DashboardStats {
  totalCustomers: number
  lowStockProducts: Array<{
    id: string
    current_quantity: number
    product: {
      name: string
      sku: string
    }
  }>
  todaySales: any[]
  dailyRevenue: number
  dailyCredit: number
  dailyExpense: number
}

interface DashboardHomeProps {
  onNavigate?: (tab: string) => void;
}

export function DashboardHome({ onNavigate }: DashboardHomeProps) {
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [role, setRole] = useState<UserRole | null>(null)

  const { loading: refreshLoading, withLoading: withRefreshLoading } = useLoading()
  const { loading: exportLoading, withLoading: withExportLoading } = useLoading()
  const { toast } = useToast()
  const canOpenInventory = role ? INVENTORY_NAV_ROLES.includes(role) : false

  const getTopProducts = async () => {
    try {
      const response = await apiClient.get('/products/best-selling')
      if (response?.data?.success) {
        setTopProducts(response.data.data || [])
      }
    } catch (error: any) {
      console.error("❌ Error fetching top products:", error)
    }
  }

  const getRecentSales = async () => {
    try {
      const response = await apiClient.get('/sale/recent')
      if (response?.data?.success) {
        setRecentSales(response.data.data || [])
      } else {
        setRecentSales([])
      }
    } catch (error: any) {
      console.error("❌ Error fetching recent sales:", error.response?.data || error.message)
      setRecentSales([])
    }
  }

  const getStats = async () => {
    try {
      const response = await apiClient.get('/dashboard/stats')
      if (response?.data?.success) {
        setStats(response.data.data || null)
      } else {
        setStats(null)
      }
    } catch (error: any) {
      console.error("❌ Error fetching stats:", error.response?.data || error.message)
      setStats(null)
    }
  }

  const loadAllData = async () => {
    await Promise.all([
      getTopProducts(),
      getRecentSales(),
      getStats()
    ])
    setInitialLoading(false)
  }

  useEffect(() => {
    setRole(normalizeUserRole(localStorage.getItem("role")))
    loadAllData()
  }, [])

  const handleRefreshData = async () => {
    await withRefreshLoading(async () => {
      try {
        await loadAllData()
        toast({
          variant: "success",
          title: "Data Refreshed",
          description: "Dashboard data has been updated successfully",
        })
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Refresh Failed",
          description: "Could not refresh dashboard data",
        })
      }
    })
  }

  const generateReport = async () => {
    if (!stats || !topProducts || !recentSales) return

    const { jsPDF } = await import("jspdf")
    const doc = new jsPDF({ unit: "mm", format: "a4" })
    let y = 15

    doc.setFont("helvetica", "bold")
    doc.setFontSize(18)
    doc.text("SARWAT TRADERS POS SYSTEM", 14, y)
    y += 8
    doc.setFontSize(14)
    doc.text("Daily Sales Report", 14, y)
    y += 8

    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y)
    y += 8
    doc.line(14, y, 196, y)
    y += 8

    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.text("Summary", 14, y)
    y += 6
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    const summaryLines = [
      `- Total Customers: ${stats.totalCustomers}`,
      `- Low Stock Items: ${stats.lowStockProducts.length}`,
      `- Today's Transactions: ${stats.todaySales.length}`,
      `- Daily Revenue: Rs ${(stats.dailyRevenue || 0).toFixed(2)}`,
      `- Daily Credit: Rs ${(stats.dailyCredit || 0).toFixed(2)}`,
      `- Daily Expenses: Rs ${(stats.dailyExpense || 0).toFixed(2)}`,
    ]
    summaryLines.forEach((line) => {
      doc.text(line, 16, y)
      y += 5
    })
    y += 2

    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.text("Recent Transactions", 14, y)
    y += 6
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    const transactions = recentSales.length
      ? recentSales.map((sale) => `- ${sale.productName} - Rs ${sale.price}`)
      : ["- No recent transactions"]
    transactions.forEach((line) => {
      if (y > 275) { doc.addPage(); y = 15 }
      const wrapped = doc.splitTextToSize(line, 178)
      doc.text(wrapped, 16, y)
      y += wrapped.length * 5
    })
    y += 2

    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.text("Top Products", 14, y)
    y += 6
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    const productLines = topProducts.length
      ? topProducts.slice(0, 5).map((product, index) =>
          `${index + 1}. ${product.name} - ${product._count.order_items} orders - Rs ${product.sales_rate_inc_dis_and_tax}`,
        )
      : ["No top products data"]
    productLines.forEach((line) => {
      if (y > 275) { doc.addPage(); y = 15 }
      const wrapped = doc.splitTextToSize(line, 178)
      doc.text(wrapped, 16, y)
      y += wrapped.length * 5
    })

    doc.save(`daily-sales-report-${Date.now()}.pdf`)
  }

  const handleExportReport = async () => {
    await withExportLoading(async () => {
      try {
        await generateReport()
        toast({
          variant: "success",
          title: "Report Exported",
          description: "Daily sales report PDF has been downloaded successfully",
        })
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Export Failed",
          description: "Could not generate the report",
        })
      }
    })
  }

  const formatCurrency = (amount: string | number) => `Rs ${Number(amount).toFixed(2)}`

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm md:text-base text-gray-600">
            Welcome back! Here's what's happening today.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <LoadingButton
            variant="outline"
            onClick={handleRefreshData}
            loading={refreshLoading}
            loadingText="Refreshing..."
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </LoadingButton>
          <LoadingButton onClick={handleExportReport} loading={exportLoading} loadingText="Generating...">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </LoadingButton>
        </div>
      </div>

      {/* Stats Cards — Row 1: Counts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {initialLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.todaySales?.length || 0}</div>
                <p className="text-xs text-gray-500 mt-1">Transactions in last 24h</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Transactions</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{recentSales.length}</div>
                <p className="text-xs text-gray-500 mt-1">Latest 5 transactions</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalCustomers || 0}</div>
                <p className="text-xs text-gray-500 mt-1">Registered customers</p>
              </CardContent>
            </Card>

            <Card
              className={`transition-shadow ${canOpenInventory ? "cursor-pointer hover:shadow-md" : "hover:shadow-md"}`}
              onClick={() => { if (canOpenInventory) { onNavigate?.("inventory-dashboard") } }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
                <Package className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{stats?.lowStockProducts?.length || 0}</div>
                {onNavigate && canOpenInventory && (
                  <p className="text-xs text-blue-600 mt-1">View inventory →</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Stats Cards — Row 2: Financial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        {initialLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card className="hover:shadow-md transition-shadow border-blue-200 bg-blue-50/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-800">Total Revenue (Today)</CardTitle>
                <Banknote className="h-5 w-5 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-700">{formatCurrency(stats?.dailyRevenue || 0)}</div>
                <p className="text-xs text-blue-500 mt-1">All cash + credit sales</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow border-amber-200 bg-amber-50/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-amber-800">Credit Sales (Today)</CardTitle>
                <CreditCard className="h-5 w-5 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-700">{formatCurrency(stats?.dailyCredit || 0)}</div>
                <p className="text-xs text-amber-500 mt-1">Unpaid credit transactions</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow border-red-200 bg-red-50/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-red-800">Expenses (Today)</CardTitle>
                <Receipt className="h-5 w-5 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-700">{formatCurrency(stats?.dailyExpense || 0)}</div>
                <p className="text-xs text-red-500 mt-1">Total outgoing cash</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Quick Actions */}
      {onNavigate && role && (
        <div className="flex flex-wrap gap-2">
          {PURCHASE_ENTRY_ROLES.includes(role) && (
            <Button variant="outline" size="sm" onClick={() => onNavigate("purchases")}>
              <Plus className="h-4 w-4 mr-1" />
              New Purchase
            </Button>
          )}
          {TRANSFER_ENTRY_ROLES.includes(role) && (
            <Button variant="outline" size="sm" onClick={() => onNavigate("transfers")}>
              <Truck className="h-4 w-4 mr-1" />
              New Transfer
            </Button>
          )}
          {STOCK_OUT_ENTRY_ROLES.includes(role) && (
            <Button variant="outline" size="sm" onClick={() => onNavigate("stock-out")}>
              <Package className="h-4 w-4 mr-1" />
              Stock Out
            </Button>
          )}
        </div>
      )}

      {/* Recent Sales + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Sales
              <Badge variant="secondary">{recentSales.length} transactions</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentSales.slice(0, 5).map((sale, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <div className="font-medium text-sm">{sale.productName}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(sale.price)}</div>
                    <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                      completed
                    </Badge>
                  </div>
                </div>
              ))}
              {recentSales.length === 0 && (
                <div className="text-center text-gray-500 py-4">No recent sales</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Top Products
              <Badge variant="secondary">Best sellers</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topProducts.slice(0, 5).map((product, index) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Badge variant="secondary">#{index + 1}</Badge>
                    <div>
                      <div className="font-medium flex items-center space-x-2">
                        <span>{product.name}</span>
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      </div>
                      <div className="text-sm text-gray-500">{product._count.order_items} orders</div>
                    </div>
                  </div>
                  <div className="font-medium">{formatCurrency(product.sales_rate_inc_dis_and_tax)}</div>
                </div>
              ))}
              {topProducts.length === 0 && (
                <div className="text-center text-gray-500 py-4">No top products data</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
