import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "../scripts/build.mjs";
import { openLocalDatabase } from "../scripts/dev.mjs";

await build();
const { default: worker } = await import("../dist/server/index.js");
const bank = JSON.parse(await readFile("worker/questions.json", "utf8"));

async function setup(t, seconds = 20) {
  const db = await openLocalDatabase();
  t.after(() => db.close());
  const request = async (path, body, token) => {
    const response = await worker.fetch(new Request(`https://quiz.example/api/rooms${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body)
    }), { DB: db });
    return { status: response.status, data: await response.json() };
  };

  const created = await request("", { name: "ناصر", rounds: 5, seconds, categories: ["science"] });
  assert.equal(created.status, 201);
  const path = `/${created.data.room.code}`;
  const hostToken = created.data.token;
  const host = (action = "", body) => request(path + action, body, hostToken);
  assert.equal((await host("/start", {})).status, 409);
  const joined = await request(path + "/join", { name: "محمد" });
  assert.equal(joined.status, 200);
  const guest = (action = "", body) => request(path + action, body, joined.data.token);
  assert.equal((await host()).data.room.players.length, 2);
  assert.equal((await guest("/start", {})).status, 403);
  return { request, path, host, guest };
}

test("two independent players complete a match and rematch with fresh questions", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const { request, path, host, guest } = await setup(t);
  let state = (await host("/start", {})).data.room;
  assert.equal((await request(path + "/join", { name: "ضيف" })).status, 409);
  assert.equal((await request(path)).status, 401);
  const seen = new Set();

  for (let round = 1; round <= 5; round += 1) {
    const [chooser, other] = round % 2 ? [host, guest] : [guest, host];
    assert.equal(state.phase, "select");
    assert.equal(state.chooserId, (await chooser()).data.room.playerId);
    assert.equal((await other("/category", { round, category: "science" })).status, 403);

    const selected = (await chooser("/category", { round, category: "science" })).data.room;
    const both = await Promise.all([host(), guest()]);
    const question = selected.question;
    assert.deepEqual(both[0].data.room.question, both[1].data.room.question);
    assert.equal(question.correctIndex, undefined);
    assert.equal(question.options.length, 4);
    assert.equal(seen.has(question.id), false);
    seen.add(question.id);
    const answerText = bank.science.find((entry) => entry[0] === question.prompt)[1];
    const option = question.options.indexOf(answerText);
    const invalidOption = (option + 1) % 4;
    const answer = (value) => ({ questionId: question.id, option: value });
    assert.equal((await host("/answer", answer(option))).data.room.yourAnswer, option);
    assert.equal((await host("/answer", answer(invalidOption))).data.room.yourAnswer, option);
    const revealed = (await guest("/answer", answer(option))).data.room;
    if (round === 5) {
      assert.equal(revealed.phase, "finale");
      assert.equal(revealed.question, null);
      assert.equal(revealed.yourAnswer, null);
      assert.equal(revealed.players.some((player) => Object.hasOwn(player, "score")), false);
      assert.equal(revealed.lastAnswer, undefined);
      t.mock.timers.tick(5499);
      assert.equal((await host()).data.room.phase, "finale");
      t.mock.timers.tick(1);
      state = (await host()).data.room;
      assert.equal(state.lastAnswer, answerText);
      continue;
    }
    assert.equal(revealed.phase, "reveal");
    assert.equal(revealed.question.correctIndex, option);
    assert.deepEqual(revealed.players.map(({ score }) => score), [round, round]);
    assert.deepEqual(revealed.players.map(({ gained }) => gained), [1, 1]);
    assert.deepEqual((await host()).data.room.players, revealed.players);
    t.mock.timers.tick(4999);
    assert.equal((await guest()).data.room.phase, "reveal");
    t.mock.timers.tick(1);
    state = (await host()).data.room;
  }
  assert.equal(state.phase, "finished");
  assert.deepEqual((await guest()).data.room.players.map(({ score }) => score), [5, 5]);
  assert.equal((await host("/rematch", {})).data.room.phase, "lobby");
  assert.deepEqual((await guest()).data.room.players.map(({ score }) => score), [0, 0]);
  await host("/start", {});
  const next = (await host("/category", { round: 1, category: "science" })).data.room;
  assert.equal(seen.has(next.question.id), false);
});

test("the bank contains thousands of unique questions and displays illustrated questions safely", async (t) => {
  assert.ok(Object.values(bank).flat().length >= 3000);
  const { request } = await setup(t);
  const created = await request("", { mode: "screen", rounds: 20, seconds: 20, categories: ["culture"] });
  const path = `/${created.data.room.code}`;
  const display = (action = "", body) => request(path + action, body, created.data.token);
  const first = await request(path + "/join", { name: "بدر" });
  await request(path + "/join", { name: "فيصل" });
  await display("/start", {});
  const phone = await request(path + "/category", { round: 1, category: "culture" }, first.data.token);
  assert.equal(phone.data.room.question.image, undefined);
  const screenImage = (await display()).data.room.question.image;
  assert.ok(screenImage.alt);
  const asset = await worker.fetch(new Request(`https://quiz.example/questions/${screenImage.file}`), {});
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("content-type"), "image/webp");
  assert.ok((await asset.arrayBuffer()).byteLength > 1000);
});

test("a 20-round match samples only unseen questions and refuses a repeat after exhaustion", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 600_000 });
  const { request } = await setup(t);
  const pack = (indices) => {
    const bytes = Buffer.alloc(Math.ceil(bank.general.length / 8));
    for (const index of indices) bytes[index >> 3] |= 1 << (index % 8);
    return { general: bytes.toString("base64") };
  };
  const history = pack(Array.from({ length: bank.general.length - 21 }, (_, index) => index + 21));
  const created = await request("", { mode: "online", name: "بدر", rounds: 20, seconds: 15, categories: ["general"], history });
  const path = `/${created.data.room.code}`;
  const host = (action = "", body) => request(path + action, body, created.data.token);
  const joined = await request(path + "/join", { name: "فيصل", history: pack([0]) });
  assert.equal(joined.status, 200);
  assert.equal((await host("/start", {})).data.room.phase, "select");
  const observed = new Set();
  for (let round = 1; round <= 20; round += 1) {
    t.mock.timers.tick(15_000);
    const state = (await host()).data.room;
    assert.equal(state.phase, "question");
    assert.equal(state.round, round);
    assert.notEqual(state.question.id, "general-0");
    assert.ok(Number(state.question.id.split("-")[1]) <= 20);
    assert.equal(observed.has(state.question.id), false);
    assert.equal(state.seenQuestions.length, round);
    observed.add(state.question.id);
    t.mock.timers.tick(15_000 + (round === 20 ? 5500 : 5000));
  }
  assert.equal(observed.size, 20);
  assert.equal((await host()).data.room.phase, "finished");
  assert.equal((await host("/rematch", {})).status, 409);
});

