import pg from "pg";
import { poolConfig } from "./db-config.js";
const globalForPool = globalThis;
export function getPool() {
  if (!globalForPool.__bibPool) {
    globalForPool.__bibPool = new pg.Pool(poolConfig());
    // Open a couple of connections now so the first page after a start does not wait for them.
    if (!process.env["VERCEL"]) {
      for (let i = 0; i < 3; i++) void globalForPool.__bibPool.query("SELECT 1").catch(() => {});
    }
  }
  return globalForPool.__bibPool;
}
const WAKING = "The database is waking up. Please try again in a few seconds.";
const isConnectFailure = (e) =>
  /timeout exceeded when trying to connect|Connection terminated|ECONNRESET|ETIMEDOUT/i.test(
    e instanceof Error ? e.message : "",
  );

// One quiet retry covers a database that was asleep; if it still cannot be reached, say so plainly.
export async function query(text, params = []) {
  try {
    return await getPool().query(text, params);
  } catch (error) {
    if (!isConnectFailure(error)) throw error;
    try {
      return await getPool().query(text, params);
    } catch (again) {
      if (isConnectFailure(again)) throw new Error(WAKING);
      throw again;
    }
  }
}
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
