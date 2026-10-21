// Tâche planifiée lancée chaque matin par Render (service "Cron Job").
// 1. analyse les annonces en attente
// 2. supprime les fiches trop anciennes (RGPD)
// 3. vous envoie le récapitulatif par email

import { config } from "./config.js";
import { fermerDb, initialiserSchema, purgerAnciensProspects } from "./db.js";
import { traiterAnnoncesEnAttente } from "./pipeline.js";
import { envoyerRecap } from "./recap.js";

async function main(): Promise<void> {
  console.log("[cron] Démarrage de la tournée du matin");
  await initialiserSchema();

  const { ok, erreurs } = await traiterAnnoncesEnAttente(config.maxAnnoncesParJour());
  console.log(`[cron] Analyses : ${ok} réussie(s), ${erreurs} en erreur`);

  const purges = await purgerAnciensProspects(config.dureeConservationJours());
  console.log(`[cron] RGPD : ${purges} fiche(s) ancienne(s) supprimée(s)`);

  const envoyes = await envoyerRecap();
  console.log(`[cron] Récapitulatif envoyé (${envoyes} prospect(s))`);
}

main()
  .then(async () => {
    await fermerDb();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("[cron] Échec :", e);
    await fermerDb().catch(() => {});
    process.exit(1);
  });
