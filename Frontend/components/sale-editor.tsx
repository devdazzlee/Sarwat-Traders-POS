"use client";

import { useState, useEffect } from "react";
import { Edit3, Save, Loader2, AlertTriangle, Plus, Minus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import apiClient from "@/lib/apiClient";
import { toast } from "sonner";

interface SaleItem {
  id: string;
  product_id: string;
  product: {
    name: string;
    sku?: string;
  };
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
}

interface Sale {
  id: string;
  sale_number: string;
  total_amount: string | number;
  subtotal: string | number;
  discount_amount: string | number;
  payment_method: string;
  customer?: { id: string; name: string; email: string } | null;
  sale_items: SaleItem[];
}

type EditorLine = SaleItem & {
  price: number;
  quantity: number;
  /** Draft while typing line subtotal; cleared when qty/unit price changes or after blur commit */
  _lineSubtotalDraft?: string;
};

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSaleItems(raw: unknown): EditorLine[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((item: any) => {
    const productId = String(item.product_id ?? item.productId ?? "");
    const unitPrice = num(item.unit_price ?? item.unitPrice);
    const qty = num(item.quantity);
    const lineTotal = num(item.line_total ?? item.lineTotal);
    const computedLine = unitPrice * qty;
    const line = lineTotal > 0 ? lineTotal : computedLine;
    const price = qty > 0 ? line / qty : unitPrice;
    return {
      ...item,
      id: String(item.id ?? ""),
      product_id: productId,
      quantity: qty,
      unit_price: price,
      line_total: line,
      price,
      product: item.product ?? { name: "Unknown product", sku: item.product?.sku },
    };
  });
}

interface SaleEditorProps {
  sale: Sale | null;
  open: boolean;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function SaleEditor({ sale, open, loading = false, onOpenChange, onSuccess }: SaleEditorProps) {
  const [items, setItems] = useState<EditorLine[]>([]);
  const [discount, setDiscount] = useState<number | string>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!sale) {
      setItems([]);
      return;
    }
    const rawItems = (sale as any).sale_items ?? (sale as any).saleItems ?? [];
    setItems(normalizeSaleItems(rawItems));
    setDiscount(num(sale.discount_amount));
    setPaymentMethod(String(sale.payment_method ?? "CASH"));
  }, [sale]);

  const updateItem = (index: number, field: string, value: any) => {
    setItems((prev) => {
      const newItems = [...prev];
      const row = { ...newItems[index], [field]: value };
      if (field === "quantity" || field === "price") {
        delete row._lineSubtotalDraft;
      }
      newItems[index] = row;
      return newItems;
    });
  };

  const setLineSubtotalDraft = (index: number, draft: string) => {
    setItems((prev) => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], _lineSubtotalDraft: draft };
      return newItems;
    });
  };

  const commitLineSubtotal = (index: number) => {
    setItems((prev) => {
      const newItems = [...prev];
      const item = newItems[index];
      if (!item) return prev;
      const raw = item._lineSubtotalDraft;
      const q = num(item.quantity);
      const fallback = num(item.price) * q;
      const v = raw !== undefined ? parseFloat(raw) : fallback;
      const next = { ...item };
      delete next._lineSubtotalDraft;
      if (Number.isFinite(v) && q > 0) {
        next.price = v / q;
        next.unit_price = next.price;
      }
      newItems[index] = next;
      return newItems;
    });
  };

  const lineSubtotalDisplay = (item: EditorLine) => {
    if (item._lineSubtotalDraft !== undefined) return item._lineSubtotalDraft;
    return (num(item.price) * num(item.quantity)).toFixed(2);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      toast.error("A sale must have at least one item.");
      return;
    }
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + num(item.price) * num(item.quantity), 0);
  };

  const calculateTotal = () => {
    return Math.max(0, calculateSubtotal() - num(discount));
  };

  const handleSave = async () => {
    if (!sale) return;

    const missingProduct = items.some((item) => !(item.product_id ?? (item as any).productId));
    if (missingProduct) {
      toast.error("One or more lines are missing a product. Cannot save.");
      return;
    }
    if (items.some((item) => num(item.quantity) <= 0)) {
      toast.error("Each line needs a quantity greater than zero.");
      return;
    }

    setIsSaving(true);

    try {
      await apiClient.patch(`/sale/${sale.id}`, {
        items: items.map((item) => ({
          productId: item.product_id ?? (item as any).productId,
          quantity: num(item.quantity),
          price: num(item.price),
        })),
        discountAmount: num(discount),
        paymentMethod,
      });

      toast.success("Sale adjusted successfully. Ledger has been updated.");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to adjust sale.");
    } finally {
      setIsSaving(false);
    }
  };

  const showForm = sale && !loading;
  const saleLabel = sale?.sale_number ?? "…";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white">
        <DialogHeader className="p-6 border-b">
          <div className="flex justify-between items-center">
            <div>
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-gray-500" />
                Sale Adjustment
                <span className="text-gray-400 font-normal ml-1">#{saleLabel}</span>
              </DialogTitle>
              <DialogDescription className="text-sm mt-1">
                Adjust items and rates. Changes will be reflected in the ledger.
              </DialogDescription>
            </div>
            <Badge variant="secondary" className="font-medium">
              AUDIT MODE
            </Badge>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <p className="text-sm">Loading sale details…</p>
          </div>
        ) : !showForm ? null : (
          <>
            <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-6 min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</label>
                  <div className="p-3 bg-gray-50 rounded-lg border text-sm font-medium">
                    {sale.customer?.name || "Walk-in Customer"}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Method</label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="CREDIT">Credit (Ledger)</SelectItem>
                      <SelectItem value="CARD">Bank Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex-1 border rounded-lg overflow-hidden flex flex-col min-h-[280px]">
                <ScrollArea className="h-[min(360px,45vh)] w-full">
                  <Table>
                    <TableHeader className="bg-gray-50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="text-xs uppercase font-semibold">Product</TableHead>
                        <TableHead className="text-xs uppercase font-semibold w-32">Quantity</TableHead>
                        <TableHead className="text-xs uppercase font-semibold w-40 text-right">Unit Price</TableHead>
                        <TableHead className="text-xs uppercase font-semibold w-44 text-right">Subtotal</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-amber-800 bg-amber-50/80 py-8">
                            No line items were returned for this sale. If this looks wrong, refresh the list and try
                            again, or check that the sale was saved with products.
                          </TableCell>
                        </TableRow>
                      ) : (
                        items.map((item, idx) => (
                          <TableRow key={item.id || idx}>
                            <TableCell>
                              <div className="font-medium">{item.product?.name}</div>
                              <div className="text-xs text-gray-400">SKU: {item.product?.sku || "N/A"}</div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center border rounded-md overflow-hidden h-9">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-full w-8 rounded-none border-r"
                                  onClick={() => updateItem(idx, "quantity", Math.max(0.01, num(item.quantity) - 1))}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number"
                                  step="any"
                                  min={0.01}
                                  className="h-full border-none text-center focus-visible:ring-0 w-14 p-0 rounded-none"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-full w-8 rounded-none border-l"
                                  onClick={() => updateItem(idx, "quantity", num(item.quantity) + 1)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end items-center gap-2">
                                <span className="text-gray-400 text-xs">Rs</span>
                                <Input
                                  type="number"
                                  step="any"
                                  min={0}
                                  className="h-9 w-24 text-right"
                                  value={item.price}
                                  onChange={(e) => updateItem(idx, "price", e.target.value)}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end items-center gap-2">
                                <span className="text-gray-400 text-xs">Rs</span>
                                <Input
                                  type="number"
                                  step="any"
                                  min={0}
                                  className="h-9 w-28 text-right font-medium"
                                  value={lineSubtotalDisplay(item)}
                                  onChange={(e) => setLineSubtotalDraft(idx, e.target.value)}
                                  onBlur={() => commitLineSubtotal(idx)}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-gray-300 hover:text-red-600 h-8 w-8"
                                onClick={() => removeItem(idx)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>

                <div className="p-4 bg-gray-50 border-t space-y-2 shrink-0">
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>Subtotal</span>
                    <span className="font-medium">Rs {calculateSubtotal().toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>Discount</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs">Rs</span>
                      <Input
                        type="number"
                        className="h-8 w-24 text-right"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                        onFocus={() => {
                          if (num(discount) === 0) setDiscount("");
                        }}
                        onBlur={() => {
                          if (discount === "") setDiscount(0);
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t mt-2">
                    <span className="font-semibold text-lg">New Total</span>
                    <span className="font-bold text-xl text-primary">
                      Rs {calculateTotal().toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="h-5 w-5 text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Updating this sale will generate an <strong>ADJUSTMENT</strong> entry in the customer&apos;s ledger.
                  The balance for <strong>{sale.customer?.name || "Walk-in"}</strong> will be updated automatically.
                </p>
              </div>
            </div>

            <DialogFooter className="p-4 border-t bg-gray-50">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving || items.length === 0} className="min-w-[150px]">
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Update Sale
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
