import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, biensTable, agentsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

const BienSchema = z.object({
  titre: z.string().min(1, "Le titre est requis"),
  adresse: z.string().min(1, "L'adresse est requise"),
  type: z.enum(["appartement", "maison", "studio", "bureau", "terrain"], {
    errorMap: () => ({ message: "Type invalide (appartement, maison, studio, bureau, terrain)" }),
  }),
  prix: z.number().positive("Le prix doit être positif"),
  surface: z.number().positive("La surface doit être positive"),
  description: z.string().optional().default(""),
});

router.post("/biens", requireAuth, async (req: AuthRequest, res) => {
  const result = BienSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }

  const id = crypto.randomUUID();
  const [bien] = await db
    .insert(biensTable)
    .values({ id, agentId: req.agentId!, ...result.data })
    .returning();

  req.log.info({ bienId: id }, "Nouveau bien publié");
  res.status(201).json(bien);
});

router.get("/biens", async (req, res) => {
  const { agentId } = req.query;

  if (!agentId || typeof agentId !== "string") {
    res.status(400).json({ error: "Le paramètre agentId est requis" });
    return;
  }

  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent introuvable" });
    return;
  }

  const data = await db
    .select()
    .from(biensTable)
    .where(eq(biensTable.agentId, agentId));

  res.json({ agentId, total: data.length, data });
});

export default router;
