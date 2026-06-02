import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db, reservationsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const ReservationSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().min(1, "Le prénom est requis"),
  email: z.string().email("Email invalide"),
  telephone: z.string().min(8, "Numéro de téléphone invalide"),
  bien: z.string().min(1, "Le bien est requis"),
  date: z.string().min(1, "La date est requise"),
  heure: z.string().min(1, "L'heure est requise"),
});

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

router.get("/reservations", requireAuth, async (req, res) => {
  const { bienId, page, limite } = req.query;

  const pageNum = Math.max(1, parseInt((page as string) ?? "1") || 1);
  const limiteNum = Math.min(100, Math.max(1, parseInt((limite as string) ?? "50") || 50));
  const offset = (pageNum - 1) * limiteNum;

  const where = bienId && typeof bienId === "string"
    ? eq(reservationsTable.bien, bienId)
    : undefined;

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
    filtre: (bienId as string) ?? null,
    data: paginee,
  });
});

router.get("/reservations/:id", requireAuth, async (req, res) => {
  const [reservation] = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.id, req.params.id))
    .limit(1);
  if (!reservation) { res.status(404).json({ error: "Réservation introuvable" }); return; }
  res.json(reservation);
});

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
