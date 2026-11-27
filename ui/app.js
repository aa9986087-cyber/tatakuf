import qrcode from "/qrcode.js?v=3";
import { playSound, soundEnabled, toggleSound, unlockSound } from "/sound.js?v=5";

const categories = {
  general: { title: "معلومات عامة", icon: "✦" },
  science: { title: "علوم", icon: "⚗" },
  sports: { title: "رياضة", icon: "⚽" },
  places: { title: "جغرافيا", icon: "◉" },
  history: { title: "تاريخ", icon: "⌛" },
  culture: { title: "ثقافة وفنون", icon: "♫" },
  movies: { title: "أفلام ومسلسلات", icon: "▶" },
  babalhara: { title: "باب الحارة", icon: "⌂" },
  flags: { title: "أعلام الدول", icon: "⚑" },
  animals: { title: "حيوانات", icon: "🐾" },
  people: { title: "شخصيات مشهورة", icon: "♛" },
  letters: { title: "الحروف", icon: "أ" }
};
let typedError = "";
const bankKey = (format, category) => (format === "bluff" ? "bluff." : "") + category;
const formats = {
  classic: { title: "كلاسيكي", description: "سؤال وأربعة خيارات، والإجابة الصحيحة بنقطة." },
  bluff: { title: "الخدعة", description: "كل لاعب يكتب جوابًا مزيّفًا يقنع فيه الباقين، ثم الكل يدوّر على الصحيح بين الخدع." }
};
const modes = {
  screen: { title: "شاشة المجلس", choice: "أنشئ عرض المجلس", description: "الأسئلة على الشاشة الكبيرة، وأنت تجاوب منها وربعك من جوالاتهم." },
  online: { title: "لعب عن بُعد", choice: "أنشئ غرفة أونلاين", description: "شارك رابط الغرفة وتحدَّ ربعك من أي مكان، مع شات للغرفة." },
  bots: { title: "تحدّي البوتات", choice: "جهّز خصومك", description: "اختر عدد الخصوم الآليين وصعوبتهم وتحدّاهم لحالك." }
};
const phases = {
  lobby: "غرفة التحدّي", select: "اختيار الفئة", question: "وقت السؤال",
  reveal: "نتيجة الجولة", finale: "لحظة الحسم", finished: "النتيجة النهائية",
  write: "اكتب خدعتك", vote: "وين الصح؟"
};
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const dialogContent = document.querySelector("#dialog-content");
const toast = document.querySelector("#toast");
const number = new Intl.NumberFormat("en-US", { useGrouping: false });
const format = (value) => number.format(value);
const codePattern = /^[0-9]{6}$/; // room codes are six digits
// Digits typed on an Arabic keyboard (٠-٩, ۰-۹) count as the same code.
const asciiDigits = (value) => String(value ?? "").replace(/[\u0660-\u0669]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/[\u06f0-\u06f9]/g, (d) => d.charCodeAt(0) - 0x06f0);
const roomCode = window.location.pathname.split("/")[2]?.toUpperCase();
const storageKey = `tahaddi-alrabaa:${roomCode}`;
const historyKey = "tatakuf-question-history";
const nameKey = "tatakuf-player-name";
const letters = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط"];
let room;
let token = roomCode ? sessionStorage.getItem(storageKey) : null;
let clockOffset = 0;
let clockRtt = Infinity;
let clockAt = 0;

// Server time minus local time, taken from the response with the shortest round trip; a slow reply
// no longer drags the countdown around. Older samples expire after 20 seconds.
function syncClock(next) {
  const timing = next.__timing;
  if (!timing) { if (clockRtt === Infinity) clockOffset = next.now - Date.now(); return; }
  const rtt = timing.received - timing.sent;
  if (rtt <= clockRtt * 1.25 || Date.now() - clockAt > 20000) {
    clockOffset = next.now - (timing.sent + timing.received) / 2;
    clockRtt = rtt;
    clockAt = Date.now();
  }
}
let pending = false;
let reading = false;
let toastTimeout;
let lastTick;
let stageKey;
let chatKey;
let seenQuestions = readHistory();
let seatAttempted = false;
let seatError = "";
let fakeError = "";
let previousRanks = new Map();
let previousScores = new Map();

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}
const e = escapeHtml;
const actionButton = (label, action, className = "primary", extra = "") =>
  `<button type="button" class="btn ${className}" data-action="${action}" ${extra}>${label}</button>`;

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(historyKey) ?? "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function rememberQuestions(ids = []) {
  if (!ids.some((id) => !seenQuestions.has(id))) return;
  seenQuestions = new Set([...readHistory(), ...seenQuestions, ...ids]);
  // a category seen to the end starts over, so the history never shuts a category away
  for (const [key, count] of Object.entries(bankCounts)) {
    let all = count > 0;
    for (let index = 0; all && index < count; index += 1) all = seenQuestions.has(key + "-" + index);
    if (all) for (let index = 0; index < count; index += 1) seenQuestions.delete(key + "-" + index);
  }
  try { localStorage.setItem(historyKey, JSON.stringify([...seenQuestions])); } catch { /* Session history remains available. */ }
}

function questionHistory() {
  seenQuestions = new Set([...readHistory(), ...seenQuestions]);
  return Object.fromEntries(Object.entries(bankCounts).map(([id, count]) => {
    const bytes = new Uint8Array(Math.ceil(count / 8));
    for (let index = 0; index < count; index += 1) {
      if (seenQuestions.has(id + "-" + index)) bytes[index >> 3] |= 1 << (index % 8);
    }
    return [id, btoa(String.fromCharCode(...bytes))];
  }));
}

function remainingFor(format, category) {
  const key = bankKey(format, category);
  let remainder = bankCounts[key] ?? 0;
  for (let index = 0; index < (bankCounts[key] ?? 0); index += 1) {
    if (seenQuestions.has(key + "-" + index)) remainder -= 1;
  }
  return remainder;
}

function updateBankCount(form) {
  const data = new FormData(form);
  const questionFormat = data.get("format") ?? "classic";
  const picked = data.getAll("category");
  const remaining = picked.reduce((sum, category) => sum + remainingFor(questionFormat, category), 0);
  form.querySelector("[data-bank-count]").textContent = `${format(remaining)} سؤال جديد في الفئات المختارة`;
}

function showHome() {
  app.innerHTML = `
    <section class="hero stage-in" aria-labelledby="home-title">
      <div class="hero-copy">
        <p class="hero-kicker">${format(Object.values(bankCounts).reduce((total, count) => total + count, 0))} سؤال في ${format(Object.keys(categories).filter((id) => bankCounts[id]).length)} فئات</p>
        <h1 id="home-title">لعبة <strong>التكاتف</strong></h1>
        <p class="lead">جمع ربعك على سؤال واحد. اختاروا الفئة وشوفوا من يجيبها.</p>
        <button type="button" class="join-chip" data-action="join"><span aria-hidden="true">#</span>عندك رمز غرفة؟ انضم</button>
      </div>
      <div class="hero-art" aria-hidden="true"><img src="/hero.webp?v=6" width="900" height="600" alt="" fetchpriority="high"></div>
    </section>
    <section class="modes" aria-labelledby="modes-title">
      <div class="section-heading"><h2 id="modes-title">اختَر طريقة اللعب</h2></div>
      <div class="mode-grid">${Object.entries(modes).map(([id, mode]) => `
        <button type="button" class="mode-card mode-${id}" data-action="create" data-mode="${id}">
          <span class="mode-icon" aria-hidden="true"></span><strong>${mode.title}</strong>
          <span>${mode.description}</span><span class="mode-detail">${mode.choice}</span>
        </button>`).join("")}</div>
    </section>
    <section class="home-signature" aria-label="التوقيع">
      <img src="/logo.svg?v=2" width="520" height="494" alt="الرافعية × Vamos">
      <p>صُمّمت في <strong>الرافعية</strong> على يد <bdi>Vamos</bdi></p>
    </section>`;
}

function savedName() {
  try { return localStorage.getItem(nameKey) ?? ""; } catch { return ""; }
}

function rememberName(name) {
  try { localStorage.setItem(nameKey, String(name ?? "").trim()); } catch { /* The name field stays empty next time. */ }
}

function nameField() {
  return `<label class="field">اسمك في اللعبة<input name="name" required maxlength="24" placeholder="مثال، أبو ناصر" autocomplete="nickname" dir="auto" value="${e(savedName())}"></label>`;
}

function openDialog(title, description, html) {
  dialogContent.innerHTML = `<div class="dialog-head">
    <div><h2 id="dialog-title">${title}</h2>${description ? `<p>${description}</p>` : ""}</div>
    <button class="subtle-button close" type="button" data-action="close" aria-label="إغلاق">×</button>
  </div>${html}`;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector("input:not([type=checkbox])")?.focus();
}

