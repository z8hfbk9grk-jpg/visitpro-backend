import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// 404 pour toute route inconnue
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route introuvable" });
});

// Gestionnaire d'erreurs global — capture les erreurs async non gérées
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err }, "Erreur non gérée");
  logger.error({ err }, "Erreur non gérée");
  res.status(500).json({ error: "Erreur interne du serveur" });
});

export default app;
