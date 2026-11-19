const categories = {
  general: { title: "معلومات عامة", icon: "✦" },
  science: { title: "علوم", icon: "⚗" },
  sports: { title: "رياضة", icon: "⚽" },
  places: { title: "جغرافيا", icon: "◉" },
  history: { title: "تاريخ", icon: "⌛" },
  culture: { title: "ثقافة وفنون", icon: "♫" }
};

const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const dialogContent = document.querySelector("#dialog-content");
const toast = document.querySelector("#toast");
const number = new Intl.NumberFormat("ar-KW-u-nu-arab", { useGrouping: false });
const roomCodePattern = /^[23456789A-HJ-NP-Z]{6}$/;
const roomCode = window.location.pathname.split("/")[2]?.toUpperCase();
const storageKey = `tahaddi-alrabaa:${roomCode}`;
const letters = ["أ", "ب", "ج", "د"];
let room;
let token = roomCode ? sessionStorage.getItem(storageKey) : null;
let roomKey;
let clockOffset = 0;
let pending = false;
let reading = false;
let toastTimeout;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function categoryCard(id, button = false, enabled = true) {
  const { title, icon } = categories[id];
  const content = `<span class="symbol" aria-hidden="true">${icon}</span><span>${title}</span>`;
  const className = `category cat-${id}`;
  return button
    ? `<button class="${className}" data-action="category" data-category="${id}" ${enabled ? "" : "disabled"}>${content}</button>`
    : `<div class="${className}">${content}</div>`;
}

function showHome() {
  app.innerHTML = `
    <section class="hero" aria-labelledby="home-title">
      <div class="hero-copy">
        <p class="hero-meta">لعبة جماعية من لاعبين إلى ٨</p>
        <h1 id="home-title">تحدّي <span>الربع</span></h1>
        <p class="lead">اجمع ربعك، اختاروا الفئة، وشوفوا من أكثر واحد يعرف.</p>
        <div class="actions">
          <button class="btn primary" data-action="create"><span class="btn-icon" aria-hidden="true">+</span> إنشاء غرفة</button>
          <button class="btn secondary" data-action="join">انضمام لغرفة</button>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true"><img src="/hero.webp" width="840" height="560" alt="" fetchpriority="high"></div>
    </section>
    <section class="home-categories" aria-labelledby="categories-title">
      <div class="section-head"><h2 id="categories-title">فئات الأسئلة</h2><p>٦ فئات للتحدّي</p></div>
      <div class="category-list">${Object.keys(categories).map((id) => categoryCard(id)).join("")}</div>
    </section>`;
}

function showJoinPage(error = "") {
  app.innerHTML = `
    <section class="game">
      <div class="game-heading"><div><h1>انضمام لغرفة</h1><p>ادخل باسمك وابدأ التحدّي مع ربعك.</p></div>${roomBadge(roomCode)}</div>
      <div class="panel">
        <form data-form="join-link">
          ${nameField()}
          <p class="error" data-error role="alert">${escapeHtml(error)}</p>
          <div class="actions"><button class="btn primary" type="submit">ادخل الغرفة</button><a class="btn outline" href="/">الرئيسية</a></div>
        </form>
      </div>
    </section>`;
}

function nameField() {
  return `<label class="field">اسمك في اللعبة<input name="name" required maxlength="24" placeholder="مثال، أبو ناصر" autocomplete="nickname" dir="auto"></label>`;
}

function showDialog(kind) {
  const content = {
    create: {
      title: "إنشاء غرفة",
      description: "اختَر إعدادات التحدّي، وبعدها شارك رابط الغرفة.",
      html: `<form data-form="create">
        ${nameField()}
        <div class="form-row">
          <label class="field">عدد الجولات<select name="rounds"><option value="5">٥ جولات</option><option value="10">١٠ جولات</option></select></label>
          <label class="field">وقت الإجابة<select name="seconds"><option value="15">١٥ ثانية</option><option value="20" selected>٢٠ ثانية</option><option value="30">٣٠ ثانية</option></select></label>
        </div>
        <fieldset><legend>الفئات</legend><div class="form-categories">${Object.entries(categories).map(([id, item]) =>
          `<label class="check-category"><input type="checkbox" name="category" value="${id}" checked>${item.title}</label>`
        ).join("")}</div></fieldset>
        <p class="error" data-error role="alert"></p>
        <button class="btn primary" type="submit">إنشاء الغرفة</button>
      </form>`
    },
    join: {
      title: "انضمام لغرفة",
      description: "اكتب الرمز اللي أرسله لك المضيف.",
      html: `<form data-form="join-code">
        <label class="field">رمز الغرفة<input class="code-input" name="code" required minlength="6" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="مثال،   XM42KA" dir="ltr"></label>
        <p class="error" data-error role="alert"></p>
        <button class="btn primary" type="submit">متابعة</button>
      </form>`
    },
    help: {
      title: "طريقة اللعب",
      description: "",
      html: `<ol class="instructions">
        <li>أنشئ غرفة واختر الفئات، ثم شارك الرابط مع لاعب واحد على الأقل.</li>
        <li>في كل جولة يختار لاعب فئة، ويجاوب الجميع عن السؤال نفسه.</li>
        <li>كل إجابة صحيحة بنقطة. يفوز صاحب أعلى نتيجة، وقد يتعادل أكثر من لاعب.</li>
      </ol>`
    }
  }[kind];

  dialogContent.innerHTML = `<div class="dialog-head">
    <div><h2 id="dialog-title">${content.title}</h2>${content.description ? `<p>${content.description}</p>` : ""}</div>
    <button class="quiet close" type="button" data-action="close" aria-label="إغلاق">×</button>
  </div>${content.html}`;
  dialog.showModal();
  dialog.querySelector("input")?.focus();
}

