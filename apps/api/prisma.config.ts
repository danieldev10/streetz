import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations must target the same database the running API uses. A stale
// DIRECT_URL previously allowed Railway to migrate one database while Nest
// connected to DATABASE_URL and then failed on the new schema.
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.DIRECT_URL ??
  "postgresql://postgres:postgres@localhost:5432/streetz?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl
  },
  migrations: {
    path: "prisma/migrations"
  }
});
