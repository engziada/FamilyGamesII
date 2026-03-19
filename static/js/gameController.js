/**
 * Game Controller — main orchestrator for the game page.
 *
 * Subscribes to Convex game state and delegates rendering
 * to game-type-specific renderer modules.
 */

/* global convex, api, timer, sound, gameUI, reactions */

const gameController = (() => {
  let _roomId = null;
  let _playerName = null;
  let _gameType = null;
  let _lastVersion = -1;
  let _unsub = null;
  let _lastHost = null;
  let _lastStatus = null;

  /**
   * Initialize the game controller.
   * @param {object} opts
   * @param {string} opts.roomId - Convex room ID.
   * @param {string} opts.playerName - Current player name.
   * @param {string} opts.gameType - Game type key.
   * @param {string} opts.convexUrl - Convex deployment URL.
   */
  function init(opts) {
    _roomId = opts.roomId;
    _playerName = opts.playerName;
    _gameType = opts.gameType;

    // Init Convex client
    convex.init(opts.convexUrl);

    // Init sounds
    sound.initDefaults();

    // Subscribe to game state
    _unsub = convex.subscribe(
      api.gameState.getPublicGameState,
      { roomId: _roomId, playerName: _playerName },
      handleStateUpdate
    );

    // Subscribe to reactions
    convex.subscribe(
      api.reactions.getRecentReactions,
      { roomId: _roomId },
      handleReactions
    );

    // Wire up common buttons
    wireCommonButtons();

    console.log(`[GameController] Initialized for ${_gameType} room ${_roomId}`);
  }

  /**
   * Handle game state updates from Convex subscription.
   * @param {object|null} state - Public game state.
   */
  function handleStateUpdate(state) {
    // Fix 1.6: null state means room was deleted → redirect
    if (!state) {
      gameUI.showToast('تم إغلاق الغرفة', 'warning');
      setTimeout(() => { window.location.href = '/'; }, 2000);
      return;
    }

    // Skip stale updates
    if (state.stateVersion <= _lastVersion) return;
    _lastVersion = state.stateVersion;

    // Store state for debugging
    window.__lastGameState = state;

    // Fix 1.4: Host transfer notification
    if (_lastHost && _lastHost !== state.host) {
      gameUI.showToast(`${state.host} أصبح المضيف الجديد`, 'info');
    }
    _lastHost = state.host;

    // Fix 1.3: Detect game reset to waiting (player left during game)
    if (_lastStatus && _lastStatus !== 'waiting' && state.status === 'waiting' && state.players.length < 2) {
      gameUI.showToast('لاعب غادر — في انتظار لاعبين', 'warning');
    }
    _lastStatus = state.status;

    // Determine if current player is host
    const isHost = state.host === _playerName;

    // Update room code display
    const roomCodeDisplay = document.getElementById('room-code-display');
    if (roomCodeDisplay && state.roomCode) {
      roomCodeDisplay.textContent = state.roomCode;
    }

    // Start game button: visible only for host during waiting, disabled when < 2 players
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) {
      startBtn.dataset.isHost = isHost.toString();
      startBtn.dataset.playerCount = state.players.length.toString();
      if (isHost && state.status === 'waiting') {
        startBtn.style.display = '';
        const hasEnoughPlayers = state.players.length >= 2;
        startBtn.disabled = !hasEnoughPlayers;
        startBtn.title = hasEnoughPlayers ? '' : 'يجب انضمام لاعب آخر على الأقل للبدء';
      } else {
        startBtn.style.display = 'none';
      }
    }

    // Close room button: visible only for host
    const closeBtn = document.getElementById('btn-close-room');
    if (closeBtn) {
      closeBtn.dataset.isHost = isHost.toString();
      closeBtn.style.display = isHost ? '' : 'none';
    }

    // Update common UI elements
    gameUI.updatePlayerList(state.players, _playerName);
    gameUI.updateScoreboard(state.players);
    gameUI.updateStatus(state.status, state.currentPlayer, _playerName);

    // Animate score changes (fly-up + confetti for big gains)
    if (typeof enhancements !== 'undefined') {
      enhancements.animateScoreChanges(state.players);
    }
    gameUI.updateRoundInfo(state.currentRound, state.settings);

    // Mouth-based game notification banner
    const isMouthBased = _gameType === 'twenty_questions' || _gameType === 'who_am_i';
    if (isMouthBased) {
      gameUI.showMouthBasedBanner(true);
    }

    // Game ended
    if (state.status === 'ended') {
      timer.stop();
      gameUI.showEndGameScreen(state.players, _playerName);
      // Confetti celebration for the winner
      if (typeof enhancements !== 'undefined') {
        enhancements.confettiCelebration();
        enhancements.haptic.vibrate('win');
      }
      sound.play('guessed');

      // 5.1: Auto-redirect countdown
      let secs = 5;
      const cdEl = document.getElementById('end-countdown');
      if (cdEl && !cdEl.dataset.started) {
        cdEl.dataset.started = '1';
        const iv = setInterval(() => {
          secs--;
          if (secs <= 0) { clearInterval(iv); window.location.href = '/'; return; }
          const strong = cdEl.querySelector('strong');
          if (strong) strong.textContent = String(secs);
        }, 1000);
      }
      return;
    }

    // Delegate to game-type-specific renderer
    const renderer = getRenderer(_gameType);
    if (renderer && renderer.render) {
      renderer.render(state, _playerName, _roomId);
    }
  }

  /**
   * Handle incoming reactions.
   * @param {Array} reactionList - Recent reactions.
   */
  function handleReactions(reactionList) {
    if (!reactionList || !reactionList.length) return;
    reactions.renderFloating(reactionList);
  }

  /**
   * Get the renderer module for a game type.
   * @param {string} gameType
   * @returns {object|null} Renderer module.
   */
  function getRenderer(gameType) {
    switch (gameType) {
      case 'charades': return window.charadesRenderer || null;
      case 'pictionary': return window.pictionaryRenderer || null;
      case 'trivia': return window.triviaRenderer || null;
      case 'rapid_fire': return window.rapidFireRenderer || null;
      case 'twenty_questions': return window.twentyQRenderer || null;
      case 'riddles': return window.riddlesRenderer || null;
      case 'bus_complete': return window.busCompleteRenderer || null;
      case 'who_am_i': return window.whoAmIRenderer || null;
      default: return null;
    }
  }

  /**
   * Wire up common buttons (leave, close, reactions).
   */
  function wireCommonButtons() {
    // Leave button
    const leaveBtn = document.getElementById('btn-leave');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', async () => {
        if (confirm('هل تريد مغادرة الغرفة؟')) {
          await convex.mutate(api.rooms.leaveRoom, {
            roomId: _roomId,
            playerName: _playerName,
          });
          window.location.href = '/';
        }
      });
    }

    // Close room button (host only)
    const closeBtn = document.getElementById('btn-close-room');
    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        if (confirm('هل تريد إغلاق الغرفة؟ سيتم طرد جميع اللاعبين.')) {
          await convex.mutate(api.rooms.closeRoom, {
            roomId: _roomId,
            playerName: _playerName,
          });
          window.location.href = '/';
        }
      });
    }

    // Copy code button — copies the short 4-digit room code
    const copyCodeBtn = document.getElementById('btn-copy-code');
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', () => {
        const code = document.getElementById('room-code-display')?.textContent.trim();
        if (code && code !== '----') {
          enhancements.copyToClipboard(code, copyCodeBtn);
        }
      });
    }

    // Also copy code on clicking the code display itself
    const roomCodeEl = document.getElementById('room-code-display');
    if (roomCodeEl) {
      roomCodeEl.addEventListener('click', () => {
        const code = roomCodeEl.textContent.trim();
        if (code && code !== '----') {
          enhancements.copyToClipboard(code, roomCodeEl);
        }
      });
    }

    // Wire "Share Link" button — copies the bare game URL (no player_name)
    // so the recipient lands on the join modal
    const shareBtn = document.getElementById('btn-share-link');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        const roomId = document.getElementById('full-room-id')?.textContent.trim();
        const joinUrl = `${window.location.origin}/game/${roomId}`;
        enhancements.copyToClipboard(joinUrl, shareBtn);
      });
    }

    // Start game button (host only)
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        try {
          await convex.mutate(api.gameState.startGame, {
            roomId: _roomId,
            playerName: _playerName,
          });
        } catch (e) {
          gameUI.showToast(e.message, 'error');
        }
      });
    }

    // Reaction buttons
    document.querySelectorAll('[data-emoji]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        convex.mutate(api.reactions.sendReaction, {
          roomId: _roomId,
          playerName: _playerName,
          emoji,
        });
      });
    });

    // Sound toggle
    const soundBtn = document.getElementById('btn-sound-toggle');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const muted = sound.toggleMute();
        soundBtn.innerHTML = muted
          ? '<i class="fas fa-volume-mute"></i>'
          : '<i class="fas fa-volume-up"></i>';
      });
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      convex.cleanupAll();
    });
  }

  /**
   * Getters for current context.
   */
  function getRoomId() { return _roomId; }
  function getPlayerName() { return _playerName; }
  function getGameType() { return _gameType; }

  return { init, getRoomId, getPlayerName, getGameType };
})();
