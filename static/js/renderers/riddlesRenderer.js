/**
 * Riddles Renderer — riddle display with hints and 3-attempt logic.
 * Fix B6-MAJOR-01: 3 attempts with diminishing points.
 * Fix B6-MINOR-01: Per-player hint cost.
 */

/* global convex, api, timer, sound, gameUI */

window.riddlesRenderer = (() => {
  function render(state, myName, roomId) {
    const gs = state.state;
    if (!gs) return;
    const area = document.getElementById('game-area');
    if (!area) return;
    const isHost = state.host === myName;

    // Check for lastResult first
    if (gs.lastResult) {
      const lr = gs.lastResult;
      area.innerHTML = `
        <div class="text-center py-4">
          ${lr.correct ? `<h4 class="text-success">${lr.player} حل اللغز! 🎉 (+${lr.points})</h4>` : ''}
          <p>الإجابة: <strong>${lr.answer}</strong></p>
          ${isHost ? `<button id="btn-next-riddle-result" class="btn btn-primary mt-3">اللغز التالي</button>` : ''}
        </div>`;
      document.getElementById('btn-next-riddle-result')?.addEventListener('click', () => {
        convex.mutate(api.games.riddles.nextRiddle, { roomId, playerName: myName });
      });
      return;
    }

    // Check if we need to start the round (no riddle loaded)
    if (state.status === 'round_active' && !gs.currentRiddle) {
      if (isHost) {
        area.innerHTML = `
          <div class="text-center py-4">
            <h4>اللغز ${gs.riddleIndex + 1} / ${gs.maxRiddles}</h4>
            <button id="btn-start-riddle-round" class="btn btn-primary btn-lg mt-3">ابدأ اللغز</button>
          </div>`;
        document.getElementById('btn-start-riddle-round')?.addEventListener('click', async () => {
          await convex.mutate(api.games.riddles.loadRiddle, { roomId });
        });
      } else {
        area.innerHTML = `
          <div class="text-center py-4">
            <h4>في انتظار اللغز...</h4>
          </div>`;
      }
      return;
    }

    if (state.status === 'round_active' && gs.currentRiddle) {
      const riddle = gs.currentRiddle;
      const myAttempts = (gs.playersAnswered || {})[myName] || 0;
      const canAnswer = myAttempts < 3;

      area.innerHTML = `
        <div class="py-3">
          <h5 class="text-center mb-3">اللغز ${(gs.riddleIndex || 0) + 1} / ${gs.maxRiddles}</h5>
          <div class="card mx-auto" style="max-width: 600px;">
            <div class="card-body">
              <h4 class="card-title text-center mb-4">${riddle.riddle || riddle.question || riddle.text || '...'}</h4>
              ${riddle.category ? `<p class="text-muted text-center">التصنيف: ${riddle.category}</p>` : ''}

              <!-- Hints -->
              <div class="mb-3">
                ${(gs.hintsRevealed > 0 && riddle.hints) ? 
                  riddle.hints.slice(0, gs.hintsRevealed).map((h, i) => 
                    `<div class="alert alert-warning py-1 mb-1"><small>تلميح ${i+1}: ${h}</small></div>`
                  ).join('') : ''}
              </div>

              <!-- Answer input -->
              ${canAnswer ? `
                <div class="d-flex flex-column flex-sm-row gap-2 mb-3">
                  <input type="text" id="riddle-answer" class="form-control flex-grow-1 text-end" 
                    placeholder="اكتب إجابتك..." dir="rtl" autofocus
                    style="min-height:48px;font-size:1.1rem;">
                  <button id="btn-submit-answer" class="btn btn-primary" style="min-height:48px;">
                    <i class="fas fa-paper-plane"></i> إرسال
                  </button>
                </div>
                <p class="text-muted text-center">محاولة ${myAttempts + 1} من 3</p>
              ` : '<p class="text-center text-danger">استنفدت محاولاتك الثلاث</p>'}

              <!-- Hint button at bottom -->
              ${gs.hintsRevealed < 3 ? `
                <div class="text-center mt-3">
                  <button id="btn-hint" class="btn btn-sm btn-outline-warning">
                    <i class="fas fa-lightbulb"></i> تلميح (${3 - gs.hintsRevealed} متبقي)
                  </button>
                </div>` : ''}

              <!-- Host controls -->
              ${isHost ? `
                <hr>
                <div class="d-flex justify-content-center">
                  <button id="btn-skip-riddle" class="btn btn-outline-secondary btn-sm">
                    <i class="fas fa-forward"></i> تخطي ← التالي
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>`;

      // Wire answer submission
      const answerInput = document.getElementById('riddle-answer');
      const submitBtn = document.getElementById('btn-submit-answer');
      if (submitBtn && answerInput) {
        const doSubmit = async () => {
          const answer = answerInput.value.trim();
          if (!answer) return;
          submitBtn.disabled = true;
          const result = await convex.mutate(api.games.riddles.submitAnswer, {
            roomId, playerName: myName, answer,
          });
          if (result?.correct) {
            sound.play('correct');
            gameUI.showToast(`إجابة صحيحة! +${result.points} نقاط`, 'success');
          } else {
            gameUI.showToast(result?.message || 'إجابة خاطئة', 'error');
            answerInput.value = '';
            submitBtn.disabled = false;
          }
        };
        submitBtn.addEventListener('click', doSubmit);
        answerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });
      }

      // Hint button
      document.getElementById('btn-hint')?.addEventListener('click', () => {
        convex.mutate(api.games.riddles.revealHint, { roomId, playerName: myName });
      });

      // Host skip control (consolidated — 6.2)
      document.getElementById('btn-skip-riddle')?.addEventListener('click', () => {
        convex.mutate(api.games.riddles.skipRiddle, { roomId, playerName: myName });
      });
    }
  }

  return { render };
})();
