import { LedgerEntryType } from '@prisma/client';

type LedgerAdjustmentRow = {
  entry_type: LedgerEntryType;
  sale_id: string | null;
  description: string | null;
  reference_no: string | null;
};

/**
 * Sale-edit delta rows that must never appear on the customer statement.
 * They are consolidated into the parent sale ledger row + revision history.
 */
export function isSaleLinkedShadowAdjustment(entry: LedgerAdjustmentRow): boolean {
  if (entry.entry_type !== LedgerEntryType.ADJUSTMENT) return false;

  const saleId = entry.sale_id?.trim();
  if (!saleId) return false;

  const ref = entry.reference_no?.trim().toUpperCase();
  if (ref === 'AUDIT') return false;

  const desc = (entry.description ?? '').toLowerCase();
  if (desc.includes('opening balance')) return false;

  return (
    desc.includes('sale edit') ||
    desc.includes('sale adjustment') ||
    desc.includes('credit removed') ||
    desc.includes('credit assigned') ||
    desc.includes('adjustment -')
  );
}
