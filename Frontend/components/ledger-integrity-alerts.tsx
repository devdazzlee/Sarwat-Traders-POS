"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageLoader } from "@/components/ui/page-loader"
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import apiClient from "@/lib/apiClient"
import { API_BASE } from "@/config/constants"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"

interface LedgerIntegrityAlert {
  id: string
  customer_id: string
  customer_name: string
  stored_balance: string
  computed_balance: string
  detected_at: string
  resolved: boolean
}

export function LedgerIntegrityAlerts() {
  const { toast } = useToast()
  const [alerts, setAlerts] = useState<LedgerIntegrityAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await apiClient.get(`${API_BASE}/customer-ledger/integrity-alerts`)
      setAlerts(res.data?.data ?? [])
    } catch (error) {
      console.error("Failed to load ledger integrity alerts:", error)
      toast({ title: "Failed to load alerts", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchAlerts()
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

  if (loading) return <PageLoader />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ledger Integrity Alerts</h1>
          <p className="text-sm text-gray-500">
            Customers found by the nightly check whose Statement-of-Account balance disagreed with their stored balance.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {alerts.length === 0 ? "No open alerts" : `${alerts.length} open alert${alerts.length === 1 ? "" : "s"}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-gray-500">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <p>All customer balances match. Nothing to review.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Stored Balance</TableHead>
                  <TableHead>Computed Balance</TableHead>
                  <TableHead>Difference</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => {
                  const stored = Number(alert.stored_balance)
                  const computed = Number(alert.computed_balance)
                  return (
                    <TableRow key={alert.id}>
                      <TableCell className="font-medium">{alert.customer_name}</TableCell>
                      <TableCell>Rs. {stored.toLocaleString()}</TableCell>
                      <TableCell>Rs. {computed.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">Rs. {(computed - stored).toLocaleString()}</Badge>
                      </TableCell>
                      <TableCell>{format(new Date(alert.detected_at), "dd MMM yyyy, hh:mm a")}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resolvingId === alert.id}
                          onClick={() => handleResolve(alert.id)}
                        >
                          {resolvingId === alert.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Mark Resolved"
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
