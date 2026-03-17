/**
 * Riddles Game (الألغاز)
 *
 * Fix B6-MAJOR-01: Allow 3 attempts (full → half → 1 point).
 * Fix B6-MAJOR-02: Load riddles in startGame only (no double fetch).
 * Fix B6-MINOR-01: Track hint requester, cost only to that player.
 */
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getGameStateForRoom, findPlayer, normalizeArabic } from "../helpers";

/**
 * Load a riddle into the game state.
 */
export const loadRiddle = mutation({
  args: {
    roomId: v.id("rooms"),
    riddle: v.any(),
  },
  handler: async (ctx, args) => {
    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) throw new Error("حالة اللعبة غير موجودة");

    const room = await ctx.db.get(args.roomId);
    if (!room) return;

    const state = gs.state as any;

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentRiddle: args.riddle,
        playersAnswered: {},
        hintsRevealed: 0,
        hintRequestedBy: [],
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "round_active",
      stateVersion: room.stateVersion + 1,
    });
  },
});

/**
 * Submit an answer to the current riddle.
 * Fix B6-MAJOR-01: Allow 3 attempts with diminishing points.
 */
export const submitAnswer = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "round_active") return;

    const state = gs.state as any;
    if (!state.currentRiddle) return;

    // Check attempt count (B6-MAJOR-01 fix: allow 3 attempts)
    const playerAttempts = state.playersAnswered[args.playerName] ?? 0;
    if (playerAttempts >= 3) {
      return { correct: false, message: "لقد استنفدت محاولاتك الثلاث" };
    }

    // Normalize and compare
    const normalizedAnswer = normalizeArabic(args.answer);
    const correctAnswer = normalizeArabic(state.currentRiddle.answer);
    const acceptedAnswers = (state.currentRiddle.accepted_answers ?? []).map(
      (a: string) => normalizeArabic(a)
    );

    const isCorrect =
      normalizedAnswer === correctAnswer ||
      acceptedAnswers.includes(normalizedAnswer);

    if (isCorrect) {
      // Diminishing points: attempt 1 = 10, attempt 2 = 5, attempt 3 = 1
      const pointsMap: Record<number, number> = { 0: 10, 1: 5, 2: 1 };
      const points = pointsMap[playerAttempts] ?? 1;

      // Deduct hint cost only for this player (B6-MINOR-01 fix)
      const hintCost = (state.hintRequestedBy ?? []).filter(
        (name: string) => name === args.playerName
      ).length;
      const finalPoints = Math.max(1, points - hintCost);

      const player = await findPlayer(ctx, args.roomId, args.playerName);
      if (player) await ctx.db.patch(player._id, { score: player.score + finalPoints });

      await ctx.db.patch(gs._id, {
        state: {
          ...state,
          playersAnswered: {
            ...state.playersAnswered,
            [args.playerName]: playerAttempts + 1,
          },
          lastResult: {
            player: args.playerName,
            correct: true,
            points: finalPoints,
            answer: state.currentRiddle.answer,
          },
        },
      });

      await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });
      return { correct: true, points: finalPoints, answer: state.currentRiddle.answer };
    }

    // Wrong answer — increment attempt count
    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        playersAnswered: {
          ...state.playersAnswered,
          [args.playerName]: playerAttempts + 1,
        },
      },
    });

    await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });

    const remaining = 2 - playerAttempts;
    return {
      correct: false,
      message: remaining > 0 ? `إجابة خاطئة! متبقي ${remaining} محاول${remaining === 1 ? "ة" : "ات"}` : "لقد استنفدت محاولاتك الثلاث",
    };
  },
});

/**
 * Reveal a hint (B6-MINOR-01: track requester for per-player cost).
 */
export const revealHint = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const room = await ctx.db.get(args.roomId);
    if (!room) return;

    const state = gs.state as any;
    if (!state.currentRiddle?.hints) return;
    if (state.hintsRevealed >= 3) return;

    const hintsRevealed = state.hintsRevealed + 1;
    const hint = state.currentRiddle.hints[state.hintsRevealed];

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        hintsRevealed,
        hintRequestedBy: [...(state.hintRequestedBy ?? []), args.playerName],
      },
    });

    await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });

    return { hint, hintsRemaining: 3 - hintsRevealed };
  },
});

/**
 * Skip the current riddle (host action).
 */
export const skipRiddle = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.host !== args.playerName) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    const riddleIndex = state.riddleIndex + 1;

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentRiddle: null,
        riddleIndex,
        playersAnswered: {},
        hintsRevealed: 0,
        hintRequestedBy: [],
      },
    });

    await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });

    return { skippedAnswer: state.currentRiddle?.answer };
  },
});

/**
 * Move to next riddle (host action).
 */
export const nextRiddle = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.host !== args.playerName) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    const riddleIndex = state.riddleIndex + 1;

    if (riddleIndex >= state.maxRiddles) {
      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 1,
      });
      return { gameEnded: true };
    }

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentRiddle: null,
        riddleIndex,
        playersAnswered: {},
        hintsRevealed: 0,
        hintRequestedBy: [],
      },
    });

    await ctx.db.patch(args.roomId, {
      currentRound: riddleIndex + 1,
      stateVersion: room.stateVersion + 1,
    });

    return { gameEnded: false };
  },
});
