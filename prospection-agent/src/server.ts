// Le site web de l'agent (service "Web" sur Render).
// - Page protégée par mot de passe pour coller les annonces et voir les prospects.
// - Page publique de désinscription (lien présent dans chaque message d'approche).

import express, { type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import {
  ajouterProspect,
  desinscrire,
  initialiserSchema,
  listerProspects,
  relancerProspect,
  supprimerProspect,
  trouverParJeton,
} from "./db.js";
import { pageAccueil, pageDesinscription, pageDesinscriptionOk } from "./pages.js";
import { traiterAnnoncesEnAttente } from "./pipeline.js";
import { envoyerRecap } from "./recap.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// ---------- Pages publiques ----------

app.get("/sante", (_req, res) => {
  res.json({ ok: true });
});

app.get("/desinscription/:jeton", async (req, res, next) => {
  try {
    const prospect = await trouverParJeton(req.params.jeton);
    res.send(pageDesinscription(req.params.jeton, prospect !== null));
  } catch (e) {
    next(e);
  }
});

app.post("/desinscription/:jeton", async (req, res, next) => {
  try {
    const prospect = await trouverParJeton(req.params.jeton);
    if (prospect) await desinscrire(prospect);
    res.send(pageDesinscriptionOk());
  } catch (e) {
    next(e);
  }
});

// ---------- Protection par mot de passe ----------

function egal(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function hoteDe(origine: string): string | null {
  try {
    return new URL(origine).host;
  } catch {
    return null;
  }
}

function protection(req: Request, res: Response, next: NextFunction): void {
  const entete = req.headers.authorization ?? "";
  if (entete.startsWith("Basic ")) {
    const decode = Buffer.from(entete.slice(6), "base64").toString("utf8");
    const motDePasse = decode.slice(decode.indexOf(":") + 1);
    if (egal(motDePasse, config.adminPassword())) {
      // Les formulaires ne peuvent être envoyés que depuis ce site.
      const origine = req.headers.origin;
      if (req.method === "POST" && origine && hoteDe(origine) !== req.headers.host) {
        res.status(403).send("Origine refusée");
        return;
      }
      next();
      return;
    }
  }
  res.setHeader("WWW-Authenticate", 'Basic realm="Agent de prospection", charset="UTF-8"');
  res.status(401).send("Mot de passe requis (identifiant : ce que vous voulez).");
}

app.use(protection);

// ---------- Pages privées ----------

app.get("/", async (req, res, next) => {
  try {
    const info = typeof req.query.info === "string" ? req.query.info : undefined;
    res.send(pageAccueil(await listerProspects(), info));
  } catch (e) {
    next(e);
  }
});

app.post("/ajouter", async (req, res, next) => {
  try {
    const resultat = await ajouterProspect(
      String(req.body.url ?? ""),
      String(req.body.texte ?? "").slice(0, 30000),
      String(req.body.notes ?? "").slice(0, 2000),
    );
    res.redirect(`/?info=${resultat}`);
  } catch (e) {
    next(e);
  }
});

app.post("/ajouter-liens", async (req, res, next) => {
  try {
    const liens = String(req.body.liens ?? "")
      .split(/\s+/)
      .filter((l) => l.startsWith("http"))
      .slice(0, 100);
    let ajoutes = 0;
    for (const l of liens) {
      if ((await ajouterProspect(l, "", "")) === "ajoute") ajoutes++;
    }
    res.redirect(`/?info=${ajoutes > 0 ? "ajoute" : "existe_deja"}`);
  } catch (e) {
    next(e);
  }
});

app.post("/analyser", (_req, res) => {
  // L'analyse tourne en arrière-plan ; la page se rafraîchit toute seule.
  traiterAnnoncesEnAttente(config.maxAnnoncesParJour()).catch((e) =>
    console.error("[web] Échec de l'analyse :", e),
  );
  setTimeout(() => res.redirect("/?info=analyse_lancee"), 1500);
});

app.post("/recap", async (_req, res) => {
  try {
    await envoyerRecap();
    res.redirect("/?info=recap_envoye");
  } catch (e) {
    console.error("[web] Échec du récap :", e);
    res.redirect("/?info=recap_erreur");
  }
});

app.post("/prospects/:id/relancer", async (req, res, next) => {
  try {
    await relancerProspect(Number(req.params.id));
    res.redirect("/?info=relance");
  } catch (e) {
    next(e);
  }
});

app.post("/prospects/:id/supprimer", async (req, res, next) => {
  try {
    await supprimerProspect(Number(req.params.id));
    res.redirect("/?info=supprime");
  } catch (e) {
    next(e);
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[web] Erreur :", err);
  res.status(500).send("Une erreur est survenue. Consultez les logs sur Render.");
});

// ---------- Démarrage ----------

const port = Number(process.env.PORT) || 3000;
initialiserSchema()
  .then(() => {
    app.listen(port, () => console.log(`[web] Agent de prospection en ligne sur le port ${port}`));
  })
  .catch((e) => {
    console.error("[web] Impossible de se connecter à la base de données :", e);
    process.exit(1);
  });
