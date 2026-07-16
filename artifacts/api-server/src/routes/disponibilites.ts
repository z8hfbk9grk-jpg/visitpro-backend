import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, horairesTable, joursBloquesTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

const JOURS_VALIDES = ["lun","mar","mer","jeu","ven","sam","dim"] as const;

export const DEFAULTS_JOUR: Record<string, { actif: boolean; heureDebut: string; heureFin: string }> = {
  lun: { actif: true, heureDebut: "09:00", heureFin: "18:00" },
  mar: { actif: true, heureDebut: "09:00", heureFin: "18:00" },
  mer: { actif: true, heureDebut: "09:00", heureFin: "18:00" },
  jeu: { actif: true, heureDebut: "09:00", heureFin: "18:00" },
  ven: { actif: true, heureDebut: "09:00", heureFin: "17:00" },
  sam: { actif: true, heureDebut: "09:00", heureFin: "13:00" },
  dim: { actif: false, heureDebut: "10:00", heureFin: "12:00" },
};

const HoraireSchema = z.object({
  jour: z.enum(JOURS_VALIDES),
  actif: z.boolean(),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/),
});
const HorairesUpdateSchema = z.object({ horaires: z.array(HoraireSchema).min(1) });

router.get("/disponibilites/horaires", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db.select().from(horairesTable).where(eq(horairesTable.agentId, req.agentId!));
  const parJour = new Map(rows.map(r => [r.jour, r]));
  const horaires = JOURS_VALIDES.map(jour => {
    const existant = parJour.get(jour);
    return existant
      ? { jour, actif: existant.actif, heureDebut: existant.heureDebut, heureFin: existant.heureFin }
      : { jour, ...DEFAULTS_JOUR[jour] };
  });
  res.json({ horaires });
});

router.put("/disponibilites/horaires", requireAuth, async (req: AuthRequest, res) => {
  const result = HorairesUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }
  for (const h of result.data.horaires) {
    await db.insert(horairesTable)
      .values({ agentId: req.agentId!, jour: h.jour, actif: h.actif, heureDebut: h.heureDebut, heureFin: h.heureFin })
      .onConflictDoUpdate({
        target: [horairesTable.agentId, horairesTable.jour],
        set: { actif: h.actif, heureDebut: h.heureDebut, heureFin: h.heureFin },
      });
  }
  req.log.info({ agentId: req.agentId }, "Horaires de base mis à jour");
  res.json({ message: "Horaires mis à jour" });
});

router.get("/disponibilites/jours-bloques", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db.select().from(joursBloquesTable).where(eq(joursBloquesTable.agentId, req.agentId!));
  res.json({ data: rows });
});

const BlocageSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (AAAA-MM-JJ)"),
  motif: z.string().trim().optional(),
});

router.post("/disponibilites/jours-bloques", requireAuth, async (req: AuthRequest, res) => {
  const result = BlocageSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }
  const id = crypto.randomUUID();
  const [bloc] = await db.insert(joursBloquesTable)
    .values({ id, agentId: req.agentId!, date: result.data.date, motif: result.data.motif ?? null })
    .returning();
  req.log.info({ agentId: req.agentId, date: result.data.date }, "Jour bloqué");
  res.status(201).json(bloc);
});

router.delete("/disponibilites/jours-bloques/:id", requireAuth, async (req: AuthRequest, res) => {
  const [supprime] = await db.delete(joursBloquesTable)
    .where(and(eq(joursBloquesTable.id, req.params.id), eq(joursBloquesTable.agentId, req.agentId!)))
    .returning();
  if (!supprime) { res.status(404).json({ error: "Jour bloqué introuvable" }); return; }
  res.json({ message: "Jour débloqué" });
});

export default router;
