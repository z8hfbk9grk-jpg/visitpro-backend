import { Router, type IRouter } from "express";
import { z } from "zod";
import { reservations, nextId } from "../lib/store";
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

router.post("/reservations", (req, res) => {
  const result = ReservationSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Données invalides",
      details: result.error.issues,
    });
    return;
  }

  const reservation = {
    id: nextId("res"),
    ...result.data,
    createdAt: new Date().toISOString(),
  };

  reservations.push(reservation);
  req.log.info({ reservationId: reservation.id }, "Nouvelle réservation créée");

  res.status(201).json(reservation);
});

router.get("/reservations", requireAuth, (_req, res) => {
  res.json({
    total: reservations.length,
    data: reservations,
  });
});

router.delete("/reservations/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const index = reservations.findIndex((r) => r.id === id);

  if (index === -1) {
    res.status(404).json({ error: "Réservation introuvable" });
    return;
  }

  const [supprimee] = reservations.splice(index, 1);
  req.log.info({ reservationId: id }, "Réservation annulée");

  res.json({ message: "Réservation annulée", reservation: supprimee });
});

export default router;
