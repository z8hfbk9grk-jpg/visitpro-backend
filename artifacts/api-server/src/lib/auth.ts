import { type Request, type Response, type NextFunction } from "express";
import { db, tokensTable, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthRequest extends Request {
  agentId?: string;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Token manquant. Ajoutez un header Authorization: Bearer <token>",
    });
    return;
  }

  const token = authHeader.slice(7);

  const row = await db
    .select({ agentId: tokensTable.agentId })
    .from(tokensTable)
    .where(eq(tokensTable.token, token))
    .limit(1);

  if (row.length === 0) {
    res.status(401).json({ error: "Token invalide ou expiré" });
    return;
  }

  const agentId = row[0]!.agentId;

  const agent = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .limit(1);

  if (agent.length === 0) {
    res.status(401).json({ error: "Compte agent introuvable" });
    return;
  }

  req.agentId = agentId;
  next();
}
