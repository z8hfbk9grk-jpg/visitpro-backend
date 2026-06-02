import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
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
  const { bienId } = req.query;

  const data =
    bienId && typeof bienId === "string"
      ? await db.select().from(reservationsTable).where(eq(reservationsTable.bien, bienId))
      : await db.select().from(reservationsTable);

  res.json({ total: data.length, filtre: bienId ?? null, data });
});

router.delete("/reservations/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  const [supprimee] = await db
    .delete(reservationsTable)
    .where(eq(reservationsTable.id, id))
    .returning();

  if (!supprimee) {
    res.status(404).json({ error: "Réservation introuvable" });
    return;
  }

  req.log.info({ reservationId: id }, "Réservation annulée");
  res.json({ message: "Réservation annulée", reservation: supprimee });
});

export default router;
