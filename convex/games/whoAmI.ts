/**
 * Who Am I? Game (من أنا؟) — Mouth-Based (وجهاً لوجه فقط)
 *
 * Each player gets a character visible to everyone except themselves.
 * Players ask yes/no questions verbally to figure out who they are.
 * "خمنت صح" button when a player guesses correctly.
 * 10 points per correct guess. Fewer rounds = bonus.
 */
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getGameStateForRoom, findPlayer, getPlayersInRoom } from "../helpers";

/**
 * Start a round — assign random characters to all players.
 * Characters come from the gameItems table (gameType: "who_am_i").
 */
export const startRound = mutation({
  args: {
    roomId: v.id("rooms"),
    characters: v.array(v.object({ name: v.string(), category: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const players = await getPlayersInRoom(ctx, args.roomId);
    const state = gs.state as any;

    // Randomly assign characters to players
    const shuffled = [...args.characters].sort(() => Math.random() - 0.5);
    const assignments: Record<string, string> = {};
    players.forEach((p, i) => {
      assignments[p.name] = shuffled[i % shuffled.length].name;
    });

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        assignments,
        guessedPlayers: [],
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "round_active",
      stateVersion: room.stateVersion + 1,
    });

    return { assignmentCount: Object.keys(assignments).length };
  },
});

/**
 * Player confirms they guessed their own character correctly (verbal).
 * Host or the player themselves can trigger this.
 */
export const guessedCorrectly = mutation({
  args: {
    roomId: v.id("rooms"),
    callerName: v.string(),
    guesserName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "round_active") return;

    // Only host or the guesser can confirm
    if (args.callerName !== room.host && args.callerName !== args.guesserName) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    if (state.guessedPlayers.includes(args.guesserName)) return;

    // Award 10 points
    const guesser = await findPlayer(ctx, args.roomId, args.guesserName);
    if (guesser) await ctx.db.patch(guesser._id, { score: guesser.score + 10 });

    const guessedPlayers = [...state.guessedPlayers, args.guesserName];
    const players = await getPlayersInRoom(ctx, args.roomId);

    await ctx.db.patch(gs._id, {
      state: { ...state, guessedPlayers },
    });

    await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });

    // Check if all players have guessed
    if (guessedPlayers.length >= players.length) {
      return { allGuessed: true, character: state.assignments[args.guesserName] };
    }

    return {
      allGuessed: false,
      character: state.assignments[args.guesserName],
      remaining: players.length - guessedPlayers.length,
    };
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

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        assignments: {},
        guessedPlayers: [],
        roundsPlayed,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "waiting",
      currentRound: roundsPlayed + 1,
      stateVersion: room.stateVersion + 1,
    });

    return { gameEnded: false };
  },
});
