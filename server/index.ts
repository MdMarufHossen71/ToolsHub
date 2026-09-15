import express from "express";
import { createServer } from "http";
import { existsSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { PERMISSIONS_POLICY_VALUE, securityMiddleware } from "./security";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NO_CACHE = new Set(["sw.js", "manifest.webmanifest", "sitemap.xml", "robots.txt"]);

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  // Same header set as `vercel.json` (see `server/security.ts`); the
  // Permissions-Policy string is set verbatim because helmet's option format
  // cannot express this exact value.
  app.use(securityMiddleware());
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", PERMISSIONS_POLICY_VALUE);
    next();
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  // Hashed Vite assets are content-addressed: safe to cache for a year.
  app.use("/assets", express.static(path.join(staticPath, "assets"), { maxAge: "1y", immutable: true }));
  // Shells, worker and manifest change every deploy: revalidate, never freeze.
  app.use(
    express.static(staticPath, {
      setHeaders: (res, filePath) => {
        if (NO_CACHE.has(path.basename(filePath))) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );

  // No path routing in the app (hash only: `/#/tools/x`), so an unmatched
  // request is an unknown clean path — answer the static 404 page with a 404,
  // exactly like the static hosts do. `app.use` (not `app.get("*")`) keeps this
  // working on both Express 4 and Express 5 route syntax.
  const notFoundPage = path.join(staticPath, "404.html");
  const hasNotFound = existsSync(notFoundPage);
  app.use((req, res) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || path.extname(req.path) !== "") {
      res.status(404).end();
      return;
    }
    if (hasNotFound) res.status(404).sendFile(notFoundPage);
    else res.status(404).end();
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
