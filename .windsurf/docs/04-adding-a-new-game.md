# How to Add a New Game

Step-by-step guide for embedding a new game into the Family Games II platform. Follow every step — skipping any will break the integration.

---

## Checklist

- [ ] 1. Register the game type
- [ ] 2. Create the Convex backend module
- [ ] 3. Define initial state and state filtering
- [ ] 4. Create the frontend renderer
- [ ] 5. Register the renderer in gameController.js
- [ ] 6. Add the renderer script to game.html
- [ ] 7. Prepare game content data (if needed)
- [ ] 8. Add to GAME_CATALOG in app.py
- [ ] 9. Test end-to-end

---

## Step 1: Register the Game Type

### `convex/helpers.ts`

Add your game key to the `GAME_TYPES` array and `GAME_CATALOG` object:

```typescript
export const GAME_TYPES = [
  // ... existing games ...
  "my_new_game",   // ← add here
] as const;

export const GAME_CATALOG: Record<GameType, { title: string; icon: string; mouthBased: boolean; disabled?: boolean }> = {
  // ... existing games ...
  my_new_game: { title: "اسم اللعبة", icon: "fa-star", mouthBased: false },
};
```

**Fields:**
- `title`: Arabic display name.
- `icon`: FontAwesome 5 icon class (without `fa-` prefix is invalid — use full class like `fa-star`).
- `mouthBased`: `true` if the game requires players to be physically together (oral Q&A).
- `disabled`: Set to `true` to show "under maintenance" on the card.

### `convex/schema.ts`

Add your game's status values to the `rooms.status` union if it uses custom statuses beyond the existing ones. Existing statuses: `waiting`, `playing`, `preparing`, `round_active`, `thinking`, `asking`, `buzzed`, `validating`, `scoring`, `bidding`, `performing`, `ended`.

**Only add new status literals if your game needs a phase not already covered.**

---

## Step 2: Create the Convex Backend Module

Create `convex/games/myNewGame.ts`:

```typescript
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getGameStateForRoom, findPlayer, getPlayersInRoom } from "../helpers";

/**
 * Main game action — example: submit an answer.
 */
export const submitAnswer = mutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "round_active") return;

    const gs = await getGameStateForRoom(ctx, args.roomId);
    if (!gs) return;

    const state = gs.state as any;

    // Your game logic here...

    // Update state
    await ctx.db.patch(gs._id, { state: { ...state, /* updates */ } });
    await ctx.db.patch(args.roomId, { stateVersion: room.stateVersion + 1 });
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
    // CRITICAL: Stale guard — only fire if version matches
    if (room.stateVersion !== args.expectedVersion) return;

    // Timeout logic...
  },
});
```

**Key patterns to follow:**
- Always check `room.status` before acting.
- Always bump `stateVersion` after state changes.
- Use `ctx.scheduler.runAfter()` for timers — **never client-side**.
- Use `expectedVersion` on all scheduled mutations to prevent stale execution.
- Use `getGameStateForRoom()`, `findPlayer()`, `getPlayersInRoom()` from helpers.

---

## Step 3: Define Initial State and State Filtering

### `convex/gameState.ts` — `buildInitialState()`

Add a case in the `switch(gameType)` block:

```typescript
case "my_new_game":
  return {
    // Your initial state shape
    currentItem: null,
    roundsPlayed: 0,
    maxRounds: rounds,
    timeLimit,
    // ... game-specific fields
  };
```

### `convex/gameState.ts` — `getStartStatus()`

Add a case if your game doesn't start with `"playing"`:

```typescript
case "my_new_game":
  return "round_active"; // or whatever your first active status is
```

### `convex/gameState.ts` — `filterStateForPlayer()`

Add a case to hide secrets from players who shouldn't see them:

```typescript
case "my_new_game": {
  // Example: hide answer from all players
  if (state.currentAnswer) {
    const { currentAnswer, ...safe } = state;
    return safe;
  }
  return state;
}
```

**This is critical for security** — without filtering, players can inspect browser DevTools to see answers.

---

## Step 4: Create the Frontend Renderer

Create `static/js/renderers/myNewGameRenderer.js`:

```javascript
/**
 * My New Game Renderer
 * Renders game UI based on Convex state updates.
 */
const myNewGameRenderer = (() => {

  /**
   * Main render function — called by gameController on every state update.
   * @param {object} state - Public game state from Convex.
   * @param {string} playerName - Current player's name.
   * @param {string} roomId - Convex room ID.
   */
  function render(state, playerName, roomId) {
    const area = document.getElementById('game-area');
    const isHost = state.host === playerName;

    // Render based on status
    switch (state.status) {
      case 'waiting':
        renderWaiting(area, state, isHost);
        break;
      case 'round_active':
        renderActive(area, state, playerName, roomId);
        break;
      // ... other statuses
    }
  }

  function renderWaiting(area, state, isHost) {
    // Lobby UI — waiting for host to start
  }

  function renderActive(area, state, playerName, roomId) {
    // Active game UI
    // Call Convex mutations via: convex.mutate(api.games.myNewGame.submitAnswer, { ... })
  }

  // Expose the renderer
  window.myNewGameRenderer = { render };
  return { render };
})();
```

