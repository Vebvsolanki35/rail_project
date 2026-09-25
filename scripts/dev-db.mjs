#!/usr/bin/env node
/**
 * LOCAL DEVELOPMENT DATABASE — a real PostgreSQL server, no Docker required.
 *
 * `embedded-postgres` ships platform-native PostgreSQL binaries as npm
 * dependencies, so the whole team can run the exact Postgres the production
 * deployment uses without installing anything system-wide. This is the only
 * reason the app can be demoed on a laptop with no cloud database.
 *
 *   npm run db:dev          # start (and initialise on first run)
 *   npm run db:push         # apply src/db/schema.ts   (separate terminal)
 *   npm run dev             # run the app
 *
 * The cluster lives in /tmp/railrakshak-pgdata (override with PGDATA_DIR) and is
 * stopped with Ctrl-C.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";
import "dotenv/config";

const DATA_DIR = path.resolve(process.env.PGDATA_DIR ?? "/tmp/railrakshak-pgdata");
const PORT = Number(process.env.PGPORT ?? 5433);
const USER = process.env.PGUSER ?? "postgres";
const PASSWORD = process.env.PGPASSWORD ?? "postgres";
const DBS = [process.env.PGDATABASE ?? "app_db"];

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
});

const initialised = existsSync(path.join(DATA_DIR, "PG_VERSION"));

if (!initialised) {
  console.log(`[db:dev] initialising a fresh cluster in ${DATA_DIR}`);
  await pg.initialise();
}

await pg.start();
console.log(`[db:dev] PostgreSQL ${initialised ? "(existing cluster)" : "(new cluster)"} listening on ${USER}@127.0.0.1:${PORT}`);

for (const name of DBS) {
  try {
    await pg.createDatabase(name);
    console.log(`[db:dev] created database "${name}"`);
  } catch (e) {
    const msg = String(e);
    if (/already exists/i.test(msg)) console.log(`[db:dev] database "${name}" already exists`);
    else console.log(`[db:dev] could not create "${name}": ${msg.split("\n")[0]}`);
  }
}

console.log(`[db:dev] DATABASE_URL=postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DBS[0]}`);
console.log("[db:dev] ready — Ctrl-C to stop");

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log("\n[db:dev] stopping PostgreSQL…");
  try {
    await pg.stop();
  } catch {
    /* already down */
  }
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Keep the process alive while the server runs.
setInterval(() => {}, 1 << 30);
