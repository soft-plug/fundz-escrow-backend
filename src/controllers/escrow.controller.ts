import { Request, Response } from "express";
import { z } from "zod";
import {
  buildCreateEscrow,
  buildFundEscrow,
  buildConfirmDelivery,
  buildRaiseDispute,
  buildResolveDispute,
  submitSignedTransaction,
  getEscrowById,
  getEscrowsByBuyer,
  getEscrowsBySeller,
} from "../services/escrow.service";
import { getLatestLedger } from "../services/stellar.service";
import { env } from "../config/env";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const stellarAddress = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, "Must be a valid Stellar address (G... 56 chars)");

const createEscrowSchema = z.object({
  seller: stellarAddress,
  arbitrator: stellarAddress.optional(),
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a positive integer string (stroops)"),
  tokenAddress: z.string().min(1, "tokenAddress is required"),
  deadline: z.string().datetime("deadline must be an ISO 8601 datetime"),
});

const escrowIdSchema = z.object({
  escrowId: z.string().min(1, "escrowId is required"),
});

const resolveDisputeSchema = z.object({
  escrowId: z.string().min(1, "escrowId is required"),
  releaseToSeller: z.boolean(),
  reason: z.string().max(500).optional(),
});

const submitSchema = z.object({
  signedXdr: z.string().min(1, "signedXdr is required"),
});

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function createEscrow(req: Request, res: Response): Promise<void> {
  const body = createEscrowSchema.parse(req.body);
  const buyer = req.walletAddress!;

  const result = await buildCreateEscrow({
    buyer,
    seller: body.seller,
    arbitrator: body.arbitrator,
    amount: body.amount,
    tokenAddress: body.tokenAddress,
    deadline: body.deadline,
  });

  res.json(result);
}

export async function fundEscrow(req: Request, res: Response): Promise<void> {
  const { escrowId } = escrowIdSchema.parse(req.body);
  const buyer = req.walletAddress!;

  const result = await buildFundEscrow(escrowId, buyer);
  res.json(result);
}

export async function confirmDelivery(
  req: Request,
  res: Response
): Promise<void> {
  const { escrowId } = escrowIdSchema.parse(req.body);
  const buyer = req.walletAddress!;

  const result = await buildConfirmDelivery(escrowId, buyer);
  res.json(result);
}

export async function raiseDispute(req: Request, res: Response): Promise<void> {
  const { escrowId } = escrowIdSchema.parse(req.body);
  const caller = req.walletAddress!;

  const result = await buildRaiseDispute(escrowId, caller);
  res.json(result);
}

export async function resolveDispute(
  req: Request,
  res: Response
): Promise<void> {
  const body = resolveDisputeSchema.parse(req.body);
  const arbitrator = req.walletAddress!;

  const result = await buildResolveDispute({
    escrowId: body.escrowId,
    releaseToSeller: body.releaseToSeller,
    arbitrator,
  });

  res.json(result);
}

export async function submitTransaction(
  req: Request,
  res: Response
): Promise<void> {
  const { signedXdr } = submitSchema.parse(req.body);

  const result = await submitSignedTransaction(signedXdr);
  res.json(result);
}

export async function getEscrow(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const escrow = await getEscrowById(id);
  res.json(escrow);
}

export async function getEscrowsByBuyerHandler(
  req: Request,
  res: Response
): Promise<void> {
  const { address } = req.params;
  const escrows = await getEscrowsByBuyer(address);
  res.json(escrows);
}

export async function getEscrowsBySellerHandler(
  req: Request,
  res: Response
): Promise<void> {
  const { address } = req.params;
  const escrows = await getEscrowsBySeller(address);
  res.json(escrows);
}

export async function healthCheck(req: Request, res: Response): Promise<void> {
  const blockHeight = await getLatestLedger().catch(() => null);
  res.json({
    status: "ok",
    network: env.STELLAR_NETWORK,
    contractId: env.CONTRACT_ID,
    blockHeight,
  });
}
