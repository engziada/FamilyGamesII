# Game Workflows — Rules, Validations & Scoring

Each game has a **Convex backend module** (`convex/games/<game>.ts`) and a **frontend renderer** (`static/js/renderers/<game>Renderer.js`). This document details every game's flow, rules, validations, and scoring.

---

## 1. Charades (بدون كلام)

**Type**: Screen-based (performer acts, others guess)
**Backend**: `convex/games/charades.ts`
**Renderer**: `static/js/renderers/charadesRenderer.js`
**Data**: `gameItems` table (gameType: `"charades"`) — seeded from `static/data/charades_items.json`

### Flow

```
waiting → playing → preparing → round_active → playing (next turn) → ... → ended
```

1. **Host starts game** → status: `playing`, first player selected.
2. **Current player clicks "Ready"** → `playerReady` fetches a random item from `gameItems` (anti-repetition LRU) → status: `preparing`.
3. **Performer sees the item** (hidden from others via `filterStateForPlayer`) → clicks "Start" → `startPerforming` → status: `round_active`, server timer starts.
4. **Anyone clicks "Guess Correct"** → `guessCorrect` → awards points to both performer and guesser → advances to next player.
5. **Timeout or Pass** → `handleTimeout` / `passTurn` → no points, next player.

### Scoring

- Points = `max(1, ceil(10 × (1 - elapsed / timeLimit)))` — faster guesses earn more.
- Both **performer** and **guesser** receive equal points.

### Validations

- Only current player can call `playerReady` and `startPerforming`.
- Only current player or host can `passTurn`.
- Server-side timer via `ctx.scheduler.runAfter(timeLimit * 1000)`.
- `expectedVersion` guard on timeout handler prevents stale execution.

### State Shape

```json
{
  "currentItem": { "id": "...", "title": "...", "category": "..." } | null,
  "items": [],
  "playerIndex": 0,
  "playerOrder": ["player1", "player2"],
  "roundsPlayed": 0,
  "maxRounds": 10,
  "roundStartTime": null,
  "timeLimit": 60
}
```

---

## 2. Pictionary (ارسم وخمن)

**Type**: Screen-based (draw + guess) — **Currently disabled (under maintenance)**
**Backend**: `convex/games/pictionary.ts`
**Renderer**: `static/js/renderers/pictionaryRenderer.js`

### Flow

Same as Charades but with `canvasStrokes` array for drawing data. When `gameType === "pictionary"`, the initial state includes `canvasStrokes: []`.

### Notes

- Marked `disabled: true` in `GAME_CATALOG`.
- Same scoring as Charades.
- Canvas stroke data synced via state updates.

---

## 3. Trivia (بنك المعلومات)

**Type**: Screen-based (multiple choice questions)
**Backend**: `convex/games/trivia.ts`
**Renderer**: `static/js/renderers/triviaRenderer.js`
**Data**: `gameItems` table (gameType: `"trivia"`) — seeded from `static/data/trivia_questions.json`

### Flow

```
waiting → round_active → (correct/timeout/all-wrong) → [3s pause] → round_active → ... → ended
```

1. **Game starts** → `autoAdvance` fetches first question from `gameItems` → status: `round_active`.
2. **Question displayed** with multiple-choice options. Timer starts server-side.
3. **Player clicks an option** → `submitAnswer`:
   - Correct → 10 points, question deactivated, 3s pause → next question.
   - Wrong → player locked out, others can still answer.
   - All wrong → 3s pause → next question.
4. **Timeout** → `handleQuestionTimeout` → 3s pause → next question.
5. After `maxQuestions` reached → `ended`.

### Scoring

- **10 points** for correct answer (first correct answerer wins the round).

### Validations

- Answer index **never exposed** in public state (`filterStateForPlayer` strips `answer` field).
- Players can only answer once per question (`playersAnswered` check).
- Excluded categories: Islamic-themed (العقيدة, الحديث, الفقه, اللغة العربية, إسلاميات).
- Server-side question timer.

### State Shape

```json
{
  "currentQuestion": { "question": "...", "options": [...], "answer": 2, "category": "..." },
  "questionIndex": 0,
  "maxQuestions": 10,
  "playersAnswered": [],
  "playersAnsweredWrong": [],
  "questionActive": true,
  "timeLimit": 30,
  "lastResult": { "player": "...", "correct": true, "correctAnswer": "..." }
}
```

