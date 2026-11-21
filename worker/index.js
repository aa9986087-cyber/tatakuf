const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const day = 86_400_000;
const categoryTime = 60_000;
const maxPlayers = 15;
// The reveal lasts 12 seconds: coloured answers with names for 7, then the leaderboard for 5. The last
// round shows the answers for all 12, then goes to the finale instead of the leaderboard.
const revealTime = 12_000;
const finaleTime = 5_500;
const botTurnTime = 2_200;
const writeTime = 60_000;
const formats = ["classic", "bluff"];
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
    throw new GameError(400, "اكتب اسمًا من 1 إلى 24 حرفًا.");
  }
  return name;
}

function makePlayer(name) {
  return { id: crypto.randomUUID(), token: crypto.randomUUID(), name, score: 0 };
}

function hostOf(room) {
  return room.screenHost ?? room.players[0];
}

// Rooms created before the host could play keep a display-only `screenHost` outside `players`.
function isDisplay(room, player) {
  return room.displayId === player.id || room.screenHost?.id === player.id;
}

function nameTaken(room, name) {
  return room.players.some((entry) => entry.name.toLocaleLowerCase("ar") === name.toLocaleLowerCase("ar"));
}

function seatLegacyDisplay(room, input) {
  if (room.phase !== "lobby") throw new GameError(409, "المباراة بدأت. أنشئ غرفة جديدة عشان تلعب من الشاشة.");
  if (room.players.length >= maxPlayers) throw new GameError(409, "الغرفة ممتلئة.");
  const name = normalizeName(input.name);
  if (nameTaken(room, name)) throw new GameError(409, "الاسم مستخدم في الغرفة. جرّب اسمًا ثانيًا.");
  addHistory(room, input.history);
  requireEnoughQuestions(room);
  const { id, token } = room.screenHost;
  room.players.unshift({ id, token, name, score: 0 });
  room.displayId = id;
  delete room.screenHost;
  return room.players[0];
}

function getSettings(input) {
  const { rounds, seconds, categories } = input;
  const format = input.format ?? "classic";
  if (!formats.includes(format) || !Number.isInteger(rounds) || rounds < 1 || rounds > 30 || ![15, 20, 30, 45, 60].includes(seconds) ||
      !Array.isArray(categories) || !categories.length || categories.length > Object.keys(bankFor(format)).length ||
      new Set(categories).size !== categories.length ||
      categories.some((id) => typeof id !== "string" || !Object.hasOwn(bankFor(format), id))) {
    throw new GameError(400, "اختر فئة واحدة على الأقل وتحقق من إعدادات الجولة.");
  }
  return { rounds, seconds, categories, format };
}

const isBluff = (room) => room.settings.format === "bluff";
// Bluff rounds draw from their own story-style bank; ids and history keys get a "bluff." prefix.
function bankFor(format) { return format === "bluff" ? bluffQuestions : questions; }
const bankOf = (room) => bankFor(room.settings.format);
const keyOf = (room, category) => (isBluff(room) ? "bluff." : "") + category;

// Compare answers loosely: spacing, punctuation, diacritics and common Arabic letter variants do not count.
function answerKey(value) {
  return value.normalize("NFKC").toLocaleLowerCase("ar")
    .replace(/[\u064B-\u065F\u0670\u0640]/gu, "")
    .replace(/[أإآٱ]/gu, "ا").replace(/ى/gu, "ي").replace(/ة/gu, "ه").replace(/ؤ/gu, "و").replace(/ئ/gu, "ي")
    .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
    // "الزرافة" and "زرافة" count as the same answer.
    .split(/[\p{P}\p{S}\s]+/u).map((word) => word.length > 3 ? word.replace(/^ال/u, "") : word).join("");
}

// Letters questions in classic games are answered by typing the word.
const isTypedCategory = (room, category) => !isBluff(room) && category === "letters";
function typedCorrect(room, text) {
  return typeof text === "string" && answerKey(text) === answerKey(room.question.correct);
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
    bankOf(room)[category].some((_, index) => !seen.has(keyOf(room, category) + "-" + index))
  );
}

