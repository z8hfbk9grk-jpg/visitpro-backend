// Tout ce qui parle à l'API Claude.
// Étape 1 : recherche du propriétaire sur le web public (outil web_search de Claude).
// Étape 2 : note de l'annonce, tri des coordonnées et rédaction du message (réponse JSON).

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "./config.js";

let client: Anthropic | null = null;
function claude(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey() });
  return client;
}

// Si Claude refuse exceptionnellement une requête, l'API la relance
// automatiquement sur un autre modèle ("fallbacks: default").
const BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01"];

// On n'interroge jamais Airbnb directement (pas de scraping).
const DOMAINES_BLOQUES = [
  "airbnb.fr",
  "airbnb.com",
  "airbnb.co.uk",
  "airbnb.de",
  "airbnb.es",
  "airbnb.it",
  "airbnb.ch",
  "airbnb.be",
];

const REGLES_RGPD = `Règles RGPD impératives :
- Ne retiens QUE des coordonnées professionnelles publiées publiquement pour une activité professionnelle (site d'entreprise, page Facebook/LinkedIn d'entreprise, fiche Google Maps d'établissement, annuaire professionnel, société sur Pappers/societe.com).
- N'utilise JAMAIS : email ou téléphone personnel, adresse du domicile, profil personnel de réseau social, informations sur la famille, données trouvées dans des fuites ou des sites de "recherche de personnes".
- Si tu n'es pas raisonnablement sûr qu'une coordonnée appartient bien au propriétaire de cette annonce, ne la retiens pas.
- Chaque coordonnée doit avoir l'URL exacte de la page publique où tu l'as trouvée.`;

// ---------- Étape 1 : recherche web ----------