test("online chat is scoped to room members, accepts simultaneous senders, and deduplicates retries", async (t) => {
  const { request, path, host, guest } = await setup(t);
  const message = { text: "هلا بالربع 👋", id: crypto.randomUUID() };
  assert.equal((await request(path + "/chat", message)).status, 401);
  const sent = await Promise.all([host("/chat", message), guest("/chat", { text: "يا هلا", id: crypto.randomUUID() })]);
  assert.deepEqual(sent.map((entry) => entry.status), [200, 200]);
  assert.equal((await host("/chat", message)).status, 200);
  assert.equal((await host("/chat", { ...message, id: crypto.randomUUID() })).status, 429);
  const state = (await guest()).data.room;
  assert.deepEqual(state.chat.map(({ text }) => text).sort(), ["هلا بالربع 👋", "يا هلا"]);
});

test("shared screen shows the question and display host cannot answer for the two phones", async (t) => {
  const { request } = await setup(t);
  const created = await request("", { mode: "screen", rounds: 5, seconds: 20, categories: ["science"] });
  assert.equal(created.status, 201);
  const path = `/${created.data.room.code}`;
  assert.equal((await request(path + "/invite")).data.mode, "screen");
  assert.equal(created.data.room.display, true);
  assert.equal(created.data.room.players.length, 0);
  const display = (action = "", body) => request(path + action, body, created.data.token);
  assert.equal((await display("/start", {})).status, 409);
  const join = async (name) => {
    const joined = await request(path + "/join", { name });
    assert.equal(joined.data.room.display, false);
    return (action = "", body) => request(path + action, body, joined.data.token);
  };
  const first = await join("علي");
  assert.equal((await display("/start", {})).status, 409);
  const second = await join("يوسف");
  const started = (await display("/start", {})).data.room;
  assert.equal((await first()).data.room.playerId, started.chooserId);
  const question = (await first("/category", { round: 1, category: "science" })).data.room.question;
  assert.equal(question.prompt, null);
  assert.equal(question.correctIndex, undefined);
  const screen = (await display()).data.room;
  assert.ok(screen.question.prompt);
  assert.deepEqual(screen.question.options, question.options);
  assert.deepEqual((await second()).data.room.question, question);
  const answer = { questionId: question.id, option: 0 };
  assert.equal((await display("/answer", answer)).status, 403);
  await Promise.all([first("/answer", answer), second("/answer", answer)]);
  assert.equal((await display()).data.room.phase, "reveal");
});

test("bots choose their category and submit answers on the server clock", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const { request } = await setup(t);
  const created = await request("", {
    mode: "bots", name: "سالم", rounds: 5, seconds: 15, categories: ["general"], difficulty: "hard", bots: 3
  });
  assert.equal(created.status, 201);
  const path = `/${created.data.room.code}`;
  const solo = (action = "", body) => request(path + action, body, created.data.token);
  assert.equal(created.data.room.players.filter(({ bot }) => bot).length, 3);
  assert.equal((await request(path + "/invite")).status, 404);
  assert.equal((await request(path + "/join", { name: "ضيف" })).status, 404);
  await solo("/start", {});
  const first = (await solo("/category", { round: 1, category: "general" })).data.room;
  await solo("/answer", { questionId: first.question.id, option: 0 });
  t.mock.timers.tick(8000);
  const revealed = (await solo()).data.room;
  assert.equal(revealed.phase, "reveal");
  assert.equal(revealed.answeredCount, 4);
  t.mock.timers.setTime(revealed.deadline);
  const botTurn = (await solo()).data.room;
  assert.ok(botTurn.players.find((player) => player.id === botTurn.chooserId).bot);
  t.mock.timers.tick(2200);
  assert.equal((await solo()).data.room.phase, "question");
});

test("category selection and answers expire on server time without awarding missing responses", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const { host, guest } = await setup(t, 15);
  const started = (await host("/start", {})).data.room;
  t.mock.timers.tick(15_000);
  const selected = (await guest()).data.room;
  assert.equal(selected.phase, "question");
  assert.equal(selected.deadline, started.deadline + 15_000);
  t.mock.timers.tick(15_000);
  assert.equal((await host("/answer", { questionId: selected.question.id, option: 0 })).status, 409);
  const revealed = (await guest()).data.room;
  assert.equal(revealed.phase, "reveal");
  assert.equal(revealed.answeredCount, 0);
  assert.deepEqual(revealed.players.map(({ score }) => score), [0, 0]);
  assert.equal((await host()).data.room.revision, revealed.revision);
});
