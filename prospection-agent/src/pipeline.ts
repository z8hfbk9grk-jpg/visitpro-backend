// Le "cerveau" de l'agent : traite les annonces en attente une par une.

import { analyserEtRediger, rechercherProprietaire } from "./claude.js";
import { config } from "./config.js";
import {
  type Contact,
  debloquerAnalysesInterrompues,
  enregistrerAnalyse,
  enregistrerErreur,
  estEnOpposition,
  marquerOpposition,
  reserverProchainProspect,
} from "./db.js";

export function lienDesinscription(jeton: string): string {
  return `${config.publicUrl()}/desinscription/${jeton}`;
}

function piedDeMessage(jeton: string, contacts: Contact[]): string {
  let source = "des sources publiques";
  const premiere = contacts[0]?.source_url;
  if (premiere) {
    try {
      source = new URL(premiere).hostname.replace(/^www\./, "");
    } catch {
      /* on garde la formulation générique */
    }
  }
  return (
    `\n\n—\nVous recevez ce message car vos coordonnées professionnelles sont publiées sur ${source}. ` +
    `Elles ne sont utilisées que pour ce contact et sont supprimées sous ${config.dureeConservationJours()} jours sans réponse. ` +
    `Pour ne plus être contacté(e) et effacer vos données : ${lienDesinscription(jeton)}`
  );
}

function urlValide(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:";
  } catch {
    return false;
  }
}

let traitementEnCours = false;

/** Traite au maximum `max` annonces. Renvoie le nombre traité avec succès / en erreur. */
export async function traiterAnnoncesEnAttente(
  max: number,
): Promise<{ ok: number; erreurs: number }> {
  if (traitementEnCours) return { ok: 0, erreurs: 0 };
  traitementEnCours = true;
  let ok = 0;
  let erreurs = 0;
  try {
    await debloquerAnalysesInterrompues();
    for (let i = 0; i < max; i++) {
      const p = await reserverProchainProspect();
      if (!p) break;
      try {
        console.log(`[agent] Analyse de ${p.url}`);
        const recherche = await rechercherProprietaire(p.url, p.texte_annonce, p.notes);
        const a = await analyserEtRediger(p.url, p.texte_annonce, p.notes, recherche);

        // Filet de sécurité RGPD : on ne garde que les coordonnées professionnelles,
        // publiques et sourcées.
        const contacts: Contact[] = a.contacts
          .filter((c) => c.est_professionnel_et_public && c.valeur.trim() && urlValide(c.source_url))
          .map((c) => ({ type: c.type, valeur: c.valeur.trim(), source_url: c.source_url }));

        // Personne désinscrite par le passé ? On efface tout et on s'arrête là.
        if (await estEnOpposition(contacts.map((c) => c.valeur))) {
          await marquerOpposition(p.id, p.url);
          console.log(`[agent] ${p.url} : propriétaire sur liste d'opposition, données effacées.`);
          continue;
        }

        await enregistrerAnalyse(p.id, {
          score: a.score,
          resume: a.resume,
          points_faibles: a.points_faibles,
          proprietaire: a.proprietaire,
          contacts,
          message_objet: a.message.objet,
          message_corps: a.message.corps.trim() + piedDeMessage(p.jeton_desinscription, contacts),
        });
        ok++;
        console.log(`[agent] ${p.url} : note ${a.score}/10, ${contacts.length} contact(s).`);
      } catch (e) {
        erreurs++;
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[agent] Erreur sur ${p.url} : ${message}`);
        await enregistrerErreur(p.id, message);
      }
    }
  } finally {
    traitementEnCours = false;
  }
  return { ok, erreurs };
}
