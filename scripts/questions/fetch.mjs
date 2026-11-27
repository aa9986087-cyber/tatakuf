// Fetch the facts the question bank is built from (Wikidata, cached in data/). Run with
// NODE_USE_ENV_PROXY=1 behind a proxy. Each query is small on purpose: one kind of thing at a time,
// popular items only (by the number of Wikipedia languages), Arabic names only.
import { sparql } from "./sparql.mjs";

const ar = (v, label = `${v}L`) => `${v} rdfs:label ?${label.slice(1)} FILTER(lang(?${label.slice(1)}) = "ar")`;
const only = process.argv[2];
const Q = {};
const add = (name, query) => { Q[name] = query; };

// people, one occupation at a time
export const OCCUPATIONS = {
  footballer: ["Q937857", 45], basketball: ["Q3665646", 35], tennis: ["Q10833314", 35], boxer: ["Q11338576", 30], racing: ["Q10841764", 30],
  swimmer: ["Q10843402", 30], sprinter: ["Q4009406", 30], chess: ["Q10873124", 25], cyclist: ["Q2309784", 35],
  actor: ["Q33999", 60], director: ["Q2526255", 45], singer: ["Q177220", 55], composer: ["Q36834", 50], musician: ["Q639669", 70],
  writer: ["Q36180", 70], poet: ["Q49757", 50], novelist: ["Q6625963", 50], painter: ["Q1028181", 45], sculptor: ["Q1281618", 40], architect: ["Q42973", 40],
  physicist: ["Q169470", 45], chemist: ["Q593644", 45], mathematician: ["Q170790", 45], astronomer: ["Q11063", 40], inventor: ["Q205375", 40],
  physician: ["Q39631", 60], philosopher: ["Q4964182", 60], explorer: ["Q11900058", 35], astronaut: ["Q11631", 35],
  politician: ["Q82955", 110], monarch: ["Q116", 60], military: ["Q47064", 60], businessperson: ["Q43845", 60], economist: ["Q188094", 50]
};
for (const [id, [q, sl]] of Object.entries(OCCUPATIONS)) {
  add(`people-${id}`, `SELECT ?p ?pL ?sl ?born ?died WHERE { ?p wdt:P106 wd:${q}; wikibase:sitelinks ?sl. FILTER(?sl >= ${sl}) ?p wdt:P31 wd:Q5. ${ar("?p")}
    OPTIONAL { ?p wdt:P569 ?born } OPTIONAL { ?p wdt:P570 ?died } }`);
}
// places
add("countries", `SELECT ?c ?cL ?sl ?capL ?contL ?area ?pop ?curL ?iso WHERE { ?c wdt:P31 wd:Q3624078; wikibase:sitelinks ?sl. FILTER NOT EXISTS { ?c wdt:P576 ?end } ${ar("?c")}
  OPTIONAL { ?c wdt:P36 ?cap. ${ar("?cap", "?capL")} } OPTIONAL { ?c wdt:P30 ?cont. ${ar("?cont", "?contL")} }
  OPTIONAL { ?c wdt:P2046 ?area } OPTIONAL { ?c wdt:P1082 ?pop } OPTIONAL { ?c wdt:P38 ?cur. ${ar("?cur", "?curL")} } OPTIONAL { ?c wdt:P297 ?iso } }`);
add("country-lang", `SELECT ?c ?lL WHERE { ?c wdt:P31 wd:Q3624078; wdt:P37 ?l. ${ar("?l", "?lL")} }`);
add("country-border", `SELECT ?c ?n WHERE { ?c wdt:P31 wd:Q3624078; wdt:P47 ?n. ?n wdt:P31 wd:Q3624078 }`);
add("cities", `SELECT ?x ?xL ?sl ?pop ?cL ?founded WHERE { VALUES ?k { wd:Q1637706 wd:Q1549591 wd:Q5119 wd:Q200250 } ?x wdt:P31 ?k; wikibase:sitelinks ?sl. FILTER(?sl >= 40) ${ar("?x")} ?x wdt:P17 ?c. ?c wdt:P31 wd:Q3624078. ${ar("?c", "?cL")}
  OPTIONAL { ?x wdt:P1082 ?pop } OPTIONAL { ?x wdt:P571 ?founded } }`);
