import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Connect, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

function vitePluginStorageProxy(): Plugin {
  return {
    name: "manus-storage-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/manus-storage", async (req, res) => {
        const key = req.url?.replace(/^\//, "");
        if (!key) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing storage key");
          return;
        }

        const forgeBaseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, "");
        const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

        if (!forgeBaseUrl || !forgeKey) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Storage proxy not configured");
          return;
        }

        try {
          const forgeUrl = new URL("v1/storage/presign/get", forgeBaseUrl + "/");
          forgeUrl.searchParams.set("path", key);

          const forgeResp = await fetch(forgeUrl, {
            headers: { Authorization: `Bearer ${forgeKey}` },
          });

          if (!forgeResp.ok) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Storage backend error");
            return;
          }

          const { url } = (await forgeResp.json()) as { url: string };
          if (!url) {
            res.writeHead(502, { "Content-Type": "text/plain" });
            res.end("Empty signed URL");
            return;
          }

          res.writeHead(307, { Location: url, "Cache-Control": "no-store" });
          res.end();
        } catch {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Storage proxy error");
        }
      });
    },
  };
}

const isProd = process.env.NODE_ENV === "production";

// =============================================================================
// PWA precache generator
//
// `client/public/sw.js` ships with two placeholder tokens. After Vite has written
// `dist/public` this plugin replaces them with the real app-shell list and a
// version derived from that list, so the service worker never names a hashed file
// that does not exist. It is deliberately tiny (no `vite-plugin-pwa`): the worker
// logic lives in a readable file and only the data is generated.
//
// The shell list comes from the emitted `index.html` itself — its module script
// and stylesheet — plus the manifest, favicon and install icons. Lazy route and
// tool chunks stay out of the precache: they are cache-first at runtime, so the
// home page boots offline without downloading every parser upfront.
// =============================================================================

const PRECACHE_MARKER = '["__PRECACHE__"]';
const VERSION_MARKER = '"__BUILD_VERSION__"';

function vitePluginPwaPrecache(): Plugin {
  let outDir = "";
  return {
    name: "toolshub-pwa-precache",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const swPath = path.join(outDir, "sw.js");
      if (!fs.existsSync(swPath)) return;

      const indexHtml = path.join(outDir, "index.html");
      const candidates = new Set(["./index.html", "./manifest.webmanifest", "./favicon.svg"]);
      if (fs.existsSync(indexHtml)) {
        const html = fs.readFileSync(indexHtml, "utf8");
        // Any relative `src`/`href` the page loads itself (entry JS, CSS, icons).
        for (const match of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="(\.\/[^"]+)"/g)) {
          candidates.add(match[1]);
        }
      }
      const iconsDir = path.join(outDir, "icons");
      if (fs.existsSync(iconsDir)) {
        for (const entry of fs.readdirSync(iconsDir)) {
          if (entry.endsWith(".png")) candidates.add(`./icons/${entry}`);
        }
      }

      // Never precache something that was not emitted.
      const precache = [...candidates]
        .filter((url) => fs.existsSync(path.join(outDir, url.replace(/^\.\//, ""))))
        .sort();
      const missing = [...candidates].filter((url) => !precache.includes(url));
      if (missing.length) {
        console.warn(`[toolshub-pwa] skipped ${missing.length} missing shell file(s): ${missing.join(", ")}`);
      }

      const version = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);
      let source = fs.readFileSync(swPath, "utf8");
      if (!source.includes(PRECACHE_MARKER) || !source.includes(VERSION_MARKER)) {
        throw new Error("[toolshub-pwa] client/public/sw.js is missing its precache placeholders");
      }
      source = source
        .replace(PRECACHE_MARKER, JSON.stringify(precache))
        .replace(VERSION_MARKER, JSON.stringify(version));
      fs.writeFileSync(swPath, source);
      console.log(`[toolshub-pwa] wrote dist/public/sw.js (version ${version}, ${precache.length} precache entries)`);
    },
  };
}

/**
 * Serve `client/public/404.html` from `vite preview` for a document request that no
 * emitted file matches.
 *
 * The deployed host is a static directory, so `/tools/does-not-exist/` gets the
 * hand-written 404 page with a 404 status. `vite preview` defaults to SPA history
 * fallback and answers the same URL with `index.html` and a 200, which meant the page
 * users (and this project's own checks) saw locally was not the one they get in
 * production. The app is hash-routed, so it never needs a path fallback — every real
 * clean path is a generated shell directory — which makes this safe to intercept.
 *
 * Middlewares registered in this hook are appended after Vite's own static handler,
 * which has already applied the SPA fallback by then, so the handler is unshifted to
 * the front of the connect stack instead: it only answers when the target is genuinely
 * absent, and every real file (including the home page and the generated shells) still
 * falls through to Vite untouched.
 */
function vitePluginStatic404(): Plugin {
  return {
    name: "toolshub-static-404",
    configurePreviewServer(server) {
      const outDir = path.resolve(import.meta.dirname, "dist", "public");
      const notFound = path.join(outDir, "404.html");
      const handle: Connect.NextHandleFunction = (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
        // A document request: the root, a directory path or an extensionless path.
        // Assets and the manifest all carry an extension and fall straight through.
        const isDocument = pathname === "/" || pathname.endsWith("/") || !path.extname(pathname);
        if (!isDocument) return next();

        const candidates = pathname.endsWith("/")
          ? [path.join(outDir, pathname, "index.html")]
          : [path.join(outDir, pathname), path.join(outDir, `${pathname}.html`), path.join(outDir, pathname, "index.html")];
        if (candidates.some((file) => fs.existsSync(file) && fs.statSync(file).isFile())) return next();
        if (!fs.existsSync(notFound)) return next();

        res.statusCode = 404;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        fs.createReadStream(notFound).pipe(res);
      };
      server.middlewares.stack.unshift({ route: "", handle });
    },
  };
}

// Production ships only the runtime essentials. Dev-only instrumentation
// (manus runtime, jsx-loc source paths, debug collector, storage proxy) is
// serve-only so it never inflates `dist/` or leaks internal paths.
const plugins = [
  react(),
  tailwindcss(),
  vitePluginPwaPrecache(),
  vitePluginStatic404(),
  ...(isProd ? [] : [jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector(), vitePluginStorageProxy()]),
];

export default defineConfig({
  base: "./",
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
