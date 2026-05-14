import jsPDF from 'jspdf';
import { format } from 'date-fns';

// Loads logo via canvas to strip problematic PNG metadata (e.g. C2PA/Samsung credentials)
// that cause jsPDF addImage to throw. Falls back gracefully.
const loadLogoDataUrl = (): Promise<string | null> => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 200;
        canvas.height = img.naturalHeight || 200;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        // Fill white first so transparent PNG areas don't become black in JPEG output
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92)); // JPEG = smaller, no metadata
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    // Cache-busting not needed; /logo.png is served from Next.js public/
    img.src = '/logo.png';
  });
};

export interface InvoiceData {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  customerName: string;
  customerPhone: string;
  customerWhatsApp: string;
  customerEmail: string;
  saleNumber: string;
  date: Date;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
    unit?: string;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  balanceDue: number; // if credit sale
  amountPaid?: number; // actual amount received
}

export interface InventoryReportData {
  storeName: string;
  date: Date;
  products: Array<{
    name: string;
    sku: string;
    category: string;
    stock: number;
    unit: string;
    purchaseRate: number;
    salesRate: number;
  }>;
}

export interface AnalyticsReportData {
  storeName: string;
  dateRange: string;
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  uniqueCustomers: number;
  grossMargin: number;
  topProducts: Array<{
    name: string;
    revenue: number;
    quantity: number;
  }>;
}

