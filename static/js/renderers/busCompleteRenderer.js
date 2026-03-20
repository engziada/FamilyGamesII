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

    // Show start-round button when game started but no letter yet (host initiates round)
    const usedLetters = gs.usedLetters || [];
    const letterPool = gs.letterPool || [];
    const remainingCount = letterPool.length;
    const usedBadges = usedLetters.map(l => `<span class="badge bg-secondary me-1">${l}</span>`).join('');

    if ((state.status === 'waiting' || state.status === 'round_active') && isHost && !gs.currentLetter) {
      area.innerHTML = `
        <div class="text-center py-4">
          <h4>أتوبيس كومبليت</h4>
          <p>الحروف المتبقية: <span class="badge bg-info">${remainingCount}</span></p>
          ${usedLetters.length > 0 ? `<p class="mb-2">الحروف المستخدمة: ${usedBadges}</p>` : ''}
          ${remainingCount > 0
            ? `<button id="btn-start-round" class="btn btn-primary btn-lg">ابدأ الجولة</button>`
            : `<p class="text-warning">انتهت جميع الحروف!</p>`}
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
            <h4>الحرف: <span class="badge bg-primary display-6">${gs.currentLetter}</span>
              <small class="text-muted ms-2" style="font-size:0.5em">متبقي: ${remainingCount}</small>
            </h4>
            <button id="btn-stop-bus" class="btn btn-danger btn-lg">
              <i class="fas fa-stop"></i> أتوبيس!
            </button>
          </div>
          <div class="row g-2 bus-categories">
            ${cats.map(c => `
              <div class="col-12">
                <div class="card h-100">
                  <div class="card-body p-2 d-flex flex-column flex-sm-row align-items-sm-center gap-2">
                    <label class="form-label fw-bold small mb-0 flex-shrink-0" style="min-width:100px;">${c}</label>
                    <input type="text" class="form-control text-end bus-input"
                      data-category="${c}" value="${myAnswers[c] || ''}"
                      dir="rtl" placeholder="${c}" style="min-height:44px;">
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;

      // Debounced answer sync
      area.querySelectorAll('.bus-input').forEach(input => {
        input.addEventListener('input', () => {
          clearTimeout(_debounceTimer);
          _debounceTimer = setTimeout(() => {
            const answers = {};
            area.querySelectorAll('.bus-input').forEach(inp => {
              // Encode category key to avoid Convex field name restrictions (ASCII only)
              answers[encodeURIComponent(inp.dataset.category)] = inp.value.trim();
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
          // Encode category key to avoid Convex field name restrictions (ASCII only)
          answers[encodeURIComponent(inp.dataset.category)] = inp.value.trim();
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
    const players = Object.keys(submissions);

    let html = `<div class="py-3"><h4 class="text-center mb-3">مرحلة التحقق من الإجابات</h4>`;
    html += `<p class="text-center text-muted">أوقف ${gs.stoppedBy || '?'} الأتوبيس</p>`;

    // Group by category, show distinct non-empty answers
    for (const cat of cats) {
      const encodedCat = encodeURIComponent(cat);
      // Collect all non-empty answers for this category with their players
      const answerMap = {};
      for (const player of players) {
        const answer = (submissions[player] || {})[encodedCat] || '';
        if (!answer.trim()) continue;
        const normalized = answer.trim();
        if (!answerMap[normalized]) answerMap[normalized] = [];
        answerMap[normalized].push(player);
      }

      // Skip entirely empty categories
      if (Object.keys(answerMap).length === 0) continue;

      html += `<div class="card mb-3">`;
      html += `<div class="card-header fw-bold bg-light">${cat}</div>`;
      html += `<ul class="list-group list-group-flush">`;

      for (const [answer, answerPlayers] of Object.entries(answerMap)) {
        // Use first player's key for validation status
        const firstKey = `${answerPlayers[0]}|${encodedCat}`;
        const status = validation[firstKey] || 'pending';
        const statusBadge = status === 'valid' ? '<span class="badge bg-success">✓</span>' :
          status === 'invalid' ? '<span class="badge bg-danger">✗</span>' :
          '<span class="badge bg-secondary">...</span>';

        const playerBadge = answerPlayers.length > 1
          ? `<span class="badge bg-info ms-1">${answerPlayers.length} لاعبين</span>`
          : `<span class="badge bg-secondary ms-1">${answerPlayers[0]}</span>`;

        // Check if current player has voted on this answer
        const canVote = !answerPlayers.includes(myName);
        const voteKey = firstKey;
        const answerVotes = state.state?.validationVotes?.[voteKey] || {};
        const myVote = answerVotes[myName];

        // Responsive layout: word and rank on one line, buttons on another for mobile
        html += `<li class="list-group-item">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span class="fw-bold">${answer} ${playerBadge}</span>
            <span>${statusBadge}</span>
          </div>
          ${canVote ? `
          <div class="d-flex gap-2 mt-2 justify-content-start">
            <button class="btn btn-sm ${myVote === true ? 'btn-success' : 'btn-outline-success'} vote-btn" data-key="${voteKey}" data-valid="true">✓ صح</button>
            <button class="btn btn-sm ${myVote === false ? 'btn-danger' : 'btn-outline-danger'} vote-btn" data-key="${voteKey}" data-valid="false">✗ غلط</button>
          </div>
          ` : ''}
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
