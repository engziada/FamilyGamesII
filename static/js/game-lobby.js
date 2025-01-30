// Game state management
let currentGame = null;
let isHost = false;
let currentGameId = null;
let playerName = null;
let socket = null;

// Modal helper functions
window.showModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
        console.log('Showing modal:', modalId);
    } else {
        console.error('Modal not found:', modalId);
    }
}

window.hideModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        console.log('Hiding modal:', modalId);
    } else {
        console.error('Modal not found:', modalId);
    }
}

// Game modal management
window.showGameModal = function(gameType, action) {
    console.log('showGameModal called with:', gameType, action);
    currentGame = gameType;
    resetModals();
    if (action === 'create') {
        showModal('create-game-modal');
    } else {
        showModal('join-game-modal');
    }
}

// Game creation functions
window.createGame = function() {
    const hostNameInput = document.getElementById('host-name');
    playerName = hostNameInput.value.trim();
    if (!playerName) {
        alert('من فضلك اكتب اسمك');
        return;
    }

    const gameId = Math.floor(1000 + Math.random() * 9000);
    isHost = true;
    currentGameId = gameId;

    console.log('Creating game:', { gameId, playerName, isHost });
    socket.emit('create_game', {
        game_id: gameId,
        player_name: playerName,
        game_type: currentGame
    });

    document.getElementById('room-id').textContent = gameId;
    document.getElementById('room-info').style.display = 'block';
    document.getElementById('host-players-list').innerHTML = `<li>${playerName} (اللعيب الكبير)</li>`;
    document.querySelector('#create-game-modal .players-list').style.display = 'block';
    
    // Update create button to start button
    const buttonsDiv = document.querySelector('#create-game-modal .buttons');
    buttonsDiv.innerHTML = `
        <button class="btn" id="start-game-btn" onclick="startGame()">أبدأ يا معلم</button>
        <button class="btn btn-secondary" onclick="cancelGame()">إلغاء</button>
    `;
}

// Game joining functions
window.joinGame = function() {
    const playerNameInput = document.getElementById('player-name');
    const roomCodeInput = document.getElementById('room-code');
    playerName = playerNameInput.value.trim();
    const roomCode = roomCodeInput.value.trim();

    if (!playerName || !roomCode) {
        alert('من فضلك اكتب اسمك ورقم الأوضة');
        return;
    }

    currentGameId = roomCode;
    isHost = false;

    console.log('Joining game:', { roomCode, playerName, isHost });
    socket.emit('join_game', {
        game_id: roomCode,
        player_name: playerName,
        game_type: currentGame
    });
}

// Game control functions
window.startGame = function() {
    if (!isHost) {
        console.error('Only host can start the game');
        return;
    }
    
    console.log('Starting game:', { currentGameId, playerName, isHost });
    socket.emit('start_game', { 
        game_id: currentGameId,
        player_name: playerName
    });
}

window.cancelGame = function() {
    socket.emit('cancel_game');
    hideModal('create-game-modal');
    resetModals();
}

window.leaveGame = function() {
    socket.emit('cancel_game');
    hideModal('join-game-modal');
    resetModals();
}

