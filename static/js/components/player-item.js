/**
 * Player List Item Component
 * Creates consistent player list items for lobbies and scoreboards.
 * 
 * @example
 * // Create player item
 * const item = PlayerItem.create({
 *   name: 'أحمد',
 *   score: 15,
 *   avatar: '🦁',
 *   isHost: true,
 *   isMe: true,
 *   isConnected: true
 * });
 */

const PlayerItem = (() => {
  /**
   * Create a player list item.
   * @param {Object} options
   * @param {string} options.name - Player name
   * @param {number} [options.score=0] - Player score
   * @param {string} [options.avatar=''] - Player avatar emoji
   * @param {boolean} [options.isHost=false] - Is this player the host?
   * @param {boolean} [options.isMe=false] - Is this the current user?
   * @param {boolean} [options.isConnected=true] - Is player connected?
   * @param {number} [options.teamNumber] - Team number (1-3)
   * @returns {HTMLLIElement}
   */
  function create({
    name,
    score = 0,
    avatar = '',
    isHost = false,
    isMe = false,
    isConnected = true,
    teamNumber = null,
  } = {}) {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    if (isMe) li.classList.add('list-group-item-primary');
    
    // Left side: avatar + name
    const left = document.createElement('span');
    
    if (avatar) {
      const avatarEl = document.createElement('span');
      avatarEl.className = 'player-avatar';
      avatarEl.textContent = avatar;
      left.appendChild(avatarEl);
      left.appendChild(document.createTextNode(' '));
    }
    
    const nameEl = document.createElement('span');
    nameEl.textContent = name;
    left.appendChild(nameEl);
    
    // Host badge
    if (isHost) {
      left.appendChild(document.createTextNode(' '));
      left.appendChild(Badge.host());
    }
    
    // Disconnected indicator
    if (!isConnected) {
      const disc = document.createElement('span');
      disc.className = 'text-muted';
      disc.textContent = ' (غير متصل)';
      left.appendChild(disc);
    }
    
    // Team badge
    if (teamNumber) {
      left.appendChild(document.createTextNode(' '));
      left.appendChild(Badge.team(teamNumber));
    }
    
    li.appendChild(left);
    
    // Right side: score
    const scoreEl = Badge.score(score);
    li.appendChild(scoreEl);
    
    return li;
  }

  /**
   * Create a scoreboard row.
   * @param {Object} options
   * @param {string} options.name - Player name
   * @param {number} options.score - Player score
   * @param {number} options.rank - Player rank
   * @param {string} [options.avatar=''] - Player avatar
   * @param {boolean} [options.isMe=false] - Is this the current user?
   * @returns {HTMLTableRowElement}
   */
  function createScoreRow({ name, score, rank, avatar = '', isMe = false } = {}) {
    const tr = document.createElement('tr');
    if (isMe) tr.classList.add('table-primary');
    
    // Rank/Medal
    const rankCell = document.createElement('td');
    rankCell.innerHTML = Badge.medal(rank);
    tr.appendChild(rankCell);
    
    // Name
    const nameCell = document.createElement('td');
    if (avatar) nameCell.textContent = avatar + ' ';
    nameCell.appendChild(document.createTextNode(name));
    tr.appendChild(nameCell);
    
    // Score
    const scoreCell = document.createElement('td');
    scoreCell.className = 'text-center fw-bold';
    scoreCell.textContent = score;
    tr.appendChild(scoreCell);
    
    return tr;
  }

  /**
   * Update player list with animation for score changes.
   * @param {HTMLUListElement} listEl - The player list element
   * @param {Array<Object>} players - Player data array
   * @param {string} currentPlayerName - Current user's name
   */
  function updateList(listEl, players, currentPlayerName) {
    if (!listEl) return;
    
    // Store previous scores for animation
    const prevScores = new Map();
    listEl.querySelectorAll('li').forEach(li => {
      const name = li.dataset.playerName;
      const score = parseInt(li.dataset.score, 10);
      if (name) prevScores.set(name, score);
    });
    
    // Clear and rebuild
    listEl.innerHTML = '';
    
    players.forEach(p => {
      const item = create({
        name: p.name,
        score: p.score,
        avatar: p.avatar,
        isHost: p.isHost,
        isMe: p.name === currentPlayerName,
        isConnected: p.connected !== false,
        teamNumber: p.team,
      });
      item.dataset.playerName = p.name;
      item.dataset.score = p.score;
      listEl.appendChild(item);
      
      // Score animation
      const prevScore = prevScores.get(p.name);
      if (prevScore !== undefined && p.score > prevScore) {
        const diff = p.score - prevScore;
        showScoreFlyUp(item, diff);
      }
    });
  }

  /**
   * Show "+X" score fly-up animation.
   * @param {HTMLLIElement} itemEl - Player list item
   * @param {number} amount - Score increase
   */
  function showScoreFlyUp(itemEl, amount) {
    const fly = document.createElement('span');
    fly.className = 'score-fly-up';
    fly.textContent = `+${amount}`;
    fly.style.cssText = 'position:absolute;top:-5px;left:50%;transform:translateX(-50%);color:var(--success);font-weight:800;';
    
    itemEl.style.position = 'relative';
    itemEl.appendChild(fly);
    
    setTimeout(() => {
      fly.remove();
      itemEl.style.position = '';
    }, 1500);
  }

  return { create, createScoreRow, updateList, showScoreFlyUp };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlayerItem;
}