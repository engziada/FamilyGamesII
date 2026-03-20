/**
 * Shared helper functions for Convex game logic.
 */
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";

/** All supported game types */
export const GAME_TYPES = [
  "charades",
  "pictionary",
  "trivia",
  "rapid_fire",
  "twenty_questions",
  "riddles",
  "bus_complete",
  "who_am_i",
] as const;

export type GameType = (typeof GAME_TYPES)[number];

/** Game metadata for the catalog */
export const GAME_CATALOG: Record<
  GameType,
  { title: string; icon: string; mouthBased: boolean; disabled?: boolean }
> = {
  charades: { title: "بدون كلام", icon: "fa-mask", mouthBased: false },
  pictionary: { title: "ارسم وخمن", icon: "fa-paint-brush", mouthBased: false, disabled: true },
  trivia: { title: "بنك المعلومات", icon: "fa-lightbulb", mouthBased: false },
  rapid_fire: { title: "الأسئلة السريعة", icon: "fa-bolt", mouthBased: false },
  twenty_questions: {
    title: "عشرين سؤال",
    icon: "fa-question-circle",
    mouthBased: true,
  },
  riddles: { title: "الألغاز", icon: "fa-brain", mouthBased: false },
  bus_complete: { title: "أتوبيس كومبليت", icon: "fa-bus", mouthBased: false },
  who_am_i: { title: "من أنا؟", icon: "fa-user-secret", mouthBased: true },
};

/** Max players per room */
export const MAX_PLAYERS = 8;

/**
 * Get all players in a room.
 */
export async function getPlayersInRoom(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Doc<"players">[]> {
  return await ctx.db
    .query("players")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
}

/**
 * Find a specific player in a room by name.
 */
export async function findPlayer(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  playerName: string
): Promise<Doc<"players"> | null> {
  return await ctx.db
    .query("players")
    .withIndex("by_room_name", (q) =>
      q.eq("roomId", roomId).eq("name", playerName)
    )
    .first();
}

/**
 * Get the game state for a room.
 */
export async function getGameStateForRoom(
  ctx: QueryCtx,
  roomId: Id<"rooms">
): Promise<Doc<"gameState"> | null> {
  return await ctx.db
    .query("gameState")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .first();
}

/**
 * Normalize Arabic text for comparison (remove diacritics, normalize alef/taa).
 */
export function normalizeArabic(text: string): string {
  let normalized = text.trim().toLowerCase();
  // Remove Arabic diacritics (tashkeel)
  normalized = normalized.replace(/[\u064B-\u065F\u0670]/g, "");
  // Normalize alef variants → ا
  normalized = normalized.replace(/[إأآٱ]/g, "ا");
  // Normalize taa marbuta → ه
  normalized = normalized.replace(/ة/g, "ه");
  // Normalize alef maqsura → ي
  normalized = normalized.replace(/ى/g, "ي");
  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, " ");
  return normalized;
}
