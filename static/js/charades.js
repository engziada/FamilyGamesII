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
            statusElement.className = `animate-bounce-down ${type}`;
            statusElement.style.display = 'flex';

            if (this.hideTimeout) clearTimeout(this.hideTimeout);

            this.hideTimeout = setTimeout(() => {
                statusElement.style.display = 'none';
                statusElement.classList.remove('animate-bounce-down');
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

        bindClick('leave-room', () => {
            if (confirm('هل أنت متأكد أنك تريد الانسحاب؟')) {
                sessionStorage.removeItem('gameData');
                this.socket.emit('host_withdraw', { roomId: this.gameId, playerName: this.playerName }, () => {
                    window.location.href = '/';
                });
            }
        });

        bindClick('close-room', () => {
            if (confirm('هل أنت متأكد أنك تريد إغلاق الغرفة؟')) {
                sessionStorage.removeItem('gameData');
                this.socket.emit('close_room', { roomId: this.gameId, playerName: this.playerName }, () => {
                    window.location.href = '/';
                });
            }
        });

        bindClick('leaveButton', () => {
            if (confirm('هل أنت متأكد أنك تريد الانسحاب؟')) {
                sessionStorage.removeItem('gameData');
                this.socket.emit('leave_game', { roomId: this.gameId, playerName: this.playerName }, () => {
                    window.location.href = '/';
                });
            }
        });
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
            if (data) this.displayQuestion(data);
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
            if (this.gameType === 'pictionary') this.drawStroke(stroke);
        });

        this.socket.on('clear_canvas', () => {
            if (this.gameType === 'pictionary') this.clearLocalCanvas();
        });

        this.socket.on('sync_canvas', (data) => {
            if (this.gameType === 'pictionary') data.forEach(s => this.drawStroke(s));
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
            this.updateTwentyQButtonVisibility();
        }
        if (this.gameType === 'riddles') {
            if (btns.ready) btns.ready.classList.add('u-hidden');
            if (btns.guess) btns.guess.classList.add('u-hidden');
            if (btns.pass) btns.pass.classList.add('u-hidden');
        }
    }

    updateCurrentPlayer(player) {
        const el = document.getElementById('current-turn');
        if (el) {
            if (this.gameType === 'trivia' || this.gameType === 'bus_complete' || this.gameType === 'rapid_fire' ||
                this.gameType === 'twenty_questions' || this.gameType === 'riddles') {
                el.textContent = 'الكل!';
            } else if (player) {
                el.textContent = player;
            } else {
                el.textContent = '...';
            }
        }

        const isMe = (player === this.playerName);
        const itemDisplay = document.getElementById('item-display');
        const pictionaryArea = document.getElementById('pictionary-area');

        if (itemDisplay) {
            // In Trivia/Rapid Fire/Twenty Questions/Riddles, everyone sees the display.
            // In Charades/Pictionary, only the performer (isMe) sees it.
            if (this.gameType === 'trivia' || this.gameType === 'rapid_fire' ||
                this.gameType === 'twenty_questions' || this.gameType === 'riddles' || isMe) {
                itemDisplay.classList.remove('u-hidden');
                itemDisplay.style.display = 'block';
            } else if (this.gameType === 'pictionary' && !isMe && this.currentItemCategory) {
                // Show category hint for non-drawing players in easy/medium difficulty
                const difficulty = this.gameSettings.difficulty || 'medium';
                if (difficulty === 'easy' || difficulty === 'medium') {
                    itemDisplay.classList.remove('u-hidden');
                    itemDisplay.style.display = 'block';
                    itemDisplay.innerHTML = `<div class="item-category" style="font-size: 1.8rem;">${this.currentItemCategory}</div>`;
                    itemDisplay.classList.add('visible');
                } else {
                    itemDisplay.classList.add('u-hidden');
                }
            } else {
                itemDisplay.classList.add('u-hidden');
            }
        }

        if (pictionaryArea) {
            if (this.gameType === 'pictionary' && this.gameStatus === 'round_active') {
                pictionaryArea.classList.remove('u-hidden');
                pictionaryArea.style.display = 'block';
                this.initCanvas();
                // Show controls only to the drawer
                document.querySelector('.canvas-controls').style.display = isMe ? 'flex' : 'none';
            } else {
                pictionaryArea.classList.add('u-hidden');
            }
        }

        // Handle Bus Complete areas
        const busArea = document.getElementById('bus-area');
        const busResultsArea = document.getElementById('bus-results-area');
        const busValidationArea = document.getElementById('bus-validation-area');

        if (this.gameType !== 'bus_complete') {
            if (busArea) busArea.classList.add('u-hidden');
            if (busResultsArea) busResultsArea.classList.add('u-hidden');
            if (busValidationArea) busValidationArea.classList.add('u-hidden');
        } else {
            // Bus Complete specific logic is handled in displayBusBoard and displayBusResults
            // But we should hide them if the status isn't active/scoring/validating
            if (this.gameStatus !== 'round_active' && busArea) busArea.classList.add('u-hidden');
            if (this.gameStatus !== 'scoring' && busResultsArea) busResultsArea.classList.add('u-hidden');
            if (this.gameStatus !== 'validating' && busValidationArea) busValidationArea.classList.add('u-hidden');
        }

        this.updateButtonVisibility();
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

    displayQuestion(data) {
        const el = document.getElementById('item-display');
        if (el) {
            el.classList.remove('u-hidden');
            el.style.display = 'block';
            let html = `<div class="item-category">${data.category}</div>`;
            html += `<div class="item-name" style="font-size: 1.8rem;">${data.question}</div>`;

            html += `<div class="options-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; width: 100%; margin-top: 1.5rem;">`;
            data.options.forEach((opt, i) => {
                html += `<button class="btn btn-outline" onclick="window.gameInstance.submitAnswer(${i})">${opt}</button>`;
            });
            html += `</div>`;

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
        if (!canvas || this.ctx) return;

        // Set canvas internal dimensions to match display size
        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            if (this.ctx) {
                this.ctx.scale(dpr, dpr);
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
            }
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        this.ctx = canvas.getContext('2d');
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            // Use logical coordinates (canvas width/height) instead of client coordinates
            return {
                x: (clientX - rect.left) * (canvas.width / rect.width),
                y: (clientY - rect.top) * (canvas.height / rect.height)
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
                size: document.getElementById('draw-size').value
            };
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
        if (!this.ctx) return;
        this.ctx.beginPath();
        this.ctx.strokeStyle = s.color;
        this.ctx.lineWidth = s.size;
        this.ctx.moveTo(s.from.x, s.from.y);
        this.ctx.lineTo(s.to.x, s.to.y);
        this.ctx.stroke();
    }

    clearCanvas() {
        this.socket.emit('clear_canvas', { game_id: this.gameId });
        this.clearLocalCanvas();
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
    /**
     * Normalize Arabic letter for comparison (hamza variants -> alef, taa marbuta -> haa, etc.)
     * @param {string} char - Arabic character to normalize
     * @returns {string} Normalized character
     */
    normalizeArabicChar(char) {
        if (!char) return '';
        let c = char.trim();
        c = c.replace(/[أإآ]/g, 'ا');
        c = c.replace(/ة/g, 'ه');
        c = c.replace(/ى/g, 'ي');
        c = c.replace(/ئ/g, 'ي');
        c = c.replace(/ؤ/g, 'و');
        return c;
    }

    /**
     * Check if a value starts with the current round letter (client-side).
     * @param {string} value - The answer text
     * @returns {boolean}
     */
    startsWithCurrentLetter(value) {
        if (!value || !this.currentLetter) return false;
        const normValue = this.normalizeArabicChar(value.trim());
        const normLetter = this.normalizeArabicChar(this.currentLetter);
        return normValue.startsWith(normLetter);
    }

    /**
     * Attach real-time validation listeners to bus inputs.
     * Also syncs answers to the server on blur and debounced input
     * so that all players' answers are captured when the bus is stopped.
     */
    attachBusInputValidation() {
        const inputs = document.querySelectorAll('.bus-input');

        // Debounced server sync — collects all inputs and emits once
        let syncTimer = null;
        const syncAnswersToServer = () => {
            clearTimeout(syncTimer);
            syncTimer = setTimeout(() => {
                const answers = {};
                document.querySelectorAll('.bus-input').forEach(inp => {
                    const cat = inp.getAttribute('data-category');
                    answers[cat] = inp.value.trim();
                });
                this.socket.emit('submit_bus_answers', {
                    game_id: this.gameId,
                    answers: answers
                });
            }, 400);
        };

        inputs.forEach((input, index) => {
            input.addEventListener('input', () => {
                const val = input.value.trim();
                input.classList.remove('bus-input-valid', 'bus-input-invalid');
                if (!val) return;
                if (this.startsWithCurrentLetter(val)) {
                    input.classList.add('bus-input-valid');
                } else {
                    input.classList.add('bus-input-invalid');
                }
                // Update button state after input
                this.checkAllCategoriesFilled();
                // Sync to server (debounced)
                syncAnswersToServer();
            });

            // Sync immediately on blur (player left the field)
            input.addEventListener('blur', () => {
                syncAnswersToServer();
            });
            
            // Enter key navigation - focus next input
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const nextInput = inputs[index + 1];
                    if (nextInput) {
                        nextInput.focus();
                    } else {
                        // Last input - focus first or submit
                        inputs[0].focus();
                    }
                }
            });
        });
    }

    displayBusBoard() {
        document.getElementById('item-display').classList.add('u-hidden');
        document.getElementById('pictionary-area').classList.add('u-hidden');
        document.getElementById('waiting-area').style.display = 'none';
        document.getElementById('bus-results-area').classList.add('u-hidden');
        document.getElementById('bus-area').classList.remove('u-hidden');
        
        // Add fade-in animation
        document.getElementById('bus-area').classList.add('fade-in');

        if (this.gameStatus === 'round_active' && !this.busInputsInitialized) {
            document.querySelectorAll('.bus-input').forEach(input => {
                input.value = '';
                input.classList.remove('bus-input-valid', 'bus-input-invalid');
            });
            this.attachBusInputValidation();
            this.busInputsInitialized = true;
            this.checkAllCategoriesFilled(); // Check initially
        }
        
        // Show stop button for all players (not just host)
        const stopBtn = document.getElementById('stopBusButton');
        if (stopBtn) {
            stopBtn.classList.remove('u-hidden');
            this.checkAllCategoriesFilled(); // Set initial state
        }
    }

    checkAllCategoriesFilled() {
        const stopBtn = document.getElementById('stopBusButton');
        if (!stopBtn) return;

        let allFilled = true;
        document.querySelectorAll('.bus-input').forEach(input => {
            if (!input.value.trim()) {
                allFilled = false;
            }
        });

        // Enable/disable button based on fill status
        stopBtn.disabled = !allFilled;
        if (allFilled) {
            stopBtn.classList.remove('btn-disabled');
            stopBtn.style.opacity = '1';
            stopBtn.style.cursor = 'pointer';
        } else {
            stopBtn.classList.add('btn-disabled');
            stopBtn.style.opacity = '0.5';
            stopBtn.style.cursor = 'not-allowed';
        }
    }

    stopBus() {
        const answers = {};
        let hasInvalid = false;
        let allFilled = true;

        document.querySelectorAll('.bus-input').forEach(input => {
            const val = input.value.trim();
            const cat = input.getAttribute('data-category');
            answers[cat] = val;

            // Check if all fields are filled
            if (!val) {
                allFilled = false;
            }

            // Client-side letter check with visual feedback
            input.classList.remove('bus-input-valid', 'bus-input-invalid');
            if (val && !this.startsWithCurrentLetter(val)) {
                input.classList.add('bus-input-invalid');
                hasInvalid = true;
            }
        });

        // Prevent stopping if not all categories are filled
        if (!allFilled) {
            Utils.showMessage('يجب ملء جميع الفئات قبل إيقاف الأتوبيس!', 'error');
            return;
        }

        if (hasInvalid) {
            Utils.showMessage('بعض الإجابات لا تبدأ بالحرف المطلوب! سيتم تجاهلها.', 'error');
        }

        this.socket.emit('stop_bus', { game_id: this.gameId, answers: answers });
    }

    displayBusResults(data) {
        document.getElementById('bus-area').classList.add('u-hidden');
        document.getElementById('bus-results-area').classList.remove('u-hidden');
        this.busInputsInitialized = false;

        const headerRow = document.getElementById('results-header');
        while (headerRow.children.length > 2) {
            headerRow.removeChild(headerRow.children[1]);
        }
        data.categories.forEach(cat => {
            const th = document.createElement('th');
            th.textContent = cat;
            th.style.padding = '1rem';
            headerRow.insertBefore(th, headerRow.lastElementChild);
        });

        const tbody = document.getElementById('results-body');
        tbody.innerHTML = '';

        data.players.forEach(player => {
            const tr = document.createElement('tr');
            tr.style.background = 'var(--surface)';
            tr.style.borderRadius = '15px';

            const tdName = document.createElement('td');
            tdName.textContent = player.name;
            tdName.style.padding = '1rem';
            tdName.style.fontWeight = 'bold';
            tr.appendChild(tdName);

            data.categories.forEach(cat => {
                const td = document.createElement('td');
                const ans = (data.player_submissions[player.name] || {})[cat] || '';
                const pts = (data.round_scores[player.name] || {})[cat] || 0;
                const wrongLetter = (data.wrong_letter_answers || {})[player.name]?.[cat];
                const invalidWord = (data.invalid_answers || {})[player.name]?.[cat];

                let displayAns = ans || '-';
                let extraInfo = '';

                if (wrongLetter) {
                    displayAns = `<s style="color:var(--danger);">${wrongLetter}</s>`;
                    extraInfo = '<small style="color:var(--danger);display:block;">حرف خاطئ</small>';
                } else if (invalidWord) {
                    displayAns = `<s style="color:var(--warning,orange);">${invalidWord}</s>`;
                    extraInfo = '<small style="color:var(--warning,orange);display:block;">كلمة غير صحيحة</small>';
                }

                td.innerHTML = `<div>${displayAns}</div>${extraInfo}<small class="badge ${pts > 0 ? 'badge-team-2' : 'badge-team-1'}" style="font-size: 0.7rem; color: white; padding: 2px 6px; border-radius: 10px;">${pts}</small>`;
                td.style.padding = '1rem';
                td.style.textAlign = 'center';
                tr.appendChild(td);
            });

            const tdTotal = document.createElement('td');
            const total = Object.values(data.round_scores[player.name] || {}).reduce((a, b) => a + b, 0);
            tdTotal.innerHTML = `<strong style="color: var(--primary); font-size: 1.2rem;">${total}</strong>`;
            tdTotal.style.padding = '1rem';
            tdTotal.style.textAlign = 'center';
            tr.appendChild(tdTotal);
            tbody.appendChild(tr);
        });

        if (this.isHost) {
            document.getElementById('host-bus-actions').classList.remove('u-hidden');
        }
    }

    confirmBusScores() {
        this.socket.emit('confirm_bus_scores', { game_id: this.gameId });
    }

    displayBusValidation(data) {
        // Hide other areas
        document.getElementById('bus-area').classList.add('u-hidden');
        document.getElementById('bus-results-area').classList.add('u-hidden');
        document.getElementById('waiting-area').style.display = 'none';

        // Show validation area
        const validationArea = document.getElementById('bus-validation-area');
        validationArea.classList.remove('u-hidden');

        // Update letter display
        if (data.current_letter) {
            this.currentLetter = data.current_letter;
        }

        // Build validation grid - now shows unique words per category
        const grid = document.getElementById('validation-grid');
        grid.innerHTML = '';

        const validationStatuses = data.validation_statuses || {};
        let totalWords = 0;
        let totalVotes = 0;

        // Sort by category, then word
        const sortedKeys = Object.keys(validationStatuses).sort((a, b) => {
            const aData = validationStatuses[a];
            const bData = validationStatuses[b];
            if (aData.category !== bData.category) {
                return aData.category.localeCompare(bData.category);
            }
            return aData.answer.localeCompare(bData.answer);
        });

        sortedKeys.forEach(answerKey => {
            const status = validationStatuses[answerKey];
            totalWords++;

            const card = document.createElement('div');
            card.className = 'validation-card valid';
            card.dataset.answerKey = answerKey;

            // Determine card state based on validation status
            if (status.is_valid === false) {
                card.classList.remove('valid');
                card.classList.add('invalid');
            } else {
                card.classList.add('valid');
            }

            // Previously validated indicator
            let previouslyValidatedBadge = '';
            if (status.previously_validated) {
                previouslyValidatedBadge = '<span class="previously-validated-badge" title="تم التحقق منها سابقاً"><i class="fas fa-check-circle"></i></span>';
            }

            // Check if current player voted
            const playerVote = status.votes && status.votes[this.playerName];
            let voteIndicator = '';
            if (playerVote !== undefined) {
                totalVotes++;
                voteIndicator = `<div class="user-vote-indicator ${playerVote ? 'valid' : 'invalid'}">
                    <i class="fas fa-${playerVote ? 'check' : 'times'}"></i>
                </div>`;
            }

            // Players count indicator (how many used this word)
            const playersCount = status.players ? status.players.length : 1;
            const playersCountBadge = `<span class="players-count-badge" title="عدد اللاعبين الذين استخدموا هذه الكلمة">${playersCount}x</span>`;

            card.innerHTML = `
                <div class="category">${status.category}</div>
                <div class="answer">${status.answer} ${previouslyValidatedBadge}</div>
                <div class="players-hint">${playersCountBadge}</div>
                <div class="vote-counts">
                    <span class="vote-valid"><i class="fas fa-check"></i> ${status.valid_count}</span>
                    <span class="vote-invalid"><i class="fas fa-times"></i> ${status.invalid_count}</span>
                </div>
                ${voteIndicator}
            `;

            // Click handler for voting
            card.addEventListener('click', () => {
                // Toggle vote: if already voted valid, vote invalid; if invalid, vote valid; if none, vote valid
                let newVote = true;
                if (playerVote === true) {
                    newVote = false;
                } else if (playerVote === false) {
                    newVote = true; // toggle back to valid
                }

                this.socket.emit('submit_validation_vote', {
                    game_id: this.gameId,
                    answer_key: answerKey,
                    is_valid: newVote
                });
            });

            grid.appendChild(card);
        });

        // Update progress
        const progressPercent = totalWords > 0 ? (totalVotes / totalWords) * 100 : 0;
        document.getElementById('validation-progress-bar').style.width = `${progressPercent}%`;
        document.getElementById('votes-count').textContent = totalVotes;
        document.getElementById('total-answers').textContent = totalWords;

        // Show host actions
        if (this.isHost) {
            document.getElementById('host-validation-actions').classList.remove('u-hidden');
        } else {
            document.getElementById('host-validation-actions').classList.add('u-hidden');
        }
    }

    finalizeValidation() {
        this.socket.emit('finalize_validation', { game_id: this.gameId });
    }

    // --- Rapid Fire Logic ---

    displayRapidFireQuestion(data) {
        const el = document.getElementById('item-display');
        if (!el) return;

        // Hide non-relevant areas
        document.getElementById('waiting-area').style.display = 'none';
        const busArea = document.getElementById('bus-area');
        if (busArea) busArea.classList.add('u-hidden');

        el.classList.remove('u-hidden');
        el.style.display = 'block';

        const q = data.current_question;
        if (!q) return;

        let html = `<div class="item-category">${q.category || 'سؤال'}</div>`;
        html += `<div class="item-name" style="font-size: 1.8rem;">${q.question}</div>`;

        // Show buzz button area
        const buzzArea = document.getElementById('rapid-fire-area');
        if (buzzArea) buzzArea.classList.remove('u-hidden');

        // If player is the buzzed player, show answer options
        if (data.buzzed_player === this.playerName) {
            html += `<div class="options-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; width: 100%; margin-top: 1.5rem;">`;
            q.options.forEach((opt, i) => {
                html += `<button class="btn btn-outline" onclick="window.gameInstance.submitBuzzAnswer(${i})">${opt}</button>`;
            });
            html += `</div>`;
        } else if (data.buzzed_player) {
            html += `<div class="buzz-status" style="margin-top: 1.5rem; font-size: 1.2rem; color: var(--secondary); font-weight: 700;"><i class="fas fa-bell"></i> ${data.buzzed_player} ضغط الجرس!</div>`;
        }

        el.innerHTML = html;
        setTimeout(() => el.classList.add('visible'), 100);

        this.updateBuzzButton();
    }

    handlePlayerBuzzed(data) {
        const buzzBtn = document.getElementById('buzzButton');
        if (buzzBtn) {
            buzzBtn.disabled = true;
            buzzBtn.innerHTML = `<i class="fas fa-bell"></i> ${data.player} ضغط الجرس!`;
        }

        // If I'm the buzzed player, show answer options
        if (data.player === this.playerName) {
            // Start buzz answer timer
            this.startBuzzTimer(data.buzz_timeout);
        }
    }

    clearBuzzState() {
        this.stopBuzzTimer();
        const buzzBtn = document.getElementById('buzzButton');
        if (buzzBtn) {
            buzzBtn.disabled = false;
            buzzBtn.innerHTML = '<i class="fas fa-bell"></i> اضغط الجرس!';
        }
    }

    updateBuzzButton() {
        const buzzBtn = document.getElementById('buzzButton');
        if (!buzzBtn || this.gameType !== 'rapid_fire') return;

        if (this.gameStatus === 'round_active') {
            buzzBtn.classList.remove('u-hidden');
            buzzBtn.disabled = false;
            buzzBtn.innerHTML = '<i class="fas fa-bell"></i> اضغط الجرس!';
        } else if (this.gameStatus === 'buzzed') {
            buzzBtn.classList.remove('u-hidden');
            buzzBtn.disabled = true;
        } else {
            buzzBtn.classList.add('u-hidden');
        }
    }

    buzzIn() {
        this.socket.emit('buzz_in', { game_id: this.gameId });
        const buzzBtn = document.getElementById('buzzButton');
        if (buzzBtn) {
            buzzBtn.disabled = true;
            buzzBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري...';
        }
    }

    submitBuzzAnswer(idx) {
        // Disable all option buttons
        const optionButtons = document.querySelectorAll('.options-grid button');
        optionButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        });

        this.stopBuzzTimer();
        this.socket.emit('submit_buzz_answer', {
            game_id: this.gameId,
            answer_idx: idx
        });
    }

    startBuzzTimer(duration) {
        this.stopBuzzTimer();
        const buzzTimerEl = document.getElementById('buzz-timer');
        if (!buzzTimerEl) return;

        let timeLeft = duration;
        buzzTimerEl.style.display = 'block';
        buzzTimerEl.textContent = `⏱ ${timeLeft}`;

        this.buzzTimerInterval = setInterval(() => {
            timeLeft--;
            buzzTimerEl.textContent = `⏱ ${timeLeft}`;
            if (timeLeft <= 3) buzzTimerEl.style.color = 'var(--danger)';

            if (timeLeft <= 0) {
                this.stopBuzzTimer();
                this.socket.emit('buzz_timeout', { game_id: this.gameId });
            }
        }, 1000);
    }

    stopBuzzTimer() {
        if (this.buzzTimerInterval) {
            clearInterval(this.buzzTimerInterval);
            this.buzzTimerInterval = null;
        }
        const buzzTimerEl = document.getElementById('buzz-timer');
        if (buzzTimerEl) {
            buzzTimerEl.style.display = 'none';
            buzzTimerEl.style.color = 'var(--primary)';
        }
    }

    // --- Twenty Questions Logic ---

    handleTwentyQuestionsStarted(data) {
        this.thinker = data.thinker;
        const isThinker = this.thinker === this.playerName;

        // Hide other areas
        document.getElementById('waiting-area').style.display = 'none';
        document.getElementById('bus-area')?.classList.add('u-hidden');
        document.getElementById('pictionary-area')?.classList.add('u-hidden');
        document.getElementById('rapid-fire-area')?.classList.add('u-hidden');

        const twentyQArea = document.getElementById('twenty-questions-area');
        if (twentyQArea) twentyQArea.classList.remove('u-hidden');

        const el = document.getElementById('item-display');
        if (el) {
            el.classList.remove('u-hidden');
            el.style.display = 'block';

            if (isThinker) {
                // Thinker view: word input
                let html = '<div class="item-category">أنت المفكر!</div>';
                html += '<div style="margin: 1rem 0;">اختر كلمة للآخرين ليتخمّنوها</div>';
                html += `<div class="word-suggestion" style="margin-bottom: 1rem; padding: 1rem; background: var(--surface); border-radius: 10px;">
                    <strong>اقتراح:</strong> ${data.word_suggestion.word} (${data.word_suggestion.category})
                    <button class="btn btn-outline" style="margin-right: 0.5rem;" onclick="window.gameInstance.useSuggestedWord('${data.word_suggestion.word}', '${data.word_suggestion.category}')">استخدم</button>
                </div>`;
                html += '<div class="input-group">';
                html += '<input type="text" id="secret-word-input" placeholder="اكتب الكلمة السرية..." style="text-align: center; font-size: 1.2rem;">';
                html += '<input type="text" id="secret-category-input" placeholder="الفئة (اختياري)..." style="text-align: center; margin-top: 0.5rem;">';
                html += '</div>';
                html += '<button class="btn btn-primary" style="margin-top: 1rem;" onclick="window.gameInstance.setSecretWord()">تم!</button>';
                el.innerHTML = html;
            } else {
                // Guesser view: waiting
                el.innerHTML = `
                    <div class="item-category">في انتظار المفكر...</div>
                    <div style="font-size: 1.5rem; margin-top: 1rem;">${this.thinker} يختار كلمة</div>
                    <div class="animate-heartbeat" style="margin-top: 1rem; color: var(--secondary);"><i class="fas fa-hourglass-start"></i></div>
                `;
            }
            setTimeout(() => el.classList.add('visible'), 100);
        }

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
        const el = document.getElementById('item-display');
        const isThinker = this.thinker === this.playerName;

        if (el) {
            if (isThinker) {
                // Thinker sees the word and answer buttons
                let html = '<div class="item-category">أنت المفكر</div>';
                html += `<div class="item-name" style="font-size: 2rem;">${data.category || '???'}</div>`;
                html += '<div style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-light);">انتظر الأسئلة واجب عليها</div>';
                html += '<div id="answer-buttons" style="margin-top: 1rem; display: none;">';
                html += '</div>';
                html += '<div id="pending-question" style="margin-top: 1rem; font-style: italic; color: var(--secondary);"></div>';
                el.innerHTML = html;
            } else {
                // Guessers see category and can ask questions
                let html = `<div class="item-category">الفئة: ${data.category || '???'}</div>`;
                html += '<div style="margin-top: 1rem;">اسأل سؤال بنعم/لا/يمكن</div>';
                html += '<div class="input-group" style="margin-top: 1rem;">';
                html += '<input type="text" id="question-input" placeholder="اكتب سؤالك..." style="text-align: center;">';
                html += '</div>';
                html += '<button class="btn btn-primary" style="margin-top: 0.5rem;" onclick="window.gameInstance.askQuestion()">اسأل</button>';
                html += '<div style="margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 1rem;">';
                html += '<div class="input-group">';
                html += '<input type="text" id="guess-input" placeholder="أو حاول التخمين المباشر..." style="text-align: center;">';
                html += '</div>';
                html += '<button class="btn btn-secondary" style="margin-top: 0.5rem;" onclick="window.gameInstance.makeGuess()">خمن!</button>';
                html += '</div>';
                html += '<div id="questions-history" style="margin-top: 1.5rem; max-height: 200px; overflow-y: auto;"></div>';
                el.innerHTML = html;
            }
        }

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
        const historyEl = document.getElementById('questions-history');
        if (historyEl) {
            const div = document.createElement('div');
            div.className = 'question-item';
            div.style.cssText = 'padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;';
            div.innerHTML = `<strong>${data.player}:</strong> ${data.question} <span class="badge badge-team-1" style="margin-right: 0.5rem;">#${data.question_number}</span>`;
            historyEl.appendChild(div);
            historyEl.scrollTop = historyEl.scrollHeight;
        }

        // Show to thinker
        if (this.thinker === this.playerName) {
            const pendingEl = document.getElementById('pending-question');
            const answerBtns = document.getElementById('answer-buttons');
            if (pendingEl) pendingEl.textContent = `السؤال: "${data.question}"`;
            if (answerBtns) {
                answerBtns.style.display = 'flex';
                answerBtns.style.gap = '0.5rem';
                answerBtns.innerHTML = `
                    <button class="btn btn-success" onclick="window.gameInstance.answerQuestion('yes')">نعم ✓</button>
                    <button class="btn btn-danger" onclick="window.gameInstance.answerQuestion('no')">لا ✗</button>
                    <button class="btn btn-outline" onclick="window.gameInstance.answerQuestion('maybe')">يمكن 🤔</button>
                `;
            }
        }
    }

    answerQuestion(answer) {
        this.socket.emit('answer_question', {
            game_id: this.gameId,
            answer: answer
        });
        const answerBtns = document.getElementById('answer-buttons');
        if (answerBtns) answerBtns.style.display = 'none';
    }

    handleQuestionAnswered(data) {
        const historyEl = document.getElementById('questions-history');
        if (historyEl) {
            // Find the last question and add answer
            const items = historyEl.querySelectorAll('.question-item');
            const lastItem = items[items.length - 1];
            if (lastItem && !lastItem.querySelector('.answer')) {
                const answerClass = data.answer === 'yes' ? 'badge-team-2' : (data.answer === 'no' ? 'badge-team-1' : 'badge-team-3');
                const answerText = data.answer === 'yes' ? 'نعم' : (data.answer === 'no' ? 'لا' : 'يمكن');
                lastItem.innerHTML += ` <span class="badge ${answerClass} answer" style="margin-right: 0.5rem;">${answerText}</span>`;
            }
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

    handleTwentyQuestionsEnded(data) {
        const el = document.getElementById('item-display');
        if (el) {
            let html = `<div class="item-category">انتهت الجولة!</div>`;
            html += `<div class="item-name" style="font-size: 2rem; color: ${data.winner === this.playerName ? 'var(--success)' : 'var(--primary)'};">الفائز: ${data.winner}</div>`;
            html += `<div style="margin-top: 1rem;">${data.message}</div>`;
            if (this.isHost) {
                html += '<button class="btn btn-primary" style="margin-top: 1rem;" onclick="window.gameInstance.nextTwentyQRound()">الجولة التالية</button>';
            }
            el.innerHTML = html;
        }
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
            html += '<button class="btn btn-outline" style="margin-left: 0.5rem;" onclick="window.gameInstance.skipRiddle()">تخطي اللغز</button>';
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
