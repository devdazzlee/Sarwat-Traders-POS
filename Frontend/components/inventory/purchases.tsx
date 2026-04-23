"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Loader2, FileText } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface Supplier {
  id: string;
  name: string;
  code: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
  branch_type?: string;
}

interface Purchase {
  id: string;
  product: Product;
  supplier: { name: string };
  warehouse_branch: { name: string };
  quantity: number;
  cost_price: number;
  sale_price: number;
  purchase_date: string;
  invoice_ref?: string;
  notes?: string;
  delivery_status: string;
  user?: { email: string };
}

export function Purchases() {
  const { toast } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    productId: "",
    supplierId: "",
    startDate: "",
    endDate: "",
  });
  const [form, setForm] = useState({
    productId: "",
    supplierId: "",
    warehouseBranchId: "",
    quantity: "",
    costPrice: "",
    salePrice: "",
    purchaseDate: new Date().toISOString().slice(0, 10),
    invoiceRef: "",
    notes: "",
    deliveryStatus: "COMPLETE" as "PARTIAL" | "COMPLETE",
  });

  const warehouseBranches = branches.filter((b) => b.branch_type === "WAREHOUSE");
  const displayBranches = warehouseBranches.length ? warehouseBranches : branches;

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page: 1, limit: 50 };
      if (filters.productId) params.productId = filters.productId;
      if (filters.supplierId) params.supplierId = filters.supplierId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const res = await apiClient.get(`${API_BASE}/purchases`, { params });
      setPurchases(res.data?.data || []);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to load purchases",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  const fetchMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const [pRes, sRes, bRes] = await Promise.all([
        apiClient.get(`${API_BASE}/products`, { params: { fetch_all: true } }),
        apiClient.get(`${API_BASE}/suppliers`),
        apiClient.get(`${API_BASE}/branches`, { params: { fetch_all: true } }),
      ]);
      const productList = Array.isArray(pRes.data?.data) ? pRes.data.data : (pRes.data?.data?.products || []);
      setProducts(productList.filter((p: any) => p?.id));
      setSuppliers(Array.isArray(sRes.data?.data) ? sRes.data.data : []);
      setBranches(Array.isArray(bRes.data?.data) ? bRes.data.data : (bRes.data?.data || []));
    } catch (e) {
      console.error(e);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleSubmit = async () => {
    const qty = Number(form.quantity);
    const cost = Number(form.costPrice);
    const sale = Number(form.salePrice);
    if (!form.productId || !form.supplierId || !form.warehouseBranchId || !qty || qty <= 0) {
      toast({
        title: "Validation Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`${API_BASE}/purchases`, {
        productId: form.productId,
        supplierId: form.supplierId,
        warehouseBranchId: form.warehouseBranchId,
        quantity: qty,
        costPrice: cost,
        salePrice: sale,
        purchaseDate: form.purchaseDate,
        invoiceRef: form.invoiceRef || undefined,
        notes: form.notes || undefined,
        deliveryStatus: form.deliveryStatus,
      });
      toast({ title: "Success", description: "Purchase logged successfully" });
      setDialogOpen(false);
      setForm({
        productId: "",
        supplierId: "",
        warehouseBranchId: "",
        quantity: "",
        costPrice: "",
        salePrice: "",
        purchaseDate: new Date().toISOString().slice(0, 10),
        invoiceRef: "",
        notes: "",
        deliveryStatus: "COMPLETE",
      });
      fetchPurchases();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to log purchase",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Stock In (Purchases)</h1>
          <p className="text-sm text-gray-600">Log inventory arrivals to warehouse</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Purchase
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Log Purchase</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Product *</Label>
                <Select
                  value={form.productId || "none"}
                  onValueChange={(v) => setForm({ ...form, productId: v === "none" ? "" : v })}
                  disabled={metaLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={metaLoading ? "Loading products..." : "Select product"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select product</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Supplier *</Label>
                <Select
                  value={form.supplierId || "none"}
                  onValueChange={(v) => setForm({ ...form, supplierId: v === "none" ? "" : v })}
                  disabled={metaLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={metaLoading ? "Loading..." : "Select supplier"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select supplier</SelectItem>
                    {suppliers.filter((s: any) => s?.id).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Warehouse *</Label>
                <Select
                  value={form.warehouseBranchId || "none"}
                  onValueChange={(v) => setForm({ ...form, warehouseBranchId: v === "none" ? "" : v })}
                  disabled={metaLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={metaLoading ? "Loading..." : "Select warehouse"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select warehouse</SelectItem>
                    {displayBranches.filter((b: any) => b?.id).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} {b.branch_type === "WAREHOUSE" ? "(Warehouse)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    min={0.01}
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Purchase Date</Label>
                  <Input
                    type="date"
                    value={form.purchaseDate}
                    onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cost Price *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.costPrice}
                    onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Sale Price *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.salePrice}
                    onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Invoice / Reference No</Label>
                <Input
                  value={form.invoiceRef}
                  onChange={(e) => setForm({ ...form, invoiceRef: e.target.value })}
                  placeholder="Invoice number"
                />
              </div>
              <div>
                <Label>Delivery Status</Label>
                <Select
                  value={form.deliveryStatus}
                  onValueChange={(v: "PARTIAL" | "COMPLETE") =>
                    setForm({ ...form, deliveryStatus: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMPLETE">Complete</SelectItem>
                    <SelectItem value="PARTIAL">Partial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Logging...
                  </>
                ) : (
                  "Log Purchase"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={filters.supplierId || "all"}
          onValueChange={(v) => setFilters({ ...filters, supplierId: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          className="w-40"
        />
        <Input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          className="w-40"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageLoader message="Loading purchases..." />
          ) : purchases.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No purchases found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{new Date(p.purchase_date).toLocaleDateString()}</TableCell>
                      <TableCell>{p.product?.name}</TableCell>
                      <TableCell>{p.supplier?.name}</TableCell>
                      <TableCell>{p.warehouse_branch?.name}</TableCell>
                      <TableCell>{Number(p.quantity)}</TableCell>
                      <TableCell>Rs {Number(p.cost_price).toFixed(2)}</TableCell>
                      <TableCell>{p.invoice_ref || "—"}</TableCell>
                      <TableCell>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
                          {p.delivery_status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
