import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, agentsTable, biensTable, reservationsTable } from "@workspace/db";
import { safeAgent } from "../lib/store";

const router: IRouter = Router();

// ─── Stats globales ────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  const [
    [agentCount],
    [bienCount],
    [reservationCount],
    biensParType,
    topBiens,
  ] = await Promise.all([
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(agentsTable),
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(biensTable),
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(reservationsTable),
    db
      .select({ type: biensTable.type, count: sql<number>`cast(count(*) as integer)` })
      .from(biensTable)
      .groupBy(biensTable.type)
      .orderBy(sql`count(*) desc`),
    db
      .select({ bien: reservationsTable.bien, nbReservations: sql<number>`cast(count(*) as integer)` })
      .from(reservationsTable)
      .groupBy(reservationsTable.bien)
      .orderBy(sql`count(*) desc`)
      .limit(5),
  ]);

  res.json({
    agents: agentCount?.count ?? 0,
    biens: bienCount?.count ?? 0,
    reservations: reservationCount?.count ?? 0,
    biensParType,
    topBiens,
  });
});

// ─── Stats par agent ───────────────────────────────────────────────────────────
router.get("/agents/:id/stats", async (req, res) => {
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, req.params.id))
    .limit(1);

  if (!agent) { res.status(404).json({ error: "Agent introuvable" }); return; }

  const agentBiens = await db
    .select({ id: biensTable.id, titre: biensTable.titre, type: biensTable.type, prix: biensTable.prix })
    .from(biensTable)
    .where(eq(biensTable.agentId, req.params.id));

  let nbReservations = 0;
  let reservationsParBien: { titre: string; nbReservations: number }[] = [];

  if (agentBiens.length > 0) {
    const titres = agentBiens.map((b) => b.titre);
    const counts = await db
      .select({ bien: reservationsTable.bien, count: sql<number>`cast(count(*) as integer)` })
      .from(reservationsTable)
      .where(inArray(reservationsTable.bien, titres))
      .groupBy(reservationsTable.bien);

    const countMap = new Map(counts.map((r) => [r.bien, r.count]));
    nbReservations = counts.reduce((sum, r) => sum + r.count, 0);
    reservationsParBien = agentBiens.map((b) => ({
      titre: b.titre,
      nbReservations: countMap.get(b.titre) ?? 0,
    }));
  }

  res.json({
    agent: safeAgent(agent),
    stats: { nbBiens: agentBiens.length, nbReservations, reservationsParBien },
  });
});

export default router;
