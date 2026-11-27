// الحروف: the answer is typed, so every clue must lead to one word only. Built from facts where the
// answer is unique: a country from its capital, currency, language or two of its neighbours, a capital
// from its country, an element from its atomic number.
import { rng, q, wrongFrom, shuffle } from "./lib.mjs";
import { load, group, one } from "./data.mjs";
import { countries } from "./gen-places.mjs";
import { dedupe } from "./gen-people.mjs";

const bare = (w) => w.replace(/^ال/, "");
/** The letter a word starts with, as the game shows it («أ» for any alef, «هـ» for ha). */
export const letterOf = (w) => { const c = bare(w)[0]; return /[اأإآ]/.test(c) ? "أ" : c === "ه" ? "هـ" : c; };
const oneWord = (w) => w && !/\s/.test(w.trim()) && w.length >= 2;

export function letters(seed = 91) {
  const r = rng(seed), out = [], cs = countries();
  const words = [...new Set([...cs.map((c) => c.name), ...cs.map((c) => c.capital)].filter(oneWord))];
  const sameLetter = (w) => words.filter((x) => x !== w && letterOf(x) === letterOf(w));
  const make = (clue, answer) => { if (!oneWord(answer) || clue.includes(bare(answer))) return; out.push(q(`حرف «${letterOf(answer)}»: ${clue}`, answer, wrongFrom(r, sameLetter(answer), answer) || wrongFrom(r, words, answer))); };
  const uniq = (key) => { const m = new Map(); for (const c of cs) for (const v of key(c)) { if (!m.has(v)) m.set(v, []); m.get(v).push(c); } return m; };
  const byCur = uniq((c) => (c.currency ? [c.currency] : [])), byLang = uniq((c) => [...c.langs]);
  for (const c of cs) {
    if (c.capital && c.capital !== c.name) { make(`دولة عاصمتها ${c.capital}.`, c.name); make(`عاصمة ${c.name}.`, c.capital); }
    if (c.currency && byCur.get(c.currency).length === 1) make(`دولة عملتها «${c.currency}».`, c.name);
    for (const l of c.langs) if (byLang.get(l).length === 1) make(`دولة لغتها الرسمية ${l}.`, c.name);
    // two neighbours that only this country has both of
    const nb = c.borders;
    for (let i = 0; i < nb.length; i += 1) for (let j = i + 1; j < nb.length; j += 1) {
      const both = cs.filter((o) => o.borders.includes(nb[i]) && o.borders.includes(nb[j]));
      if (both.length === 1) make(`دولة تحدّها ${nb[i]} و${nb[j]}.`, c.name);
    }
    if (c.continent && c.capital) make(`دولة في ${c.continent} عاصمتها ${c.capital}.`, c.name);
  }
  for (const e of group(load("elements"), "x", "xL", ["n"])) { const n = Number(one(e.f.n)); if (n && oneWord(e.label)) out.push(q(`حرف «${letterOf(e.label)}»: العنصر الكيميائي الذي عدده الذري ${n}.`, e.label, wrongFrom(r, group(load("elements"), "x", "xL", ["n"]).map((x) => x.label).filter((x) => oneWord(x) && letterOf(x) === letterOf(e.label)), e.label) || wrongFrom(r, group(load("elements"), "x", "xL", ["n"]).map((x) => x.label), e.label))); }
  return dedupe(out);
}
if (process.argv[1]?.endsWith("gen-letters.mjs")) { const g = letters(); console.log(g.length); for (const x of shuffle(rng(5), g).slice(0, 10)) console.log(JSON.stringify(x)); }
