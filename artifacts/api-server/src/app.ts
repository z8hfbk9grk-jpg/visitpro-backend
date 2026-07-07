import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
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

// CORS restreint à tes domaines de prod (+ "null" pour tes outils de test en local)
const allowedOrigins = [
  "https://visitpro-backend-api-server-git-main-visitpro.vercel.app",
  "https://visitpro-backend-api-server-jazy8x2bz-visitpro.vercel.app",
  "null", // fichiers HTML ouverts en local (outils de test) — à retirer une fois en vraie prod
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Non autorisé par CORS"));
    }
  },
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Limite globale : 100 requêtes / minute / IP
app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use("/api", router);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route introuvable" });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err }, "Erreur non gérée");
  logger.error({ err }, "Erreur non gérée");
  res.status(500).json({ error: "Erreur interne du serveur" });
});

export default app;
