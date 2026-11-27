// Loading the cached facts, tidied: one record per thing, Arabic names cleaned, years as numbers.
import { readFileSync, existsSync } from "node:fs";
import { yearOf, clean } from "./lib.mjs";
const dir = new URL("./data/", import.meta.url);
export const load = (name) => existsSync(new URL(`${name}.json`, dir)) ? JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")) : [];

/** Rows grouped by id: { id: { label, sl, many: { field: Set } } }. */
export function group(rows, id, label, fields) {
  const out = new Map();
  for (const row of rows) {
    const key = row[id];
    if (!out.has(key)) out.set(key, { id: key, label: clean(row[label]), raw: row[label] || "", sl: Number(row.sl || 0), f: Object.fromEntries(fields.map((f) => [f, new Set()])) });
    const rec = out.get(key);
    for (const f of fields) if (row[f] !== undefined && row[f] !== "") rec.f[f].add(f.endsWith("L") ? clean(row[f]) : row[f]);
  }
  return [...out.values()];
}
export const one = (set) => (set && set.size === 1 ? [...set][0] : null);
export const yearOne = (set) => { const ys = [...(set || [])].map(yearOf).filter((y) => y); return ys.length && ys.every((y) => y === ys[0]) ? ys[0] : null; };

// Country names as people say them (the world-countries list), keyed by the two-letter code.
const ml = load("mledoze-countries");
export const commonName = Object.fromEntries(ml.filter((c) => c.translations?.ara?.common).map((c) => [c.cca2, c.translations.ara.common]));
export const mlByCode = Object.fromEntries(ml.map((c) => [c.cca2, c]));

/** Only names that mean one thing: no «(…)» to tell them apart, and no other item with the same name. */
export function unambiguous(list) {
  const count = new Map(); for (const x of list) count.set(x.label, (count.get(x.label) || 0) + 1);
  return list.filter((x) => !/[()]/.test(x.raw) && count.get(x.label) === 1);
}
