// Безпека Orbix AI: очищення тексту, перевірка аргументів інструментів, ліміти, приховування секретів.
// Чиста логіка без мережі (тестується в Node: tests/ai-security.test.mjs).

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_KEY = /(secret|token|passw|passphrase|api.?key|e-?mail|authorization|private.?key|service.?role)/i;

export const isUuid = (v) => typeof v === "string" && UUID.test(v);

/** Текст користувача: без керувальних символів, обрізаний до max, без зайвих пробілів по краях. */
export function cleanText(v, max) {
  return String(v ?? "").replace(CTRL, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

/**
 * Текст з бази (назви ботів, повідомлення журналу): вважається недовіреним.
 * В один рядок, без керувальних символів, обмеженої довжини — щоб не вставляти в запит довгі «інструкції».
 */
export function cleanUntrusted(v, max = 120) {
  return String(v ?? "").replace(CTRL, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Прибирає з даних усе, що схоже на секрет, пошту чи ключ (ключі об'єкта), на будь-якій глибині. */
export function redactSecrets(v, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(v)) return v.map((x) => redactSecrets(x, depth + 1));
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!SECRET_KEY.test(k) && k !== "user_id") o[k] = redactSecrets(x, depth + 1);
    return o;
  }
  return v;
}

/**
 * Перевірка аргументів інструмента за спрощеною JSON Schema (object з простими полями).
 * Зайві поля заборонені: модель не може передати, наприклад, чужий user_id.
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function validateArgs(schema, args) {
  const input = args == null ? {} : args;
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "аргументи мають бути об'єктом" };
  const props = schema?.properties ?? {};
  for (const k of Object.keys(input)) if (!(k in props)) return { ok: false, error: `невідомий аргумент «${k}»` };
  const out = {};
  for (const [k, p] of Object.entries(props)) {
    const v = input[k];
    if (v === undefined || v === null) {
      if ((schema.required ?? []).includes(k)) return { ok: false, error: `потрібен аргумент «${k}»` };
      continue;
    }
    if (p.type === "string") {
      if (typeof v !== "string") return { ok: false, error: `«${k}» має бути рядком` };
      if (p.format === "uuid" && !isUuid(v)) return { ok: false, error: `«${k}» має бути UUID` };
      if (p.enum && !p.enum.includes(v)) return { ok: false, error: `«${k}» має бути одним із: ${p.enum.join(", ")}` };
      if (v.length > (p.maxLength ?? 200)) return { ok: false, error: `«${k}» задовге` };
      out[k] = v;
    } else if (p.type === "integer" || p.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v) || (p.type === "integer" && !Number.isInteger(v))) return { ok: false, error: `«${k}» має бути числом` };
      if (p.minimum != null && v < p.minimum) return { ok: false, error: `«${k}» не менше ${p.minimum}` };
      if (p.maximum != null && v > p.maximum) return { ok: false, error: `«${k}» не більше ${p.maximum}` };
      out[k] = v;
    } else if (p.type === "boolean") {
      if (typeof v !== "boolean") return { ok: false, error: `«${k}» має бути true або false` };
      out[k] = v;
    } else return { ok: false, error: `непідтримуваний тип поля «${k}»` };
  }
  return { ok: true, value: out };
}

function capArrays(v, n, depth = 0) {
  if (depth > 8) return v;
  if (Array.isArray(v)) {
    const a = v.slice(0, n).map((x) => capArrays(x, n, depth + 1));
    return v.length > n ? [...a, { _omitted: v.length - n }] : a;
  }
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = capArrays(x, n, depth + 1);
    return o;
  }
  return v;
}

/** JSON не довший за max символів: спершу скорочуються масиви, у крайньому разі — обрізається текст. */
export function fitJson(value, max) {
  let s = JSON.stringify(value) ?? "null";
  if (s.length <= max) return s;
  for (const n of [50, 20, 10, 5, 3, 1]) {
    s = JSON.stringify(capArrays(value, n));
    if (s.length <= max) return s;
  }
  return JSON.stringify({ _truncated: true, preview: s.slice(0, Math.max(0, max - 40)) });
}

/** Груба оцінка токенів: кирилиця токенізується гірше за латиницю, тому беремо запас. */
export const estimateTokens = (s) => Math.ceil(String(s ?? "").length / 2.5);

/** Початок доби UTC (мс). */
export const dayStartUtc = (now) => Math.floor(now / 864e5) * 864e5;

/**
 * Рішення про ліміти. Лічильники приходять із бази (ai_usage): користувача за добу й за хвилину, загальний за добу.
 * @returns {{ ok: true } | { ok: false, code: "user_minute" | "user_daily" | "global_daily", retryAfter: number }}
 */
export function rateDecision({ now, usedMinute, usedToday, globalToday, minuteLimit, dailyLimit, globalLimit }) {
  const toMidnight = Math.max(1, Math.ceil((dayStartUtc(now) + 864e5 - now) / 1000));
  if (globalToday >= globalLimit) return { ok: false, code: "global_daily", retryAfter: toMidnight };
  if (usedToday >= dailyLimit) return { ok: false, code: "user_daily", retryAfter: toMidnight };
  if (usedMinute >= minuteLimit) return { ok: false, code: "user_minute", retryAfter: 60 };
  return { ok: true };
}

/** Заголовок діалогу з першого повідомлення. */
export const makeTitle = (text) => cleanUntrusted(text, 60) || "Новий діалог";

/**
 * Контекст, з якого відкрито помічника (розділ, пара, бот). Приймаються лише відомі типи й валідні значення.
 * @returns {{ type: string, id?: string, pair?: string }}
 */
export function cleanContext(raw) {
  const types = ["home", "bot", "monitor", "chart", "backtest", "risk", "profile"];
  const c = raw && typeof raw === "object" ? raw : {};
  const out = { type: types.includes(c.type) ? c.type : "home" };
  if (isUuid(c.id)) out.id = c.id;
  if (typeof c.pair === "string" && /^[A-Z0-9]{2,12}\/[A-Z0-9]{2,12}$/.test(c.pair)) out.pair = c.pair;
  return out;
}
