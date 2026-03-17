import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Clean up stale rooms (inactive for 2+ hours) — runs every hour.
 */
crons.interval("cleanup stale rooms", { hours: 1 }, internal.cleanup.cleanupStaleRooms);

/**
 * Clean up old reactions (>1 minute old) — runs every 5 minutes.
 */
crons.interval("cleanup old reactions", { minutes: 5 }, internal.cleanup.cleanupOldReactions);

export default crons;
