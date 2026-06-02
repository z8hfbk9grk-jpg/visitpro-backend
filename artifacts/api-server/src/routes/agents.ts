import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db, agentsTable, tokensTable } from "@workspace/db";
import { generateToken, hashPassword, safeAgent } from "../lib/store";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const AgentSchema = z.object({
  nom: z.string().min(1, "Le nom est requis").trim(),
  prenom: z.string().min(1, "Le prénom est requis").trim(),
  email: z.string().email("Email invalide").trim().toLowerCase(),
  telephone: z.string().min(8, "Numéro de téléphone invalide").trim(),
  agence: z.string().min(1, "Le nom de l'agence est requis").trim(),
  motDePasse: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
});

// ─── Créer un agent ─────────────────────────────────────────────────────────────
router.post("/agents", async (req, res) => {
  const result = AgentSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }

  const { motDePasse, ...donnees } = result.data;

  const existing = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.email, donnees.email))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Un compte avec cet email existe déjà" });
    return;
  }

  const id = crypto.randomUUID();
  const [agent] = await db
    .insert(agentsTable)
    .values({ id, ...donnees, passwordHash: hashPassword(motDePasse) })
    .returning();

  const token = generateToken();
  await db.insert(tokensTable).values({ token, agentId: id });

  req.log.info({ agentId: id }, "Nouvel agent créé");
  res.status(201).json({ agent: safeAgent(agent!), token });
});

// ─── Lister tous les agents (auth requise) ─────────────────────────────────────
router.get("/agents", requireAuth, async (req, res) => {
  const { page, limite } = req.query;

  const pageNum = Math.max(1, parseInt((page as string) ?? "1") || 1);
  const limiteNum = Math.min(100, Math.max(1, parseInt((limite as string) ?? "20") || 20));
  const offset = (pageNum - 1) * limiteNum;

  const [tous, pagines] = await Promise.all([
    db.select({ id: agentsTable.id }).from(agentsTable),
    db.select().from(agentsTable).orderBy(desc(agentsTable.createdAt)).limit(limiteNum).offset(offset),
  ]);

  res.json({
    total: tous.length,
    page: pageNum,
    limite: limiteNum,
    totalPages: Math.ceil(tous.length / limiteNum),
    data: pagines.map(safeAgent),
  });
});

// ─── Récupérer un agent par ID (public) ────────────────────────────────────────
router.get("/agents/:id", async (req, res) => {
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, req.params.id))
    .limit(1);

  if (!agent) { res.status(404).json({ error: "Agent introuvable" }); return; }
  res.json(safeAgent(agent));
});

export default router;
