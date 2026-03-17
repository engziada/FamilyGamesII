/**
 * Reactions Module — floating emoji reactions (F-04).
 */

const reactions = (() => {
  const _seen = new Set();

  /**
   * Render floating emoji reactions on screen.
   * @param {Array} reactionList - Array of {_id, emoji, playerName, createdAt}.
   */
  function renderFloating(reactionList) {
    for (const r of reactionList) {
      if (_seen.has(r._id)) continue;
      _seen.add(r._id);
      spawnFloatingEmoji(r.emoji, r.playerName);
    }
    // Prune old IDs
    if (_seen.size > 200) {
      const arr = Array.from(_seen);
      arr.slice(0, arr.length - 100).forEach((id) => _seen.delete(id));
    }
  }

  /**
   * Spawn a single floating emoji animation.
   * @param {string} emoji - Emoji character.
   * @param {string} playerName - Who sent it.
   */
  function spawnFloatingEmoji(emoji, playerName) {
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = emoji;
    el.title = playerName;
    el.style.left = `${20 + Math.random() * 60}%`;
    el.style.animationDuration = `${2 + Math.random() * 2}s`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  return { renderFloating };
})();
