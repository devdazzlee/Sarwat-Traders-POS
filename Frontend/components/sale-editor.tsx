"use client";

import { useState, useEffect } from "react";
import { Edit3, Save, X, Plus, Minus, Trash2, Loader2, AlertTriangle } from "lucide-react";
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

interface SaleEditorProps {
  sale: Sale | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function SaleEditor({ sale, open, onOpenChange, onSuccess }: SaleEditorProps) {
  const [items, setItems] = useState<any[]>([]);
  const [discount, setDiscount] = useState<number | string>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (sale) {
      setItems(sale.sale_items.map(item => ({
        ...item,
        quantity: Number(item.quantity),
        price: Number(item.unit_price)
      })));
      setDiscount(Number(sale.discount_amount));
      setPaymentMethod(sale.payment_method);
    }
  }, [sale]);

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
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
    return items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  };

  const calculateTotal = () => {
    return Math.max(0, calculateSubtotal() - Number(discount || 0));
  };

  const handleSave = async () => {
    if (!sale) return;
    setIsSaving(true);

    try {
      await apiClient.patch(`/sale/${sale.id}`, {
        items: items.map(item => ({
          productId: item.product_id,
          quantity: Number(item.quantity),
          price: Number(item.price)
        })),
        discountAmount: Number(discount || 0),
        paymentMethod
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

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white">
        <DialogHeader className="p-6 border-b">
          <div className="flex justify-between items-center">
            <div>
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-gray-500" />
                Sale Adjustment
                <span className="text-gray-400 font-normal ml-1">#{sale.sale_number}</span>
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

        <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-6">
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

          <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="text-xs uppercase font-semibold">Product</TableHead>
                    <TableHead className="text-xs uppercase font-semibold w-32">Quantity</TableHead>
                    <TableHead className="text-xs uppercase font-semibold w-40 text-right">Unit Price</TableHead>
                    <TableHead className="text-xs uppercase font-semibold w-40 text-right">Subtotal</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={idx}>
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
                            onClick={() => updateItem(idx, "quantity", Math.max(1, Number(item.quantity) - 1))}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            className="h-full border-none text-center focus-visible:ring-0 w-12 p-0 rounded-none"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-full w-8 rounded-none border-l"
                            onClick={() => updateItem(idx, "quantity", Number(item.quantity) + 1)}
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
                            className="h-9 w-24 text-right"
                            value={item.price}
                            onChange={(e) => updateItem(idx, "price", e.target.value)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        Rs {(Number(item.price) * Number(item.quantity)).toLocaleString()}
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
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="p-4 bg-gray-50 border-t space-y-2">
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>Subtotal</span>
                <span className="font-medium">Rs {calculateSubtotal().toLocaleString()}</span>
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
                        onFocus={(e) => { if (Number(discount) === 0) setDiscount(""); }}
                        onBlur={(e) => { if (discount === "") setDiscount(0); }}
                      />
                    </div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t mt-2">
                <span className="font-semibold text-lg">New Total</span>
                <span className="font-bold text-xl text-primary">
                  Rs {calculateTotal().toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-500 shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              Updating this sale will generate an <strong>ADJUSTMENT</strong> entry in the customer's ledger.
              The balance for <strong>{sale.customer?.name || "Walk-in"}</strong> will be updated automatically.
            </p>
          </div>
        </div>

        <DialogFooter className="p-4 border-t bg-gray-50">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="min-w-[150px]">
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
      </DialogContent>
    </Dialog>
  );
}
