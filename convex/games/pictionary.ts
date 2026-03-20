import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getGameStateForRoom, getPlayersInRoom, findPlayer } from "../helpers";

/**
 * Player signals they are ready (starts the round timer and sets item).
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

    // Pick a random item from the items list (or use a default)
    const items = state.items ?? [];
    const currentItem = items.length > 0
      ? items[Math.floor(Math.random() * items.length)]
      : { title: "قطة", category: "حيوان" };

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentItem,
        roundStartTime: Date.now(),
        canvasStrokes: [],
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "round_active",
      stateVersion: room.stateVersion + 1,
    });

    // Schedule server-side timer
    await ctx.scheduler.runAfter(timeLimit * 1000, internal.games.pictionary.handleTimeout, {
      roomId: args.roomId,
      expectedVersion: room.stateVersion + 1,
    });
  },
});

/**
 * Server-side timeout handler (scheduled).
 */
export const handleTimeout = internalMutation({
  args: {
    roomId: v.id("rooms"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
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
        canvasStrokes: [],
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "playing",
      currentPlayer: nextPlayer,
      stateVersion: room.stateVersion + 1,
    });
  },
});

/**
 * Add a drawing stroke (only current player/drawer can draw).
 * Fix B2-CRITICAL-01: Check against stored currentPlayer, not DOM.
 */
export const addStroke = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    stroke: v.any(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.gameType !== "pictionary") return;
    if (room.currentPlayer !== args.playerName) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    const strokes = [...(state.canvasStrokes ?? []), args.stroke];

    await ctx.db.patch(gs._id, {
      state: { ...state, canvasStrokes: strokes },
    });
  },
});

/**
 * Undo last stroke (B2-MINOR-01 fix).
 */
export const undoStroke = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.gameType !== "pictionary") return;
    if (room.currentPlayer !== args.playerName) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    const strokes = [...(state.canvasStrokes ?? [])];
    strokes.pop();

    await ctx.db.patch(gs._id, {
      state: { ...state, canvasStrokes: strokes },
    });
  },
});

/**
 * Clear the canvas.
 */
export const clearCanvas = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.gameType !== "pictionary") return;
    if (room.currentPlayer !== args.playerName) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    // Fix B2-MAJOR-01: Clear strokes
    await ctx.db.patch(gs._id, {
      state: { ...state, canvasStrokes: [] },
    });

    // Update stateVersion so frontend receives the change
    await ctx.db.patch(args.roomId, {
      stateVersion: room.stateVersion + 1,
    });
  },
});

/**
 * Pass turn without scoring (drawer gives up).
 */
export const passTurn = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    // Accept both 'playing' and 'round_active' statuses
    if (room.status !== "round_active" && room.status !== "playing") return;
    if (room.currentPlayer !== args.playerName) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    const nextIndex = (state.playerIndex + 1) % state.playerOrder.length;
    const nextPlayer = state.playerOrder[nextIndex];
    const roundsPlayed = state.roundsPlayed + 1;

    if (roundsPlayed >= state.maxRounds) {
      await ctx.db.patch(args.roomId, { status: "ended", stateVersion: room.stateVersion + 1 });
      await ctx.db.patch(gs._id, {
        state: { ...state, roundsPlayed, currentItem: null, canvasStrokes: [] },
      });
      return { gameEnded: true };
    }

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentItem: null,
        canvasStrokes: [],
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
 * Correct guess for pictionary (same scoring as charades + canvas clear).
 */
export const guessCorrect = mutation({
  args: {
    roomId: v.id("rooms"),
    guesserName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    // Accept both 'playing' and 'round_active' statuses
    if (room.status !== "round_active" && room.status !== "playing") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;

    const elapsed = (Date.now() - (state.roundStartTime ?? Date.now())) / 1000;
    const timeLimit = state.timeLimit ?? 90;
    const points = Math.max(1, Math.ceil(10 * (1 - elapsed / timeLimit)));

    const performer = await findPlayer(ctx, args.roomId, room.currentPlayer!);
    const guesser = await findPlayer(ctx, args.roomId, args.guesserName);
    if (performer) await ctx.db.patch(performer._id, { score: performer.score + points });
    if (guesser) await ctx.db.patch(guesser._id, { score: guesser.score + points });

    const nextIndex = (state.playerIndex + 1) % state.playerOrder.length;
    const nextPlayer = state.playerOrder[nextIndex];
    const roundsPlayed = state.roundsPlayed + 1;

    if (roundsPlayed >= state.maxRounds) {
      await ctx.db.patch(args.roomId, { status: "ended", stateVersion: room.stateVersion + 1 });
      await ctx.db.patch(gs._id, {
        state: { ...state, roundsPlayed, currentItem: null, canvasStrokes: [] },
      });
      return { gameEnded: true };
    }

    // Fix B2-MAJOR-01: Clear canvasStrokes on new round
    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentItem: null,
        canvasStrokes: [],
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
