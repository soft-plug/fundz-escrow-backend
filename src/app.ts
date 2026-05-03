import express from "express";
import cors from "cors";
import { env } from "./config/env";
import escrowRoutes from "./routes/escrow.routes";
import { globalErrorHandler } from "./middleware/error";
import { startEventListener } from "./indexer/event.listener";
import { prisma } from "./db/client";

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-wallet-address"],
  })
);

app.use(express.json({ limit: "1mb" }));

// Request logger (dev only)
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.use("/escrow", escrowRoutes);

// Root
app.get("/", (_req, res) => {
  res.json({ service: "stellar-escrow-backend", version: "0.1.0" });
});

// ── Error handler (must be last) ──────────────────────────────────────────────

app.use(globalErrorHandler);

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  // Verify DB connection
  try {
    await prisma.$connect();
    console.log("✓ Database connected");
  } catch (err) {
    console.error("✗ Database connection failed:", err);
    process.exit(1);
  }

  // Start HTTP server
  app.listen(env.PORT, () => {
    console.log(`✓ Server running on http://localhost:${env.PORT}`);
    console.log(`  Network:    ${env.STELLAR_NETWORK}`);
    console.log(`  Contract:   ${env.CONTRACT_ID}`);
    console.log(`  CORS:       ${env.CORS_ORIGIN}`);
  });

  // Start event indexer (non-blocking)
  startEventListener().catch((err) => {
    console.error("Event listener failed to start:", err);
  });
}

bootstrap();

export default app;
