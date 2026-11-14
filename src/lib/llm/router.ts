import OpenAI from "openai";
import { createHash } from "node:crypto";

/**
 * Multi-provider LLM router. Every provider here speaks the OpenAI chat API,
 * so one client works for all. Requests rotate across a pool of free-tier
 * models (round-robin), with Groq-fast / OpenRouter as last-resort backups.
 * Handles rate limits (429) with a per-provider cool-down, retries transient
 * errors with exponential backoff, times out slow calls and caches answers.
 */
export interface Provider {
  id: string;
  label: string;
  baseURL: string;
  model: string;
  apiKey: string | undefined;
  jsonMode: boolean;
  /** Extra request fields (e.g. lower "thinking" for faster answers). */
  extra?: Record<string, unknown>;
  /** Primary pool members are used in round-robin; others are last-resort backups. */
  pool: boolean;
}

export interface ProviderStatus {
  id: string;
  label: string;
  model: string;
  configured: boolean;
  state: "ok" | "cooling" | "error" | "unused";
  lastError?: string;
  cooldownUntil?: number;
  lastLatencyMs?: number;
  calls?: number;
}

export interface LLMResult {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  cached: boolean;
}

export class AllProvidersFailed extends Error {
  constructor(public details: string[]) {
    super(`All AI providers failed: ${details.join(" | ")}`);
  }
}

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GROQ = "https://api.groq.com/openai/v1";

/**
 * Gemini models. Only quick models are used (measured ~1-5 s): Flash Lite
 * (15 RPM / 500 per day) and 3 Flash. Larger Flash models and Gemma took
 * 20-40 s, so they are left out (add them via GEMINI_BACKUP_MODELS if needed).
 * Override with GEMINI_MODELS / GEMINI_BACKUP_MODELS="model-a,model-b".
 */
const list = (v: string | undefined, d: string) => (v || d).split(",").map((m) => m.trim()).filter(Boolean);

function geminiProvider(model: string, pool: boolean, apiKey: string | undefined): Provider {
  const gemma = model.startsWith("gemma");
  return {
    id: `gemini:${model}`,
    label: gemma ? `Gemma (${model})` : `Gemini (${model})`,
    baseURL: GEMINI,
    model,
    apiKey,
    jsonMode: !gemma,
    extra: gemma ? undefined : { reasoning_effort: "low" },
    pool,
  };
}

function providers(): Provider[] {
  const env = process.env;
  const key = env.GEMINI_API_KEY;
  const gemini: Provider[] = [
    ...list(env.GEMINI_MODELS, "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3-flash-preview").map((m) => geminiProvider(m, true, key)),
    ...list(env.GEMINI_BACKUP_MODELS, "").map((m) => geminiProvider(m, false, key)),
  ];
  const all: Provider[] = [
    ...gemini,
    { id: "groq", label: "Groq", baseURL: GROQ, model: env.GROQ_MODEL || "llama-3.3-70b-versatile", apiKey: env.GROQ_API_KEY, jsonMode: true, pool: true },
    { id: "groq-fast", label: "Groq (fast)", baseURL: GROQ, model: env.GROQ_FAST_MODEL || "llama-3.1-8b-instant", apiKey: env.GROQ_API_KEY, jsonMode: true, pool: false },
    { id: "openrouter", label: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", model: env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free", apiKey: env.OPENROUTER_API_KEY, jsonMode: false, pool: false },
  ];
  return all;
}

let rrCounter = 0;

/**
 * Round-robin: request 1 starts at model A, request 2 at model B, request 3 at
 * model C, request 4 back at A... If the chosen model fails, the rest of the
 * pool is tried in order, then the backups. Spreads load across free quotas.
 */
function rotation(): Provider[] {
  const ready = providers().filter((p) => p.apiKey);
  const pool = ready.filter((p) => p.pool);
  const backups = ready.filter((p) => !p.pool);
  if (pool.length === 0) return backups;
  const start = rrCounter++ % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start), ...backups];
}

