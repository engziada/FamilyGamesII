// Modal Functions
function showGameModal(gameType, action) {
    const modalId = action === 'create' ? 'create-game-modal' : 'join-game-modal';
    document.getElementById(modalId).style.display = 'flex';
}

function hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    // Reset form fields
    if (modalId === 'create-game-modal') {
        document.getElementById('host-name').value = '';
        document.getElementById('room-info').style.display = 'none';
        document.getElementById('host-players-list').innerHTML = '';
        // Reset buttons
        const buttonsDiv = document.querySelector('#create-game-modal .buttons');
        buttonsDiv.innerHTML = `
            <button class="btn" onclick="createGame()">مضة جديدة</button>
            <button class="btn btn-secondary" onclick="hideModal('create-game-modal')">إلغاء</button>
        `;
    } else if (modalId === 'join-game-modal') {
        document.getElementById('player-name').value = '';
        document.getElementById('room-code').value = '';
        document.getElementById('join-form').style.display = 'block';
        document.getElementById('join-lobby').style.display = 'none';
        document.getElementById('join-players-list').innerHTML = '';
    }
}

// Game Creation and Joining Functions
function createGame() {
    const hostName = document.getElementById('host-name').value.trim();
    if (!hostName) {
        alert('من فضلك اكتب اسمك');
        return;
    }

    // Generate a random 4-digit room ID
    const gameId = Math.floor(1000 + Math.random() * 9000);
    
    // Initialize socket if not already initialized
    if (!window.socket) {
        window.socket = io();
        setupLobbySocketListeners();
    }

    // Emit create game event
    window.socket.emit('create_game', {
        game_id: gameId,
        player_name: hostName,
        game_type: 'charades'
    });

    // Show room info
    document.getElementById('room-id').textContent = gameId;
    document.getElementById('room-info').style.display = 'block';
    document.querySelector('.players-list').style.display = 'block';

    // Replace create button with start game button
    const buttonsDiv = document.querySelector('#create-game-modal .buttons');
    buttonsDiv.innerHTML = `
        <button class="btn" onclick="startGame()">يالا نبدأ</button>
        <button class="btn btn-secondary" onclick="hideModal('create-game-modal')">إلغاء</button>
    `;
}

function startGame() {
    const gameId = document.getElementById('room-id').textContent;
    const hostName = document.getElementById('host-name').value;
    
    if (window.socket) {
        // Disable the start button to prevent multiple clicks
        const startButton = document.querySelector('#create-game-modal .buttons button');
        if (startButton) {
            startButton.disabled = true;
            startButton.textContent = 'جاري بدء اللعبة...';
        }
        window.socket.emit('start_game', { game_id: gameId });
    }
}

function joinGame() {
    const playerName = document.getElementById('player-name').value.trim();
    const roomCode = document.getElementById('room-code').value.trim();

    if (!playerName || !roomCode) {
        alert('من فضلك اكتب اسمك ورقم الأوضة');
        return;
    }

    console.log('Joining game with roomCode:', roomCode);
    console.log('Player name:', playerName);

    // Initialize socket if not already initialized
    if (!window.socket) {
        window.socket = io();
        setupLobbySocketListeners();
    }

    // Emit join game event
    window.socket.emit('join_game', {
        game_id: roomCode,
        player_name: playerName,
        game_type: 'charades'
    });
}

function setupLobbySocketListeners() {
    window.socket.on('game_created', (data) => {
        console.log('Game created:', data);
        updateLobbyPlayerList(data.players);
    });

    window.socket.on('join_success', (data) => {
        console.log('Join success:', data);
        document.getElementById('join-form').style.display = 'none';
        document.getElementById('join-lobby').style.display = 'block';
        document.getElementById('join-room-id').textContent = document.getElementById('room-code').value;
        updateLobbyPlayerList(data.players, data.host);
    });

    window.socket.on('player_joined', (data) => {
        console.log('Player joined:', data);
        updateLobbyPlayerList(data.players);
    });

    window.socket.on('game_started', (data) => {
        console.log('Game started:', data);
        const playerName = document.getElementById('player-name')?.value || document.getElementById('host-name')?.value;
        
        // Store game data in sessionStorage before redirecting
        sessionStorage.setItem('gameData', JSON.stringify({
            gameId: data.game_id,
            playerName: playerName,
            transferId: data.transfer_id
        }));
        
        // Redirect to game page with necessary parameters
        window.location.href = `${data.redirect_url}?transfer_id=${data.transfer_id}&player_name=${encodeURIComponent(playerName)}`;
    });

    window.socket.on('error', (data) => {
        console.error('Game error:', data);
        showError(data.message);
    });
}

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

