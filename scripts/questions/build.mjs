// Build worker/questions.json: the questions already there stay first and in the same order (their ids
// are in players' histories), and each category is filled up to TARGET with generated ones, mixed so
// that one kind of question does not follow another for hundreds of rounds.
import { readFileSync, writeFileSync } from "node:fs";
import { rng, shuffle, arabicOnly } from "./lib.mjs";
import { general } from "./gen-general.mjs";
import { scienceCalc } from "./gen-science-calc.mjs";
import { famous } from "./gen-people.mjs";
import { places } from "./gen-places.mjs";
import { history, culture, screen, elements, animals } from "./gen-more.mjs";
import { letters } from "./gen-letters.mjs";
import { flags } from "./gen-flags.mjs";
import { sportsExtra } from "./gen-sports.mjs";

const TARGET = 5000;
const file = new URL("../../worker/questions.json", import.meta.url);
const bank = JSON.parse(readFileSync(file, "utf8"));

/** Round-robin over the kinds of question (the prompt's opening words), each kind in its own order. */
function mix(list, seed) {
  const r = rng(seed), kinds = new Map();
  for (const x of list) { const k = x[0].replace(/[0-9٠-٩.,]+/g, "#").split(/\s+/).slice(0, 3).join(" ") + (x[5] ? "#img" : ""); if (!kinds.has(k)) kinds.set(k, []); kinds.get(k).push(x); }
  const queues = shuffle(r, [...kinds.values()]).map((qs) => [...qs]);
  const out = [];
  while (queues.some((qs) => qs.length)) for (const qs of queues) if (qs.length) out.push(qs.shift());
  return out;
}
const made = {
  general: () => general(),
  science: () => [...elements(), ...scienceCalc()],
  sports: () => [...sportsExtra(), ...famous(23, true)],
  places: () => places(),
  history: () => history(),
  culture: () => culture(),
  movies: () => screen(),
  flags: () => flags(bank.flags),
  animals: () => animals(),
  people: () => famous(21, false),
  letters: () => letters()
};
// The bank's own rule (scripts/build.mjs): no two questions may read the same once punctuation and
// marks are dropped (the same wording with another picture is fine). A wording that is taken gets its
// four options written into it: «أي هؤلاء رسام: فلان، فلان، فلان أم فلان؟».
const key = (x) => x[0].normalize("NFKC").toLowerCase().replace(/[\p{P}\p{M}\s]+/gu, "") + (x[5]?.file ?? "");
const used = new Set(Object.values(bank).flat().map(key));
// answers compared loosely: «مدينة بروكسل» is «بروكسل», «الهند» is «هند»
const loose = (a) => String(a).normalize("NFKC").replace(/^مدينة\s+/, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").split(/\s+/).map((w) => w.replace(/^ال/, "")).join("");
const sameQuestion = new Set(Object.values(bank).flat().map((x) => key(x) + "|" + loose(x[1])));
const withOptions = (x, r) => { const o = shuffle(r, x.slice(1, 5)); return [`${x[0].replace(/[؟?]$/, "")}: ${o.slice(0, 3).join("، ")} أم ${o[3]}؟`, ...x.slice(1)]; };
const report = [];
for (const [cat, gen] of Object.entries(made)) {
  const have = bank[cat] || [], r = rng(cat.length * 13);
  const fresh = [];
  const list = gen().filter((x) => x && arabicOnly(...x.slice(0, 5)));
  const times = new Map(); for (const x of list) times.set(key(x), (times.get(key(x)) || 0) + 1);
  for (const x of mix(list, cat.length * 7)) {
    if (have.length + fresh.length >= TARGET) break;
    let item = x;
    if (sameQuestion.has(key(item) + "|" + loose(item[1]))) continue; // asked already, same answer
    sameQuestion.add(key(item) + "|" + loose(item[1]));
    if (used.has(key(item)) && times.get(key(x)) === 1) continue; // the bank asks this already, in its own words
    if (used.has(key(item))) { item = withOptions(x, r); if (used.has(key(item)) || item[0].length > 220) continue; }
    used.add(key(item)); fresh.push(item);
  }
  bank[cat] = [...have, ...fresh];
  report.push(`${cat.padEnd(10)} ${String(have.length).padStart(5)} → ${String(bank[cat].length).padStart(5)}`);
}
// the same layout as the hand-written file: one question per line
const fmt = (v) => Array.isArray(v) ? `[${v.map(fmt).join(", ")}]` : v && typeof v === "object" ? `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${fmt(x)}`).join(", ")}}` : JSON.stringify(v);
writeFileSync(file, `{\n${Object.entries(bank).map(([cat, list]) => `  ${JSON.stringify(cat)}: [\n${list.map((x) => `    ${fmt(x)}`).join(",\n")}\n  ]`).join(",\n")}\n}\n`);
console.log(report.join("\n"));
console.log("total", Object.values(bank).flat().length);
