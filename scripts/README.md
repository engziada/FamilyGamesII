# Content Seeding Scripts

## Overview

The `seedContent.mjs` script populates the Convex `gameItems` table with all game content (questions, riddles, charades, etc.) from JSON files in `static/data/`.

**CRITICAL:** This script must be run for **BOTH** development and production Convex deployments. Without seeded content, games will end prematurely after the first question.

## Usage

### Development (Local)

```bash
node scripts/seedContent.mjs
```

This reads `CONVEX_URL` from `.env.local` and seeds your local dev deployment.

### Production (Render/Vercel/etc.)

```bash
CONVEX_URL=https://your-production.convex.cloud node scripts/seedContent.mjs
```

Replace `https://your-production.convex.cloud` with your actual production Convex URL from Render's environment variables.

## How to Find Production Convex URL

1. Go to your Render dashboard
2. Select your deployed service
3. Navigate to **Environment** tab
4. Look for `CONVEX_URL` or `VITE_CONVEX_URL`
5. Copy the URL (e.g., `https://happy-elephant-123.convex.cloud`)

## Verification

After seeding, verify content was loaded:

```bash
# Check item counts per game type
node -e "const url='YOUR_CONVEX_URL'; ['trivia','rapid_fire','riddles','charades','who_am_i','twenty_questions','meen_yazood'].forEach(g => fetch(url+'/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'contentSeeder:getItemCount',args:{gameType:g}})}).then(r=>r.json()).then(d=>console.log(g+':',d.value)));"
```

Expected counts:
- trivia: 100
- rapid_fire: 100
- riddles: 189
- charades: 214
- who_am_i: 181
- twenty_questions: 96
- meen_yazood: 200

## Troubleshooting

**Problem:** Games end after first turn on production

**Cause:** Production Convex deployment has no seeded content

**Solution:** Run the seeding script with production `CONVEX_URL`

**Problem:** "ERROR: CONVEX_URL not found"

**Cause:** Neither environment variable nor `.env.local` contains `CONVEX_URL`

**Solution:** Either:
- Set `CONVEX_URL` environment variable: `CONVEX_URL=https://... node scripts/seedContent.mjs`
- Or ensure `.env.local` exists with `CONVEX_URL=...`

## Content Files

All game content is stored in `static/data/`:

- `trivia_questions.json` → trivia + rapid_fire
- `riddles.json` → riddles
- `charades.json` → charades
- `who_am_i.json` → who_am_i
- `twenty_questions.json` → twenty_questions
- `meen_yazood_questions.json` → meen_yazood

## Anti-Repetition

The seeding script uses content hashing (`gameType + title`) to prevent duplicate insertions. Running the script multiple times is safe — it will skip already-seeded items.
