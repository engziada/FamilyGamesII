import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getGameStateForRoom, getPlayersInRoom, findPlayer } from "../helpers";

/**
 * Set the current item for the active player (called after startGame or nextRound).
 */
export const setCurrentItem = mutation({
  args: {
    roomId: v.id("rooms"),
    item: v.any(),
  },
  handler: async (ctx, args) => {
    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) throw new Error("حالة اللعبة غير موجودة");

    const state = gs.state as any;
    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentItem: args.item,
        roundStartTime: Date.now(),
      },
    });

    const room = await ctx.db.get(args.roomId);
    if (room) {
      await ctx.db.patch(args.roomId, {
        status: "playing",
        stateVersion: room.stateVersion + 1,
      });
    }
  },
});

/**
 * Player signals they are ready (starts the round timer).
 * Fix B1-CRITICAL-01: Timer is server-side via scheduler.runAfter().
 */
export const playerReady = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    if (room.currentPlayer !== args.playerName) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    const timeLimit = state.timeLimit ?? 90;

    await ctx.db.patch(gs._id, {
      state: { ...state, roundStartTime: Date.now() },
    });

    await ctx.db.patch(args.roomId, {
      status: "round_active",
      stateVersion: room.stateVersion + 1,
    });

    // Schedule server-side timer (B1-CRITICAL-01 fix)
    await ctx.scheduler.runAfter(timeLimit * 1000, internal.games.charades.handleTimeout, {
      roomId: args.roomId,
      expectedVersion: room.stateVersion + 1,
    });
  },
});

/**
 * Correct guess — both guesser and performer get points.
 */
export const guessCorrect = mutation({
  args: {
    roomId: v.id("rooms"),
    guesserName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "round_active") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;

    // Calculate score based on time
    const elapsed = (Date.now() - (state.roundStartTime ?? Date.now())) / 1000;
    const timeLimit = state.timeLimit ?? 90;
    const points = Math.max(1, Math.ceil(10 * (1 - elapsed / timeLimit)));

    // Award points to performer and guesser
    const performer = await findPlayer(ctx, args.roomId, room.currentPlayer!);
    const guesser = await findPlayer(ctx, args.roomId, args.guesserName);
    if (performer) await ctx.db.patch(performer._id, { score: performer.score + points });
    if (guesser) await ctx.db.patch(guesser._id, { score: guesser.score + points });

    // Advance to next round
    const nextIndex = (state.playerIndex + 1) % state.playerOrder.length;
    const nextPlayer = state.playerOrder[nextIndex];
    const roundsPlayed = state.roundsPlayed + 1;

    if (roundsPlayed >= state.maxRounds) {
      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 1,
      });
      await ctx.db.patch(gs._id, {
        state: { ...state, roundsPlayed, currentItem: null },
      });
      return { gameEnded: true };
    }

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentItem: null,
        playerIndex: nextIndex,
        roundsPlayed,
        roundStartTime: null,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "playing",
      currentPlayer: nextPlayer,
      currentRound: roundsPlayed + 1,
      stateVersion: room.stateVersion + 1,
    });

    return { gameEnded: false, nextPlayer };
  },
});

/**
 * Skip/pass the current turn.
 */
export const passTurn = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;

    // Only current player or host can pass
    if (args.playerName !== room.currentPlayer && args.playerName !== room.host) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    const nextIndex = (state.playerIndex + 1) % state.playerOrder.length;
    const nextPlayer = state.playerOrder[nextIndex];

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentItem: null,
        playerIndex: nextIndex,
        roundStartTime: null,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "playing",
      currentPlayer: nextPlayer,
      stateVersion: room.stateVersion + 1,
    });

    return { nextPlayer, skippedItem: state.currentItem };
  },
});

/**
 * Server-side timeout handler (scheduled).
 * Only fires if stateVersion hasn't changed (meaning the round is still active).
 */
export const handleTimeout = internalMutation({
  args: {
    roomId: v.id("rooms"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    // Stale timer — state has moved on
    if (room.stateVersion !== args.expectedVersion) return;
    if (room.status !== "round_active") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    const nextIndex = (state.playerIndex + 1) % state.playerOrder.length;
    const nextPlayer = state.playerOrder[nextIndex];

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentItem: null,
        playerIndex: nextIndex,
        roundStartTime: null,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "playing",
      currentPlayer: nextPlayer,
      stateVersion: room.stateVersion + 1,
    });
  },
});
