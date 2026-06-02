import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const tokensTable = pgTable("tokens", {
  token: text("token").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agentsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Token = typeof tokensTable.$inferSelect;
