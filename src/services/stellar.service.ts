import {
  SorobanRpc,
  Horizon,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  xdr,
  Transaction,
  Contract,
  nativeToScVal,
  Address,
  scValToNative,
} from "@stellar/stellar-sdk";
import { env } from "../config/env";

// ── Clients ─────────────────────────────────────────────────────────────────

export const sorobanServer = new SorobanRpc.Server(env.SOROBAN_RPC_URL, {
  allowHttp: false,
});

export const horizonServer = new Horizon.Server(env.HORIZON_URL, {
  allowHttp: false,
});

const networkPassphrase =
  env.STELLAR_NETWORK === "mainnet"
    ? Networks.PUBLIC
    : Networks.TESTNET;

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubmitResult {
  txHash: string;
  successful: boolean;
  errorCode?: string;
}

export interface ContractEscrow {
  escrow_id: bigint;
  buyer: string;
  seller: string;
  arbitrator: string | null;
  amount: bigint;
  token: string;
  state: string;
  deadline: bigint;
  created_at: bigint;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build an unsigned transaction that invokes a Soroban contract function.
 * Simulates the transaction to get the correct fee, then assembles it.
 * Returns the unsigned XDR string.
 */
export async function buildTransaction(
  sourceAddress: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<string> {
  const account = await horizonServer.loadAccount(sourceAddress);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(300)
    .build();

  // Simulate to get the correct resource fee
  const simResult = await sorobanServer.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  // Assemble with correct footprint + fee
  const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
  return assembled.toXDR();
}

/**
 * Submit a signed XDR transaction to the network.
 * Waits for the transaction to be included in a ledger.
 */
export async function submitTransaction(
  signedXdr: string
): Promise<SubmitResult> {
  const tx = new Transaction(signedXdr, networkPassphrase);
  const txHash = tx.hash().toString("hex");

  try {
    const sendResult = await sorobanServer.sendTransaction(tx);

    if (sendResult.status === "ERROR") {
      return {
        txHash,
        successful: false,
        errorCode: sendResult.errorResult?.result().toString() ?? "UNKNOWN",
      };
    }

    // Poll for confirmation
    let getResult = await sorobanServer.getTransaction(txHash);
    let attempts = 0;
    const maxAttempts = 30;

    while (
      getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
      attempts < maxAttempts
    ) {
      await new Promise((r) => setTimeout(r, 1000));
      getResult = await sorobanServer.getTransaction(txHash);
      attempts++;
    }

    if (getResult.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return { txHash, successful: true };
    }

    if (getResult.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      return {
        txHash,
        successful: false,
        errorCode: "TRANSACTION_FAILED",
      };
    }

    return { txHash, successful: false, errorCode: "TIMEOUT" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to submit transaction: ${message}`);
  }
}

/**
 * Read contract state for a given escrow ID using simulation (no fee).
 */
export async function getContractState(
  escrowId: number
): Promise<ContractEscrow> {
  const account = await horizonServer.loadAccount(
    // Use a dummy account for read-only simulation
    "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
  );
  const contract = new Contract(env.CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call("get_escrow", nativeToScVal(escrowId, { type: "u64" }))
    )
    .setTimeout(30)
    .build();

  const simResult = await sorobanServer.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Contract read failed: ${simResult.error}`);
  }

  const returnVal = (simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse)
    .result?.retval;

  if (!returnVal) {
    throw new Error("No return value from contract simulation");
  }

  const native = scValToNative(returnVal) as Record<string, unknown>;

  return {
    escrow_id: BigInt(String(native.escrow_id ?? 0)),
    buyer: Address.fromScVal(returnVal).toString(),
    seller: String(native.seller ?? ""),
    arbitrator: native.arbitrator ? String(native.arbitrator) : null,
    amount: BigInt(String(native.amount ?? 0)),
    token: String(native.token ?? ""),
    state: String(native.state ?? "Init"),
    deadline: BigInt(String(native.deadline ?? 0)),
    created_at: BigInt(String(native.created_at ?? 0)),
  };
}

/**
 * Get the current ledger sequence number from Soroban RPC.
 */
export async function getLatestLedger(): Promise<number> {
  const info = await sorobanServer.getLatestLedger();
  return info.sequence;
}

// ── ScVal builders (used by escrow.service.ts) ───────────────────────────────

export function addressToScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

export function u64ToScVal(value: number | bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "u64" });
}

export function i128ToScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

export function optionAddressToScVal(address?: string): xdr.ScVal {
  if (!address) {
    return xdr.ScVal.scvVoid();
  }
  return new Address(address).toScVal();
}

export function boolToScVal(value: boolean): xdr.ScVal {
  return nativeToScVal(value, { type: "bool" });
}
