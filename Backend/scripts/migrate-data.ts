import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

// Old database connection (Direct Aiven PostgreSQL)
// Try direct connection first, fallback to Prisma Accelerate if needed
const OLD_DB_URL = process.env.OLD_DATABASE_URL || "postgresql://user:password@host:port/dbname?sslmode=require";

// New database connection (Neon) - from .env
const NEW_DB_URL = process.env.DATABASE_URL!;

if (!NEW_DB_URL) {
  console.error('❌ DATABASE_URL not found in .env file');
  process.exit(1);
}

// Create Prisma clients for both databases
const oldDb = new PrismaClient({
  datasources: {
    db: {
      url: OLD_DB_URL,
    },
  },
});

const newDb = new PrismaClient({
  datasources: {
    db: {
      url: NEW_DB_URL,
    },
  },
});

async function migrateData() {
  console.log('🚀 Starting data migration...\n');
  console.log('📊 Old DB:', OLD_DB_URL.substring(0, 50) + '...');
  console.log('📊 New DB:', NEW_DB_URL.substring(0, 50) + '...\n');

  try {
    // Test connections
    console.log('🔌 Testing connections...');
    try {
      await oldDb.$connect();
      console.log('✅ Connected to old database');
      
      // Quick test query
      const userCount = await oldDb.user.count();
      console.log(`   Found ${userCount} users in old database`);
    } catch (oldDbError: any) {
      console.error('❌ Failed to connect to old database:', oldDbError.message);
      console.error('\n💡 Troubleshooting:');
      console.error('1. Check if Aiven database service is running (not paused)');
      console.error('2. Get connection pooler URL from Aiven dashboard');
      console.error('3. Update OLD_DATABASE_URL in .env or migrate-data.ts');
      console.error('4. Check Aiven dashboard: https://console.aiven.io/');
      throw new Error('Cannot connect to old database. Please check the connection string.');
    }
    
    await newDb.$connect();
    console.log('✅ Connected to new database\n');

    // Migration order (respecting foreign key dependencies)
    const migrationSteps = [
      { name: 'Branch', fn: migrateBranches },
      { name: 'User', fn: migrateUsers },
      { name: 'Area', fn: migrateAreas },
      { name: 'Customer', fn: migrateCustomers },
      { name: 'Subcategory', fn: migrateSubcategories },
      { name: 'Color', fn: migrateColors },
      { name: 'Size', fn: migrateSizes },
      { name: 'Unit', fn: migrateUnits },
      { name: 'Supplier', fn: migrateSuppliers },
      { name: 'Tax', fn: migrateTaxes },
      { name: 'Brand', fn: migrateBrands },
      { name: 'Category', fn: migrateCategories },
      { name: 'CategoryImages', fn: migrateCategoryImages },
      { name: 'Product', fn: migrateProducts },
      { name: 'ProductImage', fn: migrateProductImages },
      { name: 'Stock', fn: migrateStocks },
      { name: 'StockMovement', fn: migrateStockMovements },
      { name: 'Order', fn: migrateOrders },
      { name: 'OrderItem', fn: migrateOrderItems },
      { name: 'Sale', fn: migrateSales },
      { name: 'SaleItem', fn: migrateSaleItems },
      { name: 'PurchaseOrder', fn: migratePurchaseOrders },
      { name: 'PurchaseOrderItem', fn: migratePurchaseOrderItems },
      { name: 'CashFlow', fn: migrateCashFlows },
      { name: 'Expense', fn: migrateExpenses },
      { name: 'EmployeeType', fn: migrateEmployeeTypes },
      { name: 'Employee', fn: migrateEmployees },
      { name: 'Shift', fn: migrateShifts },
      { name: 'ShiftAssignment', fn: migrateShiftAssignments },
      { name: 'Salary', fn: migrateSalaries },
      { name: 'Notification', fn: migrateNotifications },
      { name: 'Session', fn: migrateSessions },
      { name: 'DeviceIdentity', fn: migrateDeviceIdentities },
      { name: 'Discount', fn: migrateDiscounts },
    ];

    // Run migrations
    for (const step of migrationSteps) {
      try {
        console.log(`\n📦 Migrating ${step.name}...`);
        await step.fn();
        console.log(`✅ ${step.name} migrated successfully`);
      } catch (error: any) {
        console.error(`❌ Error migrating ${step.name}:`, error.message);
        // Continue with other tables even if one fails
      }
    }

    console.log('\n🎉 Data migration completed successfully!');
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await oldDb.$disconnect();
    await newDb.$disconnect();
    console.log('\n🔌 Disconnected from databases');
  }
}

