/**
 * Pictionary Renderer — drawing canvas with real-time strokes via Convex.
 * Fix B2-CRITICAL-01: Drawer identity checked server-side.
 * Fix B2-MAJOR-01: Canvas cleared on new round.
 * Fix B2-MINOR-01: Undo stroke support.
 */

/* global convex, api, timer, sound, gameUI */

window.pictionaryRenderer = (() => {
  let _canvas = null;
  let _ctx = null;
  let _drawing = false;
  let _lastRoundStart = null;
  let _lastStrokeCount = -1;
  let _listenersWired = false;
  let _drawerButtonsWired = false;
  let _guesserButtonsWired = false;

  function render(state, myName, roomId) {
    const gs = state.state;
    if (!gs) return;
    const area = document.getElementById('game-area');
    if (!area) return;

    const isMyTurn = state.currentPlayer === myName;

    if (state.status === 'playing' || state.status === 'round_active') {
      // Drawer needs to click "ready" first (like charades)
      if (isMyTurn && !gs.currentItem && !gs.roundStartTime) {
        area.innerHTML = `
          <div class="text-center py-4">
            <h4>دورك! استعد للرسم</h4>
            <button id="btn-ready-pic" class="btn btn-success btn-lg mt-3">أنا جاهز</button>
          </div>`;
        document.getElementById('btn-ready-pic')?.addEventListener('click', () => {
          convex.mutate(api.games.pictionary.playerReady, { roomId, playerName: myName });
        });
        return;
      }

      // Ensure canvas exists
      const canvasExisted = !!area.querySelector('#pictionary-canvas');
      const wasMyTurn = area.dataset.wasMyTurn === 'true';
      
      // Force re-render if turn changed (drawer <-> guesser)
      if (canvasExisted && wasMyTurn !== isMyTurn.toString()) {
        area.innerHTML = '';
        _listenersWired = false;
        _lastStrokeCount = -1;
      }
      
      if (!area.querySelector('#pictionary-canvas')) {
        area.innerHTML = `
          <div class="py-3">
            <div class="text-center mb-2">
              ${isMyTurn && gs.currentItem ? `<h5>ارسم: <span class="text-primary fw-bold">${gs.currentItem.title || gs.currentItem.name || '...'}</span></h5>` :
                `<h5>${state.currentPlayer} يرسم...</h5>`}
            </div>
            <div class="d-flex justify-content-center">
              <canvas id="pictionary-canvas" width="600" height="400" 
                style="border: 2px solid #333; border-radius: 8px; background: #fff; cursor: ${isMyTurn ? 'crosshair' : 'default'};"></canvas>
            </div>
            ${isMyTurn ? `
              <div class="d-flex justify-content-center gap-2 mt-2">
                <button id="btn-undo" class="btn btn-sm btn-outline-secondary" onclick="window.pictionaryRenderer.undo('${roomId}', '${myName}')"><i class="fas fa-undo"></i> تراجع</button>
                <button id="btn-clear" class="btn btn-sm btn-outline-danger" onclick="window.pictionaryRenderer.clear('${roomId}', '${myName}')"><i class="fas fa-trash"></i> مسح</button>
                <button id="btn-pass-pic" class="btn btn-sm btn-outline-warning" onclick="window.pictionaryRenderer.pass('${roomId}', '${myName}')"><i class="fas fa-forward"></i> تخطي</button>
              </div>
            ` : `
              <div class="text-center mt-3">
                <button id="btn-guess-correct-pic" class="btn btn-success btn-lg" onclick="window.pictionaryRenderer.guessCorrect('${roomId}', '${myName}')">
                  <i class="fas fa-check"></i> خمّنت صح!
                </button>
              </div>
            `}
          </div>`;

        // Reset listeners flag when creating new canvas
        _listenersWired = false;
        initCanvas(isMyTurn, roomId, myName);
      } else {
        // Canvas exists - update title and ensure event listeners are wired
        const titleEl = area.querySelector('h5');
        if (titleEl) {
          titleEl.innerHTML = isMyTurn && gs.currentItem 
            ? `ارسم: <span class="text-primary fw-bold">${gs.currentItem.title || gs.currentItem.name || '...'}</span>` 
            : `${state.currentPlayer} يرسم...`;
        }
        initCanvas(isMyTurn, roomId, myName);
      }
      
      // Store current turn state for next render comparison
      area.dataset.wasMyTurn = isMyTurn.toString();

      // Replay strokes from state (for guessers only - drawers see their own strokes)
      const strokes = gs.canvasStrokes || [];
      if (strokes.length !== _lastStrokeCount) {
        _lastStrokeCount = strokes.length;
        // Only clear and replay for non-drawers (guessers)
        // Drawer draws locally and strokes are synced via addStroke mutation
        if (!isMyTurn && _ctx && _canvas) {
          _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
          if (strokes.length > 0) {
            replayStrokes(strokes);
          }
        }
      }

      // Timer
      if (gs.roundStartTime && gs.roundStartTime !== _lastRoundStart) {
        _lastRoundStart = gs.roundStartTime;
        const elapsed = Math.floor((Date.now() - gs.roundStartTime) / 1000);
        const remaining = Math.max(0, (gs.timeLimit || 90) - elapsed);
        timer.start(remaining, { onComplete: () => sound.play('timeout') });
      }
    }
  }

  function initCanvas(isDrawer, roomId, myName) {
    _canvas = document.getElementById('pictionary-canvas');
    if (!_canvas) return;
    _ctx = _canvas.getContext('2d');
    _ctx.lineCap = 'round';
    _ctx.lineJoin = 'round';
    _ctx.lineWidth = 3;
    _ctx.strokeStyle = '#333';

    if (!isDrawer) return;

    // Only wire listeners once
    if (_listenersWired) return;
    _listenersWired = true;

    let currentStroke = [];

    _canvas.addEventListener('mousedown', (e) => {
      _drawing = true;
      const pt = getCanvasPoint(e);
      currentStroke = [pt];
      _ctx.beginPath();
      _ctx.moveTo(pt.x, pt.y);
    });

    _canvas.addEventListener('mousemove', (e) => {
      if (!_drawing) return;
      const pt = getCanvasPoint(e);
      currentStroke.push(pt);
      _ctx.lineTo(pt.x, pt.y);
      _ctx.stroke();
    });

    _canvas.addEventListener('mouseup', () => {
      if (!_drawing) return;
      _drawing = false;
      if (currentStroke.length > 1) {
        convex.mutate(api.games.pictionary.addStroke, {
          roomId, playerName: myName, stroke: currentStroke,
        });
      }
      currentStroke = [];
    });

    _canvas.addEventListener('mouseleave', () => { _drawing = false; });
  }

  function getCanvasPoint(e) {
    const rect = _canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (_canvas.width / rect.width),
      y: (e.clientY - rect.top) * (_canvas.height / rect.height),
    };
  }

  function replayStrokes(strokes) {
    if (!_ctx || !_canvas) return;
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    for (const stroke of strokes) {
      if (!stroke || stroke.length < 2) continue;
      _ctx.beginPath();
      _ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        _ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      _ctx.stroke();
    }
  }

  return { 
    render,
    undo: (roomId, playerName) => convex.mutate(api.games.pictionary.undoStroke, { roomId, playerName }),
    clear: (roomId, playerName) => {
      if (_ctx && _canvas) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      convex.mutate(api.games.pictionary.clearCanvas, { roomId, playerName });
    },
    pass: (roomId, playerName) => convex.mutate(api.games.pictionary.passTurn, { roomId, playerName }),
    guessCorrect: (roomId, guesserName) => {
      convex.mutate(api.games.pictionary.guessCorrect, { roomId, guesserName });
      sound.play('correct');
    },
  };
})();
