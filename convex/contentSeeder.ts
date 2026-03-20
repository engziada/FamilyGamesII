/**
 * Content Seeder — mutations to populate gameItems table from JSON data.
 *
 * Used to sync static content (characters, riddles, etc.) into Convex DB.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Seed game items in bulk (idempotent — skips duplicates by contentHash).
 */
export const seedItems = mutation({
  args: {
    gameType: v.string(),
    items: v.array(
      v.object({
        title: v.string(),
        category: v.optional(v.string()),
        content: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let added = 0;
    let skipped = 0;

    for (const item of args.items) {
      // Simple hash: gameType + title
      const contentHash = `${args.gameType}:${item.title}`;

      // Check for existing
      const existing = await ctx.db
        .query("gameItems")
        .withIndex("by_hash", (q) =>
          q.eq("gameType", args.gameType).eq("contentHash", contentHash)
        )
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("gameItems", {
        gameType: args.gameType,
        category: item.category || "",
        itemData: { title: item.title, ...(item.content || {}) },
        contentHash,
        lastUsed: 0,
        useCount: 0,
      });
      added++;
    }

    return { added, skipped, total: args.items.length };
  },
});

/**
 * Get random items for a game type (anti-repetition: least-recently-used first).
 */
export const getRandomItems = query({
  args: {
    gameType: v.string(),
    count: v.number(),
    excludeIds: v.optional(v.array(v.id("gameItems"))),
  },
  handler: async (ctx, args) => {
    const allItems = await ctx.db
      .query("gameItems")
      .withIndex("by_type_lastUsed", (q) => q.eq("gameType", args.gameType))
      .collect();

    // Filter out excluded IDs
    const exclude = new Set(args.excludeIds || []);
    const available = allItems.filter((item) => !exclude.has(item._id));

    // Take the least-recently-used items (already sorted by lastUsed via index)
    return available.slice(0, args.count);
  },
});

/**
 * Mark items as used (update lastUsed timestamp).
 */
export const markItemsUsed = mutation({
  args: {
    itemIds: v.array(v.id("gameItems")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.itemIds) {
      await ctx.db.patch(id, { lastUsed: now });
    }
  },
});

/**
 * Get item count by game type.
 */
export const getItemCount = query({
  args: { gameType: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("gameItems")
      .withIndex("by_type", (q) => q.eq("gameType", args.gameType))
      .collect();
    return items.length;
  },
});