---

## 4. Rapid Fire (الأسئلة السريعة)

**Type**: Screen-based (buzz-in multiple choice)
**Backend**: `convex/games/rapidFire.ts`
**Renderer**: `static/js/renderers/rapidFireRenderer.js`
**Data**: `gameItems` table (gameType: `"rapid_fire"`)

### Flow

```
waiting → round_active → buzzed → (correct/wrong) → round_active → ... → ended
```

1. **Question loaded** → status: `round_active`, server timer starts.
2. **Player buzzes in** → `buzzIn` → status: `buzzed`, 10-second buzz timer starts server-side.
3. **Buzzed player selects answer** → `submitBuzzAnswer`:
   - Correct → 10 points, 3s pause → next question.
   - Wrong → player added to `buzzFailed`, buzz released for others.
4. **All players fail** → 3s pause → next question.
5. **No buzz before timeout** → `handleQuestionTimeout` → 3s pause → next.

### Scoring

- **10 points** for correct buzz answer.

### Validations

- Only one player can buzz at a time (`buzzedPlayer` check).
- Players in `buzzFailed` cannot buzz again for the same question.
- 10-second buzz timeout (server-side) — auto-fails if player doesn't answer.
- Same category exclusions as Trivia.

### State Shape

```json
{
  "currentQuestion": { "question": "...", "options": [...], "answer": 0 },
  "questionIndex": 0,
  "maxQuestions": 10,
  "buzzedPlayer": null,
  "buzzFailed": [],
  "questionActive": true,
  "timeLimit": 30,
  "lastResult": null
}
```

---

## 5. Twenty Questions (عشرين سؤال)

**Type**: Mouth-based (face-to-face)
**Backend**: `convex/games/twentyQuestions.ts`
**Renderer**: `static/js/renderers/twentyQRenderer.js`
**Data**: `gameItems` table (gameType: `"twenty_questions"`) — seeded from `static/data/twenty_questions_words.json`

### Flow

```
waiting → thinking → asking → (guessed/max questions) → [3s] → thinking (next thinker) → ... → ended
```

1. **Thinker** sees a word suggestion, types/picks a secret word → `setSecretWord` → status: `asking`.
2. **Other players ask yes/no questions verbally**. Thinker presses نعم/لا/ربما buttons → `recordAnswer` increments counter.
3. **Someone guesses correctly** (verbally) → Thinker presses "خمنت صح" → `guessedCorrectly` → points awarded → 3s pause → next thinker.
4. **20 questions used up** → Thinker wins (10 pts) → 3s pause → next thinker.

### Scoring

- Correct guess: `max(1, 20 - questionsUsed)` points to guesser (fewer questions = more points).
- No one guesses: **10 points** to the thinker.

### Validations

- Only the thinker can set word, record answers, confirm guesses.
- Secret word hidden from non-thinker via `filterStateForPlayer`.
- Thinker rotates each round (`thinkerIndex` cycles through `playerOrder`).

### State Shape

```json
{
  "thinker": "playerName",
  "secretWord": "كلمة",
  "secretCategory": "حيوان",
  "questionCount": 5,
  "maxQuestions": 20,
  "answerHistory": [{ "number": 1, "answer": "نعم" }, ...],
  "playerOrder": ["p1", "p2"],
  "thinkerIndex": 0,
  "roundsPlayed": 0,
  "maxRounds": 10,
  "timeLimit": 60
}
```

---

## 6. Riddles (الألغاز)

**Type**: Screen-based (text answer)
**Backend**: `convex/games/riddles.ts`
**Renderer**: `static/js/renderers/riddlesRenderer.js`
**Data**: `gameItems` table (gameType: `"riddles"`) — seeded from `static/data/riddles.json`

### Flow

```
waiting → round_active → (solved/skipped) → round_active (next riddle) → ... → ended
```

1. **Riddle loaded** from `gameItems` → status: `round_active`.
2. **Players type answers** → `submitAnswer` — normalized Arabic comparison.
3. **Hints** → `revealHint` (up to 3 hints, costs 1 point each to the requester).
4. **Host can skip** → `skipRiddle` → next riddle.
5. After `maxRiddles` or content exhausted → `ended`.

