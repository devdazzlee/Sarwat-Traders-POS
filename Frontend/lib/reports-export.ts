import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"
import { format } from "date-fns"

export interface ReportsExportData {
  storeName: string
  dateRangeLabel: string
  paymentMethodLabel: string
  generatedAt?: Date
  metrics: {
    totalRevenue: number
    totalOrders: number
    avgOrderValue: number
    uniqueCustomers: number
    totalCogs: number
    grossMargin: number
  }
  dailySales: Array<{
    date: string
    sales: number
    orders: number
    customers: number
  }>
  topProducts: Array<{
    name: string
    quantity: number
    revenue: number
    margin?: number
    percentage: number
  }>
  categories: Array<{
    category: string
    sales: number
    percentage: number
  }>
  employees: Array<{
    name: string
    sales: number
    orders: number
    avgOrder: number
  }>
}

const PDF_MINUS = "-"

const money = (n: number) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const loadLogoDataUrl = (): Promise<string | null> => {
  if (typeof window === "undefined") return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = img.naturalWidth || 200
        canvas.height = img.naturalHeight || 200
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL("image/jpeg", 0.92))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = "/logo.png"
  })
}

function drawSectionTitle(doc: jsPDF, title: string, y: number) {
  doc.setFillColor(241, 245, 249)
  doc.roundedRect(14, y - 5, doc.internal.pageSize.getWidth() - 28, 8, 1.5, 1.5, "F")
  doc.setTextColor(15, 23, 42)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text(title.toUpperCase(), 17, y)
  return y + 8
}

function ensureSpace(doc: jsPDF, y: number, needed: number) {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y + needed > pageHeight - 18) {
    doc.addPage()
    return 20
  }
  return y
}