// Arabic counting: جولة واحدة، جولتان، 3 جولات … 10 جولات، 11 جولة …
function roundsLabel(count) {
  if (count === 1) return "جولة واحدة";
  if (count === 2) return "جولتان";
  return `${format(count)} ${count <= 10 ? "جولات" : "جولة"}`;
}

// Any number of rounds from 1 to 30: a gold slider with − / + and quick picks.
function roundsPicker(value = 5) {
  return `<fieldset class="rounds-picker"><legend>عدد الجولات <output data-rounds-out>${roundsLabel(value)}</output></legend>
    <div class="rounds-control">
      <button type="button" class="rounds-step" data-action="rounds-step" data-step="-1" aria-label="أنقص جولة">−</button>
      <input type="range" name="rounds" min="1" max="30" step="1" value="${value}" aria-label="عدد الجولات" style="--fill:${(value - 1) / 29 * 100}%">
      <button type="button" class="rounds-step" data-action="rounds-step" data-step="1" aria-label="زد جولة">+</button>
    </div>
    <div class="rounds-quick">${[5, 10, 15, 20, 30].map((count) =>
      `<button type="button" class="${count === value ? "active" : ""}" data-action="rounds-set" data-rounds="${count}">${format(count)}</button>`).join("")}</div>
  </fieldset>`;
}

function setRounds(form, value) {
  const input = form.elements.rounds;
  input.value = String(Math.min(30, Math.max(1, value)));
  updateRounds(input);
}

function updateRounds(input) {
  const count = Number(input.value);
  input.style.setProperty("--fill", `${(count - 1) / 29 * 100}%`);
  input.form.querySelector("[data-rounds-out]").textContent = roundsLabel(count);
  for (const quick of input.form.querySelectorAll("[data-action=rounds-set]")) quick.classList.toggle("active", Number(quick.dataset.rounds) === count);
}

// Segmented gold chips replace native dropdowns; they are plain radios, so FormData still reads them.
function chips(name, label, options, selected) {
  return `<fieldset class="chip-group"><legend>${label}</legend><div class="chips">${options.map(([value, text, hint]) =>
    `<label class="chip"><input type="radio" name="${name}" value="${value}" ${value === selected ? "checked" : ""}>
      <span>${text}${hint ? `<small>${hint}</small>` : ""}</span></label>`).join("")}</div></fieldset>`;
}

function openCreate(mode) {
  seenQuestions = new Set([...readHistory(), ...seenQuestions]);
  openDialog(modes[mode].title, modes[mode].description, `
    <form class="setup-form" data-form="create" data-mode="${mode}">
      ${nameField()}
      ${mode === "screen" ? '<p class="muted">تدخل لاعبًا وتجاوب من نفس الشاشة، ويكفي انضمام لاعب واحد معك لبدء الجلسة.</p>' : ""}
      ${mode === "bots" ? `
        ${chips("bots", "عدد الخصوم", Array.from({ length: 7 }, (_, index) => [String(index + 1), format(index + 1)]), "2")}
        ${chips("difficulty", "مستوى البوتات", [["easy", "سهل", "يغلطون كثير"], ["normal", "متوسط", "منافسة متوازنة"], ["hard", "صعب", "نادرًا يغلطون"]], "normal")}` : ""}
      <fieldset class="format-picker"><legend>طريقة الأسئلة</legend>${Object.entries(formats).map(([id, item]) => `
        <label class="format-option"><input type="radio" name="format" value="${id}" ${id === "classic" ? "checked" : ""}>
          <strong>${item.title}</strong><span>${item.description}</span></label>`).join("")}</fieldset>
      ${roundsPicker(5)}
      ${chips("seconds", "وقت الإجابة", [["30", "30 ث"], ["45", "45 ث"], ["60", "دقيقة"]], "60")}
      <fieldset class="category-picker"><legend>الفئات <button type="button" class="link-button" data-action="toggle-categories">إلغاء الكل</button></legend>
        <div class="check-grid">${Object.entries(categories).filter(([id]) => bankCounts[id]).map(([id, item]) =>
        `<label class="check-category cat-${id}"><input type="checkbox" name="category" value="${id}" checked>
          <span class="symbol" aria-hidden="true">${item.icon}</span><span class="check-title">${item.title}</span><span class="check-mark" aria-hidden="true">✓</span></label>`
      ).join("")}</div></fieldset>
      <p class="bank-count muted" data-bank-count></p>
      <p class="error" data-error role="alert"></p>
      <button class="btn primary" type="submit">${modes[mode].choice}</button>
    </form>`);
  updateBankCount(dialog.querySelector('[data-form="create"]'));
}

function openHelp() {
  openDialog("طريقة اللعب", "", `<ol class="instructions">
    <li><strong>شاشة المجلس</strong> افتحها على الشاشة الكبيرة وسجّل اسمك لتجاوب منها، وخَلّ ربعك يمسحون رمز QR بجوالاتهم. يكفي لاعب واحد معك للبدء.</li>
    <li><strong>عن بُعد</strong> شارك الرابط مع ربعك وافتحوا الشات في نفس الغرفة.</li>
    <li><strong>ضد البوتات</strong> اختر عدد الخصوم ومستواهم وابدأ التحدّي.</li>
    <li>الاختيار بين الفئات بالدور، والإجابة الصحيحة بنقطة. يظهر الترتيب وتبدأ الجولة التالية تلقائيًا، وبعد آخر سؤال تُكشف النتيجة النهائية.</li>
  </ol>`);
}

function openJoin() {
  openDialog("انضم برمز الغرفة", "أدخل الرمز اللي وصلك من المضيف.", `
    <form class="setup-form" data-form="join-code">
      <label class="field">رمز الغرفة<input class="code-input" name="code" required minlength="6" maxlength="6"
        inputmode="numeric" pattern="[0-9٠-٩۰-۹]*" autocomplete="off" placeholder="123456" dir="ltr"></label>
      <p class="error" data-error role="alert"></p>
      <button class="btn primary" type="submit">متابعة</button>
    </form>`);
}

function roomBadge(code) {
  return `<div class="room-id">رمز الغرفة<strong dir="ltr">${e(code)}</strong></div>`;
}

function showJoinPage(error = "") {
  app.innerHTML = `<section class="game stage-in">
    <div class="game-head"><div><h1>انضمام لغرفة</h1><p class="muted" data-join-mode>ادخل باسمك وابدأ التحدّي.</p></div>${roomBadge(roomCode)}</div>
    <div class="panel"><form class="setup-form" data-form="join-link">
      ${nameField()}
      <p class="error" data-error role="alert">${e(error)}</p>
      <div class="actions"><button class="btn primary" type="submit">ادخل الغرفة</button><a class="btn outline" href="/">الرئيسية</a></div>
    </form></div>
  </section>`;
  void api(`/api/rooms/${roomCode}/invite`).then(({ mode }) => {
    const label = app.querySelector("[data-join-mode]");
    if (label && mode === "screen") label.textContent = "دخلت تحدّي المجلس. الأسئلة على الشاشة والإجابات من جوالك.";
  }).catch((failure) => {
    // A wrong or expired code: say so before anyone types a name.
    if (failure.status === 404 && app.querySelector('[data-form="join-link"]')) {
      showStatus("ما لقينا غرفة بهذا الرمز. تأكد من الرمز أو اطلب رابط جديد من المضيف.", false, false);
    }
  });
}

function showStatus(message, loading = false, retry = true) {
  app.innerHTML = `<section class="game panel stage-in"><h1>لعبة التكاتف</h1><p>${e(message)}</p>
    ${loading ? "" : `<div class="actions">${retry ? actionButton("إعادة المحاولة", "retry") : ""}<a class="btn ${retry ? "outline" : "primary"}" href="/">الرئيسية</a></div>`}</section>`;
}

function playersList(order, showScore, showRank = false, compact = false) {
  let rank = 1;
  return `<ol class="players${compact ? " compact" : ""}">${order.map((player, index) => {
    if (index && player.score !== order[index - 1].score) rank = index + 1;
    const tags = [player.bot ? "بوت" : "", player.id === room.hostId ? "المضيف" : "", player.id === room.playerId ? "أنت" : ""].filter(Boolean);
    const avatar = showRank ? format(rank) : player.bot ? "✦" : [...player.name][0];
    return `<li class="player"><span class="player-name"><span class="avatar" aria-hidden="true">${e(avatar)}</span>
      <bdi>${e(player.name)}</bdi>${tags.length ? `<small>${tags.join(" · ")}</small>` : ""}</span>
      ${showScore ? `<span class="score" aria-label="${format(player.score)} نقطة">${format(player.score)}</span>` : ""}</li>`;
  }).join("")}</ol>`;
}

