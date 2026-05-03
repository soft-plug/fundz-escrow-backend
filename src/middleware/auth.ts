import { Request, Response, NextFunction } from "express";

// Extend Express Request to carry the verified wallet address
declare global {
  namespace Express {
    interface Request {
      walletAddress?: string;
    }
  }
}

const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * Validates the x-wallet-address header and attaches it to req.walletAddress.
 * This is a fast-fail guard — the Soroban contract's require_auth() is the
 * authoritative enforcement layer.
 */
export function requireWalletAddress(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const address = req.headers["x-wallet-address"];

  if (!address || typeof address !== "string") {
    res.status(401).json({
      error: "Missing x-wallet-address header",
      code: 401,
    });
    return;
  }

  if (!STELLAR_ADDRESS_REGEX.test(address)) {
    res.status(400).json({
      error:
        "Invalid Stellar address in x-wallet-address header. Must start with G and be 56 characters.",
      code: 400,
    });
    return;
  }

  req.walletAddress = address;
  next();
}
