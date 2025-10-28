import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Analytics tables
export const analytics_sessions = mysqlTable("analytics_sessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().unique(),
  userId: int("userId"),
  userAgent: text("userAgent"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  country: varchar("country", { length: 2 }),
  city: varchar("city", { length: 100 }),
  device: varchar("device", { length: 50 }),
  browser: varchar("browser", { length: 50 }),
  os: varchar("os", { length: 50 }),
  referrer: text("referrer"),
  landingPage: text("landingPage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastActivity: timestamp("lastActivity").defaultNow().notNull(),
});

export const analytics_pageviews = mysqlTable("analytics_pageviews", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  path: text("path").notNull(),
  title: text("title"),
  referrer: text("referrer"),
  duration: int("duration"), // Time spent on page in seconds
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const analytics_events = mysqlTable("analytics_events", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  eventType: varchar("eventType", { length: 50 }).notNull(), // click, scroll, form_submit, etc.
  eventName: varchar("eventName", { length: 100 }),
  elementId: varchar("elementId", { length: 100 }),
  elementClass: text("elementClass"),
  elementText: text("elementText"),
  path: text("path").notNull(),
  metadata: text("metadata"), // JSON string for additional data
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const analytics_heatmap = mysqlTable("analytics_heatmap", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  path: text("path").notNull(),
  eventType: varchar("eventType", { length: 20 }).notNull(), // click, move, scroll
  x: int("x"),
  y: int("y"),
  scrollDepth: int("scrollDepth"), // Percentage of page scrolled
  viewportWidth: int("viewportWidth"),
  viewportHeight: int("viewportHeight"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AnalyticsSession = typeof analytics_sessions.$inferSelect;
export type InsertAnalyticsSession = typeof analytics_sessions.$inferInsert;
export type AnalyticsPageview = typeof analytics_pageviews.$inferSelect;
export type InsertAnalyticsPageview = typeof analytics_pageviews.$inferInsert;
export type AnalyticsEvent = typeof analytics_events.$inferSelect;
export type InsertAnalyticsEvent = typeof analytics_events.$inferInsert;
export type AnalyticsHeatmap = typeof analytics_heatmap.$inferSelect;
export type InsertAnalyticsHeatmap = typeof analytics_heatmap.$inferInsert;