import { pgTable, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const biensTable = pgTable("biens", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agentsTable.id),
  titre: text("titre").notNull(),
  adresse: text("adresse").notNull(),
  type: text("type").notNull(),
  prix: doublePrecision("prix").notNull(),
  surface: doublePrecision("surface").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Bien = typeof biensTable.$inferSelect;
export type InsertBien = typeof biensTable.$inferInsert;
