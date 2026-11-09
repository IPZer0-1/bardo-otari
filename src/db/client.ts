import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });
}

// Reusar el pool entre hot-reloads en desarrollo
const pool = global._pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") global._pgPool = pool;

export default pool;
