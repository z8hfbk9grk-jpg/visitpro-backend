// Accès à la base PostgreSQL (Neon).
// Les tables sont créées automatiquement au démarrage : rien à faire à la main.

import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import { config } from "./config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function db(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl(),
      max: 5,
    });
  }
  return pool;
}

export async function fermerDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function initialiserSchema(): Promise<void> {
  await db().query(`
    CREATE TABLE IF NOT EXISTS prospects (
      id                    SERIAL PRIMARY KEY,
      url                   TEXT NOT NULL UNIQUE,
      texte_annonce         TEXT NOT NULL DEFAULT '',
      notes                 TEXT NOT NULL DEFAULT '',
      statut                TEXT NOT NULL DEFAULT 'a_analyser',
      score                 INTEGER,
      resume                TEXT,
      points_faibles        JSONB,
      proprietaire          JSONB,
      contacts              JSONB,
      message_objet         TEXT,
      message_corps         TEXT,
      erreur                TEXT,
      jeton_desinscription  TEXT NOT NULL UNIQUE,
      cree_le               TIMESTAMPTZ NOT NULL DEFAULT now(),
      maj_le                TIMESTAMPTZ NOT NULL DEFAULT now(),
      analyse_le            TIMESTAMPTZ,
      recap_envoye_le       TIMESTAMPTZ
    );

    -- Liste d'opposition (RGPD) : on ne garde qu'une empreinte chiffrée
    -- (SHA-256) des annonces et coordonnées des personnes désinscrites,
    -- pour ne plus jamais les recontacter sans conserver leurs données.
    CREATE TABLE IF NOT EXISTS liste_opposition (
      empreinte  TEXT PRIMARY KEY,
      ajoute_le  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// ---------- Types ----------

export type Statut = "a_analyser" | "en_cours" | "analyse" | "erreur" | "opposition";

export interface PointFaible {
  critere: string;
  detail: string;
}

export interface Contact {
  type: string;
  valeur: string;
  source_url: string;
}

export interface Proprietaire {
  nom_affiche: string;
  entreprise: string;
  statut_juridique: string;
  confiance: string;
  synthese_recherche: string;
}

export interface Prospect {
  id: number;
  url: string;
  texte_annonce: string;
  notes: string;
  statut: Statut;
  score: number | null;
  resume: string | null;
  points_faibles: PointFaible[] | null;
  proprietaire: Proprietaire | null;
  contacts: Contact[] | null;
  message_objet: string | null;
  message_corps: string | null;
  erreur: string | null;
  jeton_desinscription: string;
  cree_le: Date;
  analyse_le: Date | null;
  recap_envoye_le: Date | null;
}

// ---------- Outils ----------

/** Nettoie un lien Airbnb : on enlève les paramètres de suivi (?check_in=...). */
export function normaliserUrl(brut: string): string | null {
  try {
    const u = new URL(brut.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `https://${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** Empreinte SHA-256 d'une valeur normalisée (email, téléphone, lien...). */
export function empreinte(valeur: string): string {
  let v = valeur.trim().toLowerCase();
  // Téléphones : on ne garde que les chiffres, et +33 devient 0.
  if (/^[+\d][\d\s.\-()]{6,}$/.test(v)) {
    v = v.replace(/\D/g, "").replace(/^33/, "0");
  }
  v = v.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  return createHash("sha256").update(v).digest("hex");
}

export async function estEnOpposition(valeurs: string[]): Promise<boolean> {
  if (valeurs.length === 0) return false;
  const res = await db().query(
    "SELECT 1 FROM liste_opposition WHERE empreinte = ANY($1::text[]) LIMIT 1",
    [valeurs.map(empreinte)],
  );
  return (res.rowCount ?? 0) > 0;
}

// ---------- Prospects ----------

export type ResultatAjout = "ajoute" | "complete" | "existe_deja" | "opposition" | "lien_invalide";

export async function ajouterProspect(
  urlBrute: string,
  texteAnnonce: string,
  notes: string,
): Promise<ResultatAjout> {
  const url = normaliserUrl(urlBrute);
  if (!url) return "lien_invalide";
  if (await estEnOpposition([url])) return "opposition";

  const existant = await db().query<{ id: number; texte_annonce: string }>(
    "SELECT id, texte_annonce FROM prospects WHERE url = $1",
    [url],
  );
  if (existant.rows[0]) {
    // Si on recolle le texte d'une annonce déjà connue, on la complète et on la relance.
    if (texteAnnonce.trim() !== "") {
      await db().query(
        `UPDATE prospects
            SET texte_annonce = $2, notes = CASE WHEN $3 = '' THEN notes ELSE $3 END,
                statut = 'a_analyser', erreur = NULL, maj_le = now()
          WHERE id = $1`,
        [existant.rows[0].id, texteAnnonce.trim(), notes.trim()],
      );
      return "complete";
    }
    return "existe_deja";
  }

  await db().query(
    `INSERT INTO prospects (url, texte_annonce, notes, jeton_desinscription)
     VALUES ($1, $2, $3, $4)`,
    [url, texteAnnonce.trim(), notes.trim(), randomBytes(24).toString("base64url")],
  );
  return "ajoute";
}

/**
 * Réserve le prochain prospect à analyser (sans risque de doublon si deux
 * traitements tournent en même temps).
 */
export async function reserverProchainProspect(): Promise<Prospect | null> {
  const res = await db().query<Prospect>(
    `UPDATE prospects SET statut = 'en_cours', maj_le = now()
      WHERE id = (
        SELECT id FROM prospects WHERE statut = 'a_analyser'
         ORDER BY cree_le LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING *`,
  );
  return res.rows[0] ?? null;
}

/** Remet en file d'attente les analyses interrompues (serveur redémarré, etc.). */
export async function debloquerAnalysesInterrompues(): Promise<void> {
  await db().query(
    `UPDATE prospects SET statut = 'a_analyser'
      WHERE statut = 'en_cours' AND maj_le < now() - interval '30 minutes'`,
  );
}

export async function enregistrerAnalyse(
  id: number,
  donnees: {
    score: number;
    resume: string;
    points_faibles: PointFaible[];
    proprietaire: Proprietaire;
    contacts: Contact[];
    message_objet: string;
    message_corps: string;
  },
): Promise<void> {
  await db().query(
    `UPDATE prospects
        SET statut = 'analyse', score = $2, resume = $3, points_faibles = $4,
            proprietaire = $5, contacts = $6, message_objet = $7, message_corps = $8,
            erreur = NULL, analyse_le = now(), maj_le = now(), recap_envoye_le = NULL
      WHERE id = $1`,
    [
      id,
      donnees.score,
      donnees.resume,
      JSON.stringify(donnees.points_faibles),
      JSON.stringify(donnees.proprietaire),
      JSON.stringify(donnees.contacts),
      donnees.message_objet,
      donnees.message_corps,
    ],
  );
}

/**
 * Le propriétaire figure sur la liste d'opposition : on ajoute aussi cette
 * annonce à la liste, puis on efface la fiche.
 */
export async function marquerOpposition(id: number, url: string): Promise<void> {
  await db().query(
    "INSERT INTO liste_opposition (empreinte) VALUES ($1) ON CONFLICT DO NOTHING",
    [empreinte(url)],
  );
  await db().query("DELETE FROM prospects WHERE id = $1", [id]);
}

export async function enregistrerErreur(id: number, message: string): Promise<void> {
  await db().query(
    `UPDATE prospects SET statut = 'erreur', erreur = $2, maj_le = now() WHERE id = $1`,
    [id, message.slice(0, 1000)],
  );
}

export async function relancerProspect(id: number): Promise<void> {
  await db().query(
    `UPDATE prospects SET statut = 'a_analyser', erreur = NULL, maj_le = now()
      WHERE id = $1 AND statut IN ('erreur', 'analyse')`,
    [id],
  );
}

export async function supprimerProspect(id: number): Promise<void> {
  await db().query("DELETE FROM prospects WHERE id = $1", [id]);
}

export async function listerProspects(): Promise<Prospect[]> {
  const res = await db().query<Prospect>(
    `SELECT * FROM prospects
      ORDER BY CASE statut WHEN 'analyse' THEN 0 WHEN 'en_cours' THEN 1
                           WHEN 'a_analyser' THEN 2 WHEN 'erreur' THEN 3 ELSE 4 END,
               score DESC NULLS LAST, cree_le DESC
      LIMIT 500`,
  );
  return res.rows;
}

export async function prospectsPourRecap(): Promise<Prospect[]> {
  const res = await db().query<Prospect>(
    `SELECT * FROM prospects
      WHERE statut = 'analyse' AND recap_envoye_le IS NULL
      ORDER BY score DESC NULLS LAST`,
  );
  return res.rows;
}

export async function compterParStatut(): Promise<Record<string, number>> {
  const res = await db().query<{ statut: string; n: string }>(
    "SELECT statut, count(*) AS n FROM prospects GROUP BY statut",
  );
  return Object.fromEntries(res.rows.map((r) => [r.statut, Number(r.n)]));
}

export async function marquerRecapEnvoye(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db().query(
    "UPDATE prospects SET recap_envoye_le = now() WHERE id = ANY($1::int[])",
    [ids],
  );
}

export async function trouverParJeton(jeton: string): Promise<Prospect | null> {
  const res = await db().query<Prospect>(
    "SELECT * FROM prospects WHERE jeton_desinscription = $1",
    [jeton],
  );
  return res.rows[0] ?? null;
}

/**
 * Désinscription : on inscrit l'annonce et toutes les coordonnées trouvées sur
 * la liste d'opposition (sous forme d'empreinte), puis on supprime la fiche.
 */
export async function desinscrire(prospect: Prospect): Promise<void> {
  const valeurs = [prospect.url, ...(prospect.contacts ?? []).map((c) => c.valeur)];
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    for (const v of valeurs) {
      await client.query(
        "INSERT INTO liste_opposition (empreinte) VALUES ($1) ON CONFLICT DO NOTHING",
        [empreinte(v)],
      );
    }
    await client.query("DELETE FROM prospects WHERE id = $1", [prospect.id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** RGPD : suppression automatique des fiches plus anciennes que la durée de conservation. */
export async function purgerAnciensProspects(jours: number): Promise<number> {
  const res = await db().query(
    "DELETE FROM prospects WHERE cree_le < now() - make_interval(days => $1)",
    [jours],
  );
  return res.rowCount ?? 0;
}
