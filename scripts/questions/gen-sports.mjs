// رياضة: clubs (country, city, founding year), stadiums, the World Cup and the Olympics, sports.
import { rng, q, wrongFrom, nearNumbers, shuffle } from "./lib.mjs";
import { load, group, one, yearOne, unambiguous } from "./data.mjs";
import { countries } from "./gen-places.mjs";
import { dedupe } from "./gen-people.mjs";

export function sportsExtra(seed = 111) {
  const r = rng(seed), out = [], names = countries().map((c) => c.name);
  const clubs = unambiguous(group(load("clubs"), "x", "xL", ["founded", "cL", "cityL"]));
  const cities = [...new Set(clubs.map((c) => one(c.f.cityL)).filter(Boolean))];
  const club = (n) => (/^(نادي|فريق|منتخب)/.test(n) ? n : `نادي ${n}`);
  for (const c of clubs) {
    if (c.label.length > 40) continue;
    const country = one(c.f.cL), city = one(c.f.cityL), y = yearOne(c.f.founded);
    if (country) out.push(q(`من أي دولة ${club(c.label)}؟`, country, wrongFrom(r, names, country)));
    if (city) out.push(q(`في أي مدينة يقع ${club(c.label)}؟`, city, wrongFrom(r, cities, city)));
    if (y && y > 1850 && c.sl >= 50) out.push(q(`في أي سنة تأسس ${club(c.label)}؟`, y, nearNumbers(r, y, 8, { min: 1800 })));
  }
  const stadiums = unambiguous(group(load("stadiums"), "x", "xL", ["cap", "cityL", "cL"]));
  const scities = [...new Set(stadiums.map((s) => one(s.f.cityL)).filter(Boolean))];
  for (const s of stadiums) {
    const city = one(s.f.cityL), country = one(s.f.cL);
    if (city) out.push(q(`في أي مدينة يقع ${/^(ملعب|استاد)/.test(s.label) ? s.label : `ملعب ${s.label}`}؟`, city, wrongFrom(r, scities, city)));
    else if (country) out.push(q(`في أي دولة يقع ${/^(ملعب|استاد)/.test(s.label) ? s.label : `ملعب ${s.label}`}؟`, country, wrongFrom(r, names, country)));
  }
  const withCap = stadiums.filter((s) => s.sl >= 40).map((s) => ({ n: s.label, v: Math.max(...[...s.f.cap].map(Number), 0) })).filter((s) => s.v > 1000);
  for (let t = 0; t < 400; t += 1) { const four = shuffle(r, withCap).slice(0, 4).sort((a, b) => b.v - a.v); if (four.length === 4 && four[0].v > four[1].v * 1.2) out.push(q("أي هذه الملاعب يتسع لأكبر عدد من الجماهير؟", four[0].n, four.slice(1).map((x) => x.n))); }
  // World Cup winners and hosts, Olympic hosts
  const winners = group(load("cup-winners"), "x", "xL", ["year", "winL"]);
  const teams = [...new Set(winners.map((w) => one(w.f.winL)).filter(Boolean))];
  for (const w of winners) { const y = yearOne(w.f.year), win = one(w.f.winL); if (y && win) out.push(q(`من فاز بكأس العالم لكرة القدم سنة ${y}؟`, win, wrongFrom(r, [...teams, "هولندا", "البرتغال", "بلجيكا", "كرواتيا", "المكسيك"], win))); }
  for (const g of group(load("games"), "x", "xL", ["year", "placeL"])) { const p = one(g.f.placeL); if (p && g.label.length < 60) out.push(q(`أين أقيمت ${g.label}؟`, p, wrongFrom(r, names, p))); }
  for (const s of group(load("sports"), "x", "xL", ["n", "cL"])) { const c = one(s.f.cL); if (c) out.push(q(`من أي دولة نشأت رياضة ${s.label}؟`, c, wrongFrom(r, names, c))); }
  return dedupe(out);
}
