// Helpers shared by the question generators.
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
export const pick = (r, list) => list[Math.floor(r() * list.length)];
export const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
export function shuffle(r, list) { const a = [...list]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/** n different wrong answers from a pool (never the right one, never twice). */
export function wrongFrom(r, pool, right, n = 3) {
  const out = new Set(), seen = new Set([String(right)]);
  for (const v of shuffle(r, pool)) { const s = String(v); if (seen.has(s) || !s) continue; seen.add(s); out.add(s); if (out.size === n) break; }
  return out.size === n ? [...out] : null;
}
/** Three nearby wrong numbers (distinct, positive unless allowed). */
export function nearNumbers(r, right, spread, { min = 0, step = 1 } = {}) {
  const out = new Set();
  for (let t = 0; t < 200 && out.size < 3; t += 1) {
    const d = (int(r, 1, Math.max(1, Math.round(spread / step))) * step) * (r() < 0.5 ? -1 : 1);
    const v = Math.round((right + d) * 1000) / 1000;
    if (v !== right && v >= min) out.add(v);
  }
  return out.size === 3 ? [...out].map(String) : null;
}
// Only Arabic letters (digits, punctuation and spaces are fine): the same rule as the tests.
const nonArabic = /[\p{L}--[\p{Script=Arabic}ـ]]/v;
export const arabicOnly = (...texts) => texts.every((t) => typeof t === "string" && t.trim() && !nonArabic.test(t));
/** A question if it is clean: Arabic only, four different options, nothing empty or too long. */
export function q(prompt, right, wrong, image) {
  if (!wrong || wrong.length !== 3) return null;
  const all = [prompt, String(right), ...wrong.map(String)];
  if (!arabicOnly(...all)) return null;
  if (new Set(all.slice(1).map((s) => s.trim())).size !== 4) return null;
  if (all.slice(1).some((s) => s.length > 60) || prompt.length > 200) return null;
  return image ? [...all, image] : all;
}
/** Year of a Wikidata date ("+1952-03-01T00:00:00Z"), or null for BC and missing dates. */
export const yearOf = (d) => { const m = /^\+?(\d{3,4})-/.exec(d || ""); return m ? Number(m[1]) : null; };
export const clean = (s) => (s || "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();

/** A number with its noun as Arabic counts it: 3–10 take the plural, 11 and up the singular (منصوب). */
export const count = (n, few, many, one = many) => `${n} ${n === 1 ? one : n >= 3 && n <= 10 ? few : many}`;