export async function downloadReportsPdf(data: ReportsExportData): Promise<void> {
  const logo = await loadLogoDataUrl()
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const generatedAt = data.generatedAt ?? new Date()
  const marginPct =
    data.metrics.totalRevenue > 0
      ? (data.metrics.grossMargin / data.metrics.totalRevenue) * 100
      : 0

  // Header
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageWidth, 42, "F")
  doc.setFillColor(16, 185, 129)
  doc.rect(0, 42, pageWidth, 2, "F")

  let brandX = 14
  if (logo) {
    try {
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(14, 8, 22, 22, 2, 2, "F")
      doc.addImage(logo, "JPEG", 16, 10, 18, 18)
      brandX = 42
    } catch {
      // ignore logo failure
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.text(data.storeName, brandX, 18)
  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  doc.text("Reports & Analytics", brandX, 26)
  doc.setFontSize(8)
  doc.setTextColor(203, 213, 225)
  doc.text(`Generated ${format(generatedAt, "dd MMM yyyy, hh:mm a")}`, brandX, 33)

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text(data.dateRangeLabel, pageWidth - 14, 18, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(167, 243, 208)
  doc.text(`Payment: ${data.paymentMethodLabel}`, pageWidth - 14, 25, { align: "right" })

  let y = 52

  // Metric cards (2x3)
  const cards = [
    { label: "TOTAL REVENUE", value: `Rs ${money(data.metrics.totalRevenue)}`, color: [16, 185, 129] as const },
    { label: "TOTAL ORDERS", value: String(data.metrics.totalOrders), color: [14, 165, 233] as const },
    { label: "AVG ORDER", value: `Rs ${money(data.metrics.avgOrderValue)}`, color: [245, 158, 11] as const },
    { label: "CUSTOMERS", value: String(data.metrics.uniqueCustomers), color: [249, 115, 22] as const },
    { label: "COGS", value: `Rs ${money(data.metrics.totalCogs)}`, color: [244, 63, 94] as const },
    {
      label: "GROSS MARGIN",
      value: `Rs ${money(data.metrics.grossMargin)} (${marginPct.toFixed(1)}%)`,
      color: data.metrics.grossMargin >= 0 ? ([16, 185, 129] as const) : ([244, 63, 94] as const),
    },
  ]

  const cardW = (pageWidth - 28 - 8) / 3
  const cardH = 18
  cards.forEach((card, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = 14 + col * (cardW + 4)
    const cy = y + row * (cardH + 4)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, cy, cardW, cardH, 2, 2, "F")
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, cy, cardW, cardH, 2, 2, "S")
    doc.setFillColor(card.color[0], card.color[1], card.color[2])
    doc.rect(x, cy, 1.5, cardH, "F")
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(7)
    doc.setFont("helvetica", "bold")
    doc.text(card.label, x + 5, cy + 6)
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(9)
    doc.text(card.value, x + 5, cy + 13)
  })

  y += cardH * 2 + 14

  // Daily sales
  y = drawSectionTitle(doc, "Daily Sales Breakdown", y)
  autoTable(doc, {
    startY: y,
    head: [["Date", "Sales (Rs)", "Orders", "Customers"]],
    body:
      data.dailySales.length > 0
        ? data.dailySales.map((d) => [
            format(new Date(`${d.date}T00:00:00`), "dd MMM yyyy"),
            money(d.sales),
            String(d.orders),
            String(d.customers),
          ])
        : [["No sales in this range", "-", "-", "-"]],
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
    },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
    styles: { cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.2 },
    margin: { left: 14, right: 14 },
  })

  y = (doc as any).lastAutoTable.finalY + 10

  // Top products
  y = ensureSpace(doc, y, 40)
  y = drawSectionTitle(doc, "Top Selling Products", y)
  autoTable(doc, {
    startY: y,
    head: [["#", "Product", "Qty", "Revenue (Rs)", "Profit (Rs)", "Share"]],
    body:
      data.topProducts.length > 0
        ? data.topProducts.map((p, i) => [
            String(i + 1),
            p.name,
            String(p.quantity),
            money(p.revenue),
            money(p.margin ?? 0),
            `${p.percentage.toFixed(1)}%`,
          ])
        : [["-", "No product data", "-", "-", "-", "-"]],
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    styles: { cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.2 },
    margin: { left: 14, right: 14 },
  })

  y = (doc as any).lastAutoTable.finalY + 10

  // Categories
  if (data.categories.length > 0) {
    y = ensureSpace(doc, y, 35)
    y = drawSectionTitle(doc, "Category-wise Sales", y)
    autoTable(doc, {
      startY: y,
      head: [["Category", "Sales (Rs)", "Share %"]],
      body: data.categories.map((c) => [c.category, money(c.sales), `${c.percentage.toFixed(1)}%`]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
      },
      styles: { cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.2 },
      margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // Employees
  if (data.employees.length > 0) {
    y = ensureSpace(doc, y, 35)
    y = drawSectionTitle(doc, "Employee Performance", y)
    autoTable(doc, {
      startY: y,
      head: [["Employee", "Sales (Rs)", "Orders", "Avg Order (Rs)"]],
      body: data.employees.map((e) => [
        e.name,
        money(e.sales),
        String(e.orders),
        money(e.avgOrder),
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
      styles: { cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.2 },
      margin: { left: 14, right: 14 },
    })
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(226, 232, 240)
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12)
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184)
    doc.setFont("helvetica", "normal")
    doc.text(
      `${data.storeName}  ${PDF_MINUS}  Confidential business report`,
      14,
      pageHeight - 7,
    )
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: "right" })
  }

  doc.save(
    `Sarwat-Reports-${format(generatedAt, "yyyyMMdd-HHmm")}.pdf`,
  )
}

function sheetFromMatrix(title: string, headers: string[], rows: (string | number)[][]) {
  const aoa: (string | number)[][] = [
    [title],
    [],
    headers,
    ...rows,
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(headers.length - 1, 0) } }]
  ws["!cols"] = headers.map((h, idx) => {
    const sample = [h, ...rows.map((r) => String(r[idx] ?? ""))]
    const maxLen = Math.min(48, Math.max(...sample.map((s) => s.length), 10))
    return { wch: maxLen + 2 }
  })
  return ws
}

