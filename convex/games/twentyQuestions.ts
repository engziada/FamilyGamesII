/**
 * Twenty Questions — Mouth-Based (وجهاً لوجه فقط)
 *
 * Thinker picks a word on screen. Questions/answers are verbal.
 * Thinker presses نعم/لا/ربما buttons after each verbal Q&A.
 * Question counter + answer history displayed to all.
 * "خمنت صح" button for thinker when someone guesses correctly verbally.
 */
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getGameStateForRoom, findPlayer, getPlayersInRoom } from "../helpers";

/**
 * Thinker sets the secret word (visible only to them).
 */
export const setSecretWord = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    word: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "thinking") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    if (state.thinker !== args.playerName) return;

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        secretWord: args.word.trim(),
        secretCategory: args.category?.trim() ?? null,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "asking",
      stateVersion: room.stateVersion + 1,
    });
  },
});

/**
 * Thinker records the answer to a verbal question (نعم/لا/ربما).
 * This replaces the old typed question flow — questions are asked verbally.
 */
export const recordAnswer = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    answer: v.union(v.literal("نعم"), v.literal("لا"), v.literal("ربما")),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "asking") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    if (state.thinker !== args.playerName) return;

    const questionCount = state.questionCount + 1;
    const answerHistory = [
      ...state.answerHistory,
      { number: questionCount, answer: args.answer },
    ];

    await ctx.db.patch(gs._id, {
      state: { ...state, questionCount, answerHistory },
    });

    await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });

    // Check if max questions reached
    if (questionCount >= state.maxQuestions) {
      // Thinker wins — nobody guessed
      const thinker = await findPlayer(ctx, args.roomId, state.thinker);
      if (thinker) await ctx.db.patch(thinker._id, { score: thinker.score + 10 });

      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 2,
      });

      return { maxReached: true, word: state.secretWord };
    }

    return { maxReached: false, questionCount };
  },
});

/**
 * Thinker confirms someone guessed correctly (verbal guess).
 */
export const guessedCorrectly = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    guesserName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "asking") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    if (state.thinker !== args.playerName) return;

    // Award points — fewer questions = more points
    const questionsUsed = state.questionCount;
    const points = Math.max(1, 20 - questionsUsed);

    const guesser = await findPlayer(ctx, args.roomId, args.guesserName);
    if (guesser) await ctx.db.patch(guesser._id, { score: guesser.score + points });

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        lastResult: {
          winner: args.guesserName,
          word: state.secretWord,
          questionsUsed,
          points,
        },
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "ended",
      stateVersion: room.stateVersion + 1,
    });

    return { word: state.secretWord, guesser: args.guesserName, points };
  },
});

/**
 * Move to next round (host action).
 */
export const nextRound = mutation({
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
    const roundsPlayed = state.roundsPlayed + 1;

    if (roundsPlayed >= state.maxRounds) {
      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 1,
      });
      return { gameEnded: true };
    }

    // Rotate thinker
    const nextThinkerIndex = (state.thinkerIndex + 1) % state.playerOrder.length;
    const nextThinker = state.playerOrder[nextThinkerIndex];

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        thinker: nextThinker,
        thinkerIndex: nextThinkerIndex,
        secretWord: null,
        secretCategory: null,
        questionCount: 0,
        answerHistory: [],
        roundsPlayed,
        lastResult: null,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "thinking",
      currentPlayer: nextThinker,
      currentRound: roundsPlayed + 1,
      stateVersion: room.stateVersion + 1,
    });

    return { gameEnded: false, nextThinker };
  },
});
