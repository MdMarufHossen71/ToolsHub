/** File & PDF wave: File API first, jszip + pdf-lib loaded on demand. */
import { ToolError, field, type ToolRunner } from "@/lib/toolOperations";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

function needFiles(extra: { files?: File[] } | undefined, min: 1, mime?: string): [File, ...File[]];
function needFiles(extra: { files?: File[] } | undefined, min: 2, mime?: string): [File, File, ...File[]];
function needFiles(extra: { files?: File[] } | undefined, min: number, mime = ""): File[] {
  const files = (extra?.files ?? []).filter((f) => (mime === "" || f.type === mime || (mime === "application/pdf" && f.name.toLowerCase().endsWith(".pdf"))));
  if (files.length < min) throw new ToolError("tool.error.generic");
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new ToolError("tool.error.fileTooLarge");
  }
  return files;
}

function downloadArtifact(name: string, mime: string, bytes: Uint8Array): { name: string; mime: string; dataUrl: string } {
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    for (let j = i; j < Math.min(i + CHUNK, bytes.length); j += 1) binary += String.fromCharCode(bytes[j] ?? 0);
  }
  return { name, mime, dataUrl: `data:${mime};base64,${btoa(binary)}` };
}

/** 1-based page ranges like "1-3,5" against a page count. Pure. */
export function parseRanges(spec: string, pages: number): number[] {
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const dash = trimmed.indexOf("-");
    if (dash < 0) {
      const page = Number(trimmed);
      if (!Number.isInteger(page) || page < 1 || page > pages) throw new ToolError("tool.error.generic");
      out.push(page - 1);
      continue;
    }
    const from = Number(trimmed.slice(0, dash));
    const to = Number(trimmed.slice(dash + 1));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > pages || from > to) throw new ToolError("tool.error.generic");
    for (let p = from; p <= to; p += 1) out.push(p - 1);
  }
  if (out.length === 0) throw new ToolError("tool.error.generic");
  return out;
}

const MAGIC: Array<[string, number[], string]> = [
  ["PNG image", [0x89, 0x50, 0x4e, 0x47], "image/png"],
  ["JPEG image", [0xff, 0xd8, 0xff], "image/jpeg"],
  ["GIF image", [0x47, 0x49, 0x46], "image/gif"],
  ["WebP image", [0x52, 0x49, 0x46, 0x46], "image/webp"],
  ["PDF document", [0x25, 0x50, 0x44, 0x46], "application/pdf"],
  ["ZIP archive", [0x50, 0x4b, 0x03, 0x04], "application/zip"],
  ["GZIP archive", [0x1f, 0x8b], "application/gzip"],
  ["MP3 audio", [0x49, 0x44, 0x33], "audio/mpeg"],
  ["SQLite database", [0x53, 0x51, 0x4c, 0x69], "application/x-sqlite3"],
];

