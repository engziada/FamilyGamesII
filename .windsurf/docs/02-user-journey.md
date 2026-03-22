# User Journey

## Overview

Family Games II (ألعاب العيلة) is an Arabic-language multiplayer party game platform. Players gather on the same WiFi or share room codes/links to play together in real-time.

## Journey Flow

```
Home Page (/)
    │
    ├─► Create Game ──► Choose game type ──► Enter name + avatar ──► Room created ──► /game/<roomId>
    │
    └─► Join Game ──► Enter 4-digit code OR paste link ──► Preview room ──► Enter name + avatar ──► /game/<roomId>
                                                                                                        │
                                                                                          ┌─────────────┴──────────────┐
                                                                                     Waiting/Lobby              Game Active
                                                                                     (host sees Start)      (renderer takes over)
                                                                                          │                        │
                                                                                     Host clicks Start      Rounds cycle until
                                                                                          │                   maxRounds reached
                                                                                     Game begins ──────────►  Game Ended
                                                                                                               │
                                                                                                          Final scoreboard
                                                                                                          5s auto-redirect → /
```

## Step-by-Step

### 1. Home Page (`/` — `index.html`)

- **Game catalog grid** shows all available games (from `GAME_CATALOG` in `app.py`).
- Each card shows: icon, Arabic title, "mouth-based" badge if applicable, player count (2–8).
- Disabled games show "تحت الصيانة" (under maintenance) ribbon.
- **"كيف تلعب؟"** (How to play) button on each card opens a rules modal.
- **Join box** at the top accepts a 4-digit room code. Resolves via `rooms.getRoomByCode`.

### 2. Create Game Flow

1. Player clicks **"لعبة جديدة"** (New Game) on a game card.
2. Modal opens: enter player name, pick avatar.
3. Clicking **"أنشئ الغرفة"** calls `rooms.createRoom` mutation → returns `roomId`.
4. Avatar is set via `rooms.setAvatar`.
5. Browser navigates to `/game/<roomId>?player_name=X&game_type=Y`.

### 3. Join Game Flow

1. Player enters 4-digit room code in the join box (or pastes a `/game/<roomId>` link).
2. If it's a 4-digit code, `rooms.getRoomByCode` resolves it to a full Convex room ID.
3. Join modal opens with room preview (game type, player count, join-allowed status).
4. Player enters name + avatar, clicks **"انضم الآن"**.
5. Calls `rooms.joinRoom` mutation → browser navigates to the game page.
6. If URL has `?join=<roomId>` query param, the join modal auto-opens.

### 4. Game Page (`/game/<room_id>` — `game.html`)

- Flask serves the template with: `room_id`, `player_name`, `game_type`, `game_title`, `game_icon`, `mouth_based`, `convex_url`.
- `gameController.js` initializes: subscribes to `gameState.getPublicGameState` and `reactions.getRecentReactions`.
- **Waiting phase**: Players see the lobby. Host sees "ابدأ اللعبة" (Start Game) button (disabled until ≥2 players).
- **Active game**: The game-type-specific renderer takes over `#game-area`.
- **Common UI** (always visible): player list, scoreboard, room code, reaction emojis, sound toggle, leave/close buttons.

### 5. During Gameplay

- **State subscription**: Every Convex state change triggers `handleStateUpdate()` in `gameController.js`.
- **Version guard**: Stale updates (lower `stateVersion`) are skipped.
- **Renderer delegation**: `getRenderer(gameType)` returns the correct `window.<game>Renderer` module.
- **Host transfer**: If host leaves, next player becomes host automatically.
- **Player leave during game**: If only 1 player remains, game resets to `waiting` with scores cleared.

### 6. Game End

- Room status changes to `ended`.
- Timer stops, final scoreboard displayed with winner highlight.
- Confetti animation + win sound.
- **5-second auto-redirect countdown** back to home page.
- Room data is cleaned up.

## Sharing & Joining

- **Room code**: Auto-generated unique 4-digit code displayed prominently.
- **Copy code**: Click the code display or "انسخ رقم الغرفة" button.
- **Share link**: "شارك رابط الغرفة" copies a bare URL (`/game/<roomId>` without player_name) — recipient lands on join modal.
- **Max players**: 8 per room (enforced server-side).

## Mouth-Based Games

Games flagged `mouthBased: true` (Twenty Questions, Who Am I, Meen Yazood):
- Show a "وجهاً لوجه" (face-to-face) badge on the card.
- Display an info banner on the game page.
- Require players to be physically together — questions/answers are oral, not typed.
- The app tracks state (scores, turns, timers) but doesn't handle the verbal interaction.
