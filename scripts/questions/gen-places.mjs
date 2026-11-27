// جغرافيا: countries (capital, continent, currency, language, neighbours, size), cities, rivers,
// mountains, lakes, islands, deserts, volcanoes and landmarks.
import { rng, pick, q, wrongFrom, shuffle, clean } from "./lib.mjs";
import { load, group, one, commonName, mlByCode, unambiguous } from "./data.mjs";
import { dedupe } from "./gen-people.mjs";

const CONT = { "إفريقيا": "أفريقيا", "أفريقيا": "أفريقيا", "آسيا": "آسيا", "أوروبا": "أوروبا", "أمريكا الشمالية": "أمريكا الشمالية", "أمريكا الجنوبية": "أمريكا الجنوبية", "أوقيانوسيا": "أوقيانوسيا", "أستراليا": "أوقيانوسيا" };

const FIX = { "صيربيا": "صربيا", "مولدوڤا": "مولدوفا", "المسكيك": "المكسيك", "الجبل الاسود": "الجبل الأسود", "أوزباكستان": "أوزبكستان", "جمهورية أنغولا": "أنغولا", "مدينة الفاتيكان": "الفاتيكان", "مملكة الدنمارك": "الدنمارك" };
const BY_ISO = { CD: "الكونغو الديمقراطية", CG: "جمهورية الكونغو" };
/** Sovereign countries with one clear capital, continent and currency, named as people say them. */
export function countries() {
  const recs = group(load("countries"), "c", "cL", ["capL", "contL", "curL", "area", "pop", "iso"]);
  const langs = new Map(); for (const r of load("country-lang")) { if (!langs.has(r.c)) langs.set(r.c, new Set()); langs.get(r.c).add(clean(r.lL)); }
  const byQ = new Map();
  for (const c of recs) {
    const iso = one(c.f.iso), raw = (iso && commonName[iso]) || c.label, name = (iso && BY_ISO[iso]) || FIX[raw] || raw;
    const cont = [...c.f.contL].map((x) => CONT[x]).filter(Boolean);
    let capital = one(c.f.capL);
    if (capital && /^مدينة\s/.test(capital) && !name.includes(capital.replace(/^مدينة\s+/, ""))) capital = capital.replace(/^مدينة\s+/, ""); // «مدينة بروكسل» is said «بروكسل»
    byQ.set(c.id, { q: c.id, wd: c.label, iso, name, sl: c.sl, capital, continent: new Set(cont).size === 1 ? cont[0] : null, currency: one(c.f.curL),
      area: Number(one(c.f.area)) || (iso && mlByCode[iso]?.area) || null, pop: Math.max(...[...c.f.pop].map(Number), 0) || null, langs: langs.get(c.id) || new Set(), landlocked: iso ? mlByCode[iso]?.landlocked : null });
  }
  // land borders only (Wikidata's «shares border with» counts sea borders too)
  const byCca3 = Object.fromEntries(Object.values(mlByCode).map((m) => [m.cca3, m.cca2]));
  const nameOfIso = new Map([...byQ.values()].filter((c) => c.iso).map((c) => [c.iso, c.name]));
  for (const c of byQ.values()) c.borders = c.iso && mlByCode[c.iso] ? (mlByCode[c.iso].borders || []).map((k) => nameOfIso.get(byCca3[k])).filter(Boolean) : [];
  return [...byQ.values()].filter((c) => c.name && c.name.length < 30).sort((a, b) => b.sl - a.sl);
}

