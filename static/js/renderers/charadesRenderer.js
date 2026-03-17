/**
 * Charades Renderer — renders charades-specific game state.
 */

/* global convex, api, timer, sound, gameUI */

window.charadesRenderer = (() => {
  let _lastRoundStart = null;

  /**
   * Render charades game state.
   * @param {object} state - Public game state from Convex.
   * @param {string} myName - Current player name.
   * @param {string} roomId - Room ID.
   */
  function render(state, myName, roomId) {
    const gs = state.state;
    if (!gs) return;

    const isMyTurn = state.currentPlayer === myName;
    const area = document.getElementById('game-area');
    if (!area) return;

    if (state.status === 'waiting' || state.status === 'playing') {
      // Waiting for host to pick item / player to get ready
      if (isMyTurn && gs.currentItem) {
        renderPerformerView(area, gs, roomId, myName);
      } else if (isMyTurn && !gs.currentItem) {
        area.innerHTML = `
          <div class="text-center py-4">
            <h4>دورك! استعد للتمثيل</h4>
            <button id="btn-ready" class="btn btn-success btn-lg mt-3">أنا جاهز</button>
          </div>`;
        document.getElementById('btn-ready')?.addEventListener('click', () => {
          convex.mutate(api.games.charades.playerReady, { roomId, playerName: myName });
        });
      } else {
        area.innerHTML = `<div class="text-center py-4"><h4>دور ${state.currentPlayer} للتمثيل...</h4></div>`;
      }
    } else if (state.status === 'round_active') {
      if (isMyTurn) {
        renderPerformerView(area, gs, roomId, myName);
      } else {
        renderGuesserView(area, gs, state, roomId, myName);
      }

      // Start timer if new round
      if (gs.roundStartTime && gs.roundStartTime !== _lastRoundStart) {
        _lastRoundStart = gs.roundStartTime;
        const elapsed = Math.floor((Date.now() - gs.roundStartTime) / 1000);
        const remaining = Math.max(0, (gs.timeLimit || 90) - elapsed);
        timer.start(remaining, {
          onComplete: () => { sound.play('timeout'); },
        });
      }
    }
  }

  function renderPerformerView(area, gs, roomId, myName) {
    const item = gs.currentItem;
    area.innerHTML = `
      <div class="text-center py-4">
        <h3 class="mb-3">مثّل هذا:</h3>
        <div class="display-4 fw-bold text-primary mb-4">${item?.title || item?.name || '...'}</div>
        ${item?.category ? `<p class="text-muted">التصنيف: ${item.category}</p>` : ''}
        <div class="d-flex justify-content-center gap-3">
          <button id="btn-pass" class="btn btn-outline-secondary">
            <i class="fas fa-forward"></i> تخطي
          </button>
        </div>
      </div>`;
    document.getElementById('btn-pass')?.addEventListener('click', () => {
      convex.mutate(api.games.charades.passTurn, { roomId, playerName: myName });
    });
  }

  function renderGuesserView(area, gs, state, roomId, myName) {
    area.innerHTML = `
      <div class="text-center py-4">
        <h4>${state.currentPlayer} يمثل الآن...</h4>
        <p class="text-muted">حاول تخمين الكلمة!</p>
        <button id="btn-guess-correct" class="btn btn-success btn-lg mt-3">
          <i class="fas fa-check"></i> خمّنت صح!
        </button>
      </div>`;
    document.getElementById('btn-guess-correct')?.addEventListener('click', () => {
      convex.mutate(api.games.charades.guessCorrect, { roomId, guesserName: myName });
      sound.play('correct');
    });
  }

  return { render };
})();
