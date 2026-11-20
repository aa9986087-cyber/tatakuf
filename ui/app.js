import qrcode from "/qrcode.js?v=3";
import { playSound, soundEnabled, toggleSound, unlockSound } from "/sound.js?v=3";

const categories = {
  general: { title: "معلومات عامة", icon: "✦" },
  science: { title: "علوم", icon: "⚗" },
  sports: { title: "رياضة", icon: "⚽" },
  places: { title: "جغرافيا", icon: "◉" },
  history: { title: "تاريخ", icon: "⌛" },
  culture: { title: "ثقافة وفنون", icon: "♫" }
};
const modes = {
  screen: { title: "شاشة المجلس", choice: "أنشئ عرض المجلس", description: "الأسئلة على الشاشة الكبيرة، وأنت تجاوب منها وربعك من جوالاتهم." },
  online: { title: "لعب عن بُعد", choice: "أنشئ غرفة أونلاين", description: "شارك رابط الغرفة وتحدَّ ربعك من أي مكان، مع شات للغرفة." },
  bots: { title: "تحدّي البوتات", choice: "جهّز خصومك", description: "اختر عدد الخصوم الآليين وصعوبتهم وتحدّاهم لحالك." }
};
const phases = {
  lobby: "غرفة التحدّي", select: "اختيار الفئة", question: "وقت السؤال",
  reveal: "نتيجة الجولة", finale: "لحظة الحسم", finished: "النتيجة النهائية"
};
const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const dialogContent = document.querySelector("#dialog-content");
const toast = document.querySelector("#toast");
const number = new Intl.NumberFormat("ar-KW-u-nu-arab", { useGrouping: false });
const format = (value) => number.format(value);
const codePattern = /^[23456789A-HJ-NP-Z]{6}$/;
const roomCode = window.location.pathname.split("/")[2]?.toUpperCase();
const storageKey = `tahaddi-alrabaa:${roomCode}`;
const historyKey = "tatakuf-question-history";
const nameKey = "tatakuf-player-name";
const letters = ["أ", "ب", "ج", "د"];
let room;
let token = roomCode ? sessionStorage.getItem(storageKey) : null;
let clockOffset = 0;
let pending = false;
let reading = false;
let toastTimeout;
let lastTick;
let stageKey;
let chatKey;
let seenQuestions = readHistory();
let seatAttempted = false;
let seatError = "";

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

function remainingFor(category) {
  let remainder = bankCounts[category];
  for (let index = 0; index < bankCounts[category]; index += 1) {
    if (seenQuestions.has(category + "-" + index)) remainder -= 1;
  }
  return remainder;
}

function updateBankCount(form) {
  const picked = new FormData(form).getAll("category");
  const remaining = picked.reduce((sum, category) => sum + remainingFor(category), 0);
  form.querySelector("[data-bank-count]").textContent = `${format(remaining)} سؤال جديد في الفئات المختارة`;
}