const formatAmount = (amount: number) => {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const buildInvoiceDoc = (data: InvoiceData, logoDataUrl: string | null): jsPDF => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const topY = 20;
  
  doc.setFont('helvetica');
  
  // Header section
  const logoSize = 25;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'JPEG', margin, topY, logoSize, logoSize);
    } catch {
      // If even the canvas image fails, skip silently (no placeholder box)
    }
  }

  // Store Details (Below Logo)
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('SARWAT TRADER', margin, topY + logoSize + 8);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text("(021) 3272-7444", margin, topY + logoSize + 15);
  doc.text("Shop no 109, 1st floor city shopping mall, Marston road", margin, topY + logoSize + 20);
  doc.text("Karachi, Pakistan.", margin, topY + logoSize + 24);

  // Invoice Details (Top Right)
  const labelX = pageWidth - 85; 
  const valueX = pageWidth - margin;
  
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date:`, labelX, topY + 5); 
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(format(data.date, 'MMMM dd, yyyy'), valueX, topY + 5, { align: 'right' });
  
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice No:`, labelX, topY + 12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`#${data.saleNumber}`, valueX, topY + 12, { align: 'right' });

  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.text(`Payment Method:`, labelX, topY + 19);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(data.paymentMethod, valueX, topY + 19, { align: 'right' });

  // Table Header
  const tableTop = 80;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(margin, tableTop, pageWidth - margin, tableTop);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  const snoX = margin;
  const descX = margin + 12;
  doc.text('S.NO', snoX, tableTop + 6);
  doc.text('DESCRIPTION', descX, tableTop + 6);
  doc.text('QTY', pageWidth - 80, tableTop + 6, { align: 'center' });
  doc.text('PRICE', pageWidth - 50, tableTop + 6, { align: 'right' });
  doc.text('AMOUNT', pageWidth - margin, tableTop + 6, { align: 'right' });

  doc.line(margin, tableTop + 9, pageWidth - margin, tableTop + 9);

  // Table Body
  let currentY = tableTop + 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  data.items.forEach((item, index) => {
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = 30;
    }
    doc.text(String(index + 1), snoX, currentY);
    doc.text(item.name, descX, currentY);
    doc.text(item.quantity.toString(), pageWidth - 80, currentY, { align: 'center' });
    doc.text(formatAmount(item.price), pageWidth - 50, currentY, { align: 'right' });
    doc.text(formatAmount(item.lineTotal), pageWidth - margin, currentY, { align: 'right' });

    currentY += 6;
  });

  // Summary section
  const summaryY = currentY + 5; // Reduced space from items
  const sLabelX = pageWidth - 80;
  const sValueX = pageWidth - margin;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal', sLabelX, summaryY);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(formatAmount(data.subtotal), sValueX, summaryY, { align: 'right' });

  let lastRowY = summaryY;
  if (data.discount > 0) {
    lastRowY = summaryY + 8;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Discount', sLabelX, lastRowY);
    doc.setTextColor(200, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(`- ${formatAmount(data.discount)}`, sValueX, lastRowY, { align: 'right' });
  }

  // Divider sits BELOW the last summary row, not on top of it
  const dividerY = lastRowY + 4;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(sLabelX, dividerY, sValueX, dividerY);

  const grandTotalY = dividerY + 7;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Grand Total', sLabelX, grandTotalY);
  doc.setTextColor(200, 0, 0);
  doc.text(`PKR ${formatAmount(data.total)}`, sValueX, grandTotalY, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Branding Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text('Powered by ACE STUDIOS | Support: +92 336 2500357 | www.acestudios.pk', pageWidth / 2, pageHeight - 15, { align: 'center' });

  return doc;
};

const buildReturnNoteDoc = (data: ReturnNoteData, logoDataUrl: string | null): jsPDF => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const topY = 20;

  doc.setFont('helvetica');

  // Header
  const logoSize = 22;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'JPEG', margin, topY, logoSize, logoSize);
    } catch {
      // skip silently if image fails
    }
  }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('SARWAT TRADER', margin, topY + logoSize + 8);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Return / Exchange Note', margin, topY + logoSize + 13);

  // Right Info
  const rLabelX = pageWidth - 85;
  const rValueX = pageWidth - margin;

  doc.setTextColor(120, 120, 120);
  doc.setFontSize(9);
  doc.text(`Note No:`, rLabelX, topY + 5);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`#${data.saleNumber}`, rValueX, topY + 5, { align: 'right' });
  
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date:`, rLabelX, topY + 11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(format(data.date, 'MMM dd, yyyy'), rValueX, topY + 11, { align: 'right' });

  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ref Sale:`, rLabelX, topY + 17);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`#${data.originalSaleNumber}`, rValueX, topY + 17, { align: 'right' });

  // Table
  const tableTop = 70;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, tableTop, pageWidth - margin, tableTop);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const rnSnoX = margin;
  const rnDescX = margin + 12;
  doc.text('S.NO', rnSnoX, tableTop + 6);
  doc.text('DESCRIPTION', rnDescX, tableTop + 6);
  doc.text('QTY', pageWidth - 80, tableTop + 6, { align: 'center' });
  doc.text('PRICE', pageWidth - 50, tableTop + 6, { align: 'right' });
  doc.text('AMOUNT', pageWidth - margin, tableTop + 6, { align: 'right' });
  doc.line(margin, tableTop + 9, pageWidth - margin, tableTop + 9);

  let currentY = tableTop + 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  const allItems = [
    ...data.returnedItems.map(i => ({ ...i, type: 'Return' })),
    ...data.exchangedItems.map(i => ({ ...i, type: 'Exchange' }))
  ];

  allItems.forEach((item, index) => {
    doc.text(String(index + 1), rnSnoX, currentY);
    doc.text(`${item.type}: ${item.name}`, rnDescX, currentY);
    doc.text(item.qty.toString(), pageWidth - 80, currentY, { align: 'center' });
    doc.text(formatAmount(item.price), pageWidth - 50, currentY, { align: 'right' });
    doc.text(formatAmount(item.qty * item.price), pageWidth - margin, currentY, { align: 'right' });
    currentY += 6;
  });

  // Totals
  const summaryY = currentY + 8;
  doc.setFontSize(10);
  if (data.refundTotal > 0) {
    doc.setTextColor(120, 120, 120);
    doc.text('Total Refund', pageWidth - 85, summaryY);
    doc.setTextColor(200, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(`- ${formatAmount(data.refundTotal)}`, pageWidth - margin, summaryY, { align: 'right' });
  }
  if (data.exchangeTotal > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Total Exchange', pageWidth - 85, summaryY + 8);
    doc.setTextColor(0, 0, 200);
    doc.setFont('helvetica', 'bold');
    doc.text(formatAmount(data.exchangeTotal), pageWidth - margin, summaryY + 8, { align: 'right' });
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(pageWidth - 85, summaryY + 12, pageWidth - margin, summaryY + 12);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Net Balance', pageWidth - 85, summaryY + 18);
  doc.text(`PKR ${formatAmount(data.refundTotal - data.exchangeTotal)}`, pageWidth - margin, summaryY + 18, { align: 'right' });

  // Branding Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text('Powered by ACE STUDIOS | Support: +92 336 2500357 | www.acestudios.pk', pageWidth / 2, pageHeight - 15, { align: 'center' });

  return doc;
};

export const generateA4InvoicePDF = async (data: InvoiceData): Promise<string> => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildInvoiceDoc(data, logoDataUrl);
  const pdfBlob = doc.output('blob');
  return URL.createObjectURL(pdfBlob);
};

