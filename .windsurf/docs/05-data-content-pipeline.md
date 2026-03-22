# Data & Content Pipeline

## Overview

Game content (questions, characters, words, riddles, etc.) flows from **static JSON files** → **Convex `gameItems` table** → **fetched at runtime** with anti-repetition logic.

## Pipeline Flow

```
JSON files (static/data/ or data/)
       │
       ▼
scripts/seedContent.mjs  ──►  Convex contentSeeder.seedItems mutation
       │                            │
       │                     Idempotent (skips duplicates by contentHash)
       │                            │
       ▼                            ▼
                         Convex `gameItems` table
                                    │
                          Game modules fetch at runtime
                          (LRU sorted, anti-repetition)
                                    │
                         roomItemUsage tracks per-room usage
```

## Data Files Per Game

| Game | Data File | Location | Format |
|------|-----------|----------|--------|
| Charades | `charades_items.json` | `static/data/` | `[{ title, category }]` |
| Trivia | `trivia_questions.json` | `static/data/` | `[{ title, options[], answer, category }]` |
| Rapid Fire | (shares trivia data) | `static/data/` | Same as trivia |
| Twenty Questions | `twenty_questions_words.json` | `static/data/` | `[{ title, category }]` |
| Riddles | `riddles.json` | `static/data/` | `[{ title, answer, accepted_answers[], hints[], category, difficulty }]` |
| Bus Complete | `bus_complete_dictionary.json` | `static/data/` | Validation dictionary (not seeded into gameItems) |
| Who Am I | `who_am_i_characters.json` | `static/data/` | `[{ title/name, category, hint }]` |
| Meen Yazood | `meen_yazood_questions.json` | `data/` | `[{ question, category, difficulty }]` |

## Convex `gameItems` Table Schema

```typescript
gameItems: defineTable({
  gameType: v.string(),      // e.g., "charades", "trivia", "riddles"
  category: v.string(),      // e.g., "أفلام", "علوم", "تاريخ"
  itemData: v.any(),         // Game-specific payload (title, options, answer, hints, etc.)
  contentHash: v.string(),   // Dedup key: "gameType:title"
  lastUsed: v.optional(v.number()),  // Timestamp — drives LRU sorting
  useCount: v.number(),      // Global usage counter
  source: v.optional(v.string()),    // Origin (e.g., "tmdb", "manual")
})
```

**Indexes:**
- `by_type` — filter by gameType
- `by_type_category` — filter by gameType + category
- `by_hash` — dedup check (gameType + contentHash)
- `by_type_lastUsed` — LRU ordering for anti-repetition

## Seeding Content

### Via `scripts/seedContent.mjs`

This Node.js script reads JSON files and calls `contentSeeder.seedItems`:

```bash
node scripts/seedContent.mjs
```

The mutation is **idempotent** — it checks `contentHash` (`gameType:title`) before inserting. Duplicates are skipped.

### Via `contentSeeder.ts` Mutations

- **`seedItems`**: Bulk insert items (skips duplicates).
- **`getRandomItems`**: Fetch LRU-sorted items (for queries, not typically used by games directly).
- **`markItemsUsed`**: Update `lastUsed` timestamps.
- **`getItemCount`**: Count items per game type.

## Anti-Repetition System

Each game module uses this pattern to avoid showing the same content twice:

### 1. Room-Level Tracking (`roomItemUsage`)

```typescript
// Get IDs already used in this room
const usedRecords = await ctx.db
  .query("roomItemUsage")
  .withIndex("by_room", (q) => q.eq("roomId", roomId))
  .collect();
const usedIds = new Set(usedRecords.map((r) => r.itemId));
```

### 2. LRU Sorting (Global)

```typescript
// Fetch all items sorted by lastUsed (least recently used first)
const allItems = await ctx.db
  .query("gameItems")
  .withIndex("by_type_lastUsed", (q) => q.eq("gameType", "my_game"))
  .collect();
```

### 3. Filter + Pick

```typescript
// Prefer items not yet used in this room
const candidates = allItems.filter((i) => !usedIds.has(i._id));
const pool = candidates.length > 0 ? candidates : allItems; // fallback to all if exhausted
const topN = pool.slice(0, Math.min(10, pool.length));       // top 10 LRU
const picked = topN[Math.floor(Math.random() * topN.length)]; // random from top 10
```

### 4. Record Usage

```typescript
await ctx.db.insert("roomItemUsage", { roomId, itemId: picked._id, usedAt: Date.now() });
await ctx.db.patch(picked._id, { lastUsed: Date.now(), useCount: (picked.useCount ?? 0) + 1 });
```

## Category Exclusions

Some games filter out specific categories. Example (Trivia & Rapid Fire):

```typescript
const excludedCategories = new Set(["العقيدة", "الحديث", "الفقه", "اللغة العربية", "إسلاميات"]);
const candidates = allItems.filter((i) => !usedIds.has(i._id) && !excludedCategories.has(i.category));
```

## Content JSON Format Examples

### Trivia / Rapid Fire Question

```json
{
  "title": "ما هي عاصمة فرنسا؟",
  "options": ["لندن", "باريس", "برلين", "مدريد"],
  "answer": 1,
  "category": "جغرافيا"
}
```

### Riddle

```json
{
  "title": "ما الشيء الذي يمشي بلا أرجل؟",
  "answer": "الساعة",
  "accepted_answers": ["ساعة", "الساعه"],
  "hints": ["لها عقارب", "على الحائط", "تخبرك بالوقت"],
  "category": "عام",
  "difficulty": "easy"
}
```

### Who Am I Character

```json
{
  "title": "أينشتاين",
  "category": "علماء",
  "hint": "عالم فيزياء شهير"
}
```

### Meen Yazood Question

```json
{
  "question": "اذكر أنواع فواكه",
  "category": "طعام",
  "difficulty": "easy"
}
```

## Adding New Content

1. Create or edit the JSON file in `static/data/` (or `data/`).
2. Run `node scripts/seedContent.mjs` to seed into Convex.
3. New items appear with `lastUsed: 0` — they'll be prioritized by LRU.
4. Duplicates (same `contentHash`) are automatically skipped.

## Arabic Text Handling

The `normalizeArabic()` function in `convex/helpers.ts` is used for text comparison (riddles answers):

- Removes diacritics (tashkeel: fatha, damma, kasra, etc.)
- Normalizes alef variants (إأآٱ → ا)
- Normalizes taa marbuta (ة → ه)
- Normalizes alef maqsura (ى → ي)
- Trims and lowercases
- Collapses multiple spaces

This ensures "الساعة" matches "الساعه" and "ألساعة" etc.
