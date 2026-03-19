import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /**
   * Game rooms — one record per active room.
   */
  rooms: defineTable({
    gameType: v.string(),
    host: v.string(),
    status: v.union(
      v.literal("waiting"),
      v.literal("playing"),
      v.literal("preparing"),
      v.literal("round_active"),
      v.literal("thinking"),
      v.literal("asking"),
      v.literal("buzzed"),
      v.literal("validating"),
      v.literal("scoring"),
      v.literal("ended")
    ),
    settings: v.object({
      rounds: v.optional(v.number()),
      time_limit: v.optional(v.number()),
    }),
    currentPlayer: v.optional(v.string()),
    currentRound: v.optional(v.number()),
    stateVersion: v.number(),
    roomCode: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_gameType", ["gameType"])
    .index("by_roomCode", ["roomCode"]),

  /**
   * Players — one record per player per room.
   */
  players: defineTable({
    roomId: v.id("rooms"),
    name: v.string(),
    isHost: v.boolean(),
    score: v.number(),
    avatar: v.optional(v.string()),
    connected: v.boolean(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_name", ["roomId", "name"]),

  /**
   * Game state — per-room game-specific state blob.
   * Varies by game type (charades items, trivia questions, riddle data, etc.)
   */
  gameState: defineTable({
    roomId: v.id("rooms"),
    gameType: v.string(),
    /** Generic state blob — each game type stores its own shape */
    state: v.any(),
  }).index("by_room", ["roomId"]),

  /**
   * Game items — content synced from SQLite cache.
   * Trivia questions, charades movies, pictionary words, riddles, characters.
   */
  gameItems: defineTable({
    gameType: v.string(),
    category: v.string(),
    itemData: v.any(),
    contentHash: v.string(),
    lastUsed: v.optional(v.number()),
    useCount: v.number(),
    source: v.optional(v.string()),
  })
    .index("by_type", ["gameType"])
    .index("by_type_category", ["gameType", "category"])
    .index("by_hash", ["gameType", "contentHash"])
    .index("by_type_lastUsed", ["gameType", "lastUsed"]),

  /**
   * Room item usage — tracks which items a room has seen (anti-repetition).
   */
  roomItemUsage: defineTable({
    roomId: v.id("rooms"),
    itemId: v.id("gameItems"),
    usedAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_item", ["roomId", "itemId"]),

  /**
   * Reactions — ephemeral emoji reactions (TTL-based cleanup).
   */
  reactions: defineTable({
    roomId: v.id("rooms"),
    playerName: v.string(),
    emoji: v.string(),
    createdAt: v.number(),
  }).index("by_room", ["roomId"]),
});
