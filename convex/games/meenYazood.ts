/**
 * Meen Yazood Game (مين يزود؟)
 *
 * Team-based bidding game where teams compete to name the most items
 * matching a category. Oral answers with peer validation.
 *
 * Flow: bidding → performing → validating → scoring → bidding (next round) → ended
 */
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getGameStateForRoom, getPlayersInRoom, findPlayer } from "../helpers";

// ─── Team Management ─────────────────────────────────────────────────

/**
 * Host creates teams (sets team count) and auto-joins team 1.
 */
export const createTeams = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    teamCount: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "waiting") return;
    if (room.host !== args.playerName) {
      throw new Error("المضيف فقط يمكنه إنشاء الفرق");
    }
    if (args.teamCount < 2 || args.teamCount > 4) {
      throw new Error("عدد الفرق يجب أن يكون بين 2 و 4");
    }

    // Store team count in room settings for frontend reference
    const settings = { ...(room.settings ?? {}), teamCount: args.teamCount };
    await ctx.db.patch(args.roomId, {
      settings: settings as any,
      stateVersion: room.stateVersion + 1,
    });

    // Auto-assign host to team 1
    const hostPlayer = await findPlayer(ctx, args.roomId, args.playerName);
    if (hostPlayer) {
      await ctx.db.patch(hostPlayer._id, { teamId: 1 });
    }

    // Reset all other players' team assignments
    const players = await getPlayersInRoom(ctx, args.roomId);
    for (const p of players) {
      if (p.name !== args.playerName && p.teamId) {
        await ctx.db.patch(p._id, { teamId: undefined as any });
      }
    }
  },
});

/**
 * Assign a player to a team (lobby phase).
 */
export const assignTeam = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    teamId: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "waiting") return;

    const player = await findPlayer(ctx, args.roomId, args.playerName);
    if (!player) return;

    const teamCount = (room.settings as any)?.teamCount ?? 2;
    if (args.teamId < 1 || args.teamId > teamCount) {
      throw new Error("رقم الفريق غير صالح");
    }

    await ctx.db.patch(player._id, { teamId: args.teamId });
    await ctx.db.patch(args.roomId, {
      stateVersion: room.stateVersion + 1,
    });
  },
});

/**
 * Auto-assign teams evenly before game start.
 */
async function autoAssignTeams(
  ctx: any,
  roomId: any,
  players: any[]
): Promise<void> {
  const unassigned = players.filter((p) => !p.teamId);
  let team1Count = players.filter((p) => p.teamId === 1).length;
  let team2Count = players.filter((p) => p.teamId === 2).length;

  for (const player of unassigned) {
    const assignTo = team1Count <= team2Count ? 1 : 2;
    await ctx.db.patch(player._id, { teamId: assignTo });
    if (assignTo === 1) {
      team1Count++;
    } else {
      team2Count++;
    }
  }
}

// ─── Bidding Phase ───────────────────────────────────────────────────

/**
 * Load a question and start the bidding phase.
 * Called after startGame or after scoring to begin next round.
 */
export const startBidding = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("الغرفة غير موجودة");
    if (room.host !== args.playerName) {
      throw new Error("المضيف فقط يمكنه بدء الجولة");
    }

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) throw new Error("حالة اللعبة غير موجودة");

    const state = gs.state as any;
    const players = await getPlayersInRoom(ctx, args.roomId);

    // Auto-assign teams if needed
    await autoAssignTeams(ctx, args.roomId, players);

    // Check we have at least 2 teams
    const refreshedPlayers = await getPlayersInRoom(ctx, args.roomId);
    const teamIds = new Set(refreshedPlayers.map((p) => p.teamId).filter(Boolean));
    if (teamIds.size < 2) {
      throw new Error("يجب أن يكون هناك فريقان على الأقل");
    }

    // Check max rounds
    if (state.currentRound >= state.maxRounds) {
      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 1,
      });
      return { gameEnded: true };
    }

    // Fetch next question from gameItems (anti-repetition)
    const question = await fetchNextQuestion(ctx, args.roomId, state.questionsUsed);
    if (!question) {
      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 1,
      });
      return { gameEnded: true };
    }

    const biddingTimeLimit = state.biddingTimeLimit ?? 35;
    const now = Date.now();

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        currentQuestion: question,
        biddingPhase: {
          active: true,
          startTime: now,
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
        lastResult: null,
        currentRound: state.currentRound + 1,
        questionsUsed: [...state.questionsUsed, question.id],
      },
    });

    const newVersion = room.stateVersion + 1;
    await ctx.db.patch(args.roomId, {
      status: "bidding",
      currentRound: state.currentRound + 1,
      stateVersion: newVersion,
    });

    // Schedule bidding timeout (use round number — stateVersion changes with each bid)
    await ctx.scheduler.runAfter(
      biddingTimeLimit * 1000,
      internal.games.meenYazood.handleBiddingTimeout,
      { roomId: args.roomId, expectedRound: state.currentRound + 1 }
    );

    return { gameEnded: false, question };
  },
});

