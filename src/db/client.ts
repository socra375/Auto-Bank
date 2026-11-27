import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/** Lazy singleton. DATABASE_URL must be the Neon *pooled* connection string. */
let _db: ReturnType<typeof create> | undefined;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(new Pool({ connectionString: url, max: 5 }), { schema });
}

export function getDb() {
  return (_db ??= create());
}
