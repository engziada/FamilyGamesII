/**
 * Rapid Fire Renderer — buzz-in mechanics with server-side timers.
 * Fix B4-CRITICAL-01: Server-side buzz timer.
 * Fix B4-MAJOR-01: Options visible to ALL, only buzzer can click.
 */

/* global convex, api, timer, sound */

window.rapidFireRenderer = (() => {
  let _lastQuestionIdx = -1;

  function render(state, myName, roomId) {
    const gs = state.state;
    if (!gs) return;
    const area = document.getElementById('game-area');
    if (!area) return;

    // Check for lastResult first
    if (gs.lastResult) {
      const lr = gs.lastResult;
      area.innerHTML = `
        <div class="text-center py-4">
          ${lr.timeout ? '<h4 class="text-warning">انتهى الوقت!</h4>' :
            lr.allWrong ? '<h4 class="text-danger">كل اللاعبين جاوبوا غلط!</h4>' :
            lr.correct ? `<h4 class="text-success">${lr.player} جاوب صح! 🎉</h4>` : ''}
          ${lr.correctAnswer ? `<p>الإجابة: <strong>${lr.correctAnswer}</strong></p>` : ''}
        </div>`;
      return;
    }

    // Check if we need to start the round (no question loaded)
    if (state.status === 'round_active' && !gs.currentQuestion) {
      const isHost = state.host === myName;
      if (isHost) {
        area.innerHTML = `
          <div class="text-center py-4">
            <h4>السؤال ${gs.questionIndex + 1} / ${gs.maxQuestions}</h4>
            <button id="btn-start-rf-round" class="btn btn-primary btn-lg mt-3">ابدأ السؤال</button>
          </div>`;
        document.getElementById('btn-start-rf-round')?.addEventListener('click', async () => {
          const items = gs.questions || [];
          let q;
          if (items.length > 0) {
            const item = items[gs.questionIndex];
            // Transform gameItem to question format expected by backend
            q = {
              question: item.title || item.question,
              options: item.content?.options || item.options || [],
              answer: item.content?.answer ?? item.answer ?? 0,
            };
          } else {
            q = {
              question: "ما هي عاصمة فرنسا؟",
              options: ["باريس", "ليون", "مرسيليا", "نيس"],
              answer: 0,
            };
          }
          await convex.mutate(api.games.rapidFire.loadQuestion, { roomId, question: q });
        });
      } else {
        area.innerHTML = `
          <div class="text-center py-4">
            <h4>في انتظار السؤال...</h4>
          </div>`;
      }
      return;
    }

    const q = gs.currentQuestion;
    if (!q) return;

    if (state.status === 'round_active' && gs.questionActive && !gs.buzzedPlayer) {
      // Question active, no one buzzed yet
      if (gs.questionIndex !== _lastQuestionIdx) {
        _lastQuestionIdx = gs.questionIndex;
        timer.start(gs.timeLimit || 30, { onComplete: () => sound.play('timeout') });
      }

      // Only re-render if the buzz button doesn't exist
      const existingBuzz = area.querySelector('#btn-buzz');
      if (!existingBuzz) {
        const canBuzz = !gs.buzzFailed.includes(myName);
        area.innerHTML = `
          <div class="text-center py-3">
            <h5>السؤال ${gs.questionIndex + 1} / ${gs.maxQuestions}</h5>
            <div class="card mx-auto" style="max-width: 600px;">
              <div class="card-body">
                <h4 class="mb-4">${q.question || q.text || '...'}</h4>
                ${canBuzz ? `<button id="btn-buzz" class="btn btn-danger btn-lg pulse-animation mt-3">
                  <i class="fas fa-bell"></i> اضغط الجرس!
                </button>` : '<p class="text-muted">لقد أجبت خطأ — انتظر السؤال التالي</p>'}
              </div>
            </div>
          </div>`;

        document.getElementById('btn-buzz')?.addEventListener('click', () => {
          convex.mutate(api.games.rapidFire.buzzIn, { roomId, playerName: myName });
        });
      }
    } else if (state.status === 'buzzed' && gs.buzzedPlayer) {
      // Someone buzzed — show options
      const isBuzzer = gs.buzzedPlayer === myName;
      area.innerHTML = `
        <div class="text-center py-3">
          <h5>${gs.buzzedPlayer} ضغط الجرس! 🔔</h5>
          <div class="card mx-auto" style="max-width: 600px;">
            <div class="card-body">
              <h4 class="mb-4">${q.question || q.text || '...'}</h4>
              <div class="d-grid gap-2" id="buzz-options">
                ${(q.options || []).map((opt, i) => `
                  <button class="btn ${isBuzzer ? 'btn-outline-primary' : 'btn-outline-secondary'} btn-lg text-end buzz-opt"
                    data-idx="${i}" ${isBuzzer ? '' : 'disabled'}>
                    ${opt}
                  </button>
                `).join('')}
              </div>
              ${isBuzzer ? '<p class="mt-2 text-warning">أجب بسرعة!</p>' : `<p class="mt-2 text-muted">في انتظار إجابة ${gs.buzzedPlayer}...</p>`}
            </div>
          </div>
        </div>`;

      if (isBuzzer) {
        area.querySelectorAll('.buzz-opt').forEach((btn) => {
          btn.addEventListener('click', async () => {
            area.querySelectorAll('.buzz-opt').forEach((b) => { b.disabled = true; });
            const result = await convex.mutate(api.games.rapidFire.submitBuzzAnswer, {
              roomId, playerName: myName, answerIdx: parseInt(btn.dataset.idx),
            });
            if (result?.correct) {
              btn.classList.replace('btn-outline-primary', 'btn-success');
              sound.play('correct');
            } else {
              btn.classList.replace('btn-outline-primary', 'btn-danger');
            }
          });
        });
      }

    } else if (gs.lastResult) {
      const lr = gs.lastResult;
      area.innerHTML = `
        <div class="text-center py-4">
          ${lr.timeout ? '<h4 class="text-warning">انتهى الوقت!</h4>' :
            lr.allWrong ? '<h4 class="text-danger">كل اللاعبين جاوبوا غلط!</h4>' :
            lr.correct ? `<h4 class="text-success">${lr.player} جاوب صح! 🎉</h4>` : ''}
          ${lr.correctAnswer ? `<p>الإجابة: <strong>${lr.correctAnswer}</strong></p>` : ''}
        </div>`;
    }
  }

  return { render };
})();
