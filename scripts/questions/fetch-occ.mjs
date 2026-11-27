// Every occupation of every person we use, and which of our fields (if any) each one belongs to, so
// «بماذا اشتهر» is only asked when a person's occupations all point the same way.
import { byIds } from "./sparql.mjs";
import { readFileSync } from "node:fs";
import { OCCUPATIONS } from "./fetch-list.mjs";
const ids = Object.keys(OCCUPATIONS).flatMap((o) => JSON.parse(readFileSync(new URL(`./data/people-${o}.json`, import.meta.url), "utf8")).map((r) => r.p));
const roots = Object.values(OCCUPATIONS).map(([q]) => `wd:${q}`).join(" ");
const rows = await byIds("people-occ", ids, `?x wdt:P106 ?o. OPTIONAL { VALUES ?root { ${roots} } ?o wdt:P279* ?root }`, { chunk: 120 });
console.log("people-occ", rows.length);
