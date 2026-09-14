/**
 * Standalone backend for the COD OTP flow (deployed on Render).
 *
 * The Checkout UI Extension calls this backend directly over HTTPS using the
 * production Render URL. CORS is applied globally BEFORE all routes so that
 * every OPTIONS preflight succeeds (204) and never 404s.
 *
 * SMS credentials are read from the environment (see config.js) and never
 * returned to the client.
 */

import express from "express";
import cors from "cors";

import { config } from "./config.js";
import { otpRouter } from "./otpRoutes.js";
import { startCleanupTimer } from "./otpStore.js";

const app = express();

// --- CORS (global, before all routes) -------------------------------------
// Checkout UI Extensions issue requests from a Shopify sandbox origin that is
// not fixed/documented, so we allow any origin. No cookies/credentials are
// used, so `origin: *` is safe here.
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
// Explicitly answer every preflight so OPTIONS never falls through to a 404.
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "16kb" }));

// --- Routes ----------------------------------------------------------------
app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/otp", otpRouter);

// 404 for anything else (after CORS, so preflights are already handled).
app.use((_req, res) => {
  res.status(404).json({ ok: false, message: "Not found." });
});

// Centralized error handler so no stack traces leak to clients.
// eslint-disable-next-line no-unused-vars
app.use((_err, _req, res, _next) => {
  res.status(500).json({ ok: false, message: "Unexpected server error." });
});

startCleanupTimer();

app.listen(config.port, () => {
  console.log(`COD OTP backend listening on port ${config.port}`);
});
