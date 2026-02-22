"use strict";

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Disable caching (important for testing/demo)
app.use((req, res, next) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "Surrogate-Control": "no-store"
  });
  next();
});

// Serve static files from project root
app.use(express.static(__dirname));

// Health endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log("=================================");
  console.log("Changtan Demo Server Running");
  console.log("=================================");
  console.log(`Local: http://localhost:${PORT}`);
  console.log("Files served:");
  console.log("  /index.html");
  console.log("  /main.js");
  console.log("=================================");
});