for (const [name, q, sl] of [["rivers", "Q4022", 45], ["mountains", "Q8502", 40], ["lakes", "Q23397", 40], ["islands", "Q23442", 45], ["deserts", "Q8514", 25], ["volcanoes", "Q8072", 35], ["seas", "Q165", 30]]) {
  add(name, `SELECT ?x ?xL ?sl ?cL ?contL ?len ?elev ?area WHERE { ?x wdt:P31 wd:${q}; wikibase:sitelinks ?sl. FILTER(?sl >= ${sl}) ${ar("?x")}
    OPTIONAL { ?x wdt:P17 ?c. ?c wdt:P31 wd:Q3624078. ${ar("?c", "?cL")} } OPTIONAL { ?x wdt:P30 ?cont. ${ar("?cont", "?contL")} }
    OPTIONAL { ?x wdt:P2043 ?len } OPTIONAL { ?x wdt:P2044 ?elev } OPTIONAL { ?x wdt:P2046 ?area } }`);
}
add("landmarks", `SELECT ?x ?xL ?sl ?cityL ?cL WHERE { VALUES ?k { wd:Q570116 wd:Q839954 wd:Q4989906 wd:Q12518 wd:Q16970 wd:Q32815 wd:Q23413 wd:Q44539 wd:Q33506 wd:Q9259 } ?x wdt:P31 ?k; wikibase:sitelinks ?sl. FILTER(?sl >= 40) ${ar("?x")}
  ?x wdt:P17 ?c. ?c wdt:P31 wd:Q3624078. ${ar("?c", "?cL")} OPTIONAL { ?x wdt:P131 ?city. ?city wdt:P31/wdt:P279? wd:Q515. ${ar("?city", "?cityL")} } }`);

// history
add("battles", `SELECT ?x ?xL ?sl ?when WHERE { VALUES ?k { wd:Q178561 wd:Q198 wd:Q131569 wd:Q188686 wd:Q124757 wd:Q10931 } ?x wdt:P31 ?k; wikibase:sitelinks ?sl. FILTER(?sl >= 25) ${ar("?x")}
  { ?x wdt:P585 ?when } UNION { ?x wdt:P580 ?when } UNION { ?x wdt:P571 ?when } }`);
add("empires", `SELECT ?x ?xL ?sl ?from ?to WHERE { VALUES ?k { wd:Q48349 wd:Q164950 wd:Q3024240 wd:Q417175 } ?x wdt:P31 ?k; wikibase:sitelinks ?sl. FILTER(?sl >= 25) ${ar("?x")} OPTIONAL { ?x wdt:P571 ?from } OPTIONAL { ?x wdt:P576 ?to } }`);
add("organizations", `SELECT ?x ?xL ?sl ?founded ?cL WHERE { VALUES ?k { wd:Q4830453 wd:Q891723 wd:Q6881511 wd:Q3918 wd:Q484652 wd:Q43229 } ?x wdt:P31 ?k; wikibase:sitelinks ?sl. FILTER(?sl >= 55) ${ar("?x")}
  ?x wdt:P571 ?founded. OPTIONAL { ?x wdt:P17 ?c. ?c wdt:P31 wd:Q3624078. ${ar("?c", "?cL")} } }`);
add("independence", `SELECT ?c ?cL ?when WHERE { ?c wdt:P31 wd:Q3624078. ${ar("?c")} ?c p:P571 ?st. ?st ps:P571 ?when }`);

// science
add("elements", `SELECT ?x ?xL ?n ?year ?discL ?famL WHERE { ?x wdt:P31 wd:Q11344; wdt:P1086 ?n. ${ar("?x")} OPTIONAL { ?x wdt:P575 ?year }
  OPTIONAL { ?x wdt:P61 ?disc. ${ar("?disc", "?discL")} } OPTIONAL { ?x wdt:P279 ?fam. ${ar("?fam", "?famL")} } }`);
add("moons", `SELECT ?x ?xL ?pL WHERE { ?x wdt:P31 wd:Q2537; wdt:P397 ?p. ?p wdt:P31 wd:Q634. ${ar("?x")} ${ar("?p", "?pL")} }`);
add("diseases", `SELECT ?x ?xL ?sl ?orgL WHERE { ?x wdt:P31 wd:Q12136; wikibase:sitelinks ?sl. FILTER(?sl >= 60) ${ar("?x")} OPTIONAL { ?x wdt:P689 ?org. ${ar("?org", "?orgL")} } }`);
add("inventions", `SELECT ?x ?xL ?sl ?byL ?when WHERE { ?x wdt:P61 ?by; wikibase:sitelinks ?sl. FILTER(?sl >= 40) ${ar("?x")} ?by wdt:P31 wd:Q5. ${ar("?by", "?byL")} OPTIONAL { ?x wdt:P575 ?when } }`);

