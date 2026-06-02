import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const reservationsTable = pgTable("reservations", {
  id: text("id").primaryKey(),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  email: text("email").notNull(),
  telephone: text("telephone").notNull(),
  bien: text("bien").notNull(),
  date: text("date").notNull(),
  heure: text("heure").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Reservation = typeof reservationsTable.$inferSelect;
export type InsertReservation = typeof reservationsTable.$inferInsert;
