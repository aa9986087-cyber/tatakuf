// Builds dist/preview.html: the whole game in one page for sharing a trial copy without a server.
// The real worker runs inside the browser with rooms kept in localStorage, so tabs of the same
// browser share rooms. A "trial player" button adds simulated players for testing the shared screen.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const replaceOnce = (source, from, to) => {
  if (source.split(from).length !== 2) throw new Error(`Preview patch did not match: ${from}`);
  return source.replace(from, () => to);
};
const replaceAll = (source, from, to) => {
  if (!source.includes(from)) throw new Error(`Preview patch did not match: ${from}`);
  return source.split(from).join(to);
};

export async function buildPreview() {
  const [html, css, app, sound, qr, hero, bank, worker] = await Promise.all([
    readFile("ui/index.html", "utf8"), readFile("ui/style.css", "utf8"),
    readFile("ui/app.js", "utf8"), readFile("ui/sound.js", "utf8"),
    readFile(new URL(import.meta.resolve("qrcode-generator")), "utf8"),
    readFile("ui/hero.webp"), readFile("worker/questions.json", "utf8"),
    readFile("worker/index.js", "utf8")
  ]);
  const questions = JSON.parse(bank);
  const images = {};
  for (const item of Object.values(questions).flat()) {
    if (item[5] && !images[item[5].file]) {
      images[item[5].file] = "data:image/webp;base64," + (await readFile(`ui/questions/${item[5].file}`)).toString("base64");
    }
  }
  const counts = Object.fromEntries(Object.entries(questions).map(([id, items]) => [id, items.length]));

  let appCode = app.replace(/^import .*$/gm, "");
  appCode = replaceOnce(appCode, "window.location.pathname", "previewPath()");
  appCode = replaceAll(appCode, "window.location.assign(", "previewGo(");
  appCode = replaceOnce(appCode, "new URL(`/room/${room.code}`, window.location.origin).href", "previewRoomLink(room.code)");
  appCode = replaceOnce(appCode, '"/hero.webp?v=3"', '"${previewHero}"');
  appCode = replaceOnce(appCode, "/questions/${e(item.image.file)}", "${previewImages[item.image.file] ?? \"\"}");

  const qrCode = qr.replace("export const qrcode =", "const qrcode =")
    .replace(/^export default qrcode;$/m, "")
    .replace("export const stringToBytes", "const stringToBytes");
  const workerCode = replaceOnce(worker, "export default {", "return {");
  const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));

  const page = `<title>لعبة التكاتف</title>
<style>${css}
.preview-bar { position: fixed; inset: auto 0 0; z-index: 50; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center;
  padding: 8px max(16px, env(safe-area-inset-left, 0px)) calc(8px + env(safe-area-inset-bottom, 0px)); background: #0b1d15ee; border-top: 1px solid #3c6350;
  color: #e7d5a6; font-size: 14px; backdrop-filter: blur(6px); }
.preview-bar .btn { min-height: 38px; padding-block: 4px; font-size: 14px; }
body { padding-bottom: 64px; }
</style>
${body}
<div class="preview-bar" role="region" aria-label="أدوات النسخة التجريبية">
  <span>نسخة تجريبية للتعديل</span>
  <button type="button" class="btn outline" id="preview-add-player" hidden>أضف لاعب تجريبي</button>
  <button type="button" class="btn outline" id="preview-reset">مسح الغرف التجريبية</button>
</div>
<script type="module">
const bankCounts = ${JSON.stringify(counts)};
const previewHero = "data:image/webp;base64,${hero.toString("base64")}";
const previewImages = ${JSON.stringify(images)};
const roomsKey = "tatakuf-preview-rooms";
const fakesKey = (code) => "tatakuf-preview-fakes:" + code;
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Rooms then last for this tab only. */ } };
let memoryRooms = read(roomsKey, {});
const rooms = () => (memoryRooms = read(roomsKey, memoryRooms));

const db = { prepare(query) { return { bind(...values) { return {
  async first() {
    const row = rooms()[values[0]];
    return row ? { ...row } : null;
  },
  async run() {
    const all = rooms();
    let changes = 0;
    if (query.startsWith("INSERT")) {
      const [code, expires_at, state] = values;
      if (!all[code]) { all[code] = { code, version: 0, expires_at, state }; changes = 1; }
    } else if (query.startsWith("UPDATE")) {
      const [state, expires_at, code, version] = values;
      if (all[code]?.version === version) { all[code] = { code, version: version + 1, expires_at, state }; changes = 1; }
    } else if (query.startsWith("DELETE")) {
      for (const [code, row] of Object.entries(all)) if (row.expires_at <= values[0]) { delete all[code]; changes += 1; }
    }
    if (changes) write(roomsKey, all);
    return { meta: { changes } };
  }
}; } }; } };

const worker = (() => {
  const assets = { questionImages: {} };
  const questions = ${JSON.stringify(questions)};
${workerCode}
})();

const callWorker = (path, init = {}) => {
  const { signal, ...rest } = init;
  return worker.fetch(new Request("https://tatakuf.preview" + path, rest), { DB: db });
};
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => typeof input === "string" && input.startsWith("/api/") ? callWorker(input, init) : realFetch(input, init);

function previewPath() {
  const hash = location.hash.slice(1);
  return hash.startsWith("room-") ? "/room/" + hash.slice(5) : "/";
}
function previewGo(path) {
  const code = path.match(/^\\/room\\/([A-Z0-9]+)/i)?.[1];
  location.hash = code ? "room-" + code : "";
  location.reload();
}
function previewRoomLink(code) { return location.href.split("#")[0] + "#room-" + code; }
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href="/"]');
  if (link) { event.preventDefault(); previewGo("/"); }
}, true);

const qrcode = (() => {
${qrCode}
return qrcode;
})();
const { playSound, soundEnabled, toggleSound, unlockSound } = (() => {
${sound.replace(/^export /gm, "")}
return { playSound, soundEnabled, toggleSound, unlockSound };
})();

// Simulated players answer and choose categories on their own, so one device can test the shared screen.
const trialNames = ["فيصل", "بدر", "سعد", "نورة", "ريم", "خالد", "منيرة"];
const currentCode = () => previewPath().split("/")[2]?.toUpperCase();
const addButton = document.querySelector("#preview-add-player");
async function asPlayer(token, action = "", body) {
  const response = await callWorker("/api/rooms/" + currentCode() + action, {
    method: body === undefined ? "GET" : "POST", headers: token ? { Authorization: "Bearer " + token } : {},
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return response.json();
}
addButton.addEventListener("click", async () => {
  const code = currentCode();
  const fakes = read(fakesKey(code), []);
  const state = (await asPlayer(sessionStorage.getItem("tahaddi-alrabaa:" + code))).room;
  const taken = new Set((state?.players ?? []).map(({ name }) => name));
  const name = trialNames.find((entry) => !taken.has(entry)) ?? "لاعب " + (fakes.length + 1);
  const joined = await asPlayer(null, "/join", { name });
  if (joined.error) { document.querySelector("#toast").textContent = joined.error; return; }
  write(fakesKey(code), [...fakes, joined.token]);
});
setInterval(async () => {
  const code = currentCode();
  addButton.hidden = !code;
  if (!code) return;
  for (const token of read(fakesKey(code), [])) {
    const room = (await asPlayer(token)).room;
    if (!room) continue;
    if (room.phase === "select" && room.chooserId === room.playerId && Math.random() < 0.4) {
      await asPlayer(token, "/category", { round: room.round, category: room.available[Math.floor(Math.random() * room.available.length)] });
    } else if (room.phase === "question" && room.yourAnswer === null && Math.random() < 0.25) {
      await asPlayer(token, "/answer", { questionId: room.question.id, option: Math.floor(Math.random() * 4) });
    }
  }
}, 1000);
document.querySelector("#preview-reset").addEventListener("click", () => {
  try { for (const key of Object.keys(localStorage)) if (key.startsWith("tatakuf-preview")) localStorage.removeItem(key); } catch { /* Nothing stored. */ }
  previewGo("/");
});

${appCode}
</script>
`;
  await mkdir("dist", { recursive: true });
  await writeFile("dist/preview.html", page);
  return page.length;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  console.log(`dist/preview.html ${(await buildPreview() / 1024).toFixed(0)} KB`);
}
