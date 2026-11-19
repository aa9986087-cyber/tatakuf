const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const day = 86_400_000;
const categoryTime = 15_000;
const maxPlayers = 8;
const revealTime = 5_000;
const finaleTime = 5_500;
const botTurnTime = 2_200;
const modes = ["screen", "online", "bots"];
const botNames = ["برق", "نجم", "لمعة", "صقر", "رعد", "شعلة", "وميض"];
const botAccuracy = { easy: 0.36, normal: 0.60, hard: 0.83 };

class GameError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function randomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => codeAlphabet[value % codeAlphabet.length]).join("");
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffled(items) {
  const values = [...items];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

function normalizeName(value) {
  if (typeof value !== "string") throw new GameError(400, "اكتب اسمك في اللعبة.");
  const name = value.trim().replace(/\s+/gu, " ");
  if (!name || [...name].length > 24 || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new GameError(400, "اكتب اسمًا من ١ إلى ٢٤ حرفًا.");
  }
  return name;
}

function makePlayer(name) {
  return { id: crypto.randomUUID(), token: crypto.randomUUID(), name, score: 0 };
}

function hostOf(room) {
  return room.screenHost ?? room.players[0];
}

function getSettings(input) {
  const { rounds, seconds, categories } = input;
  if (![5, 10, 20].includes(rounds) || ![15, 20, 30].includes(seconds) ||
      !Array.isArray(categories) || !categories.length || categories.length > Object.keys(questions).length ||
      new Set(categories).size !== categories.length ||
      categories.some((id) => typeof id !== "string" || !Object.hasOwn(questions, id))) {
    throw new GameError(400, "اختر فئة واحدة على الأقل وتحقق من إعدادات الجولة.");
  }
  return { rounds, seconds, categories };
}

function startSelection(room, now) {
  room.round += 1;
  room.phase = "select";
  room.deadline = now + (chooserFor(room).bot ? botTurnTime : categoryTime);
  room.question = null;
  room.answers = {};
  room.botAnswers = [];
}

function chooserFor(room) {
  return room.players[(room.round - 1) % room.players.length];
}

function availableCategories(room) {
  const seen = new Set(room.seen);
  return room.settings.categories.filter((category) =>
    questions[category].some((_, index) => !seen.has(category + "-" + index))
  );
}

function addHistory(room, packedHistory) {
  if (packedHistory === undefined) return;
  if (!packedHistory || typeof packedHistory !== "object" || Array.isArray(packedHistory)) {
    throw new GameError(400, "تعذّر قراءة سجل الأسئلة.");
  }
  const seen = new Set(room.seen);
  for (const category of room.settings.categories) {
    const encoded = packedHistory[category];
    if (encoded === undefined) continue;
    const limit = questions[category].length;
    if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) ||
        encoded.length % 4 !== 0 || encoded.length > Math.ceil(limit / 24) * 4) {
      throw new GameError(400, "تعذّر قراءة سجل الأسئلة.");
    }
    const bytes = atob(encoded);
    for (let index = 0; index < Math.min(limit, bytes.length * 8); index += 1) {
      if (bytes.charCodeAt(index >> 3) & (1 << (index % 8))) seen.add(category + "-" + index);
    }
  }
  room.seen = [...seen];
}

function requireEnoughQuestions(room) {
  const seen = new Set(room.seen);
  let remaining = 0;
  for (const category of room.settings.categories) {
    remaining += questions[category].filter((_, index) => !seen.has(category + "-" + index)).length;
  }
  if (remaining < room.settings.rounds) {
    throw new GameError(409, "الأسئلة الجديدة ما تكفي للجولات المختارة. جرّب فئات أكثر أو جولات أقل.");
  }
}

function startQuestion(room, category, now) {
  const seen = new Set(room.seen);
  const eligible = questions[category].flatMap((_, index) => seen.has(category + "-" + index) ? [] : [index]);
  const visual = room.round === 1 || room.round % 5 === 0
    ? eligible.filter((index) => questions[category][index][5])
    : [];
  const index = randomItem(visual.length ? visual : eligible);
  const [prompt, correct, second, third, fourth, image] = questions[category][index];
  const id = category + "-" + index;
  const options = shuffled([correct, second, third, fourth]);
  room.used.push(id);
  room.seen.push(id);
  room.question = {
    id, category, prompt, options, correctIndex: options.indexOf(correct), image
  };
  room.phase = "question";
  room.deadline = now + room.settings.seconds * 1000;
  room.botAnswers = room.players.filter((player) => player.bot).map((player) => {
    const correct = room.question.correctIndex;
    const option = Math.random() < botAccuracy[room.settings.difficulty]
      ? correct
      : (correct + 1 + Math.floor(Math.random() * 3)) % 4;
    return { id: player.id, option, at: now + 1800 + Math.floor(Math.random() * 6100) };
  }).sort((first, second) => first.at - second.at);
}