**Key patterns:**
- Renderer is an IIFE that exposes `{ render }` on `window.<gameType>Renderer`.
- `render(state, playerName, roomId)` is the only required method.
- Use `convex.mutate(api.games.myNewGame.actionName, { ... })` to call backend mutations.
- Use `gameUI.showToast(message, type)` for notifications.
- Use `timer.start(seconds, onTick, onDone)` for countdown display.
- Use `sound.play('guessed')` / `sound.play('timeout')` for audio feedback.

---

## Step 5: Register the Renderer in gameController.js

In `static/js/gameController.js`, add a case in `getRenderer()`:

```javascript
case 'my_new_game': return window.myNewGameRenderer || null;
```

---

## Step 6: Add the Renderer Script to game.html

In `templates/game.html`, add inside the `{% block scripts %}` conditional:

```html
{% elif game_type == 'my_new_game' %}
<script src="{{ url_for('static', filename='js/renderers/myNewGameRenderer.js') }}"></script>
```

---

## Step 7: Prepare Game Content Data (if needed)

If your game needs content (questions, words, characters, etc.):

1. **Create a JSON data file** in `static/data/my_new_game_items.json` (or `data/` for larger files).
2. **Seed into Convex** via `scripts/seedContent.mjs` — uses `contentSeeder.seedItems` mutation.
3. **Fetch at runtime** from `gameItems` table using the anti-repetition pattern:

```typescript
// In your game module:
const usedRecords = await ctx.db
  .query("roomItemUsage")
  .withIndex("by_room", (q) => q.eq("roomId", roomId))
  .collect();
const usedIds = new Set(usedRecords.map((r) => r.itemId));

const allItems = await ctx.db
  .query("gameItems")
  .withIndex("by_type_lastUsed", (q) => q.eq("gameType", "my_new_game"))
  .collect();

const candidates = allItems.filter((i) => !usedIds.has(i._id));
const pool = candidates.length > 0 ? candidates : allItems;
const topN = pool.slice(0, Math.min(10, pool.length));
const picked = topN[Math.floor(Math.random() * topN.length)];

// Record usage
await ctx.db.insert("roomItemUsage", { roomId, itemId: picked._id, usedAt: Date.now() });
await ctx.db.patch(picked._id, { lastUsed: Date.now(), useCount: (picked.useCount ?? 0) + 1 });
```

---

## Step 8: Add to GAME_CATALOG in app.py

In `app.py`, add to the `GAME_CATALOG` dict:

```python
GAME_CATALOG = {
    # ... existing games ...
    'my_new_game': {'title': 'اسم اللعبة', 'icon': 'fa-star', 'mouthBased': False},
}
```

This must **mirror** the entry in `convex/helpers.ts`.

---

## Step 9: Test End-to-End

1. Run `npx convex dev` to deploy Convex functions.
2. Run `python app.py` to start Flask.
3. Open two browser tabs → create a room → join from second tab.
4. Verify:
   - Game appears in catalog grid.
   - Room creation works.
   - Game starts with ≥2 players.
   - State updates render correctly for all players.
   - Secrets are hidden (check DevTools `window.__lastGameState`).
   - Timers fire server-side.
   - Scoring works correctly.
   - Game ends properly with scoreboard.
   - Host transfer works if host leaves.
   - Solo player triggers reset to waiting.

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Forgot to add to `GAME_TYPES` in `helpers.ts` | Room creation will throw "نوع اللعبة غير صالح" |
| Forgot `filterStateForPlayer` case | Answers visible in DevTools → cheating |
| Client-side timers | Use `ctx.scheduler.runAfter()` — always server-side |
| No `expectedVersion` on scheduled mutations | Stale timers fire after state has moved on |
| No `stateVersion` bump after state change | Subscriptions won't fire → UI won't update |
| Forgot renderer in `getRenderer()` | Game page shows blank after start |
| Forgot script tag in `game.html` | Renderer JS not loaded → blank game |
| Duplicate in `GAME_CATALOG` (app.py vs helpers.ts) | Keep both in sync — title, icon, mouthBased |

---

## File Modification Summary

| File | Action |
|------|--------|
| `convex/helpers.ts` | Add to `GAME_TYPES` + `GAME_CATALOG` |
| `convex/schema.ts` | Add new status literals (if any) |
| `convex/gameState.ts` | Add cases in `buildInitialState`, `getStartStatus`, `filterStateForPlayer` |
| `convex/games/myNewGame.ts` | **Create** — all game mutations |
| `static/js/renderers/myNewGameRenderer.js` | **Create** — frontend renderer |
| `static/js/gameController.js` | Add case in `getRenderer()` |
| `templates/game.html` | Add `{% elif %}` for renderer script |
| `app.py` | Add to `GAME_CATALOG` dict |
| `static/data/my_new_game_items.json` | **Create** (if game needs content) |
| `.windsurf/docs/03-game-workflows.md` | **Update** with new game's workflow |
