import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { build } from "./build.mjs";

export async function openLocalDatabase(path = ":memory:") {
  const sql = new DatabaseSync(path);
  const table = sql.prepare("SELECT name FROM sqlite_master WHERE name = 'rooms' AND type = 'table'").get();
  if (!table) sql.exec(await readFile("drizzle/0000_rooms.sql", "utf8"));
  return {
    prepare(query) {
      const statement = sql.prepare(query);
      return {
        bind(...values) {
          return {
            async first() { return statement.get(...values) ?? null; },
            async run() { return { meta: statement.run(...values) }; }
          };
        }
      };
    },
    close() { sql.close(); }
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { values } = parseArgs({
    options: {
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "4173" },
      strictPort: { type: "boolean" }
    }
  });
  await build();
  const { default: worker } = await import("../dist/server/index.js");
  const db = await openLocalDatabase(".preview.sqlite");
  createServer(async (incoming, outgoing) => {
    try {
      const method = incoming.method;
      const request = new Request(new URL(incoming.url, `http://${incoming.headers.host}`), {
        method,
        headers: incoming.headers,
        ...(method === "GET" || method === "HEAD" ? {} : { body: incoming, duplex: "half" })
      });
      const result = await worker.fetch(request, { DB: db });
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      outgoing.end(method === "HEAD" ? undefined : Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      console.error(error);
      outgoing.writeHead(500).end();
    }
  }).listen(Number(values.port), values.host, () => {
    console.log(`Preview listening on http://${values.host}:${values.port}`);
  });
}