function addHistory(room, packedHistory) {
  if (packedHistory === undefined) return;
  if (!packedHistory || typeof packedHistory !== "object" || Array.isArray(packedHistory)) {
    throw new GameError(400, "تعذّر قراءة سجل الأسئلة.");
  }
  const seen = new Set(room.seen);
  for (const category of room.settings.categories) {
    const encoded = packedHistory[keyOf(room, category)];
    if (encoded === undefined) continue;
    const limit = bankOf(room)[category].length;
    if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) ||
        encoded.length % 4 !== 0 || encoded.length > Math.ceil(limit / 24) * 4) {
      throw new GameError(400, "تعذّر قراءة سجل الأسئلة.");
    }
    const bytes = atob(encoded);
    for (let index = 0; index < Math.min(limit, bytes.length * 8); index += 1) {
      if (bytes.charCodeAt(index >> 3) & (1 << (index % 8))) seen.add(keyOf(room, category) + "-" + index);
    }
  }
  room.seen = [...seen];
}

function requireEnoughQuestions(room) {
  const seen = new Set(room.seen);
  let remaining = 0;
  for (const category of room.settings.categories) {
    remaining += bankOf(room)[category].filter((_, index) => !seen.has(keyOf(room, category) + "-" + index)).length;
  }
  if (remaining < room.settings.rounds) {
    throw new GameError(409, "الأسئلة الجديدة ما تكفي للجولات المختارة. جرّب فئات أكثر أو جولات أقل.");
  }
}

