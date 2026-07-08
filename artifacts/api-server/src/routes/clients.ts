import { Router, type IRouter } from "express";
import { eq, and, or, ilike, desc, SQL } from "drizzle-orm";
import { db, reservationsTable, biensTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

// ─── Lister les clients, dérivés des réservations (auth requise) ──────────────
router.get("/clients", requireAuth, async (req: AuthRequest, res) => {
  const { q } = req.query;
  const conditions: SQL[] = [eq(biensTable.agentId, req.agentId!)];
  if (q && typeof q === "string") {
    const motif = `%${q}%`;
    conditions.push(or(
      ilike(reservationsTable.nom, motif),
      ilike(reservationsTable.prenom, motif),
      ilike(reservationsTable.email, motif),
      ilike(reservationsTable.telephone, motif),
    )!);
  }

  const rows = await db
    .select({
      nom: reservationsTable.nom,
      prenom: reservationsTable.prenom,
      email: reservationsTable.email,
      telephone: reservationsTable.telephone,
      bien: reservationsTable.bien,
      date: reservationsTable.date,
    })
    .from(reservationsTable)
    .innerJoin(biensTable, eq(reservationsTable.bien, biensTable.titre))
    .where(and(...conditions))
    .orderBy(desc(reservationsTable.createdAt));

  // Un client = une adresse email unique, regroupée depuis ses réservations
  const clientsMap = new Map<string, {
    nom: string; prenom: string; email: string; telephone: string;
    nombreVisites: number; derniereVisite: string; biensVisites: string[];
  }>();

  for (const r of rows) {
    const existant = clientsMap.get(r.email);
    if (existant) {
      existant.nombreVisites += 1;
      if (!existant.biensVisites.includes(r.bien)) existant.biensVisites.push(r.bien);
    } else {
      clientsMap.set(r.email, {
        nom: r.nom,
        prenom: r.prenom,
        email: r.email,
        telephone: r.telephone,
        nombreVisites: 1,
        derniereVisite: r.date,
        biensVisites: [r.bien],
      });
    }
  }

  const clients = Array.from(clientsMap.values());
  res.json({ total: clients.length, data: clients });
});

// ─── Détail d'un client + historique complet (auth requise) ───────────────────
router.get("/clients/:email", requireAuth, async (req: AuthRequest, res) => {
  const email = decodeURIComponent(req.params.email).toLowerCase();
  const rows = await db
    .select({
      id: reservationsTable.id,
      nom: reservationsTable.nom,
      prenom: reservationsTable.prenom,
      email: reservationsTable.email,
      telephone: reservationsTable.telephone,
      bien: reservationsTable.bien,
      date: reservationsTable.date,
      heure: reservationsTable.heure,
      createdAt: reservationsTable.createdAt,
    })
    .from(reservationsTable)
    .innerJoin(biensTable, eq(reservationsTable.bien, biensTable.titre))
    .where(and(eq(biensTable.agentId, req.agentId!), eq(reservationsTable.email, email)))
    .orderBy(desc(reservationsTable.createdAt));

  if (rows.length === 0) {
    res.status(404).json({ error: "Client introuvable" });
    return;
  }

  const { nom, prenom, telephone } = rows[0]!;
  res.json({ nom, prenom, email, telephone, nombreVisites: rows.length, historique: rows });
});

export default router;
