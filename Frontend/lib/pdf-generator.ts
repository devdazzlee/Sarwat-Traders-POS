import jsPDF from 'jspdf';
import { format } from 'date-fns';

export interface InvoiceData {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  customerName: string;
  customerPhone: string;
  customerWhatsApp: string;
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

const buildInvoiceDoc = (data: InvoiceData): jsPDF => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Set fonts
  doc.setFont('helvetica');
  
  // --- Header section ---
  // Dark sidebar/accent
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.rect(0, 0, 10, pageHeight, 'F');
  
  // Main header bar
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(10, 0, pageWidth - 10, 45, 'F');
  
  // Header background
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 45, 'F');

  try {
    // Add Logo
    doc.addImage('/logo.png', 'PNG', 20, 10, 20, 20);
    
    // Store Name next to logo
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text('SARWAT TRADER', 45, 25);
  } catch (e) {
    // Fallback if image fails to load
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text('SARWAT TRADER', 20, 25);
  }
  
  // Invoice Label
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', pageWidth - 20, 25, { align: 'right' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(56, 189, 248); // Sky-400
  doc.text(`Official Transaction Record`, pageWidth - 20, 32, { align: 'right' });
  
  // --- Info Section ---
  doc.setTextColor(30, 41, 59);
  
  // Store Details (Left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SARWAT TRADER', 20, 55);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(data.storeAddress, 20, 60);
  doc.text(`Contact: ${data.storePhone}`, 20, 65);
  
  // Invoice Details (Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('INVOICE DETAILS', pageWidth - 20, 55, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Invoice No: ${data.saleNumber}`, pageWidth - 20, 60, { align: 'right' });
  doc.text(`Date: ${format(data.date, 'PPPP')}`, pageWidth - 20, 65, { align: 'right' });
  doc.text(`Time: ${format(data.date, 'hh:mm bb')}`, pageWidth - 20, 70, { align: 'right' });
  
  // --- Billed To Section ---
  doc.setFillColor(248, 250, 252); // Slate-50
  doc.rect(20, 80, pageWidth - 40, 30, 'F');
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.rect(20, 80, pageWidth - 40, 30, 'S');
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text('BILLED TO:', 25, 87);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.text(data.customerName || 'Walk-in Customer', 25, 95);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // Slate-500
  if (data.customerPhone) {
    doc.text(`Contact: ${data.customerPhone}`, 25, 102);
  }
  
  doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT STATUS:', pageWidth - 30, 87, { align: 'right' });
  doc.setTextColor(data.paymentMethod === 'CREDIT' ? 220 : 22, 38, 38);
  doc.text(data.paymentMethod.toUpperCase(), pageWidth - 30, 95, { align: 'right' });

  // --- Table Header ---
  const tableTopY = 120;
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.rect(20, tableTopY, pageWidth - 40, 10, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('SR.', 25, tableTopY + 6.5);
  doc.text('PRODUCT DESCRIPTION', 40, tableTopY + 6.5);
  doc.text('QTY', 115, tableTopY + 6.5, { align: 'center' });
  doc.text('UNIT PRICE', 145, tableTopY + 6.5, { align: 'right' });
  doc.text('TOTAL AMOUNT', pageWidth - 25, tableTopY + 6.5, { align: 'right' });
  
  // --- Table Rows ---
  let currentY = tableTopY + 10;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  
  data.items.forEach((item, index) => {
    // Row background
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(20, currentY, pageWidth - 40, 10, 'F');
    }
    doc.setDrawColor(241, 245, 249);
    doc.line(20, currentY + 10, pageWidth - 20, currentY + 10);
    
    doc.text((index + 1).toString().padStart(2, '0'), 25, currentY + 6.5);
    doc.setFont('helvetica', 'bold');
    doc.text(item.name.substring(0, 40), 40, currentY + 6.5);
    doc.setFont('helvetica', 'normal');
    
    const qtyText = `${item.quantity} ${item.unit || 'pcs'}`;
    doc.text(qtyText, 115, currentY + 6.5, { align: 'center' });
    doc.text(item.price.toLocaleString(), 145, currentY + 6.5, { align: 'right' });
    doc.text(item.lineTotal.toLocaleString(), pageWidth - 25, currentY + 6.5, { align: 'right' });
    
    currentY += 10;

    // Page break handling (simplified)
    if (currentY > 240) {
      doc.addPage();
      currentY = 20;
    }
  });
  
  // --- Summary Section ---
  currentY += 10;
  const summaryX = pageWidth - 90;
  
  doc.setFont('helvetica', 'normal');
  doc.text('Gross Subtotal:', summaryX, currentY);
  doc.text(`Rs ${data.subtotal.toLocaleString()}`, pageWidth - 25, currentY, { align: 'right' });
  
  if (data.discount > 0) {
    currentY += 8;
    doc.setTextColor(220, 38, 38);
    doc.text('Trade Discount:', summaryX, currentY);
    doc.text(`-Rs ${data.discount.toLocaleString()}`, pageWidth - 25, currentY, { align: 'right' });
    doc.setTextColor(30, 41, 59);
  }
  
  currentY += 5;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(summaryX, currentY, pageWidth - 20, currentY);
  
  currentY += 10;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');

  if (data.paymentMethod === 'CREDIT') {
    // Show total, amount paid (if any), and balance due
    doc.setFontSize(11);
    doc.text('TOTAL AMOUNT:', summaryX, currentY);
    doc.text(`Rs ${data.total.toLocaleString()}`, pageWidth - 25, currentY, { align: 'right' });

    if ((data.amountPaid ?? 0) > 0) {
      currentY += 8;
      doc.setTextColor(22, 163, 74); // green
      doc.text('AMOUNT PAID:', summaryX, currentY);
      doc.text(`Rs ${(data.amountPaid ?? 0).toLocaleString()}`, pageWidth - 25, currentY, { align: 'right' });
      doc.setTextColor(30, 41, 59);
    }

    currentY += 8;
    doc.setFontSize(14);
    doc.setTextColor(220, 38, 38); // red
    doc.text('BALANCE DUE:', summaryX, currentY);
    doc.text(`Rs ${data.balanceDue.toLocaleString()}`, pageWidth - 25, currentY, { align: 'right' });
    doc.setTextColor(30, 41, 59);
  } else {
    doc.setFontSize(11);
    doc.text('TOTAL AMOUNT:', summaryX, currentY);
    doc.text(`Rs ${data.total.toLocaleString()}`, pageWidth - 25, currentY, { align: 'right' });

    currentY += 8;
    doc.setTextColor(22, 163, 74); // green
    doc.text('AMOUNT PAID:', summaryX, currentY);
    doc.text(`Rs ${data.total.toLocaleString()}`, pageWidth - 25, currentY, { align: 'right' });
    doc.setTextColor(30, 41, 59);

    currentY += 8;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('NET PAYABLE:', summaryX, currentY);
    doc.text('Rs 0.00', pageWidth - 25, currentY, { align: 'right' });

    const change = (data.amountPaid ?? 0) - data.total;
    if (change > 0) {
      currentY += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(22, 163, 74);
      doc.text('CHANGE RETURNED:', summaryX, currentY);
      doc.text(`Rs ${change.toLocaleString()}`, pageWidth - 25, currentY, { align: 'right' });
      doc.setTextColor(30, 41, 59);
    }
  }
  
  // --- Terms & Notes ---
  currentY += 20;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text('TERMS & CONDITIONS:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text('1. Goods once sold are only exchangeable within 3 days in original condition.', 20, currentY + 5);
  doc.text('2. This is a computer-generated invoice and does not require a physical signature.', 20, currentY + 9);
  
  // --- Branding Footer ---
  doc.setFillColor(15, 23, 42);
  doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('POWERED BY ACE STUDIOS', 20, pageHeight - 10);
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text('Support: +92 336 2500357', pageWidth - 20, pageHeight - 10, { align: 'right' });
  doc.text('www.acestudios.pk', pageWidth - 20, pageHeight - 6, { align: 'right' });

  return doc;
};

