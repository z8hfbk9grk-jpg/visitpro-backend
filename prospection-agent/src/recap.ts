// Prépare et envoie le récapitulatif des nouvelles analyses.

import { config } from "./config.js";
import { compterParStatut, marquerRecapEnvoye, prospectsPourRecap } from "./db.js";
import { construireRecap, envoyerEmail } from "./email.js";

export async function envoyerRecap(): Promise<number> {
  const prospects = await prospectsPourRecap();
  const compteurs = await compterParStatut();
  const { objet, html } = construireRecap(prospects, compteurs, config.publicUrl());
  await envoyerEmail(objet, html);
  await marquerRecapEnvoye(prospects.map((p) => p.id));
  return prospects.length;
}
