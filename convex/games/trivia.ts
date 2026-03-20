import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getGameStateForRoom, findPlayer, getPlayersInRoom } from "../helpers";

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

      const newVersion = room.stateVersion + 1;
      await ctx.db.patch(args.roomId, { stateVersion: newVersion });

      // Auto-advance after 3s
      await ctx.scheduler.runAfter(3000, internal.games.trivia.autoAdvance, {
        roomId: args.roomId,
        expectedVersion: newVersion,
      });
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
      const newVersion = room.stateVersion + 1;
      await ctx.db.patch(args.roomId, { stateVersion: newVersion });

      // Auto-advance after 3s
      await ctx.scheduler.runAfter(3000, internal.games.trivia.autoAdvance, {
        roomId: args.roomId,
        expectedVersion: newVersion,
      });
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

    const newVersion = room.stateVersion + 1;
    await ctx.db.patch(args.roomId, { stateVersion: newVersion });

    // Auto-advance after 3s
    await ctx.scheduler.runAfter(3000, internal.games.trivia.autoAdvance, {
      roomId: args.roomId,
      expectedVersion: newVersion,
    });
  },
});

/**
 * Auto-advance: clear lastResult + load next question from gameItems.
 */
export const autoAdvance = internalMutation({
  args: {
    roomId: v.id("rooms"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    if (room.stateVersion !== args.expectedVersion) return;
    if (room.status === "ended") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    const questionIndex = state.questionIndex ?? 0;
    const maxQuestions = state.maxQuestions ?? 10;

    // End game if we've reached max questions
    if (questionIndex >= maxQuestions) {
      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 1,
      });
      return;
    }

    // Fetch next question from gameItems (anti-repetition via LRU)
    const usedRecords = await ctx.db
      .query("roomItemUsage")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    const usedIds = new Set(usedRecords.map((r) => r.itemId));

    const allItems = await ctx.db
      .query("gameItems")
      .withIndex("by_type_lastUsed", (q) => q.eq("gameType", "trivia"))
      .collect();

    // Filter out Islamic categories and already-used items
    const excludedCategories = new Set(["العقيدة", "الحديث", "الفقه", "اللغة العربية", "إسلاميات"]);
    const candidates = allItems.filter((i) => !usedIds.has(i._id) && !excludedCategories.has(i.category));
    const pool = candidates.length > 0 ? candidates : allItems;
    const topN = pool.slice(0, Math.min(10, pool.length));
    const picked = topN[Math.floor(Math.random() * topN.length)];

    if (!picked) {
      // No content available — end game
      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 1,
      });
      return;
    }

    // Build question object from itemData
    const data = picked.itemData as any;
    const question = {
      question: data.title || data.question || data.text || "سؤال",
      options: data.options || [],
      answer: data.answer ?? 0,
      category: picked.category || "",
    };

    // Record usage
    await ctx.db.insert("roomItemUsage", {
      roomId: args.roomId,
      itemId: picked._id,
      usedAt: Date.now(),
    });
    await ctx.db.patch(picked._id, {
      lastUsed: Date.now(),
      useCount: (picked.useCount ?? 0) + 1,
    });

    const timeLimit = state.timeLimit ?? 30;

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentQuestion: question,
        playersAnswered: [],
        playersAnsweredWrong: [],
        questionActive: true,
        lastResult: null,
      },
    });

    const newVersion = room.stateVersion + 1;
    await ctx.db.patch(args.roomId, {
      status: "round_active",
      stateVersion: newVersion,
    });

    // Schedule question timeout
    await ctx.scheduler.runAfter(timeLimit * 1000, internal.games.trivia.handleQuestionTimeout, {
      roomId: args.roomId,
      expectedVersion: newVersion,
    });
  },
});