function inviteURL() {
  return new URL(`/room/${room.code}`, window.location.origin).href;
}

function paintQR() {
  const canvas = document.querySelector("[data-room-qr]");
  if (!canvas) return;
  const symbol = qrcode(0, "M");
  symbol.addData(inviteURL(), "Byte");
  symbol.make();
  const count = symbol.getModuleCount();
  const moduleSize = 8;
  canvas.width = canvas.height = (count + 8) * moduleSize;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0b1230";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (symbol.isDark(row, col)) ctx.fillRect((col + 4) * moduleSize, (row + 4) * moduleSize, moduleSize, moduleSize);
    }
  }
}

function lobby() {
  const host = room.playerId === room.hostId;
  const settings = room.settings;
  const count = room.players.length;
  const title = room.display ? "امسحوا الرمز بجوالاتكم" : room.mode === "bots" ? "خصومك جاهزين" : "الغرفة مفتوحة";
  const hint = room.spectator ? "سجّل اسمك لتدخل لاعبًا من هذه الشاشة، أو اترك الشاشة للعرض فقط."
    : room.display ? "اعرض الصفحة على شاشة المجلس. أنت تجاوب من هنا، وربعك من جوالاتهم. يكفي لاعب واحد معك للبدء."
    : room.mode === "bots" ? "ابدأ المباراة وتناوب على اختيار الفئات مع البوتات."
    : room.mode === "screen" ? "خلّ الشاشة قدامك واستعد للإجابة من هنا."
    : "شارك الرابط مع ربعك. تقدرون تبدأون وأنتم لاعبين.";
  return `<div class="lobby-crest"><img src="/logo.svg?v=2" width="520" height="494" alt="الرافعية × Vamos"></div>
  <section class="panel room-invite${room.display ? " with-qr" : ""}">
    <div>
      <h2>${title}</h2><p>${hint}</p>
      <div class="actions">
        ${room.mode !== "bots" ? actionButton("انسخ رابط الدعوة", "copy", "outline") : ""}
        ${host ? actionButton("ابدأ المباراة", "start", "primary", count < 2 ? "disabled" : "") : ""}
        ${room.display ? actionButton("ملء الشاشة", "fullscreen", "outline") : ""}
      </div>
      ${room.spectator ? `<form class="setup-form seat-form" data-form="seat">${nameField()}
        <p class="error" data-error role="alert">${e(seatError)}</p>
        <button class="btn outline" type="submit">ادخل لاعبًا من الشاشة</button></form>` : ""}
    </div>
    ${room.display ? `<figure class="qr-block"><canvas data-room-qr aria-label="رمز QR للانضمام"></canvas><figcaption>${e(room.code)}</figcaption></figure>` : ""}
  </section>
  <section class="panel"><h2>اللاعبون <span class="muted">(${format(count)}/15)</span></h2>
    <div class="settings-line"><span>${formats[settings.format ?? "classic"].title}</span><span>${roundsLabel(settings.rounds)}</span><span>${format(settings.seconds)} ثانية للسؤال</span>
      ${room.mode === "bots" ? `<span>${{ easy:"سهل", normal:"متوسط", hard:"صعب" }[settings.difficulty]}</span>` : ""}</div>
    ${count ? playersList(room.players, false, false, room.display) : `<p class="muted">بانتظار أول لاعب.</p>`}
    ${!host ? `<p class="muted">تبدأ المباراة لما يكون الكل جاهز.</p>` : ""}
  </section>`;
}

// The reveal has two stages: coloured answers with names, then the leaderboard.
const revealAnswersTime = 7000;
const isFinalRound = () => room.round === room.settings.rounds;
let renderedReveal = null;
function revealStage() {
  if (room?.phase !== "reveal" || room.deadline == null) return null;
  const start = room.deadline - phaseDuration();
  if (isFinalRound()) return "answers";
  return Date.now() + clockOffset - start < revealAnswersTime ? "answers" : "board";
}

function phaseDuration() {
  const chooser = room.players.find((player) => player.id === room.chooserId);
  return room.phase === "finale" ? 5500 : room.phase === "reveal"
    ? 12000
    : room.phase === "select" ? (chooser?.bot ? 2200 : 60000)
    : room.phase === "write" ? 60000 : room.settings.seconds * 1000;
}

// The bar is one continuous CSS animation from where the clock is now down to zero, so re-rendering
// the stage (someone answered, a chat arrived) never makes it jump.
function timer() {
  const remaining = Math.max(0, (room.deadline ?? 0) - (Date.now() + clockOffset));
  const from = Math.min(1, remaining / phaseDuration());
  return `<div class="timer-row"><span class="timer-value" data-timer></span>
    <div class="timer-track" aria-hidden="true"><span class="timer-fill" style="--from:${from.toFixed(4)};--remaining:${Math.round(remaining)}ms"></span></div></div>`;
}

function selection() {
  const isTurn = room.chooserId === room.playerId;
  const chooser = room.players.find((player) => player.id === room.chooserId);
  return `<section class="panel">
    ${timer()}<h2>${isTurn ? "دورك تختار الفئة" : `الدور على <bdi>${e(chooser.name)}</bdi>`}</h2>
    <div class="category-grid">${room.available.map((id) => `<button type="button" class="category cat-${id}" data-action="category"
      data-category="${id}" ${!isTurn || pending ? "disabled" : ""}>
      <span class="symbol" aria-hidden="true">${categories[id].icon}</span>${categories[id].title}</button>`).join("")}</div>
  </section>`;
}

// A slim, scrollable row of scores keeps the stage clear between questions.
function scores() {
  const order = [...room.players].sort((a, b) => b.score - a.score);
  return `<section class="score-strip" aria-label="النقاط"><ol>${order.map((player, index) => `
    <li class="${player.id === room.playerId ? "is-me" : ""}${index === 0 && player.score ? " is-lead" : ""}">
      <span class="strip-name"><bdi>${e(player.name)}</bdi></span><strong>${format(player.score)}</strong></li>`).join("")}</ol></section>`;
}

function questionCard(item, hint = "شوف السؤال على الشاشة") {
  // Letters questions read «حرف «ز»: clue»; show the letter as a big tile and the clue as the question.
  const letter = item.prompt?.match(/^حرف «(.+?)»: (.*)$/u);
  const text = letter ? letter[2] : item.prompt;
  const words = text ? text.split(/\s+/u).map((word, index) =>
    `<span class="word" style="--i:${index}">${e(word)}</span>`).join(" ") : e(hint);
  return `<section class="panel question-card cat-${item.category}">
    ${timer()}
    <p class="eyebrow cat-${item.category}"><span class="pick-dot" aria-hidden="true"></span>${categories[item.category].title}
      <span class="picked-by">· ${pickedLabel(item)}</span></p>
    ${letter ? `<div class="letter-tile" aria-label="الحرف ${e(letter[1])}">${e(letter[1])}</div>` : ""}
    <h2 dir="auto">${words}</h2>
    ${item.image ? `<button type="button" class="image-zoom" data-action="zoom" aria-label="كبّر الصورة: ${e(item.image.alt)}">
      <img class="question-image" src="/questions/${e(item.image.file)}" alt="${e(item.image.alt)}" width="750" height="500">
      ${room.display ? "" : '<span class="zoom-hint">اضغط لتكبير الصورة</span>'}</button>` : ""}
  </section>`;
}

// Small name chips: lit while a player is still thinking, dimmed once they have answered.
function presence() {
  if (!room.answeredIds) return "";
  const answered = new Set(room.answeredIds);
  const waiting = room.players.filter((player) => !answered.has(player.id)).length;
  return `<ul class="presence" aria-label="${waiting ? `باقي ${format(waiting)} ما جاوبوا` : "الكل جاوب"}">${room.players.map((player) => {
    const done = answered.has(player.id);
    return `<li class="${done ? "done" : "waiting"}" title="${e(player.name)}: ${done ? "جاوب" : "ما جاوب للحين"}">
      <span class="presence-dot" aria-hidden="true"></span><bdi>${e(player.name)}</bdi></li>`;
  }).join("")}</ul>`;
}

function pickedLabel(item) {
  if (!item.pickedBy) return "اختيار عشوائي";
  const mine = room.players.find((player) => player.id === room.playerId)?.name === item.pickedBy;
  return mine ? "أنت اخترتها" : `اختيار <bdi>${e(item.pickedBy)}</bdi>`;
}

