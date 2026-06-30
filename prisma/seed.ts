import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import type { CategoryKind } from "@prisma/client";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaBetterSqlite3({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

type CategorySeed = {
  name: string;
  kind: CategoryKind;
  sa105Box: string | null;
  allowable: boolean;
};

const categories: CategorySeed[] = [
  { name: "Rent received", kind: "income", sa105Box: "20", allowable: true },
  { name: "Other property income", kind: "income", sa105Box: "21", allowable: true },
  { name: "Rent, rates, insurance, ground rents", kind: "expense", sa105Box: "24", allowable: true },
  { name: "Property repairs and maintenance", kind: "expense", sa105Box: "25", allowable: true },
  { name: "Legal, management, other professional fees", kind: "expense", sa105Box: "27", allowable: true },
  { name: "Costs of services provided, including wages", kind: "expense", sa105Box: "28", allowable: true },
  { name: "Other allowable property expenses", kind: "expense", sa105Box: "29", allowable: true },
  { name: "Mortgage / loan interest", kind: "finance", sa105Box: "44", allowable: true },
  { name: "Capital improvements", kind: "capital", sa105Box: null, allowable: false },
];

async function main() {
  let inserted = 0;
  for (const c of categories) {
    const existing = await prisma.category.findUnique({ where: { name: c.name } });
    await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
    if (!existing) inserted++;
  }
  console.log(`Seeded ${inserted} new categories (${categories.length - inserted} already existed).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
