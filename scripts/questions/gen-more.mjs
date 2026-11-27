// تاريخ، ثقافة وفنون، أفلام ومسلسلات، علوم (العناصر والفلك)، حيوانات: built from the cached facts.
import { rng, pick, q, wrongFrom, shuffle, nearNumbers, yearOf, clean } from "./lib.mjs";
import { load, group, one, yearOne, unambiguous } from "./data.mjs";
import { people, dedupe } from "./gen-people.mjs";
import { countries } from "./gen-places.mjs";
import { ANIMAL_GROUPS } from "./fetch-groups.mjs";

const years = (r, y, spread) => nearNumbers(r, y, spread, { min: 1 });
const ago = (y) => (y > 1900 ? 6 : y > 1700 ? 15 : 40);

export function history(seed = 41) {
  const r = rng(seed), out = [];
  const ppl = people().filter((p) => p.born && p.born > 1000 && p.sl >= 60);
  for (const p of ppl) {
    out.push(q(`في أي سنة ${p.female ? "وُلدت" : "وُلد"} ${p.label}؟`, p.born, years(r, p.born, ago(p.born))));
    if (p.died && p.died > p.born) out.push(q(`في أي سنة ${p.female ? "توفيت" : "توفي"} ${p.label}؟`, p.died, years(r, p.died, ago(p.died))));
  }
  // who came first: four people born far apart
  for (let t = 0; t < 900; t += 1) {
    const four = shuffle(r, ppl.filter((p) => p.sl >= 90)).slice(0, 4).sort((a, b) => a.born - b.born);
    if (four.length === 4 && four[1].born - four[0].born >= 40) out.push(q("أي هؤلاء وُلد قبل الآخرين؟", four[0].label, four.slice(1).map((p) => p.label)));
  }
  const events = [...unambiguous(group(load("battles"), "x", "xL", ["when"])), ...group(load("organizations"), "x", "xL", ["founded"]).map((o) => ({ ...o, f: { when: o.f.founded }, kind: "org" }))]
    .map((e) => ({ ...e, y: yearOne(e.f.when) })).filter((e) => e.y && e.y > 600 && e.label.length < 60);
  // say it the way each kind of event is said; anything else (parties, states…) is left out
  const verb = (e) => e.kind === "org" ? "تأسست" : /^(معاهدة|اتفاقية|اتفاق|ميثاق|إعلان)/.test(e.label) ? "وُقّعت" : /^(معركة|حرب|حصار|غزو|مذبحة|انتفاضة|ثورة)/.test(e.label) ? "وقعت" : null;
  for (const e of events) { const v = verb(e); if (v) out.push(q(`في أي سنة ${v} ${e.label}؟`, e.y, years(r, e.y, ago(e.y)))); }
  for (let t = 0; t < 700; t += 1) {
    const four = shuffle(r, events.filter((e) => !e.kind && verb(e))).slice(0, 4).sort((a, b) => a.y - b.y);
    if (four.length === 4 && four[1].y - four[0].y >= 25) out.push(q("أي هذه الأحداث وقع أولًا؟", four[0].label, four.slice(1).map((e) => e.label)));
  }
  for (const e of group(load("empires"), "x", "xL", ["from", "to"])) {
    const a = yearOne(e.f.from), b = yearOne(e.f.to);
    if (a && a > 500) out.push(q(`في أي سنة قامت ${e.label}؟`, a, years(r, a, ago(a))));
    if (b && b > 500) out.push(q(`في أي سنة انتهت ${e.label}؟`, b, years(r, b, ago(b))));
  }
  for (const c of countries()) {
    const y = [...new Set(load("independence").filter((x) => x.c === c.q).map((x) => yearOf(x.when)).filter(Boolean))];
    if (y.length === 1 && y[0] > 1700) out.push(q(`في أي سنة تأسست دولة ${c.name} بصورتها الحالية؟`, y[0], years(r, y[0], 8)));
  }
  for (const x of unambiguous(group(load("inventions"), "x", "xL", ["byL", "when"]))) {
    const by = one(x.f.byL); if (by && x.sl >= 60 && !/[0-9]/.test(x.label)) out.push(q(`من يُنسب إليه اكتشاف أو اختراع «${x.label}»؟`, by, wrongFrom(r, load("inventions").map((k) => clean(k.byL)), by)));
  }
  return dedupe(out);
}