function reveal(room, now) {
  for (const player of room.players) {
    if (room.answers[player.id] === room.question.correctIndex) player.score += 1;
  }
  const finalRound = room.round === room.settings.rounds;
  room.phase = finalRound ? "finale" : "reveal";
  room.deadline = now + (finalRound ? finaleTime : revealTime);
  room.botAnswers = [];
}

function advanceByClock(room, now) {
  let changed = false;
  if (room.phase === "reveal" && room.deadline === null) {
    room.deadline = now + revealTime;
    changed = true;
  }
  for (;;) {
    const nextBot = room.phase === "question" ? room.botAnswers?.[0] : null;
    if (nextBot && nextBot.at <= now && nextBot.at < room.deadline) {
      room.botAnswers.shift();
      room.answers[nextBot.id] = nextBot.option;
      if (Object.keys(room.answers).length === room.players.length) reveal(room, nextBot.at);
      changed = true;
      continue;
    }
    const deadline = room.deadline;
    if (deadline === null || deadline > now) return changed;
    if (room.phase === "select") startQuestion(room, randomItem(availableCategories(room)), deadline);
    else if (room.phase === "question") reveal(room, deadline);
    else if (room.phase === "reveal" && room.round < room.settings.rounds) startSelection(room, deadline);
    else if (room.phase === "finale" || room.phase === "reveal") {
      room.phase = "finished";
      room.deadline = null;
    } else return changed;
    changed = true;
  }
}

function viewRoom(room, player, revision, now = Date.now()) {
  const mode = room.mode ?? "online";
  const display = room.screenHost?.id === player.id;
  const answered = Object.hasOwn(room.answers, player.id);
  const showAnswer = room.phase === "reveal";
  const showStandings = room.phase !== "finale" && !(showAnswer && room.round === room.settings.rounds);
  const showVisual = mode !== "screen" || display;
  const question = room.question && (room.phase === "question" || showAnswer) ? {
    id: room.question.id,
    category: room.question.category,
    prompt: showVisual ? room.question.prompt : null,
    ...(showVisual && room.question.image ? { image: room.question.image } : {}),
    options: room.question.options,
    ...(showAnswer ? { correctIndex: room.question.correctIndex } : {})
  } : null;

  return {
    code: room.code, phase: room.phase, round: room.round, deadline: room.deadline, revision, now,
    mode, display, settings: room.settings, playerId: player.id, hostId: hostOf(room).id,
    players: room.players.map(({ id, name, score, bot }) => ({
      id, name, bot: Boolean(bot),
      ...(showStandings ? { score } : {}),
      ...(showAnswer && showStandings ? { gained: Number(room.answers[id] === room.question?.correctIndex) } : {})
    })),
    chooserId: room.phase === "select" ? chooserFor(room).id : null,
    available: room.phase === "select" ? availableCategories(room) : [],
    answeredCount: Object.keys(room.answers).length,
    yourAnswer: answered && room.phase !== "finale" ? room.answers[player.id] : null,
    question, seenQuestions: room.used,
    ...(room.phase === "finished" && room.question ? { lastAnswer: room.question.options[room.question.correctIndex] } : {}),
    ...(mode === "online" ? { chat: room.chat ?? [] } : {})
  };
}

async function createRoom(db, input) {
  const mode = input.mode ?? "online";
  if (!modes.includes(mode)) throw new GameError(400, "اختر طريقة لعب من القائمة.");
  const name = mode === "screen" ? "شاشة المجلس" : normalizeName(input.name);
  const settings = getSettings(input);
  const owner = makePlayer(name);
  const players = mode === "screen" ? [] : [owner];
  if (mode === "bots") {
    if (!Number.isInteger(input.bots) || input.bots < 1 || input.bots > botNames.length ||
        typeof input.difficulty !== "string" || !Object.hasOwn(botAccuracy, input.difficulty)) {
      throw new GameError(400, "اختر عدد البوتات ومستواهم.");
    }
    settings.difficulty = input.difficulty;
    for (const botName of shuffled(botNames).slice(0, input.bots)) {
      const bot = makePlayer(botName === name ? botName + " الآلي" : botName);
      players.push({ id: bot.id, name: bot.name, score: 0, bot: true });
    }
  }
  const now = Date.now();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    const room = {
      code, mode, settings, players, phase: "lobby", round: 0,
      ...(mode === "screen" ? { screenHost: owner } : {}),
      deadline: null, used: [], seen: [], answers: {}, question: null
    };
    addHistory(room, input.history);
    requireEnoughQuestions(room);
    const saved = await db.prepare("INSERT OR IGNORE INTO rooms (code, expires_at, state) VALUES (?, ?, ?)")
      .bind(code, now + day, JSON.stringify(room)).run();
    if (saved.meta.changes) {
      await db.prepare("DELETE FROM rooms WHERE code IN (SELECT code FROM rooms WHERE expires_at <= ? LIMIT 100)").bind(now).run();
      return { token: owner.token, room: viewRoom(room, owner, 0) };
    }
  }
  throw new GameError(503, "تعذّر إنشاء الغرفة. جرّب مرة ثانية.");
}

