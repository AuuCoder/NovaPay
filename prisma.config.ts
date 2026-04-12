import "dotenv/config";
import { defineConfig } from "prisma/config";

const defaultDatabaseUrl =
  "postgresql://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  },
});
