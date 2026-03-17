/**
 * Game UI Module — shared DOM rendering helpers used by all game types.
 */

const gameUI = (() => {
  /**
   * Update the player list sidebar.
   * @param {Array} players - Player objects from Convex.
   * @param {string} currentPlayerName - This client's player name.
   */
  function updatePlayerList(players, currentPlayerName) {
    const el = document.getElementById('player-list');
    if (!el) return;

    el.innerHTML = players
      .map((p) => {
        const isMe = p.name === currentPlayerName;
        const hostBadge = p.isHost ? ' <span class="badge bg-warning text-dark">مضيف</span>' : '';
        const avatar = p.avatar ? `<span class="player-avatar">${p.avatar}</span>` : '';
        const disconnected = p.connected === false ? ' <span class="text-muted">(غير متصل)</span>' : '';
        return `<li class="list-group-item d-flex justify-content-between align-items-center ${isMe ? 'list-group-item-primary' : ''}">
          <span>${avatar} ${p.name}${hostBadge}${disconnected}</span>
          <span class="badge bg-primary rounded-pill">${p.score}</span>
        </li>`;
      })
      .join('');
  }

  /**
   * Update the scoreboard (sorted by score desc).
   * @param {Array} players - Player objects.
   */
  function updateScoreboard(players) {
    const el = document.getElementById('scoreboard');
    if (!el) return;

    const sorted = [...players].sort((a, b) => b.score - a.score);
    el.innerHTML = sorted
      .map((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
        return `<tr>
          <td>${medal} ${p.name}</td>
          <td class="text-center fw-bold">${p.score}</td>
        </tr>`;
      })
      .join('');
  }

  /**
   * Update the game status display.
   * @param {string} status - Room status.
   * @param {string|null} currentPlayer - Active player name.
   * @param {string} myName - This client's name.
   */
  function updateStatus(status, currentPlayer, myName) {
    const el = document.getElementById('game-status');
    if (!el) return;

    const statusMap = {
      waiting: 'في انتظار اللاعبين...',
      playing: currentPlayer === myName ? 'دورك!' : `دور ${currentPlayer}`,
      round_active: currentPlayer === myName ? 'دورك! الوقت يمشي...' : `دور ${currentPlayer}`,
      thinking: 'اللاعب يفكر في كلمة...',
      asking: 'مرحلة الأسئلة',
      buzzed: 'لاعب ضغط الجرس!',
      validating: 'مرحلة التحقق من الإجابات',
      scoring: 'حساب النقاط',
      ended: 'انتهت اللعبة!',
    };

    el.textContent = statusMap[status] || status;

    // Show/hide start button
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) {
      startBtn.style.display = status === 'waiting' ? '' : 'none';
    }
  }

  /**
   * Update round info display.
   * @param {number} currentRound - Current round number.
   * @param {object} settings - Game settings.
   */
  function updateRoundInfo(currentRound, settings) {
    const el = document.getElementById('round-info');
    if (!el) return;
    const maxRounds = settings?.rounds || '?';
    el.textContent = `الجولة ${currentRound || 0} / ${maxRounds}`;
  }

  /**
   * Show/hide the mouth-based game notification banner.
   * @param {boolean} show - Whether to show.
   */
  function showMouthBasedBanner(show) {
    let banner = document.getElementById('mouth-based-banner');
    if (show && !banner) {
      banner = document.createElement('div');
      banner.id = 'mouth-based-banner';
      banner.className = 'alert alert-info text-center mb-3';
      banner.innerHTML = '<i class="fas fa-users"></i> هذه اللعبة تُلعب وجهاً لوجه — اسألوا بعض شفهياً!';
      const container = document.getElementById('game-area') || document.querySelector('.container');
      if (container) container.prepend(banner);
    } else if (!show && banner) {
      banner.remove();
    }
  }

  /**
   * Show the end-game summary screen.
   * @param {Array} players - Final player list with scores.
   * @param {string} myName - This client's name.
   */
  function showEndGameScreen(players, myName) {
    const gameArea = document.getElementById('game-area');
    if (!gameArea) return;

    const sorted = [...players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    const isWinner = winner?.name === myName;
    const totalPoints = sorted.reduce((s, p) => s + p.score, 0);

    // Player highlights
    const highlights = [];
    if (winner) highlights.push({ emoji: '🏆', label: 'البطل', name: winner.name });
    if (sorted.length >= 2) highlights.push({ emoji: '🥈', label: 'الوصيف', name: sorted[1].name });
    const mvp = sorted.find(p => p.score > 0 && p.name !== winner?.name);
    if (mvp) highlights.push({ emoji: '⭐', label: 'نجم اللعبة', name: mvp.name });

    gameArea.innerHTML = `
      <div class="text-center py-4 animate__animated animate__fadeIn">
        <h2 class="mb-3">🎉 انتهت اللعبة!</h2>

        <!-- Winner spotlight -->
        <div class="card mx-auto mb-3 border-warning" style="max-width: 420px;">
          <div class="card-body">
            <div class="display-1 mb-2">${winner?.avatar || '🏆'}</div>
            <h4 class="card-title">${isWinner ? 'مبروك! أنت الفائز!' : `الفائز: ${winner?.name}`}</h4>
            <p class="display-4 fw-bold text-primary mb-0">${winner?.score || 0}</p>
            <small class="text-muted">نقطة</small>
          </div>
        </div>

        <!-- Highlights -->
        ${highlights.length > 0 ? `
        <div class="d-flex justify-content-center gap-3 mb-3 flex-wrap">
          ${highlights.map(h => `
            <div class="text-center px-3">
              <div class="fs-3">${h.emoji}</div>
              <div class="fw-bold small">${h.label}</div>
              <div class="text-muted small">${h.name}</div>
            </div>
          `).join('')}
        </div>` : ''}

        <!-- Stats -->
        <div class="d-flex justify-content-center gap-4 mb-3 text-muted small">
          <span><i class="fas fa-users"></i> ${sorted.length} لاعبين</span>
          <span><i class="fas fa-star"></i> ${totalPoints} نقطة إجمالي</span>
        </div>

        <!-- Leaderboard -->
        <div class="card mx-auto" style="max-width: 420px;">
          <div class="card-body p-0">
            <table class="table table-sm mb-0">
              <thead><tr><th>#</th><th>اللاعب</th><th class="text-center">النقاط</th></tr></thead>
              <tbody>
                ${sorted.map((p, i) => `<tr${p.name === myName ? ' class="table-primary"' : ''}>
                  <td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</td>
                  <td>${p.avatar || ''} ${p.name}</td>
                  <td class="text-center fw-bold">${p.score}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Actions -->
        <div class="d-flex justify-content-center gap-2 mt-3">
          <a href="/" class="btn btn-primary"><i class="fas fa-home"></i> الرئيسية</a>
          <button class="btn btn-success" onclick="location.reload()"><i class="fas fa-redo"></i> العب مرة تانية</button>
        </div>
      </div>
    `;
  }

  /**
   * Show a toast notification.
   * @param {string} message - Message text.
   * @param {string} [type='info'] - Type: 'info', 'success', 'error', 'warning'.
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container') || createToastContainer();
    const colorClass = { info: 'bg-info', success: 'bg-success', error: 'bg-danger', warning: 'bg-warning' }[type] || 'bg-info';

    const toast = document.createElement('div');
    toast.className = `toast show align-items-center text-white ${colorClass} border-0 mb-2`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function createToastContainer() {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'position-fixed top-0 end-0 p-3';
    c.style.zIndex = '1100';
    document.body.appendChild(c);
    return c;
  }

  return {
    updatePlayerList,
    updateScoreboard,
    updateStatus,
    updateRoundInfo,
    showMouthBasedBanner,
    showEndGameScreen,
    showToast,
  };
})();
