/**
 * Scheduled cleanup functions for stale rooms and old reactions.
 */
import { internalMutation } from "./_generated/server";

/**
 * Delete rooms inactive for 2+ hours and their associated data.
 */
export const cleanupStaleRooms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

    const rooms = await ctx.db.query("rooms").collect();
    let cleaned = 0;

    for (const room of rooms) {
      if (room._creationTime < twoHoursAgo && room.status !== "round_active") {
        // Delete players
        const players = await ctx.db
          .query("players")
          .withIndex("by_room", (q) => q.eq("roomId", room._id))
          .collect();
        for (const p of players) await ctx.db.delete(p._id);

        // Delete game state
        const gs = await ctx.db
          .query("gameState")
          .withIndex("by_room", (q) => q.eq("roomId", room._id))
          .first();
        if (gs) await ctx.db.delete(gs._id);

        // Delete room item usage
        const usages = await ctx.db
          .query("roomItemUsage")
          .withIndex("by_room", (q) => q.eq("roomId", room._id))
          .collect();
        for (const u of usages) await ctx.db.delete(u._id);

        // Delete reactions
        const reactions = await ctx.db
          .query("reactions")
          .withIndex("by_room", (q) => q.eq("roomId", room._id))
          .collect();
        for (const r of reactions) await ctx.db.delete(r._id);

        await ctx.db.delete(room._id);
        cleaned++;
      }
    }

    return { cleaned };
  },
});

/**
 * Delete reactions older than 1 minute.
 */
export const cleanupOldReactions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oneMinuteAgo = Date.now() - 60 * 1000;
    const reactions = await ctx.db.query("reactions").collect();
    let cleaned = 0;

    for (const r of reactions) {
      if (r.createdAt < oneMinuteAgo) {
        await ctx.db.delete(r._id);
        cleaned++;
      }
    }

    return { cleaned };
  },
});
