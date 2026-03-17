/**
 * Bus Complete Renderer (أتوبيس كومبليت)
 * Fix B7-CRITICAL-01: Atomic stopBus guard.
 * Fix B7-MAJOR-01: 3-second grace period.
 * Fix B7-MINOR-01: Separate ✓/✗ validation buttons.
 */

/* global convex, api, gameUI */

window.busCompleteRenderer = (() => {
  let _debounceTimer = null;

  function render(state, myName, roomId) {
    const gs = state.state;
    if (!gs) return;
    const area = document.getElementById('game-area');
    if (!area) return;
    const isHost = state.host === myName;

    if (state.status === 'waiting' && isHost && !gs.currentLetter) {
      area.innerHTML = `
        <div class="text-center py-4">
          <h4>أتوبيس كومبليت</h4>
          <p>اضغط لبدء الجولة</p>
          <button id="btn-start-round" class="btn btn-primary btn-lg">ابدأ الجولة</button>
        </div>`;
      document.getElementById('btn-start-round')?.addEventListener('click', () => {
        convex.mutate(api.games.busComplete.startRound, { roomId, playerName: myName });
      });

    } else if (state.status === 'round_active' && gs.currentLetter) {
      const cats = gs.categories || [];
      const myAnswers = (gs.submissions || {})[myName] || {};

      area.innerHTML = `
        <div class="py-3">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h4>الحرف: <span class="badge bg-primary display-6">${gs.currentLetter}</span></h4>
            <button id="btn-stop-bus" class="btn btn-danger btn-lg">
              <i class="fas fa-stop"></i> أتوبيس!
            </button>
          </div>
          <div class="table-responsive">
            <table class="table table-bordered">
              <thead><tr>${cats.map(c => `<th class="text-center">${c}</th>`).join('')}</tr></thead>
              <tbody><tr>
                ${cats.map(c => `
                  <td><input type="text" class="form-control text-end bus-input" 
                    data-category="${c}" value="${myAnswers[c] || ''}" 
                    dir="rtl" placeholder="${c}"></td>
                `).join('')}
              </tr></tbody>
            </table>
          </div>
        </div>`;

      // Debounced answer sync
      area.querySelectorAll('.bus-input').forEach(input => {
        input.addEventListener('input', () => {
          clearTimeout(_debounceTimer);
          _debounceTimer = setTimeout(() => {
            const answers = {};
            area.querySelectorAll('.bus-input').forEach(inp => {
              answers[inp.dataset.category] = inp.value.trim();
            });
            convex.mutate(api.games.busComplete.submitAnswers, {
              roomId, playerName: myName, answers,
            });
          }, 500);
        });
      });

      // Stop bus button
      document.getElementById('btn-stop-bus')?.addEventListener('click', () => {
        const answers = {};
        area.querySelectorAll('.bus-input').forEach(inp => {
          answers[inp.dataset.category] = inp.value.trim();
        });
        convex.mutate(api.games.busComplete.stopBus, {
          roomId, playerName: myName, answers,
        });
      });

    } else if (state.status === 'validating') {
      renderValidation(area, gs, state, myName, roomId, isHost);

    } else if (state.status === 'scoring') {
      area.innerHTML = `
        <div class="text-center py-4">
          <h4 class="text-success">تم حساب النقاط!</h4>
          ${isHost ? `<button id="btn-next-round" class="btn btn-primary btn-lg mt-3">الجولة التالية</button>` : 
            '<p class="text-muted">في انتظار المضيف...</p>'}
        </div>`;
      document.getElementById('btn-next-round')?.addEventListener('click', () => {
        convex.mutate(api.games.busComplete.nextRound, { roomId, playerName: myName });
      });
    }
  }

  function renderValidation(area, gs, state, myName, roomId, isHost) {
    const submissions = gs.submissions || {};
    const validation = gs.validationState || {};
    const cats = gs.categories || [];

    let html = `<div class="py-3"><h4 class="text-center mb-3">مرحلة التحقق من الإجابات</h4>`;
    html += `<p class="text-center text-muted">أوقف ${gs.stoppedBy || '?'} الأتوبيس</p>`;

    for (const [player, answers] of Object.entries(submissions)) {
      html += `<div class="card mb-3"><div class="card-header fw-bold">${player}</div>`;
      html += `<ul class="list-group list-group-flush">`;
      for (const cat of cats) {
        const answer = (answers)[cat] || '';
        const key = `${player}|${cat}`;
        const status = validation[key] || 'pending';
        const statusBadge = status === 'valid' ? '<span class="badge bg-success">✓</span>' :
          status === 'invalid' ? '<span class="badge bg-danger">✗</span>' :
          '<span class="badge bg-secondary">...</span>';

        html += `<li class="list-group-item d-flex justify-content-between align-items-center">
          <span><strong>${cat}:</strong> ${answer || '<em class="text-muted">فارغ</em>'}</span>
          <span>
            ${statusBadge}
            ${answer && player !== myName ? `
              <button class="btn btn-sm btn-outline-success ms-1 vote-btn" data-key="${key}" data-valid="true">✓</button>
              <button class="btn btn-sm btn-outline-danger ms-1 vote-btn" data-key="${key}" data-valid="false">✗</button>
            ` : ''}
          </span>
        </li>`;
      }
      html += `</ul></div>`;
    }

    if (isHost) {
      html += `<div class="text-center mt-3">
        <button id="btn-finalize" class="btn btn-success btn-lg">تأكيد النتائج وحساب النقاط</button>
      </div>`;
    }
    html += `</div>`;

    area.innerHTML = html;

    // Vote buttons
    area.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        convex.mutate(api.games.busComplete.submitValidationVote, {
          roomId, playerName: myName,
          answerKey: btn.dataset.key,
          isValid: btn.dataset.valid === 'true',
        });
      });
    });

    // Finalize button
    document.getElementById('btn-finalize')?.addEventListener('click', () => {
      convex.mutate(api.games.busComplete.finalizeValidation, { roomId, playerName: myName });
    });
  }

  return { render };
})();
