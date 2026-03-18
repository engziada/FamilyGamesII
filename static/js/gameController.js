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
    if (!state) return;

    // Skip stale updates
    if (state.stateVersion <= _lastVersion) return;
    _lastVersion = state.stateVersion;

    // Store state for debugging
    window.__lastGameState = state;

    // Determine if current player is host
    const isHost = state.host === _playerName;

    // Set isHost attribute on host-only buttons for visibility control
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) {
      startBtn.dataset.isHost = isHost.toString();
    }
    const closeBtn = document.getElementById('btn-close-room');
    if (closeBtn) {
      closeBtn.dataset.isHost = isHost.toString();
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
