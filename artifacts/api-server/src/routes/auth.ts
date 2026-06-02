import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, agentsTable, tokensTable } from "@workspace/db";
import { generateToken, hashPassword, safeAgent } from "../lib/store";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

const LoginSchema = z.object({
  email: z.string().email("Email invalide"),
  motDePasse: z.string().min(1, "Le mot de passe est requis"),
});

router.post("/login", async (req, res) => {
  const result = LoginSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }

  const { email, motDePasse } = result.data;

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.email, email))
    .limit(1);

  if (!agent || agent.passwordHash !== hashPassword(motDePasse)) {
    res.status(401).json({ error: "Email ou mot de passe incorrect" });
    return;
  }

  const token = generateToken();
  await db.insert(tokensTable).values({ token, agentId: agent.id });

  req.log.info({ agentId: agent.id }, "Agent connecté");
  res.json({ agent: safeAgent(agent), token });
});

router.post("/logout", requireAuth, async (req: AuthRequest, res) => {
  const token = req.headers["authorization"]!.slice(7);
  await db.delete(tokensTable).where(eq(tokensTable.token, token));
  req.log.info({ agentId: req.agentId }, "Agent déconnecté");
  res.json({ message: "Déconnexion réussie" });
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, req.agentId!))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent introuvable" });
    return;
  }

  res.json(safeAgent(agent));
});

export default router;
