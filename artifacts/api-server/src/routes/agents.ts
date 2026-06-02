import { Router, type IRouter } from "express";
import { z } from "zod";
import { agents, nextId } from "../lib/store";

const router: IRouter = Router();

const AgentSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().min(1, "Le prénom est requis"),
  email: z.string().email("Email invalide"),
  telephone: z.string().min(8, "Numéro de téléphone invalide"),
  agence: z.string().min(1, "Le nom de l'agence est requis"),
});

router.post("/agents", (req, res) => {
  const result = AgentSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Données invalides",
      details: result.error.issues,
    });
    return;
  }

  const emailExistant = agents.find((a) => a.email === result.data.email);
  if (emailExistant) {
    res.status(409).json({ error: "Un compte avec cet email existe déjà" });
    return;
  }

  const agent = {
    id: nextId("agent"),
    ...result.data,
    createdAt: new Date().toISOString(),
  };

  agents.push(agent);
  req.log.info({ agentId: agent.id }, "Nouvel agent créé");

  res.status(201).json(agent);
});

export default router;