/**
 * Submit a bid (must be higher than current highest).
 */
export const submitBid = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    bid: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "bidding") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    if (!state.biddingPhase?.active) return;

    // Validate bid range
    if (args.bid < 1 || args.bid > 50) {
      return { error: "المزايدة يجب أن تكون بين 1 و 50" };
    }

    // Must be higher than current highest
    if (args.bid <= state.biddingPhase.currentHighestBid) {
      return { error: `يجب أن تكون المزايدة أعلى من ${state.biddingPhase.currentHighestBid}` };
    }

    // Get player's team
    const player = await findPlayer(ctx, args.roomId, args.playerName);
    if (!player || !player.teamId) {
      return { error: "اللاعب غير مسجل في فريق" };
    }

    const bidEntry = {
      teamId: player.teamId,
      playerName: args.playerName,
      bid: args.bid,
      timestamp: Date.now(),
    };

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        biddingPhase: {
          ...state.biddingPhase,
          currentHighestBid: args.bid,
          leadingTeam: player.teamId,
          bidHistory: [...state.biddingPhase.bidHistory, bidEntry],
        },
      },
    });

    await ctx.db.patch(args.roomId, {
      stateVersion: room.stateVersion + 1,
    });

    return { success: true, bid: args.bid, teamId: player.teamId };
  },
});

/**
 * Server-side bidding timeout — transition to performance phase.
 */
export const handleBiddingTimeout = internalMutation({
  args: {
    roomId: v.id("rooms"),
    expectedRound: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    if (room.status !== "bidding") return;

    // Verify we're still on the same round (not stateVersion which changes per bid)
    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;
    const state = gs.state as any;
    if (state.currentRound !== args.expectedRound) return;

    // No bids placed — skip to next round
    if (!state.biddingPhase.leadingTeam || state.biddingPhase.currentHighestBid === 0) {
      await ctx.db.patch(gs._id, {
        state: {
          ...state,
          biddingPhase: { ...state.biddingPhase, active: false },
          lastResult: { skipped: true, reason: "لم يزايد أحد" },
        },
      });

      const newVersion = room.stateVersion + 1;
      await ctx.db.patch(args.roomId, {
        status: "scoring",
        stateVersion: newVersion,
      });

      // Auto-advance after 3s
      await ctx.scheduler.runAfter(3000, internal.games.meenYazood.autoAdvance, {
        roomId: args.roomId,
        expectedVersion: newVersion,
      });
      return;
    }

    // Transition to performance phase
    const requiredCount = state.biddingPhase.currentHighestBid;
    const duration = requiredCount * 3; // seconds
    const now = Date.now();

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        biddingPhase: { ...state.biddingPhase, active: false },
        performancePhase: {
          active: true,
          performingTeam: state.biddingPhase.leadingTeam,
          requiredCount,
          startTime: now,
          duration,
          stopped: false,
        },
      },
    });

    const newVersion = room.stateVersion + 1;
    await ctx.db.patch(args.roomId, {
      status: "performing",
      stateVersion: newVersion,
    });

    // Schedule performance timeout (max 150 seconds)
    const performTimeout = Math.min(duration, 150);
    await ctx.scheduler.runAfter(
      performTimeout * 1000,
      internal.games.meenYazood.handlePerformanceTimeout,
      { roomId: args.roomId, expectedVersion: newVersion }
    );
  },
});

// ─── Performance Phase ───────────────────────────────────────────────

/**
 * Performing team stops the timer (they finished naming items orally).
 */