export function downloadReportsExcel(data: ReportsExportData): void {
  const generatedAt = data.generatedAt ?? new Date()
  const marginPct =
    data.metrics.totalRevenue > 0
      ? (data.metrics.grossMargin / data.metrics.totalRevenue) * 100
      : 0

  const wb = XLSX.utils.book_new()

  // Cover / Summary sheet
  const summaryAoa: (string | number)[][] = [
    [data.storeName],
    ["Reports & Analytics"],
    [],
    ["Generated on", format(generatedAt, "dd MMM yyyy, hh:mm a")],
    ["Date range", data.dateRangeLabel],
    ["Payment method", data.paymentMethodLabel],
    [],
    ["KEY METRICS"],
    ["Metric", "Value"],
    ["Total Revenue (Rs)", Number(data.metrics.totalRevenue.toFixed(2))],
    ["Total Orders", data.metrics.totalOrders],
    ["Average Order Value (Rs)", Number(data.metrics.avgOrderValue.toFixed(2))],
    ["Unique Customers", data.metrics.uniqueCustomers],
    ["Cost of Goods Sold (Rs)", Number(data.metrics.totalCogs.toFixed(2))],
    ["Gross Margin (Rs)", Number(data.metrics.grossMargin.toFixed(2))],
    ["Net Margin %", Number(marginPct.toFixed(2))],
    [],
    ["NOTES"],
    ["1. Amounts are in Pakistani Rupees (Rs)."],
    ["2. Figures match the filters applied on the Reports & Analytics page."],
    ["3. This file is system-generated and intended for internal use."],
  ]
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa)
  summaryWs["!cols"] = [{ wch: 28 }, { wch: 28 }]
  summaryWs["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
  ]
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromMatrix(
      `Daily Sales — ${data.dateRangeLabel}`,
      ["Date", "Sales (Rs)", "Orders", "Customers"],
      data.dailySales.length > 0
        ? data.dailySales.map((d) => [
            format(new Date(`${d.date}T00:00:00`), "dd MMM yyyy"),
            Number(d.sales.toFixed(2)),
            d.orders,
            d.customers,
          ])
        : [["No sales in this range", 0, 0, 0]],
    ),
    "Daily Sales",
  )

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromMatrix(
      `Top Products — ${data.dateRangeLabel}`,
      ["#", "Product", "Quantity", "Revenue (Rs)", "Profit (Rs)", "Share %"],
      data.topProducts.length > 0
        ? data.topProducts.map((p, i) => [
            i + 1,
            p.name,
            p.quantity,
            Number(p.revenue.toFixed(2)),
            Number((p.margin ?? 0).toFixed(2)),
            Number(p.percentage.toFixed(2)),
          ])
        : [["-", "No product data", 0, 0, 0, 0]],
    ),
    "Top Products",
  )

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromMatrix(
      `Categories — ${data.dateRangeLabel}`,
      ["Category", "Sales (Rs)", "Share %"],
      data.categories.length > 0
        ? data.categories.map((c) => [
            c.category,
            Number(c.sales.toFixed(2)),
            Number(c.percentage.toFixed(2)),
          ])
        : [["No category data", 0, 0]],
    ),
    "Categories",
  )

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromMatrix(
      `Employee Performance — ${data.dateRangeLabel}`,
      ["Employee", "Sales (Rs)", "Orders", "Avg Order (Rs)"],
      data.employees.length > 0
        ? data.employees.map((e) => [
            e.name,
            Number(e.sales.toFixed(2)),
            e.orders,
            Number(e.avgOrder.toFixed(2)),
          ])
        : [["No employee data", 0, 0, 0]],
    ),
    "Employees",
  )

  // P&L sheet
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromMatrix(
      `Profit & Loss Snapshot — ${data.dateRangeLabel}`,
      ["Line Item", "Amount (Rs)"],
      [
        ["Gross Revenue", Number(data.metrics.totalRevenue.toFixed(2))],
        ["Cost of Goods Sold", Number((-data.metrics.totalCogs).toFixed(2))],
        ["Gross Margin", Number(data.metrics.grossMargin.toFixed(2))],
        ["Net Margin %", Number(marginPct.toFixed(2))],
      ],
    ),
    "P&L Snapshot",
  )

  XLSX.writeFile(wb, `Sarwat-Reports-${format(generatedAt, "yyyyMMdd-HHmm")}.xlsx`)
}