// culture and screen
for (const [name, k] of [["books", "Q7725634"], ["novels", "Q8261"], ["poems", "Q5185279"]]) {
  add(name, `SELECT ?x ?xL ?sl ?byL ?when ?langL WHERE { ?x wdt:P31 wd:${k}; wikibase:sitelinks ?sl. FILTER(?sl >= 25) ${ar("?x")}
  ?x wdt:P50 ?by. ${ar("?by", "?byL")} OPTIONAL { ?x wdt:P577 ?when } OPTIONAL { ?x wdt:P407 ?lang. ${ar("?lang", "?langL")} } }`);
}
add("paintings", `SELECT ?x ?xL ?sl ?byL ?when ?whereL WHERE { ?x wdt:P31 wd:Q3305213; wikibase:sitelinks ?sl. FILTER(?sl >= 20) ${ar("?x")} ?x wdt:P170 ?by. ${ar("?by", "?byL")}
  OPTIONAL { ?x wdt:P571 ?when } OPTIONAL { ?x wdt:P276 ?where. ${ar("?where", "?whereL")} } }`);
add("music", `SELECT ?x ?xL ?sl ?byL ?when WHERE { VALUES ?k { wd:Q1344 wd:Q2188189 wd:Q105543609 wd:Q7366 } ?x wdt:P31 ?k; wikibase:sitelinks ?sl. FILTER(?sl >= 25) ${ar("?x")}
  { ?x wdt:P86 ?by } UNION { ?x wdt:P175 ?by } ${ar("?by", "?byL")} OPTIONAL { ?x wdt:P577 ?when } }`);
add("foods", `SELECT ?x ?xL ?sl ?cL WHERE { VALUES ?k { wd:Q746549 wd:Q2095 wd:Q19861951 wd:Q178 wd:Q13360264 wd:Q1778821 } ?x wdt:P31 ?k; wikibase:sitelinks ?sl. FILTER(?sl >= 25) ${ar("?x")}
  ?x wdt:P495 ?c. ?c wdt:P31 wd:Q3624078. ${ar("?c", "?cL")} }`);
add("languages", `SELECT ?x ?xL ?sl ?famL ?scriptL WHERE { ?x wdt:P31 wd:Q34770; wikibase:sitelinks ?sl. FILTER(?sl >= 80) ${ar("?x")} OPTIONAL { ?x wdt:P279 ?fam. ?fam wdt:P31 wd:Q25295. ${ar("?fam", "?famL")} }
  OPTIONAL { ?x wdt:P282 ?script. ${ar("?script", "?scriptL")} } }`);
add("films", `SELECT ?x ?xL ?sl ?when ?dirL ?cL WHERE { ?x wdt:P31 wd:Q11424; wikibase:sitelinks ?sl. FILTER(?sl >= 35) ${ar("?x")}
  OPTIONAL { ?x wdt:P577 ?when } OPTIONAL { ?x wdt:P57 ?dir. ${ar("?dir", "?dirL")} } OPTIONAL { ?x wdt:P495 ?c. ?c wdt:P31 wd:Q3624078. ${ar("?c", "?cL")} } }`);
add("film-cast", `SELECT ?x ?aL WHERE { ?x wdt:P31 wd:Q11424; wikibase:sitelinks ?sl. FILTER(?sl >= 35) ?x p:P161 ?st. ?st ps:P161 ?a. ?a wikibase:sitelinks ?asl. FILTER(?asl >= 40) ${ar("?a", "?aL")} }`);
add("series", `SELECT ?x ?xL ?sl ?when ?cL WHERE { VALUES ?k { wd:Q5398426 wd:Q581714 wd:Q63952888 } ?x wdt:P31 ?k; wikibase:sitelinks ?sl. FILTER(?sl >= 25) ${ar("?x")}
  OPTIONAL { ?x wdt:P580 ?when } OPTIONAL { ?x wdt:P495 ?c. ?c wdt:P31 wd:Q3624078. ${ar("?c", "?cL")} } }`);
add("characters", `SELECT ?x ?xL ?sl ?workL WHERE { VALUES ?k { wd:Q15773347 wd:Q15632617 wd:Q1114461 wd:Q95074 wd:Q3658341 } ?x wdt:P31 ?k; wikibase:sitelinks ?sl. FILTER(?sl >= 30) ${ar("?x")}
  ?x wdt:P1441 ?work. ${ar("?work", "?workL")} }`);

// sports
add("clubs", `SELECT ?x ?xL ?sl ?founded ?cL ?cityL WHERE { VALUES ?k { wd:Q476028 wd:Q13393265 } ?x wdt:P31 ?k; wikibase:sitelinks ?sl. FILTER(?sl >= 35) ${ar("?x")}
  OPTIONAL { ?x wdt:P571 ?founded } OPTIONAL { ?x wdt:P17 ?c. ?c wdt:P31 wd:Q3624078. ${ar("?c", "?cL")} } OPTIONAL { ?x wdt:P159 ?city. ${ar("?city", "?cityL")} } }`);
