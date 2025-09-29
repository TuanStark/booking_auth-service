import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/shared/utils/argon2.util";


const prisma = new PrismaClient();

async function main() {
  const roles = await prisma.role.createMany({
    data: [
      { id: "b86dd951-4a46-4295-97f1-82015d02f672", name: "ADMIN" },
      { id: "cb8d828d-c0b9-460f-8b30-f7de4152e84f", name: "USER" }
    ],
    skipDuplicates: true
  });

  // Hash mật khẩu admin
  const hashed = await hashPassword("123456789");

  // Insert admin user
  await prisma.user.upsert({
    where: { email: "admin@booking.com" },
    update: {},
    create: {
      email: "admin@booking.com",
      password: hashed,
      roleId: "b86dd951-4a46-4295-97f1-82015d02f672"
    }
  });
}

main()
  .then(async () => {
    console.log('🌱 Seeding completed.');
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
