# Groq API Setup Guide

## Your Groq API Key

```
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
```

## Setup Instructions

### 1. Create .env File

Create a new file named `.env` in the project root directory:

```bash
# On Windows (PowerShell)
New-Item -Path .env -ItemType File

# Or manually create the file
```

### 2. Add Your API Key

Open the `.env` file and add:

```env
GROQ_API_KEY=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
```

### 3. Verify Setup

The `.env` file should contain only the line above. The file is automatically ignored by Git (listed in `.gitignore`), so your API key will remain private.

## What This Enables

With the Groq API key configured, the trivia fetcher can:

1. **Translate English Questions to Arabic**
   - Fetch questions from OpenTDB (Open Trivia Database)
   - Automatically translate them to Arabic using Groq's AI
   - Expand trivia content beyond static questions

2. **AI Model Used**
   - Model: `mixtral-8x7b-32768`
   - Fast, accurate translation
   - Supports Arabic language well

3. **Rate Limiting**
   - 1 second delay between requests
   - Respectful API usage
   - Free tier friendly

## Testing the Setup

After creating the `.env` file, restart the application:

```bash
# Stop the current server (Ctrl+C)
# Then restart
uv run app.py
```

The trivia fetcher will now automatically use AI translation when fetching from OpenTDB.

## Troubleshooting

### API Key Not Working

1. Check that `.env` file exists in project root
2. Verify no extra spaces or quotes around the API key
3. Restart the application after creating `.env`
4. Check console for any API-related errors

### Translation Not Happening

1. Verify `.env` file is in the correct location (project root)
2. Check that the file is named exactly `.env` (not `.env.txt`)
3. Ensure the API key is on a single line with no line breaks

## Security Notes

- ✅ `.env` file is gitignored (won't be committed)
- ✅ API key remains private
- ✅ Never share your API key publicly
- ✅ If key is compromised, regenerate at https://console.groq.com/

## API Key Management

To regenerate or manage your API key:
1. Visit https://console.groq.com/
2. Go to API Keys section
3. Create new key or revoke old ones

---

**Note:** This file contains your actual API key for reference. Keep it secure and delete it after setup if desired.