export const downloadA4Invoice = async (data: InvoiceData) => {
  const url = await generateA4InvoicePDF(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Sarwat-Invoice-${data.saleNumber}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const printA4Invoice = async (data: InvoiceData) => {
  const url = await generateA4InvoicePDF(data);
  const win = window.open(url);
  if (win) {
    win.onload = () => {
      win.focus();
      win.print();
    };
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

type ShareResult =
  | { method: 'native' }
  | { method: 'desktop'; pdfDownloaded: true; whatsappOpened: boolean }
  | { method: 'no-number' };

export interface ReturnNoteData {
  saleNumber: string;
  originalSaleNumber: string;
  customerName?: string;
  customerPhone?: string;
  date: Date;
  returnedItems: Array<{ name: string; qty: number; price: number }>;
  exchangedItems: Array<{ name: string; qty: number; price: number }>;
  refundTotal: number;
  exchangeTotal: number;
  netAmount: number; // negative = net refund, positive = customer pays
  customerWhatsApp?: string;
  customerEmail?: string;
}

export const downloadReturnNote = async (data: ReturnNoteData) => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildReturnNoteDoc(data, logoDataUrl);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Sarwat-Return-${data.saleNumber}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const printReturnNote = async (data: ReturnNoteData) => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildReturnNoteDoc(data, logoDataUrl);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const win = window.open(url);
  if (win) {
    win.onload = () => { win.focus(); win.print(); };
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export const shareOnWhatsApp = async (data: InvoiceData): Promise<ShareResult> => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildInvoiceDoc(data, logoDataUrl);
  const pdfBlob = doc.output('blob');
  const fileName = `Sarwat-Invoice-${data.saleNumber}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    try {
      await navigator.share({ title: `Invoice #${data.saleNumber}`, files: [pdfFile] });
      return { method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { method: 'native' };
    }
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const number = data.customerWhatsApp || data.customerPhone;
  if (!number) return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };

  let cleanNumber = number.replace(/\D/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '92' + cleanNumber.substring(1);
  }

  setTimeout(() => {
    window.open(`https://web.whatsapp.com/send?phone=${cleanNumber}`, '_blank');
  }, 500);

  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: true };
};

export const shareOnEmail = async (data: InvoiceData): Promise<ShareResult> => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildInvoiceDoc(data, logoDataUrl);
  const pdfBlob = doc.output('blob');
  const fileName = `Sarwat-Invoice-${data.saleNumber}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    try {
      await navigator.share({ 
        title: `Invoice #${data.saleNumber}`, 
        text: `Please find the invoice #${data.saleNumber} attached.`,
        files: [pdfFile] 
      });
      return { method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { method: 'native' };
    }
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const email = data.customerEmail || "";
  const subject = encodeURIComponent(`Invoice #${data.saleNumber} - Sarwat Traders`);
  const body = encodeURIComponent(`Hello,\n\nPlease find your invoice #${data.saleNumber} attached to this email.\n\nThank you for shopping with us!`);
  
  window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');

  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };
};

