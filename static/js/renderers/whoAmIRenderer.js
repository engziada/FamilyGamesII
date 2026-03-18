/**
 * Who Am I Renderer — mouth-based gameplay (من أنا؟)
 *
 * Each player sees everyone's character EXCEPT their own.
 * Players ask yes/no questions verbally.
 * Host/player presses "خمّنت صح" when someone guesses correctly.
 */

/* global convex, api, gameUI */

window.whoAmIRenderer = (() => {
  function render(state, myName, roomId) {
    const gs = state.state;
    if (!gs) return;
    const area = document.getElementById('game-area');
    if (!area) return;
    const isHost = state.host === myName;

    // Show start round button if no assignments yet (waiting for host to start)
    const hasAssignments = gs.assignments && Object.keys(gs.assignments).length > 0;
    if ((state.status === 'waiting' || state.status === 'playing') && isHost && !hasAssignments) {
      area.innerHTML = `
        <div class="text-center py-4">
          <h4>من أنا؟</h4>
          <p class="text-muted">اضغط لبدء الجولة — سيتم توزيع الشخصيات</p>
          <button id="btn-start-who" class="btn btn-primary btn-lg">ابدأ الجولة</button>
        </div>`;
      // Start round will need characters — for now we pass empty
      // and let the frontend fetch from content
      document.getElementById('btn-start-who')?.addEventListener('click', async () => {
        // TODO: Fetch characters from Convex gameItems
        const defaultChars = [
          { name: 'محمد صلاح' }, { name: 'عمرو دياب' }, { name: 'أحمد زكي' },
          { name: 'نجيب محفوظ' }, { name: 'أم كلثوم' }, { name: 'فيروز' },
          { name: 'طه حسين' }, { name: 'عبد الحليم حافظ' }, { name: 'سميرة سعيد' },
          { name: 'أحمد حلمي' }, { name: 'ليلى مراد' }, { name: 'يوسف شاهين' },
        ];
        await convex.mutate(api.games.whoAmI.startRound, {
          roomId,
          characters: defaultChars,
        });
      });

    } else if (state.status === 'round_active' && gs.assignments) {
      const assignments = gs.assignments || {};
      const guessed = gs.guessedPlayers || [];
      const iGuessed = guessed.includes(myName);

      area.innerHTML = `
        <div class="py-3">
          <div class="alert alert-info text-center">
            <i class="fas fa-users"></i> اسألوا بعض أسئلة نعم/لا شفهياً لمعرفة شخصيتكم!
          </div>

          <div class="row g-3">
            ${state.players.map(p => {
              const char = assignments[p.name];
              const hasGuessed = guessed.includes(p.name);
              const isMe = p.name === myName;

              return `
                <div class="col-6 col-md-4">
                  <div class="card ${hasGuessed ? 'border-success' : ''} ${isMe ? 'bg-light' : ''}">
                    <div class="card-body text-center">
                      <h6 class="card-title">${p.avatar || ''} ${p.name}</h6>
                      ${isMe ? 
                        `<p class="display-6">❓</p><small class="text-muted">شخصيتك مخفية عنك</small>` :
                        `<p class="display-6 fw-bold text-primary">${char || '?'}</p>`}
                      ${hasGuessed ? '<span class="badge bg-success">خمّن صح ✓</span>' : ''}
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>

          ${!iGuessed ? `
            <div class="text-center mt-4">
              <p class="fw-bold">إذا خمّنت شخصيتك صح:</p>
              <button id="btn-i-guessed" class="btn btn-success btn-lg">
                <i class="fas fa-check-circle"></i> خمّنت شخصيتي صح!
              </button>
            </div>
          ` : `
            <div class="text-center mt-4">
              <p class="text-success fw-bold">أحسنت! لقد خمّنت شخصيتك: ${assignments[myName] ? '(مخفية)' : ''}</p>
            </div>
          `}

          ${isHost ? `
            <hr>
            <div class="text-center">
              <p class="text-muted">تأكيد تخمينات اللاعبين:</p>
              <div class="d-flex justify-content-center gap-2 flex-wrap" id="host-confirm-btns">
                ${state.players.filter(p => !guessed.includes(p.name)).map(p =>
                  `<button class="btn btn-outline-success btn-sm confirm-guess-btn" data-guesser="${p.name}">
                    ${p.name} خمّن صح ✓
                  </button>`
                ).join('')}
              </div>
            </div>
          ` : ''}
        </div>`;

      // Wire self-guess button
      document.getElementById('btn-i-guessed')?.addEventListener('click', () => {
        convex.mutate(api.games.whoAmI.guessedCorrectly, {
          roomId, callerName: myName, guesserName: myName,
        });
      });

      // Wire host confirm buttons
      area.querySelectorAll('.confirm-guess-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          convex.mutate(api.games.whoAmI.guessedCorrectly, {
            roomId, callerName: myName, guesserName: btn.dataset.guesser,
          });
        });
      });
    }
  }

  return { render };
})();
