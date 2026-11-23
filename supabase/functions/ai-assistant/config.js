// Налаштування Orbix AI з секретів Edge Function (Supabase → Edge Functions → Secrets).
// Чиста логіка без мережі (тестується в Node: tests/ai-config.test.mjs).
//
// Секрети (жоден не потрапляє в браузер):
//   AI_ENABLED            "true" — увімкнути помічника; будь-що інше — вимкнено (боти від цього не залежать)
//   AI_API_KEY            ключ провайдера (безкоштовний, наприклад Groq: console.groq.com/keys)
//   AI_BASE_URL           адреса API, сумісного з OpenAI Chat Completions (за замовчуванням Groq)
//   AI_DEFAULT_MODEL      назва моделі — обов'язкова, у коді не зашита (моделі безкоштовного тарифу змінюються)
//   AI_MAX_INPUT_TOKENS   бюджет запиту до моделі (історія обрізається під нього)
//   AI_MAX_OUTPUT_TOKENS  максимум токенів у відповіді
//   AI_DAILY_LIMIT        повідомлень на користувача за добу UTC
//   AI_MINUTE_LIMIT       повідомлень на користувача за хвилину
//   AI_GLOBAL_DAILY_LIMIT звернень до провайдера за добу UTC на всіх (безкоштовний ключ спільний)

export const DEFAULTS = Object.freeze({
  baseUrl: "https://api.groq.com/openai/v1",
  maxInputTokens: 6000,
  maxOutputTokens: 700,
  dailyLimit: 25,
  minuteLimit: 4,
  globalDailyLimit: 600,
  maxToolRounds: 4,
  timeoutMs: 25000,
  historyMessages: 8,
  maxMessageChars: 1500,
  toolResultChars: 5000,
});

const int = (v, def, min, max) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Адреса API лише https (або http://localhost для перевірки); без пробілів і завершального «/». */
export function normalizeBaseUrl(v) {
  const s = String(v ?? "").trim().replace(/\/+$/, "");
  if (!s) return DEFAULTS.baseUrl;
  try {
    const u = new URL(s);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol === "https:" || (local && u.protocol === "http:")) return s;
  } catch (_e) { /* некоректна адреса — нижче */ }
  return null;
}

/**
 * @param {(name: string) => string | undefined} get — читання секрету (у Deno: Deno.env.get)
 * @returns {{ ok: boolean, reason?: string, cfg: object }}
 */
export function readConfig(get) {
  const baseUrl = normalizeBaseUrl(get("AI_BASE_URL"));
  const cfg = {
    enabled: get("AI_ENABLED") === "true",
    apiKey: String(get("AI_API_KEY") ?? "").trim(),
    baseUrl,
    model: String(get("AI_DEFAULT_MODEL") ?? "").trim(),
    maxInputTokens: int(get("AI_MAX_INPUT_TOKENS"), DEFAULTS.maxInputTokens, 1000, 100000),
    maxOutputTokens: int(get("AI_MAX_OUTPUT_TOKENS"), DEFAULTS.maxOutputTokens, 100, 8000),
    dailyLimit: int(get("AI_DAILY_LIMIT"), DEFAULTS.dailyLimit, 1, 10000),
    minuteLimit: int(get("AI_MINUTE_LIMIT"), DEFAULTS.minuteLimit, 1, 600),
    globalDailyLimit: int(get("AI_GLOBAL_DAILY_LIMIT"), DEFAULTS.globalDailyLimit, 1, 1000000),
    maxToolRounds: DEFAULTS.maxToolRounds,
    timeoutMs: DEFAULTS.timeoutMs,
    historyMessages: DEFAULTS.historyMessages,
    maxMessageChars: DEFAULTS.maxMessageChars,
    toolResultChars: DEFAULTS.toolResultChars,
  };
  if (!cfg.enabled) return { ok: false, reason: "disabled", cfg };
  if (!baseUrl) return { ok: false, reason: "bad_base_url", cfg };
  if (!cfg.apiKey) return { ok: false, reason: "no_key", cfg };
  if (!cfg.model) return { ok: false, reason: "no_model", cfg };
  return { ok: true, cfg };
}
