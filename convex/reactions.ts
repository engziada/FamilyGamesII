/**
 * Emoji Reactions (F-04) — ephemeral floating emojis across all screens.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Send an emoji reaction.
 */
export const sendReaction = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("reactions", {
      roomId: args.roomId,
      playerName: args.playerName,
      emoji: args.emoji,
      createdAt: Date.now(),
    });
  },
});

/**
 * Get recent reactions for a room (last 5 seconds).
 */
export const getRecentReactions = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - 5000;
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    return reactions.filter((r) => r.createdAt > cutoff);
  },
});
