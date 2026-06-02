import { Router, type IRouter } from "express";
import { z } from "zod";
import { agents, tokens, nextId, generateToken, hashPassword, safeAgent } from "../lib/store";

const router: IRouter = Router();

const AgentSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().min(1, "Le prénom est requis"),
  email: z.string().email("Email invalide"),
  telephone: z.string().min(8, "Numéro de téléphone invalide"),
  agence: z.string().min(1, "Le nom de l'agence est requis"),
  motDePasse: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
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

  const { motDePasse, ...donnees } = result.data;

  const agent: import("../lib/store").Agent = {
    id: nextId("agent"),
    ...donnees,
    passwordHash: hashPassword(motDePasse),
    createdAt: new Date().toISOString(),
  };

  const token = generateToken();
  agents.push(agent);
  tokens.set(token, agent.id);

  req.log.info({ agentId: agent.id }, "Nouvel agent créé");

  res.status(201).json({ agent: safeAgent(agent), token });
});

export default router;
