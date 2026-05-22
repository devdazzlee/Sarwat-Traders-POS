import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// New admin credentials — does NOT touch or delete any existing user.
const NEW_ADMIN_EMAIL = 'admin2@sarwattrader.com';
const NEW_ADMIN_PASSWORD = 'Admin@Sarwat2026';

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: NEW_ADMIN_EMAIL },
  });

  if (existing) {
    console.log(`User already exists: ${NEW_ADMIN_EMAIL} — nothing changed.`);
    return;
  }

  const password = await bcrypt.hash(NEW_ADMIN_PASSWORD, 10);

  const user = await prisma.user.create({
    data: {
      email: NEW_ADMIN_EMAIL,
      password,
      role: Role.ADMIN,
    },
  });

  console.log('New admin created successfully:');
  console.log(`  id:       ${user.id}`);
  console.log(`  email:    ${NEW_ADMIN_EMAIL}`);
  console.log(`  password: ${NEW_ADMIN_PASSWORD}`);
  console.log(`  role:     ${user.role}`);
}

main()
  .catch((e) => {
    console.error('Failed to create admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
