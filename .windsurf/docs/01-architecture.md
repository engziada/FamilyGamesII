# Architecture Overview

> **Read this file first** before making any modifications to the codebase.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Backend (HTTP)** | Flask (Python) | Serves templates and static assets only — no game logic |
| **Real-time Backend** | Convex (TypeScript) | All game state, rooms, players, scoring, timers |
| **Frontend** | Vanilla JS + Bootstrap 5 | No framework — plain JS modules, jQuery-free |
| **Database** | Convex cloud DB | Schema in `convex/schema.ts` |
| **Content Storage** | Convex `gameItems` table | Seeded from JSON files via `contentSeeder.ts` |
| **Package Mgmt** | uv (Python), npm (JS/Convex) | |

## Directory Structure

```
FamilyGamesII/
├── app.py                  # Flask entry — routes only (/, /game/<room_id>, /api/catalog)
├── config.py               # Flask config (dev/prod)
├── convex/                 # ★ ALL game logic lives here
│   ├── schema.ts           # DB schema: rooms, players, gameState, gameItems, roomItemUsage, reactions
│   ├── helpers.ts          # Shared: GAME_TYPES, GAME_CATALOG, getPlayersInRoom, findPlayer, normalizeArabic
│   ├── rooms.ts            # Room CRUD: createRoom, joinRoom, leaveRoom, closeRoom, getRoomByCode
│   ├── gameState.ts        # Core: startGame, getPublicGameState, updateGameState, addScore
│   ├── contentSeeder.ts    # Seed gameItems from JSON data (idempotent)
│   ├── reactions.ts        # Emoji reactions (ephemeral)
│   ├── cleanup.ts          # TTL-based cleanup for stale data
│   ├── crons.ts            # Scheduled cleanup jobs
│   └── games/              # ★ Game-specific mutations — one file per game
│       ├── charades.ts
│       ├── pictionary.ts
│       ├── trivia.ts
│       ├── rapidFire.ts
│       ├── twentyQuestions.ts
│       ├── riddles.ts
│       ├── busComplete.ts
│       ├── whoAmI.ts
│       └── meenYazood.ts
├── templates/
│   ├── base.html           # Shared layout (Bootstrap, Convex SDK, common CSS/JS)
│   ├── index.html          # Home/lobby — game catalog grid + create/join modals
│   └── game.html           # Game page — common shell + dynamic renderer injection
├── static/
│   ├── css/style.css       # Single CSS file
│   ├── js/
│   │   ├── convexClient.js # Convex SDK wrapper (init, subscribe, mutate)
│   │   ├── lobby.js        # Index page logic (create/join room)
│   │   ├── gameController.js # ★ Main orchestrator — subscribes to state, delegates to renderers
│   │   ├── gameUI.js       # Common UI helpers (player list, scoreboard, toasts)
│   │   ├── timer.js        # Client-side countdown display
│   │   ├── sound.js        # Sound effects
│   │   ├── enhancements.js # Animations, confetti, avatars, haptics, clipboard
│   │   ├── reactions.js    # Floating emoji reactions
│   │   └── renderers/      # ★ Game-specific UI — one file per game
│   │       ├── charadesRenderer.js
│   │       ├── pictionaryRenderer.js
│   │       ├── triviaRenderer.js
│   │       ├── rapidFireRenderer.js
│   │       ├── twentyQRenderer.js
│   │       ├── riddlesRenderer.js
│   │       ├── busCompleteRenderer.js
│   │       ├── whoAmIRenderer.js
│   │       └── meenYazoodRenderer.js
│   ├── data/               # Static JSON content files (seeded into Convex)
│   │   ├── charades_items.json
│   │   ├── trivia_questions.json
│   │   ├── riddles.json
│   │   ├── twenty_questions_words.json
│   │   ├── who_am_i_characters.json
│   │   ├── bus_complete_dictionary.json
│   │   └── arabic_wordlist.txt
│   └── sounds/             # MP3 sound effects
├── data/
│   └── meen_yazood_questions.json  # Meen Yazood content (separate folder)
├── scripts/                # Node.js scripts for building/seeding content
│   ├── buildContent.mjs
│   ├── fetchTmdb.mjs
│   └── seedContent.mjs
└── tests/                  # Python tests (e2e + unit)
```

## Core Data Flow

```
User Browser ──► Flask (HTTP) ──► Serves HTML/JS/CSS
     │
     └──► Convex JS SDK (WebSocket) ──► Convex Cloud Backend
              │                              │
         subscribe()                    mutations/queries
         (real-time)                   (game logic + DB)
```

1. Flask **only** serves pages. Zero game logic in Python.
2. All real-time state flows through **Convex subscriptions** (WebSocket).
3. Game logic is **server-side in Convex** (mutations). Frontend calls mutations, renders state.
4. Timers are **server-side** via `ctx.scheduler.runAfter()` — not client-side.
5. State versioning (`stateVersion`) prevents stale updates and race conditions.

## DB Schema (Convex)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `rooms` | One per active game room | gameType, host, status, settings, currentPlayer, roomCode, stateVersion |
| `players` | One per player per room | roomId, name, isHost, score, avatar, connected, teamId |
| `gameState` | Per-room game blob | roomId, gameType, state (any — varies by game) |
| `gameItems` | Content pool (seeded) | gameType, category, itemData, contentHash, lastUsed, useCount |
| `roomItemUsage` | Anti-repetition tracker | roomId, itemId, usedAt |
| `reactions` | Ephemeral emoji reactions | roomId, playerName, emoji, createdAt |

## Room Statuses

All games share these room statuses (defined in `schema.ts`):

| Status | Meaning |
|--------|---------|
| `waiting` | Lobby — players joining, host can start |
| `playing` | Generic active state (charades, pictionary, who_am_i) |
| `preparing` | Performer sees item before round starts (charades) |
| `round_active` | Active round (trivia, rapid_fire, riddles, bus_complete, who_am_i) |
| `thinking` | Thinker choosing word (twenty_questions) |
| `asking` | Q&A phase (twenty_questions) |
| `buzzed` | Player buzzed in (rapid_fire) |
| `validating` | Peer validation phase (bus_complete, meen_yazood) |
| `scoring` | Score display phase (bus_complete, meen_yazood) |
| `bidding` | Bidding phase (meen_yazood) |
| `performing` | Team performing oral answers (meen_yazood) |
| `ended` | Game over — shows final scoreboard |

## Security Model

- **Secret filtering**: `filterStateForPlayer()` in `gameState.ts` hides answers/secrets per game type.
- **Host-only actions**: Room creation, game start, close room, skip, finalize validation.
- **Server-side timers**: All timeouts use Convex scheduler — no client-side cheating.
- **Anti-repetition**: `roomItemUsage` table + LRU sorting prevents repeated content.
- **State version guards**: Scheduled mutations check `expectedVersion` to avoid stale execution.

## Key Design Patterns

1. **Renderer pattern**: `gameController.js` delegates to `window.<gameType>Renderer.render(state, playerName, roomId)`.
2. **State blob**: Each game stores its own shape in `gameState.state` (any type).
3. **Auto-advance**: Server-scheduled mutations auto-advance rounds after timeouts/delays.
4. **Content pipeline**: JSON → `seedContent.mjs` → Convex `gameItems` table → fetched at runtime with LRU.
5. **Mouth-based flag**: Games marked `mouthBased: true` show a "face-to-face" banner and use oral Q&A.
