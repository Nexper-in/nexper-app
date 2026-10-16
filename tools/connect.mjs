// One way to open a database connection for every tool: encrypted, and the server's
// certificate checked unless you say otherwise.
//   DATABASE_CA=path   the Supabase "SSL certificate" file (recommended)
//   --no-verify-ssl    skip the check (encrypted, server not verified): say so in the release notes
import fs from "node:fs";

export async function connect(url, argv = process.argv) {
  const { default: pg } = await import("pg");
  const local = /localhost|127\.0\.0\.1/.test(url);
  let ssl = false;
  if (!local) {
    if (argv.includes("--no-verify-ssl")) {
      console.warn("WARNING: server certificate is not being verified.");
      ssl = { rejectUnauthorized: false };
    } else if (process.env.DATABASE_CA) {
      ssl = { rejectUnauthorized: true, ca: fs.readFileSync(process.env.DATABASE_CA, "utf8") };
    } else {
      ssl = { rejectUnauthorized: true };
    }
  }
  const client = new pg.Client({ connectionString: url, ssl });
  await client.connect();
  return client;
}
