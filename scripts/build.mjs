import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";

// Checks a question bank: at least 10 per category, four distinct options, unique prompts
// (a shared prompt is fine when the picture differs, e.g. flags) and valid picture references.
export function checkBank(name, questions, imageFiles) {
  const allPrompts = new Set();
  for (const [category, items] of Object.entries(questions)) {
    if (!Array.isArray(items) || items.length < 10) throw new Error(`${name}: category ${category} needs at least 10 questions.`);
    for (const item of items) {
      if (!Array.isArray(item) || ![5, 6].includes(item.length) ||
          item.slice(0, 5).some((value) => typeof value !== "string" || !value.trim()) ||
          new Set(item.slice(1, 5)).size !== 4) {
        throw new Error(`${name}: invalid or duplicate options in category ${category}: ${item?.[0]}`);
      }
      const image = item[5];
      const prompt = item[0].normalize("NFKC").toLowerCase().replace(/[\p{P}\p{M}\s]+/gu, "") + (image?.file ?? "");
      if (allPrompts.has(prompt)) throw new Error(`${name}: duplicate question in category ${category}: ${item[0]}`);
      allPrompts.add(prompt);
      if (item.length === 6) {
        if (!image || !/^[a-z0-9-]+\.(webp|svg)$/.test(image.file) || typeof image.alt !== "string" || !image.alt.trim()) {
          throw new Error(`${name}: invalid image in category ${category}: ${item[0]}`);
        }
        imageFiles.add(image.file);
      }
    }
  }
}

export async function build() {
  const [html, css, js, sound, qr, hero, bank, bluffBank, worker, manifest, migration] = await Promise.all([
    readFile("ui/index.html", "utf8"), readFile("ui/style.css", "utf8"),
    readFile("ui/app.js", "utf8"), readFile("ui/sound.js", "utf8"),
    readFile(new URL(import.meta.resolve("qrcode-generator")), "utf8"),
    readFile("ui/hero.webp"), readFile("worker/questions.json", "utf8"), readFile("worker/bluff.json", "utf8"),
    readFile("worker/index.js", "utf8"), readFile(".openai/hosting.json", "utf8"),
    readFile("drizzle/0000_rooms.sql", "utf8")
  ]);
  const questions = JSON.parse(bank);
  const bluffQuestions = JSON.parse(bluffBank);
  const imageFiles = new Set();
  checkBank("classic", questions, imageFiles);
  checkBank("bluff", bluffQuestions, imageFiles);

  await Promise.all([
    mkdir("dist/server", { recursive: true }),
    mkdir("dist/.openai", { recursive: true }),
    mkdir("dist/drizzle", { recursive: true })
  ]);
  // Drawings (SVG) are small and ride inside the worker. Photos would outgrow the worker size limit,
  // so they ship as Workers static assets from dist/public, served before the worker runs.
  const questionImages = Object.fromEntries(await Promise.all([...imageFiles].filter((file) => file.endsWith(".svg")).map(async (file) =>
    [file, (await readFile(`ui/questions/${file}`)).toString("base64")]
  )));
  await rm("dist/public", { recursive: true, force: true });
  await mkdir("dist/public/questions", { recursive: true });
  await Promise.all([...imageFiles].filter((file) => !file.endsWith(".svg")).map((file) =>
    copyFile(`ui/questions/${file}`, `dist/public/questions/${file}`)));
  // The photos are from Wikimedia Commons; their licences ask for credit, so list each one.
  const credits = JSON.parse(await readFile("ui/questions/credits.json", "utf8"));
  const escape = (value) => String(value).replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
  await writeFile("dist/public/credits.html", `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>مصادر الصور</title>
<style>body{margin:0;padding:24px 16px;background:#080e22;color:#f4ead0;font:16px/1.7 system-ui,sans-serif}main{max-width:760px;margin:auto}
h1{color:#e7c56f}li{margin-bottom:8px}a{color:#e7c56f}small{color:#a9b2cf}</style>
<main><h1>مصادر صور الأسئلة</h1><p>صور الحيوانات والشخصيات من ويكيميديا كومنز، وكل صورة بترخيصها واسم صاحبها.</p>
<ol>${credits.map((entry) => `<li><a href="${escape(entry.source)}">${escape(entry.source.split("File:")[1].replace(/_/g, " "))}</a><br><small dir="auto">${escape(entry.artist)} · ${escape(entry.license)}</small></li>`).join("")}</ol>
<p><a href="/">العودة للعبة</a></p></main></html>`);
  await writeFile("dist/public/_headers", "/questions/*\n  Cache-Control: public, max-age=86400\n");
  const counts = Object.fromEntries([
    ...Object.entries(questions).map(([id, items]) => [id, items.length]),
    ...Object.entries(bluffQuestions).map(([id, items]) => ["bluff." + id, items.length])
  ]);
  const logos = Object.fromEntries(await Promise.all(["logo.svg", "logo-mark.svg"].map(async (file) => [file, await readFile(`ui/${file}`, "utf8")])));
  const assets = { html, css, js: `const bankCounts = ${JSON.stringify(counts)};\n${js}`, sound, qr, hero: hero.toString("base64"), questionImages, logos };
  await Promise.all([
    writeFile("dist/server/index.js", `const assets = ${JSON.stringify(assets)};\nconst questions = ${JSON.stringify(questions)};\nconst bluffQuestions = ${JSON.stringify(bluffQuestions)};\n${worker}`),
    writeFile("dist/.openai/hosting.json", manifest),
    writeFile("dist/drizzle/0000_rooms.sql", migration)
  ]);
}

if (process.argv[1] === new URL(import.meta.url).pathname) await build();
