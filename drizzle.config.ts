import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// Load .env (see .env.example) so `npx drizzle-kit push` targets the same
// DATABASE_URL the app uses. Never hardcode credentials here.
config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required — copy .env.example to .env and set it.");
}

export default {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
} satisfies Config;
