import OpenAI from "openai";
import { createHash } from "node:crypto";

/**
 * Multi-provider LLM router. Every provider here speaks the OpenAI chat API,
 * so one client works for all. Order: Groq -> Gemini -> OpenRouter (free).
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

function providers(): Provider[] {
  const env = process.env;
  const all: Provider[] = [
    { id: "groq", label: "Groq", baseURL: "https://api.groq.com/openai/v1", model: env.GROQ_MODEL || "llama-3.3-70b-versatile", apiKey: env.GROQ_API_KEY, jsonMode: true },
    { id: "groq-fast", label: "Groq (fast)", baseURL: "https://api.groq.com/openai/v1", model: env.GROQ_FAST_MODEL || "llama-3.1-8b-instant", apiKey: env.GROQ_API_KEY, jsonMode: true },
    { id: "gemini", label: "Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", model: env.GEMINI_MODEL || "gemini-2.5-flash", apiKey: env.GEMINI_API_KEY, jsonMode: true },
    { id: "openrouter", label: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", model: env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free", apiKey: env.OPENROUTER_API_KEY, jsonMode: false },
  ];
  const order = (env.LLM_ORDER || "").split(",").map((s) => s.trim()).filter(Boolean);
  return order.length ? order.map((id) => all.find((p) => p.id === id)).filter((p): p is Provider => !!p) : all;
}

const status = new Map<string, ProviderStatus>();
const cache = new Map<string, LLMResult>();
const CACHE_MAX = 300;
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 20000);
const RETRIES = 2;

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
  for (const p of providers()) {
    if (!p.apiKey) continue;
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
        });
        const text = res.choices[0]?.message?.content?.trim() ?? "";
        if (!text) throw new Error("empty response");
        const latencyMs = Date.now() - started;
        status.set(p.id, { ...s, state: "ok", lastError: undefined, cooldownUntil: undefined, lastLatencyMs: latencyMs });
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
        if (attempt < RETRIES) await sleep(500 * 2 ** attempt);
        else errors.push(msg);
      }
    }
  }
  throw new AllProvidersFailed(errors.length ? errors : ["no AI provider configured"]);
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