function updateLobbyPlayerList(players, host) {
    const hostList = document.getElementById('host-players-list');
    const joinList = document.getElementById('join-players-list');
    const lists = [hostList, joinList].filter(list => list); // Get only existing lists

    lists.forEach(list => {
        if (!list) return;
        list.innerHTML = '';
        players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.name || player;
            if ((player.isHost || player === host) && host) {
                li.classList.add('host');
            }
            list.appendChild(li);
        });
    });
}

function leaveGame() {
    if (window.socket) {
        window.socket.disconnect();
    }
    hideModal('join-game-modal');
    window.location.href = '/';
}

// Single DOMContentLoaded event listener for the entire application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    
    // Check if we're on the game page or lobby page
    const isGamePage = window.location.pathname.includes('/game/');
    
    if (isGamePage) {
        // Get game parameters from both URL and sessionStorage
        const gameData = JSON.parse(sessionStorage.getItem('gameData') || '{}');
        const urlParams = new URLSearchParams(window.location.search);
        const pathParts = window.location.pathname.split('/');
        
        // Use URL parameters first, fall back to sessionStorage
        const gameId = pathParts[pathParts.length - 1] || gameData.gameId;
        const playerName = urlParams.get('player_name') || gameData.playerName;
        const transferId = urlParams.get('transfer_id') || gameData.transferId;
        const isHost = urlParams.get('is_host') === 'true';
        
        // Validate required parameters
        if (!gameId || !playerName || !transferId) {
            showError('معلومات اللعبة غير مكتملة. يرجى العودة للصفحة الرئيسية وإعادة المحاولة.');
            console.error('Missing game parameters:', { gameId, playerName, transferId });
            return;
        }

        // Initialize game instance
        try {
            window.game = new CharadesGame(gameId, playerName, transferId, isHost);
            console.log('Game initialized with parameters:', { gameId, playerName, transferId, isHost });
        } catch (error) {
            showError('حدث خطأ أثناء تهيئة اللعبة. يرجى تحديث الصفحة أو العودة للصفحة الرئيسية.');
            console.error('Game initialization error:', error);
        }
    }
});

