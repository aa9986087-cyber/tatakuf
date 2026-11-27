// Build worker/bluff.json (الخدعة): the same facts as the classic bank, said as a sentence with a blank
// (____) that players fill with a convincing fake. Only questions with exactly one true answer are
// turned: «which of these…» questions and anything with several right answers (a film's cast, a
// country's neighbours) are left out, because a player's «fake» could be true.
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
const RULES = [
  // places
  [/^ما عاصمة (.+)؟$/, "عاصمة $1 هي ____."], [/^(.+) عاصمة أي دولة؟$/, "مدينة $1 عاصمة ____."], [/^في أي قارة تقع (.+)؟$/, "تقع $1 في قارة ____."],
  [/^ما العملة الرسمية في (.+)؟$/, "العملة الرسمية في $1 اسمها ____."], [/^ما اللغة الرسمية في (.+)؟$/, "اللغة الرسمية في $1 هي ____."],
  [/^كم دولة تحدّ (.+) برًّا؟$/, "عدد الدول اللي تحدّ $1 برًّا ____."],
  [/^في أي دولة (تقع مدينة|يقع جبل|تقع بحيرة|تقع جزيرة|يقع بركان|تقع صحراء|يقع) (.+)؟$/, "$1 $2 في ____."],
  [/^في أي قارة يجري (.+)؟$/, "يجري $1 في قارة ____."], [/^في أي مدينة يقع (.+)؟$/, "يقع $1 في مدينة ____."],
  // history
  [/^في أي سنة تأسست دولة (.+) بصورتها الحالية؟$/, "تأسست دولة $1 بصورتها الحالية سنة ____."],
  [/^في أي سنة (وُلد|وُلدت|توفي|توفيت|وقعت|وُقّعت|تأسست|تأسس|قامت|انتهت|نُشر العمل الأدبي|اكتُشف عنصر|بدأ عرض مسلسل|صدر فيلم) (.+)؟$/, "$1 $2 سنة ____."],
  [/^من يُنسب إليه اكتشاف أو اختراع «(.+)»؟$/, "يُنسب اكتشاف أو اختراع «$1» إلى ____."],
  // people and sport
  [/^بماذا (اشتهر|اشتهرت) (.+)؟$/, "$1 $2 في مجال ____."], [/^ما الرياضة التي (اشتهر|اشتهرت) بها (.+)؟$/, "$1 $2 في رياضة ____."],
  [/^من أي دولة نشأت رياضة (.+)؟$/, "نشأت رياضة $1 في ____."], [/^من أي دولة أصل طبق «(.+)»؟$/, "أصل طبق «$1» من ____."],
  [/^من أي دولة (فيلم|مسلسل) «(.+)»؟$/, "$1 «$2» من إنتاج ____."], [/^من أي دولة (.+)؟$/, "$1 من ____."],
  [/^من فاز بكأس العالم لكرة القدم سنة (.+)؟$/, "فاز ____ بكأس العالم لكرة القدم سنة $1."], [/^أين أقيمت (.+)؟$/, "أقيمت $1 في ____."],
  // screen and culture
  [/^من أخرج فيلم «(.+)»؟$/, "أخرج فيلم «$1» المخرج ____."], [/^في أي عمل تظهر شخصية «(.+)»؟$/, "تظهر شخصية «$1» في ____."],
  [/^من مؤلف «(.+)»؟$/, "مؤلف «$1» هو ____."], [/^من رسم لوحة «(.+)»؟$/, "رسم لوحة «$1» الفنان ____."], [/^بأي لغة كُتبت «(.+)» أصلًا؟$/, "كُتب «$1» أصلًا باللغة ____."],
  [/^في أي متحف تُعرض لوحة «(.+)»؟$/, "تُعرض لوحة «$1» في ____."], [/^لمن العمل الموسيقي «(.+)»؟$/, "العمل الموسيقي «$1» من أعمال ____."], [/^بأي أبجدية تُكتب (.+)؟$/, "تُكتب $1 بأبجدية ____."],
  // science and animals
  [/^ما العدد الذري لعنصر (.+)؟$/, "العدد الذري لعنصر $1 هو ____."], [/^أي عنصر عدده الذري (.+)؟$/, "العنصر الذي عدده الذري $1 هو ____."], [/^من اكتشف عنصر (.+)؟$/, "اكتشف عنصر $1 العالِم ____."],
  [/^إلى أي مجموعة ينتمي حيوان «(.+)»؟$/, "ينتمي حيوان «$1» إلى ____."], [/^حول أي كوكب يدور القمر «(.+)»؟$/, "يدور القمر «$1» حول كوكب ____."],
  // letters and flags
  [/^حرف «(.+?)»: (.+)\.$/, "حرف «$1»: $2، والجواب ____."],
  [/^لمن هذا العلم؟$/, "هذا العلم يرفرف فوق ____."], [/^ما عاصمة الدولة صاحبة هذا العلم؟$/, "عاصمة الدولة صاحبة هذا العلم هي ____."],
  [/^في أي قارة تقع الدولة صاحبة هذا العلم؟$/, "تقع الدولة صاحبة هذا العلم في قارة ____."], [/^ما عملة الدولة صاحبة هذا العلم؟$/, "عملة الدولة صاحبة هذا العلم اسمها ____."]
];
/** The sentence with a blank for a classic question, or null when it should not become one. */
function blank(x, loose) {
  const [prompt, answer] = x;
  if (/^أي /.test(prompt) || String(answer).length > 26) return null;
  for (const [re, out] of RULES) if (re.test(prompt)) return [prompt.replace(re, out), ...x.slice(1)];
  // worked-out sums and facts: the question stays a question, the answer is the blank
  return loose && /؟$/.test(prompt) ? [`${prompt} الجواب: ____.`, ...x.slice(1)] : null;
}
// what a team is called in a final («منتخب الأوروغواي لكرة القدم» is just «الأوروغواي»)
const shortAnswer = (x) => [x[0], ...x.slice(1, 5).map((v) => String(v).replace(/^منتخب (.+?) (الوطني )?لكرة القدم$/, "$1")), ...x.slice(5)];