// pickedBy is the player who chose the category, or null when the clock picked one at random.
function startQuestion(room, category, now, pickedBy = null) {
  const seen = new Set(room.seen);
  const bank = bankOf(room)[category];
  const eligible = bank.flatMap((_, index) => seen.has(keyOf(room, category) + "-" + index) ? [] : [index]);
  const visual = room.round === 1 || room.round % 5 === 0
    ? eligible.filter((index) => bank[index][5])
    : [];
  const index = randomItem(visual.length ? visual : eligible);
  const [prompt, correct, second, third, fourth, image] = bank[index];
  const id = keyOf(room, category) + "-" + index;
  room.used.push(id);
  room.seen.push(id);
  if (isBluff(room)) {
    room.question = { id, category, pickedBy, prompt, image, correct, decoys: shuffled([second, third, fourth]) };
    room.phase = "write";
    room.deadline = now + writeTime;
    room.answers = {};
    room.fakes = {};
    room.botAnswers = room.players.filter((player) => player.bot).map((player, index) => ({
      id: player.id, fake: room.question.decoys[index % 3], at: now + 3000 + Math.floor(Math.random() * 9000)
    })).sort((first, other) => first.at - other.at);
    return;
  }
  if (isTypedCategory(room, category)) {
    room.question = { id, category, pickedBy, prompt, image, typed: true, correct, decoys: [second, third, fourth], options: [] };
    room.phase = "question";
    room.deadline = now + room.settings.seconds * 1000;
    room.botAnswers = room.players.filter((player) => player.bot).map((player) => ({
      id: player.id,
      option: Math.random() < botAccuracy[room.settings.difficulty] ? correct : randomItem([second, third, fourth]),
      at: now + 2500 + Math.floor(Math.random() * 8000)
    })).sort((first, other) => first.at - other.at);
    return;
  }
  const options = shuffled([correct, second, third, fourth]);
  room.question = {
    id, category, pickedBy, prompt, options, correctIndex: options.indexOf(correct), image
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

// Build the vote: the right answer, each distinct fake (shared by everyone who wrote it), and house
// decoys from the question bank so there are always at least four choices.
function startVote(room, now) {
  const question = room.question;
  const entries = [{ text: question.correct, authors: [] }];
  for (const player of room.players) {
    const fake = room.fakes[player.id];
    if (fake === undefined) continue;
    const entry = entries.find((item) => item !== entries[0] && answerKey(item.text) === answerKey(fake));
    if (entry) entry.authors.push(player.id);
    else entries.push({ text: fake, authors: [player.id] });
  }
  for (const decoy of question.decoys) {
    if (entries.length >= 4) break;
    if (!entries.some((item) => answerKey(item.text) === answerKey(decoy))) entries.push({ text: decoy, authors: [] });
  }
  const order = shuffled(entries);
  question.options = order.map((item) => item.text);
  question.authors = order.map((item) => item.authors);
  question.correctIndex = order.indexOf(entries[0]);
  room.phase = "vote";
  room.deadline = now + room.settings.seconds * 1000;
  room.answers = {};
  room.botAnswers = room.players.filter((player) => player.bot).map((player) => {
    const allowed = question.options.map((_, index) => index).filter((index) => !question.authors[index].includes(player.id));
    const wrong = allowed.filter((index) => index !== question.correctIndex);
    const option = Math.random() < botAccuracy[room.settings.difficulty] || !wrong.length ? question.correctIndex : randomItem(wrong);
    return { id: player.id, option, at: now + 1800 + Math.floor(Math.random() * 6100) };
  }).sort((first, other) => first.at - other.at);
}

function reveal(room, now) {
  room.gained = {};
  for (const player of room.players) {
    const option = room.answers[player.id];
    if (room.question.typed ? typedCorrect(room, option) : option === room.question.correctIndex) room.gained[player.id] = (room.gained[player.id] ?? 0) + 1;
    else if (option !== undefined && isBluff(room)) {
      for (const author of room.question.authors[option]) room.gained[author] = (room.gained[author] ?? 0) + 1;
    }
  }
  for (const player of room.players) player.score += room.gained[player.id] ?? 0;
  room.phase = "reveal";
  room.deadline = now + revealDuration(room);
  room.botAnswers = [];
}

function revealDuration(room) {
  return revealTime;
}

function advanceByClock(room, now) {
  let changed = false;
  if (room.phase === "reveal" && room.deadline === null) {
    room.deadline = now + revealDuration(room);
    changed = true;
  }
  for (;;) {
    const nextBot = ["question", "write", "vote"].includes(room.phase) ? room.botAnswers?.[0] : null;
    if (nextBot && nextBot.at <= now && nextBot.at < room.deadline) {
      room.botAnswers.shift();
      if (room.phase === "write") {
        room.fakes[nextBot.id] = nextBot.fake;
        if (Object.keys(room.fakes).length === room.players.length) startVote(room, nextBot.at);
      } else {
        room.answers[nextBot.id] = nextBot.option;
        if (Object.keys(room.answers).length === room.players.length) reveal(room, nextBot.at);
      }
      changed = true;
      continue;
    }
    const deadline = room.deadline;
    if (deadline === null || deadline > now) return changed;
    if (room.phase === "select") {
      const chooser = chooserFor(room);
      startQuestion(room, randomItem(availableCategories(room)), deadline, chooser.bot ? chooser.id : null);
    }
    else if (room.phase === "question" || room.phase === "vote") reveal(room, deadline);
    else if (room.phase === "write") startVote(room, deadline);
    else if (room.phase === "reveal" && room.round < room.settings.rounds) startSelection(room, deadline);
    else if (room.phase === "reveal") {
      room.phase = "finale";
      room.deadline = deadline + finaleTime;
    } else if (room.phase === "finale") {
      room.phase = "finished";
      room.deadline = null;
    } else return changed;
    changed = true;
  }
}

function viewRoom(room, player, revision, now = Date.now()) {
  const mode = room.mode ?? "online";
  const display = isDisplay(room, player);
  const answered = Object.hasOwn(room.answers, player.id);
  const showAnswer = room.phase === "reveal";
  const showStandings = room.phase !== "finale" && !(showAnswer && room.round === room.settings.rounds);
  // Phones in the shared-screen mode also get picture questions, so players can zoom in up close.
  const showVisual = mode !== "screen" || display || Boolean(room.question?.image);
  const bluff = isBluff(room);
  const nameOf = (id) => room.players.find((entry) => entry.id === id)?.name ?? "";
  const question = room.question && (["question", "write", "vote"].includes(room.phase) || showAnswer) ? {
    id: room.question.id,
    category: room.question.category,
    pickedBy: room.question.pickedBy ? nameOf(room.question.pickedBy) || null : null,
    prompt: showVisual ? room.question.prompt : null,
    ...(showVisual && room.question.image ? { image: room.question.image } : {}),
    ...(room.phase !== "write" ? { options: room.question.options } : {}),
    ...(showAnswer ? { correctIndex: room.question.correctIndex } : {}),
    ...(bluff && room.phase === "vote" ? {
      ownOptions: room.question.authors.flatMap((authors, index) => authors.includes(player.id) ? [index] : [])
    } : {}),
    ...(room.question?.typed ? { typed: true } : {}),
    ...(showAnswer && room.question.typed ? {
      correctAnswer: room.question.correct,
      typedAnswers: room.players.map((entry) => ({
        name: entry.name, text: room.answers[entry.id] ?? null, correct: typedCorrect(room, room.answers[entry.id])
      }))
    } : {}),
    ...(showAnswer ? {
      voters: room.question.options.map((_, index) =>
        room.players.filter((entry) => room.answers[entry.id] === index).map((entry) => entry.name))
    } : {}),
    ...(bluff && showAnswer ? { authors: room.question.authors.map((authors) => authors.map(nameOf)) } : {})
  } : null;

  return {
    code: room.code, phase: room.phase, round: room.round, deadline: room.deadline, revision, now,
    mode, display, spectator: room.screenHost?.id === player.id, settings: room.settings, playerId: player.id, hostId: hostOf(room).id,
    players: room.players.map(({ id, name, score, bot }) => ({
      id, name, bot: Boolean(bot),
      ...(showStandings ? { score } : {}),
      ...(showAnswer && showStandings ? {
        gained: room.gained ? room.gained[id] ?? 0 : Number(room.answers[id] === room.question?.correctIndex)
      } : {})
    })),
    chooserId: room.phase === "select" ? chooserFor(room).id : null,
    available: room.phase === "select" ? availableCategories(room) : [],
    answeredCount: Object.keys(room.phase === "write" ? room.fakes : room.answers).length,
    yourAnswer: answered && room.phase !== "finale" && room.phase !== "write" ? room.answers[player.id] : null,
    ...(room.phase === "write" ? { yourFake: room.fakes[player.id] ?? null } : {}),
    // Who has already answered (never what), so the stage can show who is still thinking.
    ...(["question", "write", "vote"].includes(room.phase) ? { answeredIds: Object.keys(room.phase === "write" ? room.fakes : room.answers) } : {}),
    question, seenQuestions: room.used,
    ...(room.phase === "finished" && room.question ? { lastAnswer: room.question.typed ? room.question.correct : room.question.options[room.question.correctIndex] } : {}),
    ...(mode === "online" ? { chat: room.chat ?? [] } : {})
  };
}

async function createRoom(db, input) {
  const mode = input.mode ?? "online";
  if (!modes.includes(mode)) throw new GameError(400, "اختر طريقة لعب من القائمة.");
  const name = normalizeName(input.name);
  const settings = getSettings(input);
  const owner = makePlayer(name);
  const players = [owner];
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
      ...(mode === "screen" ? { displayId: owner.id } : {}),
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
    startQuestion(room, input.category, now, player.id);
    return true;
  }
  if (action === "fake") {
    if (room.screenHost?.id === player.id) throw new GameError(403, "سجّل اسمك في الغرفة أولًا عشان تشارك.");
    if (room.phase !== "write" || room.question.id !== input.questionId) throw new GameError(409, "انتهى وقت كتابة الخدعة.");
    const text = typeof input.text === "string" ? input.text.trim().replace(/\s+/gu, " ") : "";
    if (!text || [...text].length > 40 || /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(text) || !answerKey(text)) {
      throw new GameError(400, "اكتب خدعة من 1 إلى 40 حرفًا.");
    }
    if (Object.hasOwn(room.fakes, player.id)) return false;
    if (answerKey(text) === answerKey(room.question.correct)) {
      throw new GameError(409, "هذي هي الإجابة الصحيحة! غيّرها واكتب جوابًا غلط يقنع الباقين.");
    }
    room.fakes[player.id] = text;
    if (Object.keys(room.fakes).length === room.players.length) startVote(room, now);
    return true;
  }
  if (action === "answer") {
    if (room.screenHost?.id === player.id) throw new GameError(403, "سجّل اسمك في الغرفة أولًا عشان تجاوب.");
    const answerPhase = isBluff(room) ? "vote" : "question";
    if (room.phase !== answerPhase || room.question.id !== input.questionId) throw new GameError(409, "انتهى وقت الإجابة.");
    if (room.question.typed) {
      const text = typeof input.text === "string" ? input.text.trim().replace(/\s+/gu, " ") : "";
      if (!text || [...text].length > 40 || /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(text) || !answerKey(text)) {
        throw new GameError(400, "اكتب إجابة من 1 إلى 40 حرفًا.");
      }
      if (Object.hasOwn(room.answers, player.id)) return false;
      room.answers[player.id] = text;
      if (Object.keys(room.answers).length === room.players.length) reveal(room, now);
      return true;
    }
    if (!Number.isInteger(input.option) || input.option < 0 || input.option >= room.question.options.length) {
      throw new GameError(400, "اختر إجابة من الخيارات.");
    }
    if (Object.hasOwn(room.answers, player.id)) return false;
    if (isBluff(room) && room.question.authors[input.option].includes(player.id)) {
      throw new GameError(403, "هذي خدعتك. اختر الإجابة اللي تحسبها صحيحة.");
    }
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
      throw new GameError(400, "اكتب رسالة من 1 إلى 240 حرفًا.");
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
    Object.assign(room, { phase: "lobby", round: 0, used: [], answers: {}, fakes: {}, gained: {}, question: null });
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
      if (nameTaken(room, name)) {
        throw new GameError(409, "الاسم مستخدم في الغرفة. جرّب اسمًا ثانيًا.");
      }
      addHistory(room, input.history);
      requireEnoughQuestions(room);
      player = makePlayer(name);
      room.players.push(player);
      changed = true;
    } else if (action === "join" && room.screenHost?.id === player.id) {
      player = seatLegacyDisplay(room, input);
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

// A fresh D1 database (for example on a new Cloudflare account) gets the same schema as drizzle/0000_rooms.sql.
const schemaReady = new WeakSet();
async function ensureSchema(db) {
  if (schemaReady.has(db)) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, state TEXT NOT NULL)").bind().run();
  await db.prepare("CREATE INDEX IF NOT EXISTS rooms_expires_at ON rooms(expires_at)").bind().run();
  schemaReady.add(db);
}

async function handleApi(request, pathname, db) {
  if (!db) throw new Error("Missing DB binding");
  await ensureSchema(db);
  if (request.method === "POST" && pathname === "/api/rooms") {
    return json(await createRoom(db, await readInput(request)), 201);
  }

  const match = pathname.match(/^\/api\/rooms\/([23456789A-HJ-NP-Z]{6})(?:\/(invite|join|start|category|fake|answer|chat|rematch))?$/);
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
      const image = pathname.match(/^\/questions\/([a-z0-9-]+\.(webp|svg))$/);
      if (image && Object.hasOwn(assets.questionImages, image[1])) {
        const bytes = Uint8Array.from(atob(assets.questionImages[image[1]]), (character) => character.charCodeAt(0));
        // Flag SVGs are static drawings; the sandbox CSP keeps them inert if opened directly.
        return response(bytes, image[2] === "svg" ? "image/svg+xml" : "image/webp", {
          "Cache-Control": "public, max-age=86400",
          ...(image[2] === "svg" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {})
        });
      }
      if ((pathname === "/logo.svg" || pathname === "/logo-mark.svg") && assets.logos) {
        return response(assets.logos[pathname.slice(1)], "image/svg+xml", {
          "Cache-Control": "public, max-age=86400", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox"
        });
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