function writeView() {
  const item = room.question;
  const written = room.yourFake !== null;
  const progress = `${format(room.answeredCount)} من ${format(room.players.length)} كتبوا خدعتهم`;
  return `${questionCard(item)}
  <section class="panel bluff-write">
    ${room.spectator ? `<h2>اللاعبون يكتبون خدعهم من جوالاتهم</h2>`
      : written ? `<h2>سجّلنا خدعتك</h2><p class="muted">${room.display ? "مخفية عن الحاضرين" : `<bdi>${e(room.yourFake)}</bdi>`}. انتظر الباقين.</p>`
      : `<h2>اكتب جوابًا غلط يصدّقه الباقون</h2>
        <form class="fake-form" data-form="fake">
          <input name="fake" maxlength="40" required autocomplete="off" dir="auto" aria-label="خدعتك"
            placeholder="خدعة مقنعة…" ${room.display ? 'class="masked"' : ""}>
          <button class="btn primary" type="submit">أرسل الخدعة</button>
        </form>
        <p class="fake-error" data-fake-error role="alert" ${fakeError ? "" : "hidden"}>${e(fakeError)}</p>
        <p class="muted">${room.display ? "الكتابة مخفية عشان ما يشوفها أحد في المجلس." : "كل لاعب ينخدع بجوابك يعطيك نقطة، والإجابة الصحيحة بنقطة."}</p>`}
    ${presence()}
    <p class="muted progress">${progress}</p>
  </section>`;
}

function typedView() {
  const item = room.question;
  const answered = room.yourAnswer !== null;
  const progress = `${format(room.answeredCount)} من ${format(room.players.length)} جاوبوا`;
  return `${questionCard(item)}
  <section class="panel bluff-write typed-answer">
    ${room.spectator ? "<h2>الإجابات من الجوالات</h2>"
      : answered ? `<h2>سجّلنا إجابتك</h2><p class="muted">${room.display ? "مخفية عن الحاضرين" : `<bdi>${e(room.yourAnswer)}</bdi>`}. انتظر الباقين.</p>`
      : `<h2>اكتب الجواب</h2>
        <form class="fake-form" data-form="typed">
          <input name="typed" maxlength="40" required autocomplete="off" dir="auto" aria-label="إجابتك" placeholder="اكتب الكلمة…" ${room.display ? 'class="masked"' : ""}>
          <button class="btn primary" type="submit">أرسل</button>
        </form>
        <p class="fake-error" data-typed-error role="alert" ${typedError ? "" : "hidden"}>${e(typedError)}</p>
        <p class="muted">ما يهم «ال» ولا الهمزات ولا التاء المربوطة.</p>`}
    ${presence()}
    <p class="muted progress">${progress}</p>
  </section>`;
}

function questionView() {
  const item = room.question;
  if (room.phase === "write") return writeView();
  if (item.typed) return typedView();
  const answered = room.yourAnswer !== null;
  const progress = `${format(room.answeredCount)} من ${format(room.players.length)} جاوبوا`;
  const own = new Set(room.display ? [] : item.ownOptions ?? []);
  const bluff = room.phase === "vote";
  return `${questionCard(item)}
  <div class="options${item.options.length > 4 ? " many" : ""}" aria-label="خيارات الإجابة">${item.options.map((option, index) => {
    // The shared screen never highlights the host's pick so the room cannot see it.
    const selected = !room.display && index === room.yourAnswer;
    const style = selected ? "selected" : "";
    const content = `<span class="option-mark" aria-hidden="true">${letters[index] ?? format(index + 1)}</span><bdi>${e(option)}</bdi>${
      own.has(index) ? '<small class="own-tag">خدعتك</small>' : ""}`;
    if (room.spectator) return `<div class="option" style="--i:${index}">${content}</div>`;
    return `<button type="button" class="option ${style}${own.has(index) ? " own" : ""}" data-action="answer" data-option="${index}" style="--i:${index}"
      ${answered || pending || own.has(index) ? "disabled" : ""}>${content}</button>`;
  }).join("")}</div>
  ${presence()}
  <p class="answer-status${answered ? " done" : ""}"><span>${room.spectator ? "الإجابات من الجوالات" : answered ? "تم تسجيل إجابتك ✓" : bluff ? "وين الإجابة الصحيحة بين الخدع؟" : "اختر إجابة واحدة"}</span>
    <span class="muted">${progress}</span></p>`;
}

function leaderboard(order, title) {
  let rank = 1;
  return `<section class="panel leaderboard"><h2>${title}</h2>
    <ol class="rank-list">${order.map((player, index) => {
      if (index && player.score !== order[index - 1].score) rank = index + 1;
      return `<li class="rank-row rank-${rank}" style="--stagger:${index * 65}ms" data-player="${e(player.id)}">
        <span class="rank-medal" aria-label="المركز ${format(rank)}">${format(rank)}</span>
        <span class="rank-name"><bdi>${e(player.name)}</bdi>${player.id === room.playerId ? '<small>أنت</small>' : ""}</span>
        ${player.gained ? `<strong class="round-gain">+${format(player.gained)}</strong>` : ""}
        <span class="rank-score"><span data-count="${player.score}">${format(player.score)}</span> <small>نقطة</small></span>
      </li>`;
    }).join("")}</ol></section>`;
}

// Stage one of the reveal: the answers stay on screen, coloured, with who picked each (and who wrote each fake).
function typedResults() {
  const item = room.question;
  const me = room.players.find((player) => player.id === room.playerId);
  const mine = item.typedAnswers.find((entry) => entry.name === me?.name);
  const headline = room.display ? `الجواب: <bdi>${e(item.correctAnswer)}</bdi>`
    : room.yourAnswer === null ? "انتهى وقت الإجابة" : mine?.correct ? "إجابتك صحيحة ✓" : "إجابتك غلط";
  return `${questionCard(item)}
  <section class="panel typed-truth"><p class="eyebrow">الجواب الصحيح</p><h2><bdi>${e(item.correctAnswer)}</bdi></h2></section>
  <ul class="typed-results" aria-label="إجابات اللاعبين">${item.typedAnswers.map((entry, index) => `
    <li class="${entry.text === null ? "none" : entry.correct ? "right" : "wrong"}" style="--step:${index}">
      <span class="typed-name"><bdi>${e(entry.name)}</bdi></span>
      <strong>${entry.text === null ? "ما جاوب" : `<bdi>${e(entry.text)}</bdi>`}</strong>
      <span class="typed-mark" aria-hidden="true">${entry.text === null ? "–" : entry.correct ? "✓" : "✗"}</span>
    </li>`).join("")}</ul>
  <p class="answer-status reveal-status"><span>${headline}</span><span class="muted">${isFinalRound() ? "النتيجة النهائية بعد لحظات" : "الترتيب بعد لحظات"}</span></p>`;
}

function answersView() {
  const item = room.question;
  if (item.typed) return typedResults();
  const bluff = Boolean(item.authors);
  const me = room.players.find((player) => player.id === room.playerId);
  const names = (list) => list.map((name) => `<bdi>${e(name)}</bdi>`).join("، ");
  const headline = room.display ? `الإجابة الصحيحة: <bdi>${e(item.options[item.correctIndex])}</bdi>`
    : room.yourAnswer === null ? "انتهى وقت الإجابة"
    : isFinalRound() ? (room.yourAnswer === item.correctIndex ? "إجابتك صحيحة ✓" : "إجابتك غلط")
    : me?.gained ? `كسبت +${format(me.gained)} هالجولة` : "ما كسبت نقاط هالجولة";
  return `${questionCard(item)}
  <div class="options revealed${item.options.length > 4 ? " many" : ""}" aria-label="نتيجة الخيارات">${item.options.map((option, index) => {
    const correct = index === item.correctIndex;
    const step = correct ? item.options.length : index < item.correctIndex ? index : index - 1;
    const voters = item.voters?.[index] ?? [];
    const authors = item.authors?.[index] ?? [];
    const tag = correct ? "الإجابة الصحيحة" : bluff ? (authors.length ? `خدعة ${names(authors)}` : "خدعة اللعبة") : "";
    const who = voters.length ? `${correct ? "عرفها" : bluff ? "انخدع" : "اختارها"}: ${names(voters)}` : correct ? "ما أحد عرفها" : "";
    const mine = !room.display && index === room.yourAnswer;
    return `<div class="option result ${correct ? "correct" : "wrong"}${mine ? " mine" : ""}${voters.length ? " picked" : ""}" style="--step:${step}">
      <span class="option-mark" aria-hidden="true">${correct ? "✓" : letters[index] ?? format(index + 1)}</span>
      <span class="option-body"><bdi class="option-text">${e(option)}</bdi>
        ${tag ? `<small class="option-tag">${tag}</small>` : ""}${who ? `<small class="option-voters">${who}</small>` : ""}</span>
    </div>`;
  }).join("")}</div>
  <p class="answer-status reveal-status"><span>${headline}</span><span class="muted">${isFinalRound() ? "النتيجة النهائية بعد لحظات" : "الترتيب بعد لحظات"}</span></p>`;
}

