import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createSession,
  trackPageview,
  trackEvent,
  trackHeatmap,
  getAnalyticsSummary,
  getTopPages,
  getHeatmapData,
  getRecentSessions,
  getDeviceStats,
  getBrowserStats,
  getReturningVisitorStats,
  getUTMPerformance,
  getTimeOnPageStats,
  getEngagementMilestones,
} from "./analytics";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Analytics tracking (public endpoints for frontend tracking)
  analytics: router({
    createSession: publicProcedure
      .input(
        z.object({
          sessionId: z.string(),
          userAgent: z.string().optional(),
          ipAddress: z.string().optional(),
          country: z.string().optional(),
          city: z.string().optional(),
          device: z.string().optional(),
          browser: z.string().optional(),
          os: z.string().optional(),
          referrer: z.string().optional(),
          landingPage: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await createSession(input);
        return { success: true };
      }),

    trackPageview: publicProcedure
      .input(
        z.object({
          sessionId: z.string(),
          path: z.string(),
          title: z.string().optional(),
          referrer: z.string().optional(),
          duration: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await trackPageview(input);
        return { success: true };
      }),

    trackEvent: publicProcedure
      .input(
        z.object({
          sessionId: z.string(),
          eventType: z.string(),
          eventName: z.string().optional(),
          elementId: z.string().optional(),
          elementClass: z.string().optional(),
          elementText: z.string().optional(),
          path: z.string(),
          metadata: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await trackEvent(input);
        return { success: true };
      }),

    trackHeatmap: publicProcedure
      .input(
        z.object({
          sessionId: z.string(),
          path: z.string(),
          eventType: z.string(),
          x: z.number().optional(),
          y: z.number().optional(),
          scrollDepth: z.number().optional(),
          viewportWidth: z.number().optional(),
          viewportHeight: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await trackHeatmap(input);
        return { success: true };
      }),

    // Dashboard endpoints (protected - admin only)
    getSummary: publicProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getAnalyticsSummary(input.startDate, input.endDate);
      }),

    getTopPages: publicProcedure
      .input(
        z.object({
          limit: z.number().default(10),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getTopPages(input.limit, input.startDate, input.endDate);
      }),

    getHeatmapData: publicProcedure
      .input(
        z.object({
          path: z.string(),
          eventType: z.string().default("click"),
        })
      )
      .query(async ({ input }) => {
        return await getHeatmapData(input.path, input.eventType);
      }),

    getRecentSessions: publicProcedure
      .input(
        z.object({
          limit: z.number().default(50),
        })
      )
      .query(async ({ input }) => {
        return await getRecentSessions(input.limit);
      }),

    getDeviceStats: publicProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getDeviceStats(input.startDate, input.endDate);
      }),

    getBrowserStats: publicProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getBrowserStats(input.startDate, input.endDate);
      }),

    getReturningVisitorStats: publicProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getReturningVisitorStats(input.startDate, input.endDate);
      }),

    getUTMPerformance: publicProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getUTMPerformance(input.startDate, input.endDate);
      }),

    getTimeOnPageStats: publicProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getTimeOnPageStats(input.startDate, input.endDate);
      }),

    getEngagementMilestones: publicProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        })
      )
      .query(async ({ input }) => {
        return await getEngagementMilestones(input.startDate, input.endDate);
      }),
  }),
});

export type AppRouter = typeof appRouter;
