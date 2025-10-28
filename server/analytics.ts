import { eq, desc, sql, and, gte, lte, count } from "drizzle-orm";
import {
  analytics_sessions,
  analytics_pageviews,
  analytics_events,
  analytics_heatmap,
  InsertAnalyticsSession,
  InsertAnalyticsPageview,
  InsertAnalyticsEvent,
  InsertAnalyticsHeatmap,
} from "../drizzle/schema";
import { getDb } from "./db";

export async function createSession(session: InsertAnalyticsSession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(analytics_sessions).values(session);
}

export async function updateSessionActivity(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(analytics_sessions)
    .set({ lastActivity: new Date() })
    .where(eq(analytics_sessions.sessionId, sessionId));
}

export async function trackPageview(pageview: InsertAnalyticsPageview) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(analytics_pageviews).values(pageview);
  await updateSessionActivity(pageview.sessionId);
}

export async function trackEvent(event: InsertAnalyticsEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(analytics_events).values(event);
  await updateSessionActivity(event.sessionId);
}

export async function trackHeatmap(heatmap: InsertAnalyticsHeatmap) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(analytics_heatmap).values(heatmap);
}

export async function getAnalyticsSummary(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const dateFilter = startDate && endDate
    ? and(
        gte(analytics_sessions.createdAt, startDate),
        lte(analytics_sessions.createdAt, endDate)
      )
    : undefined;
  
  const [sessionsResult, pageviewsResult, eventsResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(analytics_sessions)
      .where(dateFilter),
    db
      .select({ count: count() })
      .from(analytics_pageviews)
      .where(dateFilter ? and(
        gte(analytics_pageviews.createdAt, startDate!),
        lte(analytics_pageviews.createdAt, endDate!)
      ) : undefined),
    db
      .select({ count: count() })
      .from(analytics_events)
      .where(dateFilter ? and(
        gte(analytics_events.createdAt, startDate!),
        lte(analytics_events.createdAt, endDate!)
      ) : undefined),
  ]);
  
  return {
    totalSessions: sessionsResult[0]?.count || 0,
    totalPageviews: pageviewsResult[0]?.count || 0,
    totalEvents: eventsResult[0]?.count || 0,
  };
}

export async function getTopPages(limit: number = 10, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const dateFilter = startDate && endDate
    ? and(
        gte(analytics_pageviews.createdAt, startDate),
        lte(analytics_pageviews.createdAt, endDate)
      )
    : undefined;
  
  const result = await db
    .select({
      path: analytics_pageviews.path,
      views: count(),
    })
    .from(analytics_pageviews)
    .where(dateFilter)
    .groupBy(analytics_pageviews.path)
    .orderBy(desc(count()))
    .limit(limit);
  
  return result;
}

export async function getHeatmapData(path: string, eventType: string = "click") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db
    .select()
    .from(analytics_heatmap)
    .where(
      and(
        eq(analytics_heatmap.path, path),
        eq(analytics_heatmap.eventType, eventType)
      )
    )
    .limit(10000); // Limit to prevent too much data
  
  return result;
}

export async function getRecentSessions(limit: number = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db
    .select()
    .from(analytics_sessions)
    .orderBy(desc(analytics_sessions.createdAt))
    .limit(limit);
  
  return result;
}

export async function getDeviceStats(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const dateFilter = startDate && endDate
    ? and(
        gte(analytics_sessions.createdAt, startDate),
        lte(analytics_sessions.createdAt, endDate)
      )
    : undefined;
  
  const result = await db
    .select({
      device: analytics_sessions.device,
      count: count(),
    })
    .from(analytics_sessions)
    .where(dateFilter)
    .groupBy(analytics_sessions.device);
  
  return result;
}

export async function getBrowserStats(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const dateFilter = startDate && endDate
    ? and(
        gte(analytics_sessions.createdAt, startDate),
        lte(analytics_sessions.createdAt, endDate)
      )
    : undefined;
  
  const result = await db
    .select({
      browser: analytics_sessions.browser,
      count: count(),
    })
    .from(analytics_sessions)
    .where(dateFilter)
    .groupBy(analytics_sessions.browser);
  
  return result;
}




