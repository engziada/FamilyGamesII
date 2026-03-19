/**
 * Bus Complete Game (أتوبيس كومبليت)
 *
 * Fix B7-CRITICAL-01: Atomic stopBus with status guard (no double score).
 * Fix B7-CRITICAL-02: AI validation via Convex action (non-blocking).
 * Fix B7-MAJOR-01: 3-second grace period after stop.
 * Fix B7-MINOR-01: Two separate ✓/✗ buttons for validation votes.
 */
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getGameStateForRoom, findPlayer, getPlayersInRoom } from "../helpers";

const ARABIC_LETTERS = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي".split("");

/**
 * Start a new round — pop next letter from shuffled pool (no repeats).
 */
export const startRound = mutation({
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
    const pool: string[] = state.letterPool ?? [];
    const usedLetters: string[] = state.usedLetters ?? [];

    // If pool is empty, game should end
    if (pool.length === 0) {
      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 1,
      });
      return { gameEnded: true };
    }

    // Pop next letter from the pre-shuffled pool
    const letter = pool[0];
    const remainingPool = pool.slice(1);

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentLetter: letter,
        letterPool: remainingPool,
        usedLetters: [...usedLetters, letter],
        submissions: {},
        validationState: {},
        validationVotes: {},
        stoppedBy: null,
        scoresCalculated: false,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "round_active",
      stateVersion: room.stateVersion + 1,
    });

    return { letter, remainingLetters: remainingPool.length };
  },
});

/**
 * Sync a player's current answers (called frequently via debounce).
 */
export const submitAnswers = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    answers: v.any(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "round_active") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        submissions: {
          ...state.submissions,
          [args.playerName]: args.answers,
        },
      },
    });
    // No stateVersion bump — silent sync to avoid UI flicker
  },
});

/**
 * Stop the bus — triggers grace period then validation.
 * Fix B7-CRITICAL-01: Atomic status guard prevents double stop.
 * Fix B7-MAJOR-01: 3-second grace period countdown.
 */
export const stopBus = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    answers: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;

    // B7-CRITICAL-01 fix: Atomic status guard
    if (room.status !== "round_active") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;

    // Save the stopper's latest answers
    const submissions = { ...state.submissions };
    if (args.answers) {
      submissions[args.playerName] = args.answers;
    }

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        submissions,
        stoppedBy: args.playerName,
      },
    });

    // Change status immediately to prevent double stop
    await ctx.db.patch(args.roomId, {
      status: "validating",
      stateVersion: room.stateVersion + 1,
    });

    // B7-MAJOR-01: Schedule validation after 3-second grace period
    await ctx.scheduler.runAfter(3000, internal.games.busComplete.beginValidation, {
      roomId: args.roomId,
    });

    return { stoppedBy: args.playerName };
  },
});

/**
 * Begin validation phase after grace period (internal).
 */
export const beginValidation = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "validating") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;

    // Build initial validation state: all answers marked as pending
    // Category keys are URI-encoded to avoid Convex field name restrictions
    const validationState: Record<string, string> = {};
    for (const [playerName, answers] of Object.entries(state.submissions)) {
      const playerAnswers = answers as Record<string, string>;
      for (const [encodedCategory, answer] of Object.entries(playerAnswers)) {
        if (answer && answer.trim()) {
          // Key format: playerName|encodedCategory
          const key = `${playerName}|${encodedCategory}`;
          validationState[key] = "pending";
        }
      }
    }

    await ctx.db.patch(gs._id, {
      state: { ...state, validationState },
    });

    await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });
  },
});

/**
 * Submit a validation vote (✓ or ✗).
 * Fix B7-MINOR-01: Separate valid/invalid buttons.
 */
export const submitValidationVote = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    answerKey: v.string(),
    isValid: v.boolean(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "validating") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    const votes = { ...state.validationVotes };
    if (!votes[args.answerKey]) votes[args.answerKey] = {};
    votes[args.answerKey][args.playerName] = args.isValid;

    // Determine consensus
    const players = await getPlayersInRoom(ctx, args.roomId);
    const totalVoters = players.length;
    const answerVotes = votes[args.answerKey];
    const voteCount = Object.keys(answerVotes).length;

    let status = "pending";
    if (voteCount >= Math.ceil(totalVoters / 2)) {
      const validVotes = Object.values(answerVotes).filter((v) => v === true).length;
      status = validVotes > voteCount / 2 ? "valid" : "invalid";
    }

    const validationState = { ...state.validationState };
    validationState[args.answerKey] = status;

    await ctx.db.patch(gs._id, {
      state: { ...state, validationVotes: votes, validationState },
    });

    await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });

    return { answerKey: args.answerKey, status };
  },
});

/**
 * Host finalizes validation and triggers score calculation.
 * Fix B7-CRITICAL-01: scoresCalculated guard prevents double scoring.
 */
export const finalizeValidation = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.host !== args.playerName) return;
    if (room.status !== "validating") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    if (state.scoresCalculated) return;

    // Calculate scores
    const players = await getPlayersInRoom(ctx, args.roomId);
    const playerScoreDeltas: Record<string, number> = {};

    for (const [key, status] of Object.entries(state.validationState)) {
      if (status !== "valid") continue;
      // Key format: playerName|encodedCategory
      const [playerName, encodedCategory] = (key as string).split("|");
      const answer = (state.submissions[playerName] as any)?.[encodedCategory];
      if (!answer) continue;

      // Check for unique answers (10 pts) vs duplicate (5 pts)
      let isUnique = true;
      for (const [otherPlayer, otherAnswers] of Object.entries(state.submissions)) {
        if (otherPlayer === playerName) continue;
        const otherAnswer = (otherAnswers as any)?.[encodedCategory];
        if (otherAnswer && otherAnswer.trim().toLowerCase() === answer.trim().toLowerCase()) {
          isUnique = false;
          break;
        }
      }

      playerScoreDeltas[playerName] = (playerScoreDeltas[playerName] ?? 0) + (isUnique ? 10 : 5);
    }

    // Apply scores
    for (const p of players) {
      const delta = playerScoreDeltas[p.name] ?? 0;
      if (delta > 0) {
        await ctx.db.patch(p._id, { score: p.score + delta });
      }
    }

    await ctx.db.patch(gs._id, {
      state: { ...state, scoresCalculated: true },
    });

    await ctx.db.patch(args.roomId, {
      status: "scoring",
      stateVersion: room.stateVersion + 1,
    });

    return { scores: playerScoreDeltas };
  },
});

/**
 * Move to next round (host confirms scores).
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
    const pool: string[] = state.letterPool ?? [];

    // End game if max rounds reached OR letter pool exhausted
    if (roundsPlayed >= state.maxRounds || pool.length === 0) {
      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 1,
      });
      return { gameEnded: true };
    }

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentLetter: null,
        submissions: {},
        validationState: {},
        validationVotes: {},
        stoppedBy: null,
        scoresCalculated: false,
        roundsPlayed,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "waiting",
      currentRound: roundsPlayed + 1,
      stateVersion: room.stateVersion + 1,
    });

    return { gameEnded: false, remainingLetters: pool.length };
  },
});