function showHome() {
  app.innerHTML = `
    <section class="hero stage-in" aria-labelledby="home-title">
      <div class="hero-copy">
        <p class="hero-kicker">${format(Object.values(bankCounts).reduce((total, count) => total + count, 0))} سؤال للتحدّي</p>
        <h1 id="home-title">لعبة <strong>التكاتف</strong></h1>
        <p class="lead">جمع ربعك على سؤال واحد. اختاروا الفئة وشوفوا من يجيبها.</p>
        ${actionButton("انضم برمز الغرفة", "join", "outline")}
      </div>
      <div class="hero-art" aria-hidden="true"><img src="/hero.webp?v=3" width="900" height="600" alt="" fetchpriority="high"></div>
    </section>
    <section class="modes" aria-labelledby="modes-title">
      <div class="section-heading"><h2 id="modes-title">اختَر طريقة اللعب</h2></div>
      <div class="mode-grid">${Object.entries(modes).map(([id, mode]) => `
        <button type="button" class="mode-card mode-${id}" data-action="create" data-mode="${id}">
          <span class="mode-icon" aria-hidden="true"></span><strong>${mode.title}</strong>
          <span>${mode.description}</span><span class="mode-detail">${mode.choice}</span>
        </button>`).join("")}</div>
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

function openCreate(mode) {
  seenQuestions = new Set([...readHistory(), ...seenQuestions]);
  openDialog(modes[mode].title, modes[mode].description, `
    <form class="setup-form" data-form="create" data-mode="${mode}">
      ${nameField()}
      ${mode === "screen" ? '<p class="muted">تدخل لاعبًا وتجاوب من نفس الشاشة، ويكفي انضمام لاعب واحد معك لبدء الجلسة.</p>' : ""}
      ${mode === "bots" ? `<div class="form-row">
        <label class="field">عدد البوتات<select name="bots">${Array.from({ length: 7 }, (_, index) => {
          const count = index + 1;
          return `<option value="${count}" ${count === 2 ? "selected" : ""}>${format(count)}</option>`;
        }).join("")}</select></label>
        <label class="field">مستوى البوتات<select name="difficulty"><option value="easy">سهل</option><option value="normal" selected>متوسط</option><option value="hard">صعب</option></select></label>
      </div>` : ""}
      <div class="form-row">
        <label class="field">عدد الجولات<select name="rounds"><option value="5">٥ جولات</option><option value="10">١٠ جولات</option><option value="20">٢٠ جولة</option></select></label>
        <label class="field">وقت الإجابة<select name="seconds"><option value="15">١٥ ثانية</option><option value="20" selected>٢٠ ثانية</option><option value="30">٣٠ ثانية</option></select></label>
      </div>
      <fieldset><legend>الفئات</legend><div class="check-grid">${Object.entries(categories).map(([id, item]) =>
        `<label class="check-category"><input type="checkbox" name="category" value="${id}" checked>${item.title}</label>`
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
        autocapitalize="characters" autocomplete="off" placeholder="XM42KA" dir="ltr"></label>
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
  }).catch(() => {});
}

function showStatus(message, loading = false) {
  app.innerHTML = `<section class="game panel stage-in"><h1>لعبة التكاتف</h1><p>${e(message)}</p>
    ${loading ? "" : `<div class="actions">${actionButton("إعادة المحاولة", "retry")}<a class="btn outline" href="/">الرئيسية</a></div>`}</section>`;
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
  ctx.fillStyle = "#0a1711";
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
  return `<section class="panel room-invite${room.display ? " with-qr" : ""}">
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
  <section class="panel"><h2>اللاعبون <span class="muted">(${format(count)}/٨)</span></h2>
    <div class="settings-line"><span>${format(settings.rounds)} جولات</span><span>${format(settings.seconds)} ثانية للسؤال</span>
      ${room.mode === "bots" ? `<span>${{ easy:"سهل", normal:"متوسط", hard:"صعب" }[settings.difficulty]}</span>` : ""}</div>
    ${count ? playersList(room.players, false, false, room.display) : `<p class="muted">بانتظار أول لاعب.</p>`}
    ${!host ? `<p class="muted">تبدأ المباراة لما يكون الكل جاهز.</p>` : ""}
  </section>`;
}

function timer() {
  return `<div class="timer-row"><span class="timer-value" data-timer></span>
    <div class="timer-track" aria-hidden="true"><span class="timer-fill"></span></div></div>`;
}

function selection() {
  const isTurn = room.chooserId === room.playerId;
  const chooser = room.players.find((player) => player.id === room.chooserId);
  return `<section class="panel">
    ${timer()}<h2>${isTurn ? "دورك تختار الفئة" : `الدور على <bdi>${e(chooser.name)}</bdi>`}</h2>
    <div class="category-grid">${room.available.map((id) => `<button type="button" class="category cat-${id}" data-action="category"
      data-category="${id}" ${!isTurn || pending ? "disabled" : ""}>
      <span class="symbol" aria-hidden="true">${categories[id].icon}</span>${categories[id].title}</button>`).join("")}</div>
  </section>${scores()}`;
}