export const generateA4InvoicePDF = (data: InvoiceData): string => {
  const doc = buildInvoiceDoc(data);
  const pdfBlob = doc.output('blob');
  return URL.createObjectURL(pdfBlob);
};

export const downloadA4Invoice = (data: InvoiceData) => {
  const url = generateA4InvoicePDF(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Sarwat-Invoice-${data.saleNumber}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const printA4Invoice = (data: InvoiceData) => {
  const url = generateA4InvoicePDF(data);
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

// ─── Return / Exchange Note ───────────────────────────────────────────────────

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
}

const buildReturnNoteDoc = (data: ReturnNoteData): jsPDF => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica');

  // Header background (same as invoice)
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 45, 'F');

  try {
    doc.addImage('/logo.png', 'PNG', 20, 10, 20, 20);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text('SARWAT TRADER', 45, 25);
  } catch {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text('SARWAT TRADER', 20, 25);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('RETURN NOTE', pageWidth - 20, 25, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(56, 189, 248);
  doc.text('Return / Exchange Record', pageWidth - 20, 32, { align: 'right' });

  // Info block
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SARWAT TRADER', 20, 55);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Karachi, Pakistan', 20, 60);
  doc.text('Contact: 0300 0000000', 20, 65);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DOCUMENT DETAILS', pageWidth - 20, 55, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Note No: ${data.saleNumber}`, pageWidth - 20, 60, { align: 'right' });
  doc.text(`Ref Sale: ${data.originalSaleNumber}`, pageWidth - 20, 65, { align: 'right' });
  doc.text(`Date: ${format(data.date, 'PPPP')}`, pageWidth - 20, 70, { align: 'right' });
  doc.text(`Time: ${format(data.date, 'hh:mm bb')}`, pageWidth - 20, 75, { align: 'right' });

  // Billed to box
  doc.setFillColor(248, 250, 252);
  doc.rect(20, 82, pageWidth - 40, 28, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(20, 82, pageWidth - 40, 28, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('CUSTOMER:', 25, 89);
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(data.customerName || 'Walk-in Customer', 25, 97);
  if (data.customerPhone) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Contact: ${data.customerPhone}`, 25, 103);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('DOCUMENT TYPE:', pageWidth - 30, 89, { align: 'right' });
  const hasReturn = data.returnedItems.length > 0;
  const hasExchange = data.exchangedItems.length > 0;
  const docType = hasReturn && hasExchange ? 'RETURN & EXCHANGE' : hasReturn ? 'RETURN' : 'EXCHANGE';
  doc.setTextColor(220, 38, 38);
  doc.text(docType, pageWidth - 30, 97, { align: 'right' });

  // Table
  const tableTopY = 120;
  doc.setFillColor(15, 23, 42);
  doc.rect(20, tableTopY, pageWidth - 40, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('SR.', 25, tableTopY + 6.5);
  doc.text('PRODUCT DESCRIPTION', 40, tableTopY + 6.5);
  doc.text('TYPE', 110, tableTopY + 6.5, { align: 'center' });
  doc.text('QTY', 135, tableTopY + 6.5, { align: 'center' });
  doc.text('UNIT PRICE', 158, tableTopY + 6.5, { align: 'right' });
  doc.text('AMOUNT', pageWidth - 25, tableTopY + 6.5, { align: 'right' });

  let currentY = tableTopY + 10;
  doc.setFont('helvetica', 'normal');

  const allRows = [
    ...data.returnedItems.map(i => ({ ...i, type: 'Return', color: [220, 38, 38] as [number, number, number] })),
    ...data.exchangedItems.map(i => ({ ...i, type: 'Exchange', color: [37, 99, 235] as [number, number, number] })),
  ];

  allRows.forEach((row, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(20, currentY, pageWidth - 40, 10, 'F');
    }
    doc.setDrawColor(241, 245, 249);
    doc.line(20, currentY + 10, pageWidth - 20, currentY + 10);

    doc.setTextColor(30, 41, 59);
    doc.text((idx + 1).toString().padStart(2, '0'), 25, currentY + 6.5);
    doc.setFont('helvetica', 'bold');
    doc.text(row.name.substring(0, 35), 40, currentY + 6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...row.color);
    doc.text(row.type, 110, currentY + 6.5, { align: 'center' });
    doc.setTextColor(30, 41, 59);
    doc.text(`${row.qty}`, 135, currentY + 6.5, { align: 'center' });
    doc.text(row.price.toLocaleString(), 158, currentY + 6.5, { align: 'right' });
    doc.setTextColor(...row.color);
    doc.text((row.qty * row.price).toLocaleString(), pageWidth - 25, currentY + 6.5, { align: 'right' });
    currentY += 10;
    if (currentY > 240) { doc.addPage(); currentY = 20; }
  });

  // Summary
  currentY += 10;
  const summaryX = pageWidth - 90;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  if (data.refundTotal > 0) {
    doc.setTextColor(220, 38, 38);
    doc.text('RETURN AMOUNT:', summaryX, currentY);
    doc.text(`Rs ${data.refundTotal.toLocaleString()}`, pageWidth - 25, currentY, { align: 'right' });
    currentY += 8;
    doc.setTextColor(30, 41, 59);
  }
  if (data.exchangeTotal > 0) {
    doc.setTextColor(37, 99, 235);
    doc.text('EXCHANGE AMOUNT:', summaryX, currentY);
    doc.text(`Rs ${data.exchangeTotal.toLocaleString()}`, pageWidth - 25, currentY, { align: 'right' });
    currentY += 8;
    doc.setTextColor(30, 41, 59);
  }

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(summaryX, currentY, pageWidth - 20, currentY);
  currentY += 8;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const netLabel = data.netAmount <= 0 ? 'NET REFUND:' : 'NET PAYABLE:';
  const netColor: [number, number, number] = data.netAmount <= 0 ? [220, 38, 38] : [22, 163, 74];
  doc.setTextColor(30, 41, 59);
  doc.text(netLabel, summaryX, currentY);
  doc.setTextColor(...netColor);
  doc.text(`Rs ${Math.abs(data.netAmount).toLocaleString()}`, pageWidth - 25, currentY, { align: 'right' });

  // Footer
  currentY += 20;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text('TERMS & CONDITIONS:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text('1. Exchanged items are subject to stock availability.', 20, currentY + 5);
  doc.text('2. This is a computer-generated return note and does not require a physical signature.', 20, currentY + 9);

  doc.setFillColor(15, 23, 42);
  doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('POWERED BY ACE STUDIOS', 20, pageHeight - 10);
  doc.setFontSize(9);
  doc.text('Support: +92 336 2500357', pageWidth - 20, pageHeight - 10, { align: 'right' });
  doc.text('www.acestudios.pk', pageWidth - 20, pageHeight - 6, { align: 'right' });

  return doc;
};

export const downloadReturnNote = (data: ReturnNoteData) => {
  const doc = buildReturnNoteDoc(data);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Sarwat-Return-${data.saleNumber}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const printReturnNote = (data: ReturnNoteData) => {
  const doc = buildReturnNoteDoc(data);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const win = window.open(url);
  if (win) {
    win.onload = () => { win.focus(); win.print(); };
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export const shareOnWhatsApp = async (data: InvoiceData): Promise<ShareResult> => {
  const doc = buildInvoiceDoc(data);
  const pdfBlob = doc.output('blob');
  const fileName = `Sarwat-Invoice-${data.saleNumber}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  // Try Web Share API with PDF file — works on mobile and some desktops (e.g. Chrome on Windows with WhatsApp installed)
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
      if (err?.name === 'AbortError') return { method: 'native' }; // user cancelled
      // fall through to desktop path
    }
  }

  // Desktop fallback: auto-download the PDF then open the WhatsApp Web chat directly
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

  // Open WhatsApp Web with the specific contact's chat pre-selected
  setTimeout(() => {
    window.open(`https://web.whatsapp.com/send?phone=${cleanNumber}`, '_blank');
  }, 500);

  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: true };
};