// Get returning vs new visitor stats
export async function getReturningVisitorStats(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Count returning visitors (those with returning_visitor event)
  const returningConditions = [eq(analytics_events.eventType, "returning_visitor")];
  if (startDate) returningConditions.push(gte(analytics_events.createdAt, startDate));
  if (endDate) returningConditions.push(lte(analytics_events.createdAt, endDate));

  const returningQuery = db
    .select({ count: count() })
    .from(analytics_events)
    .where(and(...returningConditions));

  const returningResult = await returningQuery;
  const returningCount = Number(returningResult[0]?.count || 0);

  // Count total sessions
  const totalConditions: any[] = [];
  if (startDate) totalConditions.push(gte(analytics_sessions.createdAt, startDate));
  if (endDate) totalConditions.push(lte(analytics_sessions.createdAt, endDate));

  const totalQuery = totalConditions.length > 0
    ? db.select({ count: count() }).from(analytics_sessions).where(and(...totalConditions))
    : db.select({ count: count() }).from(analytics_sessions);

  const totalResult = await totalQuery;
  const totalCount = Number(totalResult[0]?.count || 0);

  return {
    returningVisitors: returningCount,
    newVisitors: totalCount - returningCount,
  };
}

// Get UTM campaign performance
export async function getUTMPerformance(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(analytics_events.eventType, "utm_tracking")];
  if (startDate) conditions.push(gte(analytics_events.createdAt, startDate));
  if (endDate) conditions.push(lte(analytics_events.createdAt, endDate));

  const query = db
    .select({
      campaign: analytics_events.metadata,
      sessions: count(),
    })
    .from(analytics_events)
    .where(and(...conditions))
    .groupBy(analytics_events.metadata);

  const results = await query;

  return results.map((r) => {
    try {
      const metadata = JSON.parse(r.campaign || "{}");
      return {
        campaign: metadata.campaign || null,
        source: metadata.source || null,
        medium: metadata.medium || null,
        sessions: Number(r.sessions),
      };
    } catch {
      return {
        campaign: null,
        source: null,
        medium: null,
        sessions: Number(r.sessions),
      };
    }
  });
}

// Get time on page statistics
export async function getTimeOnPageStats(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [sql`${analytics_pageviews.duration} IS NOT NULL`];
  if (startDate) conditions.push(gte(analytics_pageviews.createdAt, startDate));
  if (endDate) conditions.push(lte(analytics_pageviews.createdAt, endDate));

  const query = db
    .select({
      duration: analytics_pageviews.duration,
    })
    .from(analytics_pageviews)
    .where(and(...conditions));

  const results = await query;

  // Group into time ranges
  const ranges = {
    "0-10s": 0,
    "10-30s": 0,
    "30-60s": 0,
    "1-2min": 0,
    "2-5min": 0,
    "5min+": 0,
  };

  results.forEach((r) => {
    const duration = Number(r.duration || 0);
    if (duration < 10) ranges["0-10s"]++;
    else if (duration < 30) ranges["10-30s"]++;
    else if (duration < 60) ranges["30-60s"]++;
    else if (duration < 120) ranges["1-2min"]++;
    else if (duration < 300) ranges["2-5min"]++;
    else ranges["5min+"]++;
  });

  return Object.entries(ranges).map(([timeRange, count]) => ({
    timeRange,
    count,
  }));
}

// Get engagement milestone stats
export async function getEngagementMilestones(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(analytics_events.eventType, "time_milestone")];
  if (startDate) conditions.push(gte(analytics_events.createdAt, startDate));
  if (endDate) conditions.push(lte(analytics_events.createdAt, endDate));

  const query = db
    .select({
      metadata: analytics_events.metadata,
      count: count(),
    })
    .from(analytics_events)
    .where(and(...conditions))
    .groupBy(analytics_events.metadata);

  const results = await query;

  return results.map((r) => {
    try {
      const metadata = JSON.parse(r.metadata || "{}");
      return {
        milestone: metadata.seconds || 0,
        userCount: Number(r.count),
      };
    } catch {
      return {
        milestone: 0,
        userCount: Number(r.count),
      };
    }
  }).sort((a, b) => a.milestone - b.milestone);
}

