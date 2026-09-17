/**
 * Bring-your-own-key AI client.
 *
 * There is no server and no proxy: the browser calls the provider's
 * OpenAI-compatible API directly with the visitor's own key. The key lives in
 * localStorage under a secret key that backups refuse to export or import
 * (see `lib/storage.ts`), and it is sent only as an `Authorization` header to
 * the base URL the visitor configured. Nothing else in the app can read it —
 * `getApiKey` is the single reader, and it never logs.
 */

import { AI_SECRET_KEY, safeGet, safeRemove, safeSet, settingsKey } from "@/lib/storage";

const AI_SETTINGS_KEY = settingsKey("aiProvider");

export type AiProviderSettings = { baseUrl: string; model: string };

export const DEFAULT_AI_SETTINGS: AiProviderSettings = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

/** Longest single input we will send; longer text must be shortened first. */
export const AI_MAX_INPUT_CHARS = 12000;

/** Longest we wait for one answer before giving up. */
export const AI_TIMEOUT_MS = 60000;

/** Longest key we will store; real keys are far shorter, this only stops abuse. */
const MAX_KEY_CHARS = 2000;

export type AiErrorCode =
  | "missing-key"
  | "bad-key"
  | "rate-limited"
  | "bad-request"
  | "network"
  | "bad-response"
  | "too-long"
  | "unavailable";

/** Thrown for every expected AI failure so callers never parse HTTP themselves. */
export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }
}

