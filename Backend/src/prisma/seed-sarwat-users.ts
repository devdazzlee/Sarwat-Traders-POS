import { PrismaClient, Role, BranchType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Sarwat Traders users and branches...');

  // 1. Create Branches
  const warehouse = await prisma.branch.upsert({
    where: { code: 'WH-001' },
    update: {},
    create: {
      code: 'WH-001',
      name: 'Sarwat Main Warehouse',
      address: 'Industrial Area, Karachi',
      branch_type: BranchType.WAREHOUSE,
      is_active: true,
    },
  });

  const branch = await prisma.branch.upsert({
    where: { code: 'BR-001' },
    update: {},
    create: {
      code: 'BR-001',
      name: 'Sarwat City Branch',
      address: 'Main Market, Karachi',
      branch_type: BranchType.BRANCH,
      is_active: true,
    },
  });

  console.log('Branches created:', { warehouse: warehouse.id, branch: branch.id });

  // 2. Clear existing users with these emails to avoid conflicts
  const emails = [
    'admin@sarwattraders.com',
    'branch.manager@sarwattraders.com',
    'warehouse.manager@sarwattraders.com',
  ];

  await prisma.user.deleteMany({
    where: {
      email: { in: emails },
    },
  });

  // 3. Create Users
  const password = await bcrypt.hash('Sarwat@123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@sarwattraders.com',
      password: password,
      role: Role.ADMIN,
    },
  });

  const branchManager = await prisma.user.create({
    data: {
      email: 'branch.manager@sarwattraders.com',
      password: password,
      role: Role.BRANCH_MANAGER,
      branch_id: branch.id,
    },
  });

  const warehouseManager = await prisma.user.create({
    data: {
      email: 'warehouse.manager@sarwattraders.com',
      password: password,
      role: Role.WAREHOUSE_MANAGER,
      branch_id: warehouse.id,
    },
  });

  console.log('Users created successfully:');
  console.log('- Admin: admin@sarwattraders.com');
  console.log('- Branch Manager: branch.manager@sarwattraders.com');
  console.log('- Warehouse Manager: warehouse.manager@sarwattraders.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