add("stadiums", `SELECT ?x ?xL ?sl ?cap ?cityL ?cL WHERE { ?x wdt:P31/wdt:P279? wd:Q483110; wikibase:sitelinks ?sl. FILTER(?sl >= 30) ${ar("?x")}
  OPTIONAL { ?x wdt:P1083 ?cap } OPTIONAL { ?x wdt:P131 ?city. ?city wdt:P31/wdt:P279? wd:Q515. ${ar("?city", "?cityL")} } OPTIONAL { ?x wdt:P17 ?c. ?c wdt:P31 wd:Q3624078. ${ar("?c", "?cL")} } }`);
add("games", `SELECT ?x ?xL ?year ?placeL WHERE { VALUES ?k { wd:Q159821 wd:Q82414 wd:Q19317 } ?x wdt:P31 ?k. ${ar("?x")} OPTIONAL { ?x wdt:P585 ?year } OPTIONAL { ?x wdt:P580 ?year }
  OPTIONAL { ?x wdt:P17 ?place. ${ar("?place", "?placeL")} } }`);
add("cup-winners", `SELECT ?x ?xL ?year ?winL WHERE { ?x wdt:P3450 wd:Q19317; wdt:P1346 ?win. ${ar("?x")} ${ar("?win", "?winL")} OPTIONAL { ?x wdt:P585 ?year } }`);
add("sports", `SELECT ?x ?xL ?sl ?n ?cL WHERE { ?x wdt:P31/wdt:P279? wd:Q31629; wikibase:sitelinks ?sl. FILTER(?sl >= 40) ${ar("?x")} OPTIONAL { ?x wdt:P1873 ?n } OPTIONAL { ?x wdt:P495 ?c. ?c wdt:P31 wd:Q3624078. ${ar("?c", "?cL")} } }`);

// animals: popular species, then which big group each belongs to
// animals: one big group at a time, going down the tree of life from it (popular species only)
export const ANIMAL_GROUPS = { Q7377: ["الثدييات", 40], Q5113: ["الطيور", 22], Q10811: ["الزواحف", 25], Q10908: ["البرمائيات", 20], Q28319: ["الحشرات", 25], Q26988: ["الحشرات", 20], Q22671: ["الحشرات", 20], Q25347: ["الحشرات", 20],
  Q127282: ["الأسماك", 25], Q25371: ["الأسماك", 20], Q1358: ["العناكب", 15], Q25364: ["القشريات", 15], Q25326: ["الرخويات", 15] };
for (const [k, [, sl]] of Object.entries(ANIMAL_GROUPS)) {
  add(`animals-${k}`, `SELECT ?x ?xL ?sl WHERE { ?x wdt:P171* wd:${k}; wdt:P105 wd:Q7432; wikibase:sitelinks ?sl. FILTER(?sl >= ${sl}) ${ar("?x")} }`);
}
export const CLASSES = { Q7377: "الثدييات", Q5113: "الطيور", Q10811: "الزواحف", Q10908: "البرمائيات", Q1390: "الحشرات", Q127282: "الأسماك", Q25326: "العناكب", Q25364: "القشريات", Q25326001: "", Q2934: "الرخويات" };
// (animal classes are fetched by id below)

import { byIds } from "./sparql.mjs";
import { readFile } from "node:fs/promises";
const cached = async (n) => { try { return JSON.parse(await readFile(new URL(`./data/${n}.json`, import.meta.url), "utf8")); } catch { return []; } };
const after = {
  "people-nation": async () => { const ids = []; for (const k of Object.keys(OCCUPATIONS)) ids.push(...(await cached(`people-${k}`)).map((r) => r.p)); return byIds("people-nation", ids, `?x wdt:P27 ?nat. ?nat wdt:P31 wd:Q3624078. ?nat rdfs:label ?natL FILTER(lang(?natL) = "ar")`); },
  "people-gender": async () => { const ids = []; for (const k of Object.keys(OCCUPATIONS)) ids.push(...(await cached(`people-${k}`)).map((r) => r.p)); return byIds("people-gender", ids, `?x wdt:P21 ?g`); }
};
for (const n of Object.keys(after)) Q[n] = null;
const names = only ? Object.keys(Q).filter((n) => n.startsWith(only)) : Object.keys(Q);
for (const name of names) {
  const t = Date.now();
  try { const rows = Q[name] === null ? await after[name]() : await sparql(name, Q[name], { force: process.argv.includes("--force") }); console.log(name.padEnd(22), String(rows.length).padStart(6), `${((Date.now() - t) / 1000).toFixed(1)}s`); }
  catch (e) { console.log(name.padEnd(22), "FAILED", e.message); }
}