function roomBadge(code) {
  return `<div class="room-id">رمز الغرفة<strong dir="ltr">${escapeHtml(code)}</strong></div>`;
}

function showStatus(message) {
  app.innerHTML = `<section class="game panel"><h1>تحدّي الربع</h1><p>${escapeHtml(message)}</p>
    <div class="actions"><button class="btn primary" data-action="retry">إعادة المحاولة</button><a class="btn outline" href="/">الرئيسية</a></div></section>`;
}

function playersList(order, showScore, showRank = false) {
  let rank = 1;
  return `<ol class="players">${order.map((player, index) => {
    if (index && player.score !== order[index - 1].score) rank = index + 1;
    const tags = [player.id === room.hostId ? "المضيف" : "", player.id === room.playerId ? "أنت" : ""].filter(Boolean);
    const avatar = showRank ? number.format(rank) : [...player.name][0];
    return `<li class="player"><span class="player-name"><span class="avatar" aria-hidden="true">${escapeHtml(avatar)}</span>
      <bdi>${escapeHtml(player.name)}</bdi>${tags.length ? `<small>${tags.join(" · ")}</small>` : ""}</span>
      ${showScore ? `<span class="score">${number.format(player.score)} نقطة</span>` : ""}</li>`;
  }).join("")}</ol>`;
}

function lobby() {
  const host = room.playerId === room.hostId;
  return `<div class="waiting">
    <section class="panel invite">
      <h2>ادعُ ربعك</h2>
      <p class="muted">ارسل الرابط أو رمز الغرفة. تقدرون تبدأون وأنتم لاعبين.</p>
      <div class="actions"><button class="btn primary" data-action="copy">انسخ رابط الدعوة</button></div>
    </section>
    <section class="panel">
      <h2>اللاعبون <span class="muted">(${number.format(room.players.length)}/٨)</span></h2>
      ${playersList(room.players, false)}
    </section>
  </div>
  <div class="panel room-actions">
    <p class="summary-line">${number.format(room.settings.rounds)} جولات · ${number.format(room.settings.seconds)} ثانية للسؤال</p>
    <p class="summary-line">${room.settings.categories.map((id) => categories[id]?.title).filter(Boolean).join("، ")}</p>
    ${host
      ? `<button class="btn primary" data-action="start" ${room.players.length < 2 ? "disabled" : ""}>ابدأ المباراة</button>`
      : `<p class="muted">بانتظار المضيف يبدأ المباراة.</p>`}
  </div>`;
}

function timer() {
  return `<div class="timer-row"><span class="timer" data-timer></span><div class="timer-track" aria-hidden="true"><span class="timer-fill"></span></div></div>`;
}

function selection() {
  const turn = room.playerId === room.chooserId;
  const chooser = room.players.find((player) => player.id === room.chooserId);
  return `<section class="panel">
    ${timer()}
    <h2>${turn ? "دورك تختار الفئة" : `بانتظار <bdi>${escapeHtml(chooser.name)}</bdi> يختار الفئة`}</h2>
    <div class="category-list game-categories">${room.available.map((id) => categoryCard(id, true, turn)).join("")}</div>
  </section>${scores()}`;
}

function scores() {
  return `<section class="panel"><h2>النقاط</h2>${playersList([...room.players].sort((a, b) => b.score - a.score), true)}</section>`;
}

