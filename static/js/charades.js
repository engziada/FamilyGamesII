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
            sound.play().catch(e => {});
        }
    }
};

// --- Managers ---

const HapticManager = {
    vibrate(pattern) {
        if (!("vibrate" in navigator)) return;

        const patterns = {
            correct: 50,
            wrong: [100, 50, 100],
            timeout: 200,
            win: [50, 50, 50, 200]
        };

        navigator.vibrate(patterns[pattern] || pattern);
    }
};

const KeyboardShortcuts = {
    shortcuts: {
        ' ': 'readyButton',
        'Enter': 'guessButton',
        'Escape': 'close-room',
        'p': 'pauseButton', // Host only
        't': 'theme-toggle',
        'h': 'show-rules-btn',
        'm': 'mute-toggle'
    },

    init() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger if user is typing in an input
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

            const actionId = this.shortcuts[e.key];
            if (actionId) {
                const el = document.getElementById(actionId);
                if (el && el.style.display !== 'none' && !el.disabled) {
                    e.preventDefault();
                    el.click();
                }
            }
        });
    }
};

const ToastManager = {
    show(message, type = 'info', duration = 4000) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = 'position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; gap: 0.5rem; align-items: center; width: min(90vw, 400px);';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };

        toast.className = `card animate-bounce-down ${type}`;
        toast.style.cssText = 'padding: 1rem 2rem; border-radius: 20px 50px; min-width: 300px; display: flex; align-items: center; gap: 1rem; cursor: pointer;';
        if (type === 'success') toast.style.borderColor = 'var(--success)';
        if (type === 'error') toast.style.borderColor = 'var(--danger)';

        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info}" style="font-size: 1.2rem;"></i>
            <span style="font-weight: 700;">${message}</span>
        `;

        toast.onclick = () => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        };

        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.5s ease';
                setTimeout(() => toast.remove(), 500);
            }
        }, duration);
    }
};

// --- Socket Management ---
const SocketManager = {
    socket: null,
    getSocket() {
        if (!this.socket) {
            this.socket = io({
                reconnection: true,
                reconnectionAttempts: 5,
                timeout: 10000
            });
        }
        return this.socket;
    }
};

// --- Lobby Logic ---

const Lobby = {
    socket: null,
    gameType: 'charades',
    avatars: ['🐶','🐱','🐼','🦁','🐸','🦊','🐻','🐨','🐯','🦄','🐷','🐮','🐵','🦉','🐙','🦀','🐢','🦋','🐝','🐛'],
    
    init() {
        this.initAvatarPicker('host-avatar-picker', 'host-avatar');
        this.initAvatarPicker('player-avatar-picker', 'player-avatar');

        // Only init socket if we are on the index page (not game page)
        // because GameEngine will handle it on game page.
        if (window.location.pathname === '/') {
            if (!this.socket) {
                this.socket = SocketManager.getSocket();
                this.setupListeners();
            }
        }
    },

    initAvatarPicker(containerId, inputId) {
        const container = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        if (!container || !input) return;

        container.innerHTML = '';
        this.avatars.forEach(avatar => {
            const span = document.createElement('span');
            span.className = 'avatar-option';
            if (avatar === input.value) span.classList.add('selected');
            span.textContent = avatar;
            span.onclick = () => {
                container.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
                span.classList.add('selected');
                input.value = avatar;
                const btnId = inputId === 'host-avatar' ? 'host-avatar-btn' : 'player-avatar-btn';
                document.getElementById(btnId).textContent = avatar;
                this.toggleAvatarPicker(containerId + '-container');
                HapticManager.vibrate(50);
            };
            container.appendChild(span);
        });
    },

    toggleAvatarPicker(containerId) {
        const el = document.getElementById(containerId);
        if (el) {
            const isHidden = el.classList.contains('u-hidden');
            Utils.toggleVisibility(el, isHidden);
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
        const avatar = document.getElementById('host-avatar').value;
        if (!hostName) {
            ToastManager.show('من فضلك اكتب اسمك', 'warning');
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
            avatar: avatar,
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
        document.querySelector('.players-list').classList.remove('u-hidden');

        // Generate QR Code
        const qrContainer = document.getElementById('qrcode');
        if (qrContainer && typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, {
                text: window.location.origin + "/?room=" + gameId,
                width: 128,
                height: 128,
                colorDark : "#2F2F2F",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
        }

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
        const avatar = document.getElementById('player-avatar').value;

        if (!playerName || !roomCode) {
            ToastManager.show('من فضلك اكتب اسمك ورقم الأوضة', 'warning');
            return;
        }

        this.init();
        this.socket.emit('join_game', {
            game_id: roomCode,
            player_name: playerName,
            avatar: avatar,
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
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.gap = '0.5rem';

                const name = typeof player === 'object' ? player.name : player;
                const isHost = typeof player === 'object' ? player.isHost : (name === host);
                const avatar = typeof player === 'object' ? player.avatar || '🐶' : '🐶';

                li.innerHTML = `
                    <span class="player-avatar">${avatar}</span>
                    <span class="player-name">${name} ${isHost ? '👑' : ''}</span>
                `;
                if (isHost) li.classList.add('host');
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

const GameRules = {
    charades: {
        title: "بدون كلام",
        objective: "مثل الكلمة أو الفيلم لأصحابك من غير ما تنطق ولا حرف!",
        rules: [
            "ممنوع الكلام تماماً أو إصدار أي صوت.",
            "ممنوع تشاور على حاجات موجودة في الأوضة.",
            "ممنوع ترسم في الهوا حروف أو أرقام.",
            "التمثيل بالوش والجسم بس."
        ],
        tips: "اتفقوا على إشارات معينة للحاجات المتكررة (زي فيلم، مسلسل، قديم، جديد)."
    },
    pictionary: {
        title: "ارسم وخمن",
        objective: "ارسم الكلمة المطلوبة وصحابك لازم يعرفوها قبل الوقت ما يخلص.",
        rules: [
            "ممنوع كتابة أي حروف أو أرقام على اللوحة.",
            "ممنوع الكلام أو إعطاء تلميحات بالصوت.",
            "أول واحد يكتب الإجابة الصح بياخد نقط."
        ],
        tips: "استخدم الألوان المختلفة عشان توضح التفاصيل أكتر."
    },
    trivia: {
        title: "بنك المعلومات",
        objective: "جاوب على الأسئلة الثقافية المتنوعة واجمع أكبر عدد من النقط.",
        rules: [
            "السؤال بيظهر لكل اللاعبين في نفس الوقت.",
            "أسرع واحد بيجاوب صح هو اللي بياخد النقط.",
            "لو جاوبت غلط، مش هتقدر تجاوب تاني على نفس السؤال."
        ],
        tips: "السرعة هي مفتاح الفوز في بنك المعلومات!"
    }
};

const Utils = {
    showGameModal(gameType, action) {
        const modalId = action === 'create' ? 'create-game-modal' : 'join-game-modal';
        if (action === 'create') {
            document.getElementById('modal-game-type').value = gameType;
            let title = 'إنشاء غرفة جديدة';
            if (gameType === 'charades') title = 'إنشاء غرفة بدون كلام';
            else if (gameType === 'pictionary') title = 'إنشاء غرفة ارسم وخمن';
            else if (gameType === 'trivia') title = 'إنشاء غرفة بنك المعلومات';
            document.getElementById('modal-title').textContent = title;
        }
        document.getElementById(modalId).style.display = 'flex';
    },

    showRulesModal(gameType) {
        const rules = GameRules[gameType];
        if (!rules) return;

        let modal = document.getElementById('rules-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'rules-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content animate-jelly">
                <i class="fas fa-book-open fa-3x" style="color: var(--secondary); margin-bottom: 1rem;"></i>
                <h2>كيف تلعب: ${rules.title}</h2>
                <div class="rules-body u-text-right" style="width: 100%; text-align: right; margin-block: 1.5rem;">
                    <h4 style="color: var(--primary); margin-bottom: 0.5rem;"><i class="fas fa-bullseye"></i> الهدف:</h4>
                    <p style="margin-bottom: 1.5rem;">${rules.objective}</p>

                    <h4 style="color: var(--primary); margin-bottom: 0.5rem;"><i class="fas fa-list-ol"></i> القوانين:</h4>
                    <ul style="margin-bottom: 1.5rem; padding-right: 1.5rem;">
                        ${rules.rules.map(r => `<li style="margin-bottom: 0.5rem;">${r}</li>`).join('')}
                    </ul>

                    <h4 style="color: var(--primary); margin-bottom: 0.5rem;"><i class="fas fa-lightbulb"></i> نصيحة:</h4>
                    <p>${rules.tips}</p>
                </div>
                <button class="btn btn-primary u-full-width" onclick="Utils.hideModal('rules-modal')">فهمت!</button>
            </div>
        `;
        modal.style.display = 'flex';
    },

    hideModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
        if (modalId === 'create-game-modal') {
            document.getElementById('host-name').value = '';
            document.getElementById('room-info').classList.add('u-hidden');
            document.getElementById('host-players-list').innerHTML = '';
            const buttonsDiv = document.querySelector('#create-game-modal .buttons');
            buttonsDiv.innerHTML = `
                <button class="btn btn-primary" onclick="Lobby.createGame()">أوضة جديدة</button>
                <button class="btn btn-secondary" onclick="Utils.hideModal('create-game-modal')">إلغاء</button>
            `;
        } else if (modalId === 'join-game-modal') {
            document.getElementById('player-name').value = '';
            document.getElementById('room-code').value = '';
            document.getElementById('join-form').style.display = 'block';
            document.getElementById('join-lobby').style.display = 'none';
            document.getElementById('join-players-list').innerHTML = '';
        }
    },

    showError(message) {
        ToastManager.show(message, 'error');
    },

    copyToClipboard(text) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            this.showMessage('تم النسخ!', 'success');
        }).catch(err => {
            console.error('Could not copy text: ', err);
            // Fallback for older browsers
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showMessage('تم النسخ!', 'success');
            } catch (err) {
                console.error('Fallback copy failed', err);
            }
            document.body.removeChild(textArea);
        });
    },

    triggerConfetti(type = 'burst') {
        if (!AudioManager.enabled) return; // Optional: separate confetti toggle?
        const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#6BCB77'];

        if (type === 'burst') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: colors
            });
        } else if (type === 'full') {
            const duration = 5 * 1000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0, colors: colors };

            const randomInRange = (min, max) => Math.random() * (max - min) + min;

            const interval = setInterval(function() {
                const timeLeft = animationEnd - Date.now();

                if (timeLeft <= 0) {
                    return clearInterval(interval);
                }

                const particleCount = 50 * (timeLeft / duration);
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
            }, 250);
        } else if (type === 'gold') {
            confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 },
                colors: ['#FFE66D', '#FFD700']
            });
        }
    },

    showMessage(message, type = 'info') {
        ToastManager.show(message, type);
    },

    toggleVisibility(el, visible, displayType = 'block') {
        if (!el) return;
        if (visible) {
            el.classList.remove('u-hidden');
            el.style.display = displayType;
        } else {
            el.classList.add('u-hidden');
            el.style.display = 'none';
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
        this.paused = false;
        this.gameSettings = {};
        this.currentItemCategory = null;
        
        this.isDrawing = false;
        this.lastPos = { x: 0, y: 0 };
        this.ctx = null;

        this.init();
    }

    init() {
        this.socket = SocketManager.getSocket();
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
        bindClick('pauseButton', () => this.socket.emit('toggle_pause', { game_id: this.gameId }));
        bindClick('readyButton', () => {
            Utils.toggleVisibility(document.getElementById('readyButton'), false);
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
            if (data.paused !== undefined) {
                this.paused = data.paused;
                this.updatePauseUI();
            }
            this.updateGameState(data);
        });
        this.socket.on('timer_start', (data) => this.startTimer(data.duration));
        this.socket.on('correct_guess', (data) => {
            AudioManager.play('guessed');
            HapticManager.vibrate('correct');
            ToastManager.show(`${data.guesser} عرف الإجابة!`, 'success');
            Utils.triggerConfetti('burst');
        });
        
        this.socket.on('round_timeout', (data) => {
            this.stopTimer();
            this.playTimeoutTwice();
            HapticManager.vibrate('timeout');
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
                HapticManager.vibrate('correct');
                ToastManager.show(`${data.player} جاوب صح ✅. الإجابة كانت: ${data.correct_answer}`, 'success');
                Utils.triggerConfetti('burst');
            } else {
                AudioManager.play('timeout');
                HapticManager.vibrate('wrong');
                ToastManager.show(`${data.player} جاوب غلط ❌`, 'error');
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

        this.socket.on('game_paused', (data) => {
            this.paused = data.paused;
            this.updatePauseUI();
            const action = this.paused ? 'توقف' : 'استئناف';
            ToastManager.show(`تم ${action} اللعبة بواسطة ${data.paused_by}`, 'info');
        });

        this.socket.on('player_ready_status', (data) => {
            // Find player in this.players list and update ready status
            if (this.lastPlayersList) {
                this.lastPlayersList.forEach(p => {
                    const name = typeof p === 'object' ? p.name : p;
                    if (name === data.player_name) {
                        p.ready = data.ready;
                    }
                });
                this.updatePlayersList(this.lastPlayersList);
            }
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
        this.socket.on('new_reaction', (data) => this.showReaction(data));
        this.socket.on('game_ended', (data) => this.showGameSummary(data));
        this.socket.on('item_hint', (data) => this.showHint(data));

        this.socket.on('game_error', (data) => Utils.showError(data.message));
    }

    updateGameState(data) {
        if (!data) return;
        console.log("Game state update:", data);
        
        if (data.paused !== undefined) {
            this.paused = data.paused;
            this.updatePauseUI();
        }

        if (data.settings) this.gameSettings = data.settings;
        if (data.status) this.setGameStatus(data.status);
        if (data.message) Utils.showMessage(data.message);
        if (data.players) {
            this.lastPlayersList = data.players;
            this.updatePlayersList(data.players);
        }
        if (data.current_player !== undefined) this.updateCurrentPlayer(data.current_player);
        if (data.scores || data.team_scores) this.updateScores(data);
        
        if (data.current_question) {
            this.displayQuestion(data.current_question);
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
                    Utils.toggleVisibility(itemDisplay, false);
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
            pass: document.getElementById('passButton'),
            pause: document.getElementById('pauseButton')
        };

        const waitingArea = document.getElementById('waiting-area');

        Object.values(btns).forEach(b => { if(b) Utils.toggleVisibility(b, false); });

        const currentPlayer = document.getElementById('current-turn').textContent;

        if (waitingArea) {
            const shouldShowWaiting = (this.gameStatus === 'playing' || (this.gameStatus === 'waiting' && this.gameType !== 'trivia'));
            Utils.toggleVisibility(waitingArea, shouldShowWaiting);
        }

        switch (this.gameStatus) {
            case 'waiting':
                if (btns.start && this.isHost) Utils.toggleVisibility(btns.start, true);
                break;
            case 'playing':
                if (this.gameType !== 'trivia') {
                    if (btns.ready && currentPlayer === this.playerName) Utils.toggleVisibility(btns.ready, true);
                }
                if (btns.next && this.isHost) Utils.toggleVisibility(btns.next, true);
                if (btns.pause && this.isHost) Utils.toggleVisibility(btns.pause, true);
                break;
            case 'round_active':
                if (this.gameType === 'charades' || this.gameType === 'pictionary') {
                    if (btns.guess && currentPlayer !== this.playerName) Utils.toggleVisibility(btns.guess, true);
                    if (btns.pass && currentPlayer === this.playerName) Utils.toggleVisibility(btns.pass, true);
                }
                if (btns.next && this.isHost) Utils.toggleVisibility(btns.next, true);
                if (btns.pause && this.isHost) Utils.toggleVisibility(btns.pause, true);
                break;
        }

        if (this.paused) {
            if (btns.guess) Utils.toggleVisibility(btns.guess, false);
            if (btns.pass) Utils.toggleVisibility(btns.pass, false);
            if (btns.ready) Utils.toggleVisibility(btns.ready, false);
        }
    }

    updatePauseUI() {
        const overlay = document.getElementById('pause-overlay');
        const pauseBtnText = document.getElementById('pause-btn-text');
        const pauseBtnIcon = document.querySelector('#pauseButton i');

        if (overlay) Utils.toggleVisibility(overlay, this.paused, 'flex');

        if (pauseBtnText) {
            pauseBtnText.textContent = this.paused ? 'استئناف اللعبة' : 'إيقاف مؤقت';
        }

        if (pauseBtnIcon) {
            pauseBtnIcon.className = this.paused ? 'fas fa-play' : 'fas fa-pause';
        }

        this.updateButtonVisibility();
    }

    updateCurrentPlayer(player) {
        const el = document.getElementById('current-turn');
        if (el) {
            if (this.gameType === 'trivia') {
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
                Utils.toggleVisibility(itemDisplay, true);
                // Don't add .visible here if we're about to call displayQuestion/displayItem
            } else if (this.gameType === 'pictionary' && !isMe && this.currentItemCategory) {
                // Show category hint for non-drawing players in easy/medium difficulty
                const difficulty = this.gameSettings.difficulty || 'medium';
                if (difficulty === 'easy' || difficulty === 'medium') {
                    Utils.toggleVisibility(itemDisplay, true);
                    itemDisplay.innerHTML = `<div class="item-category" style="font-size: 1.8rem;">${this.currentItemCategory}</div>`;
                    itemDisplay.classList.add('visible');
                } else {
                    Utils.toggleVisibility(itemDisplay, false);
                    itemDisplay.classList.remove('visible');
                    console.log('Hard difficulty - no category hint');
                }
            } else {
                Utils.toggleVisibility(itemDisplay, false);
                itemDisplay.classList.remove('visible');
            }
        }

        if (pictionaryArea) {
            if (this.gameType === 'pictionary' && this.gameStatus === 'round_active') {
                Utils.toggleVisibility(pictionaryArea, true);
                this.initCanvas();
                // Show controls only to the drawer
                const controls = document.querySelector('.canvas-controls');
                if (controls) Utils.toggleVisibility(controls, isMe, 'flex');
            } else {
                Utils.toggleVisibility(pictionaryArea, false);
            }
        }

        this.updateButtonVisibility();
    }

    displayItem(category, itemData) {
        const el = document.getElementById('item-display');
        if (el) {
            Utils.toggleVisibility(el, true);
            const item = typeof itemData === 'object' ? itemData.item : itemData;
            const year = itemData.year ? `<div class="item-meta">سنة الإنتاج: ${itemData.year}</div>` : '';
            const starring = itemData.starring ? `<div class="item-meta">بطولة: ${itemData.starring}</div>` : '';
            const type = itemData.type ? `<span class="badge badge-team-2">${itemData.type}</span>` : '';

            const categoryIcons = {
                'أفلام': '🎬', 'مسلسلات': '📺', 'مسرحيات': '🎭', 'أغاني': '🎵', 'شخصيات': '👤', 'أمثال': '🗣️'
            };
            const icon = categoryIcons[category] || '🎮';

            el.innerHTML = `
                <div class="item-category animate-bounce-down">${icon} ${category} ${type}</div>
                <div class="item-name animate-jelly">${item}</div>
                ${year}
                ${starring}
            `;
            setTimeout(() => el.classList.add('visible'), 100);
        }
    }

    displayQuestion(data) {
        const el = document.getElementById('item-display');
        if (el) {
            Utils.toggleVisibility(el, true);
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

        this.initSwipeGestures();
    }

    initSwipeGestures() {
        let touchstartX = 0;
        let touchstartY = 0;
        let touchendX = 0;
        let touchendY = 0;

        const handleSwipe = () => {
            const dx = touchendX - touchstartX;
            const dy = touchendY - touchstartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 100) {
                if (dx > 0) { // Swipe Right
                    const passBtn = document.getElementById('passButton');
                    if (passBtn && !passBtn.classList.contains('u-hidden')) passBtn.click();
                } else { // Swipe Left
                    const readyBtn = document.getElementById('readyButton');
                    if (readyBtn && !readyBtn.classList.contains('u-hidden')) readyBtn.click();
                    const guessBtn = document.getElementById('guessButton');
                    if (guessBtn && !guessBtn.classList.contains('u-hidden')) guessBtn.click();
                }
            }
        };

        document.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
            touchstartY = e.changedTouches[0].screenY;
        }, false);

        document.addEventListener('touchend', e => {
            touchendX = e.changedTouches[0].screenX;
            touchendY = e.changedTouches[0].screenY;
            handleSwipe();
        }, false);
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
        
        this.lastPlayersList = players;
        listEl.innerHTML = '';
        const ul = document.createElement('ul');
        ul.classList.add('players-ul');
        
        players.forEach(p => {
            const name = typeof p === 'object' ? p.name : p;
            const avatar = typeof p === 'object' ? p.avatar || '🐶' : '🐶';
            const isHost = typeof p === 'object' ? p.isHost : false;
            const team = typeof p === 'object' ? p.team : null;
            const isReady = typeof p === 'object' ? p.ready : false;

            const li = document.createElement('li');
            li.className = `player-item ${name === this.playerName ? 'current-player' : ''}`;

            let statusIcon = isReady ?
                '<span class="ready-status animate-fade-in"><i class="fas fa-check-circle" style="color: var(--success);"></i></span>' :
                '<span class="ready-status">⏳</span>';

            // Don't show status icon for trivia since it's "all players" or if game hasn't started
            if (this.gameStatus === 'waiting') statusIcon = '';

            let html = `
                <div class="player-info">
                    ${statusIcon}
                    <span class="player-avatar" style="margin-left: 0.5rem;">${avatar}</span>
                    <span>${name} ${isHost ? '👑' : ''} ${name === this.playerName ? '(أنت)' : ''}</span>
                </div>
            `;
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
        
        const newScores = data.scores || (data.team_scores ? {} : data);
        const previousScores = this.previousScores || {};
        const players = data.players || [];

        let html = '';
        
        // Show team scores with bars
        if (data.team_scores && (data.team_scores['1'] > 0 || data.team_scores['2'] > 0)) {
            const t1 = data.team_scores['1'] || 0;
            const t2 = data.team_scores['2'] || 0;
            const max = Math.max(t1, t2, 10);

            html += '<div class="team-scores-bars u-margin-bottom">';
            [1, 2].forEach(teamNum => {
                const score = data.team_scores[teamNum] || 0;
                const percent = (score / max) * 100;
                html += `
                    <div class="team-bar-container u-margin-bottom">
                        <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:700;">
                            <span>فريق ${teamNum}</span>
                            <span>${score}</span>
                        </div>
                        <div class="progress-bar" style="height:10px; background:rgba(0,0,0,0.1); border-radius:5px; overflow:hidden;">
                            <div style="width:${percent}%; height:100%; background:var(--team-${teamNum}-color, ${teamNum === 1 ? '#FF6B6B' : '#4ECDC4'}); transition:width 1s ease;"></div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            this.previousTeamScores = Object.assign({}, data.team_scores);
        }
        
        // Sort individual scores for leaderboard view
        const sortedScores = Object.entries(newScores).sort((a, b) => b[1] - a[1]);

        // Show individual scores
        html += sortedScores
            .map(([p, s], index) => {
                const prevScore = previousScores[p] || 0;
                const diff = s - prevScore;
                const animClass = diff > 0 ? 'score-highlight' : '';
                const playerObj = players.find(pl => pl.name === p);
                const avatar = playerObj ? playerObj.avatar || '🐶' : '🐶';

                const medals = ['🥇', '🥈', '🥉'];
                const rank = index < 3 ? medals[index] : (index + 1) + '.';

                return `
                    <div class="score-item ${p === this.playerName ? 'current-player' : ''} ${animClass}" style="position: relative; display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-size:0.8rem; min-width:20px;">${rank}</span>
                        <span class="player-avatar">${avatar}</span>
                        <span style="flex:1;">${p}</span>
                        <span class="score-val" id="player-score-${p}" style="font-weight:800;">${s}</span>
                        ${diff > 0 ? `<span class="flying-score">+${diff}</span>` : ''}
                    </div>`;
            })
            .join('');

        el.innerHTML = html;

        // Animate count-up for changed scores
        Object.entries(newScores).forEach(([p, s]) => {
            const prevScore = previousScores[p] || 0;
            if (s > prevScore) {
                this.animateValue(`player-score-${p}`, prevScore, s, 800);
            }
        });

        this.previousScores = Object.assign({}, newScores);
    }

    animateValue(id, start, end, duration) {
        const obj = document.getElementById(id);
        if (!obj) return;
        const range = end - start;
        let current = start;
        const increment = end > start ? 1 : -1;
        const stepTime = Math.abs(Math.floor(duration / range));
        const timer = setInterval(() => {
            current += increment;
            obj.innerText = current;
            if (current == end) {
                clearInterval(timer);
            }
        }, stepTime || 10);
    }

    startTimer(duration) {
        this.stopTimer();
        if (this.paused) return;
        const timerEl = document.getElementById('timer');
        const timerText = timerEl ? timerEl.querySelector('.timer-text') : null;
        const progressCircle = timerEl ? timerEl.querySelector('.timer-progress') : null;

        if (!timerEl || !timerText || !progressCircle) return;
        
        this.setGameStatus('round_active');
        let timeLeft = duration;
        Utils.toggleVisibility(timerEl, true, 'flex');
        timerEl.className = 'timer-container'; // Reset classes

        const totalLength = 2 * Math.PI * 45;
        progressCircle.style.strokeDasharray = totalLength;

        const format = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;
        timerText.textContent = format(timeLeft);

        this.timerInterval = setInterval(() => {
            if (this.paused) return;
            timeLeft--;
            timerText.textContent = format(timeLeft);

            // Circular progress
            const offset = totalLength - (timeLeft / duration) * totalLength;
            progressCircle.style.strokeDashoffset = offset;

            // Colors
            const percent = (timeLeft / duration) * 100;
            if (percent < 15) timerEl.classList.add('danger');
            else if (percent < 40) timerEl.classList.add('warning');

            if (timeLeft <= 10) {
                timerEl.classList.add('pulse');
                if (timeLeft <= 5 && timeLeft > 0) AudioManager.play('timeout');
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
        if (el) Utils.toggleVisibility(el, false);
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
        Utils.toggleVisibility(msg, true);
        setTimeout(() => Utils.toggleVisibility(msg, false), 5000);
    }

    sendReaction(emoji) {
        if (this.lastReactionTime && Date.now() - this.lastReactionTime < 2000) return;
        this.lastReactionTime = Date.now();
        this.socket.emit('player_reaction', { game_id: this.gameId, reaction: emoji });
        HapticManager.vibrate(50);
    }

    showReaction(data) {
        const floating = document.createElement('div');
        floating.className = 'floating-reaction';
        floating.innerHTML = `<span class="reaction-name">${data.player}</span><span class="reaction-emoji">${data.reaction}</span>`;

        // Random horizontal position
        const x = 20 + Math.random() * 60;
        floating.style.left = x + '%';
        floating.style.bottom = '20%';

        document.body.appendChild(floating);
        setTimeout(() => floating.remove(), 2500);
    }

    showGameSummary(data) {
        const modal = document.getElementById('summary-modal');
        if (!modal) return;

        this.stopTimer();
        Utils.triggerConfetti('full');
        AudioManager.play('guessed');

        // Leaderboard
        const lb = document.getElementById('summary-leaderboard');
        const sorted = Object.entries(data.scores || {}).sort((a,b) => b[1] - a[1]);
        const medals = ['🥇', '🥈', '🥉'];

        lb.innerHTML = sorted.map(([name, score], i) => `
            <div class="summary-player card" style="display:flex; align-items:center; gap:1rem; margin-bottom:0.5rem; padding:0.8rem 1.5rem;">
                <span style="font-size:1.5rem;">${medals[i] || (i+1)+'.'}</span>
                <span style="flex:1; font-weight:700;">${name}</span>
                <span class="badge badge-primary">${score} نقطة</span>
            </div>
        `).join('');

        // Highlights
        const highlights = document.getElementById('summary-highlights');
        const stats = data.player_stats || {};
        let mvp = sorted[0] ? sorted[0][0] : '-';

        let speedster = '-';
        let fastestTime = 999;
        let consistent = '-';
        let maxCorrect = 0;

        Object.entries(stats).forEach(([name, s]) => {
            if (s.fastest < fastestTime) {
                fastestTime = s.fastest;
                speedster = name;
            }
            if (s.correct > maxCorrect) {
                maxCorrect = s.correct;
                consistent = name;
            }
        });

        highlights.innerHTML = `
            <div class="highlight-card card animate-bounce-down" style="--delay: 0.1s">
                <i class="fas fa-crown fa-2x" style="color: gold;"></i>
                <h4>MVP</h4>
                <p>${mvp}</p>
            </div>
            <div class="highlight-card card animate-bounce-down" style="--delay: 0.2s">
                <i class="fas fa-bolt fa-2x" style="color: var(--secondary);"></i>
                <h4>الأسرع</h4>
                <p>${speedster}</p>
            </div>
            <div class="highlight-card card animate-bounce-down" style="--delay: 0.3s">
                <i class="fas fa-bullseye fa-2x" style="color: var(--primary);"></i>
                <h4>المالك</h4>
                <p>${consistent}</p>
            </div>
        `;

        document.getElementById('stat-rounds').textContent = data.rounds_played || 0;
        const dur = data.game_duration || 0;
        document.getElementById('stat-duration').textContent = Math.floor(dur/60) + ' دقيقة';

        modal.style.display = 'flex';

        // Share button logic
        const shareBtn = document.getElementById('share-results-btn');
        if (shareBtn) {
            shareBtn.onclick = () => this.generateShareImage();
        }
    }

    async generateShareImage() {
        if (typeof html2canvas === 'undefined') {
            ToastManager.show('جاري تحميل مكتبة المشاركة...', 'info');
            return;
        }

        const modalContent = document.querySelector('.summary-content');
        try {
            const canvas = await html2canvas(modalContent, {
                backgroundColor: '#F7FFF7',
                scale: 2
            });
            const link = document.createElement('a');
            link.download = `family-games-result-${this.gameId}.png`;
            link.href = canvas.toDataURL();
            link.click();
            ToastManager.show('تم تجهيز الصورة للمشاركة!', 'success');
        } catch (e) {
            console.error(e);
            ToastManager.show('فشل إنشاء الصورة', 'error');
        }
    }

    showHint(data) {
        let hintContainer = document.getElementById('hint-container');
        if (!hintContainer) {
            hintContainer = document.createElement('div');
            hintContainer.id = 'hint-container';
            hintContainer.style.cssText = 'position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; gap: 5px;';
            const area = document.getElementById('pictionary-area') || document.getElementById('item-display');
            if (area) area.appendChild(hintContainer);
        }

        const badge = document.createElement('div');
        badge.className = 'badge badge-team-2 animate-bounce-down';
        badge.innerHTML = `<i class="fas fa-lightbulb"></i> تلميح: ${data.hint}`;
        hintContainer.appendChild(badge);
        HapticManager.vibrate(50);
    }
}

// --- Theme Manager ---

const ThemeManager = {
    init() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);

        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                this.setTheme(newTheme);
            };
        }
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (theme === 'dark') {
                icon.className = 'fas fa-sun';
            } else {
                icon.className = 'fas fa-moon';
            }
        }
    }
};

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    KeyboardShortcuts.init();
    AudioManager.init();
    Lobby.init();
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
