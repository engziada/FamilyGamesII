/**
 * Who Am I? Game (من أنا؟) — Mouth-Based (وجهاً لوجه فقط)
 *
 * Each player gets a character visible to everyone except themselves.
 * Players ask yes/no questions verbally to figure out who they are.
 * "خمنت صح" button when a player guesses correctly.
 * 10 points per correct guess. Fewer rounds = bonus.
 */
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getGameStateForRoom, findPlayer, getPlayersInRoom } from "../helpers";

/**
 * Start a round — assign random characters to all players.
 * Characters come from the gameItems table (gameType: "who_am_i").
 */
export const startRound = mutation({
  args: {
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const players = await getPlayersInRoom(ctx, args.roomId);
    const state = gs.state as any;

    // Fetch characters from gameItems with anti-repetition (LRU)
    const usedRecords = await ctx.db
      .query("roomItemUsage")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    const usedIds = new Set(usedRecords.map((r) => r.itemId));

    const allItems = await ctx.db
      .query("gameItems")
      .withIndex("by_type_lastUsed", (q) => q.eq("gameType", "who_am_i"))
      .collect();

    // Prefer items not yet used in this room
    const candidates = allItems.filter((i) => !usedIds.has(i._id));
    const pool = candidates.length >= players.length ? candidates : allItems;

    // Shuffle and pick enough for all players
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, players.length);

    // Build assignments: { playerName: { name, category, hint } }
    const assignments: Record<string, any> = {};
    players.forEach((p, i) => {
      const item = picked[i % picked.length];
      const data = item.itemData as any;
      assignments[p.name] = {
        name: data?.title || data?.name || "مجهول",
        category: item.category || "",
        hint: data?.hint || "",
      };

      // Record usage
      ctx.db.insert("roomItemUsage", {
        roomId: args.roomId,
        itemId: item._id,
        usedAt: Date.now(),
      });
      ctx.db.patch(item._id, {
        lastUsed: Date.now(),
        useCount: (item.useCount ?? 0) + 1,
      });
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
      const newVersion = room.stateVersion + 1;
      await ctx.db.patch(args.roomId, { stateVersion: newVersion });

      // Auto-advance to next round after 3s
      await ctx.scheduler.runAfter(3000, internal.games.whoAmI.autoAdvance, {
        roomId: args.roomId,
        expectedVersion: newVersion,
      });

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
 * Auto-advance: start a new round with fresh character assignments.
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
    const roundsPlayed = (state.roundsPlayed ?? 0) + 1;

    if (roundsPlayed >= (state.maxRounds ?? 10)) {
      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 1,
      });
      return;
    }

    // Clear assignments so renderer shows "start round" button for host
    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        assignments: {},
        guessedPlayers: [],
        roundsPlayed,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "playing",
      currentRound: roundsPlayed + 1,
      stateVersion: room.stateVersion + 1,
    });
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
