/**
 * Meen Yazood Renderer (مين يزود؟)
 *
 * Handles all UI phases: team lobby, bidding, performing, validating, scoring.
 * Oral answers only — no text input for answers.
 */

/* global convex, api, timer, sound, gameUI */

window.meenYazoodRenderer = (() => {
  let _lastRound = -1;
  let _lastStatus = null;

  /**
   * Main render entry point — delegates to phase-specific renderers.
   * @param {object} state - Full public game state from Convex.
   * @param {string} myName - Current player name.
   * @param {string} roomId - Convex room ID.
   */
  function render(state, myName, roomId) {
    const gs = state.state;
    if (!gs) return;

    const area = document.getElementById('game-area');
    if (!area) return;

    const isHost = state.host === myName;
    const myPlayer = state.players.find(p => p.name === myName);
    const myTeamId = myPlayer?.teamId || null;

    // Show team ribbon
    renderTeamRibbon(area, state.players, myTeamId, gs.teamScores);

    // Hide individual scoreboard — team ribbon handles scoring
    const scoreboard = document.getElementById('scoreboard');
    if (scoreboard) scoreboard.style.display = 'none';

    // Show mouth-based banner
    gameUI.showMouthBasedBanner(true);

    // Phase routing
    if (state.status === 'bidding') {
      if (gs.biddingPhase?.active) {
        renderBiddingPhase(area, gs, state, myName, myTeamId, roomId, isHost);
      } else {
        // Waiting for host to start next round
        renderWaitingForRound(area, gs, state, isHost, roomId);
      }
    } else if (state.status === 'performing') {
      renderPerformancePhase(area, gs, state, myName, myTeamId, roomId);
    } else if (state.status === 'validating') {
      renderValidationPhase(area, gs, state, myName, myTeamId, roomId);
    } else if (state.status === 'scoring') {
      renderScoringPhase(area, gs, state);
    } else if (state.status === 'waiting') {
      renderTeamLobby(area, state, myName, roomId, isHost);
    }
  }

  // ─── Team Ribbon ─────────────────────────────────────────────────

  /**
   * Render persistent team ribbon at top of game area.
   */
  function renderTeamRibbon(area, players, myTeamId, teamScores) {
    let ribbon = document.getElementById('myz-team-ribbon');
    if (!ribbon) {
      ribbon = document.createElement('div');
      ribbon.id = 'myz-team-ribbon';
      ribbon.className = 'mb-3';
      area.parentElement?.insertBefore(ribbon, area);
    }

    const teams = {};
    for (const p of players) {
      const tid = p.teamId || 0;
      if (!teams[tid]) teams[tid] = [];
      teams[tid].push(p.name);
    }

    let html = '<div class="d-flex justify-content-center gap-3 flex-wrap">';

    for (const [tid, members] of Object.entries(teams)) {
      if (tid === '0') continue;
      const color = teamColors[tid] || '#888';
      const name = teamLabels[tid] || `فريق ${tid}`;
      const score = teamScores?.[tid] ?? 0;
      const isMyTeam = Number(tid) === myTeamId;
      const border = isMyTeam ? 'border: 2px solid gold;' : '';

      html += `<div class="badge fs-6 px-3 py-2" style="background:${color}; ${border}">
        ${name}: ${score} نقاط
        <small class="d-block" style="font-size:0.7em">${members.join('، ')}</small>
      </div>`;
    }
    html += '</div>';
    ribbon.innerHTML = html;
  }

  // ─── Team Lobby ──────────────────────────────────────────────────

  const teamColors = { 1: '#e74c3c', 2: '#3498db', 3: '#2ecc71', 4: '#f39c12' };
  const teamBtnClasses = { 1: 'danger', 2: 'primary', 3: 'success', 4: 'warning' };
  const teamLabels = { 1: 'الفريق الأول', 2: 'الفريق الثاني', 3: 'الفريق الثالث', 4: 'الفريق الرابع' };

  /**
   * Render team assignment UI during waiting phase.
   * Host creates teams first, then all players pick teams.
   */
  function renderTeamLobby(area, state, myName, roomId, isHost) {
    const myPlayer = state.players.find(p => p.name === myName);
    const myTeamId = myPlayer?.teamId || 0;
    const teamCount = state.settings?.teamCount || 0;
    const teamsCreated = teamCount >= 2;

    if (!teamsCreated) {
      // Host must create teams first
      renderTeamCreation(area, state, myName, roomId, isHost);
    } else {
      // Teams created — players pick teams
      renderTeamSelection(area, state, myName, roomId, isHost, teamCount, myTeamId);
    }
  }

  /**
   * Host creates teams by choosing team count.
   */
  function renderTeamCreation(area, state, myName, roomId, isHost) {
    if (isHost) {
      area.innerHTML = `
        <div class="text-center py-4">
          <h4 class="mb-4"><i class="fas fa-users-cog"></i> إنشاء الفرق</h4>
          <p class="text-muted mb-3">اختر عدد الفرق</p>
          <div class="d-flex justify-content-center gap-3 mb-4">
            <button class="btn btn-lg btn-outline-primary" id="myz-create-2">فريقين (2)</button>
            <button class="btn btn-lg btn-outline-success" id="myz-create-3">3 فرق</button>
            <button class="btn btn-lg btn-outline-warning" id="myz-create-4">4 فرق</button>
          </div>
          <p class="text-muted small">سيتم انضمامك تلقائياً للفريق الأول</p>
        </div>`;

      [2, 3, 4].forEach(n => {
        document.getElementById(`myz-create-${n}`)?.addEventListener('click', async () => {
          try {
            await convex.mutate(api.games.meenYazood.createTeams, {
              roomId, playerName: myName, teamCount: n,
            });
          } catch (e) {
            gameUI.showToast(e.message, 'error');
          }
        });
      });
    } else {
      area.innerHTML = `
        <div class="text-center py-4">
          <h4 class="mb-3"><i class="fas fa-hourglass-half"></i> في انتظار المضيف</h4>
          <p class="text-muted">المضيف يقوم بإنشاء الفرق...</p>
        </div>`;
    }
  }

  /**
   * All players pick which team to join.
   */
  function renderTeamSelection(area, state, myName, roomId, isHost, teamCount, myTeamId) {
    // Build team buttons
    let teamBtns = '';
    for (let t = 1; t <= teamCount; t++) {
      const cls = teamBtnClasses[t] || 'secondary';
      const active = myTeamId === t;
      teamBtns += `<button class="btn btn-lg ${active ? 'btn-' + cls : 'btn-outline-' + cls}" id="myz-team-${t}">
        <i class="fas fa-flag"></i> ${teamLabels[t] || 'فريق ' + t}
      </button>`;
    }

    // Build team cards
    let teamCards = '';
    for (let t = 1; t <= teamCount; t++) {
      const cls = teamBtnClasses[t] || 'secondary';
      const members = state.players.filter(p => p.teamId === t);
      const membersList = members.length > 0
        ? members.map(p => `<div>${p.avatar || ''} ${p.name} ${p.name === state.host ? '👑' : ''}</div>`).join('')
        : '<div class="text-muted">لا يوجد لاعبين</div>';

      teamCards += `
        <div class="col">
          <div class="card border-${cls}">
            <div class="card-header bg-${cls} text-white">${teamLabels[t] || 'فريق ' + t}</div>
            <div class="card-body">${membersList}</div>
          </div>
        </div>`;
    }

    // Unassigned players
    const unassigned = state.players.filter(p => !p.teamId);
    const unassignedHtml = unassigned.length > 0
      ? `<div class="text-center mt-3 text-muted"><i class="fas fa-user-clock"></i> لم يختاروا فريق بعد: ${unassigned.map(p => p.name).join('، ')}</div>`
      : '';

    area.innerHTML = `
      <div class="text-center py-4">
        <h4 class="mb-4"><i class="fas fa-users"></i> اختر فريقك</h4>
        <div class="d-flex justify-content-center gap-3 mb-4 flex-wrap">${teamBtns}</div>
        <div class="row justify-content-center g-3" style="max-width:700px; margin:0 auto;">${teamCards}</div>
        ${unassignedHtml}
      </div>`;

    // Wire team buttons
    for (let t = 1; t <= teamCount; t++) {
      document.getElementById(`myz-team-${t}`)?.addEventListener('click', async () => {
        try {
          await convex.mutate(api.games.meenYazood.assignTeam, { roomId, playerName: myName, teamId: t });
        } catch (e) {
          gameUI.showToast(e.message, 'error');
        }
      });
    }
  }

  // ─── Waiting for Round ───────────────────────────────────────────

  /**
   * Between rounds — host starts next bidding round.
   */
  function renderWaitingForRound(area, gs, state, isHost, roomId) {
    const round = gs.currentRound || 0;
    const maxRounds = gs.maxRounds || 30;

    area.innerHTML = `
      <div class="text-center py-4">
        <h4>الجولة ${round + 1} من ${maxRounds}</h4>
        ${isHost ? `
          <button id="myz-start-round" class="btn btn-success btn-lg mt-3">
            <i class="fas fa-play"></i> ابدأ الجولة التالية
          </button>
          <button id="myz-end-game" class="btn btn-outline-danger mt-3 ms-2">
            <i class="fas fa-stop"></i> إنهاء اللعبة
          </button>
        ` : '<p class="text-muted mt-3">في انتظار المضيف لبدء الجولة...</p>'}
      </div>`;

    if (isHost) {
      document.getElementById('myz-start-round')?.addEventListener('click', async () => {
        try {
          await convex.mutate(api.games.meenYazood.startBidding, {
            roomId, playerName: state.host,
          });
        } catch (e) {
          gameUI.showToast(e.message, 'error');
        }
      });
      document.getElementById('myz-end-game')?.addEventListener('click', async () => {
        if (confirm('هل تريد إنهاء اللعبة؟')) {
          await convex.mutate(api.games.meenYazood.endGame, {
            roomId, playerName: state.host,
          });
        }
      });
    }
  }

  // ─── Bidding Phase ───────────────────────────────────────────────

  /**
   * Render auction-style bidding UI.
   */
  function renderBiddingPhase(area, gs, state, myName, myTeamId, roomId, isHost) {
    const bp = gs.biddingPhase;
    const question = gs.currentQuestion;
    const round = gs.currentRound || 1;
    const maxRounds = gs.maxRounds || 30;
    // Start timer on new round
    if (round !== _lastRound) {
      _lastRound = round;
      timer.start(gs.biddingTimeLimit || 35, { onComplete: () => sound.play('timeout') });
    }

    const leadingTeamName = bp.leadingTeam ? (teamLabels[bp.leadingTeam] || `فريق ${bp.leadingTeam}`) : '---';
    const isLeading = bp.leadingTeam === myTeamId;
    const minBid = bp.currentHighestBid + 1;

    // Bid history (last 5)
    const recentBids = (bp.bidHistory || []).slice(-5).reverse();
    const bidHistoryHtml = recentBids.map(b => {
      const tName = teamLabels[b.teamId] || `فريق ${b.teamId}`;
      return `<div class="small text-muted">${tName} زايد بـ <strong>${b.bid}</strong></div>`;
    }).join('');

    area.innerHTML = `
      <div class="text-center py-3">
        <div class="mb-2">
          <span class="badge bg-secondary">الجولة ${round} / ${maxRounds}</span>
          <span class="badge bg-info ms-1">${question?.category || ''}</span>
        </div>
        <div class="card mx-auto mb-3" style="max-width:500px;">
          <div class="card-body">
            <h3 class="card-title mb-0">${question?.question || '...'}</h3>
          </div>
        </div>

        <div class="card mx-auto mb-3 ${isLeading ? 'border-success' : 'border-danger'}" style="max-width:400px;">
          <div class="card-body text-center">
            <div class="fs-1 fw-bold">${bp.currentHighestBid || 0}</div>
            <div class="text-muted">أعلى مزايدة</div>
            <div class="mt-1 fw-bold" style="color:${isLeading ? 'green' : '#e74c3c'}">
              ${bp.currentHighestBid > 0 ? leadingTeamName + ' في المقدمة' : 'لم يزايد أحد بعد'}
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-center align-items-center gap-2 mb-3">
          <input type="number" id="myz-bid-input" class="form-control text-center"
                 style="max-width:120px; font-size:1.3em;"
                 min="${minBid}" max="50" value="${minBid}" placeholder="${minBid}">
          <button id="myz-bid-btn" class="btn btn-warning btn-lg">
            <i class="fas fa-gavel"></i> زايد!
          </button>
        </div>

        <div id="myz-bid-error" class="text-danger small mb-2"></div>

        <div class="mx-auto" style="max-width:300px;">
          <h6 class="text-muted">سجل المزايدات</h6>
          ${bidHistoryHtml || '<div class="text-muted small">لا توجد مزايدات بعد</div>'}
        </div>
      </div>`;

    // Wire bid button
    const bidBtn = document.getElementById('myz-bid-btn');
    const bidInput = document.getElementById('myz-bid-input');
    const bidError = document.getElementById('myz-bid-error');

    bidBtn?.addEventListener('click', async () => {
      const bidValue = parseInt(bidInput?.value);
      if (!bidValue || bidValue < minBid || bidValue > 50) {
        if (bidError) bidError.textContent = `يجب أن تكون المزايدة بين ${minBid} و 50`;
        return;
      }
      bidBtn.disabled = true;
      const result = await convex.mutate(api.games.meenYazood.submitBid, {
        roomId, playerName: myName, bid: bidValue,
      });
      if (result?.error) {
        if (bidError) bidError.textContent = result.error;
        bidBtn.disabled = false;
      } else {
        sound.play('correct');
      }
    });

    // Enter key submits bid
    bidInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') bidBtn?.click();
    });
  }

  // ─── Performance Phase ───────────────────────────────────────────

  /**
   * Render performance phase — performing team speaks, others listen.
   */
  function renderPerformancePhase(area, gs, state, myName, myTeamId, roomId) {
    const pp = gs.performancePhase;
    const question = gs.currentQuestion;
    const performingTeamName = teamLabels[pp.performingTeam] || `فريق ${pp.performingTeam}`;
    const isPerformingTeam = myTeamId === pp.performingTeam;

    // Start performance timer
    if (_lastStatus !== 'performing') {
      _lastStatus = 'performing';
      const duration = Math.min(pp.duration || 30, 150);
      timer.start(duration, { onComplete: () => sound.play('timeout') });
    }

    if (isPerformingTeam) {
      // Performing team view
      area.innerHTML = `
        <div class="text-center py-3">
          <div class="alert alert-success">
            <h4><i class="fas fa-microphone"></i> دوركم!</h4>
          </div>
          <div class="card mx-auto mb-3" style="max-width:500px;">
            <div class="card-body">
              <h3>${question?.question || '...'}</h3>
              <div class="fs-2 fw-bold text-primary mt-2">يجب ذكر ${pp.requiredCount} إجابات شفهياً</div>
            </div>
          </div>
          <p class="fs-5">🎤 ابدأوا بذكر الإجابات شفهياً الآن!</p>
          <button id="myz-stop-timer" class="btn btn-danger btn-lg mt-3">
            <i class="fas fa-stop-circle"></i> إيقاف المؤقت (انتهينا)
          </button>
        </div>`;

      document.getElementById('myz-stop-timer')?.addEventListener('click', async () => {
        await convex.mutate(api.games.meenYazood.stopTimer, { roomId, playerName: myName });
      });
    } else {
      // Observing team view
      area.innerHTML = `
        <div class="text-center py-3">
          <div class="alert alert-info">
            <h4><i class="fas fa-headphones"></i> استمعوا!</h4>
          </div>
          <div class="card mx-auto mb-3" style="max-width:500px;">
            <div class="card-body">
              <h3>${question?.question || '...'}</h3>
              <div class="fs-4 mt-2">${performingTeamName} يحاول ذكر <strong>${pp.requiredCount}</strong> إجابات</div>
            </div>
          </div>
          <p class="text-muted fs-5">🎧 استمعوا جيداً — سيُطلب منكم التصويت بعد الانتهاء</p>
        </div>`;
    }
  }

  // ─── Validation Phase ────────────────────────────────────────────

  /**
   * Render validation voting UI.
   */
  function renderValidationPhase(area, gs, state, myName, myTeamId, roomId) {
    const vp = gs.validationPhase;
    const pp = gs.performancePhase;
    const question = gs.currentQuestion;
    const performingTeamName = teamLabels[pp.performingTeam] || `فريق ${pp.performingTeam}`;
    const isPerformingTeam = myTeamId === pp.performingTeam;

    // Start validation timer
    if (_lastStatus !== 'validating') {
      _lastStatus = 'validating';
      timer.start(gs.validationTimeLimit || 15, { onComplete: () => sound.play('timeout') });
    }

    const hasVoted = vp.votes && vp.votes[String(myTeamId)];
    const voteCount = Object.keys(vp.votes || {}).length;

    if (isPerformingTeam) {
      // Performing team waits
      area.innerHTML = `
        <div class="text-center py-4">
          <h4>⏳ في انتظار تصويت الفرق الأخرى...</h4>
          <p class="text-muted">هل ذكرتم ${pp.requiredCount} إجابات صحيحة عن "${question?.question}"؟</p>
          <div class="fs-3">${voteCount} تصويت حتى الآن</div>
        </div>`;
    } else if (hasVoted) {
      // Already voted
      area.innerHTML = `
        <div class="text-center py-4">
          <h4>✅ تم تسجيل تصويتكم</h4>
          <p class="text-muted">في انتظار باقي الفرق...</p>
        </div>`;
    } else {
      // Vote UI
      area.innerHTML = `
        <div class="text-center py-3">
          <h4 class="mb-3">هل ذكر ${performingTeamName} ${pp.requiredCount} إجابات صحيحة؟</h4>
          <p class="text-muted mb-4">السؤال: <strong>${question?.question || ''}</strong></p>
          <div class="d-flex justify-content-center gap-3">
            <button id="myz-vote-confirm" class="btn btn-success btn-lg px-5">
              <i class="fas fa-check"></i> نعم، الإجابات صحيحة ✓
            </button>
            <button id="myz-vote-reject" class="btn btn-danger btn-lg px-5">
              <i class="fas fa-times"></i> لا، الإجابات خاطئة ✗
            </button>
          </div>
        </div>`;

      document.getElementById('myz-vote-confirm')?.addEventListener('click', async () => {
        await convex.mutate(api.games.meenYazood.submitValidation, {
          roomId, playerName: myName, vote: 'confirm',
        });
      });
      document.getElementById('myz-vote-reject')?.addEventListener('click', async () => {
        await convex.mutate(api.games.meenYazood.submitValidation, {
          roomId, playerName: myName, vote: 'reject',
        });
      });
    }
  }

  // ─── Scoring Phase ───────────────────────────────────────────────

  /**
   * Render scoring result between rounds.
   */
  function renderScoringPhase(area, gs, state) {
    const lr = gs.lastResult;
    if (!lr) {
      area.innerHTML = '<div class="text-center py-4"><h4>جاري حساب النتيجة...</h4></div>';
      return;
    }

    _lastStatus = 'scoring';

    if (lr.skipped) {
      area.innerHTML = `
        <div class="text-center py-4">
          <h4 class="text-warning"><i class="fas fa-forward"></i> ${lr.reason}</h4>
          <p class="text-muted">الجولة التالية قريباً...</p>
        </div>`;
      return;
    }

    const teamName = teamLabels[lr.performingTeam] || `فريق ${lr.performingTeam}`;
    const pointsMsg = lr.confirmed
      ? `<span class="text-success fw-bold">${teamName} +2 نقاط!</span>`
      : `<span class="text-danger">كل الفرق الأخرى +1 نقطة</span>`;

    area.innerHTML = `
      <div class="text-center py-4">
        ${lr.confirmed
          ? `<h3 class="text-success"><i class="fas fa-check-circle"></i> ${teamName} نجح! 🎉</h3>`
          : `<h3 class="text-danger"><i class="fas fa-times-circle"></i> ${teamName} لم ينجح</h3>`
        }
        <p class="mt-2">السؤال: <strong>${lr.question}</strong></p>
        <p>المطلوب: <strong>${lr.requiredCount}</strong> إجابات</p>
        <div class="d-flex justify-content-center gap-3 mt-3">
          <span class="badge bg-success fs-6 px-3 py-2">✓ موافق: ${lr.confirmCount}</span>
          <span class="badge bg-danger fs-6 px-3 py-2">✗ رفض: ${lr.rejectCount}</span>
        </div>
        <div class="mt-3 fs-5">${pointsMsg}</div>
        <p class="text-muted mt-3">الجولة التالية قريباً...</p>
      </div>`;

    if (lr.confirmed) {
      sound.play('guessed');
    }
  }

  return { render };
})();
