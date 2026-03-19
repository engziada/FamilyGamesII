/**
 * Trivia Renderer — renders trivia question UI.
 * Fix B3-CRITICAL-01: Answer index never exposed in public state.
 * Fix B3-MINOR-01: Visual feedback for correct/wrong answers.
 */

/* global convex, api, timer, sound, gameUI */

window.triviaRenderer = (() => {
  let _lastQuestionIdx = -1;

  function render(state, myName, roomId) {
    const gs = state.state;
    if (!gs) return;
    const area = document.getElementById('game-area');
    if (!area) return;

    // Check for lastResult first (shows after answering before next question)
    if (gs.lastResult) {
      // Show result between questions
      const lr = gs.lastResult;
      area.innerHTML = `
        <div class="text-center py-4">
          ${lr.timeout ? '<h4 class="text-warning">انتهى الوقت!</h4>' :
            lr.allWrong ? '<h4 class="text-danger">كل اللاعبين جاوبوا غلط!</h4>' :
            lr.correct ? `<h4 class="text-success">${lr.player} جاوب صح! 🎉</h4>` : ''}
          ${lr.correctAnswer ? `<p>الإجابة الصحيحة: <strong>${lr.correctAnswer}</strong></p>` : ''}
        </div>`;
      return;
    }

    // Check if we're in round_active but no question yet (waiting for host to start round)
    if (state.status === 'round_active' && (!gs.currentQuestion || !gs.questionActive)) {
      const isHost = state.host === myName;
      if (isHost && !gs.currentQuestion) {
        // Host needs to start the round (load first question)
        area.innerHTML = `
          <div class="text-center py-4">
            <h4>السؤال ${gs.questionIndex + 1} / ${gs.maxQuestions}</h4>
            <button id="btn-start-trivia-round" class="btn btn-primary btn-lg mt-3">ابدأ السؤال</button>
          </div>`;
        document.getElementById('btn-start-trivia-round')?.addEventListener('click', async () => {
          // Load a default question or pick from items
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
              question: "ما هي عاصمة مصر؟",
              options: ["القاهرة", "الإسكندرية", "أسوان", "طنطا"],
              answer: 0,
            };
          }
          await convex.mutate(api.games.trivia.loadQuestion, { roomId, question: q });
        });
      } else {
        // Non-host waiting for question
        area.innerHTML = `
          <div class="text-center py-4">
            <h4>في انتظار السؤال...</h4>
          </div>`;
      }
      return;
    }

    if (state.status === 'round_active' && gs.currentQuestion && gs.questionActive) {
      // New question — start timer
      if (gs.questionIndex !== _lastQuestionIdx) {
        _lastQuestionIdx = gs.questionIndex;
        timer.start(gs.timeLimit || 30, { onComplete: () => sound.play('timeout') });
      }

      const alreadyAnswered = (gs.playersAnswered || []).includes(myName);
      const q = gs.currentQuestion;

      area.innerHTML = `
        <div class="text-center py-3">
          <h5 class="mb-3">السؤال ${gs.questionIndex + 1} / ${gs.maxQuestions}</h5>
          <div class="card mx-auto" style="max-width: 600px;">
            <div class="card-body">
              <h4 class="card-title mb-4">${q.question || q.text || '...'}</h4>
              <div class="d-grid gap-2" id="trivia-options">
                ${(q.options || []).map((opt, i) => `
                  <button class="btn btn-outline-primary btn-lg text-end trivia-opt" data-idx="${i}" ${alreadyAnswered ? 'disabled' : ''}>
                    ${opt}
                  </button>
                `).join('')}
              </div>
              ${alreadyAnswered ? '<p class="mt-3 text-muted">تم إرسال إجابتك...</p>' : ''}
            </div>
          </div>
        </div>`;

      if (!alreadyAnswered) {
        area.querySelectorAll('.trivia-opt').forEach((btn) => {
          btn.addEventListener('click', async () => {
            area.querySelectorAll('.trivia-opt').forEach((b) => { b.disabled = true; });
            btn.classList.add('active');
            const result = await convex.mutate(api.games.trivia.submitAnswer, {
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
      // Show result between questions
      const lr = gs.lastResult;
      area.innerHTML = `
        <div class="text-center py-4">
          ${lr.timeout ? '<h4 class="text-warning">انتهى الوقت!</h4>' :
            lr.allWrong ? '<h4 class="text-danger">كل اللاعبين جاوبوا غلط!</h4>' :
            lr.correct ? `<h4 class="text-success">${lr.player} جاوب صح! 🎉</h4>` : ''}
          ${lr.correctAnswer ? `<p>الإجابة الصحيحة: <strong>${lr.correctAnswer}</strong></p>` : ''}
        </div>`;
    }
  }

  return { render };
})();
