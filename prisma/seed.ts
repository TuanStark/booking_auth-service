import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Start seeding...");

  // 1. Create roles
  await prisma.role.createMany({
    data: [
      { id: "b86dd951-4a46-4295-97f1-82015d02f672", name: "ADMIN" },
      { id: "cb8d828d-c0b9-460f-8b30-f7de4152e84f", name: "USER" }
    ],
    skipDuplicates: true
  });

  // 2. Hash password for admin
  const hashedPassword = await argon2.hash("123456789");

  // 3. Create admin user
  await prisma.user.upsert({
    where: { email: "admin@booking.com" },
    update: {},
    create: {
      email: "admin@booking.com",
      password: hashedPassword,
      roleId: "b86dd951-4a46-4295-97f1-82015d02f672"
    }
  });

  console.log("✅ Seeding completed.");
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
