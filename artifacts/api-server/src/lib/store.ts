import { createHash } from "node:crypto";
import type { Agent } from "@workspace/db";

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export function safeAgent(agent: Agent): Omit<Agent, "passwordHash"> {
  const { passwordHash: _omit, ...rest } = agent;
  return rest;
}
