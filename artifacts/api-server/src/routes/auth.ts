import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db, agentsTable, tokensTable } from "@workspace/db";
import { generateToken, hashPassword, verifyPassword, safeAgent } from "../lib/store";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 8, // 8 tentatives max par IP
  message: { error: "Trop de tentatives de connexion. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const LoginSchema = z.object({
  email: z.string().email("Email invalide"),
  motDePasse: z.string().min(1, "Le mot de passe est requis"),
});

const ProfilSchema = z.object({
  nom: z.string().min(1).optional(),
  prenom: z.string().min(1).optional(),
  telephone: z.string().min(8).optional(),
  agence: z.string().min(1).optional(),
});

const MotDePasseSchema = z.object({
  motDePasseActuel: z.string().min(1, "Le mot de passe actuel est requis"),
  motDePasseNouveau: z.string().min(6, "Le nouveau mot de passe doit faire au moins 6 caractères"),
});

router.post("/login", loginLimiter, async (req, res) => {
  const result = LoginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }
  const { email, motDePasse } = result.data;
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.email, email)).limit(1);
  if (!agent || !verifyPassword(motDePasse, agent.passwordHash)) {
    res.status(401).json({ error: "Email ou mot de passe incorrect" });
    return;
  }
  // Migration transparente vers le hashage sécurisé (scrypt)
  if (!agent.passwordHash.includes(":")) {
    await db.update(agentsTable)
      .set({ passwordHash: hashPassword(motDePasse) })
      .where(eq(agentsTable.id, agent.id));
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
  const [agent] = await db.select().from(agentsTable)
    .where(eq(agentsTable.id, req.agentId!)).limit(1);
  if (!agent) { res.status(404).json({ error: "Agent introuvable" }); return; }
  res.json(safeAgent(agent));
});

router.put("/me", requireAuth, async (req: AuthRequest, res) => {
  const result = ProfilSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }
  if (Object.keys(result.data).length === 0) {
    res.status(400).json({ error: "Aucun champ à mettre à jour" });
    return;
  }
  const [agent] = await db.update(agentsTable).set(result.data)
    .where(eq(agentsTable.id, req.agentId!)).returning();
  if (!agent) { res.status(404).json({ error: "Agent introuvable" }); return; }
  req.log.info({ agentId: req.agentId }, "Profil mis à jour");
  res.json(safeAgent(agent));
});

router.put("/me/mot-de-passe", requireAuth, async (req: AuthRequest, res) => {
  const result = MotDePasseSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }
  const [agent] = await db.select().from(agentsTable)
    .where(eq(agentsTable.id, req.agentId!)).limit(1);
  if (!agent) { res.status(404).json({ error: "Agent introuvable" }); return; }

  if (!verifyPassword(result.data.motDePasseActuel, agent.passwordHash)) {
    res.status(401).json({ error: "Mot de passe actuel incorrect" });
    return;
  }
  await db.update(agentsTable)
    .set({ passwordHash: hashPassword(result.data.motDePasseNouveau) })
    .where(eq(agentsTable.id, req.agentId!));

  // Révoquer tous les autres tokens pour forcer la reconnexion
  const tokenActuel = req.headers["authorization"]!.slice(7);
  await db.delete(tokensTable)
    .where(eq(tokensTable.agentId, req.agentId!));
  const newToken = generateToken();
  await db.insert(tokensTable).values({ token: newToken, agentId: req.agentId! });

  req.log.info({ agentId: req.agentId }, "Mot de passe changé");
  res.json({ message: "Mot de passe mis à jour", token: newToken });
});

export default router;
