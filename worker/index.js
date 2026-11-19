const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const day = 86_400_000;
const categoryTime = 15_000;
const maxPlayers = 8;

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

function getSettings(input) {
  const { rounds, seconds, categories } = input;
  if (![5, 10].includes(rounds) || ![15, 20, 30].includes(seconds) ||
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
  room.deadline = now + categoryTime;
  room.question = null;
  room.answers = {};
}

function chooserFor(room) {
  return room.players[(room.round - 1) % room.players.length];
}

function availableCategories(room) {
  return room.settings.categories.filter((category) =>
    questions[category].some((_, index) => !room.used.includes(category + "-" + index))
  );
}

function startQuestion(room, category, now) {
  const pool = questions[category].map((data, index) => ({
    id: category + "-" + index,
    prompt: data[0],
    correct: data[1],
    options: shuffled(data.slice(1))
  })).filter((item) => !room.used.includes(item.id));
  const fresh = pool.filter((item) => !room.seen.includes(item.id));
  const item = randomItem(fresh.length ? fresh : pool);
  room.used.push(item.id);
  if (!room.seen.includes(item.id)) room.seen.push(item.id);
  room.question = {
    id: item.id, category, prompt: item.prompt, options: item.options,
    correctIndex: item.options.indexOf(item.correct)
  };
  room.phase = "question";
  room.deadline = now + room.settings.seconds * 1000;
}

function reveal(room) {
  for (const player of room.players) {
    if (room.answers[player.id] === room.question.correctIndex) player.score += 1;
  }
  room.phase = "reveal";
  room.deadline = null;
}

function advanceByClock(room, now) {
  if (room.deadline === null || now < room.deadline) return false;
  if (room.phase === "select") {
    const questionStarts = room.deadline;
    startQuestion(room, randomItem(availableCategories(room)), questionStarts);
    if (now >= room.deadline) reveal(room);
    return true;
  }
  if (room.phase === "question") {
    reveal(room);
    return true;
  }
  return false;
}

function viewRoom(room, player, revision, now = Date.now()) {
  const answered = Object.hasOwn(room.answers, player.id);
  const showAnswer = room.phase === "reveal";
  const question = room.question && (room.phase === "question" || showAnswer) ? {
    id: room.question.id,
    category: room.question.category,
    prompt: room.question.prompt,
    options: room.question.options,
    ...(showAnswer ? { correctIndex: room.question.correctIndex } : {})
  } : null;

  return {
    code: room.code, phase: room.phase, round: room.round, deadline: room.deadline, revision, now,
    settings: room.settings, playerId: player.id, hostId: room.players[0].id,
    players: room.players.map(({ id, name, score }) => ({ id, name, score })),
    chooserId: room.phase === "select" ? chooserFor(room).id : null,
    available: room.phase === "select" ? availableCategories(room) : [],
    answeredCount: Object.keys(room.answers).length,
    yourAnswer: answered ? room.answers[player.id] : null,
    question
  };
}

async function createRoom(db, input) {
  const name = normalizeName(input.name);
  const settings = getSettings(input);
  const owner = makePlayer(name);
  const now = Date.now();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    const room = {
      code, settings, players: [owner], phase: "lobby", round: 0,
      deadline: null, used: [], seen: [], answers: {}, question: null
    };
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
  if (player.id !== room.players[0].id) throw new GameError(403, "هذا الخيار للمضيف.");
}

function applyAction(room, player, action, input, now) {
  if (action === "start") {
    requireHost(room, player);
    if (room.phase !== "lobby" || room.players.length < 2) throw new GameError(409, "تحتاج لاعبين على الأقل لبدء المباراة.");
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
    if (room.phase !== "question" || room.question.id !== input.questionId) throw new GameError(409, "انتهى وقت الإجابة.");
    if (!Number.isInteger(input.option) || input.option < 0 || input.option > 3) throw new GameError(400, "اختر إجابة من الخيارات.");
    if (Object.hasOwn(room.answers, player.id)) return false;
    room.answers[player.id] = input.option;
    if (Object.keys(room.answers).length === room.players.length) reveal(room);
    return true;
  }
  if (action === "next") {
    requireHost(room, player);
    if (room.phase !== "reveal" || room.round !== input.round) throw new GameError(409, "تغيّرت الجولة.");
    if (room.round === room.settings.rounds) room.phase = "finished";
    else startSelection(room, now);
    return true;
  }
  if (action === "rematch") {
    requireHost(room, player);
    if (room.phase !== "finished") throw new GameError(409, "المباراة الحالية ما انتهت.");
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
    let player = token ? room.players.find((entry) => entry.token === token) : null;
    let changed = false;

    if (action === "join" && !player) {
      if (room.phase !== "lobby") throw new GameError(409, "المباراة بدأت. اطلب من المضيف رابط غرفة جديدة.");
      if (room.players.length >= maxPlayers) throw new GameError(409, "الغرفة ممتلئة.");
      const name = normalizeName(input.name);
      if (room.players.some((entry) => entry.name.toLocaleLowerCase("ar") === name.toLocaleLowerCase("ar"))) {
        throw new GameError(409, "الاسم مستخدم في الغرفة. جرّب اسمًا ثانيًا.");
      }
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

  const match = pathname.match(/^\/api\/rooms\/([23456789A-HJ-NP-Z]{6})(?:\/(join|start|category|answer|next|rematch))?$/);
  if (!match) throw new GameError(404, "الطلب غير موجود.");
  const [, code, action] = match;
  const token = request.headers.get("Authorization")?.match(/^Bearer ([0-9a-f-]{36})$/i)?.[1];
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
      if (pathname === "/style.css") return response(assets.css, "text/css; charset=utf-8");
      if (pathname === "/hero.webp" && assets.hero) {
        const bytes = Uint8Array.from(atob(assets.hero), (character) => character.charCodeAt(0));
        return response(bytes, "image/webp", { "Cache-Control": "public, max-age=3600" });
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
