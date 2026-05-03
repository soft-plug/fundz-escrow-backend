import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
} from "../services/escrow.service";

interface ApiError {
  error: string;
  code: number;
  details?: unknown;
}

export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    const response: ApiError = {
      error: "Validation failed",
      code: 400,
      details: err.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    };
    res.status(400).json(response);
    return;
  }

  // Domain errors
  if (
    err instanceof NotFoundError ||
    err instanceof AuthorizationError ||
    err instanceof ValidationError
  ) {
    res.status(err.statusCode).json({ error: err.message, code: err.statusCode });
    return;
  }

  // Generic errors
  if (err instanceof Error) {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: err.message, code: 500 });
    return;
  }

  // Unknown
  console.error("Unknown error:", err);
  res.status(500).json({ error: "Internal server error", code: 500 });
}

/**
 * Wraps an async route handler so errors are forwarded to globalErrorHandler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