function roundResults() {
  if (revealStage() === "answers") return answersView();
  const item = room.question;
  const correct = room.yourAnswer === item.correctIndex;
  const outcome = room.display ? "الإجابة الصحيحة" : room.yourAnswer === null ? "انتهى وقت الإجابة" : correct ? "إجابة صحيحة" : "إجابة غير صحيحة";
  const order = [...room.players].sort((a, b) => b.score - a.score);
  // In bluff rounds the cards below reveal the answer, so the banner only shows this player's points.
  const mine = room.players.find((player) => player.id === room.playerId)?.gained ?? 0;
  const headline = !item.authors ? `<bdi>${e(item.options[item.correctIndex])}</bdi>`
    : room.display ? "الحقيقة تنكشف…" : mine ? `كسبت +${format(mine)}` : "ما كسبت نقاط هالجولة";
  // Round results take over the whole screen, then slide away when the next round starts.
  return `<section class="results-screen" role="region" aria-labelledby="results-title"><div class="results-inner">
    <header class="results-head">
      <p class="eyebrow">الجولة ${format(room.round)} من ${format(room.settings.rounds)}</p>
      <h2 id="results-title">نتيجة الجولة</h2>
    </header>
    <div class="results-timer"><p class="muted">${item.authors && !room.display ? `${headline} · ` : ""}الجولة التالية تلقائيًا</p>${timer()}</div>
    ${leaderboard(order, "ترتيب اللاعبين")}
  </div></section>`;
}

function finale() {
  return `<section class="panel finale-stage">
    <div class="finale-orbit" aria-hidden="true"><span>؟</span></div>
    <h2>من بطل التكاتف؟</h2>
    ${timer()}
  </section>`;
}

function finished() {
  const order = [...room.players].sort((a, b) => b.score - a.score);
  const winners = order.filter((player) => player.score === order[0].score);
  const tied = winners.length > 1;
  return `<section class="panel result-panel champion">
    <div class="champion-sparks" aria-hidden="true">${Array.from({ length: 15 }, (_, index) =>
      `<i style="--angle:${index * 24}deg;--delay:${index * 24}ms"></i>`
    ).join("")}</div>
    <div class="champion-mark" aria-hidden="true">✦</div>
    <p class="eyebrow">${tied ? "تعادل على المركز الأول" : "بطل التكاتف"}</p>
    <h2>${winners.map((winner) => `<bdi>${e(winner.name)}</bdi>`).join(" · ")}</h2>
    ${room.lastAnswer ? `<p class="muted">إجابة السؤال الأخير <bdi>${e(room.lastAnswer)}</bdi></p>` : ""}
    <div class="actions">
      ${room.playerId === room.hostId ? actionButton("العبوا مرة ثانية", "rematch") : ""}
      <a class="btn outline" href="/">العودة للرئيسية</a>
    </div>
  </section>${leaderboard(order, "الترتيب النهائي")}`;
}

function createRoomShell() {
  queueMicrotask(() => { const fab = app.querySelector(".chat-fab"); if (fab) setupFab(fab); });
  const online = room.mode === "online";
  app.innerHTML = `<section class="game mode-${room.mode}" ${room.display ? "data-display" : ""}>
    <div class="game-head"><div><p class="mode-chip">${modes[room.mode].title}</p><h1 tabindex="-1" id="game-title"></h1><p id="round-label" class="muted"></p></div>
      <div class="head-side">${room.mode === "bots" ? "" : roomBadge(room.code)}
        ${room.playerId === room.hostId && room.mode !== "bots" ? `<button type="button" class="btn outline players-button" data-action="players">اللاعبين</button>` : ""}</div></div>
    <p id="room-message" class="error" role="alert"></p>
    <div class="game-layout">
      <div class="game-main"></div>
    </div>
    ${online ? `<button type="button" class="chat-fab" data-action="chat-toggle" aria-expanded="false" aria-controls="chat-drawer" aria-label="افتح شات الغرفة">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.6.5-1.3.1-1.3-.7V16A2.5 2.5 0 0 1 4 13.5z"/></svg>
        <span class="chat-badge" hidden></span>
      </button>
      <aside class="chat-drawer" id="chat-drawer" aria-labelledby="chat-title" hidden>
        <div class="chat-head"><h2 id="chat-title">شات الغرفة</h2>
          <button type="button" class="subtle-button close" data-action="chat-toggle" aria-label="أغلق الشات">×</button></div>
        <div class="chat-log" role="log" aria-label="رسائل الغرفة"></div>
        <form class="chat-form" data-form="chat">
          <input name="message" aria-label="رسالة للشات" placeholder="اكتب رسالة…" maxlength="240" autocomplete="off" required dir="auto">
          <button class="btn primary" type="submit">إرسال</button>
        </form><p class="error" data-chat-error role="alert"></p>
      </aside>` : ""}
  </section>`;
}

let chatOpen = false;
let chatSeen;
const fabKey = "tatakuf-chat-position";

// The chat bubble can be dragged anywhere; on release it snaps to the nearest side and remembers the spot.
function placeFab(fab, x, y) {
  const size = fab.offsetWidth || 50;
  const left = Math.min(innerWidth - size - 10, Math.max(10, x));
  const top = Math.min(innerHeight - size - 10, Math.max(10, y));
  fab.classList.add("placed");
  fab.style.left = `${left}px`;
  fab.style.top = `${top}px`;
}

function setupFab(fab) {
  try {
    const saved = JSON.parse(localStorage.getItem(fabKey));
    if (saved) placeFab(fab, saved.x * innerWidth, saved.y * innerHeight);
  } catch { /* Default corner. */ }
  let start = null;
  let moved = false;
  fab.addEventListener("pointerdown", (event) => {
    start = { x: event.clientX, y: event.clientY, rect: fab.getBoundingClientRect() };
    moved = false;
    fab.setPointerCapture(event.pointerId);
  });
  fab.addEventListener("pointermove", (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 8) return;
    moved = true;
    fab.classList.add("dragging");
    placeFab(fab, start.rect.left + dx, start.rect.top + dy);
    if (chatOpen) positionDrawer();
  });
  const finish = () => {
    if (!start) return;
    start = null;
    if (!moved) return;
    fab.classList.remove("dragging");
    fab.dataset.dragged = "1";
    setTimeout(() => delete fab.dataset.dragged, 80);
    const rect = fab.getBoundingClientRect();
    const x = rect.left + rect.width / 2 < innerWidth / 2 ? 10 : innerWidth - rect.width - 10;
    placeFab(fab, x, rect.top);
    try { localStorage.setItem(fabKey, JSON.stringify({ x: x / innerWidth, y: rect.top / innerHeight })); } catch { /* Not remembered. */ }
    if (chatOpen) setTimeout(positionDrawer, 320);
  };
  fab.addEventListener("pointerup", finish);
  fab.addEventListener("pointercancel", finish);
  addEventListener("resize", () => {
    if (!fab.classList.contains("placed")) return;
    const rect = fab.getBoundingClientRect();
    placeFab(fab, rect.left, rect.top);
    if (chatOpen) positionDrawer();
  });
}

// Open the chat window on the roomier side of the bubble.
function positionDrawer() {
  const drawer = app.querySelector(".chat-drawer");
  const fab = app.querySelector(".chat-fab");
  if (!drawer || drawer.hidden || !fab.classList.contains("placed")) return;
  const rect = fab.getBoundingClientRect();
  const width = Math.min(370, innerWidth - 20);
  drawer.classList.add("placed");
  drawer.style.width = `${width}px`;
  drawer.style.left = `${Math.min(innerWidth - width - 10, Math.max(10, rect.left + rect.width / 2 - width / 2))}px`;
  const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dock-offset")) || 0;
  const above = rect.top > (innerHeight - dock) / 2;
  const room = above ? rect.top - 22 : innerHeight - dock - rect.bottom - 22;
  // Shrink the message list so the whole window fits on the chosen side.
  const log = drawer.querySelector(".chat-log");
  log.style.height = `${Math.max(90, Math.min(360, room - (drawer.offsetHeight - log.offsetHeight)))}px`;
  const height = drawer.offsetHeight;
  drawer.style.top = `${above ? Math.max(10, rect.top - 12 - height) : rect.bottom + 12}px`;
}

