import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Agent } from "@workspace/db";

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Hashage sécurisé : scrypt avec un sel aléatoire par mot de passe.
// Format stocké : "sel:hash"
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Vérifie un mot de passe. Supporte aussi l'ancien format SHA-256 (sans sel)
// pour ne pas bloquer les comptes créés avant cette mise à jour — ils sont
// automatiquement migrés vers le nouveau format à la prochaine connexion réussie.
export function verifyPassword(password: string, stored: string): boolean {
  if (stored.includes(":")) {
    const [salt, hashHex] = stored.split(":");
    if (!salt || !hashHex) return false;
    const hash = scryptSync(password, salt, 64);
    const storedHash = Buffer.from(hashHex, "hex");
    if (hash.length !== storedHash.length) return false;
    return timingSafeEqual(hash, storedHash);
  }
  // Ancien format (à migrer)
  const legacyHash = createHash("sha256").update(password).digest("hex");
  return legacyHash === stored;
}

export function safeAgent(agent: Agent): Omit<Agent, "passwordHash"> {
  const { passwordHash: _omit, ...rest } = agent;
  return rest;
}
