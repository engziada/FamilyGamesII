/**
 * Family Games - Charades Game & Lobby Logic
 */

const AudioManager = {
    sounds: {},
    enabled: true,

    init() {
        // Load sounds with error handling for missing files
        const soundFiles = {
            guessed: '/static/sounds/guessed.mp3',
            timeout: '/static/sounds/timeout.mp3'
        };
        
        Object.entries(soundFiles).forEach(([name, path]) => {
            try {
                const audio = new Audio(path);
                audio.addEventListener('error', () => {
                    console.warn(`Sound file not found: ${path}`);
                });
                this.sounds[name] = audio;
                audio.load();
            } catch (e) {
                console.warn(`Failed to load sound: ${name}`, e);
            }
        });
    },

    play(name) {
        if (!this.enabled) return;
        const sound = this.sounds[name];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => { });
        }
    }
};

// --- Lobby Logic ---

const Lobby = {
    socket: null,
    gameType: 'charades',
    pendingRoomPreview: null,

    init() {
        // Show connecting overlay
        this.showConnectingOverlay();
        
        if (!this.socket) {
            this.socket = io();
            this.setupListeners();
        }
    },

    showConnectingOverlay() {
        let overlay = document.getElementById('connecting-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'connecting-overlay';
            overlay.className = 'connecting-overlay';
            overlay.innerHTML = `
                <div class="connecting-content">
                    <i class="fas fa-spinner fa-spin fa-2x"></i>
                    <p>جاري الاتصال...</p>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.classList.remove('u-hidden');
    },

    hideConnectingOverlay() {
        const overlay = document.getElementById('connecting-overlay');
        if (overlay) overlay.classList.add('u-hidden');
    },

    setupListeners() {
        this.socket.on('connect', () => {
            this.hideConnectingOverlay();
        });
        
        this.socket.on('game_created', (data) => {
            this.updatePlayerList(data.players);
        });

        this.socket.on('room_preview', (data) => {
            this.pendingRoomPreview = data;
            this.showRoomPreview(data);
        });

        this.socket.on('join_success', (data) => {
            document.getElementById('join-form').classList.add('u-hidden');
            document.getElementById('join-preview').classList.add('u-hidden');
            document.getElementById('join-lobby').classList.remove('u-hidden');
            document.getElementById('join-room-id').textContent = document.getElementById('room-code').value;
            document.getElementById('join-game-title').textContent = data.preview?.game_title || 'غرفة لعبة';
            this.updatePlayerList(data.players, data.host);
        });

        this.socket.on('player_joined', (data) => {
            this.updatePlayerList(data.players);
            AudioManager.play('guessed');
        });

        this.socket.on('player_left', (data) => {
            this.updatePlayerList(data.players);
            AudioManager.play('timeout');
            Utils.showMessage(`${data.player_name} انسحب من اللعبة`, 'error');
        });

        this.socket.on('game_started', (data) => {
            AudioManager.play('guessed');
            const playerName = document.getElementById('player-name')?.value || document.getElementById('host-name')?.value;

            sessionStorage.setItem('gameData', JSON.stringify({
                gameId: data.game_id,
                playerName: playerName,
                transferId: data.transfer_id
            }));

            window.location.href = `${data.redirect_url}?transfer_id=${data.transfer_id}&player_name=${encodeURIComponent(playerName)}`;
        });

        this.socket.on('error', (data) => {
            console.error('Lobby error:', data);
            Utils.showError(data.message);
        });
    },

    createGame() {
        const hostName = document.getElementById('host-name').value.trim();
        if (!hostName) {
            Utils.showError('من فضلك اكتب اسمك');
            return;
        }

        const teams = document.getElementById('game-teams').value === 'true';
        const difficulty = document.getElementById('game-difficulty').value;
        const gameType = document.getElementById('modal-game-type').value;

        const timeLimitMap = {
            'easy': 120,
            'medium': 90,
            'hard': 60
        };

        const gameId = Math.floor(1000 + Math.random() * 9000);
        
        // Show loading state
        const createBtn = document.querySelector('#create-game-modal .btn-primary');
        if (createBtn) {
            createBtn.disabled = true;
            createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإنشاء...';
        }
        
        this.init();

        this.socket.emit('create_game', {
            game_id: gameId,
            player_name: hostName,
            game_type: gameType,
            settings: {
                teams: teams,
                difficulty: difficulty, // Send actual difficulty for Pictionary category hints
                custom_words: '',
                time_limit: timeLimitMap[difficulty] || 90
            }
        });

        document.getElementById('room-id').textContent = gameId;
        document.getElementById('room-info').classList.remove('u-hidden');
        document.querySelector('#create-game-modal .players-list').classList.remove('u-hidden');

        const buttonsDiv = document.querySelector('#create-game-modal .buttons');
        buttonsDiv.innerHTML = `
            <button id="start-game-btn" class="btn btn-primary" onclick="Lobby.startGame()" disabled>يالا نبدأ</button>
            <button class="btn btn-secondary" onclick="Utils.hideModal('create-game-modal')">إلغاء</button>
        `;

        const playersListDiv = document.querySelector('#create-game-modal .players-list');
        if (!document.getElementById('min-players-msg')) {
            const minPlayersMsg = document.createElement('p');
            minPlayersMsg.id = 'min-players-msg';
            minPlayersMsg.className = 'waiting-message badge badge-team-1';
            minPlayersMsg.style.width = '100%';
            minPlayersMsg.style.marginTop = '1rem';
            minPlayersMsg.textContent = 'في انتظار انضمام لاعب آخر على الأقل...';
            playersListDiv.appendChild(minPlayersMsg);
        }
    },

    previewRoom() {
        const playerName = document.getElementById('player-name').value.trim();
        const roomCode = document.getElementById('room-code').value.trim();

        if (!playerName || !roomCode) {
            Utils.showError('من فضلك اكتب اسمك ورقم الأوضة');
            return;
        }

        // Show loading state
        const joinBtn = document.querySelector('#join-form .btn-primary');
        if (joinBtn) {
            joinBtn.disabled = true;
            joinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري عرض الغرفة...';
        }

        this.init();
        this.pendingRoomPreview = null;
        this.socket.emit('preview_room', {
            game_id: roomCode,
            player_name: playerName
        });
    },

    showRoomPreview(preview) {
        document.getElementById('join-form').classList.add('u-hidden');
        document.getElementById('join-preview').classList.remove('u-hidden');
        document.getElementById('preview-room-id').textContent = preview.game_id;
        document.getElementById('preview-game-title').textContent = preview.game_title;
        document.getElementById('preview-host-name').textContent = preview.host;
        document.getElementById('preview-players-count').textContent = `${preview.players_count}`;
        document.getElementById('preview-room-status').textContent = preview.join_allowed
            ? 'الغرفة متاحة للانضمام الآن.'
            : (preview.join_block_reason || 'الانضمام غير متاح حالياً.');

        const confirmButton = document.getElementById('confirm-join-btn');
        if (confirmButton) {
            confirmButton.disabled = !preview.join_allowed;
            confirmButton.innerHTML = preview.join_allowed
                ? 'تأكيد الانضمام'
                : 'الانضمام غير متاح';
        }
    },

    backToJoinForm() {
        document.getElementById('join-preview').classList.add('u-hidden');
        document.getElementById('join-form').classList.remove('u-hidden');
        const joinBtn = document.querySelector('#join-form .btn-primary');
        if (joinBtn) {
            joinBtn.disabled = false;
            joinBtn.innerHTML = 'عرض الغرفة';
        }
    },

    joinGame() {
        const playerName = document.getElementById('player-name').value.trim();
        const roomCode = document.getElementById('room-code').value.trim();

        if (!this.pendingRoomPreview || !this.pendingRoomPreview.join_allowed) {
            Utils.showError(this.pendingRoomPreview?.join_block_reason || 'الغرفة غير متاحة للانضمام');
            return;
        }

        const confirmButton = document.getElementById('confirm-join-btn');
        if (confirmButton) {
            confirmButton.disabled = true;
            confirmButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الانضمام...';
        }

        this.socket.emit('join_game', {
            game_id: roomCode,
            player_name: playerName,
            game_type: this.pendingRoomPreview.game_type
        });
    },

    startGame() {
        const gameId = document.getElementById('room-id').textContent;
        const startButton = document.getElementById('start-game-btn');

        if (startButton && startButton.disabled) return;

        if (this.socket) {
            if (startButton) {
                startButton.disabled = true;
                startButton.textContent = 'جاري بدء اللعبة...';
            }
            this.socket.emit('start_game', { game_id: gameId });
        }
    },

    updatePlayerList(players, host) {
        const hostList = document.getElementById('host-players-list');
        const joinList = document.getElementById('join-players-list');
        const lists = [hostList, joinList].filter(list => list);

        lists.forEach(list => {
            list.innerHTML = '';
            players.forEach(player => {
                const li = document.createElement('li');
                const name = typeof player === 'object' ? player.name : player;
                const isHost = typeof player === 'object' ? player.isHost : (name === host);
                li.textContent = name;
                if (isHost) {
                    li.classList.add('host');
                    li.textContent += ' ';
                }
                list.appendChild(li);
            });
        });

        const startButton = document.getElementById('start-game-btn');
        const minPlayersMsg = document.getElementById('min-players-msg');

        if (startButton && minPlayersMsg) {
            if (players.length >= 2) {
                startButton.disabled = false;
                minPlayersMsg.textContent = 'يمكنك بدء اللعبة الآن!';
                minPlayersMsg.classList.remove('badge-team-1');
                minPlayersMsg.classList.add('badge-team-2');
            } else {
                startButton.disabled = true;
                minPlayersMsg.textContent = 'في انتظار انضمام لاعب آخر على الأقل...';
                minPlayersMsg.classList.remove('badge-team-2');
                minPlayersMsg.classList.add('badge-team-1');
            }
        }
    },

    leaveGame() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        Utils.hideModal('join-game-modal');
        window.location.href = '/';
    }
};

// --- Utilities ---

const Utils = {
    showGameModal(gameType, action) {
        const modalId = action === 'create' ? 'create-game-modal' : 'join-game-modal';
        if (action === 'create') {
            document.getElementById('modal-game-type').value = gameType;
            const titles = {
                charades: 'إنشاء غرفة بدون كلام',
                trivia: 'إنشاء غرفة بنك المعلومات',
                pictionary: 'إنشاء غرفة الرسم والتخمين',
                rapid_fire: 'إنشاء غرفة الأسئلة السريعة',
                twenty_questions: 'إنشاء غرفة عشرين سؤال',
                bus_complete: 'إنشاء غرفة أتوبيس كومبليت'
            };
            document.getElementById('modal-title').textContent = titles[gameType] || 'إنشاء غرفة لعبة';
        } else {
            Lobby.pendingRoomPreview = null;
        }
        document.getElementById(modalId).style.display = 'flex';
    },

    hideModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
        if (modalId === 'create-game-modal') {
            document.getElementById('host-name').value = '';
            document.getElementById('room-info').classList.add('u-hidden');
            document.getElementById('host-players-list').innerHTML = '';
            document.querySelector('#create-game-modal .players-list').classList.add('u-hidden');
            const buttonsDiv = document.querySelector('#create-game-modal .buttons');
            buttonsDiv.innerHTML = `
                <button type="button" class="btn btn-primary" onclick="Lobby.createGame()">أوضة جديدة</button>
                <button type="button" class="btn btn-secondary" onclick="Utils.hideModal('create-game-modal')">إلغاء</button>
            `;
        } else if (modalId === 'join-game-modal') {
            document.getElementById('player-name').value = '';
            document.getElementById('room-code').value = '';
            document.getElementById('join-form').classList.remove('u-hidden');
            document.getElementById('join-preview').classList.add('u-hidden');
            document.getElementById('join-lobby').classList.add('u-hidden');
            document.getElementById('join-players-list').innerHTML = '';
            const joinBtn = document.querySelector('#join-form .btn-primary');
            if (joinBtn) {
                joinBtn.disabled = false;
                joinBtn.innerHTML = 'عرض الغرفة';
            }
            const confirmButton = document.getElementById('confirm-join-btn');
            if (confirmButton) {
                confirmButton.disabled = false;
                confirmButton.innerHTML = 'تأكيد الانضمام';
            }
        }
    },

    // Escape key handler for modals
    setupModalKeyboardHandler() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modals = ['create-game-modal', 'join-game-modal'];
                modals.forEach(id => {
                    const modal = document.getElementById(id);
                    if (modal && modal.style.display === 'flex') {
                        this.hideModal(id);
                    }
                });
            }
        });
    },

    showError(message) {
        // Check if join modal is active
        const joinModal = document.getElementById('join-game-modal');
        const createModal = document.getElementById('create-game-modal');

        if (joinModal && joinModal.style.display === 'flex') {
            const joinErrorDiv = document.getElementById('join-error-message');
            if (joinErrorDiv) {
                joinErrorDiv.textContent = message;
                joinErrorDiv.style.display = 'block';
                setTimeout(() => joinErrorDiv.style.display = 'none', 5000);
                return;
            }
        }

        if (createModal && createModal.style.display === 'flex') {
            const createErrorDiv = document.getElementById('create-error-message');
            if (createErrorDiv) {
                createErrorDiv.textContent = message;
                createErrorDiv.style.display = 'block';
                setTimeout(() => createErrorDiv.style.display = 'none', 5000);
                return;
            }
        }

        // Fallback to game error message or alert
        const errorDiv = document.getElementById('error-message');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            setTimeout(() => errorDiv.style.display = 'none', 5000);
        } else {
            alert(message);
        }
    },

    showMessage(message, type = 'info') {
        const statusElement = document.getElementById('game-status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `${type} status-visible`;
            statusElement.style.display = 'flex';

            if (this.hideTimeout) clearTimeout(this.hideTimeout);

            this.hideTimeout = setTimeout(() => {
                statusElement.style.display = 'none';
                statusElement.classList.remove('status-visible');
            }, 4000);
        }
    }
};

// --- Game Logic ---

class GameEngine {
    constructor(gameId, playerName, transferId, isHost) {
        this.gameId = gameId;
        this.playerName = playerName;
        this.transferId = transferId;
        this.isHost = isHost;
        this.gameType = 'charades';
        this.socket = null;
        this.gameStatus = 'waiting';
        this.timerInterval = null;
        this.gameSettings = {};
        this.currentItemCategory = null;
        this.currentLetter = null;
        this.busInputsInitialized = false;
        this.currentRound = 0;
        this.totalRounds = 0;
        this.twentyQuestionsState = null;
        this.canvasInitialized = false;
        this.canvasResizeHandler = null;
        this.canvasStrokes = [];

        this.isDrawing = false;
        this.lastPos = { x: 0, y: 0 };
        this.ctx = null;

        this.init();
        this.setupBeforeUnload();
    }

    setupBeforeUnload() {
        window.addEventListener('beforeunload', (e) => {
            if (this.gameStatus === 'round_active' || this.gameStatus === 'playing') {
                e.preventDefault();
                e.returnValue = 'هل أنت متأكد أنك تريد المغادرة؟ قد تفقد تقدمك في اللعبة.';
                return e.returnValue;
            }
        });
    }

    toggleSound() {
        AudioManager.enabled = !AudioManager.enabled;
        const icon = document.getElementById('sound-icon');
        if (icon) {
            icon.className = AudioManager.enabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
        }
    }

    updateRoundIndicator(current, total) {
        this.currentRound = current || this.currentRound;
        this.totalRounds = total || this.totalRounds;
        const el = document.getElementById('round-indicator');
        if (el && this.currentRound > 0) {
            el.textContent = `الجولة ${this.currentRound} من ${this.totalRounds || '?'}`;
            el.classList.remove('u-hidden');
        }
    }

    init() {
        this.socket = io();
        this.socket.on('connect', () => {
            // Hide reconnect overlay if visible
            const overlay = document.getElementById('reconnect-overlay');
            if (overlay) overlay.classList.add('u-hidden');
            this.setupUIListeners();
            this.socket.emit('verify_game', {
                game_id: this.gameId,
                player_name: this.playerName,
                transfer_id: this.transferId
            });
        });
        
        // Handle disconnection with reconnection UI
        this.socket.on('disconnect', () => {
            console.warn('Socket disconnected');
            this.showReconnectOverlay();
        });
        
        this.setupSocketListeners();
    }

    showReconnectOverlay() {
        let overlay = document.getElementById('reconnect-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'reconnect-overlay';
            overlay.className = 'reconnect-overlay';
            overlay.innerHTML = `
                <div class="reconnect-content">
                    <i class="fas fa-wifi fa-2x animate-heartbeat"></i>
                    <p>انقطع الاتصال... جاري إعادة المحاولة</p>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.classList.remove('u-hidden');
    }

    setupUIListeners() {
        const bindClick = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = fn.bind(this);
        };

        bindClick('startButton', () => this.socket.emit('start_game', { game_id: this.gameId }));
        bindClick('nextButton', () => this.socket.emit('force_next_turn', { game_id: this.gameId }));
        bindClick('readyButton', () => {
            document.getElementById('readyButton').classList.add('u-hidden');
            this.socket.emit('player_ready', { game_id: this.gameId });
        });
        bindClick('guessButton', () => this.socket.emit('guess_correct', { game_id: this.gameId, player_name: this.playerName }));
        bindClick('passButton', () => this.socket.emit('player_passed', { game_id: this.gameId, player_name: this.playerName }));
        bindClick('buzzButton', () => this.buzzIn());

        bindClick('close-room', () => {
            if (confirm('هل أنت متأكد أنك تريد إغلاق الغرفة؟')) {
                this.requestExit('close');
            }
        });

        bindClick('leaveButton', () => {
            if (confirm('هل أنت متأكد أنك تريد الانسحاب؟')) {
                this.requestExit('leave');
            }
        });
    }

    requestExit(action) {
        sessionStorage.removeItem('gameData');
        if (action === 'close') {
            this.socket.emit('close_room', { roomId: this.gameId, playerName: this.playerName });
            setTimeout(() => {
                window.location.href = '/';
            }, 1200);
            return;
        }
        this.socket.emit('leave_game', { roomId: this.gameId, playerName: this.playerName });
        setTimeout(() => {
            window.location.href = '/';
        }, 250);
    }

    setupSocketListeners() {
        this.socket.on('game_state', (data) => {
            this.gameType = data.game_type || 'charades';
            this.updateGameState(data);
        });
        this.socket.on('timer_start', (data) => this.startTimer(data.duration));
        this.socket.on('correct_guess', (data) => {
            AudioManager.play('guessed');
            Utils.showMessage(`${data.guesser} عرف الإجابة!`);
        });

        this.socket.on('round_timeout', (data) => {
            this.stopTimer();
            this.playTimeoutTwice();
            if (data.game_status) this.setGameStatus(data.game_status);
            if (data.next_player) this.updateCurrentPlayer(data.next_player);
        });

        this.socket.on('force_reset_timer', (data) => {
            this.stopTimer();
            if (data.game_status) this.setGameStatus(data.game_status);
            if (data.next_player) this.updateCurrentPlayer(data.next_player);
            if (data.current_player) this.updateCurrentPlayer(data.current_player);
            // Play sound for new turn
            AudioManager.play('guessed');
        });

        this.socket.on('pass_turn', (data) => {
            this.stopTimer();
            if (data.game_status) this.setGameStatus(data.game_status);
            if (data.next_player) this.updateCurrentPlayer(data.next_player);
            AudioManager.play('timeout');
            Utils.showMessage(`${data.player} تخطى دوره! دور ${data.next_player}`, 'info');
        });

        this.socket.on('new_item', (data) => {
            if (data && data.item) {
                this.currentItemCategory = data.category;
                this.displayItem(data.category, data.item);
            }
        });

        this.socket.on('new_question', (data) => {
            if (!data) return;
            if (this.gameType === 'twenty_questions') return;
            if (this.gameType === 'riddles') return;
            this.displayQuestion(data);
        });

        this.socket.on('answer_result', (data) => {
            if (data.is_correct) {
                AudioManager.play('guessed');
                Utils.showMessage(`${data.player} جاوب صح ✅. الإجابة كانت: ${data.correct_answer}`);
            } else {
                AudioManager.play('timeout');
                Utils.showMessage(`${data.player} جاوب غلط ❌`);
            }
        });

        this.socket.on('all_wrong', (data) => {
            Utils.showMessage(data.message);
        });

        this.socket.on('draw', (stroke) => {
            if (this.gameType === 'pictionary') {
                this.canvasStrokes.push(stroke);
                this.drawStroke(stroke);
            }
        });

        this.socket.on('clear_canvas', () => {
            if (this.gameType === 'pictionary') {
                this.canvasStrokes = [];
                this.clearLocalCanvas();
            }
        });

        this.socket.on('sync_canvas', (data) => {
            if (this.gameType === 'pictionary') {
                this.canvasStrokes = Array.isArray(data) ? data : [];
                this.redrawCanvasStrokes();
            }
        });

        this.socket.on('reveal_item', (data) => this.showRevealMessage(data));

        // Rapid Fire events
        this.socket.on('player_buzzed', (data) => {
            AudioManager.play('guessed');
            this.handlePlayerBuzzed(data);
        });

        this.socket.on('buzz_rejected', (data) => {
            Utils.showMessage(data.message, 'error');
        });

        this.socket.on('buzz_answer_result', (data) => {
            if (data.is_correct) {
                AudioManager.play('guessed');
                Utils.showMessage(`${data.player} جاوب صح! ✅ الإجابة: ${data.correct_answer}`);
            } else {
                AudioManager.play('timeout');
                Utils.showMessage(`${data.player} جاوب غلط ❌`);
            }
            this.clearBuzzState();
        });

        this.socket.on('buzz_timed_out', (data) => {
            AudioManager.play('timeout');
            Utils.showMessage(`${data.player} لم يجب في الوقت! ⏰`);
            this.clearBuzzState();
        });

        this.socket.on('all_buzzed_wrong', (data) => {
            Utils.showMessage(`${data.message} الإجابة الصحيحة: ${data.correct_answer}`);
        });

        this.socket.on('question_timeout', (data) => {
            this.stopTimer();
            Utils.showMessage(`انتهى الوقت! الإجابة الصحيحة: ${data.correct_answer}`);
        });

        // Twenty Questions events
        this.socket.on('twenty_questions_started', (data) => {
            Utils.showMessage(`الجولة بدأت! ${data.thinker} يفكر بكلمة...`, 'info');
            if (data.thinker === this.playerName) {
                Utils.showMessage(`أنت المفكر! اختر كلمة من: ${data.word_suggestion.word} (${data.word_suggestion.category})`, 'info');
            }
            this.handleTwentyQuestionsStarted(data);
        });

        this.socket.on('secret_set', (data) => {
            Utils.showMessage(`تم تحديد الكلمة! الفئة: ${data.category}`, 'info');
            this.handleSecretSet(data);
        });

        this.socket.on('question_asked', (data) => {
            this.handleQuestionAsked(data);
        });

        this.socket.on('waiting_for_answer', (data) => {
            if (this.thinker === this.playerName) {
                Utils.showMessage(`جاوب: "${data.question}"`, 'info');
            }
        });

        this.socket.on('question_answered', (data) => {
            this.handleQuestionAnswered(data);
        });

        this.socket.on('guess_made', (data) => {
            if (data.correct) {
                AudioManager.play('guessed');
                Utils.showMessage(`${data.player} خمن صح! ${data.message}`, 'success');
            } else {
                AudioManager.play('timeout');
                Utils.showMessage(`${data.player} خمن غلط: ${data.guess}`, 'error');
            }
        });

        this.socket.on('twenty_questions_ended', (data) => {
            AudioManager.play('guessed');
            Utils.showMessage(`انتهت الجولة! الفائز: ${data.winner} | الكلمة: ${data.word}`, 'info');
            this.handleTwentyQuestionsEnded(data);
        });

        // Riddles events
        this.socket.on('riddles_started', () => {
            Utils.showMessage('الألغاز بدأت! اقرأ اللغز وجاوب!', 'info');
            this.handleRiddlesStarted();
        });

        this.socket.on('riddle_answer_result', (data) => {
            if (data.correct) {
                AudioManager.play('guessed');
                Utils.showMessage(`${data.player} جاوب صح! الإجابة: ${data.answer}`, 'success');
            } else {
                AudioManager.play('timeout');
                Utils.showMessage(data.message, 'error');
            }
            this.clearRiddleAnswerInput();
        });

        this.socket.on('hint_revealed', (data) => {
            Utils.showMessage(`تلميح جديد: ${data.hint}`, 'info');
            this.displayHint(data.hint, data.hints_remaining);
        });

        this.socket.on('riddle_skipped', (data) => {
            Utils.showMessage(data.message, 'info');
            this.showRiddleAnswer(data.answer);
        });

        this.socket.on('new_riddle', () => {
            Utils.showMessage('لغز جديد!', 'info');
            this.clearRiddleHints();
        });

        this.socket.on('bus_stopped', (data) => {
            this.stopTimer();
            AudioManager.play('timeout');
            Utils.showMessage(`أتوبيس كومبليت! تم إيقاف الجولة بواسطة ${data.player}`, 'info');
        });

        this.socket.on('validation_updated', (data) => {
            // Update the validation card for this answer
            const card = document.querySelector(`.validation-card[data-answer-key="${data.answer_key}"]`);
            if (card) {
                const status = data.status;

                // Update card state
                card.classList.remove('pending', 'valid', 'invalid');
                if (status.is_valid === true) {
                    card.classList.add('valid');
                } else if (status.is_valid === false) {
                    card.classList.add('invalid');
                } else {
                    card.classList.add('pending');
                }

                // Update vote counts
                const voteValidSpan = card.querySelector('.vote-valid');
                const voteInvalidSpan = card.querySelector('.vote-invalid');
                if (voteValidSpan) voteValidSpan.innerHTML = `<i class="fas fa-check"></i> ${status.valid_count}`;
                if (voteInvalidSpan) voteInvalidSpan.innerHTML = `<i class="fas fa-times"></i> ${status.invalid_count}`;

                // Update user vote indicator
                let indicator = card.querySelector('.user-vote-indicator');
                const playerVote = status.votes && status.votes[this.playerName];

                if (playerVote !== undefined) {
                    if (!indicator) {
                        indicator = document.createElement('div');
                        indicator.className = 'user-vote-indicator';
                        card.appendChild(indicator);
                    }
                    indicator.className = `user-vote-indicator ${playerVote ? 'valid' : 'invalid'}`;
                    indicator.innerHTML = `<i class="fas fa-${playerVote ? 'check' : 'times'}"></i>`;
                } else if (indicator) {
                    indicator.remove();
                }

                // Update progress
                this.updateValidationProgress();
            }
        });

        this.socket.on('validation_finalized', () => {
            Utils.showMessage('تم التحقق من الإجابات وجاري حساب النقاط...', 'info');
        });

        this.socket.on('host_transferred', (data) => {
            if (data.gameState) this.updateGameState(data.gameState);
            Utils.showMessage(data.message);
            if (data.newHost === this.playerName) {
                this.isHost = true;
                setTimeout(() => window.location.reload(), 2000);
            }
        });

        this.socket.on('room_closed', (data) => {
            Utils.showError(data.message);
            setTimeout(() => window.location.href = '/', 2000);
        });

        this.socket.on('error', (data) => Utils.showError(data.message));
        this.socket.on('game_error', (data) => Utils.showError(data.message));
    }

    updateGameState(data) {
        if (!data) return;

        if (data.settings) this.gameSettings = data.settings;
        if (data.status) this.setGameStatus(data.status);
        if (data.message) Utils.showMessage(data.message);
        if (data.players) this.updatePlayersList(data.players);
        if (data.current_player !== undefined) this.updateCurrentPlayer(data.current_player);
        if (data.scores || data.team_scores) this.updateScores(data);

        if (this.gameType === 'twenty_questions') {
            this.twentyQuestionsState = {
                ...(this.twentyQuestionsState || {}),
                ...data
            };
            this.renderTwentyQuestionsState(this.twentyQuestionsState);
            this.updateButtonVisibility();
            return;
        }

        if (data.current_question && this.gameType === 'rapid_fire') {
            this.displayRapidFireQuestion(data);
        } else if (data.current_question) {
            this.displayQuestion(data.current_question);
        } else if (this.gameType === 'riddles' && data.current_riddle) {
            this.currentRiddle = data.current_riddle;
            this.roundNumber = data.round_number;
            this.updateRiddlesUI(data.current_riddle);
        } else if (this.gameType === 'bus_complete') {
            if (data.current_letter) {
                this.currentLetter = data.current_letter;
                const letterEl = document.getElementById('current-letter');
                if (letterEl) letterEl.textContent = data.current_letter;
                const resLetterEl = document.getElementById('result-letter');
                if (resLetterEl) resLetterEl.textContent = data.current_letter;
            }
            if (data.status === 'scoring') {
                this.displayBusResults(data);
            } else if (data.status === 'validating') {
                this.displayBusValidation(data);
            } else if (data.status === 'round_active') {
                this.displayBusBoard();
            }
        } else if (data.current_item) {
            this.currentItemCategory = data.current_item.category;
            // Only call displayItem if we have the full item (drawer player)
            // For non-drawer players in Pictionary, we only get {category: "..."}
            if (data.current_item.item) {
                this.displayItem(data.current_item.category, data.current_item);
            }
        }

        this.updateButtonVisibility();
    }

    updateCurrentPlayer(playerName) {
        const currentTurnEl = document.getElementById('current-turn');
        if (currentTurnEl) {
            currentTurnEl.textContent = playerName || '...';
        }

        if (playerName !== undefined) {
            this.currentPlayer = playerName;
        }

        this.updateButtonVisibility();
    }

    setGameStatus(status) {
        if (this.gameStatus !== status) {
            this.gameStatus = status;

            // Clear item display when transitioning to 'playing' (waiting for next round)
            if (status === 'playing') {
                const itemDisplay = document.getElementById('item-display');
                if (itemDisplay) {
                    itemDisplay.innerHTML = '';
                    itemDisplay.classList.remove('visible');
                    itemDisplay.style.display = 'none';
                }
                // Clear the stored category
                this.currentItemCategory = null;

                // Hide Pictionary canvas between rounds
                if (this.gameType === 'pictionary') {
                    document.getElementById('pictionary-area')?.classList.add('u-hidden');
                }
            }

            // Show Pictionary canvas and controls when round starts
            if (status === 'round_active' && this.gameType === 'pictionary') {
                const pArea = document.getElementById('pictionary-area');
                if (pArea) {
                    pArea.classList.remove('u-hidden');
                    this.initCanvas();
                }
            }

            this.updateButtonVisibility();
        }
    }

    updateButtonVisibility() {
        const btns = {
            ready: document.getElementById('readyButton'),
            guess: document.getElementById('guessButton'),
            start: document.getElementById('startButton'),
            next: document.getElementById('nextButton'),
            pass: document.getElementById('passButton')
        };

        const waitingArea = document.getElementById('waiting-area');

        Object.values(btns).forEach(b => { if (b) b.classList.add('u-hidden'); });

        const currentPlayer = document.getElementById('current-turn').textContent.trim();

        if (waitingArea) {
            // Show waiting area in lobby ('waiting') or between rounds ('playing')
            // But hide it for game types that manage their own active display
            const selfManagedTypes = ['twenty_questions', 'riddles', 'rapid_fire'];
            const isActive = this.gameStatus !== 'waiting';
            const showWaiting = this.gameStatus === 'playing' || (this.gameStatus === 'waiting' && this.gameType !== 'trivia');
            waitingArea.style.display = (showWaiting && !(isActive && selfManagedTypes.includes(this.gameType))) ? 'block' : 'none';
        }

        switch (this.gameStatus) {
            case 'waiting':
                if (btns.start && this.isHost) btns.start.classList.remove('u-hidden');
                break;
            case 'playing':
                if (this.gameType !== 'trivia') {
                    if (btns.ready && currentPlayer === this.playerName) btns.ready.classList.remove('u-hidden');
                }
                if (btns.next && this.isHost) btns.next.classList.remove('u-hidden');
                break;
            case 'round_active':
                if (this.gameType === 'charades' || this.gameType === 'pictionary') {
                    // Show Guess button only to non-current player (not the performer)
                    if (btns.guess && currentPlayer !== this.playerName) {
                        btns.guess.classList.remove('u-hidden');
                    }
                    if (btns.pass && currentPlayer === this.playerName) btns.pass.classList.remove('u-hidden');
                }
                if (btns.next && this.isHost) btns.next.classList.remove('u-hidden');
                // Show buzz button for rapid fire
                this.updateBuzzButton();
                break;
            case 'buzzed':
                if (btns.next && this.isHost) btns.next.classList.remove('u-hidden');
                this.updateBuzzButton();
                break;
        }

        // Hide standard buttons for twenty_questions and riddles
        if (this.gameType === 'twenty_questions') {
            Object.values(btns).forEach(b => { if (b) b.classList.add('u-hidden'); });
        }
        if (this.gameType === 'riddles') {
            if (btns.ready) btns.ready.classList.add('u-hidden');
            if (btns.guess) btns.guess.classList.add('u-hidden');
            if (btns.pass) btns.pass.classList.add('u-hidden');
        }
    }

    displayItem(category, itemData) {
        const el = document.getElementById('item-display');
        if (el) {
            el.classList.remove('u-hidden');
            el.style.display = 'block';
            const item = typeof itemData === 'object' ? itemData.item : itemData;
            const year = itemData.year ? `<div class="item-meta">سنة الإنتاج: ${itemData.year}</div>` : '';
            const starring = itemData.starring ? `<div class="item-meta">بطولة: ${itemData.starring}</div>` : '';
            const type = itemData.type ? `<span class="badge badge-team-2">${itemData.type}</span>` : '';

            el.innerHTML = `
                <div class="item-category">${category} ${type}</div>
                <div class="item-name">${item}</div>
                ${year}
                ${starring}
            `;
            setTimeout(() => el.classList.add('visible'), 100);
        }
    }

    displayRapidFireQuestion(data) {
        const el = document.getElementById('item-display');
        if (el) {
            el.classList.remove('u-hidden');
            el.style.display = 'block';
            const q = data.current_question;
            let html = `<div class="item-category">${q.category || 'سؤال سريع'}</div>`;
            html += `<div class="item-name" style="font-size: 1.8rem;">${q.question}</div>`;
            // Don't show options until a player buzzes in
            el.innerHTML = html;
            this.currentRapidFireQuestion = q;
            setTimeout(() => el.classList.add('visible'), 100);
        }
        // Show rapid fire buzz area
        const rfArea = document.getElementById('rapid-fire-area');
        if (rfArea) rfArea.classList.remove('u-hidden');
        this.updateBuzzButton();
    }

    displayQuestion(data) {
        const el = document.getElementById('item-display');
        if (el) {
            el.classList.remove('u-hidden');
            el.style.display = 'block';
            let html = `<div class="item-category">${data.category || ''}</div>`;
            html += `<div class="item-name" style="font-size: 1.8rem;">${data.question}</div>`;

            if (data.options && data.options.length) {
                html += `<div class="options-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; width: 100%; margin-top: 1.5rem;">`;
                data.options.forEach((opt, i) => {
                    html += `<button class="btn btn-outline" onclick="window.gameInstance.submitAnswer(${i})">${opt}</button>`;
                });
                html += `</div>`;
            }

            el.innerHTML = html;
            setTimeout(() => el.classList.add('visible'), 100);
        }
    }

    submitAnswer(idx) {
        // Disable all option buttons immediately to prevent changing answer
        const optionButtons = document.querySelectorAll('.options-grid button');
        optionButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        });

        this.socket.emit('submit_answer', {
            game_id: this.gameId,
            answer_idx: idx
        });
    }

    // --- Pictionary Canvas Logic ---

    initCanvas() {
        const canvas = document.getElementById('game-canvas');
        if (!canvas) return;

        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            if (!this.ctx) {
                this.ctx = canvas.getContext('2d');
            }
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.redrawCanvasStrokes();
        };

        if (!this.canvasResizeHandler) {
            this.canvasResizeHandler = resizeCanvas;
            window.addEventListener('resize', this.canvasResizeHandler);
        }

        resizeCanvas();

        if (this.canvasInitialized) return;

        this.canvasInitialized = true;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: (clientX - rect.left) / rect.width,
                y: (clientY - rect.top) / rect.height
            };
        };

        const start = (e) => {
            if (document.getElementById('current-turn').textContent !== this.playerName) return;
            this.isDrawing = true;
            this.lastPos = getPos(e);
        };

        const draw = (e) => {
            if (!this.isDrawing) return;
            const currentPos = getPos(e);
            const stroke = {
                from: this.lastPos,
                to: currentPos,
                color: document.getElementById('draw-color').value,
                size: Number(document.getElementById('draw-size').value)
            };
            this.canvasStrokes.push(stroke);
            this.drawStroke(stroke);
            this.socket.emit('draw', { game_id: this.gameId, stroke: stroke });
            this.lastPos = currentPos;
            e.preventDefault();
        };

        const stop = () => this.isDrawing = false;

        canvas.onmousedown = start;
        canvas.onmousemove = draw;
        canvas.onmouseup = stop;
        canvas.onmouseleave = stop;

        canvas.ontouchstart = start;
        canvas.ontouchmove = draw;
        canvas.ontouchend = stop;
    }

    drawStroke(s) {
        const canvas = document.getElementById('game-canvas');
        if (!this.ctx || !canvas || !s?.from || !s?.to) return;
        const rect = canvas.getBoundingClientRect();
        const fromX = s.from.x <= 1 ? s.from.x * rect.width : s.from.x;
        const fromY = s.from.y <= 1 ? s.from.y * rect.height : s.from.y;
        const toX = s.to.x <= 1 ? s.to.x * rect.width : s.to.x;
        const toY = s.to.y <= 1 ? s.to.y * rect.height : s.to.y;
        this.ctx.beginPath();
        this.ctx.strokeStyle = s.color;
        this.ctx.lineWidth = s.size;
        this.ctx.moveTo(fromX, fromY);
        this.ctx.lineTo(toX, toY);
        this.ctx.stroke();
    }

    redrawCanvasStrokes() {
        if (!this.ctx) return;
        this.clearLocalCanvas();
        this.canvasStrokes.forEach((stroke) => this.drawStroke(stroke));
    }

    clearCanvas() {
        this.socket.emit('clear_canvas', { game_id: this.gameId });
        this.clearLocalCanvas();
        this.canvasStrokes = [];
    }

    clearLocalCanvas() {
        if (!this.ctx) return;
        const canvas = document.getElementById('game-canvas');
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    updatePlayersList(players) {
        const listEl = document.getElementById('players-list');
        if (!listEl) return;

        listEl.innerHTML = '';
        const ul = document.createElement('ul');
        ul.classList.add('players-ul');

        players.forEach(p => {
            const name = typeof p === 'object' ? p.name : p;
            const isHost = typeof p === 'object' ? p.isHost : false;
            const team = typeof p === 'object' ? p.team : null;

            const li = document.createElement('li');
            li.className = `player-item ${name === this.playerName ? 'current-player' : ''}`;

            let html = `<span>${name} ${isHost ? '👑' : ''} ${name === this.playerName ? '(أنت)' : ''}</span>`;
            if (team) {
                html += `<span class="badge badge-team-${team}">فريق ${team}</span>`;
            }

            li.innerHTML = html;
            ul.appendChild(li);
        });
        listEl.appendChild(ul);
    }

    updateScores(data) {
        const el = document.getElementById('scores');
        if (!el) return;

        // Store previous scores for animation
        const prevScores = this.previousScores || {};
        this.previousScores = {};

        let html = '';

        // Show placeholder if no scores
        const hasScores = (data.scores && Object.values(data.scores).some(s => s > 0)) || 
                        (data.team_scores && (data.team_scores['1'] > 0 || data.team_scores['2'] > 0));
        
        if (!hasScores) {
            el.innerHTML = '<p class="u-text-center" style="color: var(--text-light);">لم تبدأ الجولات بعد</p>';
            return;
        }

        // Show team scores if they exist and are non-zero
        if (data.team_scores && (data.team_scores['1'] > 0 || data.team_scores['2'] > 0)) {
            html += '<div class="team-scores-container">';
            html += `<div class="score-item">فريق 1: <span class="score-val">${data.team_scores['1']}</span></div>`;
            html += `<div class="score-item">فريق 2: <span class="score-val">${data.team_scores['2']}</span></div>`;
            html += '</div>';
        }

        // Show individual scores with animation
        const scores = data.scores || data;
        html += Object.entries(scores)
            .map(([p, s]) => {
                const animate = prevScores[p] && prevScores[p] < s ? 'score-animate' : '';
                this.previousScores[p] = s;
                return `<div class="score-item ${p === this.playerName ? 'current-player' : ''}"><span>${p}</span><span class="score-val ${animate}">${s}</span></div>`;
            })
            .join('');

        el.innerHTML = html;
    }

    startTimer(duration) {
        this.stopTimer();
        const timerEl = document.getElementById('timer');
        const timerText = timerEl ? timerEl.querySelector('span') : null;
        const timerProgress = document.getElementById('timer-progress');
        if (!timerEl || !timerText) return;

        this.setGameStatus('round_active');
        const totalDuration = duration;
        let timeLeft = duration;
        timerEl.style.display = 'flex';
        timerEl.classList.remove('warning', 'danger');
        
        // Reset progress bar
        if (timerProgress) {
            timerProgress.style.width = '100%';
            timerProgress.classList.remove('warning', 'danger');
        }

        const format = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
        timerText.textContent = format(timeLeft);

        this.timerInterval = setInterval(() => {
            timeLeft--;
            timerText.textContent = format(timeLeft);
            
            // Update progress bar
            if (timerProgress) {
                const percent = (timeLeft / totalDuration) * 100;
                timerProgress.style.width = `${percent}%`;
            }
            
            if (timeLeft <= 30) {
                timerEl.classList.add('warning');
                if (timerProgress) timerProgress.classList.add('warning');
            }
            if (timeLeft <= 10) {
                timerEl.classList.remove('warning');
                timerEl.classList.add('danger');
                if (timerProgress) {
                    timerProgress.classList.remove('warning');
                    timerProgress.classList.add('danger');
                }
                // Screen pulse effect at 10s
                if (timeLeft === 10) {
                    document.querySelector('.display-area')?.classList.add('screen-pulse');
                    setTimeout(() => document.querySelector('.display-area')?.classList.remove('screen-pulse'), 800);
                }
                // Play ticking sound for last 5 seconds
                if (timeLeft <= 5 && timeLeft > 0) {
                    AudioManager.play('timeout');
                }
            }

            if (timeLeft <= 0) {
                this.stopTimer();
                this.socket.emit('round_timeout', { game_id: this.gameId });
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        const el = document.getElementById('timer');
        const txt = el ? el.querySelector('span') : null;
        if (el && txt) {
            txt.textContent = '0:00';
            el.style.display = 'none';
        }
    }

    playTimeoutTwice() {
        AudioManager.play('timeout');
        setTimeout(() => AudioManager.play('timeout'), 1000);
    }

    showRevealMessage(data) {
        let msg = document.getElementById('reveal-message');
        if (!msg) {
            msg = document.createElement('div');
            msg.id = 'reveal-message';
            msg.className = 'reveal-message card animate-bounce-down';
            document.body.appendChild(msg);
        }

        const year = data.year ? `<div class="item-meta">سنة الإنتاج: ${data.year}</div>` : '';
        const starring = data.starring ? `<div class="item-meta">بطولة: ${data.starring}</div>` : '';

        msg.innerHTML = `
            <div class="reveal-content">
                <h3>انتهى الدور!</h3>
                <div class="item-name" style="font-size: 2rem; color: var(--primary); margin-block: 1rem;">${data.item}</div>
                <div class="badge badge-team-2" style="margin-bottom: 1rem;">${data.category}</div>
                ${year}
                ${starring}
            </div>
        `;
        msg.style.display = 'block';
        setTimeout(() => msg.style.display = 'none', 5000);
    }

    updateBuzzButton() {
        const buzzButton = document.getElementById('buzzButton');
        const buzzTimer = document.getElementById('buzz-timer');
        if (!buzzButton) return;

        const isRapidFire = this.gameType === 'rapid_fire';
        const canBuzz = isRapidFire && this.gameStatus === 'round_active';

        buzzButton.classList.toggle('u-hidden', !canBuzz);
        buzzButton.disabled = !canBuzz;

        if (buzzTimer && this.gameStatus !== 'buzzed') {
            buzzTimer.style.display = 'none';
            buzzTimer.textContent = '';
        }
    }

    buzzIn() {
        if (this.gameType !== 'rapid_fire' || this.gameStatus !== 'round_active') return;

        const buzzButton = document.getElementById('buzzButton');
        if (buzzButton) {
            buzzButton.disabled = true;
            buzzButton.classList.add('u-hidden');
        }

        this.socket.emit('buzz_in', {
            game_id: this.gameId,
            player_name: this.playerName
        });
    }

    submitBuzzAnswer(idx) {
        const optionButtons = document.querySelectorAll('.options-grid button');
        optionButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        });

        this.socket.emit('submit_buzz_answer', {
            game_id: this.gameId,
            answer_idx: idx
        });
    }

    handlePlayerBuzzed(data) {
        const buzzButton = document.getElementById('buzzButton');
        const buzzTimer = document.getElementById('buzz-timer');

        this.gameStatus = 'buzzed';

        if (buzzButton) {
            buzzButton.classList.add('u-hidden');
            buzzButton.disabled = true;
        }

        if (buzzTimer) {
            buzzTimer.style.display = 'block';
            buzzTimer.textContent = data.player ? `الجرس: ${data.player}` : 'تم الضغط على الجرس';
        }

        if (data.player) {
            Utils.showMessage(`${data.player} ضغط الجرس!`, 'info');
        }

        // Show answer options only to the player who buzzed
        if (data.player === this.playerName && this.currentRapidFireQuestion) {
            const el = document.getElementById('item-display');
            if (el) {
                const q = this.currentRapidFireQuestion;
                let html = `<div class="item-category">${q.category || 'سؤال سريع'}</div>`;
                html += `<div class="item-name" style="font-size: 1.8rem;">${q.question}</div>`;
                if (q.options && q.options.length) {
                    html += `<div class="options-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; width: 100%; margin-top: 1.5rem;">`;
                    q.options.forEach((opt, i) => {
                        html += `<button class="btn btn-outline" onclick="window.gameInstance.submitBuzzAnswer(${i})">${opt}</button>`;
                    });
                    html += `</div>`;
                }
                el.innerHTML = html;
            }
        }
    }

    clearBuzzState() {
        const buzzTimer = document.getElementById('buzz-timer');
        if (buzzTimer) {
            buzzTimer.style.display = 'none';
            buzzTimer.textContent = '';
        }

        if (this.gameType === 'rapid_fire') {
            this.gameStatus = 'round_active';
        }

        this.updateBuzzButton();
    }

    // --- Twenty Questions Logic ---

    handleTwentyQuestionsStarted(data) {
        this.thinker = data.thinker;
        this.twentyQuestionsState = {
            ...(this.twentyQuestionsState || {}),
            thinker: data.thinker,
            status: 'thinking',
            word_suggestion: data.word_suggestion,
            questions_asked: []
        };
        this.renderTwentyQuestionsState(this.twentyQuestionsState);
        this.updateTwentyQButtonVisibility();
    }

    useSuggestedWord(word, category) {
        document.getElementById('secret-word-input').value = word;
        document.getElementById('secret-category-input').value = category;
    }

    setSecretWord() {
        const word = document.getElementById('secret-word-input')?.value?.trim();
        const category = document.getElementById('secret-category-input')?.value?.trim();
        if (!word) {
            Utils.showMessage('اكتب كلمة أولاً!', 'error');
            return;
        }
        this.socket.emit('set_secret_word', {
            game_id: this.gameId,
            word: word,
            category: category
        });
    }

    handleSecretSet(data) {
        this.twentyQuestionsState = {
            ...(this.twentyQuestionsState || {}),
            status: 'asking',
            secret_category: data.category || this.twentyQuestionsState?.secret_category
        };
        this.renderTwentyQuestionsState(this.twentyQuestionsState);
        this.updateTwentyQButtonVisibility();
    }

    askQuestion() {
        const question = document.getElementById('question-input')?.value?.trim();
        if (!question) {
            Utils.showMessage('اكتب سؤالاً أولاً!', 'error');
            return;
        }
        this.socket.emit('ask_question', {
            game_id: this.gameId,
            question: question
        });
        document.getElementById('question-input').value = '';
    }

    handleQuestionAsked(data) {
        if (this.twentyQuestionsState) {
            const questions = [...(this.twentyQuestionsState.questions_asked || [])];
            questions.push({ player: data.player, question: data.question, answer: null });
            this.twentyQuestionsState = {
                ...this.twentyQuestionsState,
                questions_asked: questions,
                question_count: data.question_number
            };
            this.renderTwentyQuestionsState(this.twentyQuestionsState);
        }
    }

    handleQuestionAnswered(data) {
        if (this.twentyQuestionsState?.questions_asked?.length) {
            const questions = [...this.twentyQuestionsState.questions_asked];
            questions[questions.length - 1] = {
                ...questions[questions.length - 1],
                answer: data.answer
            };
            this.twentyQuestionsState = {
                ...this.twentyQuestionsState,
                questions_asked: questions
            };
            this.renderTwentyQuestionsState(this.twentyQuestionsState);
        }
    }

    makeGuess() {
        const guess = document.getElementById('guess-input')?.value?.trim();
        if (!guess) {
            Utils.showMessage('اكتب تخمينك أولاً!', 'error');
            return;
        }
        this.socket.emit('make_guess', {
            game_id: this.gameId,
            guess: guess
        });
        document.getElementById('guess-input').value = '';
    }

    answerQuestion(answer) {
        this.socket.emit('answer_question', {
            game_id: this.gameId,
            answer: answer
        });
    }

    handleTwentyQuestionsEnded(data) {
        this.twentyQuestionsState = {
            ...(this.twentyQuestionsState || {}),
            status: 'ended',
            winner: data.winner,
            end_message: data.message,
            secret_word: data.word
        };
        this.renderTwentyQuestionsState(this.twentyQuestionsState);
        this.updateTwentyQButtonVisibility();
    }

    nextTwentyQRound() {
        this.socket.emit('twenty_questions_next_round', { game_id: this.gameId });
    }

    updateTwentyQButtonVisibility() {
        // Hide regular buttons during Twenty Questions
        const btns = {
            ready: document.getElementById('readyButton'),
            guess: document.getElementById('guessButton'),
            start: document.getElementById('startButton'),
            next: document.getElementById('nextButton'),
            pass: document.getElementById('passButton')
        };

        if (this.gameType === 'twenty_questions') {
            Object.values(btns).forEach(b => { if (b) b.classList.add('u-hidden'); });
        }
    }

    renderTwentyQuestionsState(state) {
        if (!state || this.gameType !== 'twenty_questions') return;

        this.thinker = state.thinker || this.thinker;
        const isThinker = this.thinker === this.playerName;
        const waitingArea = document.getElementById('waiting-area');
        const twentyQArea = document.getElementById('twenty-questions-area');
        const itemDisplay = document.getElementById('item-display');

        if (waitingArea) waitingArea.style.display = 'none';
        document.getElementById('bus-area')?.classList.add('u-hidden');
        document.getElementById('pictionary-area')?.classList.add('u-hidden');
        document.getElementById('rapid-fire-area')?.classList.add('u-hidden');
        document.getElementById('riddles-area')?.classList.add('u-hidden');
        if (itemDisplay) {
            itemDisplay.classList.add('u-hidden');
            itemDisplay.style.display = 'none';
        }
        if (!twentyQArea) return;

        twentyQArea.classList.remove('u-hidden');
        twentyQArea.style.display = 'block';

        const questionsHistory = (state.questions_asked || []).map((questionEntry, index) => {
            const answerBadge = questionEntry.answer
                ? `<span class="badge ${questionEntry.answer === 'yes' ? 'badge-team-2' : (questionEntry.answer === 'no' ? 'badge-team-1' : 'badge-team-3')}" style="margin-right: 0.5rem;">${questionEntry.answer === 'yes' ? 'نعم' : (questionEntry.answer === 'no' ? 'لا' : 'يمكن')}</span>`
                : '';
            return `<div class="question-item" style="padding: 0.5rem; border-bottom: 1px solid var(--text-light); text-align: right;"><strong>${questionEntry.player}:</strong> ${questionEntry.question}<span class="badge badge-team-1" style="margin-right: 0.5rem;">#${index + 1}</span>${answerBadge}</div>`;
        }).join('');

        if (state.status === 'thinking') {
            if (isThinker) {
                const suggestionWord = state.word_suggestion?.word || '';
                const suggestionCategory = state.word_suggestion?.category || '';
                twentyQArea.innerHTML = `
                    <div class="item-category">أنت المفكر!</div>
                    <div style="margin: 1rem 0;">اختر كلمة للآخرين ليتخمّنوها</div>
                    <div class="word-suggestion" style="margin-bottom: 1rem; padding: 1rem; background: var(--surface); border-radius: 10px;">
                        <strong>اقتراح:</strong> ${suggestionWord || '---'}${suggestionCategory ? ` (${suggestionCategory})` : ''}
                        ${suggestionWord ? `<button class="btn btn-outline" style="margin-right: 0.5rem;" onclick="window.gameInstance.useSuggestedWord('${suggestionWord}', '${suggestionCategory}')">استخدم</button>` : ''}
                    </div>
                    <div class="input-group">
                        <input type="text" id="secret-word-input" placeholder="اكتب الكلمة السرية..." style="text-align: center; font-size: 1.2rem;">
                        <input type="text" id="secret-category-input" placeholder="الفئة (اختياري)..." style="text-align: center; margin-top: 0.5rem;">
                    </div>
                    <button class="btn btn-primary" style="margin-top: 1rem;" onclick="window.gameInstance.setSecretWord()">تم!</button>
                `;
            } else {
                twentyQArea.innerHTML = `
                    <div class="item-category">في انتظار المفكر...</div>
                    <div style="font-size: 1.5rem; margin-top: 1rem;">${this.thinker || '...' } يختار كلمة</div>
                    <div class="animate-heartbeat" style="margin-top: 1rem; color: var(--secondary);"><i class="fas fa-hourglass-start"></i></div>
                `;
            }
            return;
        }

        if (state.status === 'asking') {
            if (isThinker) {
                const pendingQuestion = [...(state.questions_asked || [])].reverse().find((entry) => !entry.answer);
                twentyQArea.innerHTML = `
                    <div class="item-category">أنت المفكر</div>
                    <div class="item-name" style="font-size: 2rem;">${state.secret_category || '???'}</div>
                    <div style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-light);">انتظر الأسئلة وأجب عليها</div>
                    <div id="pending-question" style="margin-top: 1rem; font-style: italic; color: var(--secondary);">${pendingQuestion ? `السؤال: &quot;${pendingQuestion.question}&quot;` : ''}</div>
                    <div id="answer-buttons" style="margin-top: 1rem; display: ${pendingQuestion ? 'flex' : 'none'}; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                        <button class="btn btn-primary" onclick="window.gameInstance.answerQuestion('yes')">نعم</button>
                        <button class="btn btn-outline" onclick="window.gameInstance.answerQuestion('no')">لا</button>
                        <button class="btn btn-secondary" onclick="window.gameInstance.answerQuestion('maybe')">يمكن</button>
                    </div>
                    <div id="questions-history" style="margin-top: 1.5rem; max-height: 220px; overflow-y: auto; width: 100%;">${questionsHistory}</div>
                `;
            } else {
                twentyQArea.innerHTML = `
                    <div class="item-category">الفئة: ${state.secret_category || '???'}</div>
                    <div style="margin-top: 1rem;">اسأل سؤال بنعم/لا/يمكن</div>
                    <div class="input-group" style="margin-top: 1rem; width: 100%;">
                        <input type="text" id="question-input" placeholder="اكتب سؤالك..." style="text-align: center;">
                    </div>
                    <button class="btn btn-primary" style="margin-top: 0.5rem;" onclick="window.gameInstance.askQuestion()">اسأل</button>
                    <div style="margin-top: 1rem; border-top: 1px solid var(--text-light); padding-top: 1rem; width: 100%;">
                        <div class="input-group">
                            <input type="text" id="guess-input" placeholder="أو حاول التخمين المباشر..." style="text-align: center;">
                        </div>
                        <button class="btn btn-secondary" style="margin-top: 0.5rem;" onclick="window.gameInstance.makeGuess()">خمن!</button>
                    </div>
                    <div id="questions-history" style="margin-top: 1.5rem; max-height: 220px; overflow-y: auto; width: 100%;">${questionsHistory}</div>
                `;
            }
            return;
        }

        if (state.status === 'ended') {
            twentyQArea.innerHTML = `
                <div class="item-category">انتهت الجولة!</div>
                <div class="item-name" style="font-size: 2rem; color: ${state.winner === this.playerName ? 'var(--success)' : 'var(--primary)'};">${state.winner ? `الفائز: ${state.winner}` : 'انتهت الجولة'}</div>
                <div style="margin-top: 1rem;">${state.end_message || (state.secret_word ? `الكلمة كانت: ${state.secret_word}` : 'بانتظار الجولة التالية')}</div>
                ${this.isHost ? '<button class="btn btn-primary" style="margin-top: 1rem;" onclick="window.gameInstance.nextTwentyQRound()">الجولة التالية</button>' : ''}
            `;
        }
    }

    // --- Riddles Logic ---

    handleRiddlesStarted() {
        // Hide other areas
        document.getElementById('waiting-area').style.display = 'none';
        document.getElementById('bus-area')?.classList.add('u-hidden');
        document.getElementById('pictionary-area')?.classList.add('u-hidden');
        document.getElementById('rapid-fire-area')?.classList.add('u-hidden');
        document.getElementById('twenty-questions-area')?.classList.add('u-hidden');

        const riddlesArea = document.getElementById('riddles-area');
        if (riddlesArea) riddlesArea.classList.remove('u-hidden');
    }

    updateRiddlesUI(data = null) {
        const el = document.getElementById('item-display');
        const riddleData = data || this.currentRiddle;
        if (!el || !riddleData) return;

        el.classList.remove('u-hidden');
        el.style.display = 'block';

        let html = `<div class="item-category">لغز #${this.roundNumber || 1}</div>`;
        html += `<div class="item-name" style="font-size: 1.6rem; line-height: 1.6;">${riddleData.riddle}</div>`;
        if (riddleData.category) {
            html += `<div style="margin-top: 0.5rem; font-size: 0.9rem; color: var(--text-light);">الفئة: ${riddleData.category}</div>`;
        }

        html += '<div style="margin-top: 1.5rem;">';
        html += '<div class="input-group">';
        html += '<input type="text" id="riddle-answer-input" placeholder="اكتب إجابتك..." style="text-align: center; font-size: 1.2rem;">';
        html += '</div>';
        html += '<button class="btn btn-primary" style="margin-top: 0.5rem;" onclick="window.gameInstance.submitRiddleAnswer()">إرسال الإجابة</button>';
        html += '</div>';

        html += '<div style="margin-top: 1rem;">';
        html += '<button class="btn btn-outline" onclick="window.gameInstance.requestHint()">طلب تلميح (-2 نقاط)</button>';
        html += '</div>';

        if (riddleData.hints && riddleData.hints.length > 0) {
            html += '<div id="hints-display" style="margin-top: 1rem;">';
            riddleData.hints.forEach((hint) => {
                html += `<div class="hint-item" style="padding: 0.5rem; background: var(--surface); border-radius: 8px; margin-top: 0.5rem;"><i class="fas fa-lightbulb" style="color: var(--warning);"></i> ${hint}</div>`;
            });
            html += '</div>';
        }

        if (this.isHost) {
            html += '<div style="margin-top: 1.5rem; border-top: 1px solid var(--border); padding-top: 1rem;">';
            html += '<button class="btn btn-primary" onclick="window.gameInstance.nextRiddle()">اللغز التالي</button>';
            html += '</div>';
        }

        el.innerHTML = html;
        setTimeout(() => el.classList.add('visible'), 100);
    }

    submitRiddleAnswer() {
        const answer = document.getElementById('riddle-answer-input')?.value?.trim();
        if (!answer) {
            Utils.showMessage('اكتب إجابة أولاً!', 'error');
            return;
        }
        this.socket.emit('submit_riddle_answer', {
            game_id: this.gameId,
            answer: answer
        });
    }

    clearRiddleAnswerInput() {
        const input = document.getElementById('riddle-answer-input');
        if (input) input.value = '';
    }

    requestHint() {
        this.socket.emit('reveal_hint', { game_id: this.gameId });
    }

    displayHint(hint, remaining) {
        const hintsDisplay = document.getElementById('hints-display');
        if (hintsDisplay) {
            const div = document.createElement('div');
            div.className = 'hint-item animate-bounce-down';
            div.style.cssText = 'padding: 0.5rem; background: var(--surface); border-radius: 8px; margin-top: 0.5rem;';
            div.innerHTML = `<i class="fas fa-lightbulb" style="color: var(--warning);"></i> ${hint}`;
            hintsDisplay.appendChild(div);
        }
    }

    clearRiddleHints() {
        const hintsDisplay = document.getElementById('hints-display');
        if (hintsDisplay) hintsDisplay.innerHTML = '';
    }

    skipRiddle() {
        this.socket.emit('skip_riddle', { game_id: this.gameId });
    }

    showRiddleAnswer(answer) {
        const el = document.getElementById('item-display');
        if (el) {
            const answerDiv = document.createElement('div');
            answerDiv.style.cssText = 'margin-top: 1rem; padding: 1rem; background: var(--primary); color: white; border-radius: 10px; font-size: 1.3rem; font-weight: 700;';
            answerDiv.innerHTML = `<i class="fas fa-info-circle"></i> الإجابة: ${answer}`;
            el.appendChild(answerDiv);
        }
    }

    nextRiddle() {
        this.socket.emit('next_riddle', { game_id: this.gameId });
    }

    // --- Bus Complete Logic ---

    displayBusBoard() {
        // Hide other areas
        document.getElementById('waiting-area').style.display = 'none';
        document.getElementById('twenty-questions-area')?.classList.add('u-hidden');
        document.getElementById('pictionary-area')?.classList.add('u-hidden');
        document.getElementById('rapid-fire-area')?.classList.add('u-hidden');
        document.getElementById('riddles-area')?.classList.add('u-hidden');
        document.getElementById('bus-results-area')?.classList.add('u-hidden');
        document.getElementById('bus-validation-area')?.classList.add('u-hidden');
        const itemDisplay = document.getElementById('item-display');
        if (itemDisplay) { itemDisplay.classList.add('u-hidden'); itemDisplay.style.display = 'none'; }

        const busArea = document.getElementById('bus-area');
        if (!busArea) return;
        busArea.classList.remove('u-hidden');

        // Clear all inputs
        busArea.querySelectorAll('.bus-input').forEach(input => { input.value = ''; input.disabled = false; });

        // Update letter display
        const letterEl = document.getElementById('current-letter');
        if (letterEl && this.currentLetter) letterEl.textContent = this.currentLetter;

        // Show stop button
        const stopBtn = document.getElementById('stopBusButton');
        if (stopBtn) stopBtn.disabled = false;

        // Setup debounced auto-sync for inputs
        if (!this._busInputsBound) {
            this._busInputsBound = true;
            let syncTimeout = null;
            const syncAnswers = () => {
                const answers = {};
                busArea.querySelectorAll('.bus-input').forEach(input => {
                    const cat = input.dataset.category;
                    if (cat) answers[cat] = input.value.trim();
                });
                this.socket.emit('submit_bus_answers', { game_id: this.gameId, answers });
            };
            busArea.querySelectorAll('.bus-input').forEach(input => {
                input.addEventListener('input', () => {
                    clearTimeout(syncTimeout);
                    syncTimeout = setTimeout(syncAnswers, 800);
                });
                input.addEventListener('blur', syncAnswers);
            });
        }
    }

    stopBus() {
        const busArea = document.getElementById('bus-area');
        const answers = {};
        if (busArea) {
            busArea.querySelectorAll('.bus-input').forEach(input => {
                const cat = input.dataset.category;
                if (cat) answers[cat] = input.value.trim();
                input.disabled = true;
            });
        }
        const stopBtn = document.getElementById('stopBusButton');
        if (stopBtn) stopBtn.disabled = true;

        this.socket.emit('stop_bus', { game_id: this.gameId, answers });
    }

    displayBusValidation(data) {
        document.getElementById('bus-area')?.classList.add('u-hidden');
        document.getElementById('bus-results-area')?.classList.add('u-hidden');
        document.getElementById('waiting-area').style.display = 'none';

        const valArea = document.getElementById('bus-validation-area');
        if (!valArea) return;
        valArea.classList.remove('u-hidden');

        const grid = document.getElementById('validation-grid');
        if (!grid) return;

        const statuses = data.validation_statuses || {};
        const categories = data.categories || [];
        let html = '';

        categories.forEach(cat => {
            const catWords = Object.entries(statuses).filter(([, s]) => s.category === cat);
            if (!catWords.length) return;
            html += `<div class="validation-category" style="margin-bottom: 1.5rem;">`;
            html += `<h4 style="color: var(--primary); margin-bottom: 0.5rem;">${cat}</h4>`;
            catWords.forEach(([key, status]) => {
                const validClass = status.is_valid === true ? 'valid' : (status.is_valid === false ? 'invalid' : 'pending');
                const prevBadge = status.previously_validated ? '<span class="badge badge-team-2" style="font-size: 0.7rem;">✓ سابق</span>' : '';
                const playerVote = status.votes?.[this.playerName];
                const voteIndicator = playerVote !== undefined
                    ? `<div class="user-vote-indicator ${playerVote ? 'valid' : 'invalid'}"><i class="fas fa-${playerVote ? 'check' : 'times'}"></i></div>`
                    : '';
                html += `<div class="validation-card ${validClass}" data-answer-key="${key}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; margin-bottom: 0.5rem; border: 2px solid var(--border); border-radius: 12px; cursor: pointer;" onclick="window.gameInstance.submitBusVote('${key}')">`;
                html += `<div><strong>${status.answer}</strong> ${prevBadge}<div style="font-size: 0.8rem; color: var(--text-light);">${status.players.join(', ')}</div></div>`;
                html += `<div style="display: flex; gap: 0.5rem; align-items: center;">`;
                html += `<span class="vote-valid" style="color: var(--success);"><i class="fas fa-check"></i> ${status.valid_count}</span>`;
                html += `<span class="vote-invalid" style="color: var(--danger);"><i class="fas fa-times"></i> ${status.invalid_count}</span>`;
                html += voteIndicator;
                html += `</div></div>`;
            });
            html += `</div>`;
        });

        grid.innerHTML = html;

        // Show host finalize button
        const hostActions = document.getElementById('host-validation-actions');
        if (hostActions) hostActions.classList.toggle('u-hidden', !this.isHost);

        this.updateValidationProgress();
    }

    submitBusVote(answerKey) {
        // Toggle: first click = valid, second click on same = invalid, third = remove
        const card = document.querySelector(`.validation-card[data-answer-key="${answerKey}"]`);
        const indicator = card?.querySelector('.user-vote-indicator');
        let isValid = true;
        if (indicator && indicator.classList.contains('valid')) {
            isValid = false;
        }
        this.socket.emit('submit_validation_vote', {
            game_id: this.gameId,
            answer_key: answerKey,
            is_valid: isValid
        });
    }

    finalizeValidation() {
        this.socket.emit('finalize_validation', { game_id: this.gameId });
    }

    displayBusResults(data) {
        document.getElementById('bus-area')?.classList.add('u-hidden');
        document.getElementById('bus-validation-area')?.classList.add('u-hidden');
        document.getElementById('waiting-area').style.display = 'none';

        const resultsArea = document.getElementById('bus-results-area');
        if (!resultsArea) return;
        resultsArea.classList.remove('u-hidden');

        const categories = data.categories || [];
        const submissions = data.player_submissions || {};
        const roundScores = data.round_scores || {};
        const invalidAnswers = data.invalid_answers || {};
        const wrongLetter = data.wrong_letter_answers || {};

        // Build header
        const header = document.getElementById('results-header');
        if (header) {
            let hHtml = '<th style="padding: 1rem; min-width: 80px;">اللاعب</th>';
            categories.forEach(cat => { hHtml += `<th style="padding: 0.8rem; min-width: 70px; font-size: 0.85rem;">${cat}</th>`; });
            hHtml += '<th style="padding: 1rem; min-width: 60px;">المجموع</th>';
            header.innerHTML = hHtml;
        }

        // Build rows
        const body = document.getElementById('results-body');
        if (body) {
            let bHtml = '';
            const players = data.players || [];
            players.forEach(p => {
                const pname = typeof p === 'object' ? p.name : p;
                const pSub = submissions[pname] || {};
                const pScores = roundScores[pname] || {};
                const pInvalid = invalidAnswers[pname] || {};
                const pWrong = wrongLetter[pname] || {};
                let total = 0;

                bHtml += `<tr style="background: var(--surface); border-radius: 10px;">`;
                bHtml += `<td style="padding: 0.8rem; font-weight: 700;">${pname}</td>`;
                categories.forEach(cat => {
                    const ans = pSub[cat] || '';
                    const pts = pScores[cat] || 0;
                    total += pts;
                    const isInvalid = pInvalid[cat];
                    const isWrongL = pWrong[cat];
                    let cellStyle = '';
                    let suffix = '';
                    if (isWrongL) { cellStyle = 'color: var(--warning);'; suffix = ` ❌ ${isWrongL}`; }
                    else if (isInvalid) { cellStyle = 'color: var(--danger); text-decoration: line-through;'; }
                    else if (pts > 0) { cellStyle = 'color: var(--success);'; suffix = ` (${pts})`; }
                    bHtml += `<td style="padding: 0.8rem; ${cellStyle}">${ans || '-'}${suffix}</td>`;
                });
                bHtml += `<td style="padding: 0.8rem; font-weight: 800; color: var(--primary);">${total}</td>`;
                bHtml += `</tr>`;
            });
            body.innerHTML = bHtml;
        }

        // Show host actions
        const hostActions = document.getElementById('host-bus-actions');
        if (hostActions) hostActions.classList.toggle('u-hidden', !this.isHost);

        // Update letter display
        const resLetterEl = document.getElementById('result-letter');
        if (resLetterEl && this.currentLetter) resLetterEl.textContent = this.currentLetter;
    }

    confirmBusScores() {
        this.socket.emit('confirm_bus_scores', { game_id: this.gameId });
    }

    updateValidationProgress() {
        // Recalculate total votes from all cards
        const cards = document.querySelectorAll('.validation-card');
        let totalVotes = 0;
        cards.forEach(card => {
            const indicator = card.querySelector('.user-vote-indicator');
            if (indicator) totalVotes++;
        });

        const totalAnswers = cards.length;
        const progressPercent = totalAnswers > 0 ? (totalVotes / totalAnswers) * 100 : 0;

        document.getElementById('validation-progress-bar').style.width = `${progressPercent}%`;
        document.getElementById('votes-count').textContent = totalVotes;
        document.getElementById('total-answers').textContent = totalAnswers;
    }
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    AudioManager.init();
    Utils.setupModalKeyboardHandler();
    const isGamePage = window.location.pathname.includes('/game/');

    if (isGamePage) {
        const gameData = JSON.parse(sessionStorage.getItem('gameData') || '{}');
        const urlParams = new URLSearchParams(window.location.search);

        const gameId = window.location.pathname.split('/').pop() || gameData.gameId;
        const urlPlayerName = urlParams.get('player_name');
        const playerName = decodeURIComponent(urlPlayerName || gameData.playerName || document.getElementById('player-name')?.value || '');
        const transferId = urlParams.get('transfer_id') || gameData.transferId || document.getElementById('transfer-id')?.value || '';
        const isHost = document.getElementById('is-host')?.value === 'true';

        if (gameId && playerName && transferId) {
            window.gameInstance = new GameEngine(gameId, playerName, transferId, isHost);
        } else {
            Utils.showError('معلومات اللعبة غير كاملة');
        }
    }
});
