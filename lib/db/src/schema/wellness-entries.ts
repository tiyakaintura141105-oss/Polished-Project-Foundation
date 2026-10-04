import { createInsertSchema } from "drizzle-zod";
import {
  date,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const wellnessEntriesTable = pgTable(
  "wellness_entries",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    entryKey: text("entry_key").notNull(),
    kind: text("kind").notNull(),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("wellness_entries_user_key_unique").on(
      table.clerkUserId,
      table.entryKey,
    ),
    index("wellness_entries_user_date_idx").on(
      table.clerkUserId,
      table.entryDate,
    ),
    index("wellness_entries_user_kind_idx").on(
      table.clerkUserId,
      table.kind,
    ),
  ],
);

export const insertWellnessEntrySchema = createInsertSchema(
  wellnessEntriesTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWellnessEntry = z.infer<typeof insertWellnessEntrySchema>;
export type WellnessEntry = typeof wellnessEntriesTable.$inferSelect;