function toggleChat(open = !chatOpen) {
  const drawer = app.querySelector(".chat-drawer");
  const fab = app.querySelector(".chat-fab");
  if (!drawer) return;
  chatOpen = open;
  drawer.hidden = !open;
  fab.setAttribute("aria-expanded", String(open));
  fab.classList.toggle("open", open);
  if (open) {
    positionDrawer();
    chatSeen = room.chat?.at(-1)?.id;
    updateChatBadge();
    const log = drawer.querySelector(".chat-log");
    log.scrollTop = log.scrollHeight;
    drawer.querySelector("input").focus({ preventScroll: true });
  } else fab.focus({ preventScroll: true });
}

// Count messages from others since the drawer was last open.
function updateChatBadge() {
  const badge = app.querySelector(".chat-badge");
  if (!badge) return;
  const messages = room.chat ?? [];
  if (chatOpen) chatSeen = messages.at(-1)?.id;
  const from = messages.findIndex((message) => message.id === chatSeen);
  const unread = messages.slice(from + 1).filter((message) => message.playerId !== room.playerId).length;
  const before = Number(badge.dataset.count ?? 0);
  badge.hidden = !unread;
  badge.dataset.count = unread;
  badge.textContent = unread > 9 ? "+9" : format(unread);
  if (unread > before) {
    const fab = app.querySelector(".chat-fab");
    fab.classList.remove("ping");
    void fab.offsetWidth;
    fab.classList.add("ping");
    playSound("tap");
  }
}

function updateChat() {
  const log = app.querySelector(".chat-log");
  if (!log) return;
  const messages = room.chat ?? [];
  const nextKey = messages.at(-1)?.id ?? "";
  if (chatKey === nextKey) return;
  const atBottom = chatKey === undefined || log.scrollHeight - log.clientHeight - log.scrollTop < 35;
  chatKey = nextKey;
  log.innerHTML = messages.length ? messages.map((message) => `<div class="chat-line${message.playerId === room.playerId ? " mine" : ""}">
    <strong><bdi>${e(message.name)}</bdi></strong><p dir="auto">${e(message.text)}</p></div>`).join("")
    : '<p class="muted">الشات مفتوح للاعبين في الغرفة.</p>';
  if (atBottom) log.scrollTop = log.scrollHeight;
  if (chatSeen === undefined && !chatOpen) chatSeen = messages.at(-1)?.id ?? null;
  updateChatBadge();
}

function playPhaseSound(previous) {
  if (!previous) return;
  if (room.phase === "reveal") {
    const me = room.question.typedAnswers?.find((entry) => entry.name === room.players.find((player) => player.id === room.playerId)?.name);
    const right = room.question.typed ? me?.correct : room.yourAnswer === room.question.correctIndex;
    const key = room.display || right ? "correct" : "incorrect";
    playSound(key);
  } else playSound({ lobby:"join", select:"select", question:"question", write:"question", vote:"select",
    finale:"finale", finished:"finished" }[room.phase]);
}

function renderRoom(next, force = false) {
  if (room && next.revision < room.revision) return;
  const previous = room;
  const phaseChanged = !previous || previous.phase !== next.phase || previous.round !== next.round;
  if (phaseChanged) fakeError = typedError = "";
  room = next;
  rememberQuestions(next.seenQuestions);
  syncClock(next);
  if (!app.querySelector(".game-main")) {
    stageKey = chatKey = undefined;
    createRoomShell();
  }
  const body = app.querySelector(".game-main");
  const { now, chat, revision, seenQuestions: history, __timing, ...stageState } = room;
  const key = JSON.stringify(stageState) + (revealStage() ?? "");
  if (stageKey !== key || force) {
    stageKey = key;
    const active = document.activeElement;
    const focus = body.contains(active) && active.dataset.action;
    const view = { lobby, select:selection, question:questionView, write:questionView, vote:questionView,
      reveal:roundResults, finale, finished }[room.phase]();
    // Keep half-typed names and fakes when the stage refreshes because someone else acted.
    const typing = [...body.querySelectorAll("input[name]")].map((input) => [input.name, input.value, input === active]);
    const stageNow = revealStage();
    const revealSwitch = !phaseChanged && stageNow !== renderedReveal && stageNow === "board";
    renderedReveal = stageNow;
    body.classList.toggle("settled", !phaseChanged);
    // The results screen lives directly under <body> (the stage's own animation would trap a fixed layer),
    // slides up when it opens and slides away over the next stage when it closes.
    const current = document.querySelector("body > .results-screen:not(.leaving)");
    if (current && phaseChanged && !reducedMotion.matches) {
      current.classList.add("leaving");
      current.addEventListener("animationend", () => current.remove(), { once: true });
      setTimeout(() => current.remove(), 900);
    } else current?.remove();
    body.innerHTML = view;
    const results = body.querySelector(".results-screen");
    if (results) {
      results.classList.toggle("entering", phaseChanged || revealSwitch);
      document.body.append(results);
    }
    document.documentElement.classList.toggle("results-open", Boolean(results));
    for (const [name, value, focused] of typing) {
      const input = body.querySelector(`input[name="${name}"]`);
      if (!input || phaseChanged) continue;
      input.value = value;
      if (focused) input.focus({ preventScroll: true });
    }
    const gameTitle = app.querySelector("#game-title");
    gameTitle.textContent = phases[room.phase];
    app.querySelector("#round-label").textContent = room.round ? `الجولة ${format(room.round)} من ${format(room.settings.rounds)}` : "";
    if (phaseChanged) {
      body.classList.remove("stage-in");
      void body.offsetWidth;
      body.classList.add("stage-in");
      lastTick = undefined;
      const activeTag = active?.tagName;
      if (!(activeTag === "INPUT" || activeTag === "TEXTAREA") && !dialog.open) gameTitle.focus({ preventScroll: true });
      playPhaseSound(previous);
      if (previous) stinger();
      animateLeaderboard();
      if (room.phase === "finished") {
        confetti();
        // After the champion moment, glide down to the full standings when the list is long.
        setTimeout(() => {
          const board = app.querySelector(".leaderboard");
          if (!board || reducedMotion.matches || scrollY > 40 || board.getBoundingClientRect().bottom <= innerHeight) return;
          board.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 4000);
      }
    } else if (revealSwitch) {
      animateLeaderboard();
      playSound("select");
      autoScrollResults();
    } else if (focus) {
      [...body.querySelectorAll("button[data-action]")].find((button) => !button.disabled &&
        button.dataset.action === focus && button.dataset.category === active.dataset.category &&
        button.dataset.option === active.dataset.option)?.focus({ preventScroll: true });
    }
    paintQR();
  }
  updateChat();
  updateTimer();
  if (room.spectator && room.phase === "lobby" && !seatAttempted && savedName()) {
    seatAttempted = true;
    void seatDisplayHost(savedName());
  }
}

// Older shared-screen rooms started with a display-only host. Seat it as a player with the same token and link.
async function seatDisplayHost(name) {
  seatError = "";
  try {
    const joined = await api(`/api/rooms/${roomCode}/join`, { name, history: questionHistory() });
    rememberName(name);
    renderRoom(joined.room, true);
    playSound("join");
  } catch (error) {
    seatError = error.status ? error.message : "تعذّر الاتصال. جرّب مرة ثانية.";
    if (room) renderRoom(room, true);
  }
}

function updateTimer() {
  if (!room?.deadline) return;
  if (room.phase === "reveal" && revealStage() !== renderedReveal) { renderRoom(room, true); return; }
  const label = stageRoot().querySelector("[data-timer]");
  const fill = stageRoot().querySelector(".timer-fill");
  if (!label || !fill) return;
  const remaining = Math.max(0, room.deadline - (Date.now() + clockOffset));
  const seconds = Math.ceil(remaining / 1000);
  const text = `${format(seconds)} ثانية`;
  if (label.textContent !== text) label.textContent = text;
  const answering = ["question", "write", "vote"].includes(room.phase);
  fill.closest(".timer-row").classList.toggle("late", answering && seconds <= 3);
  if (answering && seconds >= 1 && seconds <= 3 && lastTick !== seconds && room.yourAnswer === null && !room.yourFake) {
    lastTick = seconds;
    playSound("tick");
  }
}

// A gold band sweeps across with the new phase name; purely decorative and never blocks taps.
function stinger() {
  if (reducedMotion.matches || !["select", "question", "write", "vote", "reveal", "finale"].includes(room.phase)) return;
  document.querySelector(".stinger")?.remove();
  const band = document.createElement("div");
  band.className = "stinger";
  band.setAttribute("aria-hidden", "true");
  const item = room.question;
  const announcePick = item && (room.phase === "question" || room.phase === "write");
  if (announcePick) {
    // Everyone sees who chose the category before the question lands.
    band.classList.add("pick", `cat-${item.category}`);
    const mine = room.players.find((player) => player.id === room.playerId)?.name === item.pickedBy;
    const who = !item.pickedBy ? "الوقت انتهى، والاختيار عشوائي" : mine ? "اخترت" : `<bdi>${e(item.pickedBy)}</bdi> اختار`;
    band.innerHTML = `<span>${who}</span>
      <strong><i class="symbol">${categories[item.category].icon}</i>${categories[item.category].title}</strong>`;
  } else band.innerHTML = `<span>${room.round ? `الجولة ${format(room.round)}` : ""}</span><strong>${phases[room.phase]}</strong>`;
  document.body.append(band);
  band.addEventListener("animationend", () => band.remove(), { once: true });
  playSound("stinger");
}

// Rows slide from their previous rank and scores count up to the new total.
// With many players the leaderboard is taller than the screen: glide down to the last rows on its own,
// and stop as soon as someone touches or scrolls.
function autoScrollResults() {
  const screen = document.querySelector("body > .results-screen:not(.leaving)");
  if (!screen || reducedMotion.matches) return;
  const remaining = Math.max(0, (room.deadline ?? 0) - (Date.now() + clockOffset));
  const travel = () => screen.scrollHeight - screen.clientHeight;
  let stopped = false;
  const stop = () => { stopped = true; };
  for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) screen.addEventListener(type, stop, { once: true, passive: true });
  setTimeout(() => {
    if (stopped || travel() < 8 || !screen.isConnected) return;
    const duration = Math.max(1200, remaining - 2600);
    const startedAt = performance.now();
    const step = (time) => {
      if (stopped || !screen.isConnected) return;
      const progress = Math.min(1, (time - startedAt) / duration);
      const eased = progress < .5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
      screen.scrollTop = travel() * eased;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, 1300);
}

// The visible stage: the open results screen when there is one, otherwise the game itself.
const stageRoot = () => document.querySelector("body > .results-screen:not(.leaving)") ?? app;

function animateLeaderboard() {
  const rows = [...stageRoot().querySelectorAll(".rank-row[data-player]")];
  const nextRanks = new Map(rows.map((row, index) => [row.dataset.player, index]));
  if (!reducedMotion.matches) {
    // Cards fly in from the slot they held last round (the grid makes this two-dimensional).
    const slots = rows.map((row) => row.getBoundingClientRect());
    for (const row of rows) {
      const before = previousRanks.get(row.dataset.player);
      const now = nextRanks.get(row.dataset.player);
      const slot = before === undefined ? null : slots[Math.min(before, slots.length - 1)];
      const dx = slot ? slot.left - slots[now].left : 0;
      const dy = slot ? slot.top - slots[now].top : 0;
      if (dx || dy) row.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 750, delay: 650, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
      const counter = row.querySelector("[data-count]");
      const from = previousScores.get(row.dataset.player) ?? 0;
      const to = Number(counter.dataset.count);
      if (to > from) {
        const started = performance.now() + 500;
        const step = (time) => {
          const progress = Math.min(1, Math.max(0, (time - started) / 700));
          counter.textContent = format(Math.round(from + (to - from) * progress));
          if (progress < 1 && counter.isConnected) requestAnimationFrame(step);
        };
        counter.textContent = format(from);
        requestAnimationFrame(step);
      }
    }
  }
  if (rows.length) {
    previousRanks = nextRanks;
    previousScores = new Map(room.players.map((player) => [player.id, player.score]));
  }
}

function confetti() {
  if (reducedMotion.matches) return;
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const colors = ["#f8d581", "#f6bd58", "#5fe3d3", "#fff3cf", "#e9a86b"];
  const pieces = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .32,
    vx: (Math.random() - .5) * 15, vy: -Math.random() * 15 - 5, spin: Math.random() * 6,
    size: 5 + Math.random() * 7, color: colors[Math.floor(Math.random() * colors.length)]
  }));
  const start = performance.now();
  const frame = (time) => {
    const elapsed = time - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const piece of pieces) {
      piece.vy += .38; piece.vx *= .985; piece.x += piece.vx; piece.y += piece.vy;
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.spin * elapsed / 400);
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 3400);
      ctx.fillStyle = piece.color;
      ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      ctx.restore();
    }
    if (elapsed < 3400) requestAnimationFrame(frame); else canvas.remove();
  };
  requestAnimationFrame(frame);
}