export function places(seed = 31) {
  const r = rng(seed), out = [], cs = countries();
  const names = cs.map((c) => c.name), caps = cs.map((c) => c.capital).filter(Boolean), conts = [...new Set(cs.map((c) => c.continent).filter(Boolean))];
  const sameCont = (c) => cs.filter((x) => x.continent && x.continent === c.continent).map((x) => x.name);
  for (const c of cs) {
    if (c.capital && c.capital !== c.name) {
      out.push(q(`ما عاصمة ${c.name}؟`, c.capital, wrongFrom(r, cs.filter((x) => x.continent === c.continent).map((x) => x.capital).filter(Boolean), c.capital) || wrongFrom(r, caps, c.capital)));
      out.push(q(`${c.capital} عاصمة أي دولة؟`, c.name, wrongFrom(r, sameCont(c), c.name) || wrongFrom(r, names, c.name)));
    }
    if (c.continent) out.push(q(`في أي قارة تقع ${c.name}؟`, c.continent, wrongFrom(r, conts, c.continent)));
    if (c.currency) out.push(q(`ما العملة الرسمية في ${c.name}؟`, c.currency, wrongFrom(r, cs.map((x) => x.currency).filter(Boolean), c.currency)));
    if (c.langs.size === 1) { const l = [...c.langs][0]; out.push(q(`ما اللغة الرسمية في ${c.name}؟`, l, wrongFrom(r, [...new Set(cs.flatMap((x) => [...x.langs]))], l))); }
    if (c.borders.length >= 1) {
      const nb = pick(r, c.borders), far = cs.filter((x) => x.name !== c.name && !c.borders.includes(x.name) && x.continent === c.continent).map((x) => x.name);
      out.push(q(`أي هذه الدول تشترك في حدود مع ${c.name}؟`, nb, wrongFrom(r, far, nb)));
      if (c.borders.length >= 2 && c.borders.length === (mlByCode[c.iso]?.borders || []).length) out.push(q(`كم دولة تحدّ ${c.name} برًّا؟`, c.borders.length, wrongFrom(r, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => n + 0).filter((n) => n !== c.borders.length && Math.abs(n - c.borders.length) <= 4), c.borders.length)));
    }
    if (c.landlocked === true && c.sl > 150) out.push(q("أي هذه الدول ليس لها ساحل على البحر؟", c.name, wrongFrom(r, cs.filter((x) => x.landlocked === false && x.continent === c.continent).map((x) => x.name), c.name)));
  }
  // which is bigger / has more people: four countries with clear gaps
  const cmp = (key, word) => {
    const list = cs.filter((c) => c[key] && c.sl > 120);
    for (let t = 0; t < 900; t += 1) {
      const four = shuffle(r, list).slice(0, 4).sort((a, b) => b[key] - a[key]);
      if (four.length < 4 || four[0][key] < four[1][key] * 1.4) continue;
      out.push(q(`أي هذه الدول ${word}؟`, four[0].name, four.slice(1).map((c) => c.name)));
    }
  };
  cmp("area", "أكبر مساحة"); cmp("pop", "أكثر سكانًا");
  // things in countries
  const byLabel = new Map(load("countries").map((k) => [clean(k.cL), cs.find((c) => c.q === k.c)]));
  const inCountry = (rows, id, word, minSl = 0) => {
    for (const x of unambiguous(group(load(rows), id, "xL", ["cL", "contL"]))) {
      const c = one(x.f.cL); if (!c || !x.label || x.label.length > 40 || x.sl < minSl) continue;
      const k = byLabel.get(c); if (!k) continue;
      const near = cs.filter((o) => o.continent === k.continent && o.name !== k.name).map((o) => o.name);
      const lead = word.split(" ").pop(); // «يقع جبل» + «جبل الزيتون» is said once
      out.push(q(`في أي دولة ${x.label.startsWith(lead + " ") ? word.split(" ")[0] : word} ${x.label}؟`, k.name, wrongFrom(r, near, k.name) || wrongFrom(r, names, k.name)));
    }
  };
  inCountry("cities", "x", "تقع مدينة", 50);
  // which of these cities is in a country: wrong ones from neighbouring countries on the same continent
  const famousCities = unambiguous(group(load("cities"), "x", "xL", ["cL"])).filter((x) => x.sl >= 70 && x.label.length < 30).map((x) => ({ n: x.label, c: byLabel.get(one(x.f.cL)) })).filter((x) => x.c);
  for (const x of famousCities) {
    const others = famousCities.filter((o) => o.c.name !== x.c.name && o.c.continent === x.c.continent).map((o) => o.n);
    out.push(q(`أي هذه المدن تقع في ${x.c.name}؟`, x.n, wrongFrom(r, others, x.n)));
  } inCountry("mountains", "x", "يقع جبل"); inCountry("lakes", "x", "تقع بحيرة"); inCountry("islands", "x", "تقع جزيرة");
  inCountry("volcanoes", "x", "يقع بركان"); inCountry("deserts", "x", "تقع صحراء"); inCountry("landmarks", "x", "يقع");
  for (const x of group(load("rivers"), "x", "xL", ["contL", "len"])) {
    const c = [...x.f.contL].map((k) => CONT[k]).filter(Boolean); if (new Set(c).size !== 1) continue;
    out.push(q(`في أي قارة يجري ${x.label.startsWith("نهر") ? x.label : "نهر " + x.label}؟`, c[0], wrongFrom(r, conts, c[0])));
  }
  for (const x of group(load("landmarks"), "x", "xL", ["cityL"])) { const c = one(x.f.cityL); if (c && x.label.length < 40) out.push(q(`في أي مدينة يقع ${x.label}؟`, c, wrongFrom(r, [...new Set(load("cities").map((k) => clean(k.xL)))], c))); }
  // highest mountains and longest rivers among four
  const top = (rows, key, word) => { const list = group(load(rows), "x", "xL", [key]).map((x) => ({ n: x.label, v: Math.max(...[...x.f[key]].map(Number), 0) })).filter((x) => x.v);
    for (let t = 0; t < 300; t += 1) { const four = shuffle(r, list).slice(0, 4).sort((a, b) => b.v - a.v); if (four.length === 4 && four[0].v > four[1].v * 1.15) out.push(q(word, four[0].n, four.slice(1).map((x) => x.n))); } };
  top("mountains", "elev", "أي هذه الجبال أعلى؟"); top("rivers", "len", "أي هذه الأنهار أطول؟"); top("lakes", "area", "أي هذه البحيرات أكبر مساحة؟"); top("islands", "area", "أي هذه الجزر أكبر مساحة؟");
  return dedupe(out);
}
if (process.argv[1]?.endsWith("gen-places.mjs")) { const g = places(); console.log(g.length); for (const x of shuffle(rng(4), g).slice(0, 14)) console.log(JSON.stringify(x)); }
