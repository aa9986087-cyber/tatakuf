import { readFile, writeFile, mkdir } from "node:fs/promises";

export async function build() {
  const [html, css, js, sound, qr, hero, bank, worker, manifest, migration] = await Promise.all([
    readFile("ui/index.html", "utf8"), readFile("ui/style.css", "utf8"),
    readFile("ui/app.js", "utf8"), readFile("ui/sound.js", "utf8"),
    readFile(new URL(import.meta.resolve("qrcode-generator")), "utf8"),
    readFile("ui/hero.webp"), readFile("worker/questions.json", "utf8"),
    readFile("worker/index.js", "utf8"), readFile(".openai/hosting.json", "utf8"),
    readFile("drizzle/0000_rooms.sql", "utf8")
  ]);
  const questions = JSON.parse(bank);
  const allPrompts = new Set();
  for (const [category, items] of Object.entries(questions)) {
    if (!Array.isArray(items) || items.length < 10) throw new Error(`Category ${category} needs at least 10 questions.`);
    for (const item of items) {
      if (!Array.isArray(item) || item.length !== 5 ||
          item.some((value) => typeof value !== "string" || !value.trim()) ||
          new Set(item.slice(1)).size !== 4 || allPrompts.has(item[0])) {
        throw new Error(`Invalid or duplicate question in category ${category}.`);
      }
      allPrompts.add(item[0]);
    }
  }

  await Promise.all([
    mkdir("dist/server", { recursive: true }),
    mkdir("dist/.openai", { recursive: true }),
    mkdir("dist/drizzle", { recursive: true })
  ]);
  const assets = { html, css, js, sound, qr, hero: hero.toString("base64") };
  await Promise.all([
    writeFile("dist/server/index.js", `const assets = ${JSON.stringify(assets)};\nconst questions = ${JSON.stringify(questions)};\n${worker}`),
    writeFile("dist/.openai/hosting.json", manifest),
    writeFile("dist/drizzle/0000_rooms.sql", migration)
  ]);
}

if (process.argv[1] === new URL(import.meta.url).pathname) await build();