function scores() {
  return `<section class="panel"><h2>النقاط</h2>${playersList([...room.players].sort((a, b) => b.score - a.score), true, false, room.display)}</section>`;
}

function questionView() {
  const item = room.question;
  const answered = room.yourAnswer !== null;
  const progress = `${format(room.answeredCount)} من ${format(room.players.length)} جاوبوا`;
  return `<section class="panel question-card">
    ${timer()}
    <p class="eyebrow">${categories[item.category].title}</p>
    <h2 dir="auto">${item.prompt ? e(item.prompt) : "شوف السؤال على الشاشة"}</h2>
    ${item.image ? `<img class="question-image" src="/questions/${e(item.image.file)}" alt="${e(item.image.alt)}" width="750" height="500">` : ""}
  </section>
  <div class="options" aria-label="خيارات الإجابة">${item.options.map((option, index) => {
    // The shared screen never highlights the host's pick so the room cannot see it.
    const selected = !room.display && index === room.yourAnswer;
    const style = selected ? "selected" : "";
    const content = `<span class="option-mark" aria-hidden="true">${letters[index]}</span><bdi>${e(option)}</bdi>`;
    if (room.spectator) return `<div class="option">${content}</div>`;
    return `<button type="button" class="option ${style}" data-action="answer" data-option="${index}"
      ${answered || pending ? "disabled" : ""}>${content}</button>`;
  }).join("")}</div>
  <section class="panel feedback">
    <h2>${room.spectator ? "الإجابات من الجوالات" : answered ? "تم تسجيل إجابتك" : "اختر إجابة واحدة"}</h2>
    <p class="muted">${progress}</p>
  </section>${scores()}`;
}

function leaderboard(order, title) {
  let rank = 1;
  return `<section class="panel leaderboard"><h2>${title}</h2>
    <ol class="rank-list">${order.map((player, index) => {
      if (index && player.score !== order[index - 1].score) rank = index + 1;
      return `<li class="rank-row rank-${rank}" style="--stagger:${index * 65}ms">
        <span class="rank-medal" aria-label="المركز ${format(rank)}">${format(rank)}</span>
        <span class="rank-name"><bdi>${e(player.name)}</bdi>${player.id === room.playerId ? '<small>أنت</small>' : ""}</span>
        ${player.gained ? '<strong class="round-gain">+١</strong>' : ""}
        <span class="rank-score">${format(player.score)} <small>نقطة</small></span>
      </li>`;
    }).join("")}</ol></section>`;
}

function roundResults() {
  if (room.round === room.settings.rounds) return finale();
  const item = room.question;
  const correct = room.yourAnswer === item.correctIndex;
  const outcome = room.display ? "الإجابة الصحيحة" : room.yourAnswer === null ? "انتهى وقت الإجابة" : correct ? "إجابة صحيحة" : "إجابة غير صحيحة";
  const order = [...room.players].sort((a, b) => b.score - a.score);
  return `<section class="panel round-answer">
    <div><p class="eyebrow">${outcome}</p><h2><bdi>${e(item.options[item.correctIndex])}</bdi></h2></div>
    <div><p class="muted">الجولة التالية تلقائيًا</p>${timer()}</div>
  </section>${leaderboard(order, "ترتيب اللاعبين")}`;
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
  const online = room.mode === "online";
  app.innerHTML = `<section class="game mode-${room.mode}" ${room.display ? "data-display" : ""}>
    <div class="game-head"><div><p class="mode-chip">${modes[room.mode].title}</p><h1 tabindex="-1" id="game-title"></h1><p id="round-label" class="muted"></p></div>
      ${room.mode === "bots" ? "" : roomBadge(room.code)}</div>
    <p id="room-message" class="error" role="alert"></p>
    <div class="game-layout${online ? " has-chat" : ""}">
      <div class="game-main"></div>
      ${online ? `<aside class="panel chat" aria-labelledby="chat-title">
        <div class="chat-head"><h2 id="chat-title">شات الغرفة</h2></div>
        <div class="chat-log" role="log" aria-label="رسائل الغرفة"></div>
        <form class="chat-form" data-form="chat">
          <input name="message" aria-label="رسالة للشات" placeholder="اكتب رسالة…" maxlength="240" autocomplete="off" required dir="auto">
          <button class="btn outline" type="submit">إرسال</button>
        </form><p class="error" data-chat-error role="alert"></p>
      </aside>` : ""}
    </div>
  </section>`;
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
}

