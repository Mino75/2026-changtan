// server.js — Changtan asset server (single endpoint: /main.js)
// Goal: serve only one JS bundle (main.js) to Kizuna.
// No query params, no extra static files, no demo page.
//
// Run: node server.js
// Env vars:
//   PORT=3000
//   ALLOWED_DOMAINS=site1.com,site2.com  (referer-based allowlist; empty => disabled)

const express = require("express");

const app = express();

// --- Domain restriction middleware (multi-domain, via Referer) ---
const allowedDomains = (process.env.ALLOWED_DOMAINS || "")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  if (allowedDomains.length === 0) return next();

  const referer = req.headers.referer || "";
  try {
    const url = new URL(referer);
    const ok = allowedDomains.some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );
    if (ok) return next();
  } catch (_) {}

  res.status(403).send("Access denied");
});

// --- Disable ALL caching ---
app.use((req, res, next) => {
  res.set({
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  });
  next();
});

// --- CORS for cross-origin script inclusion ---
app.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// --- Single endpoint: /main.js ---
// IMPORTANT: paste your single-file chat bundle (the inline UI module) into MAIN_JS.
// If you prefer reading from disk, you can swap this constant for fs.readFileSync,
// but you requested "no other served files" and "main.js only".
const MAIN_JS = `/* Changtan main.js (embedded bundle) */
${"__REPLACE_WITH_YOUR_SINGLE_FILE_CHAT_BUNDLE__"}
`;

// Optional minimal health endpoint. Remove if you want strictly /main.js only.
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "changtan-assets",
    ts: new Date().toISOString(),
  });
});

// Main script endpoint
app.get("/main.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  // No query parsing, no templating, no other files
  const stamp = `// Changtan served at ${new Date().toISOString()}\n`;
  res.send(stamp + MAIN_JS);
});

// Minimal 404
app.use((req, res) => res.status(404).send("Not Found"));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log("============================================");
  console.log("Changtan Asset Server Started");
  console.log("============================================");
  console.log(`Server URL: http://localhost:${PORT}`);
  console.log("Endpoints:");
  console.log("  GET /main.js");
  console.log(`  GET /health (optional)`);
  console.log(
    `ALLOWED_DOMAINS: ${
      allowedDomains.length ? allowedDomains.join(", ") : "(disabled)"
    }`
  );
  console.log("Cache: DISABLED");
  console.log("CORS: *");
  console.log("============================================");
});

// Graceful shutdown
const shutdown = (sig) => {
  console.log(`${sig} received, closing server...`);
  server.close(() => process.exit(0));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