function requireHost(room, player) {
  if (player.id !== hostOf(room).id) throw new GameError(403, "هذا الخيار للمضيف.");
}

function applyAction(room, player, action, input, now) {
  if (action === "start") {
    requireHost(room, player);
    if (room.phase !== "lobby" || room.players.length < 2) throw new GameError(409, "تحتاج لاعبين على الأقل لبدء المباراة.");
    requireEnoughQuestions(room);
    startSelection(room, now);
    return true;
  }
  if (action === "category") {
    if (room.phase !== "select" || room.round !== input.round) throw new GameError(409, "تغيّرت الجولة.");
    if (chooserFor(room).id !== player.id) throw new GameError(403, "اختيار الفئة بيد اللاعب اللي عليه الدور.");
    if (!availableCategories(room).includes(input.category)) throw new GameError(400, "اختر فئة من القائمة.");
    startQuestion(room, input.category, now);
    return true;
  }
  if (action === "answer") {
    if (room.screenHost?.id === player.id) throw new GameError(403, "جاوب من جوالك بعد الانضمام للغرفة.");
    if (room.phase !== "question" || room.question.id !== input.questionId) throw new GameError(409, "انتهى وقت الإجابة.");
    if (!Number.isInteger(input.option) || input.option < 0 || input.option > 3) throw new GameError(400, "اختر إجابة من الخيارات.");
    if (Object.hasOwn(room.answers, player.id)) return false;
    room.answers[player.id] = input.option;
    if (Object.keys(room.answers).length === room.players.length) reveal(room, now);
    return true;
  }
  if (action === "chat") {
    if ((room.mode ?? "online") !== "online") throw new GameError(403, "الشات متاح في الغرف عن بُعد.");
    if (typeof input.text !== "string" || typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id)) {
      throw new GameError(400, "اكتب رسالة قصيرة للشات.");
    }
    const text = input.text.trim().replace(/\s+/gu, " ");
    if (!text || [...text].length > 240 || /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(text)) {
      throw new GameError(400, "اكتب رسالة من ١ إلى ٢٤٠ حرفًا.");
    }
    room.chat ??= [];
    if (room.chat.some((entry) => entry.id === input.id && entry.playerId === player.id)) return false;
    if (now - (player.lastChatAt ?? -Infinity) < 1000) throw new GameError(429, "تمهّل شوي قبل إرسال رسالة ثانية.");
    player.lastChatAt = now;
    room.chat.push({ id: input.id, playerId: player.id, name: player.name, text, at: now });
    if (room.chat.length > 75) room.chat.shift();
    return true;
  }
  if (action === "rematch") {
    requireHost(room, player);
    if (room.phase !== "finished") throw new GameError(409, "المباراة الحالية ما انتهت.");
    requireEnoughQuestions(room);
    Object.assign(room, { phase: "lobby", round: 0, used: [], answers: {}, question: null });
    for (const entry of room.players) entry.score = 0;
    return true;
  }
  throw new GameError(404, "الطلب غير موجود.");
}

