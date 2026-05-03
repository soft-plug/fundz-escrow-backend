import { SorobanRpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { prisma } from "../db/client";
import { sorobanServer } from "../services/stellar.service";
import { env } from "../config/env";
import { EscrowState } from "@prisma/client";

const POLL_INTERVAL_MS = 5000;
const LEDGER_FILE = ".ledger";

// ── Event → DB state mapping ─────────────────────────────────────────────────

const EVENT_STATE_MAP: Record<string, EscrowState | null> = {
  escrow_created: EscrowState.INIT,
  escrow_funded: EscrowState.FUNDED,
  delivery_confirmed: EscrowState.COMPLETED,
  dispute_raised: EscrowState.DISPUTED,
  dispute_resolved: null, // determined by payload
  escrow_refunded: EscrowState.REFUNDED,
  escrow_expired: EscrowState.EXPIRED,
};

// ── Ledger persistence ───────────────────────────────────────────────────────

async function getLastLedger(): Promise<number> {
  try {
    const state = await prisma.indexerState.findUnique({
      where: { id: "singleton" },
    });
    return state?.lastLedger ?? 0;
  } catch {
    return 0;
  }
}

async function saveLastLedger(ledger: number): Promise<void> {
  await prisma.indexerState.upsert({
    where: { id: "singleton" },
    update: { lastLedger: ledger },
    create: { id: "singleton", lastLedger: ledger },
  });
}

// ── Event parsing ─────────────────────────────────────────────────────────────

interface ParsedEvent {
  eventName: string;
  escrowId: string;
  payload: Record<string, unknown>;
  ledger: number;
  txHash: string;
}

function parseEvent(
  event: SorobanRpc.Api.EventResponse
): ParsedEvent | null {
  try {
    // Topics: [Symbol("escrow"), Symbol(eventName)]
    if (event.topic.length < 2) return null;

    const topicNative = event.topic.map((t) => scValToNative(t));
    if (topicNative[0] !== "escrow") return null;

    const eventName = String(topicNative[1]);
    const dataNative = scValToNative(event.value) as Record<string, unknown>;

    // Extract escrow_id from data
    const escrowId = dataNative.escrow_id != null
      ? `ESC-${String(dataNative.escrow_id).padStart(4, "0")}`
      : null;

    if (!escrowId) return null;

    return {
      eventName,
      escrowId,
      payload: dataNative,
      ledger: event.ledger,
      txHash: event.txHash,
    };
  } catch (err) {
    console.warn("Failed to parse event:", err);
    return null;
  }
}

// ── DB upsert logic ───────────────────────────────────────────────────────────

async function handleEvent(parsed: ParsedEvent): Promise<void> {
  const { eventName, escrowId, payload, ledger, txHash } = parsed;

  console.log(`[indexer] ${eventName} → ${escrowId} (ledger ${ledger})`);

  try {
    if (eventName === "escrow_created") {
      // Create the Escrow record
      await prisma.escrow.upsert({
        where: { escrowId },
        update: { state: EscrowState.INIT },
        create: {
          escrowId,
          buyer: String(payload.buyer ?? ""),
          seller: String(payload.seller ?? ""),
          arbitrator: payload.arbitrator
            ? String(payload.arbitrator)
            : null,
          amount: String(payload.amount ?? "0"),
          tokenAddress: String(payload.token ?? ""),
          state: EscrowState.INIT,
          deadline: payload.deadline
            ? new Date(Number(payload.deadline) * 1000)
            : new Date(),
        },
      });
    } else {
      // Determine new state
      let newState: EscrowState | null = EVENT_STATE_MAP[eventName] ?? null;

      if (eventName === "dispute_resolved") {
        newState = payload.release_to_seller
          ? EscrowState.COMPLETED
          : EscrowState.REFUNDED;
      }

      if (newState) {
        await prisma.escrow.updateMany({
          where: { escrowId },
          data: { state: newState },
        });
      }
    }

    // Always record the event
    await prisma.escrowEvent.create({
      data: {
        escrowId,
        eventType: eventName,
        ledger,
        txHash,
        payload: payload as object,
      },
    });
  } catch (err) {
    console.error(`[indexer] Failed to handle event ${eventName}:`, err);
  }
}

// ── Polling loop ──────────────────────────────────────────────────────────────

async function pollEvents(startLedger: number): Promise<number> {
  try {
    const response = await sorobanServer.getEvents({
      startLedger,
      filters: [
        {
          type: "contract",
          contractIds: [env.CONTRACT_ID],
        },
      ],
      limit: 100,
    });

    let highestLedger = startLedger;

    for (const event of response.events) {
      const parsed = parseEvent(event);
      if (parsed) {
        await handleEvent(parsed);
        if (parsed.ledger > highestLedger) {
          highestLedger = parsed.ledger;
        }
      }
    }

    return highestLedger;
  } catch (err) {
    console.error("[indexer] Poll error:", err);
    return startLedger;
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function startEventListener(): Promise<void> {
  console.log("[indexer] Starting event listener...");
  console.log(`[indexer] Contract: ${env.CONTRACT_ID}`);
  console.log(`[indexer] Network:  ${env.STELLAR_NETWORK}`);

  let lastLedger = await getLastLedger();

  // If no saved ledger, start from a recent one
  if (lastLedger === 0) {
    try {
      const latest = await sorobanServer.getLatestLedger();
      // Start from 1000 ledgers back (~83 minutes) to catch recent events
      lastLedger = Math.max(0, latest.sequence - 1000);
      console.log(`[indexer] No saved ledger. Starting from ledger ${lastLedger}`);
    } catch {
      lastLedger = 0;
    }
  } else {
    console.log(`[indexer] Resuming from ledger ${lastLedger}`);
  }

  // Poll loop
  const poll = async () => {
    const newLedger = await pollEvents(lastLedger);
    if (newLedger > lastLedger) {
      lastLedger = newLedger;
      await saveLastLedger(lastLedger);
    }
    setTimeout(poll, POLL_INTERVAL_MS);
  };

  // Start immediately
  await poll();
}