export async function rechercherProprietaire(
  url: string,
  texteAnnonce: string,
  notes: string,
): Promise<string> {
  const consigne = `Tu aides une conciergerie Airbnb du secteur Val d'Europe / Disneyland Paris / Meaux (Seine-et-Marne, 77) à identifier le propriétaire ou gestionnaire d'une annonce, uniquement à partir de sources publiques.

Annonce : ${url}

Contenu de l'annonce copié par l'utilisateur :
"""
${texteAnnonce || "(non fourni : seul le lien est disponible)"}
"""

Notes de l'utilisateur : ${notes || "(aucune)"}

Ta mission :
1. Repère dans le texte les indices utiles : prénom de l'hôte, nom d'entreprise, de conciergerie ou de résidence, ville, nom du logement, numéro d'enregistrement.
2. Fais des recherches web ciblées (site personnel ou d'entreprise, page Facebook professionnelle, fiche Google Maps, LinkedIn d'entreprise, autres plateformes de location comme Abritel/Booking/Gîtes de France, annuaires d'entreprises).
3. Ne cherche pas sur Airbnb lui-même.

${REGLES_RGPD}

Réponds en français avec un compte rendu court :
- ce que tu as identifié (nom affiché, entreprise éventuelle, statut professionnel ou particulier) et ton niveau de confiance ;
- la liste des coordonnées professionnelles publiques trouvées, chacune avec l'URL de la page source ;
- si rien de fiable n'a été trouvé, dis-le clairement plutôt que de deviner.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: consigne }];
  let reponse: Anthropic.Beta.BetaMessage | null = null;

  // L'outil de recherche peut "faire une pause" : on relance jusqu'à 3 fois.
  for (let tour = 0; tour < 3; tour++) {
    reponse = await claude().beta.messages.create({
      model: config.claudeModel(),
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: "medium" },
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 6,
          blocked_domains: DOMAINES_BLOQUES,
          user_location: {
            type: "approximate",
            city: "Serris",
            region: "Île-de-France",
            country: "FR",
            timezone: "Europe/Paris",
          },
        },
      ],
      messages,
    });
    if (reponse.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: reponse.content });
  }

  if (!reponse) throw new Error("Aucune réponse de Claude pendant la recherche.");
  if (reponse.stop_reason === "refusal") {
    throw new Error("Claude a refusé la recherche pour cette annonce.");
  }

  // On récupère le texte final et les liens cités comme sources.
  const morceaux: string[] = [];
  const sources = new Set<string>();
  for (const bloc of reponse.content) {
    if (bloc.type === "text") {
      morceaux.push(bloc.text);
      for (const c of bloc.citations ?? []) {
        if ("url" in c && typeof c.url === "string") sources.add(c.url);
      }
    }
  }
  let compteRendu = morceaux.join("").trim();
  if (sources.size > 0) {
    compteRendu += `\n\nSources citées :\n${[...sources].map((s) => `- ${s}`).join("\n")}`;
  }
  return compteRendu || "Aucun résultat exploitable.";
}

// ---------- Étape 2 : note + coordonnées + message ----------

const SchemaAnalyse = z.object({
  score: z
    .number()
    .describe(
      "Potentiel d'optimisation de 0 à 10. 10 = annonce très perfectible (excellent prospect), 0 = annonce déjà parfaitement optimisée.",
    ),
  resume: z.string().describe("Synthèse en 2-3 phrases de l'état de l'annonce."),
  points_faibles: z.array(
    z.object({
      critere: z.enum(["photos", "description", "avis", "prix", "disponibilites", "autre"]),
      detail: z.string(),
    }),
  ),
  proprietaire: z.object({
    nom_affiche: z.string().describe("Nom ou prénom affiché, ou chaîne vide."),
    entreprise: z.string().describe("Nom de l'entreprise/conciergerie, ou chaîne vide."),
    statut_juridique: z.enum(["professionnel", "particulier", "inconnu"]),
    confiance: z.enum(["forte", "moyenne", "faible"]),
    synthese_recherche: z.string().describe("Ce que la recherche a donné, en une ou deux phrases."),
  }),
  contacts: z.array(
    z.object({
      type: z.enum([
        "email",
        "telephone",
        "site_web",
        "facebook",
        "instagram",
        "linkedin",
        "google_maps",
        "autre",
      ]),
      valeur: z.string(),
      source_url: z.string(),
      est_professionnel_et_public: z.boolean(),
    }),
  ),
  message: z.object({
    objet: z.string(),
    corps: z.string(),
  }),
});

export type Analyse = z.infer<typeof SchemaAnalyse>;

export async function analyserEtRediger(
  url: string,
  texteAnnonce: string,
  notes: string,
  compteRenduRecherche: string,
): Promise<Analyse> {
  const systeme = `Tu es l'assistant commercial de "${config.conciergerieNom()}", une conciergerie Airbnb.
Présentation de la conciergerie : ${config.conciergeriePitch()}
Signature à utiliser : ${config.conciergerieSignature() || config.conciergerieNom()}

Tu évalues le potentiel d'optimisation d'annonces Airbnb et rédiges des messages d'approche.

Grille de notation (score de 0 à 10, 10 = gros potentiel d'amélioration) :
- photos : nombre, qualité perçue, lumière, pièces manquantes, photos de nuit/flou mentionnés ;
- description : longueur, structure, mots-clés (Disneyland, Val d'Europe, RER A, navettes, Vallée Village), fautes, informations pratiques ;
- avis : nombre d'avis (peu d'avis = annonce récente ou peu performante), note moyenne, remarques négatives récurrentes ;
- prix : cohérence avec le secteur et la saison (parcs, salons, événements) ;
- disponibilités : calendrier très ouvert (taux d'occupation faible) ou bloqué, durée minimale de séjour.
Base-toi uniquement sur les informations fournies. Si une information manque, dis-le dans le point faible concerné plutôt que d'inventer, et sois prudent dans la note.

${REGLES_RGPD}
Pour chaque coordonnée, mets est_professionnel_et_public à false au moindre doute.

Message d'approche :
- en français, vouvoiement, ton chaleureux et professionnel, 120 à 180 mots ;
- accroche personnalisée qui cite 2 points d'amélioration concrets de SON annonce, formulés avec tact (jamais dénigrant) ;
- propose un échange court et sans engagement ;
- indique en une phrase où ses coordonnées professionnelles ont été trouvées (obligation d'information RGPD) ;
- n'invente aucun chiffre, aucune promesse de revenus, aucune fausse référence ;
- termine par la signature. N'ajoute PAS de lien de désinscription : il est ajouté automatiquement.`;

  const contenu = `Lien de l'annonce : ${url}

Contenu de l'annonce (copié par l'utilisateur) :
"""
${texteAnnonce || "(non fourni : évalue avec prudence et signale le manque d'informations)"}
"""

Notes de l'utilisateur : ${notes || "(aucune)"}

Compte rendu de la recherche du propriétaire sur le web public :
"""
${compteRenduRecherche}
"""

Produis l'analyse complète.`;

  const reponse = await claude().beta.messages.parse({
    model: config.claudeModel(),
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(SchemaAnalyse) },
    system: systeme,
    messages: [{ role: "user", content: contenu }],
  });

  if (reponse.stop_reason === "refusal") {
    throw new Error("Claude a refusé d'analyser cette annonce.");
  }
  if (reponse.stop_reason === "max_tokens") {
    throw new Error("Réponse de Claude coupée (trop longue). Réessayez.");
  }
  const analyse = reponse.parsed_output;
  if (!analyse) throw new Error("Réponse de Claude illisible. Réessayez.");

  analyse.score = Math.max(0, Math.min(10, Math.round(analyse.score)));
  return analyse;
}
