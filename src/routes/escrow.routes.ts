import { Router } from "express";
import { requireWalletAddress } from "../middleware/auth";
import { asyncHandler } from "../middleware/error";
import {
  createEscrow,
  fundEscrow,
  confirmDelivery,
  raiseDispute,
  resolveDispute,
  submitTransaction,
  getEscrow,
  getEscrowsByBuyerHandler,
  getEscrowsBySellerHandler,
  healthCheck,
} from "../controllers/escrow.controller";

const router = Router();

// ── Health ────────────────────────────────────────────────────────────────────
router.get("/health", asyncHandler(healthCheck));

// ── Read endpoints (no auth required) ────────────────────────────────────────
router.get("/:id", asyncHandler(getEscrow));
router.get("/buyer/:address", asyncHandler(getEscrowsByBuyerHandler));
router.get("/seller/:address", asyncHandler(getEscrowsBySellerHandler));

// ── Transaction-building endpoints (wallet auth required) ─────────────────────
router.post(
  "/create",
  requireWalletAddress,
  asyncHandler(createEscrow)
);

router.post(
  "/fund",
  requireWalletAddress,
  asyncHandler(fundEscrow)
);

router.post(
  "/confirm-delivery",
  requireWalletAddress,
  asyncHandler(confirmDelivery)
);

router.post(
  "/raise-dispute",
  requireWalletAddress,
  asyncHandler(raiseDispute)
);

router.post(
  "/resolve-dispute",
  requireWalletAddress,
  asyncHandler(resolveDispute)
);

// ── Submit (no auth — signature is proof) ────────────────────────────────────
router.post("/submit", asyncHandler(submitTransaction));

export default router;
