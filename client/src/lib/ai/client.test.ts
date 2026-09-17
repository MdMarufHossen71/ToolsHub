import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AiError,
  chatCompletion,
  clearApiKey,
  editImage,
  generateImage,
  getAiSettings,
  getApiKey,
  hasApiKey,
  setAiSettings,
  setApiKey,
  DEFAULT_AI_SETTINGS,
} from "./client";
import { AI_SECRET_KEY } from "@/lib/storage";

class MemoryStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

describe("ai key storage", () => {
  it("saves, reads and clears without ever exposing the key elsewhere", () => {
    expect(hasApiKey()).toBe(false);
    expect(setApiKey("  sk-test-123  ")).toEqual({ ok: true });
    expect(getApiKey()).toBe("sk-test-123");
    expect(hasApiKey()).toBe(true);
    expect(clearApiKey()).toBe(true);
    expect(getApiKey()).toBe("");
  });

  it("rejects empty and absurd keys", () => {
    expect(setApiKey("   ")).toEqual({ ok: false, error: "empty" });
    expect(setApiKey("x".repeat(2001))).toEqual({ ok: false, error: "too-long" });
  });

  it("keeps the key under the secret storage key", () => {
    setApiKey("sk-test-123");
    expect(AI_SECRET_KEY).toBe("tgb:ai:secret");
    expect(localStorage.getItem(AI_SECRET_KEY)).toBe(JSON.stringify("sk-test-123"));
  });

  it("validates settings with safe defaults", () => {
    expect(getAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
    expect(setAiSettings({ baseUrl: "https://example.com/v1/", model: "  my-model " })).toBe(true);
    expect(getAiSettings()).toEqual({ baseUrl: "https://example.com/v1", model: "my-model" });
    expect(setAiSettings({ baseUrl: "notaurl" })).toBe(false);
  });
});

describe("chatCompletion", () => {
  it("posts an OpenAI-compatible body and returns trimmed text", async () => {
    setApiKey("sk-test");
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => okJson("  hello world  "));
    vi.stubGlobal("fetch", fetchMock);
    const out = await chatCompletion({ system: "Be brief.", user: "Hi" });
    expect(out).toBe("hello world");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init).toBeDefined();
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toEqual([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Hi" },
    ]);
  });

  it("maps provider failures to honest codes", async () => {
    setApiKey("sk-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    await expect(chatCompletion({ system: "s", user: "u" })).rejects.toMatchObject({ code: "bad-key" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow", { status: 429 })));
    await expect(chatCompletion({ system: "s", user: "u" })).rejects.toMatchObject({ code: "rate-limited" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 500 })));
    await expect(chatCompletion({ system: "s", user: "u" })).rejects.toMatchObject({ code: "bad-request" });
    vi.stubGlobal("fetch", vi.fn(async () => okJson("")));
    await expect(chatCompletion({ system: "s", user: "u" })).rejects.toMatchObject({ code: "bad-response" });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    await expect(chatCompletion({ system: "s", user: "u" })).rejects.toMatchObject({ code: "network" });
  });

  it("requires a key, refuses empty and oversized input", async () => {
    clearApiKey();
    await expect(chatCompletion({ system: "s", user: "u" })).rejects.toMatchObject({ code: "missing-key" });
    setApiKey("sk-test");
    await expect(chatCompletion({ system: "s", user: "  " })).rejects.toMatchObject({ code: "bad-request" });
    await expect(chatCompletion({ system: "s", user: "x".repeat(12001) })).rejects.toMatchObject({ code: "too-long" });
  });

  it("times out a hanging provider", async () => {
    setApiKey("sk-test");
    // Behaves like real fetch: rejects with AbortError once the signal aborts.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
      ),
    );
    await expect(chatCompletion({ system: "s", user: "u", timeoutMs: 30 })).rejects.toMatchObject({ code: "network" });
  });
});

describe("generateImage / editImage", () => {
  const imageJson = { data: [{ b64_json: "aGVsbG8=" }] };

  it("returns a PNG data URL from b64_json", async () => {
    setApiKey("sk-test");
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(imageJson), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await generateImage({ prompt: "a red cat" });
    expect(out).toBe("data:image/png;base64,aGVsbG8=");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(JSON.parse(init?.body as string).model).toBe("gpt-image-1");
  });

  it("edits with multipart and surfaces typed errors", async () => {
    setApiKey("sk-test");
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(imageJson), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["bytes"], "cat.png", { type: "image/png" });
    const out = await editImage({ image: file, prompt: "add a hat" });
    expect(out).toBe("data:image/png;base64,aGVsbG8=");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    expect(init?.body instanceof FormData).toBe(true);
    expect((init?.body as FormData).get("prompt")).toBe("add a hat");
  });

  it("rejects empty prompts and empty image answers", async () => {
    setApiKey("sk-test");
    await expect(generateImage({ prompt: "   " })).rejects.toBeInstanceOf(AiError);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
    await expect(generateImage({ prompt: "cat" })).rejects.toMatchObject({ code: "bad-response" });
  });
});