export const runFileTools: ToolRunner = async (slug, input, _option, _t, extra) => {
  const F = (key: string, fallback = "") => field(extra, key, fallback);

  if (slug === "split-file") {
    const [file] = needFiles(extra, 1);
    const parts = Math.min(Math.max(parseInt(F("parts", "3"), 10) || 3, 2), 99);
    const buffer = new Uint8Array(await file.arrayBuffer());
    const chunk = Math.ceil(buffer.length / parts);
    const artifacts = [];
    for (let i = 0; i < parts; i += 1) {
      const slice = buffer.slice(i * chunk, (i + 1) * chunk);
      if (slice.length === 0) break;
      artifacts.push(downloadArtifact(`${file.name}.part${i + 1}`, "application/octet-stream", slice));
    }
    return { text: JSON.stringify({ file: file.name, bytes: buffer.length, parts: artifacts.length }, null, 2), artifacts };
  }
  if (slug === "join-files") {
    const files = needFiles(extra, 2);
    const chunks: number[] = [];
    let total = 0;
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      total += bytes.length;
      for (let i = 0; i < bytes.length; i += 1) chunks.push(bytes[i] ?? 0);
    }
    const name = files[0].name.replace(/\.part\d+$/i, "") || "joined.bin";
    return {
      text: JSON.stringify({ files: files.map((f) => f.name), bytes: total, joined: name }, null, 2),
      artifacts: [downloadArtifact(name, "application/octet-stream", new Uint8Array(chunks))],
    };
  }
  if (slug === "file-type-detector") {
    const [file] = needFiles(extra, 1);
    const head = new Uint8Array((await file.arrayBuffer()).slice(0, 12));
    const match = MAGIC.find(([, sig]) => sig.every((byte, i) => head[i] === byte));
    const detected = match ? { kind: match[0], mime: match[2] } : { kind: "Unknown binary", mime: "application/octet-stream" };
    return { text: JSON.stringify({ file: file.name, bytes: file.size, declared: file.type || "unknown", ...detected }, null, 2) };
  }
  if (slug === "file-size-converter") {
    const value = Number(F("value", "1536"));
    const unit = F("unit", "KB");
    const exp: Record<string, number> = { B: 0, KB: 1, MB: 2, GB: 3, TB: 4 };
    const expValue = exp[unit];
    if (!Number.isFinite(value) || expValue === undefined) throw new ToolError("tool.error.number");
    const bytes = value * Math.pow(1024, expValue);
    const rows = Object.keys(exp).map((name) => [name, String(Number((bytes / Math.pow(1024, exp[name] ?? 0)).toFixed(4)))]);
    return { text: JSON.stringify({ bytes }, null, 2), table: { head: ["Unit", "Value"], rows } };
  }
  if (slug === "batch-file-rename") {
    const files = needFiles(extra, 1);
    const pattern = F("pattern", "photo-{n}");
    const start = Math.max(parseInt(F("start", "1"), 10) || 0, 0);
    if (!pattern.includes("{n}")) throw new ToolError("tool.error.generic");
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const rows: string[][] = [];
    for (const [i, file] of files.entries()) {
      const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const renamed = `${pattern.replace(/\{n\}/g, String(start + i))}${extension}`;
      rows.push([file.name, renamed]);
      zip.file(renamed, await file.arrayBuffer());
    }
    const blob = await zip.generateAsync({ type: "uint8array" });
    return {
      text: JSON.stringify({ renamed: files.length }, null, 2),
      table: { head: ["Old", "New"], rows },
      artifacts: [downloadArtifact("renamed.zip", "application/zip", blob)],
    };
  }
  if (slug === "text-to-file-download") {
    const name = (F("name", "notes.txt").trim() || "notes.txt").replace(/[^\w.-]+/g, "_");
    return {
      text: JSON.stringify({ file: name, bytes: new TextEncoder().encode(F("text")).length }, null, 2),
      artifacts: [{ name, mime: "text/plain", dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(F("text"))}` }],
    };
  }
  if (slug === "zip-creator-extractor") {
    const { default: JSZip } = await import("jszip");
    const files = needFiles(extra, 1);
    if (F("mode", "create") === "extract") {
      const [file] = files;
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const rows = Object.keys(zip.files).map((path) => {
        const entry = zip.files[path];
        if (!entry) return [path, "? bytes"];
        return [path, entry.dir ? "folder" : `${(entry as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? "?"} bytes`];
      });
      return { text: JSON.stringify({ file: file.name, entries: rows.length }, null, 2), table: { head: ["Path", "Info"], rows } };
    }
    const zip = new JSZip();
    for (const file of files) zip.file(file.name, await file.arrayBuffer());
    const blob = await zip.generateAsync({ type: "uint8array" });
    const name = (F("name", "files.zip").trim() || "files.zip").replace(/[^\w.-]+/g, "_");
    return {
      text: JSON.stringify({ files: files.length, archive: name }, null, 2),
      artifacts: [downloadArtifact(name, "application/zip", blob)],
    };
  }
  if (slug === "pdf-merge" || slug === "pdf-split" || slug === "pdf-rotate" || slug === "pdf-page-reorder" || slug === "pdf-watermark" || slug === "images-to-pdf") {
    const { PDFDocument, StandardFonts, degrees, rgb } = await import("pdf-lib");
    if (slug === "pdf-merge") {
      const files = needFiles(extra, 2, "application/pdf");
      const merged = await PDFDocument.create();
      let pages = 0;
      for (const file of files) {
        const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        const copied = await merged.copyPages(source, source.getPageIndices());
        for (const page of copied) merged.addPage(page);
        pages += copied.length;
      }
      const bytes = await merged.save();
      return {
        text: JSON.stringify({ files: files.length, pages }, null, 2),
        artifacts: [downloadArtifact("merged.pdf", "application/pdf", bytes)],
      };
    }
    if (slug === "images-to-pdf") {
      const files = needFiles(extra, 1).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) throw new ToolError("tool.error.generic");
      const doc = await PDFDocument.create();
      for (const file of files.slice(0, 50)) {
        const bytes = await file.arrayBuffer();
        const image = file.type.includes("png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const page = doc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
      const out = await doc.save();
      return {
        text: JSON.stringify({ images: Math.min(files.length, 50), pages: Math.min(files.length, 50) }, null, 2),
        artifacts: [downloadArtifact("images.pdf", "application/pdf", out)],
      };
    }
    const [file] = needFiles(extra, 1, "application/pdf");
    const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const total = source.getPageCount();
    if (slug === "pdf-split") {
      const indices = parseRanges(F("ranges", "1-2"), total);
      const doc = await PDFDocument.create();
      const copied = await doc.copyPages(source, indices);
      for (const page of copied) doc.addPage(page);
      const bytes = await doc.save();
      return {
        text: JSON.stringify({ pages: copied.length, of: total }, null, 2),
        artifacts: [downloadArtifact("split.pdf", "application/pdf", bytes)],
      };
    }
    if (slug === "pdf-rotate") {
      const angle = ((Number(F("degrees", "90")) || 0) % 360) as 0 | 90 | 180 | 270;
      if (![0, 90, 180, 270].includes(angle)) throw new ToolError("tool.error.generic");
      for (const page of source.getPages()) page.setRotation(degrees((page.getRotation().angle + angle) % 360));
      const bytes = await source.save();
      return {
        text: JSON.stringify({ pages: total, rotated: `${angle}°` }, null, 2),
        artifacts: [downloadArtifact("rotated.pdf", "application/pdf", bytes)],
      };
    }
    if (slug === "pdf-page-reorder") {
      const order = F("order").trim();
      if (!order) throw new ToolError("tool.error.generic");
      const indices = parseRanges(order, total);
      const doc = await PDFDocument.create();
      const copied = await doc.copyPages(source, indices);
      for (const page of copied) doc.addPage(page);
      const bytes = await doc.save();
      return {
        text: JSON.stringify({ pages: copied.length }, null, 2),
        artifacts: [downloadArtifact("reordered.pdf", "application/pdf", bytes)],
      };
    }
    // pdf-watermark
    const doc = source;    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      page.drawText(F("text", "DRAFT"), {
        x: width / 2 - 120,
        y: height / 2,
        size: 64,
        font,
        color: rgb(0.6, 0.6, 0.6),
        opacity: 0.35,
        rotate: degrees(30),
      });
    }
    const bytes = await doc.save();
    return {
      text: JSON.stringify({ pages: total, watermark: F("text", "DRAFT") }, null, 2),
      artifacts: [downloadArtifact("watermarked.pdf", "application/pdf", bytes)],
    };
  }
  if (slug === "svg-optimizer") {
    // The `/browser` entry: same optimizer without the node shims the
    // default entry drags in (fs/os/path warnings, +300 KB of dead weight).
    const { optimize } = await import("svgo/browser");
    const source = F("text", input);
    if (!source.includes("<svg")) throw new ToolError("tool.error.generic");
    try {
      const result = optimize(source, { multipass: true });
      const before = new TextEncoder().encode(source).length;
      const after = new TextEncoder().encode(result.data).length;
      return {
        text: result.data,
        html: result.data,
        artifacts: [{ name: "optimized.svg", mime: "image/svg+xml", dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.data)}` }],
        label: `${before} → ${after} bytes`,
      };
    } catch {
      throw new ToolError("tool.error.generic");
    }
  }
  if (slug === "exif-viewer") {
    const [file] = needFiles(extra, 1);
    const { default: exifr } = await import("exifr");
    let tags: Record<string, unknown>;
    try {
      tags = (await exifr.parse(await file.arrayBuffer())) ?? {};
    } catch {
      throw new ToolError("tool.error.generic");
    }
    const rows = Object.entries(tags).slice(0, 200).map(([key, value]) => [key, String(value).slice(0, 200)]);
    return {
      text: rows.length === 0 ? JSON.stringify({ exif: "none found" }) : JSON.stringify(Object.fromEntries(rows), null, 2),
      table: { head: ["Tag", "Value"], rows },
    };
  }
  if (slug === "pdf-to-images") {
    if (typeof document === "undefined") throw new ToolError("tool.error.generic");
    const [file] = needFiles(extra, 1, "application/pdf");
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default as string;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const pages = Math.min(Math.max(parseInt(F("pages", "2"), 10) || 2, 1), 5);
    let doc;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    } catch {
      throw new ToolError("tool.error.generic");
    }
    const artifacts: Array<{ name: string; mime: string; dataUrl: string }> = [];
    const count = Math.min(doc.numPages, pages);
    const previews: string[] = [];
    for (let i = 1; i <= count; i += 1) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new ToolError("tool.error.generic");
      // pdf.js v6 renders into `canvas`, not a 2d context handle.
      await page.render({ canvas, viewport } as unknown as Parameters<typeof page.render>[0]).promise;
      const dataUrl = canvas.toDataURL("image/png");
      artifacts.push({ name: `${file.name.replace(/\.pdf$/i, "")}-p${i}.png`, mime: "image/png", dataUrl });
      // The first page doubles as the preview; the rest ride as downloads.
      if (i === 1) previews.push(dataUrl);
    }
    if (typeof (doc as unknown as { cleanup?: unknown }).cleanup === "function") {
      (doc as unknown as { cleanup: () => void }).cleanup();
    }
    return {
      text: JSON.stringify({ file: file.name, pages: count, of: doc.numPages }, null, 2),
      image: previews[0],
      artifacts,
    };
  }
  if (slug === "compress-pdf") {
    // Honest boundary: no browser library truly downsamples embedded images
    // without a PostScript engine. This re-saves with object streams (a small
    // lossless win) and reports both sizes instead of pretending otherwise.
    const [file] = needFiles(extra, 1, "application/pdf");
    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const bytes = await source.save({ useObjectStreams: true });
    return {
      text: JSON.stringify({ before: file.size, after: bytes.length, saved: file.size - bytes.length }, null, 2),
      artifacts: [downloadArtifact("compressed.pdf", "application/pdf", bytes)],
    };
  }
  return null;
};
