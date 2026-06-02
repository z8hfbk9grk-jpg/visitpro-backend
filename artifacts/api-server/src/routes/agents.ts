import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, agentsTable, tokensTable } from "@workspace/db";
import { generateToken, hashPassword, safeAgent } from "../lib/store";

const router: IRouter = Router();

const AgentSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().min(1, "Le prénom est requis"),
  email: z.string().email("Email invalide"),
  telephone: z.string().min(8, "Numéro de téléphone invalide"),
  agence: z.string().min(1, "Le nom de l'agence est requis"),
  motDePasse: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
});

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

export default router;
