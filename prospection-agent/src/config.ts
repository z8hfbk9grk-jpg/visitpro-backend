// Lecture des réglages (variables d'environnement définies sur Render).

function obligatoire(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur || valeur.trim() === "") {
    throw new Error(
      `La variable d'environnement ${nom} est manquante. Ajoutez-la dans Render > Environment.`,
    );
  }
  return valeur.trim();
}

function facultatif(nom: string, defaut: string): string {
  const valeur = process.env[nom];
  return valeur && valeur.trim() !== "" ? valeur.trim() : defaut;
}

export const config = {
  databaseUrl: () => obligatoire("DATABASE_URL"),
  anthropicApiKey: () => obligatoire("ANTHROPIC_API_KEY"),
  claudeModel: () => facultatif("CLAUDE_MODEL", "claude-opus-5-5"),
  resendApiKey: () => obligatoire("RESEND_API_KEY"),
  emailFrom: () => obligatoire("EMAIL_FROM"),
  emailTo: () => obligatoire("EMAIL_TO"),
  adminPassword: () => obligatoire("ADMIN_PASSWORD"),
  // Sur le service web, Render fournit RENDER_EXTERNAL_URL automatiquement.
  publicUrl: () =>
    (process.env.PUBLIC_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || obligatoire("PUBLIC_URL"))
      .replace(/\/+$/, ""),
  conciergerieNom: () => facultatif("CONCIERGERIE_NOM", "Ma Conciergerie"),
  conciergerieSignature: () => facultatif("CONCIERGERIE_SIGNATURE", ""),
  conciergeriePitch: () =>
    facultatif(
      "CONCIERGERIE_PITCH",
      "Conciergerie Airbnb locale (Val d'Europe, Disneyland Paris, Meaux).",
    ),
  maxAnnoncesParJour: () => Number(facultatif("MAX_ANNONCES_PAR_JOUR", "20")) || 20,
  dureeConservationJours: () =>
    Number(facultatif("DUREE_CONSERVATION_JOURS", "90")) || 90,
};
