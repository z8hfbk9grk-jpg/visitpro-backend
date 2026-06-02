import { Router, type IRouter } from "express";
import { biens } from "../lib/store";

const router: IRouter = Router();

router.get("/biens", (req, res) => {
  const { agentId } = req.query;

  if (!agentId || typeof agentId !== "string") {
    res.status(400).json({ error: "Le paramètre agentId est requis" });
    return;
  }

  const biensAgent = biens.filter((b) => b.agentId === agentId);

  res.json({
    agentId,
    total: biensAgent.length,
    data: biensAgent,
  });
});

export default router;