const file = new URL("../../worker/bluff.json", import.meta.url);
const bank = JSON.parse(readFileSync(file, "utf8"));
const made = {
  general: () => general(5).map((x) => blank(x, true)),
  science: () => [...elements(), ...scienceCalc(9)].map((x) => blank(x, true)),
  sports: () => [...sportsExtra(), ...famous(23, true)].map((x) => blank(x)),
  places: () => places(33).map((x) => blank(x)),
  history: () => [...history(43), ...elements()].map((x) => blank(x)).filter((x) => x && !/عنصر/.test(x[0])),
  culture: () => culture(53).map((x) => blank(x)),
  movies: () => screen(63).map((x) => blank(x)),
  flags: () => flags([], 103).map((x) => blank(x)),
  animals: () => animals(83).map((x) => blank(x)),
  people: () => famous(25, false).map((x) => blank(x)),
  letters: () => letters(93).map((x) => blank(x))
};
const key = (x) => x[0].normalize("NFKC").toLowerCase().replace(/[\p{P}\p{M}\s]+/gu, "") + (x[5]?.file ?? "");
const used = new Set(Object.values(bank).flat().map(key));
const report = [];
for (const [cat, gen] of Object.entries(made)) {
  const have = bank[cat] || [], r = rng(cat.length * 17);
  // one kind of sentence after another, not hundreds of the same kind in a row
  const kinds = new Map();
  for (const x of shuffle(r, gen().filter((x) => x && arabicOnly(...x.slice(0, 5))).map(shortAnswer))) { const k = x[0].replace(/[0-9٠-٩.,]+/g, "#").split(/\s+/).slice(0, 2).join(" ") + (x[5] ? "#img" : ""); if (!kinds.has(k)) kinds.set(k, []); kinds.get(k).push(x); }
  const queues = [...kinds.values()], list = [];
  while (queues.some((qs) => qs.length)) for (const qs of queues) if (qs.length) list.push(qs.shift());
  const fresh = [];
  for (const x of list) {
    if (have.length + fresh.length >= TARGET) break;
    if (used.has(key(x)) || new Set(x.slice(1, 5)).size !== 4) continue;
    used.add(key(x)); fresh.push(x);
  }
  bank[cat] = [...have, ...fresh];
  report.push(`${cat.padEnd(10)} ${String(have.length).padStart(5)} → ${String(bank[cat].length).padStart(5)}`);
}
const fmt = (v) => Array.isArray(v) ? `[${v.map(fmt).join(", ")}]` : v && typeof v === "object" ? `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${fmt(x)}`).join(", ")}}` : JSON.stringify(v);
writeFileSync(file, `{\n${Object.entries(bank).map(([cat, list]) => `  ${JSON.stringify(cat)}: [\n${list.map((x) => `    ${fmt(x)}`).join(",\n")}\n  ]`).join(",\n")}\n}\n`);
console.log(report.join("\n"));
console.log("total", Object.values(bank).flat().length);
