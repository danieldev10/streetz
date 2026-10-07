import pg from "pg";

export async function assertPreparedDatabase(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000, query_timeout: 3000 });
  await client.connect();
  try {
    const marker = await client.query("SELECT to_regclass('ci_metadata.target') AS marker");
    if (!marker.rows[0].marker) throw new Error("Run ci:prepare first; refusing fixtures in an unmarked database.");
    const result = await client.query("SELECT kind FROM ci_metadata.target");
    if (result.rowCount !== 1 || result.rows[0].kind !== "crushclub-integration-tests") {
      throw new Error("Disposable database marker does not match.");
    }
  } finally { await client.end(); }
}
