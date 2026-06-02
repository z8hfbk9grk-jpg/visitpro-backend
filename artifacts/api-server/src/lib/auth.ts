import { type Request, type Response, type NextFunction } from "express";
import { tokens, agents } from "./store";

export interface AuthRequest extends Request {
  agentId?: string;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Token manquant. Ajoutez un header Authorization: Bearer <token>",
    });
    return;
  }

  const token = authHeader.slice(7);
  const agentId = tokens.get(token);

  if (!agentId) {
    res.status(401).json({ error: "Token invalide ou expiré" });
    return;
  }

  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    res.status(401).json({ error: "Compte agent introuvable" });
    return;
  }

  req.agentId = agentId;
  next();
}
