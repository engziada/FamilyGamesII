# Family Games II — ألعاب العيلة

A modern Arabic-first multiplayer party games platform with real-time gameplay powered by **Convex** and served via **Flask**.

## Games (8 modes)

| Game | Arabic | Type |
|------|--------|------|
| Charades | بدون كلام | Act & guess |
| Pictionary | ارسم وخمّن | Draw & guess |
| Trivia | بنك المعلومات | Multiple choice |
| Rapid Fire | الأسئلة السريعة | Buzz-in speed |
| Twenty Questions | عشرين سؤال | Yes/No deduction (face-to-face) |
| Riddles | الألغاز | 3-attempt solve with hints |
| Bus Complete | أتوبيس كومبليت | Category fill race |
| Who Am I? | من أنا؟ | Character guessing (face-to-face) |

## Tech Stack

- **Backend**: Flask (HTTP page server only — no Socket.IO)
- **Real-time DB**: [Convex](https://convex.dev) — serverless functions + subscriptions
- **Frontend**: Vanilla JS modules + Bootstrap 5 RTL + Animate.css
- **Content**: 224 Arabic game items seeded into Convex via HTTP API
- **Package mgr**: uv (Python), npm (Node.js/Convex)

## Project Structure

```
FamilyGamesII/
├── app.py                      # Flask page server (routes only)
├── convex/                     # Convex serverless functions
│   ├── schema.ts               # DB schema (rooms, players, gameState, gameItems, reactions)
│   ├── rooms.ts                # Room CRUD mutations
│   ├── gameState.ts            # Game lifecycle + state queries
│   ├── contentSeeder.ts        # Idempotent content import mutation
│   ├── games/                  # Game-specific logic (8 files)
│   │   ├── charades.ts
│   │   ├── pictionary.ts
│   │   ├── trivia.ts
│   │   ├── rapidFire.ts
│   │   ├── twentyQuestions.ts
│   │   ├── riddles.ts
│   │   ├── busComplete.ts
│   │   └── whoAmI.ts
│   └── _generated/             # Auto-generated Convex API
├── static/
│   ├── css/style.css           # Full CSS with dark mode, animations, mobile
│   ├── js/
│   │   ├── convexClient.js     # Convex browser SDK singleton
│   │   ├── lobby.js            # Room create/join via Convex
│   │   ├── gameController.js   # Main orchestrator + state subscriptions
│   │   ├── gameUI.js           # Shared DOM helpers (players, scores, end-game)
│   │   ├── timer.js            # Countdown with color-coded progress bar
│   │   ├── sound.js            # Sound effects + mute toggle
│   │   ├── reactions.js        # Floating emoji reactions
│   │   ├── enhancements.js     # Confetti, score animations, rules, shortcuts, avatars
│   │   └── renderers/          # 8 game-specific UI renderers
│   ├── data/                   # Static JSON content files
│   │   ├── charades_items.json
│   │   ├── riddles.json
│   │   ├── twenty_questions_words.json
│   │   └── who_am_i_characters.json
│   └── sounds/                 # Audio files
├── scripts/
│   └── seedContent.mjs         # Content seeder (Convex HTTP API)
├── templates/
│   ├── base.html               # Layout + Convex SDK + dark mode toggle
│   ├── index.html              # Game catalog + create modal + avatar picker
│   └── game.html               # Game board + sidebar + controls
└── .env.example                # Environment variables template
```

## Features

### Real-time Multiplayer
- Convex subscriptions for instant state sync (no polling)
- Room creation with unique IDs, host/guest roles
- Player reconnection support
- Automatic stale room cleanup

### UX Enhancements
- **Dark mode** with system preference detection + manual toggle (T key)
- **Confetti celebrations** on game end (canvas-confetti)
- **Animated score changes** (+X fly-up with glow)
- **Floating emoji reactions** (😂 👏 🔥 😱 ❤️)
- **Game rules modal** for all 8 games ("كيف تلعب؟")
- **Copy room code** button with clipboard API
- **Avatar picker** (20 emoji avatars)
- **Keyboard shortcuts** (T=theme, M=mute, H=help, ?=shortcuts, Esc=close)
- **Haptic feedback** on mobile (correct/wrong/win patterns)
- **Toast notifications** replacing all alerts
- **Enhanced end-game screen** with winner spotlight, highlights, stats, play again

### Mobile Optimizations
- 44px minimum touch targets
- Swipe-to-dismiss modals
- Responsive sidebar reordering
- Bootstrap 5 RTL layout

### Content Pipeline
- 224 Arabic game items across 4 content types
- Idempotent seeding via `node scripts/seedContent.mjs`
- Content deduplication by hash
- Anti-repetition tracking per room

## Setup

### Prerequisites
- Python 3.11+ with [uv](https://docs.astral.sh/uv/)
- Node.js 18+ with npm
- [Convex account](https://convex.dev) (free tier)

### Installation

```powershell
# Clone and enter project
git clone <repo-url> && cd FamilyGamesII

# Python dependencies
uv venv && .venv\Scripts\activate
uv pip install -r requirements.txt

# Convex setup
npm install
npx convex dev   # Creates .env.local with CONVEX_URL

# Seed game content
node scripts/seedContent.mjs

# Copy env template
copy .env.example .env
# Edit .env with your SECRET_KEY and GROQ_API_KEY

# Run Flask
flask run
```

### Environment Variables
| Variable | Source | Purpose |
|----------|--------|---------|
| `SECRET_KEY` | `.env` | Flask session signing |
| `GROQ_API_KEY` | `.env` | Trivia AI translation |
| `CONVEX_URL` | `.env.local` (auto-generated) | Convex deployment URL |

## Architecture

```
Browser ←→ Convex (real-time subscriptions + mutations)
Browser ←→ Flask  (page serving only, no WebSocket)
```

Flask serves HTML pages and injects `CONVEX_URL` into templates. All real-time game logic runs in Convex serverless functions. The browser connects directly to Convex via the browser SDK — Flask has no involvement in gameplay.

## Development

```powershell
# Start Convex dev server (watches for changes, hot-deploys)
npx convex dev

# In another terminal, start Flask
flask run --debug

# Re-seed content after JSON changes
node scripts/seedContent.mjs
```
