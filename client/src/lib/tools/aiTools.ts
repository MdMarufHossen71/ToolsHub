/** AI wave: bring-your-own-key tools over an OpenAI-compatible API. */
import { AiError, chatCompletion, editImage, generateImage } from "@/lib/ai/client";
import { ToolError, field, type ToolRunner } from "@/lib/toolOperations";
import type { TranslationKey } from "@/i18n/translations";

function aiFailure(error: unknown): never {
  if (error instanceof AiError) {
    // Every code has a matching `ai.error.*` key except `unavailable`, which
    // the client never throws today — kept as the honest fallback.
    const key = (error.code === "unavailable" ? "tool.error.generic" : `ai.error.${error.code}`) as TranslationKey;
    throw new ToolError(key);
  }
  throw error;
}

async function ask(system: string, user: string, maxTokens: number): Promise<string> {
  try {
    return await chatCompletion({ system, user, maxTokens });
  } catch (error) {
    aiFailure(error);
  }
}

export const runAiTools: ToolRunner = async (slug, input, _option, t, extra) => {
  const F = (key: string, fallback = "") => field(extra, key, fallback);

  if (slug === "ai-chat-assistant") {
    const text = F("text", input).trim();
    if (!text) throw new ToolError("tool.error.generic");
    return { text: await ask("You are a helpful assistant inside ToolsHub, a private browser workbench. Answer directly and briefly.", text, 1024) };
  }
  if (slug === "ai-paraphraser") {
    const text = F("text", input).trim();
    if (!text) throw new ToolError("tool.error.generic");
    const tone = F("tone", "same");
    const system =
      tone === "same"
        ? "Rewrite the user's text with different wording but the same meaning and language. Reply with only the rewrite, no commentary."
        : `Rewrite the user's text in a ${tone} tone, keeping the meaning and language. Reply with only the rewrite, no commentary.`;
    return { text: await ask(system, text, 1024) };
  }
  if (slug === "ai-summarizer") {
    const text = F("text", input).trim();
    if (!text) throw new ToolError("tool.error.generic");
    const system =
      F("shape", "short") === "bullets"
        ? "Summarize the user's text as a short bullet list of its key points. Reply with only the bullets."
        : "Summarize the user's text in two or three sentences. Reply with only the summary.";
    return { text: await ask(system, text, 512) };
  }
  if (slug === "ai-grammar-fixer") {
    const text = F("text", input).trim();
    if (!text) throw new ToolError("tool.error.generic");
    return { text: await ask("Fix the grammar, spelling and punctuation of the user's text. Reply with only the corrected text, in the same language.", text, 1024) };
  }
  if (slug === "ai-translator") {
    const text = F("text", input).trim();
    if (!text) throw new ToolError("tool.error.generic");
    const system =
      F("target", "en") === "bn"
        ? "Translate the user's text into Bangla. Reply with only the translation."
        : "Translate the user's text into English. Reply with only the translation.";
    return { text: await ask(system, text, 1024) };
  }
  if (slug === "ai-tone-changer") {
    const text = F("text", input).trim();
    if (!text) throw new ToolError("tool.error.generic");
    const tone = F("tone", "formal");
    return { text: await ask(`Recast the user's message as ${tone}. Reply with only the recast message.`, text, 1024) };
  }
  if (slug === "ai-code-helper") {
    const code = F("code", input).trim();
    if (!code) throw new ToolError("tool.error.generic");
    const task = F("task", "explain");
    const system =
      task === "review"
        ? "Review the user's code for bugs and risks. Be specific and brief."
        : task === "refactor"
          ? "Refactor the user's code for clarity. Reply with the refactored code and one short note."
          : "Explain what the user's code does, briefly and plainly.";
    return { text: await ask(system, code, 1536) };
  }
  if (slug === "ai-image-generator") {
    const prompt = F("prompt", input).trim();
    if (!prompt) throw new ToolError("tool.error.generic");
    const size = F("size", "1024x1024") === "512x512" ? "512x512" : "1024x1024";
    try {
      const dataUrl = await generateImage({ prompt, model: F("model", "gpt-image-1"), size });
      return {
        text: t("tool.result.imageReady"),
        image: dataUrl,
        artifacts: [{ name: "ai-image.png", mime: "image/png", dataUrl }],
      };
    } catch (error) {
      aiFailure(error);
    }
  }
  if (slug === "ai-image-editor") {
    const file = extra?.files?.[0];
    if (!file) throw new ToolError("tool.error.generic");
    const prompt = F("prompt", input).trim();
    if (!prompt) throw new ToolError("tool.error.generic");
    try {
      const dataUrl = await editImage({ image: file, prompt, model: F("model", "gpt-image-1"), size: "1024x1024" });
      return {
        text: t("tool.result.imageReady"),
        image: dataUrl,
        artifacts: [{ name: "ai-edit.png", mime: "image/png", dataUrl }],
      };
    } catch (error) {
      aiFailure(error);
    }
  }
  if (slug === "pdf-q-a") {
    const file = extra?.files?.[0];
    if (!file) throw new ToolError("tool.error.generic");
    const question = F("question", input).trim();
    if (!question) throw new ToolError("tool.error.generic");
    const context = await extractPdfContext(file);
    const system =
      "Answer the user's question using only the document below. " +
      "If the answer is not in it, say so plainly instead of guessing." +
      (context.truncated ? " The document was cut short, so mention that when relevant." : "");
    return { text: await ask(`${system}\n\n--- document (${file.name}) ---\n${context.text}`, `Question: ${question}`, 1024) };
  }
  return null;
};

/**
 * First pages of a PDF as plain text, capped so the request stays honest and
 * affordable. Reports whether the document was cut short.
 */
async function extractPdfContext(file: File): Promise<{ text: string; truncated: boolean }> {
  if (typeof document === "undefined") throw new ToolError("tool.error.generic");
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default as string;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch {
    throw new ToolError("tool.error.generic");
  }
  const MAX_PAGES = 8;
  const MAX_CHARS = 6000;
  const parts: string[] = [];
  let truncated = doc.numPages > MAX_PAGES;
  const count = Math.min(doc.numPages, MAX_PAGES);
  for (let i = 1; i <= count; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ("str" in (item as Record<string, unknown>) ? String((item as Record<string, unknown>).str) : ""))
      .filter(Boolean);
    parts.push(strings.join(" "));
    if (parts.join("\n").length >= MAX_CHARS) {
      truncated = true;
      break;
    }
  }
  if (typeof (doc as unknown as { cleanup?: unknown }).cleanup === "function") {
    (doc as unknown as { cleanup: () => void }).cleanup();
  }
  return { text: parts.join("\n").slice(0, MAX_CHARS), truncated };
}
