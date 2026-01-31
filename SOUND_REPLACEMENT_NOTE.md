# Sound Replacement Instructions

The current timeout sound (`timeout.mp3`) needs to be replaced with a more elegant notification sound.

## Recommended Options:

1. **Use a free sound from a library:**
   - Visit: https://freesound.org/
   - Search for: "gentle bell" or "soft notification" or "chime"
   - Download a short (1-2 second) sound
   - Convert to MP3 if needed
   - Replace `static/sounds/timeout.mp3`

2. **Recommended search terms:**
   - "gentle notification"
   - "soft bell"
   - "pleasant chime"
   - "ding"
   - "soft alert"

3. **Sound characteristics:**
   - Duration: 1-2 seconds
   - Volume: Moderate (not jarring)
   - Tone: Pleasant, non-aggressive
   - Format: MP3

## Quick Fix:

You can temporarily disable the timeout sound by commenting out line 11 in `static/js/charades.js`:

```javascript
// this.sounds.timeout = new Audio('/static/sounds/timeout.mp3');
```

Or replace it with the guessed sound temporarily:

```javascript
this.sounds.timeout = new Audio('/static/sounds/guessed.mp3');
```