class CharadesGame {
    constructor(gameId, playerName, transferId, isHost) {
        // Validate parameters
        if (!gameId || !playerName || !transferId) {
            throw new Error('Missing required game parameters');
        }
        
        // Store game parameters
        this.gameId = gameId;
        this.playerName = playerName;
        this.transferId = transferId;
        this.isHost = isHost;
        this.socket = null;
        this.currentItem = null;
        this.gameStatus = 'waiting';
        this.timerInterval = null;
        
        // Initialize audio elements
        this.backgroundMusic = new Audio('/static/sounds/background.mp3');
        this.backgroundMusic.loop = true;
        this.backgroundMusic.volume = 0.3; // Low volume
        
        this.guessedSound = new Audio('/static/sounds/guessed.mp3');
        this.timeoutSound = new Audio('/static/sounds/timeout.mp3');
        
        // Initialize socket connection
        this.initializeSocket();
        
        // Set up UI event listeners
        this.setupUIEventListeners();
        
        // Add CSS for reveal message
        const style = document.createElement('style');
        style.textContent = `
            .reveal-message {
                display: none;
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 40px;
                border-radius: 20px;
                z-index: 1000;
                text-align: center;
                animation: fadeIn 0.5s ease-in;
                min-width: 400px;
                min-height: 300px;
            }
            
            .reveal-content {
                padding: 40px;
            }
            
            .reveal-message h3 {
                margin: 0 0 30px 0;
                color: #ffd700;
                font-size: 2.4em;
            }
            
            .reveal-message p {
                font-size: 1.6em;
                margin: 15px 0;
            }
            
            .reveal-message strong {
                color: #ffd700;
                font-size: 1.4em;
                display: inline-block;
                margin: 10px 0;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    initializeSocket() {
        try {
            this.socket = io();
            this.setupSocketListeners();
            
            // Verify game session after socket connection
            this.socket.on('connect', () => {
                console.log('Socket connected successfully');
                
                // Verify game session
                this.socket.emit('verify_game', {
                    game_id: this.gameId,
                    player_name: this.playerName,
                    transfer_id: this.transferId
                });
            });

            // Handle connection errors
            this.socket.on('connect_error', (error) => {
                console.error('Socket connection error:', error);
                showError('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.');
            });
        } catch (error) {
            console.error('Socket initialization error:', error);
            showError('حدث خطأ في الاتصال. يرجى تحديث الصفحة.');
        }
    }

    setupSocketListeners() {
        if (!this.socket) return;

        this.socket.on('game_state', (data) => {
            this.updateGameState(data);
        });

        this.socket.on('correct_guess', (data) => {
            console.log('Correct guess:', data);
            this.guessedSound.play().catch(err => console.log('Error playing guessed sound:', err));
            // Any other correct guess handling...
        });

        this.socket.on('timer_start', (data) => {
            console.log('Timer started:', data);
            this.startTimer(data.duration);
        });

        this.socket.on('error', (data) => {
            console.error('Game error:', data);
            this.showError(data.message);
        });

        // Handle new items
        this.socket.on('new_item', (data) => {
            console.log('Received new item:', data);
            if (data && data.item && data.category) {
                this.displayItem(data.category, data);
            }
        });

        // Add timer start listener
        this.socket.on('timer_start', (data) => {
            console.log('Timer started:', data);
            this.startTimer(data.duration);
        });

        // Add game state listener
        this.socket.on('game_state', (data) => {
            console.log('Game state update:', data);
            this.updateGameState(data);
        });

        // Add error listener
        this.socket.on('game_error', (data) => {
            console.error('Game error:', data);
            this.showError(data.message);
        });

        // Add reveal item listener
        this.socket.on('reveal_item', (data) => {
            console.log('Item revealed:', data);
            
            // Create or get the reveal message element
            let revealMsg = document.getElementById('reveal-message');
            if (!revealMsg) {
                revealMsg = document.createElement('div');
                revealMsg.id = 'reveal-message';
                revealMsg.className = 'reveal-message';
                document.body.appendChild(revealMsg);
            }
            
            // Show the revealed item
            revealMsg.innerHTML = `
                <div class="reveal-content">
                    <h3>انتهى الدور!</h3>
                    <p>الكلمة كانت:</p>
                    <p><strong>${data.item}</strong></p>
                    <p>التصنيف: ${data.category}</p>
                    <p>كان دور: ${data.player}</p>
                </div>
            `;
            revealMsg.style.display = 'block';
            
            // Hide after 10 seconds
            setTimeout(() => {
                revealMsg.style.display = 'none';
            }, 10000);
        });
    }

    setupUIEventListeners() {
        // Start game button
        const startButton = document.getElementById('start-game');
        if (startButton && this.isHost) {
            startButton.addEventListener('click', () => {
                console.log('Starting game...');
                // Try to start background music on host's first interaction
                if (this.backgroundMusic && !this.backgroundMusic.playing) {
                    this.backgroundMusic.play().catch(err => console.log('Error playing background music:', err));
                }
                this.socket.emit('start_game', {
                    game_id: this.gameId
                });
            });
        }
        
        // Ready button
        const readyButton = document.getElementById('readyButton');
        if (readyButton) {
            readyButton.addEventListener('click', () => {
                console.log('Player ready, starting turn...');
                // Try to start background music on player's first interaction
                if (this.backgroundMusic && !this.backgroundMusic.playing) {
                    this.backgroundMusic.play().catch(err => console.log('Error playing background music:', err));
                }
                this.socket.emit('player_ready', {
                    game_id: this.gameId
                });
                readyButton.style.display = 'none';
            });
        }
        
        // Next item button
        const nextButton = document.getElementById('next-item');
        if (nextButton && this.isHost) {
            nextButton.addEventListener('click', () => {
                console.log('Requesting next item...');
                this.socket.emit('request_item', {
                    game_id: this.gameId
                });
            });
        }
        
        // Guess form
        const guessForm = document.getElementById('guess-form');
        if (guessForm && !this.isHost) {
            guessForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const guessInput = document.getElementById('guess-input');
                if (guessInput && guessInput.value.trim()) {
                    console.log('Submitting guess:', guessInput.value);
                    this.socket.emit('submit_guess', {
                        game_id: this.gameId,
                        player_name: this.playerName,
                        guess: guessInput.value.trim()
                    });
                    guessInput.value = '';
                }
            });
        }
    }

    updateGameState(data) {
        if (!data) return;
        
        try {
            // Update game status
            if (data.status) {
                this.gameStatus = data.status;
                this.updateStatus(data.message || '');
            }

            // Update players
            if (data.players) {
                this.updatePlayersList(data.players);
            }

            // Update current player
            if (data.current_player) {
                this.updateCurrentPlayer(data.current_player);
            }

            // Update scores
            if (data.scores) {
                this.updateScores(data.scores);
            }

            // Update current item if host
            if (this.isHost && data.current_item) {
                this.displayItem(data.current_item.category, data.current_item);
            }
        } catch (error) {
            console.error('Error updating game state:', error);
            showError('حدث خطأ في تحديث حالة اللعبة');
        }
    }

    startTimer(duration) {
        // Clear any existing timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        const timerDisplay = document.getElementById('timer');
        if (!timerDisplay) return;
        
        let timeLeft = duration;
        
        const formatTime = (seconds) => {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        };
        
        // Update timer immediately
        timerDisplay.textContent = formatTime(timeLeft);
        timerDisplay.style.display = 'block';
        
        // Start interval
        this.timerInterval = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = formatTime(timeLeft);
            
            if (timeLeft <= 0) {
                clearInterval(this.timerInterval);
                
                // Play timeout sound twice
                const playTimeoutTwice = async () => {
                    try {
                        await this.timeoutSound.play();
                        this.timeoutSound.currentTime = 0; // Reset to start
                        setTimeout(async () => {
                            try {
                                await this.timeoutSound.play();
                            } catch (err) {
                                console.log('Error playing second timeout sound:', err);
                            }
                        }, 1000); // Play second sound after 1 second
                    } catch (err) {
                        console.log('Error playing first timeout sound:', err);
                    }
                };
                
                playTimeoutTwice();
                
                this.socket.emit('round_timeout', {
                    game_id: this.gameId
                });
            }
        }, 1000);
    }

    updateStatus(message) {
        const statusElement = document.getElementById('game-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    updatePlayersList(players) {
        const playersListElement = document.getElementById('players-list');
        const currentPlayerName = document.getElementById('player-name').value;
        
        if (playersListElement && Array.isArray(players)) {
            playersListElement.innerHTML = players
                .map(player => {
                    const isCurrentPlayer = player === currentPlayerName;
                    return `<div class="player-item ${isCurrentPlayer ? 'current-player' : ''}">${player}${isCurrentPlayer ? ' (أنت)' : ''}</div>`;
                })
                .join('');
        }
    }

    updateCurrentPlayer(player) {
        const currentTurn = document.getElementById('current-turn');
        const readyButton = document.getElementById('readyButton');
        const itemDisplay = document.getElementById('item-display');
        
        if (currentTurn) {
            currentTurn.textContent = player;
        }

        // Show/hide ready button based on if it's our turn
        if (readyButton) {
            readyButton.style.display = player === this.playerName ? 'block' : 'none';
        }

        // Show/hide item display based on if it's our turn
        if (itemDisplay) {
            if (player === this.playerName) {
                itemDisplay.style.display = 'block';
                itemDisplay.classList.add('visible');
            } else {
                itemDisplay.style.display = 'none';
                itemDisplay.classList.remove('visible');
            }
        }
    }

    updateScores(scores) {
        const scoresElement = document.getElementById('scores');
        const currentPlayerName = document.getElementById('player-name').value;
        
        if (scoresElement && typeof scores === 'object') {
            scoresElement.innerHTML = Object.entries(scores)
                .map(([player, score]) => {
                    const isCurrentPlayer = player === currentPlayerName;
                    return `<div class="score-item ${isCurrentPlayer ? 'current-player' : ''}">${score}</div>`;
                })
                .join('');
        }
    }

    displayItem(category, itemData) {
        const itemDisplay = document.getElementById('item-display');
        if (itemDisplay) {
            itemDisplay.style.display = 'block';
            // Extract item text from itemData
            const itemText = typeof itemData === 'object' ? itemData.item : itemData;
            itemDisplay.innerHTML = `
                <div class="category">${category || ''}</div>
                <div class="item">${itemText || ''}</div>
            `;
        }
    }

    hideItemDisplay() {
        const itemDisplay = document.getElementById('item-display');
        const readyButton = document.getElementById('readyButton');
        const guessButton = document.getElementById('guessButton');
        
        if (itemDisplay) {
            itemDisplay.classList.remove('visible');
            setTimeout(() => {
                itemDisplay.style.display = 'none';
                itemDisplay.innerHTML = '';
            }, 300);
        }
        
        if (readyButton) {
            readyButton.style.display = 'none';
        }
        
        if (guessButton) {
            guessButton.style.display = 'none';
        }
    }
    
    showError(message) {
        const errorDiv = document.getElementById('error-message');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 5000);
        }
    }
    
    cleanup() {
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic.currentTime = 0;
        }
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }
}

// Lobby Class
class CharadesLobby {
    constructor() {
        this.socket = io();
        this.gameState = {
            players: [],
            host: ''
        };
        this.initialize();
    }

    initialize() {
        // Get initial state from DOM
        const playersElement = document.getElementById('initial-players');
        const hostElement = document.getElementById('host');
        
        if (playersElement && hostElement) {
            this.gameState.players = JSON.parse(playersElement.value);
            this.gameState.host = hostElement.value;
            this.updatePlayerList();
        }

        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Establishing secure connection...');
            this.socket.emit('verify_game', {
                game_id: document.getElementById('game-id').value,
                player_name: document.getElementById('player-name').value
            });
        });

        this.socket.on('game_state', (data) => {
            console.log('Received game state:', data);
            this.gameState = data;
            this.updatePlayerList();
        });

        this.socket.on('game_started', (data) => {
            const playerName = document.getElementById('player-name')?.value || '';
            // Construct the URL with query parameters
            const redirectUrl = `${data.redirect_url}?transfer_id=${data.transfer_id}&player_name=${playerName}`;
            // Redirect to the game page
            window.location.href = redirectUrl;
        });
    }

    updatePlayerList() {
        const playersList = document.getElementById('players');
        if (!playersList) return;

        const currentPlayerName = document.getElementById('player-name').value;
        
        playersList.innerHTML = this.gameState.players
            .map(player => `
                <li class="player-item">
                    ${player}
                    ${player === this.gameState.host ? '👑' : ''}
                    ${player === currentPlayerName ? '(أنت)' : ''}
                </li>
            `)
            .join('');
    }

    startGame() {
        this.socket.emit('start_game', {
            game_id: document.getElementById('game-id').value
        });
    }
}

// Helper Functions
function updateGameStatus(message) {
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function updatePlayersList(players) {
    const playersListElement = document.getElementById('players-list');
    const currentPlayerName = document.getElementById('player-name').value;
    
    if (playersListElement && Array.isArray(players)) {
        playersListElement.innerHTML = players
            .map(player => {
                const isCurrentPlayer = player === currentPlayerName;
                return `<div class="player-item ${isCurrentPlayer ? 'current-player' : ''}">${player}${isCurrentPlayer ? ' (أنت)' : ''}</div>`;
            })
            .join('');
    }
}

function updateCurrentPlayer(player) {
    const currentTurn = document.getElementById('current-turn');
    const readyButton = document.getElementById('readyButton');
    const itemDisplay = document.getElementById('item-display');
    
    if (currentTurn) {
        currentTurn.textContent = player;
    }

    // Show/hide ready button based on if it's our turn
    if (readyButton) {
        readyButton.style.display = player === document.getElementById('player-name').value ? 'block' : 'none';
    }

    // Show/hide item display based on if it's our turn
    if (itemDisplay) {
        if (player === document.getElementById('player-name').value) {
            itemDisplay.style.display = 'block';
            itemDisplay.classList.add('visible');
        } else {
            itemDisplay.style.display = 'none';
            itemDisplay.classList.remove('visible');
        }
    }
}

function updateScores(scores) {
    const scoresElement = document.getElementById('scores');
    const currentPlayerName = document.getElementById('player-name').value;
    
    if (scoresElement && typeof scores === 'object') {
        scoresElement.innerHTML = Object.entries(scores)
            .map(([player, score]) => {
                const isCurrentPlayer = player === currentPlayerName;
                return `<div class="score-item ${isCurrentPlayer ? 'current-player' : ''}">${score}</div>`;
            })
            .join('');
    }
}

function updateStatusMessage(message) {
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function startTimer(duration) {
    const timerElement = document.getElementById('timer');
    if (timerElement) {
        let timeLeft = duration;
        timerElement.textContent = `الوقت المتبقي: ${timeLeft} ثانية`;
        window.charadesGame.timerInterval = setInterval(() => {
            timeLeft -= 1;
            timerElement.textContent = `الوقت المتبقي: ${timeLeft} ثانية`;
            if (timeLeft <= 0) {
                clearInterval(window.charadesGame.timerInterval);
                window.charadesGame.timerInterval = null;
            }
        }, 1000);
    }
}

function stopTimer() {
    if (window.charadesGame.timerInterval) {
        clearInterval(window.charadesGame.timerInterval);
        window.charadesGame.timerInterval = null;
    }
}

// When the game page loads, verify the session
document.addEventListener('DOMContentLoaded', () => {
    const gameData = JSON.parse(sessionStorage.getItem('gameData') || '{}');
    const urlParams = new URLSearchParams(window.location.search);
    const transferId = urlParams.get('transfer_id');
    
    if (gameData.transferId === transferId) {
        // Removed socket verification here
    }
});
