import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  GAME_CATALOG,
  GAME_TYPES,
  MAX_PLAYERS,
  getPlayersInRoom,
  findPlayer,
  getGameStateForRoom,
} from "./helpers";

/**
 * Create a new game room. Returns the room ID (Convex-generated, no collision).
 */
export const createRoom = mutation({
  args: {
    gameType: v.string(),
    hostName: v.string(),
    settings: v.optional(
      v.object({
        rounds: v.optional(v.number()),
        time_limit: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (!GAME_TYPES.includes(args.gameType as any)) {
      throw new Error("نوع اللعبة غير صالح");
    }
    if (!args.hostName.trim()) {
      throw new Error("اسم اللاعب مطلوب");
    }

    const roomId = await ctx.db.insert("rooms", {
      gameType: args.gameType,
      host: args.hostName,
      status: "waiting",
      settings: args.settings ?? {},
      currentPlayer: undefined,
      currentRound: 0,
      stateVersion: 0,
    });

    await ctx.db.insert("players", {
      roomId,
      name: args.hostName,
      isHost: true,
      score: 0,
      avatar: undefined,
      connected: true,
    });

    return roomId;
  },
});

/**
 * Join an existing room.
 */
export const joinRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("الغرفة غير موجودة");
    if (room.status !== "waiting") throw new Error("اللعبة بدأت بالفعل");

    const players = await getPlayersInRoom(ctx, args.roomId);
    if (players.length >= MAX_PLAYERS) throw new Error("غرفة اللعب ممتلئة");
    if (players.some((p) => p.name === args.playerName)) {
      throw new Error("اللاعب موجود بالفعل");
    }

    await ctx.db.insert("players", {
      roomId: args.roomId,
      name: args.playerName,
      isHost: false,
      score: 0,
      avatar: undefined,
      connected: true,
    });

    await ctx.db.patch(args.roomId, {
      stateVersion: room.stateVersion + 1,
    });
  },
});

/**
 * Leave a room. Handles host transfer and room cleanup.
 */
export const leaveRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;

    const player = await findPlayer(ctx, args.roomId, args.playerName);
    if (!player) return;

    await ctx.db.delete(player._id);

    const remaining = await getPlayersInRoom(ctx, args.roomId);

    if (remaining.length === 0) {
      // No players left — delete room and associated data
      const gs = await getGameStateForRoom(ctx, args.roomId);
      if (gs) await ctx.db.delete(gs._id);
      // Clean up room item usage
      const usages = await ctx.db
        .query("roomItemUsage")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
        .collect();
      for (const u of usages) await ctx.db.delete(u._id);
      await ctx.db.delete(args.roomId);
      return { roomClosed: true, reason: "no_players" };
    }

    if (remaining.length === 1) {
      // Only 1 player left — close room
      const gs = await getGameStateForRoom(ctx, args.roomId);
      if (gs) await ctx.db.delete(gs._id);
      const usages = await ctx.db
        .query("roomItemUsage")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
        .collect();
      for (const u of usages) await ctx.db.delete(u._id);
      // Delete remaining player and room
      await ctx.db.delete(remaining[0]._id);
      await ctx.db.delete(args.roomId);
      return { roomClosed: true, reason: "last_player_left" };
    }

    // Transfer host if the leaving player was host
    if (args.playerName === room.host) {
      const newHost = remaining[0];
      await ctx.db.patch(newHost._id, { isHost: true });
      await ctx.db.patch(args.roomId, {
        host: newHost.name,
        stateVersion: room.stateVersion + 1,
      });
    } else {
      await ctx.db.patch(args.roomId, {
        stateVersion: room.stateVersion + 1,
      });
    }

    return { roomClosed: false };
  },
});

/**
 * Close a room (host action).
 */
export const closeRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("الغرفة غير موجودة");
    if (room.host !== args.playerName) {
      throw new Error("المضيف فقط يمكنه إغلاق الغرفة");
    }

    // Delete all players
    const players = await getPlayersInRoom(ctx, args.roomId);
    for (const p of players) await ctx.db.delete(p._id);

    // Delete game state
    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (gs) await ctx.db.delete(gs._id);

    // Delete room item usage
    const usages = await ctx.db
      .query("roomItemUsage")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    for (const u of usages) await ctx.db.delete(u._id);

    // Delete room
    await ctx.db.delete(args.roomId);
  },
});

/**
 * Set player avatar.
 */
export const setAvatar = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    avatar: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await findPlayer(ctx, args.roomId, args.playerName);
    if (!player) throw new Error("اللاعب غير موجود");
    await ctx.db.patch(player._id, { avatar: args.avatar });
  },
});

/**
 * Get room preview (for join modal).
 */
export const getRoomPreview = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return null;

    const players = await getPlayersInRoom(ctx, args.roomId);
    const meta = GAME_CATALOG[room.gameType as keyof typeof GAME_CATALOG];

    return {
      _id: room._id,
      gameType: room.gameType,
      gameTitle: meta?.title ?? room.gameType,
      gameIcon: meta?.icon ?? "fa-gamepad",
      mouthBased: meta?.mouthBased ?? false,
      host: room.host,
      status: room.status,
      playersCount: players.length,
      players: players.map((p) => ({
        name: p.name,
        isHost: p.isHost,
        avatar: p.avatar,
      })),
      joinAllowed: room.status === "waiting" && players.length < MAX_PLAYERS,
      joinBlockReason:
        room.status !== "waiting"
          ? "اللعبة بدأت بالفعل"
          : players.length >= MAX_PLAYERS
            ? "غرفة اللعب ممتلئة"
            : "",
    };
  },
});

/**
 * Get full room data (for game page).
 */
export const getRoom = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return null;

    const players = await getPlayersInRoom(ctx, args.roomId);
    const meta = GAME_CATALOG[room.gameType as keyof typeof GAME_CATALOG];

    return {
      ...room,
      gameTitle: meta?.title ?? room.gameType,
      gameIcon: meta?.icon ?? "fa-gamepad",
      mouthBased: meta?.mouthBased ?? false,
      players: players.map((p) => ({
        _id: p._id,
        name: p.name,
        isHost: p.isHost,
        score: p.score,
        avatar: p.avatar,
        connected: p.connected,
      })),
    };
  },
});

/**
 * Get game catalog (all game types with metadata).
 */
export const getGameCatalog = query({
  args: {},
  handler: async () => {
    return GAME_CATALOG;
  },
});
