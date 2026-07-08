import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and, or, ilike, desc, SQL } from "drizzle-orm";
import { db, reservationsTable, biensTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

const ReservationSchema = z.object({
  nom: z.string().min(1, "Le nom est requis").trim(),
  prenom: z.string().min(1, "Le prénom est requis").trim(),
  email: z.string().email("Email invalide").trim().toLowerCase(),
  telephone: z.string().min(8, "Numéro de téléphone invalide").trim(),
  bien: z.string().min(1, "Le bien est requis").trim(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (AAAA-MM-JJ)"),
  heure: z.string().regex(/^\d{2}:\d{2}$/, "Format heure invalide (HH:MM)"),
});

const ReservationUpdateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (AAAA-MM-JJ)").optional(),
  heure: z.string().regex(/^\d{2}:\d{2}$/, "Format heure invalide (HH:MM)").optional(),
  bien: z.string().min(1).trim().optional(),
});

const RESA_COLS = {
  id: reservationsTable.id,
  nom: reservationsTable.nom,
  prenom: reservationsTable.prenom,
  email: reservationsTable.email,
  telephone: reservationsTable.telephone,
  bien: reservationsTable.bien,
  date: reservationsTable.date,
  heure: reservationsTable.heure,
  createdAt: reservationsTable.createdAt,
};

// ─── Créer une réservation (public) ────────────────────────────────────────────
router.post("/reservations", async (req, res) => {
  const result = ReservationSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }
  const id = crypto.randomUUID();
  const [reservation] = await db
    .insert(reservationsTable)
    .values({ id, ...result.data })
    .returning();
  req.log.info({ reservationId: id }, "Nouvelle réservation créée");
  res.status(201).json(reservation);
});

// ─── Créneaux déjà pris pour les biens de l'agent (auth requise) ──────────────
// IMPORTANT : cette route doit rester déclarée AVANT "/reservations/:id"
router.get("/reservations/creneaux-pris", requireAuth, async (req: AuthRequest, res) => {
  const { bienId } = req.query;
  const conditions: SQL[] = [eq(biensTable.agentId, req.agentId!)];
  if (bienId && typeof bienId === "string") {
    conditions.push(eq(reservationsTable.bien, bienId));
  }

  const rows = await db
    .select({ date: reservationsTable.date, heure: reservationsTable.heure, bien: reservationsTable.bien })
    .from(reservationsTable)
    .innerJoin(biensTable, eq(reservationsTable.bien, biensTable.titre))
    .where(and(...conditions));

  const parDate: Record<string, { heure: string; bien: string }[]> = {};
  for (const r of rows) {
    if (!parDate[r.date]) parDate[r.date] = [];
    parDate[r.date]!.push({ heure: r.heure, bien: r.bien });
  }
  res.json({ creneaux: parDate });
});

// ─── Lister les réservations (auth requise, filtrées par agent) ───────────────
router.get("/reservations", requireAuth, async (req: AuthRequest, res) => {
  const { bienId, q, nom, email, page, limite } = req.query;

  const pageNum = Math.max(1, parseInt((page as string) ?? "1") || 1);
  const limiteNum = Math.min(100, Math.max(1, parseInt((limite as string) ?? "50") || 50));
  const offset = (pageNum - 1) * limiteNum;

  const conditions: SQL[] = [eq(biensTable.agentId, req.agentId!)];
  if (bienId && typeof bienId === "string") conditions.push(eq(reservationsTable.bien, bienId));
  if (nom && typeof nom === "string") {
    conditions.push(or(
      ilike(reservationsTable.nom, `%${nom}%`),
      ilike(reservationsTable.prenom, `%${nom}%`),
    )!);
  }
  if (email && typeof email === "string") conditions.push(ilike(reservationsTable.email, `%${email}%`));
  if (q && typeof q === "string") {
    const motif = `%${q}%`;
    conditions.push(or(
      ilike(reservationsTable.nom, motif),
      ilike(reservationsTable.prenom, motif),
      ilike(reservationsTable.email, motif),
      ilike(reservationsTable.bien, motif),
    )!);
  }

  const where = and(...conditions);
  const baseFrom = () => db.select(RESA_COLS).from(reservationsTable)
    .innerJoin(biensTable, eq(reservationsTable.bien, biensTable.titre));

  const [toutes, paginee] = await Promise.all([
    baseFrom().where(where),
    baseFrom().where(where).orderBy(desc(reservationsTable.createdAt)).limit(limiteNum).offset(offset),
  ]);

  res.json({
    total: toutes.length,
    page: pageNum,
    limite: limiteNum,
    totalPages: Math.ceil(toutes.length / limiteNum),
    filtres: {
      bienId: (bienId as string) ?? null,
      q: (q as string) ?? null,
      nom: (nom as string) ?? null,
      email: (email as string) ?? null,
    },
    data: paginee,
  });
});

// ─── Récupérer une réservation par ID (auth + propriété) ──────────────────────
router.get("/reservations/:id", requireAuth, async (req: AuthRequest, res) => {
  const [reservation] = await db
    .select(RESA_COLS)
    .from(reservationsTable)
    .innerJoin(biensTable, eq(reservationsTable.bien, biensTable.titre))
    .where(and(eq(reservationsTable.id, req.params.id), eq(biensTable.agentId, req.agentId!)))
    .limit(1);
  if (!reservation) { res.status(404).json({ error: "Réservation introuvable" }); return; }
  res.json(reservation);
});

// ─── Replanifier une réservation (auth + propriété) ────────────────────────────
router.patch("/reservations/:id", requireAuth, async (req: AuthRequest, res) => {
  const result = ReservationUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }
  if (Object.keys(result.data).length === 0) {
    res.status(400).json({ error: "Aucun champ à mettre à jour (date, heure, bien)" });
    return;
  }
  const [existante] = await db
    .select({ id: reservationsTable.id })
    .from(reservationsTable)
    .innerJoin(biensTable, eq(reservationsTable.bien, biensTable.titre))
    .where(and(eq(reservationsTable.id, req.params.id), eq(biensTable.agentId, req.agentId!)))
    .limit(1);
  if (!existante) { res.status(404).json({ error: "Réservation introuvable ou accès non autorisé" }); return; }

  const [reservation] = await db
    .update(reservationsTable)
    .set(result.data)
    .where(eq(reservationsTable.id, req.params.id))
    .returning();
  req.log.info({ reservationId: req.params.id }, "Réservation replanifiée");
  res.json(reservation);
});

// ─── Annuler une réservation (auth + propriété) ────────────────────────────────
router.delete("/reservations/:id", requireAuth, async (req: AuthRequest, res) => {
  const [existante] = await db
    .select({ id: reservationsTable.id })
    .from(reservationsTable)
    .innerJoin(biensTable, eq(reservationsTable.bien, biensTable.titre))
    .where(and(eq(reservationsTable.id, req.params.id), eq(biensTable.agentId, req.agentId!)))
    .limit(1);
  if (!existante) { res.status(404).json({ error: "Réservation introuvable ou accès non autorisé" }); return; }

  const [supprimee] = await db
    .delete(reservationsTable)
    .where(eq(reservationsTable.id, req.params.id))
    .returning();
  req.log.info({ reservationId: req.params.id }, "Réservation annulée");
  res.json({ message: "Réservation annulée", reservation: supprimee });
});

export default router;
