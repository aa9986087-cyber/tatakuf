// أعلام الدول: the flag picture, and what is known about the country it belongs to.
import { existsSync } from "node:fs";
import { rng, q, wrongFrom } from "./lib.mjs";
import { countries } from "./gen-places.mjs";
import { dedupe } from "./gen-people.mjs";

export function flags(existing = [], seed = 101) {
  const r = rng(seed), out = [], cs = countries().filter((c) => c.iso && existsSync(new URL(`../../ui/questions/flag-${c.iso.toLowerCase()}.svg`, import.meta.url)));
  const asked = new Set(existing.map((x) => x[5]?.file));
  const near = (c, key) => cs.filter((o) => o !== c && o.continent === c.continent).map((o) => o[key]).filter(Boolean);
  for (const c of cs) {
    const image = { file: `flag-${c.iso.toLowerCase()}.svg`, alt: "علم دولة" };
    if (!asked.has(image.file)) out.push(q("لمن هذا العلم؟", c.name, wrongFrom(r, near(c, "name"), c.name) || wrongFrom(r, cs.map((o) => o.name), c.name), image));
    if (c.capital && c.capital !== c.name) out.push(q("ما عاصمة الدولة صاحبة هذا العلم؟", c.capital, wrongFrom(r, near(c, "capital"), c.capital) || wrongFrom(r, cs.map((o) => o.capital).filter(Boolean), c.capital), image));
    if (c.continent) out.push(q("في أي قارة تقع الدولة صاحبة هذا العلم؟", c.continent, wrongFrom(r, ["آسيا", "أفريقيا", "أوروبا", "أمريكا الشمالية", "أمريكا الجنوبية", "أوقيانوسيا"], c.continent), image));
    if (c.currency) out.push(q("ما عملة الدولة صاحبة هذا العلم؟", c.currency, wrongFrom(r, near(c, "currency"), c.currency) || wrongFrom(r, cs.map((o) => o.currency).filter(Boolean), c.currency), image));
  }
  return dedupe(out).map((x) => x); // the image travels as the sixth value
}