### Scoring

- **3 attempts per player per riddle** with diminishing points:
  - Attempt 1: **10 points**
  - Attempt 2: **5 points**
  - Attempt 3: **1 point**
- Hint cost: **−1 point per hint requested** (only deducted from the player who requested it).
- Minimum 1 point awarded.

### Validations

- Arabic normalization: removes diacritics, normalizes alef/taa/alef-maqsura variants.
- `accepted_answers` array allows multiple correct spellings.
- Attempt count tracked per player (`playersAnswered[playerName]`).
- Only host can skip.

### State Shape

```json
{
  "currentRiddle": { "riddle": "...", "answer": "...", "accepted_answers": [], "hints": [], "category": "...", "difficulty": "medium" },
  "riddleIndex": 0,
  "maxRiddles": 10,
  "playersAnswered": { "player1": 2 },
  "hintsRevealed": 1,
  "hintRequestedBy": ["player1"],
  "timeLimit": 60,
  "lastResult": null
}
```

---

## 7. Bus Complete (أتوبيس كومبليت)

**Type**: Screen-based (fill categories with a given letter)
**Backend**: `convex/games/busComplete.ts`
**Renderer**: `static/js/renderers/busCompleteRenderer.js`
**Data**: No external JSON — uses shuffled Arabic alphabet as letter pool. Validation dictionary at `static/data/bus_complete_dictionary.json`.

### Flow

```
waiting → round_active → validating → [3s grace] → validating (votes) → scoring → waiting (next round) → ... → ended
```

1. **Host starts round** → `startRound` pops next letter from pre-shuffled pool → status: `round_active`.
2. **Players fill 7 categories**: اسم, حيوان, نبات, جماد, بلاد, مهنة, فاكهة — all starting with the letter.
3. **Answers auto-sync** via `submitAnswers` (debounced, no stateVersion bump).
4. **Any player clicks "Stop"** → `stopBus` → status: `validating` immediately (atomic guard prevents double-stop).
5. **3-second grace period** → `beginValidation` builds validation state.
6. **Peer voting** → `submitValidationVote` (✓/✗ per answer) — majority consensus decides.
7. **Host finalizes** → `finalizeValidation` calculates scores → status: `scoring`.
8. **Host confirms** → `nextRound` → next letter or `ended`.

### Scoring

- **10 points** for unique valid answer (no other player has the same).
- **5 points** for duplicate valid answer (another player has the same).
- Invalid/empty answers = 0.

### Validations

- Letters drawn from pre-shuffled pool (no repeats within a session).
- `scoresCalculated` flag prevents double scoring.
- Atomic status guard on `stopBus` prevents race condition.
- Category keys are URI-encoded in state to satisfy Convex field name restrictions.

### State Shape

```json
{
  "categories": ["اسم", "حيوان", "نبات", "جماد", "بلاد", "مهنة", "فاكهة"],
  "currentLetter": "ب",
  "letterPool": ["ت", "ث", ...],
  "usedLetters": ["أ", "ب"],
  "submissions": { "player1": { "اسم": "باسم", ... } },
  "validationState": { "player1|اسم": "valid" },
  "validationVotes": { "player1|اسم": { "player2": true } },
  "stoppedBy": "player1",
  "roundsPlayed": 1,
  "maxRounds": 10,
  "scoresCalculated": false,
  "timeLimit": 60
}
```

---

## 8. Who Am I? (من أنا؟)

**Type**: Mouth-based (face-to-face)
**Backend**: `convex/games/whoAmI.ts`
**Renderer**: `static/js/renderers/whoAmIRenderer.js`
**Data**: `gameItems` table (gameType: `"who_am_i"`) — seeded from `static/data/who_am_i_characters.json`

### Flow

```
waiting → playing → round_active → (all guessed) → [3s] → playing (next round) → ... → ended
```

