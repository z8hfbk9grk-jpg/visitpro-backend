import { pgTable, text, boolean, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const horairesTable = pgTable("horaires", {
  agentId: text("agent_id").notNull().references(() => agentsTable.id),
  jour: text("jour").notNull(), // lun, mar, mer, jeu, ven, sam, dim
  actif: boolean("actif").notNull().default(true),
  heureDebut: text("heure_debut").notNull().default("09:00"),
  heureFin: text("heure_fin").notNull().default("18:00"),
}, (table) => ({
  pk: primaryKey({ columns: [table.agentId, table.jour] }),
}));
export type Horaire = typeof horairesTable.$inferSelect;

export const joursBloquesTable = pgTable("jours_bloques", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agentsTable.id),
  date: text("date").notNull(), // AAAA-MM-JJ
  motif: text("motif"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type JourBloque = typeof joursBloquesTable.$inferSelect;
