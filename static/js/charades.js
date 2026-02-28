/**
 * Family Games - Charades Game & Lobby Logic
 */

const AudioManager = {
    sounds: {},
    enabled: true,

    init() {
        this.sounds.guessed = new Audio('/static/sounds/guessed.mp3');
        this.sounds.timeout = new Audio('/static/sounds/timeout.mp3');
        // Pre-load sounds
        Object.values(this.sounds).forEach(s => s.load());
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

    init() {
        if (!this.socket) {
            this.socket = io();
            this.setupListeners();
        }
    },

    setupListeners() {
        this.socket.on('game_created', (data) => {
            console.log('Game created:', data);
            this.updatePlayerList(data.players);
        });

        this.socket.on('join_success', (data) => {
            console.log('Join success:', data);
            document.getElementById('join-form').classList.add('u-hidden');
            document.getElementById('join-lobby').classList.remove('u-hidden');
            document.getElementById('join-room-id').textContent = document.getElementById('room-code').value;
            this.updatePlayerList(data.players, data.host);
        });

        this.socket.on('player_joined', (data) => {
            console.log('Player joined:', data);
            this.updatePlayerList(data.players);
            AudioManager.play('guessed');
        });

        this.socket.on('player_left', (data) => {
            console.log('Player left:', data);
            this.updatePlayerList(data.players);
            AudioManager.play('timeout');
            Utils.showMessage(`${data.player_name} انسحب من اللعبة`, 'error');
        });

        this.socket.on('game_started', (data) => {
            AudioManager.play('guessed');
            console.log('Game started:', data);
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
            alert('من فضلك اكتب اسمك');
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

    joinGame() {
        const playerName = document.getElementById('player-name').value.trim();
        const roomCode = document.getElementById('room-code').value.trim();

        if (!playerName || !roomCode) {
            alert('من فضلك اكتب اسمك ورقم الأوضة');
            return;
        }

        this.init();
        this.socket.emit('join_game', {
            game_id: roomCode,
            player_name: playerName,
            game_type: 'charades'
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
                    li.textContent += ' 👑';
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
                bus_complete: 'إنشاء غرفة أتوبيس كومبليت'
            };
            document.getElementById('modal-title').textContent = titles[gameType] || 'إنشاء غرفة لعبة';
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
                <button class="btn btn-primary" onclick="Lobby.createGame()">أوضة جديدة</button>
                <button class="btn btn-secondary" onclick="Utils.hideModal('create-game-modal')">إلغاء</button>
            `;
        } else if (modalId === 'join-game-modal') {
            document.getElementById('player-name').value = '';
            document.getElementById('room-code').value = '';
            document.getElementById('join-form').classList.remove('u-hidden');
            document.getElementById('join-lobby').classList.add('u-hidden');
            document.getElementById('join-players-list').innerHTML = '';
        }
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

        this.isDrawing = false;
        this.lastPos = { x: 0, y: 0 };
        this.ctx = null;

        this.init();
    }

    init() {
        this.socket = io();
        this.socket.on('connect', () => {
            console.log('Game Socket connected');
            this.setupUIListeners();
            this.socket.emit('verify_game', {
                game_id: this.gameId,
                player_name: this.playerName,
                transfer_id: this.transferId
            });
        });
        this.setupSocketListeners();
    }

    setupUIListeners() {
        const bindClick = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = fn.bind(this);
        };

        bindClick('startButton', () => this.socket.emit('start_game', { game_id: this.gameId }));
        bindClick('nextButton', () => this.socket.emit('force_next_turn', { game_id: this.gameId }));
        bindClick('readyButton', () => {
            document.getElementById('readyButton').style.display = 'none';
            this.socket.emit('player_ready', { game_id: this.gameId });
        });
        bindClick('guessButton', () => this.socket.emit('guess_correct', { game_id: this.gameId, player_name: this.playerName }));
        bindClick('passButton', () => this.socket.emit('player_passed', { game_id: this.gameId, player_name: this.playerName }));

        bindClick('leave-room', () => {
            if (confirm('هل أنت متأكد أنك تريد الانسحاب؟')) {
                this.socket.emit('host_withdraw', { roomId: this.gameId, playerName: this.playerName });
                window.location.href = '/';
            }
        });

        bindClick('close-room', () => {
            if (confirm('هل أنت متأكد أنك تريد إغلاق الغرفة؟')) {
                this.socket.emit('close_room', { roomId: this.gameId, playerName: this.playerName });
                window.location.href = '/';
            }
        });

        bindClick('leaveButton', () => {
            if (confirm('هل أنت متأكد أنك تريد الانسحاب؟')) {
                this.socket.emit('leave_game', { roomId: this.gameId, playerName: this.playerName });
                window.location.href = '/';
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
        this.socket.on('bus_stopped', (data) => {
            this.stopTimer();
            AudioManager.play('timeout');
            Utils.showMessage(`أتوبيس كومبليت! تم إيقاف الجولة بواسطة ${data.player}`, 'info');
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
        console.log("Game state update:", data);

        if (data.settings) this.gameSettings = data.settings;
        if (data.status) this.setGameStatus(data.status);
        if (data.message) Utils.showMessage(data.message);
        if (data.players) this.updatePlayersList(data.players);
        if (data.current_player !== undefined) this.updateCurrentPlayer(data.current_player);
        if (data.scores || data.team_scores) this.updateScores(data);

        if (data.current_question) {
            this.displayQuestion(data.current_question);
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
            reveal: document.getElementById('revealButton'),
            pass: document.getElementById('passButton')
        };

        const waitingArea = document.getElementById('waiting-area');

        Object.values(btns).forEach(b => { if (b) b.style.display = 'none'; });

        const currentPlayer = document.getElementById('current-turn').textContent;

        if (waitingArea) {
            waitingArea.style.display = (this.gameStatus === 'playing' || (this.gameStatus === 'waiting' && this.gameType !== 'trivia')) ? 'block' : 'none';
        }

        switch (this.gameStatus) {
            case 'waiting':
                if (btns.start && this.isHost) btns.start.style.display = 'block';
                break;
            case 'playing':
                if (this.gameType !== 'trivia') {
                    if (btns.ready && currentPlayer === this.playerName) btns.ready.style.display = 'block';
                }
                if (btns.next && this.isHost) btns.next.style.display = 'block';
                break;
            case 'round_active':
                if (this.gameType === 'charades' || this.gameType === 'pictionary') {
                    if (btns.guess && currentPlayer !== this.playerName) btns.guess.style.display = 'block';
                    if (btns.pass && currentPlayer === this.playerName) btns.pass.style.display = 'block';
                }
                if (btns.next && this.isHost) btns.next.style.display = 'block';
                break;
        }
    }

    updateCurrentPlayer(player) {
        const el = document.getElementById('current-turn');
        if (el) {
            if (this.gameType === 'trivia' || this.gameType === 'bus_complete') {
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
            // In Trivia, everyone sees the question. In others, only the performer (isMe) sees it.
            if (this.gameType === 'trivia' || isMe) {
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

        if (this.gameType !== 'bus_complete') {
            if (busArea) busArea.classList.add('u-hidden');
            if (busResultsArea) busResultsArea.classList.add('u-hidden');
        } else {
            // Bus Complete specific logic is handled in displayBusBoard and displayBusResults
            // But we should hide them if the status isn't active/scoring
            if (this.gameStatus !== 'round_active' && busArea) busArea.classList.add('u-hidden');
            if (this.gameStatus !== 'scoring' && busResultsArea) busResultsArea.classList.add('u-hidden');
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

        let html = '';

        // Show team scores if they exist and are non-zero
        if (data.team_scores && (data.team_scores['1'] > 0 || data.team_scores['2'] > 0)) {
            html += '<div class="team-scores-container">';
            html += `<div class="score-item">فريق 1: <span class="score-val">${data.team_scores['1']}</span></div>`;
            html += `<div class="score-item">فريق 2: <span class="score-val">${data.team_scores['2']}</span></div>`;
            html += '</div>';
        }

        // Show individual scores
        const scores = data.scores || data;
        html += Object.entries(scores)
            .map(([p, s]) => `<div class="score-item ${p === this.playerName ? 'current-player' : ''}"><span>${p}</span><span class="score-val">${s}</span></div>`)
            .join('');

        el.innerHTML = html;
    }

    startTimer(duration) {
        this.stopTimer();
        const timerEl = document.getElementById('timer');
        const timerText = timerEl ? timerEl.querySelector('span') : null;
        if (!timerEl || !timerText) return;

        this.setGameStatus('round_active');
        let timeLeft = duration;
        timerEl.style.display = 'flex';
        timerEl.classList.remove('warning', 'danger');

        const format = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
        timerText.textContent = format(timeLeft);

        this.timerInterval = setInterval(() => {
            timeLeft--;
            timerText.textContent = format(timeLeft);
            if (timeLeft <= 30) timerEl.classList.add('warning');
            if (timeLeft <= 10) {
                timerEl.classList.remove('warning');
                timerEl.classList.add('danger');
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
     */
    attachBusInputValidation() {
        const inputs = document.querySelectorAll('.bus-input');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                const val = input.value.trim();
                input.classList.remove('bus-input-valid', 'bus-input-invalid');
                if (!val) return;
                if (this.startsWithCurrentLetter(val)) {
                    input.classList.add('bus-input-valid');
                } else {
                    input.classList.add('bus-input-invalid');
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

        if (this.gameStatus === 'round_active' && !this.busInputsInitialized) {
            document.querySelectorAll('.bus-input').forEach(input => {
                input.value = '';
                input.classList.remove('bus-input-valid', 'bus-input-invalid');
            });
            this.attachBusInputValidation();
            this.busInputsInitialized = true;
        }
    }

    stopBus() {
        const answers = {};
        let hasInvalid = false;
        document.querySelectorAll('.bus-input').forEach(input => {
            const val = input.value.trim();
            const cat = input.getAttribute('data-category');
            answers[cat] = val;
            // Client-side letter check with visual feedback
            input.classList.remove('bus-input-valid', 'bus-input-invalid');
            if (val && !this.startsWithCurrentLetter(val)) {
                input.classList.add('bus-input-invalid');
                hasInvalid = true;
            }
        });

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
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    AudioManager.init();
    const isGamePage = window.location.pathname.includes('/game/');

    if (isGamePage) {
        const gameData = JSON.parse(sessionStorage.getItem('gameData') || '{}');
        const urlParams = new URLSearchParams(window.location.search);

        const gameId = window.location.pathname.split('/').pop() || gameData.gameId;
        const playerName = urlParams.get('player_name') || gameData.playerName;
        const transferId = urlParams.get('transfer_id') || gameData.transferId;
        const isHost = document.getElementById('is-host')?.value === 'true';

        if (gameId && playerName && transferId) {
            window.gameInstance = new GameEngine(gameId, playerName, transferId, isHost);
        } else {
            Utils.showError('معلومات اللعبة غير كاملة');
        }
    }
});
