import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reservationsRouter from "./reservations";
import agentsRouter from "./agents";
import biensRouter from "./biens";

const router: IRouter = Router();

router.use(healthRouter);
router.use(reservationsRouter);
router.use(agentsRouter);
router.use(biensRouter);

export default router;
