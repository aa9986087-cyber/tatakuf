// A small Wikidata client for the question builder: run a SPARQL query (with retries) and cache the
// rows in data/<name>.json, so the bank can be rebuilt without the network.
import { readFile, writeFile, mkdir } from "node:fs/promises";
const here = new URL("./data/", import.meta.url);

export async function sparql(name, query, { force = false } = {}) {
  await mkdir(here, { recursive: true });
  const file = new URL(`${name}.json`, here);
  if (!force) { try { return JSON.parse(await readFile(file, "utf8")); } catch { /* fetch it */ } }
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    let res;
    try { res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      signal: AbortSignal.timeout(90000), headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/sparql-results+json", "user-agent": "quiz-bank-builder/1.0" },
      body: new URLSearchParams({ query })
    }); } catch (e) { console.error(name, "attempt", attempt, e.message); await new Promise((r) => setTimeout(r, 5000 * attempt)); continue; }
    if (res.ok) {
      let json;
      try { json = await res.json(); } catch (e) { console.error(name, "attempt", attempt, "cut short:", e.message); await new Promise((r) => setTimeout(r, 5000 * attempt)); continue; }
      const rows = json.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value.replace("http://www.wikidata.org/entity/", "")])));
      await writeFile(file, JSON.stringify(rows));
      return rows;
    }
    console.error(name, "attempt", attempt, res.status, (await res.text()).slice(0, 200));
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
  throw new Error(`query ${name} failed`);
}

/** The same query for many items, a few hundred ids at a time (bound to ?x), cached as one file. */
export async function byIds(name, ids, body, { force = false, chunk = 150 } = {}) {
  const file = new URL(`${name}.json`, here);
  if (!force) { try { return JSON.parse(await readFile(file, "utf8")); } catch { /* fetch it */ } }
  const out = [];
  const list = [...new Set(ids)];
  for (let i = 0; i < list.length; i += chunk) {
    const values = list.slice(i, i + chunk).map((q) => `wd:${q}`).join(" ");
    out.push(...await sparql(`_part-${process.pid}`, `SELECT * WHERE { VALUES ?x { ${values} } ${body} }`, { force: true }));
  }
  await writeFile(file, JSON.stringify(out));
  return out;
}
