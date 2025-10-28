// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var analytics_sessions = mysqlTable("analytics_sessions", {
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
  lastActivity: timestamp("lastActivity").defaultNow().notNull()
});
var analytics_pageviews = mysqlTable("analytics_pageviews", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  path: text("path").notNull(),
  title: text("title"),
  referrer: text("referrer"),
  duration: int("duration"),
  // Time spent on page in seconds
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var analytics_events = mysqlTable("analytics_events", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  eventType: varchar("eventType", { length: 50 }).notNull(),
  // click, scroll, form_submit, etc.
  eventName: varchar("eventName", { length: 100 }),
  elementId: varchar("elementId", { length: 100 }),
  elementClass: text("elementClass"),
  elementText: text("elementText"),
  path: text("path").notNull(),
  metadata: text("metadata"),
  // JSON string for additional data
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var analytics_heatmap = mysqlTable("analytics_heatmap", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  path: text("path").notNull(),
  eventType: varchar("eventType", { length: 20 }).notNull(),
  // click, move, scroll
  x: int("x"),
  y: int("y"),
  scrollDepth: int("scrollDepth"),
  // Percentage of page scrolled
  viewportWidth: int("viewportWidth"),
  viewportHeight: int("viewportHeight"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z2 } from "zod";

// server/analytics.ts
import { eq as eq2, desc, sql, and, gte, lte, count } from "drizzle-orm";
async function createSession(session) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(analytics_sessions).values(session);
}
async function updateSessionActivity(sessionId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(analytics_sessions).set({ lastActivity: /* @__PURE__ */ new Date() }).where(eq2(analytics_sessions.sessionId, sessionId));
}
async function trackPageview(pageview) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(analytics_pageviews).values(pageview);
  await updateSessionActivity(pageview.sessionId);
}
async function trackEvent(event) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(analytics_events).values(event);
  await updateSessionActivity(event.sessionId);
}
async function trackHeatmap(heatmap) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(analytics_heatmap).values(heatmap);
}
async function getAnalyticsSummary(startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const dateFilter = startDate && endDate ? and(
    gte(analytics_sessions.createdAt, startDate),
    lte(analytics_sessions.createdAt, endDate)
  ) : void 0;
  const [sessionsResult, pageviewsResult, eventsResult] = await Promise.all([
    db.select({ count: count() }).from(analytics_sessions).where(dateFilter),
    db.select({ count: count() }).from(analytics_pageviews).where(dateFilter ? and(
      gte(analytics_pageviews.createdAt, startDate),
      lte(analytics_pageviews.createdAt, endDate)
    ) : void 0),
    db.select({ count: count() }).from(analytics_events).where(dateFilter ? and(
      gte(analytics_events.createdAt, startDate),
      lte(analytics_events.createdAt, endDate)
    ) : void 0)
  ]);
  return {
    totalSessions: sessionsResult[0]?.count || 0,
    totalPageviews: pageviewsResult[0]?.count || 0,
    totalEvents: eventsResult[0]?.count || 0
  };
}
async function getTopPages(limit = 10, startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const dateFilter = startDate && endDate ? and(
    gte(analytics_pageviews.createdAt, startDate),
    lte(analytics_pageviews.createdAt, endDate)
  ) : void 0;
  const result = await db.select({
    path: analytics_pageviews.path,
    views: count()
  }).from(analytics_pageviews).where(dateFilter).groupBy(analytics_pageviews.path).orderBy(desc(count())).limit(limit);
  return result;
}
async function getHeatmapData(path2, eventType = "click") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(analytics_heatmap).where(
    and(
      eq2(analytics_heatmap.path, path2),
      eq2(analytics_heatmap.eventType, eventType)
    )
  ).limit(1e4);
  return result;
}
async function getRecentSessions(limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(analytics_sessions).orderBy(desc(analytics_sessions.createdAt)).limit(limit);
  return result;
}
async function getDeviceStats(startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const dateFilter = startDate && endDate ? and(
    gte(analytics_sessions.createdAt, startDate),
    lte(analytics_sessions.createdAt, endDate)
  ) : void 0;
  const result = await db.select({
    device: analytics_sessions.device,
    count: count()
  }).from(analytics_sessions).where(dateFilter).groupBy(analytics_sessions.device);
  return result;
}
async function getBrowserStats(startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const dateFilter = startDate && endDate ? and(
    gte(analytics_sessions.createdAt, startDate),
    lte(analytics_sessions.createdAt, endDate)
  ) : void 0;
  const result = await db.select({
    browser: analytics_sessions.browser,
    count: count()
  }).from(analytics_sessions).where(dateFilter).groupBy(analytics_sessions.browser);
  return result;
}
async function getReturningVisitorStats(startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const returningConditions = [eq2(analytics_events.eventType, "returning_visitor")];
  if (startDate) returningConditions.push(gte(analytics_events.createdAt, startDate));
  if (endDate) returningConditions.push(lte(analytics_events.createdAt, endDate));
  const returningQuery = db.select({ count: count() }).from(analytics_events).where(and(...returningConditions));
  const returningResult = await returningQuery;
  const returningCount = Number(returningResult[0]?.count || 0);
  const totalConditions = [];
  if (startDate) totalConditions.push(gte(analytics_sessions.createdAt, startDate));
  if (endDate) totalConditions.push(lte(analytics_sessions.createdAt, endDate));
  const totalQuery = totalConditions.length > 0 ? db.select({ count: count() }).from(analytics_sessions).where(and(...totalConditions)) : db.select({ count: count() }).from(analytics_sessions);
  const totalResult = await totalQuery;
  const totalCount = Number(totalResult[0]?.count || 0);
  return {
    returningVisitors: returningCount,
    newVisitors: totalCount - returningCount
  };
}
async function getUTMPerformance(startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq2(analytics_events.eventType, "utm_tracking")];
  if (startDate) conditions.push(gte(analytics_events.createdAt, startDate));
  if (endDate) conditions.push(lte(analytics_events.createdAt, endDate));
  const query = db.select({
    campaign: analytics_events.metadata,
    sessions: count()
  }).from(analytics_events).where(and(...conditions)).groupBy(analytics_events.metadata);
  const results = await query;
  return results.map((r) => {
    try {
      const metadata = JSON.parse(r.campaign || "{}");
      return {
        campaign: metadata.campaign || null,
        source: metadata.source || null,
        medium: metadata.medium || null,
        sessions: Number(r.sessions)
      };
    } catch {
      return {
        campaign: null,
        source: null,
        medium: null,
        sessions: Number(r.sessions)
      };
    }
  });
}
async function getTimeOnPageStats(startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [sql`${analytics_pageviews.duration} IS NOT NULL`];
  if (startDate) conditions.push(gte(analytics_pageviews.createdAt, startDate));
  if (endDate) conditions.push(lte(analytics_pageviews.createdAt, endDate));
  const query = db.select({
    duration: analytics_pageviews.duration
  }).from(analytics_pageviews).where(and(...conditions));
  const results = await query;
  const ranges = {
    "0-10s": 0,
    "10-30s": 0,
    "30-60s": 0,
    "1-2min": 0,
    "2-5min": 0,
    "5min+": 0
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
  return Object.entries(ranges).map(([timeRange, count2]) => ({
    timeRange,
    count: count2
  }));
}
async function getEngagementMilestones(startDate, endDate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq2(analytics_events.eventType, "time_milestone")];
  if (startDate) conditions.push(gte(analytics_events.createdAt, startDate));
  if (endDate) conditions.push(lte(analytics_events.createdAt, endDate));
  const query = db.select({
    metadata: analytics_events.metadata,
    count: count()
  }).from(analytics_events).where(and(...conditions)).groupBy(analytics_events.metadata);
  const results = await query;
  return results.map((r) => {
    try {
      const metadata = JSON.parse(r.metadata || "{}");
      return {
        milestone: metadata.seconds || 0,
        userCount: Number(r.count)
      };
    } catch {
      return {
        milestone: 0,
        userCount: Number(r.count)
      };
    }
  }).sort((a, b) => a.milestone - b.milestone);
}

