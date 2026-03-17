import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getGameStateForRoom, findPlayer } from "../helpers";

/**
 * Load a question into the game state.
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
        playersAnswered: [],
        playersAnsweredWrong: [],
        questionActive: true,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "round_active",
      stateVersion: room.stateVersion + 1,
    });

    // Server-side question timer
    await ctx.scheduler.runAfter(timeLimit * 1000, internal.games.trivia.handleQuestionTimeout, {
      roomId: args.roomId,
      expectedVersion: room.stateVersion + 1,
    });
  },
});

/**
 * Submit an answer to the current trivia question.
 * Fix B3-CRITICAL-01: Answer index never exposed in public state.
 * Fix B3-MINOR-01: Visual feedback via return value.
 */
export const submitAnswer = mutation({
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
    if (!state.questionActive) return;
    if (state.playersAnswered.includes(args.playerName)) return;

    const correct = args.answerIdx === state.currentQuestion?.answer;

    if (correct) {
      // Award points
      const player = await findPlayer(ctx, args.roomId, args.playerName);
      if (player) await ctx.db.patch(player._id, { score: player.score + 10 });

      // Disable question
      const questionIndex = state.questionIndex + 1;
      await ctx.db.patch(gs._id, {
        state: {
          ...state,
          questionActive: false,
          playersAnswered: [...state.playersAnswered, args.playerName],
          questionIndex,
          lastResult: {
            player: args.playerName,
            correct: true,
            correctAnswer: state.currentQuestion.options[state.currentQuestion.answer],
          },
        },
      });

      await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });
      return { correct: true };
    }

    // Wrong answer
    const wrongPlayers = [...state.playersAnsweredWrong, args.playerName];
    const allPlayers = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    const totalPlayers = allPlayers.length;

    if (wrongPlayers.length >= totalPlayers) {
      // All players answered wrong — advance
      const questionIndex = state.questionIndex + 1;
      await ctx.db.patch(gs._id, {
        state: {
          ...state,
          questionActive: false,
          playersAnsweredWrong: wrongPlayers,
          questionIndex,
          lastResult: { player: args.playerName, correct: false, allWrong: true },
        },
      });
      await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });
    } else {
      await ctx.db.patch(gs._id, {
        state: {
          ...state,
          playersAnsweredWrong: wrongPlayers,
          playersAnswered: [...state.playersAnswered, args.playerName],
        },
      });
      await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });
    }

    return { correct: false };
  },
});

/**
 * Server-side question timeout.
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
        questionIndex,
        lastResult: { timeout: true },
      },
    });

    await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });
  },
});
