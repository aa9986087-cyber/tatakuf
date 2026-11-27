// Works fetched through the people we already have (fast: the creator is bound), instead of scanning
// every painting or book on Wikidata.
import { byIds } from "./sparql.mjs";
import { readFileSync } from "node:fs";
const ids = (occs) => occs.flatMap((o) => JSON.parse(readFileSync(new URL(`./data/people-${o}.json`, import.meta.url), "utf8")).map((r) => r.p));
const which = process.argv[2];
if (!which || which === "works-paintings") console.log("works-paintings", (await byIds("works-paintings", ids(["painter", "sculptor"]), `?w wdt:P170 ?x; wikibase:sitelinks ?sl. FILTER(?sl >= 12) ?w rdfs:label ?wL FILTER(lang(?wL) = "ar") ?x rdfs:label ?byL FILTER(lang(?byL) = "ar") OPTIONAL { ?w wdt:P571 ?when } OPTIONAL { ?w wdt:P195 ?where. ?where rdfs:label ?whereL FILTER(lang(?whereL) = "ar") }`, { chunk: 60 })).length);
if (!which || which === "works-books") console.log("works-books", (await byIds("works-books", ids(["writer", "novelist", "poet", "philosopher"]), `?w wdt:P50 ?x; wikibase:sitelinks ?sl. FILTER(?sl >= 15) ?w rdfs:label ?wL FILTER(lang(?wL) = "ar") ?x rdfs:label ?byL FILTER(lang(?byL) = "ar") OPTIONAL { ?w wdt:P577 ?when } OPTIONAL { ?w wdt:P407 ?lang. ?lang rdfs:label ?langL FILTER(lang(?langL) = "ar") }`, { chunk: 60 })).length);
if (!which || which === "works-films") console.log("works-films", (await byIds("works-films", ids(["director"]), `?w wdt:P57 ?x; wikibase:sitelinks ?sl. FILTER(?sl >= 15) ?w wdt:P31 wd:Q11424. ?w rdfs:label ?wL FILTER(lang(?wL) = "ar") ?x rdfs:label ?byL FILTER(lang(?byL) = "ar") OPTIONAL { ?w wdt:P577 ?when } OPTIONAL { ?w wdt:P495 ?c. ?c wdt:P31 wd:Q3624078. ?c rdfs:label ?cL FILTER(lang(?cL) = "ar") }`, { chunk: 60 })).length);