export function culture(seed = 51) {
  const r = rng(seed), out = [];
  // works fetched through their authors and painters: w is the work, x its maker
  const works = (name) => load(name).map((row) => ({ ...row, x: row.w, xL: row.wL }));
  const by = (rows, verb, kindWord) => {
    const src = rows === "books" ? [...works("works-books"), ...load("books"), ...load("novels"), ...load("poems")] : rows === "paintings" ? [...works("works-paintings"), ...load("paintings")] : load(rows);
    const list = unambiguous(group(src, "x", "xL", ["byL", "when", "langL", "whereL"]));
    const authors = [...new Set(list.map((x) => one(x.f.byL)).filter(Boolean))];
    for (const x of list) {
      const a = one(x.f.byL); if (!a || x.label.length > 50) continue;
      out.push(q(`${verb} «${x.label}»؟`, a, wrongFrom(r, authors, a)));
      const y = yearOne(x.f.when); if (y && y > 1400 && kindWord) out.push(q(`في أي سنة نُشر ${kindWord} «${x.label}»؟`, y, years(r, y, ago(y))));
      const lang = one(x.f.langL); if (lang && rows === "books") out.push(q(`بأي لغة كُتبت «${x.label}» أصلًا؟`, lang, wrongFrom(r, list.map((k) => one(k.f.langL)).filter(Boolean), lang)));
      const where = one(x.f.whereL); if (where && rows === "paintings") out.push(q(`في أي متحف تُعرض لوحة «${x.label}»؟`, where, wrongFrom(r, list.map((k) => one(k.f.whereL)).filter(Boolean), where)));
    }
  };
  by("books", "من مؤلف", "العمل الأدبي"); by("paintings", "من رسم لوحة", null); by("music", "لمن العمل الموسيقي", null);
  const cs = countries().map((c) => c.name);
  for (const x of group(load("foods"), "x", "xL", ["cL"])) { const c = one(x.f.cL); if (c) out.push(q(`من أي دولة أصل طبق «${x.label}»؟`, c, wrongFrom(r, cs, c))); }
  for (const x of group(load("languages"), "x", "xL", ["famL", "scriptL"])) {
    const s = one(x.f.scriptL); if (s) out.push(q(`بأي أبجدية تُكتب ${x.label.startsWith("اللغة") ? x.label : "اللغة " + x.label}؟`, s, wrongFrom(r, load("languages").map((k) => clean(k.scriptL)).filter(Boolean), s)));
  }
  // writers, poets, painters and composers: which of these is one
  const ppl = people();
  for (const [occ, role] of [["poet", "شاعر"], ["painter", "رسام"], ["composer", "مؤلف موسيقي"], ["novelist", "روائي"], ["sculptor", "نحّات"], ["architect", "معماري"], ["philosopher", "فيلسوف"]]) {
    const yes = ppl.filter((p) => p.clear && p.occ.size === 1 && p.occ.has(occ)).slice(0, 150), no = ppl.filter((p) => p.clear && !p.occ.has(occ) && !p.occ.has("writer")).slice(0, 800).map((p) => p.label);
    for (const p of yes) out.push(q(`أي هؤلاء ${role}؟`, p.label, wrongFrom(r, no, p.label)));
  }
  return dedupe(out);
}

