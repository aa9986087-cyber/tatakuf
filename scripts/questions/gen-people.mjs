// شخصيات مشهورة and رياضة: famous people by what they are known for and where they are from.
import { rng, pick, q, wrongFrom, shuffle } from "./lib.mjs";
import { load, group, one, yearOne } from "./data.mjs";
import { OCCUPATIONS } from "./fetch-list.mjs";
import { countries as countriesNow } from "./gen-places.mjs";

// what each occupation is called as a field, and which family it is in
export const FIELD = {
  footballer: ["كرة القدم", "sport"], basketball: ["كرة السلة", "sport"], tennis: ["التنس", "sport"], boxer: ["الملاكمة", "sport"], racing: ["سباقات السيارات", "sport"],
  swimmer: ["السباحة", "sport"], sprinter: ["ألعاب القوى", "sport"], chess: ["الشطرنج", "sport"], cyclist: ["سباق الدراجات", "sport"],
  actor: ["التمثيل", "screen"], director: ["الإخراج السينمائي", "screen"], singer: ["الغناء", "music"], composer: ["التأليف الموسيقي", "music"], musician: ["الموسيقى", "music"],
  writer: ["الأدب والكتابة", "letters"], poet: ["الشعر", "letters"], novelist: ["الأدب والكتابة", "letters"], painter: ["الرسم", "art"], sculptor: ["النحت", "art"], architect: ["العمارة والتصميم", "art"],
  physicist: ["الفيزياء", "science"], chemist: ["الكيمياء", "science"], mathematician: ["الرياضيات", "science"], astronomer: ["علم الفلك", "science"], inventor: ["الاختراع", "science"], physician: ["الطب", "science"],
  philosopher: ["الفلسفة", "thought"], economist: ["الاقتصاد", "thought"], politician: ["السياسة", "power"], monarch: ["الحكم والملك", "power"], military: ["القيادة العسكرية", "power"],
  explorer: ["الاستكشاف والرحلات", "travel"], astronaut: ["رحلات الفضاء", "travel"], businessperson: ["المال والأعمال", "business"]
};
const FAMILY_FIELD = { sport: null, screen: "السينما والتمثيل", music: "الموسيقى والغناء", letters: "الأدب والكتابة", art: "الفنون", science: "العلوم", thought: "الفكر والفلسفة", power: "السياسة والحكم", travel: "الاستكشاف والرحلات", business: "المال والأعمال" };
const ROLE = { footballer: ["لاعب كرة قدم", "لاعبة كرة قدم"], basketball: ["لاعب كرة سلة", "لاعبة كرة سلة"], tennis: ["لاعب تنس", "لاعبة تنس"], boxer: ["ملاكم", "ملاكمة"], racing: ["سائق سباقات", "سائقة سباقات"],
  swimmer: ["سبّاح", "سبّاحة"], sprinter: ["عدّاء", "عدّاءة"], chess: ["لاعب شطرنج", "لاعبة شطرنج"], cyclist: ["درّاج", "درّاجة"], actor: ["ممثل", "ممثلة"], director: ["مخرج", "مخرجة"],
  singer: ["مغنٍّ", "مغنية"], composer: ["مؤلف موسيقي", "مؤلفة موسيقية"], painter: ["رسام", "رسامة"], poet: ["شاعر", "شاعرة"], novelist: ["روائي", "روائية"], physicist: ["فيزيائي", "فيزيائية"],
  chemist: ["كيميائي", "كيميائية"], mathematician: ["عالم رياضيات", "عالمة رياضيات"], astronomer: ["عالم فلك", "عالمة فلك"], philosopher: ["فيلسوف", "فيلسوفة"], explorer: ["مستكشف", "مستكشفة"],
  astronaut: ["رائد فضاء", "رائدة فضاء"], architect: ["معماري", "معمارية"], sculptor: ["نحّات", "نحّاتة"], monarch: ["ملك", "ملكة"] };