/** The stored key, or "" when none is saved. Never logged, never exported. */
export function getApiKey(): string {
  const stored = safeGet<unknown>(AI_SECRET_KEY, "");
  return typeof stored === "string" ? stored : "";
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

export function setApiKey(key: string): { ok: true } | { ok: false; error: "empty" | "too-long" | "unavailable" } {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  if (trimmed.length > MAX_KEY_CHARS) return { ok: false, error: "too-long" };
  const result = safeSet(AI_SECRET_KEY, trimmed);
  return result.ok ? { ok: true } : { ok: false, error: "unavailable" };
}

/** Removes the key. Clearing app data removes it too; backups never contain it. */
export function clearApiKey(): boolean {
  return safeRemove(AI_SECRET_KEY);
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_AI_SETTINGS.baseUrl;
  return value.trim().replace(/\/+$/, "");
}

export function getAiSettings(): AiProviderSettings {
  const stored = safeGet<unknown>(AI_SETTINGS_KEY, {});
  const record = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const model = typeof record.model === "string" && record.model.trim() ? record.model.trim().slice(0, 200) : DEFAULT_AI_SETTINGS.model;
  return { baseUrl: normalizeBaseUrl(record.baseUrl), model };
}

export function setAiSettings(patch: Partial<AiProviderSettings>): boolean {
  const current = getAiSettings();
  const next: AiProviderSettings = {
    baseUrl: patch.baseUrl !== undefined ? normalizeBaseUrl(patch.baseUrl) : current.baseUrl,
    model: patch.model !== undefined && patch.model.trim() ? patch.model.trim().slice(0, 200) : current.model,
  };
  if (!/^https?:\/\//i.test(next.baseUrl)) return false;
  return safeSet(AI_SETTINGS_KEY, next).ok;
}

export type AiChatOptions = {
  system: string;
  user: string;
  maxTokens?: number;
  /** Test seam: defaults to {@link AI_TIMEOUT_MS}. */
  timeoutMs?: number;
  signal?: AbortSignal;
};

function readContent(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: unknown })?.message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

/**
 * One OpenAI-compatible chat call, browser to provider. Throws {@link AiError}
 * for every expected failure (no key, wrong key, rate limit, offline, timeout,
 * unusable answer) so tools can show one honest sentence each.
 */
export async function chatCompletion(options: AiChatOptions): Promise<string> {
  const user = options.user;
  if (!user.trim()) throw new AiError("bad-request", "Add an input first.");
  if (user.length > AI_MAX_INPUT_CHARS) {
    throw new AiError("too-long", `That input is ${user.length.toLocaleString("en")} characters; shorten it under ${AI_MAX_INPUT_CHARS.toLocaleString("en")}.`);
  }
  const { model } = getAiSettings();
  const data = await postApi("/chat/completions", {
    body: {
      model,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: user },
      ],
      max_tokens: options.maxTokens ?? 1024,
      temperature: 0.2,
    },
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
  const content = readContent(data);
  if (content === null) throw new AiError("bad-response", "The provider answered, but the reply was empty.");
  return content;
}

export type AiImageOptions = {
  prompt: string;
  /** Image model name; chat models cannot draw. Defaults to `gpt-image-1`. */
  model?: string;
  size?: "1024x1024" | "512x512";
  /** Test seam: defaults to {@link AI_TIMEOUT_MS}. */
  timeoutMs?: number;
  signal?: AbortSignal;
};

function readImageB64(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const list = (data as { data?: unknown }).data;
  if (!Array.isArray(list) || list.length === 0) return null;
  const b64 = (list[0] as { b64_json?: unknown })?.b64_json;
  return typeof b64 === "string" && b64.length > 0 ? b64 : null;
}

/**
 * Generates one image and returns it as a PNG data URL. The prompt must be
 * non-empty; the provider decides the rest, and the data URL stays in memory
 * (large generations are never written to storage).
 */
export async function generateImage(options: AiImageOptions): Promise<string> {
  const prompt = options.prompt.trim();
  if (!prompt) throw new AiError("bad-request", "Describe the image first.");
  const data = await postApi("/images/generations", {
    body: {
      model: options.model?.trim() || "gpt-image-1",
      prompt,
      n: 1,
      size: options.size ?? "1024x1024",
      response_format: "b64_json",
    },
    timeoutMs: options.timeoutMs ?? AI_TIMEOUT_MS * 2,
    signal: options.signal,
  });
  const b64 = readImageB64(data);
  if (b64 === null) throw new AiError("bad-response", "The provider answered, but no image came back.");
  return `data:image/png;base64,${b64}`;
}

export type AiImageEditOptions = AiImageOptions & { image: File };

/**
 * Edits the visitor's image by description. Sent as multipart (the browser
 * sets the boundary); the file is read only to be uploaded for this call.
 */
export async function editImage(options: AiImageEditOptions): Promise<string> {
  const prompt = options.prompt.trim();
  if (!prompt) throw new AiError("bad-request", "Describe the change first.");
  const form = new FormData();
  form.set("image", options.image);
  form.set("prompt", prompt);
  form.set("model", options.model?.trim() || "gpt-image-1");
  form.set("n", "1");
  form.set("size", options.size ?? "1024x1024");
  form.set("response_format", "b64_json");
  const data = await postApi("/images/edits", {
    form,
    timeoutMs: options.timeoutMs ?? AI_TIMEOUT_MS * 2,
    signal: options.signal,
  });
  const b64 = readImageB64(data);
  if (b64 === null) throw new AiError("bad-response", "The provider answered, but no image came back.");
  return `data:image/png;base64,${b64}`;
}

type PostApiOptions = {
  body?: Record<string, unknown> | undefined;
  form?: FormData | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
};

/**
 * Single authenticated POST with the shared timeout, abort and error mapping.
 * Every AI call goes through here, so a new failure mode is fixed once.
 */
async function postApi(path: string, options: PostApiOptions): Promise<unknown> {
  const key = getApiKey();
  if (!key) throw new AiError("missing-key", "Add your provider API key on the AI page first.");
  const { baseUrl } = getAiSettings();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? AI_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener("abort", forwardAbort);
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: options.form
          ? { Authorization: `Bearer ${key}` }
          : { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: options.form ?? JSON.stringify(options.body ?? {}),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AiError("network", "The request timed out or was stopped. Try again.");
      }
      throw new AiError("network", "Could not reach the provider. Check the connection and base URL.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new AiError("bad-key", "The provider refused the key. Check it on the AI page.");
    }
    if (response.status === 429) {
      throw new AiError("rate-limited", "The provider rate-limited this key. Wait a little and try again.");
    }
    if (!response.ok) throw new AiError("bad-request", `The provider answered ${response.status}. Check the model name.`);
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new AiError("bad-response", "The provider answered, but the reply was unreadable.");
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
