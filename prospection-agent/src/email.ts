// Envoi du récapitulatif quotidien par email (service Resend : resend.com).

import { config } from "./config.js";
import type { Prospect } from "./db.js";
import { esc, LIBELLES_CONTACTS, LIBELLES_CRITERES, lienSur, multiligne } from "./html.js";

export async function envoyerEmail(objet: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.emailFrom(),
      to: config.emailTo().split(",").map((s) => s.trim()),
      subject: objet,
      html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Échec de l'envoi de l'email (Resend ${res.status}) : ${await res.text()}`);
  }
}

function couleurScore(score: number | null): string {
  if (score === null) return "#888";
  if (score >= 7) return "#1a7f37";
  if (score >= 4) return "#b26a00";
  return "#888";
}

function blocProspect(p: Prospect): string {
  const proprio = p.proprietaire;
  const contacts = p.contacts ?? [];
  const points = p.points_faibles ?? [];

  const contactsHtml =
    contacts.length > 0
      ? `<ul style="margin:4px 0 0 18px;padding:0">${contacts
          .map(
            (c) =>
              `<li>${esc(LIBELLES_CONTACTS[c.type] ?? c.type)} : <b>${esc(c.valeur)}</b> <span style="color:#666">(source : ${lienSur(c.source_url, "voir")})</span></li>`,
          )
          .join("")}</ul>`
      : `<p style="margin:4px 0;color:#666">Aucune coordonnée professionnelle publique trouvée.</p>`;

  const avertissement =
    proprio?.statut_juridique === "particulier"
      ? `<p style="margin:6px 0;padding:6px 8px;background:#fff4e5;border-radius:6px">⚠️ Propriétaire identifié comme <b>particulier</b> : la prospection par email sans son accord préalable est interdite. Ne le contactez que via un canal professionnel qu'il publie lui-même.</p>`
      : "";

  return `
  <div style="border:1px solid #ddd;border-radius:10px;padding:14px;margin:0 0 16px">
    <div style="font-size:18px">
      <span style="display:inline-block;min-width:54px;text-align:center;background:${couleurScore(p.score)};color:#fff;border-radius:6px;padding:2px 6px;font-weight:bold">${esc(p.score ?? "?")}/10</span>
      ${lienSur(p.url, "Voir l'annonce")}
    </div>
    <p style="margin:8px 0">${multiligne(p.resume)}</p>
    <p style="margin:8px 0 2px"><b>Points faibles</b></p>
    <ul style="margin:0 0 0 18px;padding:0">${points
      .map((pt) => `<li>${esc(LIBELLES_CRITERES[pt.critere] ?? pt.critere)} : ${esc(pt.detail)}</li>`)
      .join("")}</ul>
    <p style="margin:10px 0 2px"><b>Propriétaire</b> : ${esc(proprio?.nom_affiche || "inconnu")}${proprio?.entreprise ? ` — ${esc(proprio.entreprise)}` : ""} <span style="color:#666">(${esc(proprio?.statut_juridique ?? "inconnu")}, confiance ${esc(proprio?.confiance ?? "faible")})</span></p>
    <p style="margin:2px 0;color:#444;font-size:13px">${esc(proprio?.synthese_recherche)}</p>
    ${avertissement}
    ${contactsHtml}
    <details style="margin-top:10px" open>
      <summary style="cursor:pointer"><b>Message d'approche proposé</b></summary>
      <p style="margin:6px 0"><b>Objet :</b> ${esc(p.message_objet)}</p>
      <div style="background:#f6f8fa;border-radius:6px;padding:10px;white-space:normal">${multiligne(p.message_corps)}</div>
    </details>
  </div>`;
}

export function construireRecap(
  prospects: Prospect[],
  compteurs: Record<string, number>,
  lienPage: string,
): { objet: string; html: string } {
  const date = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
  const chauds = prospects.filter((p) => (p.score ?? 0) >= 7).length;
  const objet =
    prospects.length > 0
      ? `Prospection du ${date} : ${prospects.length} nouveau(x) prospect(s), dont ${chauds} prioritaire(s)`
      : `Prospection du ${date} : rien de nouveau`;

  const enAttente = compteurs["a_analyser"] ?? 0;
  const enErreur = compteurs["erreur"] ?? 0;

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:720px;margin:auto;padding:12px">
  <h2 style="margin:0 0 6px">Récapitulatif prospection — ${esc(date)}</h2>
  <p style="margin:0 0 14px;color:#555">${prospects.length} annonce(s) analysée(s) depuis le dernier envoi · ${enAttente} en attente · ${enErreur} en erreur.
  <br>Note = potentiel d'optimisation (10 = annonce très perfectible = meilleur prospect).</p>
  ${prospects.length > 0 ? prospects.map(blocProspect).join("") : "<p>Aucune nouvelle annonce analysée. Ajoutez des liens sur votre page :</p>"}
  <p style="margin-top:20px"><a href="${esc(lienPage)}">Ouvrir la page de l'agent</a></p>
  <p style="color:#888;font-size:12px">Rappel RGPD : envoyez les messages vous-même, uniquement aux coordonnées professionnelles listées, et gardez le lien de désinscription en bas de chaque message.</p>
</body></html>`;
  return { objet, html };
}
