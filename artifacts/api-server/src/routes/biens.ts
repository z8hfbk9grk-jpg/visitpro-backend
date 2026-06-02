import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and, gte, lte, or, ilike, asc, desc, SQL } from "drizzle-orm";
import { db, biensTable, agentsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

const TYPES_VALIDES = ["appartement", "maison", "studio", "bureau", "terrain"] as const;
const TRIS_VALIDES = ["prix_asc", "prix_desc", "surface_asc", "surface_desc", "recent"] as const;

const BienSchema = z.object({
  titre: z.string().min(1, "Le titre est requis"),
  adresse: z.string().min(1, "L'adresse est requise"),
  type: z.enum(TYPES_VALIDES, {
    errorMap: () => ({ message: "Type invalide (appartement, maison, studio, bureau, terrain)" }),
  }),
  prix: z.number().positive("Le prix doit être positif"),
  surface: z.number().positive("La surface doit être positive"),
  description: z.string().optional().default(""),
});

const BienUpdateSchema = BienSchema.partial();

router.post("/biens", requireAuth, async (req: AuthRequest, res) => {
  const result = BienSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }
  const id = crypto.randomUUID();
  const [bien] = await db
    .insert(biensTable)
    .values({ id, agentId: req.agentId!, ...result.data })
    .returning();
  req.log.info({ bienId: id }, "Nouveau bien publié");
  res.status(201).json(bien);
});

router.get("/biens/:id", async (req, res) => {
  const [bien] = await db
    .select()
    .from(biensTable)
    .where(eq(biensTable.id, req.params.id))
    .limit(1);
  if (!bien) { res.status(404).json({ error: "Bien introuvable" }); return; }
  res.json(bien);
});

router.get("/biens", async (req, res) => {
  const { agentId, type, q, prixMin, prixMax, tri, page, limite } = req.query;

  // Validation type
  if (type && typeof type === "string" && !TYPES_VALIDES.includes(type as (typeof TYPES_VALIDES)[number])) {
    res.status(400).json({ error: `Type invalide. Valeurs acceptées : ${TYPES_VALIDES.join(", ")}` });
    return;
  }

  // Validation tri
  if (tri && typeof tri === "string" && !TRIS_VALIDES.includes(tri as (typeof TRIS_VALIDES)[number])) {
    res.status(400).json({ error: `Tri invalide. Valeurs acceptées : ${TRIS_VALIDES.join(", ")}` });
    return;
  }

  // Validation agentId
  if (agentId && typeof agentId === "string") {
    const [agent] = await db.select({ id: agentsTable.id }).from(agentsTable)
      .where(eq(agentsTable.id, agentId)).limit(1);
    if (!agent) { res.status(404).json({ error: "Agent introuvable" }); return; }
  }

  // Pagination
  const pageNum = Math.max(1, parseInt((page as string) ?? "1") || 1);
  const limiteNum = Math.min(100, Math.max(1, parseInt((limite as string) ?? "20") || 20));
  const offset = (pageNum - 1) * limiteNum;

  // Construction des conditions WHERE
  const conditions: SQL[] = [];
  if (agentId && typeof agentId === "string") conditions.push(eq(biensTable.agentId, agentId));
  if (type && typeof type === "string") conditions.push(eq(biensTable.type, type));
  if (prixMin) conditions.push(gte(biensTable.prix, parseFloat(prixMin as string)));
  if (prixMax) conditions.push(lte(biensTable.prix, parseFloat(prixMax as string)));
  if (q && typeof q === "string") {
    const motif = `%${q}%`;
    conditions.push(or(ilike(biensTable.titre, motif), ilike(biensTable.adresse, motif), ilike(biensTable.description, motif))!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Tri
  const orderBy = (() => {
    switch (tri as string) {
      case "prix_asc":     return asc(biensTable.prix);
      case "prix_desc":    return desc(biensTable.prix);
      case "surface_asc":  return asc(biensTable.surface);
      case "surface_desc": return desc(biensTable.surface);
      default:             return desc(biensTable.createdAt);
    }
  })();

  const [tousLesBiens, pagineBiens] = await Promise.all([
    db.select({ id: biensTable.id }).from(biensTable).where(where),
    db.select().from(biensTable).where(where).orderBy(orderBy).limit(limiteNum).offset(offset),
  ]);

  const total = tousLesBiens.length;
  const totalPages = Math.ceil(total / limiteNum);

  res.json({
    total,
    page: pageNum,
    limite: limiteNum,
    totalPages,
    filtres: {
      agentId: (agentId as string) ?? null,
      type: (type as string) ?? null,
      q: (q as string) ?? null,
      prixMin: prixMin ? parseFloat(prixMin as string) : null,
      prixMax: prixMax ? parseFloat(prixMax as string) : null,
      tri: (tri as string) ?? "recent",
    },
    data: pagineBiens,
  });
});

router.put("/biens/:id", requireAuth, async (req: AuthRequest, res) => {
  const result = BienUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.issues });
    return;
  }
  if (Object.keys(result.data).length === 0) {
    res.status(400).json({ error: "Aucun champ à mettre à jour" });
    return;
  }
  const [bien] = await db.update(biensTable).set(result.data)
    .where(and(eq(biensTable.id, req.params.id), eq(biensTable.agentId, req.agentId!)))
    .returning();
  if (!bien) { res.status(404).json({ error: "Bien introuvable ou accès non autorisé" }); return; }
  req.log.info({ bienId: req.params.id }, "Bien mis à jour");
  res.json(bien);
});

router.delete("/biens/:id", requireAuth, async (req: AuthRequest, res) => {
  const [supprime] = await db.delete(biensTable)
    .where(and(eq(biensTable.id, req.params.id), eq(biensTable.agentId, req.agentId!)))
    .returning();
  if (!supprime) { res.status(404).json({ error: "Bien introuvable ou accès non autorisé" }); return; }
  req.log.info({ bienId: req.params.id }, "Bien supprimé");
  res.json({ message: "Bien supprimé", bien: supprime });
});

export default router;