// Migration functions for each table
async function migrateBranches() {
  const branches = await oldDb.branch.findMany();
  if (branches.length === 0) return;
  
  for (const branch of branches) {
    await newDb.branch.upsert({
      where: { id: branch.id },
      update: branch,
      create: branch,
    });
  }
  console.log(`   Migrated ${branches.length} branches`);
}

async function migrateUsers() {
  const users = await oldDb.user.findMany();
  if (users.length === 0) return;
  
  for (const user of users) {
    await newDb.user.upsert({
      where: { id: user.id },
      update: user,
      create: user,
    });
  }
  console.log(`   Migrated ${users.length} users`);
}

async function migrateAreas() {
  const areas = await oldDb.area.findMany();
  if (areas.length === 0) return;
  
  for (const area of areas) {
    await newDb.area.upsert({
      where: { id: area.id },
      update: area,
      create: area,
    });
  }
  console.log(`   Migrated ${areas.length} areas`);
}

async function migrateCustomers() {
  const customers = await oldDb.customer.findMany();
  if (customers.length === 0) return;
  
  for (const customer of customers) {
    await newDb.customer.upsert({
      where: { id: customer.id },
      update: customer,
      create: customer,
    });
  }
  console.log(`   Migrated ${customers.length} customers`);
}

async function migrateSubcategories() {
  const subcategories = await oldDb.subcategory.findMany();
  if (subcategories.length === 0) return;
  
  for (const subcategory of subcategories) {
    await newDb.subcategory.upsert({
      where: { id: subcategory.id },
      update: subcategory,
      create: subcategory,
    });
  }
  console.log(`   Migrated ${subcategories.length} subcategories`);
}

async function migrateColors() {
  const colors = await oldDb.color.findMany();
  if (colors.length === 0) return;
  
  for (const color of colors) {
    await newDb.color.upsert({
      where: { id: color.id },
      update: color,
      create: color,
    });
  }
  console.log(`   Migrated ${colors.length} colors`);
}

async function migrateSizes() {
  const sizes = await oldDb.size.findMany();
  if (sizes.length === 0) return;
  
  for (const size of sizes) {
    await newDb.size.upsert({
      where: { id: size.id },
      update: size,
      create: size,
    });
  }
  console.log(`   Migrated ${sizes.length} sizes`);
}

async function migrateUnits() {
  const units = await oldDb.unit.findMany();
  if (units.length === 0) return;
  
  for (const unit of units) {
    await newDb.unit.upsert({
      where: { id: unit.id },
      update: unit,
      create: unit,
    });
  }
  console.log(`   Migrated ${units.length} units`);
}

async function migrateSuppliers() {
  const suppliers = await oldDb.supplier.findMany();
  if (suppliers.length === 0) return;
  
  for (const supplier of suppliers) {
    await newDb.supplier.upsert({
      where: { id: supplier.id },
      update: supplier,
      create: supplier,
    });
  }
  console.log(`   Migrated ${suppliers.length} suppliers`);
}

async function migrateTaxes() {
  const taxes = await oldDb.tax.findMany();
  if (taxes.length === 0) return;
  
  for (const tax of taxes) {
    await newDb.tax.upsert({
      where: { id: tax.id },
      update: tax,
      create: tax,
    });
  }
  console.log(`   Migrated ${taxes.length} taxes`);
}

async function migrateBrands() {
  const brands = await oldDb.brand.findMany();
  if (brands.length === 0) return;
  
  for (const brand of brands) {
    await newDb.brand.upsert({
      where: { id: brand.id },
      update: brand,
      create: brand,
    });
  }
  console.log(`   Migrated ${brands.length} brands`);
}

