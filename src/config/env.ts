import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  STELLAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  SOROBAN_RPC_URL: z
    .string()
    .url()
    .default("https://soroban-testnet.stellar.org"),
  HORIZON_URL: z
    .string()
    .url()
    .default("https://horizon-testnet.stellar.org"),
  NETWORK_PASSPHRASE: z
    .string()
    .default("Test SDF Network ; September 2015"),
  CONTRACT_ID: z.string().min(1, "CONTRACT_ID is required"),
  PORT: z
    .string()
    .default("3000")
    .transform((v) => parseInt(v, 10)),
  CORS_ORIGIN: z.string().default("http://localhost:3001"),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌  Invalid environment variables:");
    result.error.issues.forEach((issue) => {
      console.error(`   ${issue.path.join(".")}: ${issue.message}`);
    });
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
export type Env = typeof env;