function resetModals() {
    // Reset create game modal
    document.getElementById('host-name').value = '';
    document.getElementById('room-info').style.display = 'none';
    document.querySelector('#create-game-modal .players-list').style.display = 'none';
    
    // Reset join game modal
    document.getElementById('player-name').value = '';
    document.getElementById('room-code').value = '';
    document.getElementById('join-form').style.display = 'block';
    document.getElementById('join-lobby').style.display = 'none';
    
    // Reset state
    isHost = false;
    currentGame = null;
    currentGameId = null;
    playerName = null;
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize socket connection
    socket = io();
    console.log('Initializing socket connection');

    // Connection status handling
    const connectionStatus = document.createElement('div');
    connectionStatus.id = 'connection-status';
    document.body.appendChild(connectionStatus);

    socket.on('connect', () => {
        connectionStatus.textContent = 'متصل';
        connectionStatus.className = 'connected';
        console.log('Connected to server');

        // Auto-join game room if URL has game parameters
        const urlParams = new URLSearchParams(window.location.search);
        const gameId = window.location.pathname.split('/').pop();
        const playerNameFromUrl = urlParams.get('player_name');
        const isHostFromUrl = urlParams.get('is_host') === 'true';

        if (gameId && playerNameFromUrl) {
            console.log('Auto-joining game room:', gameId, 'as player:', playerNameFromUrl);
            socket.emit('join_game_room', {
                roomId: gameId,
                playerName: playerNameFromUrl
            });
            playerName = playerNameFromUrl;
            isHost = isHostFromUrl;
            currentGameId = gameId;
        }
    });

    socket.on('disconnect', () => {
        connectionStatus.textContent = 'غير متصل';
        connectionStatus.className = 'disconnected';
        console.log('Disconnected from server');
    });

    // Global redirect handler
    socket.on('redirect', (data) => {
        console.log('Redirecting to:', data.url);
        window.location.href = data.url;
    });

    // Socket event handlers
    socket.on('game_created', (data) => {
        console.log('Game created:', data);
        isHost = true;
        currentGameId = data.game_id;
        
        // Show start button for host
        const startButton = document.getElementById('start-game-btn');
        if (startButton && isHost) {
            startButton.style.display = 'inline-block';
            startButton.disabled = data.players.length < 2;
        }

        // Update player list
        updatePlayerList(data.players, data.host);
    });

    socket.on('room_joined', (data) => {
        console.log('Room joined:', data);
        
        // Update game state
        currentGameId = data.roomId;
        
        // Update player list
        updatePlayerList(data.players, data.host);
        
        // Update start button state for host
        const startButton = document.getElementById('start-game-btn');
        if (startButton && isHost) {
            startButton.style.display = 'inline-block';
            startButton.disabled = data.players.length < 2;
        }
    });

    socket.on('player_joined', (data) => {
        console.log('Player joined:', data);
        
        // Update player list
        updatePlayerList(data.players, data.host);
        
        // Update start button state for host
        const startButton = document.getElementById('start-game-btn');
        if (startButton && isHost) {
            startButton.disabled = data.players.length < 2;
        }
    });

    socket.on('game_started', (data) => {
        console.log('Game started, redirecting to:', data.url);
        
        // Immediately hide modals
        hideModal('create-game-modal');
        hideModal('join-game-modal');
        
        // Force redirect to the game URL with parameters
        const params = new URLSearchParams({
            player_name: playerName,
            is_host: isHost
        });
        
        const gameUrl = `${window.location.origin}/game/${data.game_id}?${params.toString()}`;
        console.log('Redirecting to game URL:', gameUrl);
        window.location.href = gameUrl;
    });

    socket.on('join_success', (data) => {
        console.log('Join success:', data);
        // Hide join form and show lobby
        document.getElementById('join-form').style.display = 'none';
        document.getElementById('join-lobby').style.display = 'block';
        
        // Set room number
        document.getElementById('join-room-id').textContent = currentGameId;
        
        // Update players list
        const playersList = document.getElementById('join-players-list');
        playersList.innerHTML = data.players.map(player => 
            `<li>${player.name}${player.isHost ? ' (اللعيب الكبير)' : ''}</li>`
        ).join('');
    });

    socket.on('game_error', (error) => {
        console.error('Game error:', error);
        alert(error.message);
    });

    socket.on('game_cancelled', () => {
        console.log('Game cancelled');
        if (!isHost) {
            alert('اللعيب الكبير ألغى اللعبة');
            hideModal('join-game-modal');
            resetModals();
        }
    });

    // Close modal when clicking outside
    window.onclick = function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    }

    // Clean up when leaving page
    window.onbeforeunload = function() {
        if (currentGameId) {
            socket.emit('cancel_game');
        }
    };
});

// Helper function to update player list
function updatePlayerList(players, host) {
    const playerList = document.getElementById('player-list');
    if (!playerList) return;
    
    playerList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player + (player === host ? ' (المضيف)' : '');
        if (player === playerName) {
            li.classList.add('current-player');
        }
        playerList.appendChild(li);
    });
}

// Helper function to update game state
function updateGameState(currentPlayer, currentItem) {
    const gameStatus = document.getElementById('game-status');
    if (!gameStatus) return;
    
    if (currentPlayer === playerName) {
        gameStatus.textContent = 'دورك! الكلمة هي: ' + currentItem;
    } else {
        gameStatus.textContent = 'دور ' + currentPlayer;
    }
}

// Helper function to update scores
function updateScores(scores) {
    const scoreList = document.getElementById('score-list');
    if (!scoreList) return;
    
    scoreList.innerHTML = '';
    Object.entries(scores).forEach(([player, score]) => {
        const li = document.createElement('li');
        li.textContent = `${player}: ${score}`;
        scoreList.appendChild(li);
    });
}