const status = new Map<string, ProviderStatus>();
const cache = new Map<string, LLMResult>();
const CACHE_MAX = 300;
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 25000);
const RETRIES = 1;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function providerStatus(): ProviderStatus[] {
  const now = Date.now();
  return providers().map((p) => {
    const s = status.get(p.id);
    const cooling = s?.cooldownUntil && s.cooldownUntil > now;
    return {
      id: p.id,
      label: p.label,
      model: p.model,
      configured: !!p.apiKey,
      state: !p.apiKey ? "unused" : cooling ? "cooling" : (s?.state ?? "ok"),
      lastError: s?.lastError,
      cooldownUntil: cooling ? s!.cooldownUntil : undefined,
      lastLatencyMs: s?.lastLatencyMs,
      calls: s?.calls ?? 0,
    };
  });
}

export function anyProviderConfigured(): boolean {
  return providers().some((p) => !!p.apiKey);
}

function retryAfterMs(err: unknown): number {
  const h = (err as { headers?: Record<string, string> | Headers })?.headers;
  const raw = h instanceof Headers ? h.get("retry-after") : h?.["retry-after"];
  const secs = Number(raw);
  return Number.isFinite(secs) && secs > 0 ? Math.min(secs * 1000, 120000) : 30000;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function complete(messages: ChatMessage[], opts: { json?: boolean; temperature?: number; maxTokens?: number } = {}): Promise<LLMResult> {
  const key = createHash("sha256").update(JSON.stringify({ messages, opts })).digest("hex");
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true, latencyMs: 0 };

  const errors: string[] = [];
  for (const p of rotation()) {
    const s = status.get(p.id) ?? { id: p.id, label: p.label, model: p.model, configured: true, state: "ok" as const };
    if (s.cooldownUntil && s.cooldownUntil > Date.now()) {
      errors.push(`${p.label}: cooling down after rate limit`);
      continue;
    }
    const client = new OpenAI({ apiKey: p.apiKey, baseURL: p.baseURL, timeout: TIMEOUT_MS, maxRetries: 0 });

    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      const started = Date.now();
      try {
        const res = await client.chat.completions.create({
          model: p.model,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 1800,
          ...(opts.json && p.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
          ...(p.extra ?? {}),
        } as OpenAI.ChatCompletionCreateParamsNonStreaming);
        const text = stripThoughts(res.choices[0]?.message?.content ?? "");
        if (!text) throw new Error("empty response");
        const latencyMs = Date.now() - started;
        status.set(p.id, { ...s, state: "ok", lastError: undefined, cooldownUntil: undefined, lastLatencyMs: latencyMs, calls: (s.calls ?? 0) + 1 });
        const result = { text, provider: p.label, model: p.model, latencyMs, cached: false };
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
        cache.set(key, result);
        return result;
      } catch (err) {
        const code = (err as { status?: number })?.status;
        const msg = `${p.label}: ${code ?? ""} ${(err as Error)?.message ?? err}`.slice(0, 200);
        if (code === 429) {
          status.set(p.id, { ...s, state: "cooling", lastError: "rate limited", cooldownUntil: Date.now() + retryAfterMs(err) });
          errors.push(msg);
          break; // move to next provider immediately
        }
        if (code === 401 || code === 403 || code === 400 || code === 404) {
          status.set(p.id, { ...s, state: "error", lastError: msg });
          errors.push(msg);
          break; // not transient
        }
        status.set(p.id, { ...s, state: "error", lastError: msg });
        if (/timed? ?out/i.test(msg)) {
          errors.push(msg);
          break; // slow model: try the next one instead of waiting again
        }
        if (attempt < RETRIES) await sleep(500 * 2 ** attempt);
        else errors.push(msg);
      }
    }
  }
  throw new AllProvidersFailed(errors.length ? errors : ["no AI provider configured"]);
}

/** Removes reasoning blocks some open models put before the answer. */
export function stripThoughts(text: string): string {
  return text.replace(/<(thought|think)>[\s\S]*?<\/\1>/gi, "").replace(/^[\s\S]*<\/(?:thought|think)>/i, "").trim();
}

/** Pulls the first JSON object out of a model reply (handles ```json fences). */
export function parseJsonReply<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
