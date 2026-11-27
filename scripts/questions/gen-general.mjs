// معلومات عامة: arithmetic, time, money, units and logic, made fresh from templates (always correct).
import { rng, int, pick, q, nearNumbers, shuffle, count } from "./lib.mjs";

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const NAMES = ["أحمد", "خالد", "فهد", "سعد", "يوسف", "ناصر", "بدر", "سلمان", "ماجد", "تركي", "عبدالله"];
const ITEMS = [["قلم", "أقلام"], ["دفتر", "دفاتر"], ["كتاب", "كتب"], ["كوب", "أكواب"], ["قميص", "قمصان"], ["تذكرة", "تذاكر"], ["علبة", "علب"], ["وردة", "ورود"]];
const pad = (n) => String(n).padStart(2, "0");
const isPrime = (n) => { if (n < 2) return false; for (let d = 2; d * d <= n; d += 1) if (n % d === 0) return false; return true; };

export function general(seed = 7) {
  const r = rng(seed), out = [], P = (list) => pick(r, list);
  const T = [
    () => { const h = int(r, 6, 20), m = P([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]), d = int(r, 25, 170); const e = h * 60 + m + d; const t = (x) => `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`;
      return q(`بدأ الاجتماع الساعة ${pad(h)}:${pad(m)} واستمر ${d} دقيقة. متى انتهى؟`, t(e), [t(e + 5), t(e - 10), t(e + 15)]); },
    () => { const v = P([40, 50, 60, 70, 80, 90, 100, 110, 120]), h = int(r, 3, 9); return q(`سيارة تسير بسرعة ثابتة ${v} كم/س لمدة ${count(h, "ساعات", "ساعة")}. كم كيلومترًا قطعت؟`, v * h, nearNumbers(r, v * h, v, { step: 10 })); },
    () => { const p = P([5, 10, 15, 20, 25, 30, 40, 50, 75]), n = int(r, 2, 40) * 20; const v = (p * n) / 100; return Number.isInteger(v) ? q(`كم يساوي ${p}٪ من ${n}؟`, v, nearNumbers(r, v, Math.max(5, v / 2), { step: v > 20 ? 5 : 1 })) : null; },
    () => { const price = int(r, 4, 40) * 10, off = P([10, 20, 25, 30, 50]); const v = price - (price * off) / 100; return Number.isInteger(v) ? q(`سعر جهاز ${price} ريال وعليه خصم ${off}٪. كم سعره بعد الخصم؟`, v, nearNumbers(r, v, 30, { step: 5 })) : null; },
    () => { const a = int(r, 12, 99), b = int(r, 3, 19); return q(`كم حاصل ضرب ${a} × ${b}؟`, a * b, nearNumbers(r, a * b, 20, { step: P([1, 2, 10]) })); },
    () => { const b = int(r, 3, 15), c = int(r, 6, 60); return q(`كم ناتج ${b * c} ÷ ${b}؟`, c, nearNumbers(r, c, 6)); },
    () => { const n = int(r, 4, 30); return q(`ما الجذر التربيعي للعدد ${n * n}؟`, n, nearNumbers(r, n, 3)); },
    () => { const n = int(r, 3, 25); return q(`كم مربع العدد ${n}؟`, n * n, nearNumbers(r, n * n, 2 * n, { step: 1 })); },
    () => { const s = int(r, 1, 9), k = P([2, 3]), seq = [s, s * k, s * k * k, s * k ** 3]; return q(`ما العدد التالي في السلسلة: ${seq.join("، ")}، …؟`, s * k ** 4, nearNumbers(r, s * k ** 4, s * k ** 3, { step: s })); },
    () => { const s = int(r, 1, 30), d = int(r, 3, 15), seq = [0, 1, 2, 3].map((i) => s + i * d); return q(`ما العدد التالي في السلسلة: ${seq.join("، ")}، …؟`, s + 4 * d, nearNumbers(r, s + 4 * d, d)); },
    () => { const today = int(r, 0, 6), n = int(r, 2, 60); return q(`إذا كان اليوم ${DAYS[today]}، فما اليوم بعد ${n} يومًا؟`, DAYS[(today + n) % 7], shuffle(r, DAYS.filter((_, i) => i !== (today + n) % 7)).slice(0, 3)); },
    () => { const h = int(r, 2, 12) + P([0, 0.5]); return q(`كم دقيقة في ${String(h).replace(".5", " ونصف")} ساعة؟`, h * 60, nearNumbers(r, h * 60, 60, { step: 30 })); },
    () => { const m = int(r, 2, 30); return q(`كم ثانية في ${m} دقيقة؟`, m * 60, nearNumbers(r, m * 60, 120, { step: 60 })); },
    () => { const w = int(r, 3, 20); return q(`كم يومًا في ${count(w, "أسابيع", "أسبوعًا")}؟`, w * 7, nearNumbers(r, w * 7, 7)); },
    () => { const kg = int(r, 2, 40) / 2; return q(`كم غرامًا في ${String(kg).replace(".5", " ونصف")} كيلوغرام؟`, kg * 1000, nearNumbers(r, kg * 1000, 1000, { step: 500 })); },
    () => { const m = int(r, 12, 90) / 10; return q(`كم سنتيمترًا في ${m} متر؟`, Math.round(m * 100), nearNumbers(r, Math.round(m * 100), 50, { step: 10 })); },
    () => { const km = int(r, 2, 30); return q(`كم مترًا في ${km} كيلومتر؟`, km * 1000, nearNumbers(r, km * 1000, 2000, { step: 1000 })); },
    () => { const [one, many] = P(ITEMS), n = int(r, 2, 9), p = int(r, 3, 25), paid = Math.ceil((n * p + 1) / 50) * 50 + P([0, 50]); const v = paid - n * p;
      return q(`اشترى ${P(NAMES)} ${n} ${n <= 10 ? many : one} بسعر ${p} ريال للواحد، ودفع ${paid} ريال. كم الباقي؟`, v, nearNumbers(r, v, 10, { min: 0 })); },
    () => { const xs = Array.from({ length: 4 }, () => int(r, 5, 30) * 2); const s = xs.reduce((a, b) => a + b, 0); return s % 4 ? null : q(`ما متوسط الأعداد: ${xs.join("، ")}؟`, s / 4, nearNumbers(r, s / 4, 6)); },
    () => { const n = P([2, 3, 4, 5, 6]) * P([2, 3, 4, 5]) * int(r, 2, 15); const a = P([2, 3, 4]), b = P([2, 3, 5]); const v = n / a / b; return Number.isInteger(v) ? q(`كم يساوي ${a === 2 ? "نصف" : a === 3 ? "ثلث" : "ربع"} ${b === 2 ? "نصف" : b === 3 ? "ثلث" : "خمس"} العدد ${n}؟`, v, nearNumbers(r, v, Math.max(3, v / 2))) : null; },
    () => { const cands = shuffle(r, Array.from({ length: 80 }, (_, i) => i + 20)); const p = cands.find(isPrime), others = cands.filter((x) => !isPrime(x) && x % 2 === 1).slice(0, 3); return q("أي هذه الأعداد عدد أولي؟", p, others); },
    () => { const d = P([3, 4, 6, 7, 8, 9, 11]); const cands = shuffle(r, Array.from({ length: 100 }, (_, i) => i + 30)); const y = cands.find((x) => x % d === 0), no = cands.filter((x) => x % d).slice(0, 3); return q(`أي هذه الأعداد يقبل القسمة على ${d} بدون باقٍ؟`, y, no); },
    () => { const w = int(r, 3, 25), h = int(r, 2, 20); return q(`مستطيل طوله ${w} سم وعرضه ${h} سم. كم مساحته بالسنتيمتر المربع؟`, w * h, nearNumbers(r, w * h, w + h)); },
    () => { const w = int(r, 3, 40), h = int(r, 2, 30); return q(`مستطيل طوله ${w} م وعرضه ${h} م. كم محيطه بالمتر؟`, 2 * (w + h), nearNumbers(r, 2 * (w + h), 8, { step: 2 })); },
    () => { const s = int(r, 2, 30); return q(`مربع طول ضلعه ${s} سم. كم محيطه؟`, 4 * s, nearNumbers(r, 4 * s, 8, { step: 2 })); },
    () => { const k = P([[1, 2], [1, 3], [2, 3], [1, 4], [3, 5], [2, 5]]), unit = int(r, 2, 40) * 10, total = (k[0] + k[1]) * unit; return q(`قُسّم مبلغ ${total} ريال بين أخوين بنسبة ${k[0]} إلى ${k[1]}. كم نصيب صاحب النصيب الأكبر؟`, k[1] * unit, nearNumbers(r, k[1] * unit, unit, { step: 10 })); },
    () => { const a = int(r, 5, 60); return q(`مجموع ثلاثة أعداد متتالية ${3 * a + 3}. ما أصغرها؟`, a, nearNumbers(r, a, 3)); },
    () => { const per = int(r, 12, 60), m = int(r, 3, 20); return q(`تطبع آلة ${per} صفحة في الدقيقة. كم صفحة تطبع في ${m} دقيقة؟`, per * m, nearNumbers(r, per * m, per)); },
    () => { const age = int(r, 6, 15), k = P([2, 3, 4]), y = int(r, 3, 12); const nm = P(NAMES); return q(`عمر ${nm} ${count(age, "سنوات", "سنة")}، وعمر أبيه ${k} أضعاف عمره. كم سيكون عمر الأب بعد ${count(y, "سنوات", "سنة")}؟`, age * k + y, nearNumbers(r, age * k + y, 6)); },
    () => { const a = int(r, 100, 999), b = int(r, 100, 999); return q(`كم ناتج ${a} + ${b}؟`, a + b, nearNumbers(r, a + b, 20, { step: 10 })); },
    () => { const a = int(r, 500, 1999), b = int(r, 100, 499); return q(`كم ناتج ${a} − ${b}؟`, a - b, nearNumbers(r, a - b, 20, { step: 10 })); },
    () => { const n = int(r, 3, 9), c = int(r, 3, 6), each = P([4, 6, 8, 12]); return q(`في القاعة ${count(n, "صفوف", "صفًّا")} من الطاولات، وفي كل صف ${count(c, "طاولات", "طاولة")}، وعلى كل طاولة ${count(each, "أقلام", "قلمًا")}. كم قلمًا في الصف كله؟`, n * c * each, nearNumbers(r, n * c * each, each * 2)); },
    () => { const start = int(r, 1990, 2015), age = int(r, 5, 30); return q(`وُلد شخص سنة ${start}. كم يكون عمره سنة ${start + age}؟`, age, nearNumbers(r, age, 3)); },
    () => { const l = P([1, 2, 3, 5]) * 1000 + P([0, 500]); return q(`كم لترًا في ${l} مليلتر؟`, l / 1000, nearNumbers(r, l / 1000, 1, { step: 0.5 })); },
    () => { const t = int(r, 2, 8) * 15, w = int(r, 2, 6); return q(`يمشي ${P(NAMES)} ${t} دقيقة كل يوم. كم ساعة يمشي في ${count(w * 4, "أيام", "يومًا")}؟`, (t * w * 4) / 60, nearNumbers(r, (t * w * 4) / 60, 3, { step: 1 })); }
  ];
  const seen = new Set();
  for (let guard = 0; out.length < 5200 && guard < 120000; guard += 1) {
    const item = pick(r, T)();
    if (!item || seen.has(item[0])) continue;
    seen.add(item[0]); out.push(item);
  }
  return out;
}
if (process.argv[1]?.endsWith("gen-general.mjs")) { const g = general(); console.log(g.length); for (const x of g.slice(0, 12)) console.log(JSON.stringify(x)); }
