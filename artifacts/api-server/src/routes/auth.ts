import { Router, type IRouter } from "express";
import { z } from "zod";
import { agents, tokens, generateToken, hashPassword, safeAgent } from "../lib/store";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

const LoginSchema = z.object({
  email: z.string().email("Email invalide"),
  motDePasse: z.string().min(1, "Le mot de passe est requis"),
});

router.post("/login", (req, res) => {
  const result = LoginSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Données invalides",
      details: result.error.issues,
    });
    return;
  }

  const { email, motDePasse } = result.data;
  const agent = agents.find((a) => a.email === email);

  if (!agent || agent.passwordHash !== hashPassword(motDePasse)) {
    res.status(401).json({ error: "Email ou mot de passe incorrect" });
    return;
  }

  const token = generateToken();
  tokens.set(token, agent.id);

  req.log.info({ agentId: agent.id }, "Agent connecté");

  res.json({ agent: safeAgent(agent), token });
});

router.post("/logout", requireAuth, (req: AuthRequest, res) => {
  const authHeader = req.headers["authorization"]!;
  const token = authHeader.slice(7);

  tokens.delete(token);
  req.log.info({ agentId: req.agentId }, "Agent déconnecté");

  res.json({ message: "Déconnexion réussie" });
});

router.get("/me", requireAuth, (req: AuthRequest, res) => {
  const agent = agents.find((a) => a.id === req.agentId);

  if (!agent) {
    res.status(404).json({ error: "Agent introuvable" });
    return;
  }

  res.json(safeAgent(agent));
});

export default router;
