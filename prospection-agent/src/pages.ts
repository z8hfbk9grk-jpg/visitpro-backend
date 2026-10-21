// Les pages HTML affichées dans le navigateur (adaptées au téléphone).

import { config } from "./config.js";
import type { Prospect } from "./db.js";
import { esc, LIBELLES_CONTACTS, LIBELLES_CRITERES, lienSur, multiligne } from "./html.js";

const STYLE = `
  :root { --bord:#d0d7de; --fond:#f6f8fa; --texte:#1f2328; --doux:#59636e; --accent:#e8505b; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, Segoe UI, Roboto, Arial, sans-serif; color: var(--texte);
         margin: 0; padding: 16px; max-width: 860px; margin-inline: auto; background: #fff; line-height: 1.45; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; } h2 { font-size: 1.1rem; margin: 24px 0 8px; }
  .doux { color: var(--doux); font-size: .9rem; }
  form.carte, .carte { border: 1px solid var(--bord); border-radius: 12px; padding: 14px; margin: 0 0 14px; }
  label { display: block; font-weight: 600; margin: 10px 0 4px; }
  input[type=text], input[type=url], textarea { width: 100%; padding: 10px; border: 1px solid var(--bord);
         border-radius: 8px; font: inherit; }
  textarea { min-height: 120px; }
  button { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 10px 14px;
         font: inherit; font-weight: 600; cursor: pointer; margin-top: 10px; }
  button.secondaire { background: #fff; color: var(--texte); border: 1px solid var(--bord); }
  .ligne { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .ligne form { margin: 0; }
  .info { background: #ddf4ff; border-radius: 8px; padding: 10px; margin: 10px 0; }
  .score { display: inline-block; min-width: 52px; text-align: center; color: #fff; border-radius: 6px;
         padding: 2px 6px; font-weight: 700; }
  .badge { display: inline-block; font-size: .8rem; border: 1px solid var(--bord); border-radius: 999px; padding: 1px 8px; }
  pre.message { white-space: pre-wrap; background: var(--fond); border-radius: 8px; padding: 10px; font: inherit; }
  details summary { cursor: pointer; font-weight: 600; margin-top: 8px; }
  ul { padding-left: 20px; margin: 4px 0; }
  a { color: #0969da; word-break: break-word; }
`;