async function migrateCategories() {
  const categories = await oldDb.category.findMany();
  if (categories.length === 0) return;
  
  for (const category of categories) {
    await newDb.category.upsert({
      where: { id: category.id },
      update: category,
      create: category,
    });
  }
  console.log(`   Migrated ${categories.length} categories`);
}

async function migrateCategoryImages() {
  const images = await oldDb.categoryImages.findMany();
  if (images.length === 0) return;
  
  for (const image of images) {
    await newDb.categoryImages.upsert({
      where: { id: image.id },
      update: image,
      create: image,
    });
  }
  console.log(`   Migrated ${images.length} category images`);
}

async function migrateProducts() {
  const products = await oldDb.product.findMany();
  if (products.length === 0) return;
  
  for (const product of products) {
    await newDb.product.upsert({
      where: { id: product.id },
      update: product,
      create: product,
    });
  }
  console.log(`   Migrated ${products.length} products`);
}

async function migrateProductImages() {
  const images = await oldDb.productImage.findMany();
  if (images.length === 0) return;
  
  for (const image of images) {
    await newDb.productImage.upsert({
      where: { id: image.id },
      update: image,
      create: image,
    });
  }
  console.log(`   Migrated ${images.length} product images`);
}

async function migrateStocks() {
  const stocks = await oldDb.stock.findMany();
  if (stocks.length === 0) return;
  
  for (const stock of stocks) {
    await newDb.stock.upsert({
      where: { 
        product_id_branch_id: {
          product_id: stock.product_id,
          branch_id: stock.branch_id,
        }
      },
      update: stock,
      create: stock,
    });
  }
  console.log(`   Migrated ${stocks.length} stock records`);
}

async function migrateStockMovements() {
  const movements = await oldDb.stockMovement.findMany();
  if (movements.length === 0) return;
  
  for (const movement of movements) {
    await newDb.stockMovement.create({
      data: movement,
    });
  }
  console.log(`   Migrated ${movements.length} stock movements`);
}

async function migrateOrders() {
  const orders = await oldDb.order.findMany();
  if (orders.length === 0) return;
  
  for (const order of orders) {
    await newDb.order.upsert({
      where: { id: order.id },
      update: order,
      create: order,
    });
  }
  console.log(`   Migrated ${orders.length} orders`);
}

async function migrateOrderItems() {
  const items = await oldDb.orderItem.findMany();
  if (items.length === 0) return;
  
  for (const item of items) {
    await newDb.orderItem.create({
      data: item,
    });
  }
  console.log(`   Migrated ${items.length} order items`);
}

async function migrateSales() {
  const sales = await oldDb.sale.findMany();
  if (sales.length === 0) return;
  
  for (const sale of sales) {
    await newDb.sale.upsert({
      where: { id: sale.id },
      update: sale,
      create: sale,
    });
  }
  console.log(`   Migrated ${sales.length} sales`);
}

async function migrateSaleItems() {
  const items = await oldDb.saleItem.findMany();
  if (items.length === 0) return;
  
  for (const item of items) {
    await newDb.saleItem.create({
      data: item,
    });
  }
  console.log(`   Migrated ${items.length} sale items`);
}

async function migratePurchaseOrders() {
  const pos = await oldDb.purchaseOrder.findMany();
  if (pos.length === 0) return;
  
  for (const po of pos) {
    await newDb.purchaseOrder.upsert({
      where: { id: po.id },
      update: po,
      create: po,
    });
  }
  console.log(`   Migrated ${pos.length} purchase orders`);
}

async function migratePurchaseOrderItems() {
  const items = await oldDb.purchaseOrderItem.findMany();
  if (items.length === 0) return;
  
  for (const item of items) {
    await newDb.purchaseOrderItem.create({
      data: item,
    });
  }
  console.log(`   Migrated ${items.length} purchase order items`);
}

async function migrateCashFlows() {
  const cashflows = await oldDb.cashFlow.findMany();
  if (cashflows.length === 0) return;
  
  for (const cashflow of cashflows) {
    await newDb.cashFlow.upsert({
      where: { id: cashflow.id },
      update: cashflow,
      create: cashflow,
    });
  }
  console.log(`   Migrated ${cashflows.length} cash flows`);
}