async function roomRequest(db, code, action, input, token) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const row = await db.prepare("SELECT code, version, expires_at, state FROM rooms WHERE code = ?").bind(code).first();
    const now = Date.now();
    if (!row || row.expires_at <= now) throw new GameError(404, "الغرفة غير موجودة أو انتهت صلاحيتها.");
    const room = JSON.parse(row.state);
    let player = token
      ? (room.screenHost?.token === token ? room.screenHost : room.players.find((entry) => entry.token === token))
      : null;
    let changed = false;

    if (action === "join" && !player) {
      if (room.mode === "bots") throw new GameError(404, "ما لقينا الغرفة.");
      if (room.phase !== "lobby") throw new GameError(409, "المباراة بدأت. اطلب من المضيف رابط غرفة جديدة.");
      if (room.players.length >= maxPlayers) throw new GameError(409, "الغرفة ممتلئة.");
      const name = normalizeName(input.name);
      if (room.players.some((entry) => entry.name.toLocaleLowerCase("ar") === name.toLocaleLowerCase("ar"))) {
        throw new GameError(409, "الاسم مستخدم في الغرفة. جرّب اسمًا ثانيًا.");
      }
      addHistory(room, input.history);
      requireEnoughQuestions(room);
      player = makePlayer(name);
      room.players.push(player);
      changed = true;
    }
    if (!player) throw new GameError(401, "انضم للغرفة باسمك أولًا.");

    changed = advanceByClock(room, now) || changed;
    if (action !== "state" && action !== "join") {
      changed = applyAction(room, player, action, input, now) || changed;
    }

    if (changed) {
      const saved = await db.prepare("UPDATE rooms SET state = ?, version = version + 1, expires_at = ? WHERE code = ? AND version = ?")
        .bind(JSON.stringify(room), now + day, code, row.version).run();
      if (!saved.meta.changes) continue;
    }

    const revision = row.version + (changed ? 1 : 0);
    return { ...(action === "join" ? { token: player.token } : {}), room: viewRoom(room, player, revision, now) };
  }
  throw new GameError(503, "الغرفة مشغولة. جرّب مرة ثانية.");
}

async function readInput(request) {
  const text = await request.text();
  if (text.length > 4096) throw new GameError(413, "الطلب كبير جدًا.");
  try {
    const input = JSON.parse(text);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    return input;
  } catch {
    throw new GameError(400, "الطلب غير صالح.");
  }
}

function response(body, type, extra = {}) {
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      ...extra
    }
  });
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function handleApi(request, pathname, db) {
  if (!db) throw new Error("Missing DB binding");
  if (request.method === "POST" && pathname === "/api/rooms") {
    return json(await createRoom(db, await readInput(request)), 201);
  }

  const match = pathname.match(/^\/api\/rooms\/([23456789A-HJ-NP-Z]{6})(?:\/(invite|join|start|category|answer|chat|rematch))?$/);
  if (!match) throw new GameError(404, "الطلب غير موجود.");
  const [, code, action] = match;
  const token = request.headers.get("Authorization")?.match(/^Bearer ([0-9a-f-]{36})$/i)?.[1];
  if (request.method === "GET" && action === "invite") {
    const row = await db.prepare("SELECT expires_at, state FROM rooms WHERE code = ?").bind(code).first();
    const mode = row && JSON.parse(row.state).mode || "online";
    if (!row || row.expires_at <= Date.now() || mode === "bots") throw new GameError(404, "ما لقينا الغرفة.");
    return json({ mode });
  }
  if (request.method === "GET" && !action) return json(await roomRequest(db, code, "state", null, token));
  if (request.method === "POST" && action) return json(await roomRequest(db, code, action, await readInput(request), token));
  throw new GameError(405, "الطلب غير مدعوم.");
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname.startsWith("/api/")) return await handleApi(request, pathname, env.DB);
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
      if (pathname === "/app.js") return response(assets.js, "text/javascript; charset=utf-8");
      if (pathname === "/qrcode.js") return response(assets.qr, "text/javascript; charset=utf-8", { "Cache-Control": "public, max-age=3600" });
      if (pathname === "/sound.js") return response(assets.sound, "text/javascript; charset=utf-8");
      if (pathname === "/style.css") return response(assets.css, "text/css; charset=utf-8");
      if (pathname === "/hero.webp" && assets.hero) {
        const bytes = Uint8Array.from(atob(assets.hero), (character) => character.charCodeAt(0));
        return response(bytes, "image/webp", { "Cache-Control": "public, max-age=3600" });
      }
      const image = pathname.match(/^\/questions\/([a-z0-9-]+\.webp)$/)?.[1];
      if (image && Object.hasOwn(assets.questionImages, image)) {
        const bytes = Uint8Array.from(atob(assets.questionImages[image]), (character) => character.charCodeAt(0));
        return response(bytes, "image/webp", { "Cache-Control": "public, max-age=86400" });
      }
      if (pathname === "/favicon.ico") return new Response(null, { status: 204 });
      if (pathname === "/" || /^\/room\/[23456789A-HJ-NP-Z]{6}\/?$/i.test(pathname)) {
        return response(assets.html, "text/html; charset=utf-8", {
          "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
        });
      }
      return new Response("الصفحة غير موجودة", { status: 404 });
    } catch (error) {
      if (error instanceof GameError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: "صار خطأ في الاتصال باللعبة. جرّب مرة ثانية." }, 500);
    }
  }
};