/** Everyone we know, with their occupations, nationality, gender and birth year. */
export function people() {
  const byId = new Map();
  for (const occ of Object.keys(OCCUPATIONS)) {
    for (const rec of group(load(`people-${occ}`), "p", "pL", ["born", "died"])) {
      if (!byId.has(rec.id)) byId.set(rec.id, { ...rec, occ: new Set() });
      byId.get(rec.id).occ.add(occ);
    }
  }
  const nat = new Map(), gender = new Map();
  for (const row of load("people-nation")) { if (!nat.has(row.x)) nat.set(row.x, new Set()); nat.get(row.x).add(row.natL); }
  for (const row of load("people-gender")) gender.set(row.x, row.g);
  // every occupation a person has, and the fields it belongs to (none: a nun, a missionary…)
  const rootToOcc = Object.fromEntries(Object.entries(OCCUPATIONS).map(([k, [q]]) => [q, k]));
  const occs = new Map();
  for (const row of load("people-occ")) {
    if (!occs.has(row.x)) occs.set(row.x, new Map());
    const m = occs.get(row.x); if (!m.has(row.o)) m.set(row.o, new Set());
    if (row.root) m.get(row.o).add(FIELD[rootToOcc[row.root]][1]);
  }
  /** One clear field: every occupation is in the same family, at most one is outside our list. */
  const clear = (id) => { const m = occs.get(id); if (!m) return false; const fams = new Set(), loose = [...m.values()].filter((f) => !f.size).length; for (const f of m.values()) for (const x of f) fams.add(x); return fams.size === 1 && loose <= 1; };
  return [...byId.values()].map((p) => ({ ...p, clear: clear(p.id), nation: one(nat.get(p.id)), female: gender.get(p.id) === "Q6581072", born: yearOne(p.f.born), died: yearOne(p.f.died) }))
    .filter((p) => p.label && p.label.length <= 40 && !/[0-9]/.test(p.label)).sort((a, b) => b.sl - a.sl);
}

export function famous(seed = 21, sport = false) {
  const r = rng(seed), all = people(), out = [];
  const fams = (p) => new Set([...p.occ].map((o) => FIELD[o][1]));
  const fieldOf = (p) => { const fs = fams(p); if (fs.size !== 1 || !p.clear) return null; const f = [...fs][0]; const names = new Set([...p.occ].map((o) => FIELD[o][0])); return names.size === 1 ? [...names][0] : FAMILY_FIELD[f]; };
  const pool = all.filter((p) => (sport ? fams(p).has("sport") && fams(p).size === 1 : !fams(p).has("sport")));
  // nationalities as today's countries are called (an empire or a state that is gone is left out)
  const today = new Map(countriesNow().map((c) => [c.wd, c.name]));
  for (const p of all) p.nation = p.nation ? today.get(p.nation) || null : null;
  const nations = [...new Set(all.map((p) => p.nation).filter(Boolean))];
  const fields = [...new Set(Object.values(FIELD).filter(([, f]) => (sport ? f === "sport" : f !== "sport")).map(([n]) => n))];
  for (const p of pool) {
    const he = !p.female, field = fieldOf(p);
    if (field && !(sport && field === "كرة القدم" && p.id.charCodeAt(p.id.length - 1) % 6)) { // football would fill this kind; one in six
      const famOf = (fname) => Object.values(FIELD).find(([n]) => n === fname)?.[1] || Object.entries(FAMILY_FIELD).find(([, n]) => n === fname)?.[0];
      const wrong = wrongFrom(r, fields.filter((f) => famOf(f) !== famOf(field) || sport), field);
      out.push(q(sport ? `ما الرياضة التي ${he ? "اشتهر" : "اشتهرت"} بها ${p.label}؟` : `بماذا ${he ? "اشتهر" : "اشتهرت"} ${p.label}؟`, field, wrong));
    }
    if (p.nation) out.push(q(`من أي دولة ${sport ? (he ? "اللاعب" : "اللاعبة") + " " : ""}${p.label}؟`, p.nation, wrongFrom(r, nations, p.nation)));
  }
  // "which of these is a …": one person in that line of work, three who are not
  for (const occ of Object.keys(ROLE)) {
    if ((FIELD[occ][1] === "sport") !== sport) continue;
    const yes = pool.filter((p) => p.clear && p.occ.size === 1 && p.occ.has(occ)).slice(0, 120);
    const no = pool.filter((p) => p.clear && !p.occ.has(occ) && fams(p).size === 1 && ![...fams(p)].includes(FIELD[occ][1]));
    for (const p of yes) {
      const others = wrongFrom(r, no.slice(0, 600).map((x) => x.label), p.label);
      out.push(q(`أي هؤلاء ${ROLE[occ][0]}؟`, p.label, others));
    }
  }
  return dedupe(out);
}
export const dedupe = (list) => { const seen = new Set(); return list.filter((x) => x && !seen.has(x[0] + "|" + x[1]) && seen.add(x[0] + "|" + x[1])); };
if (process.argv[1]?.endsWith("gen-people.mjs")) { for (const s of [false, true]) { const g = famous(21, s); console.log(s ? "sports" : "people", g.length); for (const x of shuffle(rng(3), g).slice(0, 8)) console.log(JSON.stringify(x)); } }