async function migrateExpenses() {
  const expenses = await oldDb.expense.findMany();
  if (expenses.length === 0) return;
  
  for (const expense of expenses) {
    await newDb.expense.create({
      data: expense,
    });
  }
  console.log(`   Migrated ${expenses.length} expenses`);
}

async function migrateEmployeeTypes() {
  const types = await oldDb.employeeType.findMany();
  if (types.length === 0) return;
  
  for (const type of types) {
    await newDb.employeeType.upsert({
      where: { id: type.id },
      update: type,
      create: type,
    });
  }
  console.log(`   Migrated ${types.length} employee types`);
}

async function migrateEmployees() {
  const employees = await oldDb.employee.findMany();
  if (employees.length === 0) return;
  
  for (const employee of employees) {
    await newDb.employee.upsert({
      where: { id: employee.id },
      update: employee,
      create: employee,
    });
  }
  console.log(`   Migrated ${employees.length} employees`);
}

async function migrateShifts() {
  const shifts = await oldDb.shift.findMany();
  if (shifts.length === 0) return;
  
  for (const shift of shifts) {
    await newDb.shift.upsert({
      where: { id: shift.id },
      update: shift,
      create: shift,
    });
  }
  console.log(`   Migrated ${shifts.length} shifts`);
}

async function migrateShiftAssignments() {
  const assignments = await oldDb.shiftAssignment.findMany();
  if (assignments.length === 0) return;
  
  for (const assignment of assignments) {
    await newDb.shiftAssignment.upsert({
      where: { 
        employee_id_start_date: {
          employee_id: assignment.employee_id,
          start_date: assignment.start_date,
        }
      },
      update: assignment,
      create: assignment,
    });
  }
  console.log(`   Migrated ${assignments.length} shift assignments`);
}

async function migrateSalaries() {
  const salaries = await oldDb.salary.findMany();
  if (salaries.length === 0) return;
  
  for (const salary of salaries) {
    await newDb.salary.upsert({
      where: {
        employee_id_month_year: {
          employee_id: salary.employee_id,
          month: salary.month,
          year: salary.year,
        }
      },
      update: salary,
      create: salary,
    });
  }
  console.log(`   Migrated ${salaries.length} salaries`);
}

async function migrateNotifications() {
  const notifications = await oldDb.notification.findMany();
  if (notifications.length === 0) return;
  
  for (const notification of notifications) {
    await newDb.notification.create({
      data: {
        id: notification.id,
        type: notification.type,
        priority: notification.priority,
        title: notification.title,
        message: notification.message,
        category: notification.category,
        is_read: notification.is_read,
        branch_id: notification.branch_id,
        user_id: notification.user_id,
        metadata: notification.metadata as any,
        created_at: notification.created_at,
        read_at: notification.read_at,
      },
    });
  }
  console.log(`   Migrated ${notifications.length} notifications`);
}

async function migrateSessions() {
  const sessions = await oldDb.session.findMany();
  if (sessions.length === 0) return;
  
  for (const session of sessions) {
    await newDb.session.upsert({
      where: { id: session.id },
      update: session,
      create: session,
    });
  }
  console.log(`   Migrated ${sessions.length} sessions`);
}

async function migrateDeviceIdentities() {
  const devices = await oldDb.deviceIdentity.findMany();
  if (devices.length === 0) return;
  
  for (const device of devices) {
    await newDb.deviceIdentity.upsert({
      where: { id: device.id },
      update: device,
      create: device,
    });
  }
  console.log(`   Migrated ${devices.length} device identities`);
}

async function migrateDiscounts() {
  const discounts = await oldDb.discount.findMany();
  if (discounts.length === 0) return;
  
  for (const discount of discounts) {
    await newDb.discount.upsert({
      where: { id: discount.id },
      update: discount,
      create: discount,
    });
  }
  console.log(`   Migrated ${discounts.length} discounts`);
}

// Run migration
migrateData()
  .then(() => {
    console.log('\n✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });

