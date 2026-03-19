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
 * Generate a unique 4-digit room code.
 */
async function generateRoomCode(ctx: any): Promise<string> {
  // Generate random 4-digit code (1000-9999)
  let code: string;
  let attempts = 0;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
    // Check if code exists
    const existing = await ctx.db
      .query("rooms")
      .withIndex("by_roomCode", (q: any) => q.eq("roomCode", code))
      .first();
    if (!existing) return code;
    attempts++;
  } while (attempts < 10);
  // Fallback: use timestamp if collisions persist
  return Math.floor(1000 + (Date.now() % 9000)).toString();
}

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
      roomCode: await generateRoomCode(ctx),
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
    // Fix 1.2: Allow joining non-ended rooms (new players join as spectators)
    if (room.status === "ended") throw new Error("اللعبة انتهت");

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

    // Fix 1.3: When 1 player remains during active game, reset to waiting
    if (remaining.length === 1 && room.status !== "waiting") {
      const gs = await getGameStateForRoom(ctx, args.roomId);
      if (gs) await ctx.db.delete(gs._id);
      // Reset scores
      await ctx.db.patch(remaining[0]._id, { score: 0 });
    }

    // Transfer host if the leaving player was host
    const roomPatch: Record<string, any> = {
      stateVersion: room.stateVersion + 1,
    };
    if (args.playerName === room.host) {
      const newHost = remaining[0];
      await ctx.db.patch(newHost._id, { isHost: true });
      roomPatch.host = newHost.name;
    }

    // Fix 1.3: If only 1 player remains, revert to waiting
    if (remaining.length === 1 && room.status !== "waiting") {
      roomPatch.status = "waiting";
      roomPatch.currentPlayer = undefined;
      roomPatch.currentRound = 0;
    }

    // Fix 1.5: If the leaving player was the currentPlayer, advance turn
    if (
      remaining.length >= 2 &&
      room.currentPlayer === args.playerName &&
      room.status !== "waiting" &&
      room.status !== "ended"
    ) {
      const gs = await getGameStateForRoom(ctx, args.roomId);
      if (gs) {
        const state = gs.state as any;
        const oldOrder: string[] = state.playerOrder || [];
        const newOrder = oldOrder.filter((n: string) => n !== args.playerName);
        const currentIdx = oldOrder.indexOf(args.playerName);
        const nextPlayer = newOrder[currentIdx % newOrder.length] || newOrder[0];

        // Reset turn-specific state
        await ctx.db.patch(gs._id, {
          state: {
            ...state,
            playerOrder: newOrder,
            currentItem: null,
            canvasStrokes: state.canvasStrokes !== undefined ? [] : undefined,
            roundStartTime: null,
          },
        });
        roomPatch.currentPlayer = nextPlayer;
      }
    }

    await ctx.db.patch(args.roomId, roomPatch);

    return { roomClosed: false, playersRemaining: remaining.length };
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

    // Fix 1.6: Set status to "ended" first so all clients detect it
    await ctx.db.patch(args.roomId, {
      status: "ended",
      stateVersion: room.stateVersion + 1,
    });

    // Then clean up all data
    const players = await getPlayersInRoom(ctx, args.roomId);
    for (const p of players) await ctx.db.delete(p._id);

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (gs) await ctx.db.delete(gs._id);

    const usages = await ctx.db
      .query("roomItemUsage")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    for (const u of usages) await ctx.db.delete(u._id);

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
      // Fix 1.2: Allow joining any non-ended room
      joinAllowed: room.status !== "ended" && players.length < MAX_PLAYERS,
      joinBlockReason:
        room.status === "ended"
          ? "اللعبة انتهت"
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

/**
 * Get room by short code (for join by code feature).
 */
export const getRoomByCode = query({
  args: { roomCode: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", args.roomCode))
      .first();
    if (!room) return null;
    
    const players = await getPlayersInRoom(ctx, room._id);
    const meta = GAME_CATALOG[room.gameType as keyof typeof GAME_CATALOG];
    
    return {
      roomId: room._id,
      gameType: room.gameType,
      gameTitle: meta?.title ?? room.gameType,
      gameIcon: meta?.icon ?? "fa-gamepad",
      host: room.host,
      status: room.status,
      playersCount: players.length,
      roomCode: room.roomCode,
      // Fix 1.2: Allow joining any non-ended room
      joinAllowed: room.status !== "ended" && players.length < MAX_PLAYERS,
      joinBlockReason:
        room.status === "ended"
          ? "اللعبة انتهت"
          : players.length >= MAX_PLAYERS
            ? "غرفة اللعب ممتلئة"
            : "",
    };
  },
});