export const stopTimer = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "performing") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    if (!state.performancePhase?.active) return;

    // Only performing team can stop
    const player = await findPlayer(ctx, args.roomId, args.playerName);
    if (!player || player.teamId !== state.performancePhase.performingTeam) {
      return { error: "فقط الفريق المؤدي يمكنه إيقاف المؤقت" };
    }

    // Transition to validation phase
    const validationTimeLimit = state.validationTimeLimit ?? 15;

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        performancePhase: {
          ...state.performancePhase,
          active: false,
          stopped: true,
        },
        validationPhase: {
          active: true,
          votes: {},
        },
      },
    });

    const newVersion = room.stateVersion + 1;
    await ctx.db.patch(args.roomId, {
      status: "validating",
      stateVersion: newVersion,
    });

    // Schedule validation timeout
    await ctx.scheduler.runAfter(
      validationTimeLimit * 1000,
      internal.games.meenYazood.handleValidationTimeout,
      { roomId: args.roomId, expectedVersion: newVersion }
    );
  },
});

/**
 * Server-side performance timeout — auto-transition to validation.
 */
export const handlePerformanceTimeout = internalMutation({
  args: {
    roomId: v.id("rooms"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    if (room.stateVersion !== args.expectedVersion) return;
    if (room.status !== "performing") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    const validationTimeLimit = state.validationTimeLimit ?? 15;

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        performancePhase: {
          ...state.performancePhase,
          active: false,
          stopped: false,
        },
        validationPhase: {
          active: true,
          votes: {},
        },
      },
    });

    const newVersion = room.stateVersion + 1;
    await ctx.db.patch(args.roomId, {
      status: "validating",
      stateVersion: newVersion,
    });

    // Schedule validation timeout
    await ctx.scheduler.runAfter(
      validationTimeLimit * 1000,
      internal.games.meenYazood.handleValidationTimeout,
      { roomId: args.roomId, expectedVersion: newVersion }
    );
  },
});

// ─── Validation Phase ────────────────────────────────────────────────

/**
 * Submit a validation vote (confirm/reject) — only non-performing teams.
 */
export const submitValidation = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    vote: v.string(), // "confirm" or "reject"
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "validating") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;
    if (!state.validationPhase?.active) return;

    if (args.vote !== "confirm" && args.vote !== "reject") {
      return { error: "تصويت غير صالح" };
    }

    // Only non-performing teams can vote
    const player = await findPlayer(ctx, args.roomId, args.playerName);
    if (!player) return;
    if (player.teamId === state.performancePhase.performingTeam) {
      return { error: "لا يمكنك التصويت لفريقك" };
    }

    // One vote per team (first voter from each team)
    const teamKey = String(player.teamId);
    if (state.validationPhase.votes[teamKey]) {
      return { error: "فريقك صوت بالفعل" };
    }

    const newVotes = {
      ...state.validationPhase.votes,
      [teamKey]: args.vote,
    };

    await ctx.db.patch(gs._id, {
      state: {
        ...state,
        validationPhase: {
          ...state.validationPhase,
          votes: newVotes,
        },
      },
    });

    await ctx.db.patch(args.roomId, {
      stateVersion: room.stateVersion + 1,
    });

    // Check if all non-performing teams have voted
    const players = await getPlayersInRoom(ctx, args.roomId);
    const allTeamIds = new Set(players.map((p) => p.teamId).filter(Boolean));
    allTeamIds.delete(state.performancePhase.performingTeam);
    const allVoted = [...allTeamIds].every((tid) => newVotes[String(tid)]);

    if (allVoted) {
      // All voted — calculate score immediately
      await calculateAndAdvance(ctx, args.roomId);
    }

    return { success: true };
  },
});

/**
 * Server-side validation timeout — auto-reject if no votes.
 */
