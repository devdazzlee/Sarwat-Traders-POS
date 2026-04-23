"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Plus, RotateCcw, Loader2 } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface Branch {
  id: string;
  name: string;
}

const STOCK_OUT_REASONS = [
  { value: "SALE", label: "Sale" },
  { value: "DAMAGE", label: "Damage" },
  { value: "LOSS", label: "Loss" },
  { value: "EXPIRED", label: "Expired" },
] as const;

export function StockOut() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);
  const [outDialogOpen, setOutDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [outForm, setOutForm] = useState({
    productId: "",
    branchId: "",
    quantity: "",
    reason: "SALE" as (typeof STOCK_OUT_REASONS)[number]["value"],
    notes: "",
  });
  const [returnForm, setReturnForm] = useState({
    productId: "",
    branchId: "",
    quantity: "",
    notes: "",
  });

  const fetchMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const [pRes, bRes] = await Promise.all([
        apiClient.get(`${API_BASE}/products`, { params: { fetch_all: true } }),
        apiClient.get(`${API_BASE}/branches`, { params: { fetch_all: true } }),
      ]);
      const productList = Array.isArray(pRes.data?.data) ? pRes.data.data : (pRes.data?.data?.products || []);
      setProducts((productList || []).filter((p: any) => p?.id));
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

  const handleStockOut = async () => {
    const qty = Number(outForm.quantity);
    if (!outForm.productId || !outForm.branchId || !qty || qty <= 0) {
      toast({
        title: "Validation Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`${API_BASE}/stock-out/out`, {
        productId: outForm.productId,
        branchId: outForm.branchId,
        quantity: qty,
        reason: outForm.reason,
        notes: outForm.notes || undefined,
      });
      toast({ title: "Success", description: "Stock out logged successfully" });
      setOutDialogOpen(false);
      setOutForm({ productId: "", branchId: "", quantity: "", reason: "SALE", notes: "" });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to log stock out",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async () => {
    const qty = Number(returnForm.quantity);
    if (!returnForm.productId || !returnForm.branchId || !qty || qty <= 0) {
      toast({
        title: "Validation Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`${API_BASE}/stock-out/return`, {
        productId: returnForm.productId,
        branchId: returnForm.branchId,
        quantity: qty,
        notes: returnForm.notes || undefined,
      });
      toast({ title: "Success", description: "Return logged successfully" });
      setReturnDialogOpen(false);
      setReturnForm({ productId: "", branchId: "", quantity: "", notes: "" });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to log return",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Branch Stock Out</h1>
        <p className="text-sm text-gray-600">
          Log stock leaving a branch (Sale, Damage, Loss, Expiry) or record returns
        </p>
      </div>

      <Tabs defaultValue="out">
        <TabsList>
          <TabsTrigger value="out">Stock Out</TabsTrigger>
          <TabsTrigger value="return">Returns</TabsTrigger>
        </TabsList>
        <TabsContent value="out">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Log Stock Out
              </CardTitle>
              <p className="text-sm text-gray-500">
                Deduct stock from a branch (sale, damage, loss, expiry)
              </p>
            </CardHeader>
            <CardContent>
              <Dialog open={outDialogOpen} onOpenChange={setOutDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Log Stock Out
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log Stock Out</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Product *</Label>
                      <Select
                        value={outForm.productId || "none"}
                        onValueChange={(v) => setOutForm({ ...outForm, productId: v === "none" ? "" : v })}
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
                      <Label>Branch *</Label>
                      <Select
                        value={outForm.branchId || "none"}
                        onValueChange={(v) => setOutForm({ ...outForm, branchId: v === "none" ? "" : v })}
                        disabled={metaLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={metaLoading ? "Loading..." : "Select branch"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select branch</SelectItem>
                          {branches.filter((b: any) => b?.id).map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min={0.01}
                        value={outForm.quantity}
                        onChange={(e) => setOutForm({ ...outForm, quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Reason *</Label>
                      <Select
                        value={outForm.reason}
                        onValueChange={(v: any) => setOutForm({ ...outForm, reason: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STOCK_OUT_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Input
                        value={outForm.notes}
                        onChange={(e) => setOutForm({ ...outForm, notes: e.target.value })}
                      />
                    </div>
                    <Button onClick={handleStockOut} disabled={submitting} className="w-full">
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Logging...
                        </>
                      ) : (
                        "Log Stock Out"
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="return">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5" />
                Log Return
              </CardTitle>
              <p className="text-sm text-gray-500">
                Re-add stock to a branch (reverse entry when stock comes back)
              </p>
            </CardHeader>
            <CardContent>
              <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Log Return
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log Return</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Product *</Label>
                      <Select
                        value={returnForm.productId || "none"}
                        onValueChange={(v) => setReturnForm({ ...returnForm, productId: v === "none" ? "" : v })}
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
                      <Label>Branch *</Label>
                      <Select
                        value={returnForm.branchId || "none"}
                        onValueChange={(v) => setReturnForm({ ...returnForm, branchId: v === "none" ? "" : v })}
                        disabled={metaLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={metaLoading ? "Loading..." : "Select branch"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select branch</SelectItem>
                          {branches.filter((b: any) => b?.id).map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min={0.01}
                        value={returnForm.quantity}
                        onChange={(e) => setReturnForm({ ...returnForm, quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Input
                        value={returnForm.notes}
                        onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
                      />
                    </div>
                    <Button onClick={handleReturn} disabled={submitting} className="w-full">
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Logging...
                        </>
                      ) : (
                        "Log Return"
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
