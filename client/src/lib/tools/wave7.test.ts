import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runTool, type ToolTranslate } from "../toolOperations";
import { setApiKey, clearApiKey } from "../ai/client";

const t = ((key: string) => key) as ToolTranslate;
const run = (slug: string, fields: Record<string, string>, input = "") =>
  runTool(slug, input, "default", t, { fields });

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

function okJson(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

describe("Wave 7 AI tools (BYOK)", () => {
  it("answers through the provider when a key is saved", async () => {
    setApiKey("sk-test");
    vi.stubGlobal("fetch", vi.fn(async () => okJson("paraphrased!")));
    expect((await run("ai-paraphraser", { text: "hello", tone: "same" })).text).toBe("paraphrased!");
    expect((await run("ai-summarizer", { text: "long text here", shape: "bullets" })).text).toBe("paraphrased!");
    expect((await run("ai-grammar-fixer", { text: "she go" })).text).toBe("paraphrased!");
    expect((await run("ai-translator", { text: "hello", target: "bn" })).text).toBe("paraphrased!");
    expect((await run("ai-tone-changer", { text: "do it", tone: "formal" })).text).toBe("paraphrased!");
    expect((await run("ai-code-helper", { code: "x=1", task: "explain" })).text).toBe("paraphrased!");
    expect((await run("ai-chat-assistant", { text: "hi there" })).text).toBe("paraphrased!");
  });

  it("asks for a key instead of calling anyone", async () => {
    clearApiKey();
    const spy = vi.fn(async () => okJson("x"));
    vi.stubGlobal("fetch", spy);
    const out = await run("ai-chat-assistant", { text: "hi" });
    expect(out.error).toBe(true);
    expect(out.text).toBe("ai.error.missing-key");
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps provider refusals to honest errors", async () => {
    setApiKey("sk-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    const out = await run("ai-summarizer", { text: "hello world, this is long enough" });
    expect(out.error).toBe(true);
    expect(out.text).toBe("ai.error.bad-key");
  });

  it("rejects empty input locally", async () => {
    setApiKey("sk-test");
    const out = await run("ai-translator", { text: "   ", target: "bn" });
    expect(out.error).toBe(true);
  });

  it("generates images as downloadable artifacts", async () => {
    setApiKey("sk-test");
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ data: [{ b64_json: "aGVsbG8=" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await run("ai-image-generator", { prompt: "a cat", model: "gpt-image-1", size: "512x512" });
    expect(out.image).toBe("data:image/png;base64,aGVsbG8=");
    expect(out.artifacts?.[0]?.name).toBe("ai-image.png");
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse((init?.body as string) ?? "{}").size).toBe("512x512");
  });

  it("edits a picked image and refuses without one", async () => {
    setApiKey("sk-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: "eWVz" }] }), { status: 200 })));
    const file = new File(["bytes"], "cat.png", { type: "image/png" });
    const out = await runTool("ai-image-editor", "", "default", t, { fields: { prompt: "hat", model: "gpt-image-1" }, files: [file] });
    expect(out.image).toBe("data:image/png;base64,eWVz");
    const missing = await run("ai-image-editor", { prompt: "hat" });
    expect(missing.error).toBe(true);
  });
});