export const handleValidationTimeout = internalMutation({
  args: {
    roomId: v.id("rooms"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    if (room.stateVersion !== args.expectedVersion) return;
    if (room.status !== "validating") return;

    await calculateAndAdvance(ctx, args.roomId);
  },
});

// ─── Scoring & Advancement ───────────────────────────────────────────

/**
 * Calculate votes, award points, and transition to scoring → next round.
 */
async function calculateAndAdvance(ctx: any, roomId: any): Promise<void> {
  const gs = await getGameStateForRoom(ctx, roomId);
  if (!gs) return;

  const room = await ctx.db.get(roomId);
  if (!room) return;

  const state = gs.state as any;
  const votes = state.validationPhase?.votes ?? {};
  const performingTeam = state.performancePhase?.performingTeam;

  // Count votes
  const confirmCount = Object.values(votes).filter((v) => v === "confirm").length;
  const rejectCount = Object.values(votes).filter((v) => v === "reject").length;

  // At least 1 confirm = success
  const confirmed = confirmCount >= 1;

  // Update team scores
  const teamScores = { ...state.teamScores };
  const players = await getPlayersInRoom(ctx, roomId);
  const allTeamIds = new Set(
    players.map((p: any) => p.teamId).filter(Boolean)
  );

  if (confirmed && performingTeam) {
    // Performing team scores 2 points
    const key = String(performingTeam);
    teamScores[key] = (teamScores[key] ?? 0) + 2;
  } else if (!confirmed) {
    // All other teams score 1 point each
    for (const tid of allTeamIds) {
      if (tid !== performingTeam) {
        const key = String(tid);
        teamScores[key] = (teamScores[key] ?? 0) + 1;
      }
    }
  }

  await ctx.db.patch(gs._id, {
    state: {
      ...state,
      validationPhase: { active: false, votes },
      teamScores,
      lastResult: {
        confirmed,
        performingTeam,
        requiredCount: state.performancePhase?.requiredCount ?? 0,
        confirmCount,
        rejectCount,
        question: state.currentQuestion?.question ?? "",
      },
    },
  });

  const newVersion = room.stateVersion + 1;
  await ctx.db.patch(roomId, {
    status: "scoring",
    stateVersion: newVersion,
  });

  // Auto-advance to next round after 4s
  await ctx.scheduler.runAfter(4000, internal.games.meenYazood.autoAdvance, {
    roomId,
    expectedVersion: newVersion,
  });
}

/**
 * Auto-advance: clear lastResult and wait for host to start next bidding round.
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

    // Check if game should end
    if (state.currentRound >= state.maxRounds) {
      await ctx.db.patch(args.roomId, {
        status: "ended",
        stateVersion: room.stateVersion + 1,
      });
      return;
    }

    // Reset to bidding-ready state (host needs to call startBidding)
    await ctx.db.patch(gs._id, {
      state: {
        ...state,
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
        lastResult: null,
      },
    });

    await ctx.db.patch(args.roomId, {
      status: "bidding",
      stateVersion: room.stateVersion + 1,
    });
  },
});

// ─── Host Actions ────────────────────────────────────────────────────

/**
 * Host ends the game manually.
 */
export const endGame = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;
    if (room.host !== args.playerName) return;

    await ctx.db.patch(args.roomId, {
      status: "ended",
      stateVersion: room.stateVersion + 1,
    });
  },
});

// ─── Helper: Fetch Next Question ─────────────────────────────────────

/**
 * Fetch next question from gameItems with anti-repetition.
 */
async function fetchNextQuestion(
  ctx: any,
  roomId: any,
  questionsUsed: string[]
): Promise<{ id: string; question: string; category: string } | null> {
  const usedRecords = await ctx.db
    .query("roomItemUsage")
    .withIndex("by_room", (q: any) => q.eq("roomId", roomId))
    .collect();
  const usedIds = new Set(usedRecords.map((r: any) => r.itemId));

  const allItems = await ctx.db
    .query("gameItems")
    .withIndex("by_type_lastUsed", (q: any) => q.eq("gameType", "meen_yazood"))
    .collect();

  // Filter out used items in this room
  const candidates = allItems.filter((i: any) => !usedIds.has(i._id));
  const pool = candidates.length > 0 ? candidates : allItems;
  const topN = pool.slice(0, Math.min(10, pool.length));
  const picked = topN[Math.floor(Math.random() * topN.length)];

  if (!picked) return null;

  const data = picked.itemData as any;
  const question = {
    id: picked._id,
    question: data.question || data.title || data.text || "",
    category: picked.category || data.category || "",
    difficulty: data.difficulty || "medium",
  };

  // Record usage
  await ctx.db.insert("roomItemUsage", {
    roomId,
    itemId: picked._id,
    usedAt: Date.now(),
  });
  await ctx.db.patch(picked._id, {
    lastUsed: Date.now(),
    useCount: (picked.useCount ?? 0) + 1,
  });

  return question;
}
