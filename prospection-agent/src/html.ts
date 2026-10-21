// Petits outils pour fabriquer du HTML sans risque (échappement des caractères).

export function esc(valeur: unknown): string {
  return String(valeur ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Texte multi-lignes -> HTML avec retours à la ligne. */
export function multiligne(valeur: unknown): string {
  return esc(valeur).replace(/\n/g, "<br>");
}

/** Lien cliquable seulement s'il s'agit bien d'une adresse web. */
export function lienSur(url: string, texte?: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "http:") {
      return `<a href="${esc(u.toString())}" target="_blank" rel="noopener noreferrer">${esc(texte ?? url)}</a>`;
    }
  } catch {
    /* pas une URL */
  }
  return esc(texte ?? url);
}

export const LIBELLES_CRITERES: Record<string, string> = {
  photos: "📸 Photos",
  description: "📝 Description",
  avis: "⭐ Avis",
  prix: "💶 Prix",
  disponibilites: "📅 Disponibilités",
  autre: "• Autre",
};

export const LIBELLES_CONTACTS: Record<string, string> = {
  email: "Email",
  telephone: "Téléphone",
  site_web: "Site web",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  google_maps: "Google Maps",
  autre: "Autre",
};