1. **Host starts round** → `startRound` fetches random characters from `gameItems`, assigns one per player.
2. **Each player sees everyone's character EXCEPT their own** (via `filterStateForPlayer`).
3. **Players ask yes/no questions verbally** to figure out who they are.
4. **When someone guesses correctly** → host or player clicks "خمنت صح" → `guessedCorrectly` → 10 points.
5. **All players guessed** → 3s pause → next round.

### Scoring

- **10 points** per correct self-guess.

### Validations

- Only host or the guesser themselves can confirm a correct guess.
- Character assignments filtered per player (you see others' characters, not your own).
- Anti-repetition: characters tracked via `roomItemUsage`.

### State Shape

```json
{
  "assignments": { "player1": { "name": "أينشتاين", "category": "علماء", "hint": "..." } },
  "guessedPlayers": ["player2"],
  "playerOrder": ["player1", "player2"],
  "roundsPlayed": 0,
  "maxRounds": 10,
  "timeLimit": 60
}
```

---

## 9. Meen Yazood (مين يزود؟)

**Type**: Mouth-based, team-based (bidding + oral performance)
**Backend**: `convex/games/meenYazood.ts`
**Renderer**: `static/js/renderers/meenYazoodRenderer.js`
**Data**: `gameItems` table (gameType: `"meen_yazood"`) — seeded from `data/meen_yazood_questions.json`

### Flow

```
waiting → bidding → performing → validating → scoring → [4s] → bidding (next round) → ... → ended
```

1. **Teams assigned** (2+ teams, auto-balanced if needed via `autoAssignTeams`).
2. **Host starts bidding** → `startBidding` fetches a question → status: `bidding`, 35s timer.
3. **Teams bid** how many items they can name → `submitBid` (must be > current highest, range 1–50).
4. **Bidding timeout** → highest bidder's team must perform → status: `performing`.
5. **Performing team names items orally** within `bid × 3 seconds` → clicks "Stop" when done → `stopTimer` → status: `validating`.
6. **Non-performing teams vote** confirm/reject → `submitValidation` (one vote per team, first voter).
7. **All voted or timeout** → `calculateAndAdvance`:
   - Majority confirms (ties favor performing team) → +1 team score + +1 per player.
   - Rejected → no points.
8. Status: `scoring` → 4s pause → next round auto-starts via `autoAdvance`.

### Scoring

- **+1 point** to each player on the performing team if confirmed.
- **+1 team score** if confirmed.
- Team scores tracked separately in `state.teamScores`.

### Validations

- Only non-performing teams can vote.
- One vote per team (first voter from each team).
- Bid must be higher than current highest and between 1–50.
- Player must be assigned to a team.
- Performance timeout: `min(bid × 3, 150)` seconds.
- Server-side timeouts for bidding (35s), performance, and validation (15s).

### State Shape

```json
{
  "currentQuestion": { "id": "...", "question": "...", "category": "..." },
  "biddingPhase": {
    "active": true,
    "startTime": 1234567890,
    "currentHighestBid": 5,
    "leadingTeam": 1,
    "bidHistory": [{ "teamId": 1, "playerName": "...", "bid": 5, "timestamp": ... }]
  },
  "performancePhase": {
    "active": false,
    "performingTeam": 1,
    "requiredCount": 5,
    "startTime": null,
    "duration": 15,
    "stopped": false
  },
  "validationPhase": { "active": false, "votes": {} },
  "teamScores": { "1": 3, "2": 2 },
  "questionsUsed": ["id1", "id2"],
  "currentRound": 2,
  "maxRounds": 10,
  "lastResult": null,
  "biddingTimeLimit": 35,
  "validationTimeLimit": 15
}
```

---

## Cross-Game Patterns

| Pattern | Details |
|---------|---------|
| **Anti-repetition** | `roomItemUsage` table tracks used items per room; `gameItems` sorted by `lastUsed` (LRU) |
| **Server-side timers** | All timeouts use `ctx.scheduler.runAfter()` with `expectedVersion` stale guard |
| **Auto-advance** | Internal mutations with scheduled delay (3–4s) between rounds |
| **State filtering** | `filterStateForPlayer()` hides secrets (answers, words, characters) per game type |
| **Host authority** | Start game, skip, finalize validation, end game — always host-gated |
| **Arabic normalization** | `normalizeArabic()` removes diacritics, normalizes alef/taa variants for text comparison |
