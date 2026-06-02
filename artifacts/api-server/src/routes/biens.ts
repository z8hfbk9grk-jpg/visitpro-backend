import { Router, type IRouter } from "express";
import { z } from "zod";
import { biens, agents, nextId } from "../lib/store";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

const BienSchema = z.object({
  titre: z.string().min(1, "Le titre est requis"),
  adresse: z.string().min(1, "L'adresse est requise"),
  type: z.enum(["appartement", "maison", "studio", "bureau", "terrain"], {
    errorMap: () => ({
      message: "Type invalide (appartement, maison, studio, bureau, terrain)",
    }),
  }),
  prix: z.number().positive("Le prix doit être positif"),
  surface: z.number().positive("La surface doit être positive"),
  description: z.string().optional().default(""),
});

router.post("/biens", requireAuth, (req: AuthRequest, res) => {
  const result = BienSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Données invalides",
      details: result.error.issues,
    });
    return;
  }

  const bien = {
    id: nextId("bien"),
    agentId: req.agentId!,
    ...result.data,
    createdAt: new Date().toISOString(),
  };

  biens.push(bien);
  req.log.info({ bienId: bien.id }, "Nouveau bien publié");

  res.status(201).json(bien);
});

router.get("/biens", (req, res) => {
  const { agentId } = req.query;

  if (!agentId || typeof agentId !== "string") {
    res.status(400).json({ error: "Le paramètre agentId est requis" });
    return;
  }

  const agentExiste = agents.find((a) => a.id === agentId);
  if (!agentExiste) {
    res.status(404).json({ error: "Agent introuvable" });
    return;
  }

  const biensAgent = biens.filter((b) => b.agentId === agentId);

  res.json({
    agentId,
    total: biensAgent.length,
    data: biensAgent,
  });
});

export default router;