function questionView() {
  const question = room.question;
  const revealed = room.phase === "reveal";
  const answered = room.yourAnswer !== null;
  const correct = room.yourAnswer === question.correctIndex;
  const outcome = !answered ? "ما سجّلت إجابة في هالجولة." : correct ? "إجابة صحيحة! حصلت على نقطة." : "إجابتك غير صحيحة.";
  return `<section class="panel question-card">
    ${revealed ? "" : timer()}
    <p class="category-label">${categories[question.category]?.title ?? ""}</p>
    <h2 dir="auto">${escapeHtml(question.prompt)}</h2>
  </section>
  <div class="options" aria-label="خيارات الإجابة">${question.options.map((option, index) => {
    const isCorrect = revealed && question.correctIndex === index;
    const selected = index === room.yourAnswer;
    const style = isCorrect ? "correct" : selected ? (revealed ? "incorrect" : "selected") : "";
    const mark = isCorrect ? "✓" : selected && revealed ? "×" : letters[index];
    return `<button class="option ${style}" data-action="answer" data-option="${index}" ${answered || revealed ? "disabled" : ""}>
      <span class="option-mark" aria-hidden="true">${mark}</span><bdi>${escapeHtml(option)}</bdi>
    </button>`;
  }).join("")}</div>
  <section class="panel">
    ${revealed ? `
        <h2>${outcome}</h2>
        <p class="muted">الإجابة الصحيحة هي <strong>${escapeHtml(question.options[question.correctIndex])}</strong>.</p>
        ${room.playerId === room.hostId
          ? `<button class="btn primary" data-action="next">${room.round === room.settings.rounds ? "شوف النتيجة النهائية" : "الجولة التالية"}</button>`
          : `<p class="muted">${room.round === room.settings.rounds ? "بانتظار المضيف يعرض النتيجة النهائية." : "بانتظار المضيف يبدأ الجولة التالية."}</p>`}
      ` : `<h2>${answered ? "تم تسجيل إجابتك" : "اختر إجابة واحدة"}</h2>
      <p class="muted">جاوب ${number.format(room.answeredCount)} من ${number.format(room.players.length)} لاعبين.</p>`}
  </section>${scores()}`;
}

function finished() {
  const order = [...room.players].sort((a, b) => b.score - a.score);
  const winners = order.filter((player) => player.score === order[0].score);
  const headline = winners.length > 1 ? "انتهى التحدّي بالتعادل" : `الفائز <bdi>${escapeHtml(winners[0].name)}</bdi>`;
  return `<section class="panel result-panel"><h2>${headline}</h2>
    ${playersList(order, true, true)}
    <div class="actions room-actions">
      ${room.playerId === room.hostId ? '<button class="btn primary" data-action="rematch">العبوا مرة ثانية</button>' : ""}
      <a class="btn outline" href="/">العودة للرئيسية</a>
    </div>
  </section>`;
}

function renderRoom(nextRoom, force = false) {
  if (room && nextRoom.revision < room.revision) return;
  const previousPhase = room?.phase;
  const previousRound = room?.round;
  const activeAction = document.activeElement?.dataset.action;
  const activeCategory = document.activeElement?.dataset.category;
  const activeOption = document.activeElement?.dataset.option;
  room = nextRoom;
  clockOffset = room.now - Date.now();
  const { now, ...roomState } = room;
  const nextKey = JSON.stringify(roomState);
  if (nextKey === roomKey && !force) return;
  roomKey = nextKey;

  const titles = { lobby: "غرفة التحدّي", select: "اختيار الفئة", question: "وقت السؤال", reveal: "نتيجة الجولة", finished: "النتيجة النهائية" };
  const content = { lobby, select: selection, question: questionView, reveal: questionView, finished }[room.phase]();
  const roundLabel = room.round ? `<p>الجولة ${number.format(room.round)} من ${number.format(room.settings.rounds)}</p>` : "";
  app.innerHTML = `<section class="game">
    <div class="game-heading"><div><h1 tabindex="-1">${titles[room.phase]}</h1>${roundLabel}</div>${roomBadge(room.code)}</div>
    <p class="error room-message" id="room-message" role="alert"></p>${content}
  </section>`;
  if (pending) app.querySelectorAll("button[data-action]").forEach((button) => {
    if (["category", "answer", "start", "next", "rematch"].includes(button.dataset.action)) button.disabled = true;
  });
  if (!dialog.open && (previousPhase !== room.phase || previousRound !== room.round)) app.querySelector("h1").focus({ preventScroll: true });
  else if (activeAction) {
    [...app.querySelectorAll("button[data-action]")].find((button) =>
      !button.disabled && button.dataset.action === activeAction &&
      button.dataset.category === activeCategory && button.dataset.option === activeOption)?.focus({ preventScroll: true });
  }
  updateTimer();
}

