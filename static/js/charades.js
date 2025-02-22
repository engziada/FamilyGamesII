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
            game_id: data.game_id,
            transfer_id: data.transfer_id,
            player_name: playerName,
            is_host: document.getElementById('host-name') !== null
        }));

        // Create a form and submit it to handle the redirection properly
        const form = document.createElement('form');
        form.method = 'GET';
        // form.action = data.url;
        form.action = data.redirect_url;

        // Add transfer_id as hidden input
        const transferInput = document.createElement('input');
        transferInput.type = 'hidden';
        transferInput.name = 'transfer_id';
        transferInput.value = data.transfer_id;
        form.appendChild(transferInput);

        // Add player_name as hidden input
        const playerInput = document.createElement('input');
        playerInput.type = 'hidden';
        playerInput.name = 'player_name';
        playerInput.value = playerName;
        form.appendChild(playerInput);

        // Add is_host as hidden input
        const isHostInput = document.createElement('input');
        isHostInput.type = 'hidden';
        isHostInput.name = 'is_host';
        isHostInput.value = document.getElementById('host-name') !== null;
        form.appendChild(isHostInput);

        // Add the form to the document and submit it
        document.body.appendChild(form);
        
        // Disable the start button if it exists
        const startButton = document.querySelector('#create-game-modal .buttons button');
        if (startButton) {
            startButton.disabled = true;
            startButton.textContent = 'جاري بدء اللعبة...';
        }

        // Submit the form after a very short delay to ensure socket events are processed
        setTimeout(() => {
            form.submit();
        }, 100);
    });

    window.socket.on('error_message', (data) => {
        alert(data.message);
        // Re-enable start button if there was an error
        const startButton = document.querySelector('#create-game-modal .buttons button');
        if (startButton && startButton.disabled) {
            startButton.disabled = false;
            startButton.textContent = 'يالا نبدأ';
        }
    });
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

// Charades Game JavaScript Module
class CharadesGame {
    constructor(socket, gameId, playerName, isHost) {
        this.socket = socket;
        this.gameId = gameId;
        this.playerName = playerName;
        this.playerType = null;
        this.playerScore = null;
        this.isHost = isHost;
        this.timerInterval = null;
        
        // Bind methods to preserve 'this' context
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
        this.cleanup = this.cleanup.bind(this);
        
        // Add cleanup handlers
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        this.initialize();
    }