function openZoom() {
  const image = room?.question?.image;
  if (!image) return;
  openDialog("الصورة", "قرّب بإصبعين أو بالأزرار.", `<div class="zoom-frame" style="--zoom:1">
      <img src="/questions/${e(image.file)}" alt="${e(image.alt)}"></div>
    <div class="actions zoom-actions">${actionButton("تكبير +", "zoom-in", "outline")}${actionButton("تصغير −", "zoom-out", "outline")}</div>`);
}

function setZoom(change) {
  const frame = dialog.querySelector(".zoom-frame");
  if (!frame) return;
  const zoom = Math.min(4, Math.max(1, Number(frame.style.getPropertyValue("--zoom")) + change));
  frame.style.setProperty("--zoom", String(zoom));
}

async function api(path, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const sent = Date.now();
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers, signal: AbortSignal.timeout(10000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (data.room) Object.defineProperty(data.room, "__timing", { value: { sent, received: Date.now() }, enumerable: false });
  if (!response.ok) throw Object.assign(new Error(data.error ?? "تعذّر الاتصال. جرّب مرة ثانية."), { status: response.status });
  return data;
}

function showToast(message) {
  toast.textContent = message;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.textContent = ""; }, 2700);
}

function updateSoundButton() {
  const button = document.querySelector('[data-action="sound"]');
  button.setAttribute("aria-pressed", String(soundEnabled()));
  button.querySelector("[data-sound-label]").textContent = soundEnabled() ? "الصوت" : "الصوت مكتوم";
}

async function sync() {
  if (!token || reading || pending) return;
  reading = true;
  try {
    const data = await api(`/api/rooms/${roomCode}`);
    if (!pending) renderRoom(data.room);
    const error = app.querySelector("#room-message");
    if (error?.dataset.source === "network") error.textContent = "";
  } catch (error) {
    if (error.status === 410) {
      token = room = null;
      sessionStorage.removeItem(storageKey);
      if (dialog.open) dialog.close();
      showStatus(error.message, false, false);
    } else if (error.status === 401) {
      token = room = null;
      sessionStorage.removeItem(storageKey);
      showJoinPage(error.message);
    } else if (error.status === 404 || !room) {
      room = null;
      showStatus(error.status ? error.message : "تعذّر الاتصال. جرّب مرة ثانية.");
    } else {
      const message = app.querySelector("#room-message");
      message.dataset.source = "network";
      message.textContent = "انقطع الاتصال. نحاول نرجّعك للمباراة.";
    }
  } finally {
    reading = false;
  }
}

async function gameAction(action, button) {
  if (pending || !room) return;
  const inputs = {
    start: {}, rematch: {},
    category: { round: room.round, category: button.dataset.category },
    answer: { questionId: room.question?.id, option: Number(button.dataset.option) }
  };
  pending = true;
  button.disabled = true;
  // Lock every option together, so nobody can tell which one was tapped (it matters on the shared screen).
  if (action === "answer") {
    for (const option of app.querySelectorAll('button.option')) option.disabled = true;
    button.blur();
  }
  const errorLine = app.querySelector("#room-message");
  errorLine.textContent = "";
  try {
    const previous = room;
    const data = await api(`/api/rooms/${roomCode}/${action}`, inputs[action]);
    pending = false;
    renderRoom(data.room, true);
    if (action === "answer" && previous.phase === room.phase) {
      playSound("locked");
      app.querySelector(".option.selected")?.classList.add("just-picked");
    }
  } catch (error) {
    pending = false;
    if (room) renderRoom(room, true);
    const message = app.querySelector("#room-message");
    if (message) {
      message.dataset.source = "action";
      message.textContent = error.status ? error.message : "تعذّر الاتصال. جرّب مرة ثانية.";
    }
    if (error.status === 409) void sync();
  }
}

// Set once the page is on its way to a new room, so a second tap cannot create another one.
let leaving = false;

// The host can remove a player who left or went quiet, so the round stops waiting for them.
// The confirm step only takes a tap after a short pause, so a double tap never kicks by itself.
let kickArmed = null;
let kickArmedAt = 0;
function openPlayers() {
  const others = room.players.filter((player) => player.id !== room.hostId);
  openDialog("اللاعبين", "اطرد اللاعب اللي طلع أو ما يرد، وتكمل الجولة بدونه.", others.length
    ? `<ul class="kick-list">${others.map((player) => `<li><span class="player-name"><span class="avatar" aria-hidden="true">${e(player.bot ? "✦" : [...player.name][0])}</span><bdi>${e(player.name)}</bdi></span>
      <button type="button" class="btn ${kickArmed === player.id ? "danger" : "outline"}" data-action="kick" data-player="${e(player.id)}">${kickArmed === player.id ? "متأكد؟ اطرد" : "اطرد"}</button></li>`).join("")}</ul>
      <p class="error" data-kick-error role="alert"></p>`
    : `<p class="muted">ما فيه لاعبين غيرك.</p>`);
}

