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
    constructor() {
        this.socket = null;
        this.gameId = null;
        this.playerName = null;
        this.playerType = null;
        this.playerScore = null;
        this.isHost = false;
        this.timerInterval = null;
        this.initialize();
    }

    initialize() {
        // Initialize socket connection
        try {
            this.socket = io();
            console.log('Socket.IO initialized successfully');
        } catch (error) {
            console.error('Error initializing Socket.IO:', error);
            this.updateStatus('حدث خطأ في الاتصال. يرجى تحديث الصفحة.');
            throw error;
        }

        // Get game data from DOM
        this.gameId = document.getElementById('game-id')?.value;
        this.playerName = document.getElementById('player-name')?.value;
        this.playerType = document.getElementById('player-type')?.value;
        this.playerScore = document.getElementById('player-score')?.value;
        this.isHost = document.getElementById('is-host')?.value === 'true';

        // Initialize event listeners
        this.setupSocketListeners();
        document.addEventListener('DOMContentLoaded', () => this.initializePlayers());
    }

    setupSocketListeners() {
        // Connection events
        this.socket.on('connect', () => this.handleConnect());
        
        // Game state events
        this.socket.on('game_state', (data) => this.handleGameState(data));
        this.socket.on('update_players', (data) => this.updatePlayerList(data.players));
        this.socket.on('new_item', (data) => this.handleNewItem(data));
        this.socket.on('timer_start', (data) => this.handleTimerStart(data));
        this.socket.on('score_update', (data) => this.handleScoreUpdate(data));
        this.socket.on('round_ended', (data) => this.handleRoundEnded(data));
    }

    // Event Handlers
    handleConnect() {
        this.socket.emit('join_game_room', {
            game_id: this.gameId,
            player_name: this.playerName
        });
        
        this.socket.emit('request_players', {
            game_id: this.gameId
        });
    }

    handleGameState(data) {
        if (data.players) {
            this.updatePlayerList(data.players);
        }
        if (data.message) {
            this.updateStatus(data.message);
        }
    }

    handleNewItem(data) {
        const itemDisplay = document.getElementById('item-display');
        itemDisplay.textContent = data.item;
        itemDisplay.classList.add('visible');
    }

    handleTimerStart(data) {
        this.startTimer(data.duration);
        const currentPlayer = document.getElementById('current-player').textContent;
        const guessButton = document.getElementById('guessButton');
        
        if (guessButton) {
            if (this.playerName !== currentPlayer) {
                guessButton.classList.add('visible');
            } else {
                guessButton.classList.remove('visible');
            }
        }
    }

    handleScoreUpdate(data) {
        this.updateScores(data.scores);
        if (data.last_item) {
            this.updateStatus('الإجابة الصحيحة: ' + data.last_item);
        }
    }

    handleRoundEnded(data) {
        clearInterval(this.timerInterval);
        document.getElementById('item-display').classList.remove('visible');
        const guessButton = document.getElementById('guessButton');
        if (guessButton) {
            guessButton.classList.remove('visible');
        }
        this.updateScores(data.scores);
        if (data.timeout) {
            this.updateStatus('انتهى الوقت! الكلمة كانت: ' + data.last_item);
        }
    }

    // UI Update Methods
    initializePlayers() {
        const initialPlayersInput = document.getElementById('initial-players');
        try {
            const initialPlayers = JSON.parse(initialPlayersInput.value);
            this.updateScores(initialPlayers);
        } catch (error) {
            console.error('Error parsing initial players:', error);
        }
    }

    updatePlayerList(players) {
        const playersList = document.getElementById('players-list');
        if (!Array.isArray(players)) {
            console.error('Players is not an array:', players);
            return;
        }
        
        playersList.innerHTML = players
            .map(player => `<div class="player-item ${player === this.playerName ? 'current-user' : ''}">${player}</div>`)
            .join('');
    }

    updateScores(scores) {
        const playersList = document.getElementById('players-list');
        const scoresDiv = document.getElementById('scores');
        const players = Object.keys(scores);

        playersList.innerHTML = players
            .map(player => `<div class="player-item ${player === this.playerName ? 'current-user' : ''}">${player}</div>`)
            .join('');

        scoresDiv.innerHTML = players
            .map(player => `<div class="score-item">${scores[player]}</div>`)
            .join('');
    }

    updateCurrentPlayer(currentPlayer) {
        document.getElementById('current-player').textContent = currentPlayer;
        if (this.playerName === currentPlayer) {
            this.updateStatus('دورك! مثّل الكلمة دي');
        } else {
            this.updateStatus(`دور ${currentPlayer}`);
        }
    }

    updateStatus(message) {
        document.getElementById('game-status').textContent = message;
    }

    startTimer(duration) {
        clearInterval(this.timerInterval);
        const timerDisplay = document.getElementById('timer');
        let timeLeft = duration;

        const updateDisplay = () => {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        };

        updateDisplay();
        this.timerInterval = setInterval(() => {
            timeLeft--;
            updateDisplay();
            if (timeLeft <= 0) {
                clearInterval(this.timerInterval);
            }
        }, 1000);
    }

    // Game Actions
    handleCorrectGuess() {
        this.socket.emit('correct_guess', {
            game_id: this.gameId,
            player_name: this.playerName
        });
    }

    startNextRound() {
        this.socket.emit('start_round', {
            game_id: this.gameId
        });
    }

    leaveGame() {
        window.location.href = '/';
    }

    endGame() {
        this.socket.emit('end_game', {
            game_id: this.gameId
        });
        window.location.href = '/';
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
    if (document.querySelector('.game-container')) {
        window.charadesGame = new CharadesGame();
    } else if (document.querySelector('.lobby-container')) {
        window.charadesLobby = new CharadesLobby();
    }
});

// Update the game_started event handler
window.socket.on('game_started', function(data) {
    // Construct the URL with query parameters
    const redirectUrl = `${data.redirect_url}?transfer_id=${data.transfer_id}&player_name=${playerName}`;
    // Redirect to the game page
    window.location.href = redirectUrl;
});
