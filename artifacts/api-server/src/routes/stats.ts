import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, agentsTable, biensTable, reservationsTable } from "@workspace/db";
import { safeAgent } from "../lib/store";

const router: IRouter = Router();

router.get("/agents/:id/stats", async (req, res) => {
  const { id } = req.params;

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, id))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent introuvable" });
    return;
  }

  const agentBiens = await db
    .select({ id: biensTable.id, titre: biensTable.titre })
    .from(biensTable)
    .where(eq(biensTable.agentId, id));

  const nbBiens = agentBiens.length;

  let nbReservations = 0;
  let reservationsParBien: { titre: string; nbReservations: number }[] = [];

  if (agentBiens.length > 0) {
    const titres = agentBiens.map((b) => b.titre);

    const counts = await db
      .select({
        bien: reservationsTable.bien,
        count: sql<number>`cast(count(*) as integer)`,
      })
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
    stats: {
      nbBiens,
      nbReservations,
      reservationsParBien,
    },
  });
});

export default router;
