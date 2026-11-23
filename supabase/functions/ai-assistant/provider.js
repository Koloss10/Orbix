// Постачальник моделі для Orbix AI. Інтерфейс AIProvider і перший адаптер OpenAIProvider.
// Адаптер говорить протоколом OpenAI Chat Completions, тож працює з безкоштовними Groq, Google Gemini
// (адреса .../v1beta/openai), OpenRouter та самим OpenAI: змінюється лише AI_BASE_URL, AI_API_KEY і AI_DEFAULT_MODEL.
// Інший протокол — окремий клас із тими самими методами, без змін в ai-assistant/index.ts.
// Чиста логіка (fetch передається ззовні): тестується в Node без мережі, tests/ai-provider.test.mjs.

/** Код помилки провайдера: quota | unavailable | timeout | auth | bad_request | bad_response */
export class AIProviderError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
    this.status = extra.status ?? 0;
    this.retryAfter = extra.retryAfter ?? 0;
  }
}

/**
 * Інтерфейс постачальника.
 * @typedef {{ role: "system" | "user" | "assistant" | "tool", content: string | null, tool_calls?: object[], tool_call_id?: string }} ChatMessage
 * @typedef {{ id: string, name: string, args: string }} ToolCall
 * @typedef {{ text: string, toolCalls: ToolCall[], usage: { input: number, output: number }, finish: string }} ProviderReply
 */
