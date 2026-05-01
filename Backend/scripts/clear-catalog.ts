/**
 * One-time script: wipe all products, categories, and stock from the DB.
 * Run from the Backend directory:
 *   npx ts-node scripts/clear-catalog.ts
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('Starting catalog wipe...\n');

  // 1. Stock movements (depend on Product)
  const sm = await prisma.stockMovement.deleteMany({});
  console.log(`✓ StockMovement   — ${sm.count} deleted`);

  // 2. Stock adjustments (depend on Product)
  const sa = await prisma.stockAdjustment.deleteMany({});
  console.log(`✓ StockAdjustment — ${sa.count} deleted`);

  // 3. Stock records (depend on Product)
  const st = await prisma.stock.deleteMany({});
  console.log(`✓ Stock           — ${st.count} deleted`);

  // 4. Purchases / stock-in records (depend on Product)
  const pu = await prisma.purchase.deleteMany({});
  console.log(`✓ Purchase        — ${pu.count} deleted`);

  // 5. Transfers (depend on Product)
  const tr = await prisma.transfer.deleteMany({});
  console.log(`✓ Transfer        — ${tr.count} deleted`);

  // 6. Purchase order items (depend on Product)
  const poi = await prisma.purchaseOrderItem.deleteMany({});
  console.log(`✓ PurchaseOrderItem — ${poi.count} deleted`);

  // 7. Sale items (depend on Product — required to unlock Product delete)
  const si = await prisma.saleItem.deleteMany({});
  console.log(`✓ SaleItem        — ${si.count} deleted`);

  // 8. Product images (depend on Product)
  const pi = await prisma.productImage.deleteMany({});
  console.log(`✓ ProductImage    — ${pi.count} deleted`);

  // 9. Products
  const pr = await prisma.product.deleteMany({});
  console.log(`✓ Product         — ${pr.count} deleted`);

  // 10. Category images (depend on Category)
  const ci = await prisma.categoryImages.deleteMany({});
  console.log(`✓ CategoryImages  — ${ci.count} deleted`);

  // 11. Categories
  const ca = await prisma.category.deleteMany({});
  console.log(`✓ Category        — ${ca.count} deleted`);

  console.log('\nDone. All products, categories, and stock data have been removed.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
