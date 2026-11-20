import { readFile, writeFile, mkdir } from "node:fs/promises";

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
  const questionImages = Object.fromEntries(await Promise.all([...imageFiles].map(async (file) =>
    [file, (await readFile(`ui/questions/${file}`)).toString("base64")]
  )));
  const counts = Object.fromEntries([
    ...Object.entries(questions).map(([id, items]) => [id, items.length]),
    ...Object.entries(bluffQuestions).map(([id, items]) => ["bluff." + id, items.length])
  ]);
  const assets = { html, css, js: `const bankCounts = ${JSON.stringify(counts)};\n${js}`, sound, qr, hero: hero.toString("base64"), questionImages };
  await Promise.all([
    writeFile("dist/server/index.js", `const assets = ${JSON.stringify(assets)};\nconst questions = ${JSON.stringify(questions)};\nconst bluffQuestions = ${JSON.stringify(bluffQuestions)};\n${worker}`),
    writeFile("dist/.openai/hosting.json", manifest),
    writeFile("dist/drizzle/0000_rooms.sql", migration)
  ]);
}

if (process.argv[1] === new URL(import.meta.url).pathname) await build();
