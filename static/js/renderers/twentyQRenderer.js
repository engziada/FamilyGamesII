/**
 * Twenty Questions Renderer — mouth-based gameplay.
 * Thinker picks word on screen, Q&A is verbal.
 * Thinker presses نعم/لا/ربما buttons after each verbal question.
 */

/* global convex, api, timer, sound, gameUI */

window.twentyQRenderer = (() => {
  function render(state, myName, roomId) {
    const gs = state.state;
    if (!gs) return;
    const area = document.getElementById('game-area');
    if (!area) return;

    const isThinker = gs.thinker === myName;
    const isHost = state.host === myName;

    if (state.status === 'thinking') {
      if (isThinker) {
        area.innerHTML = `
          <div class="text-center py-4">
            <h4>اختر كلمة سرية!</h4>
            <p class="text-muted">اختر كلمة وسيحاول اللاعبون تخمينها بالأسئلة</p>
            <div class="mx-auto" style="max-width: 400px;">
              <input type="text" id="secret-word" class="form-control form-control-lg mb-2 text-end" placeholder="الكلمة السرية" dir="rtl">
              <input type="text" id="secret-category" class="form-control mb-3 text-end" placeholder="التصنيف (اختياري)" dir="rtl">
              <button id="btn-set-secret" class="btn btn-primary btn-lg w-100">تأكيد الكلمة</button>
            </div>
          </div>`;
        document.getElementById('btn-set-secret')?.addEventListener('click', () => {
          const word = document.getElementById('secret-word').value.trim();
          const category = document.getElementById('secret-category').value.trim();
          if (!word) { gameUI.showToast('أدخل كلمة!', 'warning'); return; }
          convex.mutate(api.games.twentyQuestions.setSecretWord, {
            roomId, playerName: myName, word, category: category || undefined,
          });
        });
      } else {
        area.innerHTML = `
          <div class="text-center py-4">
            <h4><i class="fas fa-hourglass-half"></i> ${gs.thinker} يختار كلمة...</h4>
            <p class="text-muted">انتظر حتى يختار الكلمة السرية</p>
          </div>`;
      }

    } else if (state.status === 'asking') {
      // Q&A phase — verbal questions, thinker presses answer buttons
      const history = gs.answerHistory || [];

      area.innerHTML = `
        <div class="py-3">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5>الأسئلة: ${gs.questionCount} / ${gs.maxQuestions}</h5>
            ${gs.secretCategory ? `<span class="badge bg-info">التصنيف: ${gs.secretCategory}</span>` : ''}
          </div>

          ${isThinker ? `
            <div class="alert alert-primary text-center">
              <strong>كلمتك السرية:</strong> <span class="display-6">${gs.secretWord}</span>
            </div>
            <div class="text-center mb-3">
              <p>اللاعبون يسألون شفهياً — اضغط الزر المناسب:</p>
              <div class="d-flex justify-content-center gap-3">
                <button class="btn btn-success btn-lg answer-btn" data-answer="نعم">
                  <i class="fas fa-check"></i> نعم
                </button>
                <button class="btn btn-danger btn-lg answer-btn" data-answer="لا">
                  <i class="fas fa-times"></i> لا
                </button>
                <button class="btn btn-warning btn-lg answer-btn" data-answer="ربما">
                  <i class="fas fa-question"></i> ربما
                </button>
              </div>
            </div>
            <hr>
            <div class="text-center mb-3">
              <p class="text-muted">إذا خمّن أحدهم صح شفهياً:</p>
              <div class="d-flex justify-content-center gap-2 flex-wrap" id="guesser-btns">
                ${state.players.filter(p => p.name !== myName).map(p =>
                  `<button class="btn btn-outline-success guess-correct-btn" data-guesser="${p.name}">
                    ${p.name} خمّن صح ✓
                  </button>`
                ).join('')}
              </div>
            </div>
          ` : `
            <div class="alert alert-info text-center">
              <i class="fas fa-users"></i> اسأل ${gs.thinker} أسئلة نعم/لا شفهياً!
            </div>
          `}

          <div class="card mt-3">
            <div class="card-header">سجل الإجابات</div>
            <ul class="list-group list-group-flush" style="max-height: 300px; overflow-y: auto;">
              ${history.length === 0 ? '<li class="list-group-item text-muted text-center">لم يتم طرح أسئلة بعد</li>' :
                history.map(h => `
                  <li class="list-group-item d-flex justify-content-between">
                    <span>سؤال ${h.number}</span>
                    <span class="badge ${h.answer === 'نعم' ? 'bg-success' : h.answer === 'لا' ? 'bg-danger' : 'bg-warning'}">${h.answer}</span>
                  </li>
                `).join('')}
            </ul>
          </div>
        </div>`;

      // Wire answer buttons (thinker only)
      if (isThinker) {
        area.querySelectorAll('.answer-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            convex.mutate(api.games.twentyQuestions.recordAnswer, {
              roomId, playerName: myName, answer: btn.dataset.answer,
            });
          });
        });

        area.querySelectorAll('.guess-correct-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            convex.mutate(api.games.twentyQuestions.guessedCorrectly, {
              roomId, playerName: myName, guesserName: btn.dataset.guesser,
            });
          });
        });
      }
    }
  }

  return { render };
})();