function updateTimer() {
  if (!room?.deadline) return;
  const timeLabel = app.querySelector("[data-timer]");
  const fill = app.querySelector(".timer-fill");
  if (!timeLabel || !fill) return;
  const remaining = Math.max(0, room.deadline - (Date.now() + clockOffset));
  const duration = room.phase === "select" ? 15_000 : room.settings.seconds * 1000;
  timeLabel.textContent = `${number.format(Math.ceil(remaining / 1000))} ثانية`;
  fill.style.width = `${Math.min(100, remaining / duration * 100)}%`;
  fill.classList.toggle("late", remaining <= 5000);
}

async function api(path, body, playerToken = token) {
  const headers = {};
  if (playerToken) headers.Authorization = `Bearer ${playerToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    signal: AbortSignal.timeout(10_000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error ?? "تعذّر الاتصال باللعبة. جرّب مرة ثانية."), { status: response.status });
  }
  return data;
}

function showToast(message) {
  toast.textContent = message;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.textContent = ""; }, 2600);
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
      token = null;
      room = null;
      sessionStorage.removeItem(storageKey);
      showJoinPage(error.message);
    } else if (error.status === 404 || !room) {
      room = null;
      roomKey = undefined;
      showStatus(error.status ? error.message : "تعذّر الاتصال. جرّب مرة ثانية.");
    } else {
      const message = app.querySelector("#room-message");
      if (message) {
        message.dataset.source = "network";
        message.textContent = "انقطع الاتصال. نحاول نرجّعك للمباراة.";
      }
    }
  } finally {
    reading = false;
  }
}

async function gameAction(action, button) {
  if (pending) return;
  const inputs = {
    start: {},
    rematch: {},
    next: { round: room.round },
    category: { round: room.round, category: button.dataset.category },
    answer: { questionId: room.question?.id, option: Number(button.dataset.option) }
  };
  pending = true;
  button.disabled = true;
  try {
    const data = await api(`/api/rooms/${roomCode}/${action}`, inputs[action]);
    pending = false;
    renderRoom(data.room, true);
  } catch (error) {
    pending = false;
    renderRoom(room, true);
    const message = app.querySelector("#room-message");
    message.dataset.source = "action";
    message.textContent = error.status ? error.message : "تعذّر الاتصال. جرّب مرة ثانية.";
    if (error.status === 409) void sync();
  }
}

async function copyInvitation() {
  const url = new URL(`/room/${roomCode}`, window.location.origin).href;
  try {
    await navigator.clipboard.writeText(url);
    showToast("تم نسخ رابط الدعوة");
  } catch {
    dialogContent.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">رابط الدعوة</h2>
      <button class="quiet close" type="button" data-action="close" aria-label="إغلاق">×</button></div>
      <input value="${escapeHtml(url)}" aria-label="رابط الدعوة" dir="ltr" readonly>`;
    dialog.showModal();
    dialog.querySelector("input").select();
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (["help", "create", "join"].includes(action)) showDialog(action);
  else if (action === "close") dialog.close();
  else if (action === "copy") void copyInvitation();
  else if (action === "retry") void sync();
  else void gameAction(action, button);
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  const kind = form.dataset.form;
  if (!kind) return;
  event.preventDefault();
  const data = new FormData(form);
  const errorElement = form.querySelector("[data-error]");
  errorElement.textContent = "";
  if (kind === "join-code") {
    const code = data.get("code").trim().toUpperCase();
    if (!roomCodePattern.test(code)) errorElement.textContent = "تأكد من كتابة رمز الغرفة المكوّن من ٦ خانات.";
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
      const created = await api("/api/rooms", {
        name: data.get("name"), rounds: Number(data.get("rounds")),
        seconds: Number(data.get("seconds")), categories: picked
      });
      sessionStorage.setItem(`tahaddi-alrabaa:${created.room.code}`, created.token);
      window.location.assign(`/room/${created.room.code}`);
    } else {
      const joined = await api(`/api/rooms/${roomCode}/join`, { name: data.get("name") });
      token = joined.token;
      sessionStorage.setItem(storageKey, token);
      renderRoom(joined.room);
    }
  } catch (error) {
    errorElement.textContent = error.status ? error.message : "تعذّر الاتصال. جرّب مرة ثانية.";
  } finally {
    button.disabled = false;
  }
});

if (roomCode && roomCodePattern.test(roomCode)) {
  if (token) {
    app.innerHTML = `<section class="game panel"><h1>جاري تحميل الغرفة…</h1></section>`;
    void sync();
  } else showJoinPage();
  setInterval(sync, 1300);
  setInterval(updateTimer, 200);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void sync(); });
} else showHome();
