import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getGameStateForRoom, findPlayer, getPlayersInRoom } from "../helpers";

/**
 * Load a question for rapid fire round.
 */
export const loadQuestion = mutation({
  args: {
    roomId: v.id("rooms"),
    question: v.any(),
  },
  handler: async (ctx, args) => {
    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) throw new Error("حالة اللعبة غير موجودة");

    const room = await ctx.db.get(args.roomId);
    if (!room) return;

    const state = gs.state as any;
    const timeLimit = state.timeLimit ?? 30;

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentQuestion: args.question,
        buzzedPlayer: null,
        buzzFailed: [],
        questionActive: true,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "round_active",
      stateVersion: room.stateVersion + 1,
    });

    // Server-side question timer
    await ctx.scheduler.runAfter(timeLimit * 1000, internal.games.rapidFire.handleQuestionTimeout, {
      roomId: args.roomId,
      expectedVersion: room.stateVersion + 1,
    });
  },
});

/**
 * Player buzzes in.
 * Fix B4-CRITICAL-01: Server-side buzz timer via scheduler.
 */
export const buzzIn = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "round_active") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    if (!state.questionActive) return;
    if (state.buzzedPlayer) return;
    if (state.buzzFailed.includes(args.playerName)) return;

    await ctx.db.patch(gs._id, {
      state: { ...state, buzzedPlayer: args.playerName },
    });

    await ctx.db.patch(args.roomId, {
      status: "buzzed",
      stateVersion: room.stateVersion + 1,
    });

    // Server-side buzz timeout (10 seconds) — B4-CRITICAL-01 fix
    await ctx.scheduler.runAfter(10_000, internal.games.rapidFire.handleBuzzTimeout, {
      roomId: args.roomId,
      expectedVersion: room.stateVersion + 1,
      playerName: args.playerName,
    });

    return { buzzTimeout: 10 };
  },
});

/**
 * Buzzed player submits an answer.
 * Fix B4-MAJOR-01: Options visible to ALL, only buzzer clickable (handled in frontend).
 */
export const submitBuzzAnswer = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    answerIdx: v.number(),
  },
  handler: async (ctx, args) => {
    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const room = await ctx.db.get(args.roomId);
    if (!room) return;

    const state = gs.state as any;
    if (state.buzzedPlayer !== args.playerName) return;

    const correct = args.answerIdx === state.currentQuestion?.answer;

    if (correct) {
      const player = await findPlayer(ctx, args.roomId, args.playerName);
      if (player) await ctx.db.patch(player._id, { score: player.score + 10 });

      const questionIndex = state.questionIndex + 1;
      await ctx.db.patch(gs._id, {
        state: {
          ...state,
          questionActive: false,
          buzzedPlayer: null,
          questionIndex,
          lastResult: {
            player: args.playerName,
            correct: true,
            correctAnswer: state.currentQuestion.options[state.currentQuestion.answer],
          },
        },
      });

      await ctx.db.patch(args.roomId, {
        status: "round_active",
        stateVersion: room.stateVersion + 1,
      });
      return { correct: true };
    }

    // Wrong answer — add to buzzFailed, release buzz
    const buzzFailed = [...state.buzzFailed, args.playerName];
    const allPlayers = await getPlayersInRoom(ctx, args.roomId);

    if (buzzFailed.length >= allPlayers.length) {
      // All players failed — advance
      const questionIndex = state.questionIndex + 1;
      await ctx.db.patch(gs._id, {
        state: {
          ...state,
          questionActive: false,
          buzzedPlayer: null,
          buzzFailed,
          questionIndex,
          lastResult: {
            allWrong: true,
            correctAnswer: state.currentQuestion.options[state.currentQuestion.answer],
          },
        },
      });
    } else {
      await ctx.db.patch(gs._id, {
        state: { ...state, buzzedPlayer: null, buzzFailed },
      });
    }

    await ctx.db.patch(args.roomId, {
      status: "round_active",
      stateVersion: room.stateVersion + 1,
    });
    return { correct: false };
  },
});

/**
 * Server-side buzz timeout — player took too long.
 */
export const handleBuzzTimeout = internalMutation({
  args: {
    roomId: v.id("rooms"),
    expectedVersion: v.number(),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    if (room.stateVersion !== args.expectedVersion) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    if (state.buzzedPlayer !== args.playerName) return;

    const buzzFailed = [...state.buzzFailed, args.playerName];
    const allPlayers = await getPlayersInRoom(ctx, args.roomId);

    if (buzzFailed.length >= allPlayers.length) {
      const questionIndex = state.questionIndex + 1;
      await ctx.db.patch(gs._id, {
        state: {
          ...state,
          questionActive: false,
          buzzedPlayer: null,
          buzzFailed,
          questionIndex,
          lastResult: {
            allWrong: true,
            correctAnswer: state.currentQuestion.options[state.currentQuestion.answer],
          },
        },
      });
    } else {
      await ctx.db.patch(gs._id, {
        state: { ...state, buzzedPlayer: null, buzzFailed },
      });
    }

    await ctx.db.patch(args.roomId, {
      status: "round_active",
      stateVersion: room.stateVersion + 1,
    });
  },
});

/**
 * Server-side question timeout — no one buzzed in time.
 */
export const handleQuestionTimeout = internalMutation({
  args: {
    roomId: v.id("rooms"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    if (room.stateVersion !== args.expectedVersion) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    if (!state.questionActive) return;

    const questionIndex = state.questionIndex + 1;
    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        questionActive: false,
        buzzedPlayer: null,
        questionIndex,
        lastResult: { timeout: true },
      },
    });

    await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });
  },
});