async function kickPlayer(button) {
  const id = button.dataset.player;
  if (kickArmed !== id) { kickArmed = id; kickArmedAt = Date.now(); openPlayers(); return; }
  if (Date.now() - kickArmedAt < 600) return;
  button.disabled = true;
  try {
    const data = await api(`/api/rooms/${roomCode}/kick`, { playerId: id });
    kickArmed = null;
    renderRoom(data.room, true);
    playSound("tap");
    openPlayers();
  } catch (error) {
    button.disabled = false;
    const line = dialog.querySelector("[data-kick-error]");
    if (line) line.textContent = error.status ? error.message : "تعذّر الاتصال. جرّب مرة ثانية.";
  }
}

async function copyInvitation() {
  const url = inviteURL();
  try {
    await navigator.clipboard.writeText(url);
    showToast("تم نسخ رابط الدعوة");
  } catch {
    openDialog("رابط الدعوة", "", `<input value="${e(url)}" aria-label="رابط الدعوة" dir="ltr" readonly>`);
    dialog.querySelector("input").select();
  }
}

async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { showToast("ملء الشاشة غير متاح في هذا المتصفح."); }
}

document.addEventListener("pointerdown", unlockSound, { passive: true });
document.addEventListener("keydown", unlockSound);
document.addEventListener("input", (event) => {
  if (event.target.name === "rounds" && event.target.type === "range") { updateRounds(event.target); return; }
  if (event.target.name !== "fake" || !fakeError) return;
  fakeError = "";
  event.target.classList.remove("shake");
  const inline = app.querySelector("[data-fake-error]");
  if (inline) inline.hidden = true;
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && chatOpen) toggleChat(false); });
document.addEventListener("change", (event) => {
  const form = event.target.form;
  if (form?.dataset.form !== "create") return;
  if (event.target.name === "category" || event.target.name === "format") updateBankCount(form);
  if (event.target.name === "category") {
    const all = [...form.querySelectorAll('input[name="category"]')];
    form.querySelector('[data-action="toggle-categories"]').textContent = all.every((box) => !box.checked) ? "تحديد الكل" : "إلغاء الكل";
  }
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.dragged) return;
  const action = button.dataset.action;
  if (action === "sound") {
    toggleSound(); updateSoundButton(); playSound("tap");
  } else if (action === "help") { playSound("tap"); openHelp(); }
  else if (action === "create") { playSound("tap"); openCreate(button.dataset.mode); }
  else if (action === "join") { playSound("tap"); openJoin(); }
  else if (action === "close") dialog.close();
  else if (action === "copy") void copyInvitation();
  else if (action === "fullscreen") void fullscreen();
  else if (action === "retry") void sync();
  else if (action === "zoom") openZoom();
  else if (action === "rounds-step") setRounds(button.form, Number(button.form.elements.rounds.value) + Number(button.dataset.step));
  else if (action === "rounds-set") setRounds(button.form, Number(button.dataset.rounds));
  else if (action === "chat-toggle") toggleChat();
  else if (action === "players") { playSound("tap"); kickArmed = null; openPlayers(); }
  else if (action === "kick") void kickPlayer(button);
  else if (action === "toggle-categories") {
    const form = button.closest("form");
    const boxes = [...form.querySelectorAll('input[name="category"]')];
    const check = boxes.every((box) => !box.checked);
    for (const box of boxes) box.checked = check;
    button.textContent = check ? "إلغاء الكل" : "تحديد الكل";
    updateBankCount(form);
  }
  else if (action === "zoom-in") setZoom(.5);
  else if (action === "zoom-out") setZoom(-.5);
  else void gameAction(action, button);
});

async function sendChat(form) {
  const button = form.querySelector("button");
  const input = form.elements.message;
  const error = app.querySelector("[data-chat-error]");
  const text = input.value.trim();
  if (!text || button.disabled) return;
  button.disabled = true;
  error.textContent = "";
  try {
    const result = await api(`/api/rooms/${roomCode}/chat`, { text, id: crypto.randomUUID() });
    if (input.value.trim() === text) input.value = "";
    renderRoom(result.room);
  } catch (failure) {
    error.textContent = failure.status ? failure.message : "تعذّر إرسال الرسالة.";
  } finally { button.disabled = false; }
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  const kind = form.dataset.form;
  if (!kind) return;
  event.preventDefault();
  if (kind === "chat") { await sendChat(form); return; }
  if (kind === "typed") {
    const button = form.querySelector("button");
    const input = form.elements.typed;
    if (button.disabled || pending || !room?.question) return;
    pending = button.disabled = true;
    try {
      const data = await api(`/api/rooms/${roomCode}/answer`, { questionId: room.question.id, text: input.value });
      pending = false;
      typedError = "";
      renderRoom(data.room, true);
      playSound("locked");
    } catch (error) {
      pending = button.disabled = false;
      typedError = error.status ? error.message : "تعذّر الإرسال. جرّب مرة ثانية.";
      const inline = app.querySelector("[data-typed-error]");
      if (inline) { inline.textContent = typedError; inline.hidden = false; }
      if (error.status === 409) void sync();
    }
    return;
  }
  if (kind === "fake") {
    const button = form.querySelector("button");
    const input = form.elements.fake;
    if (button.disabled || pending || !room?.question) return;
    pending = button.disabled = true;
    const errorLine = app.querySelector("#room-message");
    errorLine.textContent = "";
    try {
      const data = await api(`/api/rooms/${roomCode}/fake`, { questionId: room.question.id, text: input.value });
      pending = false;
      fakeError = "";
      renderRoom(data.room, true);
      playSound("locked");
    } catch (error) {
      pending = button.disabled = false;
      const message = error.status ? error.message : "تعذّر الإرسال. جرّب مرة ثانية.";
      // Show the problem right under the box the player is typing in, and keep their text to edit.
      const inline = app.querySelector("[data-fake-error]");
      if (inline) {
        fakeError = message;
        inline.textContent = message;
        inline.hidden = false;
        input.classList.remove("shake");
        void input.offsetWidth;
        input.classList.add("shake");
        input.focus();
        input.select();
        playSound("incorrect");
      } else {
        errorLine.dataset.source = "action";
        errorLine.textContent = message;
      }
      if (error.status === 409 && !/الإجابة الصحيحة/.test(error.message)) void sync();
    }
    return;
  }
  if (kind === "seat") {
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    seatAttempted = true;
    await seatDisplayHost(new FormData(form).get("name"));
    return;
  }
  const data = new FormData(form);
  const errorElement = form.querySelector("[data-error]");
  errorElement.textContent = "";
  if (kind === "join-code") {
    const code = asciiDigits(data.get("code")).replace(/\D/g, "");
    if (!codePattern.test(code)) errorElement.textContent = "اكتب رمز الغرفة المكوّن من 6 أرقام.";
    else window.location.assign(`/room/${code}`);
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  try {
    if (kind === "create") {
      const picked = data.getAll("category");
      if (!picked.length) throw Object.assign(new Error("اختر فئة واحدة على الأقل."), { status: 400 });
      const mode = form.dataset.mode;
      if (data.get("name") !== null) rememberName(data.get("name"));
      const created = await api("/api/rooms", {
        mode, name: data.get("name"), format: data.get("format") ?? "classic", rounds: Number(data.get("rounds")), seconds: Number(data.get("seconds")), categories: picked,
        history: questionHistory(),
        ...(mode === "bots" ? { bots: Number(data.get("bots")), difficulty: data.get("difficulty") } : {})
      });
      sessionStorage.setItem(`tahaddi-alrabaa:${created.room.code}`, created.token);
      leaving = true;
      window.location.assign(`/room/${created.room.code}`);
    } else {
      const joined = await api(`/api/rooms/${roomCode}/join`, { name: data.get("name"), history: questionHistory() });
      rememberName(data.get("name"));
      token = joined.token;
      sessionStorage.setItem(storageKey, token);
      renderRoom(joined.room);
      playSound("join");
    }
  } catch (error) {
    errorElement.textContent = error.status ? error.message : "تعذّر الاتصال. جرّب مرة ثانية.";
  } finally { if (!leaving) button.disabled = false; }
});

updateSoundButton();
if (roomCode && codePattern.test(roomCode)) {
  if (token) { showStatus("جاري تحميل الغرفة…", true); void sync(); }
  else showJoinPage();
  setInterval(sync, 1000);
  setInterval(updateTimer, 150);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void sync(); });
} else showHome();
