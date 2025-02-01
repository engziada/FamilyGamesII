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
function startGame() {
    if (!currentGameId) {
        console.error('No game ID available');
        return;
    }

    if (!isHost) {
        alert('فقط اللعيب الكبير يقدر يبدأ اللعبة');
        return;
    }

    console.log('Starting game:', currentGameId);
    socket.emit('start_game', {
        game_id: currentGameId
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
    // Initialize socket connection with proper configuration
    const socketOptions = {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['polling', 'websocket'],
        upgrade: false,
        forceNew: true,
        pingTimeout: 5000,
        pingInterval: 25000,
        closeOnBeforeunload: false
    };

    // Create socket instance with error handling
    try {
        socket = io('http://127.0.0.1:5000', socketOptions);
        console.log('Initializing socket connection with proper configuration');
    } catch (error) {
        console.error('Socket initialization error:', error);
        return;
    }

    // Connection status handling with cleanup
    let connectionStatus;
    
    function createConnectionStatus() {
        if (!connectionStatus) {
            connectionStatus = document.createElement('div');
            connectionStatus.id = 'connection-status';
            document.body.appendChild(connectionStatus);
        }
        return connectionStatus;
    }

    function updateConnectionStatus(text, className) {
        const status = createConnectionStatus();
        status.textContent = text;
        status.className = className;
    }

    // Clean up function to properly close socket and remove listeners
    function cleanupSocket() {
        if (socket) {
            // Remove all listeners to prevent memory leaks
            socket.removeAllListeners();
            
            // Emit leave event if in a game
            if (currentGameId && playerName) {
                socket.emit('leave_game', {
                    roomId: currentGameId,
                    playerName: playerName
                });
            }
            
            // Close socket connection
            socket.close();
        }

        // Remove connection status element
        if (connectionStatus && connectionStatus.parentNode) {
            connectionStatus.parentNode.removeChild(connectionStatus);
        }
    }

    // Handle page visibility changes
    let wasInGame = false;
    let lastGameState = null;
    
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('Page hidden');
            // Store game state if we're in a game
            if (currentGameId && playerName) {
                wasInGame = true;
                lastGameState = {
                    gameId: currentGameId,
                    playerName: playerName,
                    isHost: isHost
                };
            }
        } else {
            console.log('Page visible');
            // If we were in a game, reconnect and rejoin
            if (wasInGame && lastGameState) {
                console.log('Reconnecting to game:', lastGameState);
                socket = io('http://127.0.0.1:5000', socketOptions);
                
                socket.on('connect', () => {
                    if (lastGameState.isHost) {
                        socket.emit('create_game', {
                            game_id: parseInt(lastGameState.gameId),
                            player_name: lastGameState.playerName,
                            game_type: currentGame
                        });
                    } else {
                        socket.emit('join_game', {
                            game_id: lastGameState.gameId,
                            player_name: lastGameState.playerName,
                            game_type: currentGame
                        });
                    }
                });
            }
        }
    });

    // Handle page unload
    window.addEventListener('beforeunload', () => {
        console.log('Page unloading, cleaning up socket');
        cleanupSocket();
    });

    socket.on('connect', () => {
        updateConnectionStatus('متصل', 'connected');
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
        updateConnectionStatus('غير متصل', 'disconnected');
        console.log('Disconnected from server');
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        updateConnectionStatus('خطأ في الاتصال', 'error');
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        updateConnectionStatus('خطأ في الاتصال', 'error');
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('Reconnected after', attemptNumber, 'attempts');
        updateConnectionStatus('متصل', 'connected');
        
        // Re-join room if we were in one
        if (currentGameId && playerName) {
            console.log('Re-joining game room after reconnection');
            socket.emit('join_game_room', {
                roomId: currentGameId,
                playerName: playerName
            });
        }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log('Attempting to reconnect:', attemptNumber);
        updateConnectionStatus('جاري إعادة الاتصال...', 'reconnecting');
    });

    socket.on('reconnect_error', (error) => {
        console.error('Reconnection error:', error);
        updateConnectionStatus('فشل إعادة الاتصال', 'error');
    });

    socket.on('reconnect_failed', () => {
        console.error('Failed to reconnect');
        updateConnectionStatus('تعذر إعادة الاتصال', 'error');
        alert('تعذر الاتصال بالخادم. يرجى تحديث الصفحة.');
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
        
        // Update both create and join modal player lists
        const hostPlayersList = document.getElementById('host-players-list');
        const joinPlayersList = document.getElementById('join-players-list');
        
        if (hostPlayersList) {
            hostPlayersList.innerHTML = data.players.map(player => 
                `<li>${player.name}${player.isHost ? ' (اللعيب الكبير)' : ''}</li>`
            ).join('');
        }
        
        if (joinPlayersList) {
            joinPlayersList.innerHTML = data.players.map(player => 
                `<li>${player.name}${player.isHost ? ' (اللعيب الكبير)' : ''}</li>`
            ).join('');
        }
        
        // Update start button state for host
        const startButton = document.getElementById('start-game-btn');
        if (startButton && isHost) {
            startButton.disabled = data.players.length < 2;
        }
    });

    socket.on('game_started', async (data) => {
        console.log('Game started:', data);
        
        try {
            // Hide modals first
            hideModal('create-game-modal');
            hideModal('join-game-modal');

            // Redirect to game page with transfer ID and player name
            const url = new URL(data.url, window.location.origin);
            url.searchParams.append('transfer_id', data.transfer_id);
            url.searchParams.append('player_name', playerName);
            window.location.href = url.toString();
        } catch (error) {
            console.error('Error handling game start:', error);
        }
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

    socket.on('player_left', (data) => {
        console.log('Player left:', data);
        
        // Update both create and join modal player lists
        const hostPlayersList = document.getElementById('host-players-list');
        const joinPlayersList = document.getElementById('join-players-list');
        
        if (hostPlayersList) {
            hostPlayersList.innerHTML = data.players.map(player => 
                `<li>${player.name}${player.isHost ? ' (اللعيب الكبير)' : ''}</li>`
            ).join('');
        }
        
        if (joinPlayersList) {
            joinPlayersList.innerHTML = data.players.map(player => 
                `<li>${player.name}${player.isHost ? ' (اللعيب الكبير)' : ''}</li>`
            ).join('');
        }
        
        // Update start button state for host
        const startButton = document.getElementById('start-game-btn');
        if (startButton && isHost) {
            startButton.disabled = data.players.length < 2;
        }
    });

    socket.on('update_players', (data) => {
        console.log('Players updated:', data);
        
        // Update both create and join modal player lists
        const hostPlayersList = document.getElementById('host-players-list');
        const joinPlayersList = document.getElementById('join-players-list');
        
        const playerItems = data.players.map(name => 
            `<li>${name}${name === playerName && isHost ? ' (اللعيب الكبير)' : ''}</li>`
        ).join('');
        
        if (hostPlayersList) {
            hostPlayersList.innerHTML = playerItems;
        }
        
        if (joinPlayersList) {
            joinPlayersList.innerHTML = playerItems;
        }
        
        // Update start button state for host
        const startButton = document.getElementById('start-game-btn');
        if (startButton && isHost) {
            startButton.disabled = data.players.length < 2;
        }
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