export class AIProvider {
  /** Один запит до моделі. @param {{ messages: ChatMessage[], tools?: object[], maxTokens?: number }} _req @returns {Promise<ProviderReply>} */
  async generateResponse(_req) { throw new Error("not implemented"); }
  /** Діалог з викликами інструментів до фінальної відповіді. */
  async continueConversation(_req) { throw new Error("not implemented"); }
  /** Виконати виклики інструментів, повернути повідомлення role=tool. */
  async callTools(_calls, _run) { throw new Error("not implemented"); }
  /** Чи доступний провайдер. */
  async healthCheck() { throw new Error("not implemented"); }
  /** Накопичене використання цього екземпляра. */
  getUsage() { throw new Error("not implemented"); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_RETRY_WAIT_MS = 3000;

export class OpenAIProvider extends AIProvider {
  /** @param {{ baseUrl: string, apiKey: string, model: string, maxOutputTokens: number, timeoutMs: number }} cfg @param {typeof fetch} [fetchImpl] @param {{ retries?: number, backoffMs?: number }} [opts] */
  constructor(cfg, fetchImpl = fetch, opts = {}) {
    super();
    this.cfg = cfg;
    this.fetch = fetchImpl;
    this.retries = opts.retries ?? 2;
    this.backoffMs = opts.backoffMs ?? 400;
    this.usage = { input: 0, output: 0, requests: 0 };
  }

  /** Один запит без повторів. Помилки перетворюються на AIProviderError; retry = чи варто повторити. */
  async #once(path, body) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.cfg.timeoutMs);
    try {
      const r = await this.fetch(this.cfg.baseUrl + path, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      this.usage.requests++;
      if (r.ok) return await r.json();
      const retryAfter = Number.parseFloat(r.headers?.get?.("retry-after") ?? "") || 0;
      // у відповідь не потрапляє текст помилки провайдера: він може містити фрагменти запиту
      if (r.status === 429) {
        const e = new AIProviderError("quota", "ліміт запитів провайдера", { status: 429, retryAfter });
        // довге очікування безкоштовної квоти не варто: одразу повідомляємо користувача
        e.retry = retryAfter * 1000 <= MAX_RETRY_WAIT_MS;
        throw e;
      }
      if (r.status >= 500) { const e = new AIProviderError("unavailable", `провайдер недоступний (HTTP ${r.status})`, { status: r.status }); e.retry = true; throw e; }
      if (r.status === 401 || r.status === 403) throw new AIProviderError("auth", "ключ провайдера не прийнято", { status: r.status });
      throw new AIProviderError("bad_request", `провайдер відхилив запит (HTTP ${r.status})`, { status: r.status });
    } catch (e) {
      if (e instanceof AIProviderError) throw e;
      const err = e?.name === "AbortError"
        ? new AIProviderError("timeout", "провайдер не відповів вчасно")
        : new AIProviderError("unavailable", "немає зв'язку з провайдером");
      err.retry = true;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async #post(path, body) {
    let last;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt) await sleep(Math.min(MAX_RETRY_WAIT_MS, last?.retryAfter ? last.retryAfter * 1000 : this.backoffMs * 2 ** (attempt - 1)));
      try {
        return await this.#once(path, body);
      } catch (e) {
        if (!e.retry) throw e;
        last = e;
      }
    }
    throw last;
  }

  async generateResponse({ messages, tools, maxTokens }) {
    const body = { model: this.cfg.model, messages, max_tokens: maxTokens ?? this.cfg.maxOutputTokens, temperature: 0.2 };
    if (tools?.length) { body.tools = tools; body.tool_choice = "auto"; }
    const j = await this.#post("/chat/completions", body);
    const ch = j?.choices?.[0];
    const m = ch?.message;
    if (!m) throw new AIProviderError("bad_response", "порожня відповідь провайдера");
    const toolCalls = (m.tool_calls ?? [])
      .filter((t) => t?.function?.name)
      .map((t, i) => ({ id: String(t.id ?? `call_${i}`), name: String(t.function.name), args: String(t.function.arguments ?? "{}") }));
    const usage = { input: +j?.usage?.prompt_tokens || 0, output: +j?.usage?.completion_tokens || 0 };
    this.usage.input += usage.input;
    this.usage.output += usage.output;
    return { text: typeof m.content === "string" ? m.content : "", toolCalls, usage, finish: String(ch.finish_reason ?? "") };
  }

  async callTools(calls, run) {
    const out = [];
    for (const c of calls) {
      let args;
      try { args = c.args?.trim() ? JSON.parse(c.args) : {}; } catch (_e) { args = null; }
      const r = args === null ? { content: JSON.stringify({ error: "аргументи інструмента не є коректним JSON" }), step: { name: c.name, ok: false } } : await run(c.name, args);
      out.push({ message: { role: "tool", tool_call_id: c.id, content: r.content }, step: r.step });
    }
    return out;
  }

  /**
   * Цикл «модель → інструменти → модель». В останньому колі інструменти не передаються, тож модель мусить відповісти.
   * @returns {{ text: string, steps: object[], usage: { input: number, output: number }, rounds: number }}
   */
  async continueConversation({ messages, tools, run, maxRounds, maxTokens }) {
    const msgs = [...messages], steps = [], usage = { input: 0, output: 0 };
    for (let round = 1; round <= maxRounds; round++) {
      const last = round === maxRounds;
      const r = await this.generateResponse({ messages: msgs, tools: last ? undefined : tools, maxTokens });
      usage.input += r.usage.input;
      usage.output += r.usage.output;
      if (!r.toolCalls.length || last) return { text: r.text.trim(), steps, usage, rounds: round };
      msgs.push({ role: "assistant", content: r.text || null, tool_calls: r.toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: t.args } })) });
      for (const x of await this.callTools(r.toolCalls, run)) { msgs.push(x.message); steps.push(x.step); }
    }
    return { text: "", steps, usage, rounds: maxRounds };
  }

  async healthCheck() {
    try {
      const r = await this.fetch(this.cfg.baseUrl + "/models", { headers: { authorization: `Bearer ${this.cfg.apiKey}` }, signal: AbortSignal.timeout(5000) });
      return { ok: r.ok, status: r.status };
    } catch (_e) {
      return { ok: false, status: 0 };
    }
  }

  getUsage() { return { ...this.usage }; }
}

/** Текст помилки провайдера для користувача (без технічних деталей). */
export function providerErrorText(e) {
  switch (e?.code) {
    case "quota": return "Безкоштовний ліміт AI-провайдера на зараз вичерпано. Спробуйте за кілька хвилин.";
    case "timeout": return "AI-провайдер не відповів вчасно. Спробуйте ще раз.";
    case "unavailable": return "AI-провайдер тимчасово недоступний. Боти працюють у звичайному режимі.";
    case "auth": return "AI не налаштовано на сервері (ключ провайдера). Напишіть власнику платформи.";
    default: return "Не вдалося отримати відповідь AI. Спробуйте ще раз.";
  }
}
