import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and, or, ilike, desc, SQL } from "drizzle-orm";
import { db, reservationsTable, biensTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

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

// ─── Lister les réservations (auth requise) ────────────────────────────────────
router.get("/reservations", requireAuth, async (req, res) => {
  const { bienId, q, nom, email, page, limite } = req.query;

  const pageNum = Math.max(1, parseInt((page as string) ?? "1") || 1);
  const limiteNum = Math.min(100, Math.max(1, parseInt((limite as string) ?? "50") || 50));
  const offset = (pageNum - 1) * limiteNum;

  const conditions: SQL[] = [];

  if (bienId && typeof bienId === "string") {
    conditions.push(eq(reservationsTable.bien, bienId));
  }
  if (nom && typeof nom === "string") {
    conditions.push(or(
      ilike(reservationsTable.nom, `%${nom}%`),
      ilike(reservationsTable.prenom, `%${nom}%`),
    )!);
  }
  if (email && typeof email === "string") {
    conditions.push(ilike(reservationsTable.email, `%${email}%`));
  }
  // Recherche globale q= (nom, prenom, email, bien)
  if (q && typeof q === "string") {
    const motif = `%${q}%`;
    conditions.push(or(
      ilike(reservationsTable.nom, motif),
      ilike(reservationsTable.prenom, motif),
      ilike(reservationsTable.email, motif),
      ilike(reservationsTable.bien, motif),
    )!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [toutes, paginee] = await Promise.all([
    db.select({ id: reservationsTable.id }).from(reservationsTable).where(where),
    db.select().from(reservationsTable).where(where)
      .orderBy(desc(reservationsTable.createdAt))
      .limit(limiteNum).offset(offset),
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

// ─── Récupérer une réservation par ID (auth requise) ───────────────────────────
router.get("/reservations/:id", requireAuth, async (req, res) => {
  const [reservation] = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.id, req.params.id))
    .limit(1);
  if (!reservation) { res.status(404).json({ error: "Réservation introuvable" }); return; }
  res.json(reservation);
});

// ─── Replanifier une réservation (auth requise) ────────────────────────────────
router.patch("/reservations/:id", requireAuth, async (req, res) => {
  const result = ReservationUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }
  if (Object.keys(result.data).length === 0) {
    res.status(400).json({ error: "Aucun champ à mettre à jour (date, heure, bien)" });
    return;
  }
  const [reservation] = await db
    .update(reservationsTable)
    .set(result.data)
    .where(eq(reservationsTable.id, req.params.id))
    .returning();
  if (!reservation) { res.status(404).json({ error: "Réservation introuvable" }); return; }
  req.log.info({ reservationId: req.params.id }, "Réservation replanifiée");
  res.json(reservation);
});

// ─── Annuler une réservation (auth requise) ────────────────────────────────────
router.delete("/reservations/:id", requireAuth, async (req, res) => {
  const [supprimee] = await db
    .delete(reservationsTable)
    .where(eq(reservationsTable.id, req.params.id))
    .returning();
  if (!supprimee) { res.status(404).json({ error: "Réservation introuvable" }); return; }
  req.log.info({ reservationId: req.params.id }, "Réservation annulée");
  res.json({ message: "Réservation annulée", reservation: supprimee });
});

export default router;