export const shareInventoryReportOnEmail = async (data: InventoryReportData): Promise<ShareResult> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(`${data.storeName} - Inventory Report`, 15, 15);
  doc.setFontSize(10);
  doc.text(`Generated on: ${format(data.date, 'dd/MM/yyyy HH:mm')}`, 15, 20);

  let y = 35;
  doc.setFillColor(241, 245, 249);
  doc.rect(10, y, pageWidth - 20, 8, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Product Name', 15, y + 5);
  doc.text('SKU', 80, y + 5);
  doc.text('Stock', 120, y + 5);
  doc.text('Price', 150, y + 5);
  doc.text('Total Value', 180, y + 5);
  
  y += 12;
  doc.setFont('helvetica', 'normal');
  data.products.forEach((p, i) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(p.name.substring(0, 30), 15, y);
    doc.text(p.sku || '-', 80, y);
    doc.text(`${p.stock} ${p.unit}`, 120, y);
    doc.text(p.salesRate.toFixed(2), 150, y);
    doc.text((p.stock * p.salesRate).toFixed(2), 180, y);
    y += 7;
  });

  const pdfBlob = doc.output('blob');
  const fileName = `Inventory-Report-${format(data.date, 'yyyy-MM-dd')}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({ title: `Inventory Report`, files: [pdfFile] });
      return { method: 'native' };
    } catch (err) {}
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const subject = encodeURIComponent(`Inventory Report - ${data.storeName}`);
  const body = encodeURIComponent(`Hello,\n\nPlease find the inventory report attached.\n\nGenerated on: ${format(data.date, 'PPP p')}`);
  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };
};

export const shareAnalyticsReportOnEmail = async (data: AnalyticsReportData): Promise<ShareResult> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('Business Analytics Report', 15, 20);
  doc.setFontSize(11);
  doc.text(`${data.storeName} | Range: ${data.dateRange}`, 15, 30);

  let y = 55;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary Metrics', 15, y);
  
  y += 10;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Revenue: Rs ${data.totalRevenue.toLocaleString()}`, 15, y);
  doc.text(`Total Orders: ${data.totalOrders}`, 100, y);
  y += 8;
  doc.text(`Avg Order Value: Rs ${data.avgOrderValue.toLocaleString()}`, 15, y);
  doc.text(`Unique Customers: ${data.uniqueCustomers}`, 100, y);
  y += 8;
  doc.text(`Gross Margin: Rs ${data.grossMargin.toLocaleString()}`, 15, y);

  y += 20;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Top Selling Products', 15, y);
  
  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  data.topProducts.forEach((p, i) => {
    doc.text(`${i+1}. ${p.name}`, 15, y);
    doc.text(`Rs ${p.revenue.toLocaleString()}`, 120, y);
    doc.text(`${p.quantity} units`, 160, y);
    y += 8;
  });

  const pdfBlob = doc.output('blob');
  const fileName = `Analytics-Report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({ title: `Analytics Report`, files: [pdfFile] });
      return { method: 'native' };
    } catch (err) {}
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const subject = encodeURIComponent(`Analytics Report - ${data.storeName}`);
  const body = encodeURIComponent(`Hello,\n\nPlease find the business analytics report attached.\n\nGenerated on: ${format(new Date(), 'PPP p')}`);
  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };
};
export const shareReturnNoteOnWhatsApp = async (data: ReturnNoteData): Promise<ShareResult> => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildReturnNoteDoc(data, logoDataUrl);
  const pdfBlob = doc.output('blob');
  const fileName = `Sarwat-Return-${data.saleNumber}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    try {
      await navigator.share({ title: `Return Note #${data.saleNumber}`, files: [pdfFile] });
      return { method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { method: 'native' };
    }
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const number = data.customerWhatsApp || data.customerPhone;
  if (!number) return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };

  let cleanNumber = number.replace(/\D/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '92' + cleanNumber.substring(1);
  }

  setTimeout(() => {
    window.open(`https://web.whatsapp.com/send?phone=${cleanNumber}`, '_blank');
  }, 500);

  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: true };
};

export const shareReturnNoteOnEmail = async (data: ReturnNoteData): Promise<ShareResult> => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildReturnNoteDoc(data, logoDataUrl);
  const pdfBlob = doc.output('blob');
  const fileName = `Sarwat-Return-${data.saleNumber}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    try {
      await navigator.share({ 
        title: `Return Note #${data.saleNumber}`, 
        text: `Please find the return note #${data.saleNumber} attached.`,
        files: [pdfFile] 
      });
      return { method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { method: 'native' };
    }
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const email = data.customerEmail || "";
  const subject = encodeURIComponent(`Return Note #${data.saleNumber} - Sarwat Traders`);
  const body = encodeURIComponent(`Hello,\n\nPlease find your return note #${data.saleNumber} attached to this email.\n\nThank you!`);
  
  window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');

  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };
};
