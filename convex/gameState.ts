import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getPlayersInRoom,
  findPlayer,
  getGameStateForRoom,
} from "./helpers";

/**
 * Initialize game state when host starts the game.
 */
export const startGame = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("الغرفة غير موجودة");
    if (room.host !== args.playerName) {
      throw new Error("المضيف فقط يمكنه بدء اللعبة");
    }
    if (room.status !== "waiting") {
      throw new Error("اللعبة بدأت بالفعل");
    }

    const players = await getPlayersInRoom(ctx, args.roomId);
    if (players.length < 2) {
      throw new Error("يجب أن يكون هناك لاعبان على الأقل");
    }

    // Set first player
    const firstPlayer = players[0].name;

    // Build initial game state based on type
    const initialState = buildInitialState(room.gameType, players, room.settings);

    // Defensive: delete any leftover game state from a previous game in this room
    const existingStates = await ctx.db
      .query("gameState")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    for (const gs of existingStates) {
      await ctx.db.delete(gs._id);
    }

    // Insert game state
    await ctx.db.insert("gameState", {
      roomId: args.roomId,
      gameType: room.gameType,
      state: initialState,
    });

    // Update room status
    const startStatus = getStartStatus(room.gameType);
    await ctx.db.patch(args.roomId, {
      status: startStatus,
      currentPlayer: firstPlayer,
      currentRound: 1,
      stateVersion: room.stateVersion + 1,
    });

    return { firstPlayer, gameType: room.gameType };
  },
});

/**
 * Get public game state (hides answers/secrets from non-authorized players).
 */
export const getPublicGameState = query({
  args: {
    roomId: v.id("rooms"),
    playerName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return null;

    const players = await getPlayersInRoom(ctx, args.roomId);

    // Get game state if exists (null during waiting phase)
    const gs = await getGameStateForRoom(ctx, args.roomId);

    // Build public state (filter secrets per game type)
    const publicState = gs
      ? filterStateForPlayer(room.gameType, gs.state, args.playerName ?? "", room)
      : null;

    return {
      roomId: args.roomId,
      roomCode: room.roomCode ?? null,
      gameType: room.gameType,
      status: room.status,
      currentPlayer: room.currentPlayer,
      currentRound: room.currentRound,
      stateVersion: room.stateVersion,
      host: room.host,
      settings: room.settings,
      players: players.map((p) => ({
        name: p.name,
        isHost: p.isHost,
        score: p.score,
        avatar: p.avatar,
        connected: p.connected,
        teamId: p.teamId,
      })),
      state: publicState,
    };
  },
});

/**
 * Generic state update mutation (used by game-specific logic).
 */
export const updateGameState = mutation({
  args: {
    roomId: v.id("rooms"),
    state: v.any(),
    roomPatch: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) throw new Error("حالة اللعبة غير موجودة");

    await ctx.db.patch(gs._id, { state: args.state });

    const room = await ctx.db.get(args.roomId);
    if (!room) return;

    const patch: Record<string, any> = {
      stateVersion: room.stateVersion + 1,
      ...(args.roomPatch ?? {}),
    };
    await ctx.db.patch(args.roomId, patch);
  },
});

/**
 * Add score to a player.
 */
export const addScore = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    points: v.number(),
  },
  handler: async (ctx, args) => {
    const player = await findPlayer(ctx, args.roomId, args.playerName);
    if (!player) return;
    await ctx.db.patch(player._id, { score: player.score + args.points });

    const room = await ctx.db.get(args.roomId);
    if (room) {
      await ctx.db.patch(args.roomId, {
        stateVersion: room.stateVersion + 1,
      });
    }
  },
});

// ─── Helper functions ───────────────────────────────────────────────

type RoomStatus = "waiting" | "playing" | "preparing" | "round_active" | "thinking" | "asking" | "buzzed" | "validating" | "scoring" | "bidding" | "performing" | "ended";

function getStartStatus(gameType: string): RoomStatus {
  switch (gameType) {
    case "twenty_questions":
      return "thinking";
    case "bus_complete":
      return "round_active";
    case "trivia":
    case "rapid_fire":
    case "riddles":
      return "round_active";
    case "meen_yazood":
      return "bidding";
    default:
      return "playing";
  }
}

