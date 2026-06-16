import { parseISO } from "date-fns";
import type { InvoiceData } from "@/lib/pdf-generator";

export function mapSaleToInvoiceData(sale: any): InvoiceData {
  const subtotal = parseFloat(sale.subtotal || "0");
  const discount = parseFloat(sale.discount_amount || sale.discount || "0");
  const total = parseFloat(sale.total_amount || sale.total_payable || "0");

  const items = (sale.sale_items || []).map((item: any) => {
    const lineTotal = parseFloat(item.line_total || "0");
    const qty = Number(item.quantity || 0);
    const unitPrice =
      item.unit_price !== undefined
        ? parseFloat(item.unit_price)
        : lineTotal / Math.max(1, qty);

    const unitLabel =
      item.product?.unit?.name ||
      item.unit?.name ||
      item.unit_name ||
      "pcs";

    return {
      name: item.product?.name || "Unnamed Item",
      quantity: qty,
      price: unitPrice,
      lineTotal,
      unit: unitLabel,
    };
  });

  const paymentReceived = parseFloat(sale.payment_received || "0");

  return {
    storeName: sale.branch?.name || "SARWAT TRADER",
    storeAddress:
      sale.branch?.address ||
      "Shop no 109, 1st floor city shopping mall, Marston road Karachi, Pakistan.",
    storePhone: "02132727444",
    customerName: sale.customer?.name || "Walk-in Customer",
    customerPhone: sale.customer?.phone_number || "",
    customerWhatsApp:
      sale.customer?.whatsapp_number || sale.customer?.phone_number || "",
    customerEmail: sale.customer?.email || "",
    saleNumber: sale.sale_number,
    date: parseISO(sale.sale_date),
    items,
    subtotal,
    discount,
    total,
    paymentMethod: sale.payment_method || "CASH",
    balanceDue:
      sale.payment_method === "CREDIT"
        ? Math.max(0, total - paymentReceived)
        : 0,
    amountPaid: paymentReceived || total,
    previousBalance: parseFloat(sale.previous_balance || "0"),
  };
}
