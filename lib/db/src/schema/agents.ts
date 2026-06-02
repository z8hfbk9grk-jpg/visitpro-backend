import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const agentsTable = pgTable("agents", {
  id: text("id").primaryKey(),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  email: text("email").notNull().unique(),
  telephone: text("telephone").notNull(),
  agence: text("agence").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Agent = typeof agentsTable.$inferSelect;
export type InsertAgent = typeof agentsTable.$inferInsert;