function buildInitialState(
  gameType: string,
  players: { name: string }[],
  settings: any
): Record<string, any> {
  const playerNames = players.map((p) => p.name);
  const timeLimit = settings?.time_limit ?? 60;
  const rounds = settings?.rounds ?? 10;

  switch (gameType) {
    case "charades":
    case "pictionary":
      return {
        currentItem: null,
        items: [],
        playerIndex: 0,
        playerOrder: playerNames,
        roundsPlayed: 0,
        maxRounds: rounds,
        roundStartTime: null,
        timeLimit,
        canvasStrokes: gameType === "pictionary" ? [] : undefined,
      };

    case "trivia":
      return {
        currentQuestion: null,
        questions: [],
        questionIndex: 0,
        maxQuestions: rounds,
        playersAnswered: [],
        playersAnsweredWrong: [],
        questionActive: false,
        timeLimit,
      };

    case "rapid_fire":
      return {
        currentQuestion: null,
        questions: [],
        questionIndex: 0,
        maxQuestions: rounds,
        buzzedPlayer: null,
        buzzFailed: [],
        questionActive: false,
        timeLimit,
      };

    case "twenty_questions":
      return {
        thinker: playerNames[0],
        secretWord: null,
        secretCategory: null,
        questionCount: 0,
        maxQuestions: 20,
        answerHistory: [],
        playerOrder: playerNames,
        thinkerIndex: 0,
        roundsPlayed: 0,
        maxRounds: rounds,
        timeLimit,
      };

    case "riddles":
      return {
        currentRiddle: null,
        riddles: [],
        riddleIndex: 0,
        maxRiddles: rounds,
        playersAnswered: {},
        hintsRevealed: 0,
        hintRequestedBy: [],
        timeLimit,
      };

    case "bus_complete": {
      // Shuffle Arabic alphabet for per-session letter pool (no repeats)
      const arabicLetters = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي".split("");
      for (let i = arabicLetters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arabicLetters[i], arabicLetters[j]] = [arabicLetters[j], arabicLetters[i]];
      }
      return {
        categories: ["اسم", "حيوان", "نبات", "جماد", "بلاد", "مهنة", "فاكهة"],
        currentLetter: null,
        letterPool: arabicLetters,
        usedLetters: [] as string[],
        submissions: {},
        validationState: {},
        validationVotes: {},
        stoppedBy: null,
        roundsPlayed: 0,
        maxRounds: Math.min(rounds, arabicLetters.length),
        scoresCalculated: false,
        timeLimit,
      };
    }

    case "who_am_i":
      return {
        assignments: {},
        guessedPlayers: [],
        playerOrder: playerNames,
        roundsPlayed: 0,
        maxRounds: rounds,
        timeLimit,
      };

    case "meen_yazood":
      return {
        currentQuestion: null,
        biddingPhase: {
          active: false,
          startTime: null,
          currentHighestBid: 0,
          leadingTeam: null,
          bidHistory: [],
        },
        performancePhase: {
          active: false,
          performingTeam: null,
          requiredCount: 0,
          startTime: null,
          duration: 0,
          stopped: false,
        },
        validationPhase: {
          active: false,
          votes: {},
        },
        teamScores: {},
        questionsUsed: [],
        currentRound: 0,
        maxRounds: Math.min(rounds, 30),
        lastResult: null,
        biddingTimeLimit: 35,
        validationTimeLimit: 15,
      };

    default:
      return {};
  }
}

/**
 * Filter game state to hide secrets from the requesting player.
 */
function filterStateForPlayer(
  gameType: string,
  state: any,
  playerName: string,
  room: any
): any {
  if (!state) return state;

  switch (gameType) {
    case "charades":
    case "pictionary": {
      // Hide currentItem from non-current players
      if (room.currentPlayer !== playerName) {
        return { ...state, currentItem: null };
      }
      return state;
    }

    case "trivia":
    case "rapid_fire": {
      // Never expose correct answer index in public state (B3-CRITICAL-01 fix)
      if (state.currentQuestion) {
        const { answer, ...safeQuestion } = state.currentQuestion;
        return { ...state, currentQuestion: safeQuestion };
      }
      return state;
    }

    case "twenty_questions": {
      // Hide secret word from non-thinker
      if (playerName !== state.thinker) {
        return { ...state, secretWord: null };
      }
      return state;
    }

    case "riddles": {
      // Hide riddle answer
      if (state.currentRiddle) {
        const { answer, accepted_answers, ...safeRiddle } = state.currentRiddle;
        return { ...state, currentRiddle: safeRiddle };
      }
      return state;
    }

    case "who_am_i": {
      // Each player sees everyone's character EXCEPT their own
      if (state.assignments) {
        const filtered: Record<string, any> = {};
        for (const [name, character] of Object.entries(state.assignments)) {
          filtered[name] = name === playerName ? null : character;
        }
        return { ...state, assignments: filtered };
      }
      return state;
    }

    case "meen_yazood":
      // No secrets to hide — all state is public (oral game)
      return state;

    default:
      return state;
  }
}