    initialize() {
        if (!this.socket || !this.gameId || !this.playerName) {
            console.error('Missing required game information');
            return;
        }

        // Setup socket event listeners
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        // Remove any existing listeners first
        this.cleanup();

        this.socket.on('game_state', (data) => {
            if (data.message) {
                this.updateStatus(data.message);
            }
            if (data.players) {
                this.updatePlayersList(data.players);
            }
            if (data.current_player) {
                this.updateCurrentPlayer(data.current_player);
            }
            if (data.scores) {
                this.updateScores(data.scores);
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.cleanup();
        });
    }

    cleanup() {
        if (this.socket) {
            // Remove all listeners
            this.socket.removeAllListeners('game_state');
            this.socket.removeAllListeners('disconnect');
            
            // Clear any running timers
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        }
    }

    handleBeforeUnload(event) {
        // Cleanup before page unload
        this.cleanup();
        
        if (this.socket && this.socket.connected) {
            this.socket.emit('leave_game', {
                game_id: this.gameId,
                player_name: this.playerName
            });
        }
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
        const currentTurnElement = document.getElementById('current-turn');
        if (currentTurnElement) {
            const currentPlayerName = document.getElementById('player-name').value;
            const displayText = player === currentPlayerName ? 
                `${player} (أنت)` : player;
            currentTurnElement.textContent = displayText;
            
            // Update the current player highlight in the players list
            const playerItems = document.querySelectorAll('.player-item');
            playerItems.forEach(item => {
                if (item.textContent.includes(player)) {
                    item.classList.add('current-turn');
                } else {
                    item.classList.remove('current-turn');
                }
            });
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

// Initialize game or lobby based on current page
document.addEventListener('DOMContentLoaded', () => {
    // Initialize game elements and event listeners only if we're on the game page
    if (document.querySelector('.game-container')) {
        let socket;
        try {
            // Initialize socket connection
            socket = io({
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: 5
            });
        } catch (error) {
            console.error('Failed to initialize socket:', error);
            return;
        }

        // Get player info from hidden fields
        const gameId = document.getElementById('game-id')?.value;
        const playerName = document.getElementById('player-name')?.value;
        const isHost = document.getElementById('is-host')?.value === 'true';
        const initialStateElem = document.getElementById('initial-state');
        const initialState = initialStateElem ? JSON.parse(initialStateElem.value) : {};
        
        if (!gameId || !playerName) {
            console.error('Missing required game information');
            return;
        }

        // Store player info in localStorage for persistence
        localStorage.setItem('gameId', gameId);
        localStorage.setItem('playerName', playerName);
        localStorage.setItem('isHost', isHost);

        // Initialize game instance with socket and initial state
        window.charadesGame = new CharadesGame(socket, gameId, playerName, isHost);
        
        // Apply initial state if available
        if (initialState && Object.keys(initialState).length > 0) {
            if (initialState.players) {
                window.charadesGame.updatePlayersList(initialState.players);
            }
            if (initialState.current_player) {
                window.charadesGame.updateCurrentPlayer(initialState.current_player);
            }
            if (initialState.scores) {
                window.charadesGame.updateScores(initialState.scores);
            }
            if (initialState.status) {
                window.charadesGame.updateStatus(initialState.status);
            }
        }
        
        // Connect and join game room
        socket.on('connect', () => {
            console.log('Socket.IO initialized successfully');
            socket.emit('join_game_room', {
                game_id: gameId,
                player_name: playerName
            });
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
        });

        // Get DOM elements
        const readyButton = document.getElementById('ready-btn');
        const guessButton = document.getElementById('guess-btn');
        const leaveButton = document.getElementById('leaveButton');
        const endGameButton = document.getElementById('endGameButton');

        // Add event listeners only if elements exist
        if (readyButton) {
            readyButton.addEventListener('click', function() {
                if (socket && socket.connected) {
                    socket.emit('player_ready', {
                        game_id: gameId,
                        player_name: playerName
                    });
                    this.style.display = 'none';
                }
            });
        }

        if (guessButton) {
            guessButton.addEventListener('click', function() {
                if (socket && socket.connected) {
                    socket.emit('guess_correct', {
                        game_id: gameId,
                        player_name: playerName
                    });
                }
            });
        }

        if (leaveButton) {
            leaveButton.addEventListener('click', function() {
                if (socket && socket.connected) {
                    socket.emit('leave_game', {
                        game_id: gameId,
                        player_name: playerName
                    });
                }
                window.location.href = '/';
            });
        }

        if (endGameButton && isHost) {
            endGameButton.addEventListener('click', function() {
                if (socket && socket.connected) {
                    socket.emit('cancel_game', {
                        game_id: gameId,
                        player_name: playerName
                    });
                }
                window.location.href = '/';
            });
        }
    } else if (document.querySelector('.lobby-container')) {
        window.charadesLobby = new CharadesLobby();
    }
});

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
    const currentTurnElement = document.getElementById('current-turn');
    if (currentTurnElement) {
        const currentPlayerName = document.getElementById('player-name').value;
        const displayText = player === currentPlayerName ? 
            `${player} (أنت)` : player;
        currentTurnElement.textContent = displayText;
        
        // Update the current player highlight in the players list
        const playerItems = document.querySelectorAll('.player-item');
        playerItems.forEach(item => {
            if (item.textContent.includes(player)) {
                item.classList.add('current-turn');
            } else {
                item.classList.remove('current-turn');
            }
        });
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
