/**
 * Family Games - Charades Game & Lobby Logic
 */

const AudioManager = {
    sounds: {},
    enabled: true,

    init() {
        this.sounds.guessed = new Audio('/static/sounds/guessed.mp3');
        this.sounds.timeout = new Audio('/static/sounds/guessed.mp3'); // Using guessed sound temporarily - more pleasant than buzz
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

const HapticManager = {
    vibrate(pattern) {
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    },
    success() { this.vibrate(50); },
    error() { this.vibrate([100, 50, 100]); },
    warning() { this.vibrate(100); },
    timeout() { this.vibrate(200); },
    win() { this.vibrate([50, 50, 50, 200]); }
};

const ToastManager = {
    container: null,

    init() {
        if (document.getElementById('toast-container')) return;
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.style.cssText = `
            position: fixed;
            bottom: 2rem;
            left: 2rem;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 1rem;
            pointer-events: none;
        `;
        document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 3000) {
        if (!this.container) this.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} animate__animated animate__fadeInUp`;

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };

        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info}"></i>
            <span>${message}</span>
        `;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.classList.replace('animate__fadeInUp', 'animate__fadeOutDown');
            setTimeout(() => toast.remove(), 500);
        }, duration);
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
            document.getElementById('join-form').style.display = 'none';
            document.getElementById('join-lobby').style.display = 'block';
            document.getElementById('join-room-id').textContent = document.getElementById('room-code').value;
            this.updatePlayerList(data.players, data.host, data.ready_players);
        });

        this.socket.on('player_joined', (data) => {
            console.log('Player joined:', data);
            this.updatePlayerList(data.players, null, data.ready_players);
            AudioManager.play('guessed');
        });

        this.socket.on('player_left', (data) => {
            console.log('Player left:', data);
            this.updatePlayerList(data.players, null, data.ready_players);
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

    populateAvatarPickers() {
        const avatars = ['🐶','🐱','🐼','🦁','🐸','🦊','🐻','🐨','🐯','🦄','🐷','🐮','🐵','🦉','🐙','🦀','🐢','🦋','🐝','🐛'];
        const pickers = [document.getElementById('host-avatar-picker'), document.getElementById('join-avatar-picker')];
        const inputs = [document.getElementById('host-avatar'), document.getElementById('join-avatar')];

        pickers.forEach((picker, i) => {
            if (!picker) return;
            picker.innerHTML = '';
            avatars.forEach(av => {
                const span = document.createElement('span');
                span.className = 'avatar-option';
                if (av === inputs[i].value) span.classList.add('selected');
                span.textContent = av;
                span.onclick = () => {
                    picker.querySelectorAll('.avatar-option').forEach(s => s.classList.remove('selected'));
                    span.classList.add('selected');
                    inputs[i].value = av;
                };
                picker.appendChild(span);
            });
        });
    },

    createGame() {
        const hostName = document.getElementById('host-name').value.trim();
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
        const avatar = document.getElementById('host-avatar').value;
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
        document.getElementById('room-info').style.display = 'block';
        document.querySelector('.players-list').style.display = 'block';

        // QR Code Generation
        const qrcodeEl = document.getElementById('qrcode');
        if (qrcodeEl && typeof QRCode === 'function') {
            qrcodeEl.innerHTML = '';
            const joinUrl = `${window.location.origin}/?join=${gameId}`;
            new QRCode(qrcodeEl, {
                text: joinUrl,
                width: 120,
                height: 120,
                colorDark: "#2F2F2F",
                colorLight: "#FFFFFF",
                correctLevel: QRCode.CorrectLevel.H
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
        const avatar = document.getElementById('join-avatar').value;

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

    toggleReady() {
        const roomCode = document.getElementById('room-id').textContent || document.getElementById('join-room-id').textContent;
        if (this.socket && roomCode) {
            this.socket.emit('player_ready_status', { game_id: roomCode });
        }
    },

    updatePlayerList(players, host, readyPlayers = []) {
        console.log("Updating player list with avatars:", players);
        const hostList = document.getElementById('host-players-list');
        const joinList = document.getElementById('join-players-list');
        const lists = [hostList, joinList].filter(list => list);

        lists.forEach(list => {
            list.innerHTML = '';
            players.forEach(player => {
                const li = document.createElement('li');
                const name = typeof player === 'object' ? player.name : player;
                const avatar = typeof player === 'object' ? (player.avatar || '🐶') : '🐶';
                const isHost = typeof player === 'object' ? player.isHost : (name === host);
                const isReady = readyPlayers.includes(name);

                li.innerHTML = `<span class="player-avatar">${avatar}</span><span>${name} ${isHost ? '👑' : ''}</span>`;

                const statusSpan = document.createElement('span');
                statusSpan.className = `ready-status ${isReady ? 'ready' : 'waiting'}`;
                statusSpan.innerHTML = isReady ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-hourglass-start"></i>';
                li.appendChild(statusSpan);

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
        title: "قوانين بدون كلام 🎭",
        content: `
            <ul style="list-style-type: none; padding: 0;">
                <li style="margin-bottom: 1rem;"><strong>🎯 الهدف:</strong> تمثيل الكلمة أو الجملة لفريقك أو أصحابك بدون استخدام أي صوت.</li>
                <li style="margin-bottom: 1rem;"><strong>📜 القواعد:</strong>
                    <ul style="margin-top: 0.5rem;">
                        <li>ممنوع الكلام أو الهمس أو إصدار أي صوت.</li>
                        <li>ممنوع الإشارة لأشياء موجودة في المكان.</li>
                        <li>ممنوع رسم الحروف في الهواء.</li>
                    </ul>
                </li>
                <li style="margin-bottom: 1rem;"><strong>🏆 النقاط:</strong> 10 نقاط لو عرفتوا الكلمة في الدقيقة الأولى، و5 نقاط في الدقيقة التانية.</li>
            </ul>
        `
    },
    pictionary: {
        title: "قوانين ارسم وخمن 🎨",
        content: `
            <ul style="list-style-type: none; padding: 0;">
                <li style="margin-bottom: 1rem;"><strong>🎯 الهدف:</strong> رسم الكلمة المطلوبة على الشاشة ومحاولة جعل الآخرين يخمنونها.</li>
                <li style="margin-bottom: 1rem;"><strong>📜 القواعد:</strong>
                    <ul style="margin-top: 0.5rem;">
                        <li>ممنوع كتابة حروف أو أرقام.</li>
                        <li>استخدم الألوان وأحجام الفرشاة المختلفة لتسهيل الرسم.</li>
                    </ul>
                </li>
                <li style="margin-bottom: 1rem;"><strong>🏆 النقاط:</strong> يحصل الرسام والمخمن الصحيح على نقاط متساوية.</li>
            </ul>
        `
    },
    trivia: {
        title: "قوانين بنك المعلومات 💡",
        content: `
            <ul style="list-style-type: none; padding: 0;">
                <li style="margin-bottom: 1rem;"><strong>🎯 الهدف:</strong> الإجابة على الأسئلة الثقافية المتنوعة بأسرع وقت.</li>
                <li style="margin-bottom: 1rem;"><strong>📜 القواعد:</strong>
                    <ul style="margin-top: 0.5rem;">
                        <li>كل الأسئلة اختيار من متعدد.</li>
                        <li>أول واحد يجاوب صح بياخد النقاط والدور بيخلص.</li>
                    </ul>
                </li>
                <li style="margin-bottom: 1rem;"><strong>🏆 النقاط:</strong> 10 نقاط لكل إجابة صحيحة.</li>
            </ul>
        `
    }
};

const KeyboardShortcuts = {
    init() {
        document.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
                if (e.key === 'Escape') document.activeElement.blur();
                return;
            }

            switch(e.key.toLowerCase()) {
                case ' ':
                    const readyBtn = document.getElementById('readyButton');
                    if (readyBtn && readyBtn.style.display !== 'none') {
                        e.preventDefault();
                        readyBtn.click();
                    }
                    break;
                case 'enter':
                    const guessBtn = document.getElementById('guessButton');
                    if (guessBtn && guessBtn.style.display !== 'none') {
                        e.preventDefault();
                        guessBtn.click();
                    }
                    break;
                case 'escape':
                    const modals = document.querySelectorAll('.modal');
                    modals.forEach(m => m.style.display = 'none');
                    break;
                case 't':
                    Utils.toggleTheme();
                    break;
                case 'h':
                    const gameType = window.gameInstance ? window.gameInstance.gameType : 'charades';
                    Utils.showRules(gameType);
                    break;
                case 'p':
                    const pauseBtn = document.getElementById('pauseButton');
                    if (pauseBtn && pauseBtn.style.display !== 'none') pauseBtn.click();
                    break;
                case 'n':
                    const nextBtn = document.getElementById('nextButton');
                    if (nextBtn && nextBtn.style.display !== 'none') nextBtn.click();
                    break;
                case '?':
                    this.showHelp();
                    break;
            }
        });
    },

    showHelp() {
        const helpHtml = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; text-align: right; direction: rtl;">
                <div><kbd>Space</kbd> أنا جاهز</div>
                <div><kbd>Enter</kbd> عرفت الإجابة</div>
                <div><kbd>Esc</kbd> إغلاق النوافذ</div>
                <div><kbd>T</kbd> تغيير المظهر</div>
                <div><kbd>H</kbd> القوانين</div>
                <div><kbd>P</kbd> إيقاف (للمضيف)</div>
                <div><kbd>N</kbd> التالي (للمضيف)</div>
                <div><kbd>?</kbd> قائمة الاختصارات</div>
            </div>
        `;
        Utils.showGenericModal('اختصارات الكيبورد ⌨️', helpHtml);
    }
};

const Utils = {
    showRules(gameType) {
        const rules = GameRules[gameType];
        if (rules) {
            const titleEl = document.getElementById('rules-title');
            const contentEl = document.getElementById('rules-content');
            if (titleEl && contentEl) {
                titleEl.textContent = rules.title;
                contentEl.innerHTML = rules.content;
                document.getElementById('rules-modal').style.display = 'flex';
            }
        }
    },

    copyJoinLink() {
        const roomId = document.getElementById('room-id').textContent;
        const joinUrl = `${window.location.origin}/?join=${roomId}`;

        navigator.clipboard.writeText(joinUrl).then(() => {
            ToastManager.show("تم نسخ رابط الانضمام! 🔗", "success");
        }).catch(() => {
            const textArea = document.createElement("textarea");
            textArea.value = joinUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            ToastManager.show("تم نسخ رابط الانضمام! 🔗", "success");
        });
    },

    copyToClipboard(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const text = el.textContent.trim();
        navigator.clipboard.writeText(text).then(() => {
            Utils.showMessage("تم نسخ رقم الغرفة! 📋", "success");
        }).catch(err => {
            console.error('Failed to copy: ', err);
            // Fallback
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                Utils.showMessage("تم نسخ رقم الغرفة! 📋", "success");
            } catch (err) {
                console.error('Fallback copy failed', err);
            }
            document.body.removeChild(textArea);
        });
    },

    showGameModal(gameType, action) {
        Lobby.populateAvatarPickers();
        const modalId = action === 'create' ? 'create-game-modal' : 'join-game-modal';
        if (action === 'create') {
            document.getElementById('modal-game-type').value = gameType;
            document.getElementById('modal-title').textContent = gameType === 'charades' ? 'إنشاء غرفة بدون كلام' : 'إنشاء غرفة بنك المعلومات';
        }
        document.getElementById(modalId).style.display = 'flex';
    },

    hideModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
        if (modalId === 'create-game-modal') {
            document.getElementById('host-name').value = '';
            document.getElementById('room-info').style.display = 'none';
            document.getElementById('host-ready-btn-area').style.display = 'none';
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

    showGenericModal(title, content) {
        let modal = document.getElementById('generic-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'generic-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content animate-bounce-down">
                    <h2 id="generic-modal-title"></h2>
                    <div id="generic-modal-content" class="u-full-width"></div>
                    <div class="buttons u-full-width">
                        <button class="btn btn-primary u-full-width" onclick="Utils.hideModal('generic-modal')">حسناً</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        document.getElementById('generic-modal-title').textContent = title;
        document.getElementById('generic-modal-content').innerHTML = content;
        modal.style.display = 'flex';
    },

    showError(message) {
        ToastManager.show(message, 'error');
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

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        const icon = document.querySelector('.theme-toggle i');
        if (icon) {
            icon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    },

    toggleSound() {
        AudioManager.enabled = !AudioManager.enabled;
        localStorage.setItem('sound_enabled', AudioManager.enabled);

        const icon = document.querySelector('.sound-toggle i');
        if (icon) {
            icon.className = AudioManager.enabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
        }
        ToastManager.show(AudioManager.enabled ? "تم تشغيل الصوت 🔊" : "تم كتم الصوت 🔇", "info");
    },

    triggerConfetti(type = 'burst') {
        if (typeof confetti !== 'function') return;
        const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#6BCB77'];

        if (type === 'burst') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: colors
            });
        } else if (type === 'win') {
            const duration = 5 * 1000;
            const animationEnd = Date.now() + duration;
            const interval = setInterval(function() {
                const timeLeft = animationEnd - Date.now();
                if (timeLeft <= 0) return clearInterval(interval);
                const particleCount = 50 * (timeLeft / duration);
                confetti({
                    particleCount,
                    spread: 360,
                    startVelocity: 30,
                    origin: { x: Math.random(), y: Math.random() - 0.2 },
                    colors: colors
                });
            }, 250);
        } else if (type === 'gold') {
            confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 },
                colors: ['#FFE66D', '#D4AF37']
            });
        }
    },

    showMessage(message, type = 'info') {
        ToastManager.show(message, type);
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
        this.lastScores = {};
        this.lastReactionTime = 0;
        this.skipInterval = null;
        
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
            this.socket.emit('player_ready_status', { game_id: this.gameId });
            this.socket.emit('player_ready', { game_id: this.gameId });
        });
        bindClick('guessButton', () => this.socket.emit('guess_correct', { game_id: this.gameId, player_name: this.playerName }));
        bindClick('passButton', () => this.socket.emit('player_passed', { game_id: this.gameId, player_name: this.playerName }));
        bindClick('finishButton', () => {
            if (confirm('هل أنت متأكد أنك تريد إنهاء اللعبة وعرض النتائج النهائية؟')) {
                this.socket.emit('finish_game', { game_id: this.gameId });
            }
        });

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
            HapticManager.success();
            Utils.triggerConfetti('burst');
            Utils.showMessage(`${data.guesser} عرف الإجابة!`, 'success');
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
                HapticManager.success();
                Utils.triggerConfetti('burst');
                Utils.showMessage(`${data.player} جاوب صح ✅. الإجابة كانت: ${data.correct_answer}`, 'success');
            } else {
                AudioManager.play('timeout');
                HapticManager.error();
                Utils.showMessage(`${data.player} جاوب غلط ❌`, 'error');
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


        this.socket.on('game_ended', (data) => {
            this.showGameSummary(data);
        });

        this.socket.on('new_reaction', (data) => {
            this.showFloatingReaction(data.reaction);
        });

        this.socket.on('new_hint', (data) => {
            this.displayHint(data.hint);
        });

        this.socket.on('player_inactive', (data) => {
            ToastManager.show(`تم تخطي ${data.player} بسبب عدم الاستجابة`, 'warning');
            HapticManager.warning();
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
        if (data.players) this.updatePlayersList(data.players, data.ready_players);
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

    sendReaction(emoji) {
        const now = Date.now();
        if (now - this.lastReactionTime < 1500) return; // limit frequency
        this.lastReactionTime = now;

        if (this.socket) {
            this.socket.emit('player_reaction', {
                game_id: this.gameId,
                reaction: emoji
            });
        }
    }

    showFloatingReaction(emoji) {
        const floating = document.createElement('div');
        floating.className = 'floating-reaction';
        floating.textContent = emoji;

        const x = 20 + Math.random() * 60;
        floating.style.left = x + '%';
        floating.style.bottom = '15%';

        document.body.appendChild(floating);
        setTimeout(() => floating.remove(), 2000);
    }

    startSkipTimer() {
        if (this.skipInterval) clearInterval(this.skipInterval);
        const el = document.getElementById('skip-countdown');
        const valEl = document.getElementById('skip-timer-val');

        const currentPlayer = document.getElementById('current-turn').textContent;
        if (this.gameType === 'trivia' || this.gameStatus !== 'playing' || currentPlayer !== this.playerName) {
            if (el) el.classList.add('u-hidden');
            return;
        }

        let timeLeft = 30;
        if (el) el.classList.remove('u-hidden');
        if (valEl) valEl.textContent = timeLeft;

        this.skipInterval = setInterval(() => {
            timeLeft--;
            if (valEl) valEl.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(this.skipInterval);
                if (el) el.classList.add('u-hidden');
            }
        }, 1000);
    }

    displayHint(hintText) {
        const container = document.getElementById('hints-container');
        if (!container) return;

        const hint = document.createElement('div');
        hint.className = 'badge badge-team-1 animate__animated animate__bounceIn';
        hint.style.fontSize = '1.1rem';
        hint.style.padding = '0.8rem 1.2rem';
        hint.innerHTML = `<i class="fas fa-lightbulb"></i> ${hintText}`;

        container.appendChild(hint);
        AudioManager.play('guessed');
        HapticManager.success();
    }

    setGameStatus(status) {
        if (this.gameStatus !== status) {
            this.gameStatus = status;

            if (this.skipInterval) clearInterval(this.skipInterval);
            const skipEl = document.getElementById('skip-countdown');
            if (skipEl) skipEl.classList.add('u-hidden');

            const hintsContainer = document.getElementById('hints-container');
            if (hintsContainer) hintsContainer.innerHTML = '';
            
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
            pass: document.getElementById('passButton'),
            pause: document.getElementById('pauseButton'),
            resume: document.getElementById('resumeButton'),
            finish: document.getElementById('finishButton')
        };

        const waitingArea = document.getElementById('waiting-area');

        Object.values(btns).forEach(b => { if(b) b.style.display = 'none'; });

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
                if (this.isHost) {
                    btns.finish.style.display = 'block';
                }
                break;
        }
    }

    showGameSummary(data) {
        const modal = document.getElementById('summary-modal');
        const winnerNameEl = document.getElementById('winner-name');
        const leaderboardEl = document.getElementById('final-leaderboard');
        const statsEl = document.getElementById('game-stats');

        if (!modal) return;

        // Confetti
        Utils.triggerConfetti('win');

        // Winner
        const sortedScores = Object.entries(data.scores).sort((a, b) => b[1] - a[1]);
        if (sortedScores.length > 0) {
            winnerNameEl.textContent = `بطل اللعبة: ${sortedScores[0][0]}! 🏆`;
        } else {
            winnerNameEl.textContent = 'انتهت اللعبة!';
        }

        // Leaderboard
        leaderboardEl.innerHTML = sortedScores.map(([name, score], i) => `
            <div class="player-item animate__animated animate__fadeInUp" style="animation-delay: ${i * 0.1}s; justify-content: space-between;">
                <span>${i + 1}. ${name} ${i === 0 ? '👑' : ''}</span>
                <span class="score-val">${score} نقطة</span>
            </div>
        `).join('');

        // Highlights
        if (data.highlights && data.highlights.length > 0) {
            statsEl.innerHTML = data.highlights.map(h => `
                <div class="card" style="padding: 1rem; text-align: center; border-radius: 20px;">
                    <h4 style="margin: 0; color: var(--secondary); font-size: 1rem;">${h.title}</h4>
                    <div style="font-weight: 800; font-size: 1.1rem; margin-block: 0.3rem;">${h.player}</div>
                    <div style="font-size: 0.75rem; color: var(--text-light);">${h.desc}</div>
                </div>
            `).join('');
        } else {
            statsEl.innerHTML = '';
        }

        modal.style.display = 'flex';
    }

    async shareResults() {
        const modalContent = document.querySelector('#summary-modal .modal-content');
        if (!modalContent || typeof html2canvas !== 'function') return;

        ToastManager.show('جاري تحضير الصورة...', 'info');

        try {
            const buttons = modalContent.querySelector('.buttons');
            if (buttons) buttons.style.visibility = 'hidden';

            const canvas = await html2canvas(modalContent, {
                backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-main').trim() || '#F7FFF7',
                scale: 2,
                logging: false,
                useCORS: true
            });

            if (buttons) buttons.style.visibility = 'visible';

            canvas.toBlob(async (blob) => {
                const file = new File([blob], 'game-results.png', { type: 'image/png' });

                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'نتائج ألعاب العيلة 🏆',
                            text: 'شوفوا النتيجة اللي حققتها في ألعاب العيلة!'
                        });
                    } catch (err) {
                        if (err.name !== 'AbortError') this.downloadImage(canvas);
                    }
                } else {
                    this.downloadImage(canvas);
                }
            });
        } catch (err) {
            console.error('Error generating image:', err);
            ToastManager.show('عذراً، فشل توليد الصورة', 'error');
        }
    }

    downloadImage(canvas) {
        const link = document.createElement('a');
        link.download = 'family-games-results.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        ToastManager.show('تم تحميل الصورة بنجاح! 🖼️', 'success');
    }

    updateCurrentPlayer(player) {
        if (this.gameStatus === 'playing') {
            this.startSkipTimer();
        }
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
                itemDisplay.style.display = 'block';
                // Don't add .visible here if we're about to call displayQuestion/displayItem
            } else if (this.gameType === 'pictionary' && !isMe && this.currentItemCategory) {
                // Show category hint for non-drawing players in easy/medium difficulty
                const difficulty = this.gameSettings.difficulty || 'medium';
                if (difficulty === 'easy' || difficulty === 'medium') {
                    itemDisplay.style.display = 'block';
                    itemDisplay.innerHTML = `<div class="item-category" style="font-size: 1.8rem;">${this.currentItemCategory}</div>`;
                    itemDisplay.classList.add('visible');
                } else {
                    itemDisplay.style.display = 'none';
                    itemDisplay.classList.remove('visible');
                    console.log('Hard difficulty - no category hint');
                }
            } else {
                itemDisplay.style.display = 'none';
                itemDisplay.classList.remove('visible');
            }
        }

        if (pictionaryArea) {
            if (this.gameType === 'pictionary' && this.gameStatus === 'round_active') {
                pictionaryArea.style.display = 'block';
                this.initCanvas();
                // Show controls only to the drawer
                document.querySelector('.canvas-controls').style.display = isMe ? 'flex' : 'none';
            } else {
                pictionaryArea.style.display = 'none';
            }
        }

        this.updateButtonVisibility();
    }

    displayItem(category, itemData) {
        const el = document.getElementById('item-display');
        if (el) {
            el.style.display = 'block';
            const item = typeof itemData === 'object' ? itemData.item : itemData;
            const year = itemData.year ? `<div class="item-meta">سنة الإنتاج: ${itemData.year}</div>` : '';
            const starring = itemData.starring ? `<div class="item-meta">بطولة: ${itemData.starring}</div>` : '';
            const type = itemData.type ? `<span class="badge badge-team-2">${itemData.type}</span>` : '';

            const categoryIcons = {
                'أفلام': '🎬', 'مسلسلات': '📺', 'مسرحيات': '🎭', 'أغاني': '🎵',
                'أمثال': '🗣️', 'أماكن': '📍', 'أشخاص': '👤', 'أشياء': '📦',
                'أكل': '🍔', 'حيوانات': '🐶'
            };
            const icon = categoryIcons[category] || '🎮';

            const difficulty = itemData.difficulty || 'medium';
            const diffLabels = {'easy': 'سهل', 'medium': 'متوسط', 'hard': 'صعب'};
            const diffBadge = `<span class="diff-badge diff-${difficulty}">${diffLabels[difficulty] || 'متوسط'}</span>`;

            el.innerHTML = `
                <div class="item-category">${icon} ${category} ${type} ${diffBadge}</div>
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
            el.classList.remove('u-hidden', 'is-flipped');
            el.style.display = 'block';
            let html = `<div class="item-category">${data.category}</div>`;
            html += `<div class="item-name" style="font-size: 1.8rem;">${data.question}</div>`;
            
            html += `<div class="options-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; width: 100%; margin-top: 1.5rem;">`;
            data.options.forEach((opt, i) => {
                html += `<button class="btn btn-outline" onclick="window.gameInstance.submitAnswer(${i})">${opt}</button>`;
            });
            html += `</div>`;
            
            el.innerHTML = html;
            // Force reflow and add visible class
            void el.offsetWidth;
            el.classList.add('visible');
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

    updatePlayersList(players, readyPlayers = []) {
        console.log("GameEngine updating players with avatars:", players);
        const listEl = document.getElementById('players-list');
        if (!listEl) return;
        
        listEl.innerHTML = '';
        const ul = document.createElement('ul');
        ul.classList.add('players-ul');
        
        players.forEach(p => {
            const name = typeof p === 'object' ? p.name : p;
            const avatar = typeof p === 'object' ? (p.avatar || '🐶') : '🐶';
            const isHost = typeof p === 'object' ? p.isHost : false;
            const team = typeof p === 'object' ? p.team : null;
            const isReady = readyPlayers.includes(name);

            const li = document.createElement('li');
            li.className = `player-item ${name === this.playerName ? 'current-player' : ''}`;

            let html = `<span class="player-avatar">${avatar}</span><span>${name} ${isHost ? '👑' : ''} ${name === this.playerName ? '(أنت)' : ''}</span>`;
            if (team) {
                html += `<span class="badge badge-team-${team}">فريق ${team}</span>`;
            }

            const statusSpan = document.createElement('span');
            statusSpan.className = `ready-status ${isReady ? 'ready' : 'waiting'}`;
            statusSpan.innerHTML = isReady ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-hourglass-start"></i>';

            li.innerHTML = html;
            li.appendChild(statusSpan);
            ul.appendChild(li);
        });
        listEl.appendChild(ul);
    }

    animateScoreChange(player, diff) {
        const playerItems = document.querySelectorAll('.score-item');
        playerItems.forEach(item => {
            const nameSpan = item.querySelector('span');
            if (nameSpan && nameSpan.textContent.trim() === player) {
                // Pulse
                item.classList.add('pulse-highlight');
                setTimeout(() => item.classList.remove('pulse-highlight'), 1000);

                // Floating +X
                const floating = document.createElement('div');
                floating.className = 'floating-score';
                floating.textContent = `+${diff}`;
                item.appendChild(floating);
                setTimeout(() => floating.remove(), 1500);
            }
        });
    }

    updateScores(data) {
        const el = document.getElementById('scores');
        if (!el) return;
        
        const currentScores = data.scores || {};

        // Detect changes for animation
        Object.entries(currentScores).forEach(([player, score]) => {
            const oldScore = this.lastScores[player] || 0;
            if (score > oldScore) {
                const diff = score - oldScore;
                this.animateScoreChange(player, diff);
            }
        });
        this.lastScores = { ...currentScores };

        let html = '';
        
        // Show team scores with progress bars
        if (data.team_scores && (data.team_scores['1'] > 0 || data.team_scores['2'] > 0)) {
            const s1 = data.team_scores['1'] || 0;
            const s2 = data.team_scores['2'] || 0;
            const max = Math.max(s1 + s2, 1);
            const p1 = (s1 / max) * 100;
            const p2 = (s2 / max) * 100;

            html += '<div class="team-scores-container">';
            html += `
                <div class="team-score-row u-margin-bottom">
                    <div style="display:flex; justify-content:space-between; font-weight:800;"><span>فريق 1</span><span>${s1}</span></div>
                    <div class="team-progress-wrapper"><div class="team-progress-bar bg-team-1" style="width:${p1}%"></div></div>
                </div>
                <div class="team-score-row">
                    <div style="display:flex; justify-content:space-between; font-weight:800;"><span>فريق 2</span><span>${s2}</span></div>
                    <div class="team-progress-wrapper"><div class="team-progress-bar bg-team-2" style="width:${p2}%"></div></div>
                </div>
            `;
            html += '</div>';
        }
        
        // Show individual scores with medals
        const medals = ['🥇', '🥈', '🥉'];
        html += Object.entries(currentScores)
            .sort((a, b) => b[1] - a[1])
            .map(([p, s], i) => {
                const medal = medals[i] || '';
                return `
                    <div class="score-item ${p === this.playerName ? 'current-player' : ''}">
                        <span>${medal} ${p}</span>
                        <span class="score-val">${s}</span>
                    </div>
                `;
            })
            .join('');

        el.innerHTML = html;
    }

    startTimer(duration) {
        this.stopTimer();
        const timerEl = document.getElementById('timer');
        const timerText = document.getElementById('timer-val');
        const progressCircle = document.getElementById('timer-progress');
        if (!timerEl || !timerText || !progressCircle) return;
        
        this.setGameStatus('round_active');
        let timeLeft = duration;
        const totalTime = duration;
        timerEl.style.display = 'flex';
        timerEl.className = 'timer-container';

        const format = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;
        timerText.textContent = format(timeLeft);

        const updateCircle = (left) => {
            const offset = 283 - (left / totalTime) * 283;
            progressCircle.style.strokeDashoffset = offset;

            const pct = (left / totalTime) * 100;
            timerEl.classList.remove('warning', 'orange', 'danger');
            if (pct <= 15) timerEl.classList.add('danger');
            else if (pct <= 30) timerEl.classList.add('orange');
            else if (pct <= 50) timerEl.classList.add('warning');
        };

        updateCircle(timeLeft);

        this.timerInterval = setInterval(() => {
            timeLeft--;
            timerText.textContent = format(timeLeft);
            updateCircle(timeLeft);

            if (timeLeft <= 5 && timeLeft > 0) {
                AudioManager.play('timeout');
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
        const txt = document.getElementById('timer-val');
        const progressCircle = document.getElementById('timer-progress');
        if (el && txt) {
            txt.textContent = '0:00';
            el.style.display = 'none';
            if (progressCircle) progressCircle.style.strokeDashoffset = '0';
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
            msg.className = 'reveal-message card';
            document.body.appendChild(msg);
        }

        const year = data.year ? `<div class="item-meta">سنة الإنتاج: ${data.year}</div>` : '';
        const starring = data.starring ? `<div class="item-meta">بطولة: ${data.starring}</div>` : '';

        msg.innerHTML = `
            <div class="flip-inner" style="width:100%; height:100%;">
                <div class="flip-front">
                    <h3>انتهى الدور!</h3>
                    <i class="fas fa-question-circle fa-5x" style="color: var(--secondary); margin-top: 1rem;"></i>
                </div>
                <div class="flip-back reveal-content">
                    <div class="item-name" style="font-size: 2rem; color: var(--primary); margin-block: 1rem;">${data.item}</div>
                    <div class="badge badge-team-2" style="margin-bottom: 1rem;">${data.category}</div>
                    ${year}
                    ${starring}
                </div>
            </div>
        `;
        msg.style.display = 'flex';

        const inner = msg.querySelector('.flip-inner');
        setTimeout(() => inner.classList.add('flipped'), 1000);

        setTimeout(() => {
            msg.style.display = 'none';
            if (inner) inner.classList.remove('flipped');
        }, 6000);
    }
}

// --- Initialization ---

const MobileUtils = {
    init() {
        this.initSwipeGestures();
    },

    initSwipeGestures() {
        let touchstartX = 0;
        let touchstartY = 0;
        let touchendX = 0;
        let touchendY = 0;

        document.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
            touchstartY = e.changedTouches[0].screenY;
        }, {passive: true});

        document.addEventListener('touchend', e => {
            touchendX = e.changedTouches[0].screenX;
            touchendY = e.changedTouches[0].screenY;

            const dx = touchendX - touchstartX;
            const dy = touchendY - touchstartY;

            // Ignore if drawing on canvas
            if (e.target.id === 'game-canvas') return;
            // Ignore small movements
            if (Math.abs(dx) < 100 && Math.abs(dy) < 100) return;

            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 100) { // Swipe Right
                    const nextBtn = document.getElementById('nextButton');
                    if (nextBtn && nextBtn.style.display !== 'none') nextBtn.click();
                } else if (dx < -100) { // Swipe Left
                    const passBtn = document.getElementById('passButton');
                    if (passBtn && passBtn.style.display !== 'none') passBtn.click();
                }
            } else {
                if (dy > 100) { // Swipe Down
                    const modals = document.querySelectorAll('.modal');
                    modals.forEach(m => m.style.display = 'none');
                }
            }
        }, {passive: true});
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AudioManager.init();
    MobileUtils.init();

    // Sound settings
    const soundPref = localStorage.getItem('sound_enabled');
    if (soundPref !== null) {
        AudioManager.enabled = (soundPref === 'true');
        const sIcon = document.querySelector('.sound-toggle i');
        if (sIcon) sIcon.className = AudioManager.enabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
    }
    KeyboardShortcuts.init();

    // Handle join link
    const urlParams = new URLSearchParams(window.location.search);
    const joinRoom = urlParams.get('join');
    if (joinRoom) {
        setTimeout(() => {
            Utils.showGameModal('charades', 'join');
            const roomInput = document.getElementById('room-code');
            if (roomInput) roomInput.value = joinRoom;
        }, 500);
    }

    // Sync theme toggle icon
    const savedTheme = localStorage.getItem('theme') || 'light';
    const icon = document.querySelector('.theme-toggle i');
    if (icon) {
        icon.className = savedTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }

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