// server/routers.ts
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  // Analytics tracking (public endpoints for frontend tracking)
  analytics: router({
    createSession: publicProcedure.input(
      z2.object({
        sessionId: z2.string(),
        userAgent: z2.string().optional(),
        ipAddress: z2.string().optional(),
        country: z2.string().optional(),
        city: z2.string().optional(),
        device: z2.string().optional(),
        browser: z2.string().optional(),
        os: z2.string().optional(),
        referrer: z2.string().optional(),
        landingPage: z2.string().optional()
      })
    ).mutation(async ({ input }) => {
      await createSession(input);
      return { success: true };
    }),
    trackPageview: publicProcedure.input(
      z2.object({
        sessionId: z2.string(),
        path: z2.string(),
        title: z2.string().optional(),
        referrer: z2.string().optional(),
        duration: z2.number().optional()
      })
    ).mutation(async ({ input }) => {
      await trackPageview(input);
      return { success: true };
    }),
    trackEvent: publicProcedure.input(
      z2.object({
        sessionId: z2.string(),
        eventType: z2.string(),
        eventName: z2.string().optional(),
        elementId: z2.string().optional(),
        elementClass: z2.string().optional(),
        elementText: z2.string().optional(),
        path: z2.string(),
        metadata: z2.string().optional()
      })
    ).mutation(async ({ input }) => {
      await trackEvent(input);
      return { success: true };
    }),
    trackHeatmap: publicProcedure.input(
      z2.object({
        sessionId: z2.string(),
        path: z2.string(),
        eventType: z2.string(),
        x: z2.number().optional(),
        y: z2.number().optional(),
        scrollDepth: z2.number().optional(),
        viewportWidth: z2.number().optional(),
        viewportHeight: z2.number().optional()
      })
    ).mutation(async ({ input }) => {
      await trackHeatmap(input);
      return { success: true };
    }),
    // Dashboard endpoints (protected - admin only)
    getSummary: publicProcedure.input(
      z2.object({
        startDate: z2.date().optional(),
        endDate: z2.date().optional()
      })
    ).query(async ({ input }) => {
      return await getAnalyticsSummary(input.startDate, input.endDate);
    }),
    getTopPages: publicProcedure.input(
      z2.object({
        limit: z2.number().default(10),
        startDate: z2.date().optional(),
        endDate: z2.date().optional()
      })
    ).query(async ({ input }) => {
      return await getTopPages(input.limit, input.startDate, input.endDate);
    }),
    getHeatmapData: publicProcedure.input(
      z2.object({
        path: z2.string(),
        eventType: z2.string().default("click")
      })
    ).query(async ({ input }) => {
      return await getHeatmapData(input.path, input.eventType);
    }),
    getRecentSessions: publicProcedure.input(
      z2.object({
        limit: z2.number().default(50)
      })
    ).query(async ({ input }) => {
      return await getRecentSessions(input.limit);
    }),
    getDeviceStats: publicProcedure.input(
      z2.object({
        startDate: z2.date().optional(),
        endDate: z2.date().optional()
      })
    ).query(async ({ input }) => {
      return await getDeviceStats(input.startDate, input.endDate);
    }),
    getBrowserStats: publicProcedure.input(
      z2.object({
        startDate: z2.date().optional(),
        endDate: z2.date().optional()
      })
    ).query(async ({ input }) => {
      return await getBrowserStats(input.startDate, input.endDate);
    }),
    getReturningVisitorStats: publicProcedure.input(
      z2.object({
        startDate: z2.date().optional(),
        endDate: z2.date().optional()
      })
    ).query(async ({ input }) => {
      return await getReturningVisitorStats(input.startDate, input.endDate);
    }),
    getUTMPerformance: publicProcedure.input(
      z2.object({
        startDate: z2.date().optional(),
        endDate: z2.date().optional()
      })
    ).query(async ({ input }) => {
      return await getUTMPerformance(input.startDate, input.endDate);
    }),
    getTimeOnPageStats: publicProcedure.input(
      z2.object({
        startDate: z2.date().optional(),
        endDate: z2.date().optional()
      })
    ).query(async ({ input }) => {
      return await getTimeOnPageStats(input.startDate, input.endDate);
    }),
    getEngagementMilestones: publicProcedure.input(
      z2.object({
        startDate: z2.date().optional(),
        endDate: z2.date().optional()
      })
    ).query(async ({ input }) => {
      return await getEngagementMilestones(input.startDate, input.endDate);
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const viteConfigModule = await import("../../vite.config.js");
  const viteConfig = viteConfigModule.default || viteConfigModule;
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(
        __dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path.resolve(__dirname, "../..", "dist", "public") : path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

// server/_core/migrate.ts
import { drizzle as drizzle2 } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn("[Database] DATABASE_URL not set, skipping migrations");
    return;
  }
  try {
    console.log("[Database] Running migrations...");
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    const db = drizzle2(connection);
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("[Database] Migrations completed successfully");
    await connection.end();
  } catch (error) {
    console.error("[Database] Migration failed:", error);
  }
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  await runMigrations();
  const app = express2();
  const server = createServer(app);
  app.use((req, res, next) => {
    const allowedOrigins = [
      "https://soco.com.mx",
      "https://www.soco.com.mx",
      "http://localhost:5173",
      "http://localhost:3000"
    ];
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
