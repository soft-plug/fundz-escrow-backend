import { prisma } from "../db/client";
import { env } from "../config/env";
import {
  buildTransaction,
  submitTransaction as stellarSubmit,
  addressToScVal,
  u64ToScVal,
  i128ToScVal,
  optionAddressToScVal,
  boolToScVal,
  SubmitResult,
} from "./stellar.service";
import type { Escrow, EscrowEvent } from "@prisma/client";

// ── Input types ──────────────────────────────────────────────────────────────

export interface CreateEscrowInput {
  buyer: string;
  seller: string;
  arbitrator?: string;
  amount: string; // stroops as string
  tokenAddress: string;
  deadline: string; // ISO date string
}

export interface ResolveDisputeInput {
  escrowId: string;
  releaseToSeller: boolean;
  arbitrator: string;
}

// ── Response types ───────────────────────────────────────────────────────────

export interface XdrResponse {
  xdr: string;
}

export type EscrowWithEvents = Escrow & { events: EscrowEvent[] };

// ── Transaction builders ─────────────────────────────────────────────────────

export async function buildCreateEscrow(
  input: CreateEscrowInput
): Promise<XdrResponse> {
  const deadlineTimestamp = BigInt(
    Math.floor(new Date(input.deadline).getTime() / 1000)
  );

  const xdr = await buildTransaction(
    input.buyer,
    env.CONTRACT_ID,
    "create_escrow",
    [
      addressToScVal(input.buyer),
      addressToScVal(input.seller),
      optionAddressToScVal(input.arbitrator),
      i128ToScVal(BigInt(input.amount)),
      addressToScVal(input.tokenAddress),
      u64ToScVal(deadlineTimestamp),
    ]
  );

  return { xdr };
}

export async function buildFundEscrow(
  escrowId: string,
  buyer: string
): Promise<XdrResponse> {
  // Verify escrow exists and caller is buyer
  const escrow = await getEscrowOrThrow(escrowId);
  if (escrow.buyer !== buyer) {
    throw new AuthorizationError("Only the buyer can fund this escrow");
  }

  const numericId = extractNumericId(escrowId);
  const xdr = await buildTransaction(buyer, env.CONTRACT_ID, "fund_escrow", [
    u64ToScVal(numericId),
  ]);

  return { xdr };
}

export async function buildConfirmDelivery(
  escrowId: string,
  buyer: string
): Promise<XdrResponse> {
  const escrow = await getEscrowOrThrow(escrowId);
  if (escrow.buyer !== buyer) {
    throw new AuthorizationError("Only the buyer can confirm delivery");
  }

  const numericId = extractNumericId(escrowId);
  const xdr = await buildTransaction(
    buyer,
    env.CONTRACT_ID,
    "confirm_delivery",
    [u64ToScVal(numericId)]
  );

  return { xdr };
}

export async function buildRaiseDispute(
  escrowId: string,
  caller: string
): Promise<XdrResponse> {
  const escrow = await getEscrowOrThrow(escrowId);
  if (escrow.buyer !== caller && escrow.seller !== caller) {
    throw new AuthorizationError(
      "Only the buyer or seller can raise a dispute"
    );
  }

  const numericId = extractNumericId(escrowId);
  const xdr = await buildTransaction(
    caller,
    env.CONTRACT_ID,
    "raise_dispute",
    [u64ToScVal(numericId)]
  );

  return { xdr };
}

export async function buildResolveDispute(
  input: ResolveDisputeInput
): Promise<XdrResponse> {
  const escrow = await getEscrowOrThrow(input.escrowId);
  if (escrow.arbitrator !== input.arbitrator) {
    throw new AuthorizationError("Only the arbitrator can resolve a dispute");
  }

  const numericId = extractNumericId(input.escrowId);
  const boolVal = boolToScVal(input.releaseToSeller);

  const xdr = await buildTransaction(
    input.arbitrator,
    env.CONTRACT_ID,
    "resolve_dispute",
    [u64ToScVal(numericId), boolVal]
  );

  return { xdr };
}

export async function submitSignedTransaction(
  signedXdr: string
): Promise<SubmitResult> {
  return stellarSubmit(signedXdr);
}

// ── Read queries ─────────────────────────────────────────────────────────────

export async function getEscrowById(
  escrowId: string
): Promise<EscrowWithEvents> {
  const escrow = await prisma.escrow.findUnique({
    where: { escrowId },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });

  if (!escrow) {
    throw new NotFoundError(`Escrow ${escrowId} not found`);
  }

  return escrow;
}

export async function getEscrowsByBuyer(
  address: string
): Promise<EscrowWithEvents[]> {
  return prisma.escrow.findMany({
    where: { buyer: address },
    include: { events: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getEscrowsBySeller(
  address: string
): Promise<EscrowWithEvents[]> {
  return prisma.escrow.findMany({
    where: { seller: address },
    include: { events: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getEscrowOrThrow(escrowId: string): Promise<Escrow> {
  const escrow = await prisma.escrow.findUnique({ where: { escrowId } });
  if (!escrow) throw new NotFoundError(`Escrow ${escrowId} not found`);
  return escrow;
}

/**
 * Extract the numeric portion from an escrow ID.
 * Supports formats: "ESC-0001" → 1, "42" → 42
 */
function extractNumericId(escrowId: string): number {
  const match = escrowId.match(/(\d+)$/);
  if (!match) throw new Error(`Cannot extract numeric ID from: ${escrowId}`);
  return parseInt(match[1], 10);
}

// ── Custom errors ─────────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class AuthorizationError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class ValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
