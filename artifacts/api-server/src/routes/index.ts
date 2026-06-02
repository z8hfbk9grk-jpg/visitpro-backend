import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reservationsRouter from "./reservations";
import agentsRouter from "./agents";
import biensRouter from "./biens";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentsRouter);
router.use(authRouter);
router.use(reservationsRouter);
router.use(biensRouter);

export default router;