export function screen(seed = 61) {
  const r = rng(seed), out = [];
  const films = unambiguous(group([...load("films"), ...load("works-films").map((row) => ({ ...row, x: row.w, xL: row.wL, dirL: row.byL }))], "x", "xL", ["when", "dirL", "cL"]));
  const dirs = [...new Set(films.map((f) => one(f.f.dirL)).filter(Boolean))], titles = films.map((f) => f.label);
  const cast = new Map(); for (const row of load("film-cast")) { if (!cast.has(row.x)) cast.set(row.x, new Set()); cast.get(row.x).add(clean(row.aL)); }
  const actors = [...new Set(load("film-cast").map((k) => clean(k.aL)))];
  for (const f of films) {
    if (f.label.length > 50) continue;
    const d = one(f.f.dirL), y = yearOne(f.f.when), c = one(f.f.cL), cs = cast.get(f.id);
    if (d) out.push(q(`من أخرج فيلم «${f.label}»؟`, d, wrongFrom(r, dirs, d)));
    if (y && y > 1900) out.push(q(`في أي سنة صدر فيلم «${f.label}»؟`, y, years(r, y, 6)));
    if (c) out.push(q(`من أي دولة فيلم «${f.label}»؟`, c, wrongFrom(r, films.map((k) => one(k.f.cL)).filter(Boolean), c)));
    if (cs?.size) { const a = pick(r, [...cs]); out.push(q(`من شارك في بطولة فيلم «${f.label}»؟`, a, wrongFrom(r, actors.filter((x) => !cs.has(x)), a))); }
  }
  for (const d of dirs) { const mine = films.filter((f) => one(f.f.dirL) === d); if (mine.length) { const f = pick(r, mine); out.push(q(`أي هذه الأفلام من إخراج ${d}؟`, f.label, wrongFrom(r, titles.filter((t) => !mine.some((m) => m.label === t)), f.label))); } }
  for (const s of group(load("series"), "x", "xL", ["when", "cL"])) {
    const y = yearOne(s.f.when), c = one(s.f.cL);
    if (y && y > 1950) out.push(q(`في أي سنة بدأ عرض مسلسل «${s.label}»؟`, y, years(r, y, 5)));
    if (c) out.push(q(`من أي دولة مسلسل «${s.label}»؟`, c, wrongFrom(r, countries().map((k) => k.name), c)));
  }
  const works = group(load("characters"), "x", "xL", ["workL"]);
  for (const ch of works) { const w = one(ch.f.workL); if (w) out.push(q(`في أي عمل تظهر شخصية «${ch.label}»؟`, w, wrongFrom(r, works.map((k) => one(k.f.workL)).filter(Boolean), w))); }
  for (let t = 0; t < 600; t += 1) {
    const four = shuffle(r, films.filter((f) => yearOne(f.f.when) && f.sl >= 60)).slice(0, 4).sort((a, b) => yearOne(a.f.when) - yearOne(b.f.when));
    if (four.length === 4 && yearOne(four[1].f.when) - yearOne(four[0].f.when) >= 8) out.push(q("أي هذه الأفلام صدر أولًا؟", four[0].label, four.slice(1).map((f) => f.label)));
  }
  return dedupe(out);
}

export function elements(seed = 71) {
  const r = rng(seed), out = [];
  const els = group(load("elements"), "x", "xL", ["n", "year", "discL", "famL"]).map((e) => ({ ...e, n: Number(one(e.f.n)), y: yearOne(e.f.year) })).filter((e) => e.n);
  const names = els.map((e) => e.label);
  for (const e of els) {
    const nm = e.label.startsWith("ال") ? e.label : e.label;
    out.push(q(`ما العدد الذري لعنصر ${nm}؟`, e.n, nearNumbers(r, e.n, 6, { min: 1 })));
    out.push(q(`أي عنصر عدده الذري ${e.n}؟`, nm, wrongFrom(r, els.filter((x) => Math.abs(x.n - e.n) <= 8).map((x) => x.label), nm)));
    if (e.y && e.y > 1600) out.push(q(`في أي سنة اكتُشف عنصر ${nm}؟`, e.y, years(r, e.y, 15)));
    const d = one(e.f.discL); if (d) out.push(q(`من اكتشف عنصر ${nm}؟`, d, wrongFrom(r, els.map((x) => one(x.f.discL)).filter(Boolean), d)));
  }
  for (const m of group(load("moons"), "x", "xL", ["pL"])) { const p = one(m.f.pL); if (p) out.push(q(`حول أي كوكب يدور القمر «${m.label}»؟`, p, wrongFrom(r, ["المشتري", "زحل", "أورانوس", "نبتون", "المريخ", "الأرض"], p))); }
  for (const d of group(load("diseases"), "x", "xL", ["orgL"])) { const o = one(d.f.orgL); if (o) out.push(q(`ما المسبب أو المرتبط الرئيسي بمرض ${d.label}؟`, o, wrongFrom(r, load("diseases").map((k) => clean(k.orgL)).filter(Boolean), o))); }
  return dedupe(out);
}

export function animals(seed = 81) {
  const r = rng(seed), out = [];
  const known = []; const seenId = new Set();
  for (const [k, [name]] of Object.entries(ANIMAL_GROUPS)) for (const a of unambiguous(group(load(`animals-${k}`), "x", "xL", []))) {
    if (seenId.has(a.id) || a.label.length > 35 || a.sl < 30) continue; seenId.add(a.id); known.push({ ...a, c: name });
  }
  const groups = [...new Set(Object.values(ANIMAL_GROUPS).map(([n]) => n))];
  for (const a of known) out.push(q(`إلى أي مجموعة ينتمي حيوان «${a.label}»؟`, a.c, wrongFrom(r, groups, a.c)));
  for (const g of groups) {
    const yes = known.filter((a) => a.c === g && a.sl >= 45), no = known.filter((a) => a.c !== g && a.sl >= 45).map((a) => a.label);
    for (const a of yes) out.push(q(`أي هذه الحيوانات من ${g}؟`, a.label, wrongFrom(r, no, a.label)));
  }
  return dedupe(out);
}
