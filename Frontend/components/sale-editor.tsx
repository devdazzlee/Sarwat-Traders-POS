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
  const [discount, setDiscount] = useState<number>(0);
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
    return Math.max(0, calculateSubtotal() - discount);
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
        discountAmount: discount,
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
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50 border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-900 text-white">
           <div className="flex justify-between items-center">
              <div>
                 <DialogTitle className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                    <Edit3 className="h-6 w-6 text-amber-400" />
                    Sale Adjustment <span className="text-slate-500 ml-2">#{sale.sale_number}</span>
                 </DialogTitle>
                 <DialogDescription className="text-slate-400 font-bold">
                    Adjusting items and rates will automatically recalculate customer ledger entries.
                 </DialogDescription>
              </div>
              <Badge variant="outline" className="bg-amber-400/10 text-amber-400 border-amber-400/30 px-3 py-1 font-black">
                 LOCKED FOR AUDIT
              </Badge>
           </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-6">
           <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex gap-8 items-center">
              <div className="flex items-center gap-3">
                 <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black">
                    {sale.customer?.name?.[0].toUpperCase() || "W"}
                 </div>
                 <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Customer</p>
                    <p className="font-bold text-slate-900">{sale.customer?.name || "Walk-in Customer"}</p>
                 </div>
              </div>
              <div className="h-8 w-px bg-slate-100" />
              <div className="flex-1">
                 <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Payment Method</p>
                 <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-9 border-none bg-slate-50 font-black text-slate-900 focus:ring-0">
                       <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                       <SelectItem value="CASH">CASH</SelectItem>
                       <SelectItem value="CREDIT">CREDIT (LEDGER)</SelectItem>
                       <SelectItem value="CARD">BANK CARD</SelectItem>
                    </SelectContent>
                 </Select>
              </div>
           </div>

           <div className="flex-1 border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-sm flex flex-col">
              <ScrollArea className="flex-1">
                 <Table>
                    <TableHeader className="bg-slate-50">
                       <TableRow>
                          <TableHead className="font-black text-xs uppercase text-slate-500">Inventory Item</TableHead>
                          <TableHead className="font-black text-xs uppercase text-slate-500 w-32">Qty</TableHead>
                          <TableHead className="font-black text-xs uppercase text-slate-500 w-40 text-right">Unit Price</TableHead>
                          <TableHead className="font-black text-xs uppercase text-slate-500 w-40 text-right">Subtotal</TableHead>
                          <TableHead className="w-12"></TableHead>
                       </TableRow>
                    </TableHeader>
                    <TableBody>
                       {items.map((item, idx) => (
                         <TableRow key={idx} className="hover:bg-slate-50/50">
                            <TableCell className="font-bold text-slate-900">
                               {item.product?.name}
                               <p className="text-[10px] text-slate-400 font-medium">SKU: {item.product?.sku || "N/A"}</p>
                            </TableCell>
                            <TableCell>
                               <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 rounded-none"
                                    onClick={() => updateItem(idx, "quantity", Math.max(1, Number(item.quantity) - 1))}
                                  >
                                     <Minus className="h-3 w-3" />
                                  </Button>
                                  <Input 
                                    type="number" 
                                    className="h-8 border-none text-center font-black focus-visible:ring-0 w-12 p-0"
                                    value={item.quantity}
                                    onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                                  />
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 rounded-none"
                                    onClick={() => updateItem(idx, "quantity", Number(item.quantity) + 1)}
                                  >
                                     <Plus className="h-3 w-3" />
                                  </Button>
                               </div>
                            </TableCell>
                            <TableCell className="text-right">
                               <div className="flex justify-end items-center gap-2">
                                  <span className="text-slate-400 text-xs font-black">Rs</span>
                                  <Input 
                                    type="number" 
                                    className="h-9 w-24 text-right font-black border-slate-200 rounded-xl"
                                    value={item.price}
                                    onChange={(e) => updateItem(idx, "price", e.target.value)}
                                  />
                               </div>
                            </TableCell>
                            <TableCell className="text-right font-black text-slate-900">
                               Rs {(Number(item.price) * Number(item.quantity)).toLocaleString()}
                            </TableCell>
                            <TableCell>
                               <Button 
                                 variant="ghost" 
                                 size="icon" 
                                 className="text-slate-300 hover:text-red-500"
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

              <div className="p-6 bg-slate-50 border-t border-slate-200 space-y-3">
                 <div className="flex justify-between items-center text-slate-500 font-bold">
                    <span>Gross Subtotal</span>
                    <span>Rs {calculateSubtotal().toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-bold">Adjusted Discount</span>
                    <div className="flex items-center gap-2">
                       <span className="text-slate-400 text-xs font-black">Rs</span>
                       <Input 
                         type="number" 
                         className="h-8 w-24 text-right font-black border-slate-200 rounded-lg"
                         value={discount}
                         onChange={(e) => setDiscount(Number(e.target.value))}
                       />
                    </div>
                 </div>
                 <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                    <span className="text-xl font-black uppercase text-slate-900">Revised Total</span>
                    <span className="text-3xl font-black text-blue-600">Rs {calculateTotal().toLocaleString()}</span>
                 </div>
              </div>
           </div>

           <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-600 shrink-0" />
              <p className="text-xs text-blue-800 font-medium leading-relaxed">
                 Updating this sale will generate an <strong>ADJUSTMENT</strong> entry in the customer's ledger. 
                 Any change in the grand total will be instantly reflected in the running balance of <strong>{sale.customer?.name || "the Walk-in customer"}</strong>.
              </p>
           </div>
        </div>

        <DialogFooter className="p-6 bg-white border-t border-slate-200">
           <Button variant="ghost" className="font-black text-slate-500" onClick={() => onOpenChange(false)}>Discard Edits</Button>
           <Button 
             className="bg-slate-900 hover:bg-slate-800 text-white font-black px-12 rounded-xl h-12 shadow-xl border-b-4 border-slate-700" 
             onClick={handleSave}
             disabled={isSaving}
           >
              {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recalculating...</> : <><Save className="h-4 w-4 mr-2" /> Commit Adjustment</>}
           </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
