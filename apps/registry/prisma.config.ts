import "dotenv/config";
import { defineConfig } from "prisma/config";

const defaultDatabaseUrl =
  "postgresql://DB_USER:DB_PASSWORD@DB_HOST:5432/novapay_registry?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.REGISTRY_DATABASE_URL ??
      process.env.DATABASE_URL ??
      defaultDatabaseUrl,
  },
});
