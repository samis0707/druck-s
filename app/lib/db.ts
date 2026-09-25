import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { config } from "./config";

let pool: Pool | null = null;

/** Shared Postgres pool. Server-side only — never import from client components. */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
    pool.on("error", (err) => {
      console.error("Unexpected Postgres pool error", err);
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<{ ok: boolean; detail: string }> {
  try {
    await query("SELECT 1");
    return { ok: true, detail: "reachable" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
