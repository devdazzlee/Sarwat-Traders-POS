import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Sarwat Trader admin user...');

  await prisma.user.deleteMany({
    where: {
      email: 'admin@sarwattrader.com',
    },
  });

  const password = await bcrypt.hash('Sarwat@123', 10);

  await prisma.user.create({
    data: {
      email: 'admin@sarwattrader.com',
      password: password,
      role: Role.ADMIN,
    },
  });

  console.log('Admin user created: admin@sarwattrader.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
