import { pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const projectStatus = pgEnum("project_status", ["active", "archived"]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: projectStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 100 }),
  locale: varchar("locale", { length: 10 }).notNull().default("ko"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