function playPhaseSound(previous) {
  if (!previous) return;
  if (room.phase === "reveal") {
    const key = room.display || room.yourAnswer === room.question.correctIndex ? "correct" : "incorrect";
    playSound(key);
  } else playSound({ lobby:"join", select:"select", question:"question", finale:"finale", finished:"finished" }[room.phase]);
}

function renderRoom(next, force = false) {
  if (room && next.revision < room.revision) return;
  const previous = room;
  const phaseChanged = !previous || previous.phase !== next.phase || previous.round !== next.round;
  room = next;
  rememberQuestions(next.seenQuestions);
  clockOffset = room.now - Date.now();
  if (!app.querySelector(".game-main")) {
    stageKey = chatKey = undefined;
    createRoomShell();
  }
  const body = app.querySelector(".game-main");
  const { now, chat, revision, seenQuestions: history, ...stageState } = room;
  const key = JSON.stringify(stageState);
  if (stageKey !== key || force) {
    stageKey = key;
    const active = document.activeElement;
    const focus = body.contains(active) && active.dataset.action;
    const view = { lobby, select:selection, question:questionView, reveal:roundResults, finale, finished }[room.phase]();
    body.innerHTML = view;
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
  const label = app.querySelector("[data-timer]");
  const fill = app.querySelector(".timer-fill");
  if (!label || !fill) return;
  const remaining = Math.max(0, room.deadline - (Date.now() + clockOffset));
  const seconds = Math.ceil(remaining / 1000);
  const chooser = room.players.find((player) => player.id === room.chooserId);
  const duration = room.phase === "finale" ? 5500 : room.phase === "reveal" ? 5000
    : room.phase === "select" ? (chooser?.bot ? 2200 : 15000) : room.settings.seconds * 1000;
  const text = `${format(seconds)} ثانية`;
  if (label.textContent !== text) label.textContent = text;
  fill.style.width = `${Math.min(100, remaining / duration * 100)}%`;
  fill.classList.toggle("late", room.phase === "question" && seconds <= 3);
  if (room.phase === "question" && seconds >= 1 && seconds <= 3 && lastTick !== seconds && room.yourAnswer === null) {
    lastTick = seconds;
    playSound("tick");
  }
}

async function api(path, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers, signal: AbortSignal.timeout(10000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
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
    if (error.status === 401) {
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
  const errorLine = app.querySelector("#room-message");
  errorLine.textContent = "";
  try {
    const previous = room;
    const data = await api(`/api/rooms/${roomCode}/${action}`, inputs[action]);
    pending = false;
    renderRoom(data.room, true);
    if (action === "answer" && previous.phase === room.phase) playSound("locked");
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
document.addEventListener("change", (event) => {
  if (event.target.name === "category" && event.target.form?.dataset.form === "create") updateBankCount(event.target.form);
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
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
    const code = data.get("code").trim().toUpperCase();
    if (!codePattern.test(code)) errorElement.textContent = "اكتب رمز الغرفة المكوّن من ٦ خانات.";
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
        mode, name: data.get("name"), rounds: Number(data.get("rounds")), seconds: Number(data.get("seconds")), categories: picked,
        history: questionHistory(),
        ...(mode === "bots" ? { bots: Number(data.get("bots")), difficulty: data.get("difficulty") } : {})
      });
      sessionStorage.setItem(`tahaddi-alrabaa:${created.room.code}`, created.token);
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
  } finally { button.disabled = false; }
});

updateSoundButton();
if (roomCode && codePattern.test(roomCode)) {
  if (token) { showStatus("جاري تحميل الغرفة…", true); void sync(); }
  else showJoinPage();
  setInterval(sync, 1000);
  setInterval(updateTimer, 150);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void sync(); });
} else showHome();
