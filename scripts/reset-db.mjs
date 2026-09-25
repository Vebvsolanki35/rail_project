#!/usr/bin/env node
/**
 * Full schema reset for verification runs.
 *
 * Drops and recreates the `public` schema so a suite run starts from nothing,
 * then the next API call re-seeds through the application's own lazy seeding
 * path (never through a test-only shortcut). Usage: node scripts/reset-db.mjs
 */
import { Client } from "pg";

const dsn = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/app_db";
const c = new Client({ connectionString: dsn });
await c.connect();
await c.query("drop schema public cascade; create schema public;");
const { rows } = await c.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
await c.end();
console.log(`schema reset — ${rows[0].n} table(s) remaining in public`);