function gabarit(titre: string, corps: string, rafraichir = false): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
${rafraichir ? '<meta http-equiv="refresh" content="20">' : ""}
<title>${esc(titre)}</title><style>${STYLE}</style></head>
<body>${corps}</body></html>`;
}

const MESSAGES_INFO: Record<string, string> = {
  ajoute: "Annonce ajoutée. Elle sera analysée demain matin, ou tout de suite avec « Analyser maintenant ».",
  complete: "Annonce existante complétée : elle sera ré-analysée.",
  existe_deja: "Cette annonce est déjà dans la liste.",
  opposition: "Cette annonce appartient à une personne désinscrite : elle ne peut pas être ajoutée.",
  lien_invalide: "Lien invalide : copiez l'adresse complète de l'annonce (https://...).",
  analyse_lancee: "Analyse lancée en arrière-plan. La page se met à jour toute seule.",
  recap_envoye: "Récapitulatif envoyé par email.",
  recap_erreur: "L'envoi de l'email a échoué : vérifiez RESEND_API_KEY, EMAIL_FROM et EMAIL_TO.",
  relance: "Annonce remise en file d'attente.",
  supprime: "Fiche supprimée.",
};

const LIBELLES_STATUT: Record<string, string> = {
  a_analyser: "⏳ En attente",
  en_cours: "⚙️ Analyse en cours",
  analyse: "✅ Analysée",
  erreur: "❌ Erreur",
  opposition: "🚫 Désinscrit",
};

function couleur(score: number | null): string {
  if (score === null) return "#8c959f";
  if (score >= 7) return "#1a7f37";
  if (score >= 4) return "#bf8700";
  return "#8c959f";
}

function carteProspect(p: Prospect): string {
  const proprio = p.proprietaire;
  const contacts = p.contacts ?? [];
  const points = p.points_faibles ?? [];
  const actions = `
    <div class="ligne">
      ${p.statut === "analyse" || p.statut === "erreur" ? `<form method="post" action="/prospects/${p.id}/relancer"><button class="secondaire" type="submit">↻ Ré-analyser</button></form>` : ""}
      <form method="post" action="/prospects/${p.id}/supprimer" onsubmit="return confirm('Supprimer définitivement cette fiche ?')"><button class="secondaire" type="submit">🗑 Supprimer</button></form>
    </div>`;

  if (p.statut !== "analyse") {
    return `<div class="carte">
      <div class="ligne"><span class="badge">${esc(LIBELLES_STATUT[p.statut] ?? p.statut)}</span> ${lienSur(p.url)}</div>
      ${p.texte_annonce ? "" : `<p class="doux">⚠️ Texte de l'annonce non collé : l'analyse sera peu précise. Recollez le lien avec le texte dans le formulaire ci-dessus pour compléter.</p>`}
      ${p.erreur ? `<p class="doux">Erreur : ${esc(p.erreur)}</p>` : ""}
      ${actions}
    </div>`;
  }

  return `<div class="carte">
    <div class="ligne"><span class="score" style="background:${couleur(p.score)}">${esc(p.score ?? "?")}/10</span> ${lienSur(p.url, "Voir l'annonce")}</div>
    <p>${multiligne(p.resume)}</p>
    <ul>${points.map((pt) => `<li>${esc(LIBELLES_CRITERES[pt.critere] ?? pt.critere)} : ${esc(pt.detail)}</li>`).join("")}</ul>
    <p><b>Propriétaire :</b> ${esc(proprio?.nom_affiche || "inconnu")}${proprio?.entreprise ? ` — ${esc(proprio.entreprise)}` : ""}
      <span class="doux">(${esc(proprio?.statut_juridique ?? "inconnu")}, confiance ${esc(proprio?.confiance ?? "faible")})</span><br>
      <span class="doux">${esc(proprio?.synthese_recherche)}</span></p>
    ${proprio?.statut_juridique === "particulier" ? `<p class="info">⚠️ Particulier : pas d'email de prospection sans son accord préalable.</p>` : ""}
    ${
      contacts.length
        ? `<ul>${contacts.map((c) => `<li>${esc(LIBELLES_CONTACTS[c.type] ?? c.type)} : <b>${esc(c.valeur)}</b> <span class="doux">(${lienSur(c.source_url, "source")})</span></li>`).join("")}</ul>`
        : `<p class="doux">Aucune coordonnée professionnelle publique trouvée.</p>`
    }
    <details><summary>Message d'approche</summary>
      <p><b>Objet :</b> ${esc(p.message_objet)}</p>
      <pre class="message" id="msg-${p.id}">${esc(p.message_corps)}</pre>
      <button class="secondaire" type="button" onclick="navigator.clipboard.writeText(document.getElementById('msg-${p.id}').innerText).then(()=>this.textContent='✓ Copié')">📋 Copier le message</button>
    </details>
    ${actions}
  </div>`;
}

export function pageAccueil(prospects: Prospect[], info?: string): string {
  const enCours = prospects.some((p) => p.statut === "en_cours");
  const corps = `
  <h1>🏠 Agent de prospection</h1>
  <p class="doux">${esc(config.conciergerieNom())} · Val d'Europe / Disneyland / Meaux</p>
  ${info && MESSAGES_INFO[info] ? `<div class="info">${esc(MESSAGES_INFO[info])}</div>` : ""}

  <h2>1. Ajouter une annonce</h2>
  <form class="carte" method="post" action="/ajouter">
    <label for="url">Lien de l'annonce Airbnb</label>
    <input type="url" id="url" name="url" required placeholder="https://www.airbnb.fr/rooms/123456">
    <label for="texte">Texte de l'annonce (recommandé)</label>
    <textarea id="texte" name="texte" placeholder="Ouvrez l'annonce, sélectionnez tout le texte (titre, description, prix, nombre d'avis, note, nombre de photos, prénom de l'hôte...) puis collez-le ici."></textarea>
    <label for="notes">Vos remarques (facultatif)</label>
    <input type="text" id="notes" name="notes" placeholder="Ex : photos sombres, calendrier vide en novembre, hôte = Marie">
    <button type="submit">Ajouter</button>
  </form>

  <details class="carte"><summary>Ajout rapide de plusieurs liens</summary>
    <form method="post" action="/ajouter-liens">
      <label for="liens">Un lien par ligne</label>
      <textarea id="liens" name="liens" placeholder="https://www.airbnb.fr/rooms/111&#10;https://www.airbnb.fr/rooms/222"></textarea>
      <p class="doux">Sans le texte de l'annonce, la note sera moins fiable.</p>
      <button type="submit">Ajouter les liens</button>
    </form>
  </details>

  <h2>2. Actions</h2>
  <div class="ligne">
    <form method="post" action="/analyser"><button type="submit">▶ Analyser maintenant</button></form>
    <form method="post" action="/recap"><button class="secondaire" type="submit">✉ Envoyer le récap maintenant</button></form>
  </div>
  <p class="doux">Sinon, tout se fait automatiquement chaque matin : analyse puis email récapitulatif.</p>

  <h2>3. Prospects (${prospects.length})</h2>
  ${prospects.length ? prospects.map(carteProspect).join("") : `<p class="doux">Aucune annonce pour l'instant.</p>`}
  <p class="doux">Les fiches sont supprimées automatiquement après ${config.dureeConservationJours()} jours (RGPD).</p>`;
  return gabarit("Agent de prospection", corps, enCours);
}

export function pageDesinscription(jeton: string, connu: boolean): string {
  const nom = esc(config.conciergerieNom());
  const corps = connu
    ? `<h1>Ne plus être contacté(e)</h1>
       <p>Vous avez reçu un message de <b>${nom}</b>. En confirmant, vos coordonnées sont <b>immédiatement supprimées</b>
       et vous ne serez plus jamais contacté(e) par nos soins.</p>
       <form method="post" action="/desinscription/${esc(jeton)}"><button type="submit">Confirmer ma désinscription</button></form>
       <p class="doux">Vos coordonnées professionnelles avaient été trouvées sur des sources publiques (site, page professionnelle ou annuaire).
       Pour toute question sur vos données (accès, rectification, effacement), répondez simplement au message reçu.</p>`
    : `<h1>Désinscription</h1><p>Vous êtes déjà désinscrit(e), ou vos données ont déjà été supprimées. Vous ne serez plus contacté(e).</p>`;
  return gabarit("Désinscription", corps);
}

export function pageDesinscriptionOk(): string {
  return gabarit(
    "Désinscription confirmée",
    `<h1>C'est fait ✅</h1><p>Vos coordonnées ont été supprimées et vous ne serez plus contacté(e) par ${esc(config.conciergerieNom())}.</p>`,
  );
}
