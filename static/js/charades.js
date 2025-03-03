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
            <button class="btn btn-primary" onclick="createGame()">مضة جديدة</button>
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

    // Replace create button with start game button (initially disabled)
    const buttonsDiv = document.querySelector('#create-game-modal .buttons');
    buttonsDiv.innerHTML = `
        <button id="start-game-btn" class="btn btn-primary" onclick="startGame()" disabled>يالا نبدأ</button>
        <button class="btn btn-secondary" onclick="hideModal('create-game-modal')">إلغاء</button>
    `;
    
    // Show message that more players are needed
    const playersListDiv = document.querySelector('#create-game-modal .players-list');
    const minPlayersMsg = document.createElement('p');
    minPlayersMsg.id = 'min-players-msg';
    minPlayersMsg.className = 'waiting-message';
    minPlayersMsg.style.color = 'var(--accent-color)';
    minPlayersMsg.textContent = 'في انتظار انضمام لاعب آخر على الأقل...';
    playersListDiv.appendChild(minPlayersMsg);
}

function startGame() {
    const gameId = document.getElementById('room-id').textContent;
    const hostName = document.getElementById('host-name').value;
    const startButton = document.querySelector('#create-game-modal .buttons button');
    
    // Check if the button is disabled (not enough players)
    if (startButton && startButton.disabled) {
        showMessage('لا يمكن بدء اللعبة حتى ينضم لاعب آخر على الأقل');
        return;
    }
    
    if (window.socket) {
        // Disable the start button to prevent multiple clicks
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

    window.socket.on('player_left', (data) => {
        console.log('Player left:', data);
        updatePlayerList(data.players);
        showMessage(data.message);
    });

    window.socket.on('host_transferred', (data) => {
        console.log('Host transferred:', data);
        updatePlayerList(data.players);
        showMessage(data.message);
        
        // If current player is the new host, refresh the page to load host controls
        const currentPlayer = document.getElementById('player-name')?.value || document.getElementById('current-player-name')?.value;
        if (currentPlayer === data.newHost) {
            // Set session storage to maintain host status after refresh
            const gameData = JSON.parse(sessionStorage.getItem('gameData') || '{}');
            gameData.isHost = true;
            sessionStorage.setItem('gameData', JSON.stringify(gameData));
            window.location.reload();
        }
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

function showMessage(message) {
    const messageDiv = document.getElementById('message');
    if (messageDiv) {
        messageDiv.textContent = message;
        messageDiv.style.display = 'block';
        setTimeout(() => {
            messageDiv.style.display = 'none';
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
                li.textContent += ' 👑';
            }
            list.appendChild(li);
        });
    });
    
    // Check if we have enough players to start the game (minimum 2)
    const startButton = document.getElementById('start-game-btn');
    const minPlayersMsg = document.getElementById('min-players-msg');
    
    if (startButton && minPlayersMsg) {
        if (players.length >= 2) {
            // Enable the start button
            startButton.disabled = false;
            // Update the message
            minPlayersMsg.textContent = 'يمكنك بدء اللعبة الآن!';
            minPlayersMsg.style.color = 'var(--primary-color)';
        } else {
            // Disable the start button
            startButton.disabled = true;
            // Update the message
            minPlayersMsg.textContent = 'في انتظار انضمام لاعب آخر على الأقل...';
            minPlayersMsg.style.color = 'var(--accent-color)';
        }
    }
}

function updatePlayerList(players) {
    console.log('Updating player list with:', players);
    const playerList = document.querySelector('.players-list ul');
    if (!playerList) return;
    
    playerList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        const playerName = typeof player === 'object' ? player.name : player;
        const isHost = typeof player === 'object' ? player.isHost : false;
        const isCurrentPlayer = playerName === document.getElementById('player-name').value;
        
        // Add current player class if applicable
        if (isCurrentPlayer) {
            li.classList.add('current-player');
        }
        
        // Set player name
        li.textContent = playerName;
        
        // Add host indicator if applicable
        if (isHost) {
            li.classList.add('host');
            li.textContent += ' 👑';
        }
        
        // Add current player indicator
        if (isCurrentPlayer) {
            li.textContent += ' (أنت)';
        }
        
        playerList.appendChild(li);
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
        const isHost = document.getElementById('is-host').value === 'true';
        
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
        // Initialize audio elements for sound effects only (no background music)
        this.guessedSound = new Audio('/static/sounds/guessed.mp3');
        this.timeoutSound = new Audio('/static/sounds/timeout.mp3');
        
        // Initialize socket connection
        this.initializeSocket();
    }

    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Socket connected successfully');
            
            // Set up UI event listeners after socket connection
            this.setupUIEventListeners();
            
            // Verify game state after connection
            this.socket.emit('verify_game', {
                game_id: this.gameId,
                player_name: this.playerName,
                transfer_id: this.transferId
            });
        });

        // Set up all socket event listeners
        this.setupSocketListeners();
    }

    setupUIEventListeners() {
        // Start game button
        const startButton = document.getElementById('startButton');
        if (startButton && this.isHost) {
            startButton.addEventListener('click', () => {
                console.log('Starting game...');
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
                
                // First hide the button immediately for better UX
                readyButton.style.display = 'none';
                
                // Let the server determine the game status
                // We'll only update our local state when we receive confirmation
                // DO NOT set game status here, wait for server response
                
                this.socket.emit('player_ready', {
                    game_id: this.gameId
                });
            });
        }
        
        // Next item button
        const nextButton = document.getElementById('nextButton');
        if (nextButton && this.isHost) {
            nextButton.addEventListener('click', () => {
                console.log('Requesting next item...');
                this.socket.emit('request_item', {
                    game_id: this.gameId
                });
            });
        }
        
        // Reveal button for host
        const revealButton = document.getElementById('revealButton');
        if (revealButton && this.isHost) {
            revealButton.addEventListener('click', () => {
                console.log('Revealing answer...');
                this.socket.emit('reveal_answer', {
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

        // Guess button for guests
        const guessButton = document.getElementById('guessButton');
        if (guessButton && !this.isHost) {
            guessButton.addEventListener('click', () => {
                console.log('Player guessed correctly');
                this.socket.emit('guess_correct', {
                    game_id: this.gameId,
                    player_name: this.playerName
                });
            });
        }

        // Pass button for guests
        const passButton = document.getElementById('passButton');
        if (passButton) {
            passButton.addEventListener('click', () => {
                console.log('Player passed');
                this.socket.emit('player_passed', {
                    game_id: this.gameId,
                    player_name: this.playerName
                });
            });
        }

        // Add event listeners for host control buttons if the player is the host
        if (this.isHost) {
            const withdrawButton = document.getElementById('leave-room');
            const closeRoomButton = document.getElementById('close-room');
            
            if (withdrawButton) {
                withdrawButton.addEventListener('click', () => {
                    if (confirm('هل أنت متأكد أنك تريد الانسحاب من اللعبة؟')) {
                        console.log('Host withdrawing from game:', this.gameId);
                        this.socket.emit('host_withdraw', {
                            roomId: this.gameId,
                            playerName: this.playerName
                        });
                        window.location.href = '/';  // Redirect to home page
                    }
                });
            }
            
            if (closeRoomButton) {
                closeRoomButton.addEventListener('click', () => {
                    if (confirm('هل أنت متأكد أنك تريد إغلاق الغرفة؟ سيتم طرد جميع اللاعبين.')) {
                        console.log('Host closing room:', this.gameId);
                        this.socket.emit('close_room', {
                            roomId: this.gameId,
                            playerName: this.playerName
                        });
                        window.location.href = '/';  // Redirect to home page
                    }
                });
            }
        } else {
            // Regular player leave button
            const leaveButton = document.getElementById('leaveButton');
            if (leaveButton) {
                leaveButton.addEventListener('click', () => {
                    if (confirm('هل أنت متأكد أنك تريد الانسحاب من اللعبة؟')) {
                        console.log('Player leaving game:', this.gameId);
                        this.socket.emit('leave_game', {
                            roomId: this.gameId,
                            playerName: this.playerName
                        });
                        window.location.href = '/';  // Redirect to home page
                    }
                });
            }
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
        
        // Add round_timeout event handler
        this.socket.on('round_timeout', (data) => {
            console.log('Round timeout event received:', data);
            
            // Stop any existing timer
            this.stopTimer();
            
            // Play timeout sound
            this.playTimeoutTwice();
            
            // Update game status
            if (data.game_status) {
                this.setGameStatus(data.game_status);
            } else {
                this.setGameStatus('playing');
            }
            
            // Update current player if provided
            if (data.next_player) {
                this.updateCurrentPlayer(data.next_player);
            }
        });
        
        // Add force reset timer event handler with player information
        this.socket.on('force_reset_timer', (data) => {
            console.log('Force reset timer event received with data:', data);
            
            // Stop any existing timer
            this.stopTimer();
            
            // Reset timer display
            const timerDisplay = document.getElementById('timer');
            if (timerDisplay) {
                timerDisplay.textContent = '0:00';
                timerDisplay.classList.remove('warning', 'danger');
                timerDisplay.style.display = 'none';
            }
            
            // Update game status if provided
            if (data.game_status) {
                this.setGameStatus(data.game_status);
            }
            
            // Update current player if provided
            if (data.current_player) {
                this.updateCurrentPlayer(data.current_player);
            }
            
            // Update next player if provided
            if (data.next_player) {
                // Update the current turn display
                const currentTurn = document.getElementById('current-turn');
                if (currentTurn) {
                    currentTurn.textContent = data.next_player;
                }
                
                // Update button visibility based on the new player
                this.updateButtonVisibility();
            }
        });

        this.socket.on('error', (data) => {
            console.error('Game error:', data);
            this.showError(data.message);
        });

        // Add pass_turn event handler
        this.socket.on('pass_turn', (data) => {
            console.log('Pass turn event received:', data);
            
            // Stop any existing timer
            this.stopTimer();
            
            // Update game status if provided
            if (data.game_status) {
                this.setGameStatus(data.game_status);
            }
            
            // Update next player if provided
            if (data.next_player) {
                this.updateCurrentPlayer(data.next_player);
            }
            
            // Show a message that the player passed their turn
            if (data.player) {
                this.updateStatus(`${data.player} تخطى دوره! دور ${data.next_player}`);
            }
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

        // Add host control event listeners
        this.socket.on('host_withdrawn', (data) => {
            console.log('Host withdrawn:', data);
            
            // Update player list
            updatePlayerList(data.players);
            
            // Show message
            showMessage(data.message);
            
            // If current player is the new host, refresh to load host controls
            const currentPlayer = document.getElementById('player-name')?.value || 
                                document.getElementById('current-player-name')?.value;
                                
            if (data.newHost && currentPlayer === data.newHost) {
                // Update session storage before refresh
                const gameData = JSON.parse(sessionStorage.getItem('gameData') || '{}');
                gameData.isHost = true;
                sessionStorage.setItem('gameData', JSON.stringify(gameData));
                
                // Show message about becoming host
                showMessage('أنت المضيف الجديد! جاري تحديث الصفحة...');
                
                // Short delay to ensure message is shown
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            }
        });

        this.socket.on('room_closed', (data) => {
            console.log('Room closed:', data);
            this.showError(data.message);
            
            // Clear session storage
            sessionStorage.clear();
            
            // Disconnect socket before redirect
            if (this.socket) {
                this.socket.disconnect();
            }
            
            // Redirect all players to home page after a short delay
            setTimeout(() => {
                window.location.href = data.redirect || '/';
            }, 2000);
        });

        this.socket.on('host_transferred', (data) => {
            // Update game state
            if (data.gameState) {
                this.updateGameState(data.gameState);
            }
            
            // Update player list
            if (data.players) {
                this.updatePlayersList(data.players);
            }
            
            // Show message about host transfer
            this.showMessage(data.message);
            
            // If current player is the new host, refresh the page
            if (data.newHost === this.playerName) {
                window.location.reload();
            }
        });

        this.socket.on('you_are_host', (data) => {
            this.isHost = true;
            this.showMessage(data.message);
            // Update UI elements for host
            this.updateHostUI();
        });

        this.socket.on('game_error', (data) => {
            this.showError(data.message);
        });

        this.socket.on('player_left', (data) => {
            if (data.players) {
                this.updatePlayersList(data.players);
            }
            this.showMessage(data.message);
        });

        this.socket.on('update_players', (data) => {
            if (data.players) {
                this.updatePlayersList(data.players);
            }
            if (data.gameState) {
                this.updateGameState(data.gameState);
            }
        });

        this.socket.on('player_ready', (data) => {
            console.log('Player ready event received:', data);
            
            // Update game status to round_active when a player is ready
            this.setGameStatus('round_active');
            
            // Start timer if timer data is provided
            if (data.timer && data.timer.duration) {
                this.startTimer(data.timer.duration);
            }
        });

        this.socket.on('round_ended', (data) => {
            console.log('Round ended event received:', data);
            
            // Play timeout sound twice for all players
            this.playTimeoutTwice();
            
            // Update scores if available
            if (data.scores) {
                this.updateScores(data.scores);
            }
            
            // Update current player if available
            if (data.current_player) {
                this.updateCurrentPlayer(data.current_player);
            }
            
            // Update game status
            this.setGameStatus('round_ended');
            
            // Stop any existing timer
            this.stopTimer();
        });
    }

    updateGameState(data) {
        if (!data) return;
        
        try {
            console.log("Received game state update:", data);
            
            // Update game status - do this first to ensure correct button visibility
            if (data.status) {
                console.log(`Server sent game status: ${data.status}`);
                this.setGameStatus(data.status);
            }
            
            // Update status message
            if (data.message) {
                this.updateStatus(data.message);
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
            
            // After all updates, ensure buttons are correctly displayed
            this.updateButtonVisibility();
        } catch (error) {
            console.error('Error updating game state:', error);
            this.showError('حدث خطأ في تحديث حالة اللعبة');
        }
    }
    
    // New method to handle game state transitions consistently
    setGameStatus(newStatus) {
        const playerName = document.getElementById('player-name').value;
        const currentPlayer = document.getElementById('current-turn').textContent;
        
        console.log(`Game status changing from ${this.gameStatus} to ${newStatus}`);
        console.log(`Current player: ${currentPlayer}, My name: ${playerName}`);
        
        // Only update status if it's actually changing
        if (this.gameStatus !== newStatus) {
            this.gameStatus = newStatus;
            console.log(`Game status updated to: ${this.gameStatus}`);
            
            // Update button visibility whenever game status changes
            this.updateButtonVisibility();
        }
    }
    
    // New method to update button visibility based on game status
    updateButtonVisibility() {
        // Get all button elements
        const readyButton = document.getElementById('readyButton');
        const guessButton = document.getElementById('guessButton');
        const startButton = document.getElementById('startButton');
        const nextButton = document.getElementById('nextButton');
        const revealButton = document.getElementById('revealButton');
        const passButton = document.getElementById('passButton');
        
        // Get player information
        const playerName = document.getElementById('player-name').value;
        const currentPlayer = document.getElementById('current-turn').textContent;
        const isHost = document.getElementById('is-host').value === 'true';
        
        console.log(`updateButtonVisibility - Game status: ${this.gameStatus}, Player: ${playerName}, Current Player: ${currentPlayer}, isHost: ${isHost}`);
        
        // Hide all buttons by default
        if (readyButton) readyButton.style.display = 'none';
        if (guessButton) guessButton.style.display = 'none';
        if (startButton) startButton.style.display = 'none';
        if (nextButton) nextButton.style.display = 'none';
        if (revealButton) revealButton.style.display = 'none';
        if (passButton) passButton.style.display = 'none';
        
        // Show appropriate buttons based on game state and player role
        switch (this.gameStatus) {
            case 'waiting':
                // Only host can start the game
                if (startButton && isHost) {
                    startButton.style.display = 'block';
                }
                break;
                
            case 'playing':
                // Current player sees the ready button
                if (readyButton && currentPlayer === playerName) {
                    readyButton.style.display = 'block';
                }
                
                // Host sees the next button when not in active round
                if (nextButton && isHost) {
                    nextButton.style.display = 'block';
                }
                break;
                
            case 'round_active':
                // Guessers see the guess button
                if (guessButton && currentPlayer !== playerName && !isHost) {
                    guessButton.style.display = 'block';
                }
                
                // Current player sees the pass button during active rounds
                if (passButton && currentPlayer === playerName) {
                    passButton.style.display = 'block';
                }
                
                // Host sees the reveal button during active rounds
                if (revealButton && isHost) {
                    revealButton.style.display = 'block';
                }
                break;
                
            case 'round_ended':
                // Host sees the next button
                if (nextButton && isHost) {
                    nextButton.style.display = 'block';
                }
                break;
                
            case 'game_ended':
                // No buttons shown at game end
                break;
                
            default:
                console.log(`Unknown game status: ${this.gameStatus}`);
        }
    }

    updateStatus(message) {
        const statusElement = document.getElementById('game-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    hideItemDisplay() {
        const itemDisplay = document.getElementById('item-display');
        
        // Update game status when hiding item display
        this.setGameStatus('waiting');
        
        if (itemDisplay) {
            itemDisplay.classList.remove('visible');
            setTimeout(() => {
                itemDisplay.style.display = 'none';
                itemDisplay.innerHTML = '';
            }, 300);
        }
    }
    
    displayItem(category, itemData) {
        const itemDisplay = document.getElementById('item-display');
        if (itemDisplay) {
            itemDisplay.style.display = 'block';
            // Extract item text from itemData
            const itemText = typeof itemData === 'object' ? itemData.item : itemData;
            
            // Create a more visually appealing display
            itemDisplay.innerHTML = `
                <div class="category">التصنيف: ${category || ''}</div>
                <div class="item">${itemText || ''}</div>
            `;
            
            // Add animation class after a short delay
            setTimeout(() => {
                itemDisplay.classList.add('visible');
            }, 100);
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
        } else {
            console.error('Error:', message);
            alert(message);
        }
    }
    
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
            console.log('Timer stopped and interval cleared');
        }
        
        // Reset timer display
        const timerDisplay = document.getElementById('timer');
        if (timerDisplay) {
            timerDisplay.textContent = '0:00';
            timerDisplay.classList.remove('warning', 'danger');
            console.log('Timer display reset to 0:00');
        }
        
        // Log the current game state for debugging
        console.log('Game state after stopping timer:', {
            gameId: this.gameId,
            status: this.gameStatus,
            playerName: this.playerName,
            isTimerRunning: this.timerInterval !== null
        });
    }

    updateCurrentPlayer(player) {
        const currentTurn = document.getElementById('current-turn');
        const readyButton = document.getElementById('readyButton');
        const guessButton = document.getElementById('guessButton');
        const itemDisplay = document.getElementById('item-display');
        const playerName = document.getElementById('player-name').value;
        
        if (currentTurn) {
            currentTurn.textContent = player;
        }

        // Update button visibility based on current player and game status
        this.updateButtonVisibility();

        // Show/hide item display based on if it's our turn
        if (itemDisplay) {
            if (player === playerName) {
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

    updatePlayersList(players) {
        const playersListElement = document.getElementById('players-list');
        const currentPlayerName = document.getElementById('player-name').value;
        
        if (playersListElement && Array.isArray(players)) {
            const playersList = playersListElement.querySelector('ul') || document.createElement('ul');
            
            // Clear existing list
            playersList.innerHTML = '';
            
            // Add players to list
            players.forEach(player => {
                const playerName = typeof player === 'object' ? player.name : player;
                const isHost = typeof player === 'object' ? player.isHost : false;
                const isCurrentPlayer = playerName === currentPlayerName;
                
                const li = document.createElement('li');
                li.className = `player-item${isCurrentPlayer ? ' current-player' : ''}`;
                li.textContent = playerName;
                
                if (isHost) {
                    li.classList.add('host');
                    li.textContent += ' 👑';
                }
                
                if (isCurrentPlayer) {
                    li.textContent += ' (أنت)';
                }
                
                playersList.appendChild(li);
            });
            
            // Make sure the list is in the DOM
            if (!playersListElement.contains(playersList)) {
                playersListElement.innerHTML = '';
                playersListElement.appendChild(playersList);
            }
        }
    }

    cleanup() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }

    updateHostUI() {
        // Update UI elements specific to host
        const hostControls = document.querySelectorAll('.host-only');
        hostControls.forEach(element => {
            element.style.display = this.isHost ? 'block' : 'none';
        });
        
        // Update any host-specific buttons or controls
        const startButton = document.getElementById('start-game-btn');
        if (startButton) {
            startButton.style.display = this.isHost ? 'block' : 'none';
        }
    }

    startTimer(duration) {
        // Clear any existing timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
            console.log('Cleared existing timer');
        }
        
        const timerDisplay = document.getElementById('timer');
        if (!timerDisplay) {
            console.error('Timer display element not found');
            return;
        }
        
        // Update game status to active round
        this.setGameStatus('round_active');
        
        let timeLeft = duration;
        console.log(`Starting new timer with duration: ${duration} seconds`);
        
        const formatTime = (seconds) => {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        };
        
        // Update timer immediately
        timerDisplay.textContent = formatTime(timeLeft);
        timerDisplay.style.display = 'block';
        
        // Remove any existing classes
        timerDisplay.classList.remove('warning', 'danger');
        
        // Start interval
        this.timerInterval = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = formatTime(timeLeft);
            
            // Add visual cues when time is running low
            if (timeLeft <= 30 && timeLeft > 10) {
                timerDisplay.classList.add('warning');
                timerDisplay.classList.remove('danger');
            } else if (timeLeft <= 10) {
                timerDisplay.classList.remove('warning');
                timerDisplay.classList.add('danger');
            }
            
            if (timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
                
                // Reset timer display to show 0:00
                timerDisplay.textContent = '0:00';
                
                // Update game status when timer ends
                this.setGameStatus('round_ended');
                
                // Log for debugging
                console.log('Timer reached zero, emitting round_timeout event to server');
                
                // Emit the round_timeout event to the server
                this.socket.emit('round_timeout', {
                    game_id: this.gameId
                });
                
                // Play timeout sound for local feedback
                try {
                    this.timeoutSound.play().catch(err => console.log('Error playing timeout sound:', err));
                } catch (err) {
                    console.log('Error playing timeout sound:', err);
                }
                
                // Log the current game state for debugging
                console.log('Current game state after timeout:', {
                    gameId: this.gameId,
                    status: this.gameStatus,
                    playerName: this.playerName
                });
            }
        }, 1000);
    }

    playTimeoutTwice() {
        try {
            this.timeoutSound.play();
            this.timeoutSound.currentTime = 0; // Reset to start
            setTimeout(() => {
                try {
                    this.timeoutSound.play();
                } catch (err) {
                    console.log('Error playing second timeout sound:', err);
                }
            }, 1000); // Play second sound after 1 second
        } catch (err) {
            console.log('Error playing first timeout sound:', err);
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
            .map(player => {
                const playerName = typeof player === 'object' ? player.name : player;
                const isHost = typeof player === 'object' ? player.isHost : false;
                const isCurrentPlayer = playerName === currentPlayerName;
                
                let playerHtml = `<li class="player-item ${isCurrentPlayer ? 'current-player' : ''}">${playerName}`;
                playerHtml += isHost ? ' 👑' : '';
                playerHtml += isCurrentPlayer ? ' (أنت)' : '';
                playerHtml += '</li>';
                return playerHtml;
            })
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

function updatePlayerList(players) {
    console.log('Updating player list with:', players);
    const playerList = document.querySelector('.players-list ul');
    if (!playerList) return;
    
    playerList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        const playerName = typeof player === 'object' ? player.name : player;
        const isHost = typeof player === 'object' ? player.isHost : false;
        const isCurrentPlayer = playerName === document.getElementById('player-name').value;
        
        // Add current player class if applicable
        if (isCurrentPlayer) {
            li.classList.add('current-player');
        }
        
        // Set player name
        li.textContent = playerName;
        
        // Add host indicator if applicable
        if (isHost) {
            li.classList.add('host');
            li.textContent += ' 👑';
        }
        
        // Add current player indicator
        if (isCurrentPlayer) {
            li.textContent += ' (أنت)';
        }
        
        playerList.appendChild(li);
    });
}

function updateCurrentPlayer(player) {
    const currentTurn = document.getElementById('current-turn');
    const readyButton = document.getElementById('readyButton');
    const guessButton = document.getElementById('guessButton');
    const itemDisplay = document.getElementById('item-display');
    const playerName = document.getElementById('player-name').value;
    const isHost = document.getElementById('is-host').value === 'true';
    
    if (currentTurn) {
        currentTurn.textContent = player;
    }

    // Update button visibility based on current player and game status
    this.updateButtonVisibility();

    // Show/hide item display based on if it's our turn
    if (itemDisplay) {
        if (player === playerName) {
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
        // Hide ready button once timer starts
        const readyButton = document.getElementById('readyButton');
        if (readyButton) {
            readyButton.style.display = 'none';
        }
        
        // Show guess button for non-current players
        const guessButton = document.getElementById('guessButton');
        const playerName = document.getElementById('player-name').value;
        const currentPlayer = document.getElementById('current-turn').textContent;
        const isHost = document.getElementById('is-host').value === 'true';
        
        if (guessButton && !isHost && currentPlayer !== playerName && currentPlayer !== '') {
            guessButton.style.display = 'block';
        }
        
        let timeLeft = duration;
        timerElement.textContent = `الوقت المتبقي: ${timeLeft} ثانية`;
        window.charadesGame.timerInterval = setInterval(() => {
            timeLeft--;
            timerElement.textContent = `الوقت المتبقي: ${timeLeft} ثانية`;
            if (timeLeft <= 0) {
                clearInterval(window.charadesGame.timerInterval);
                window.charadesGame.timerInterval = null;
            }
        }, 1000);
    }
}

function stopTimer() {
    if (window.charadesGame && window.charadesGame.timerInterval) {
        clearInterval(window.charadesGame.timerInterval);
        window.charadesGame.timerInterval = null;
        
        // Also reset the timer display when stopping
        const timerDisplay = document.getElementById('timer');
        if (timerDisplay) {
            timerDisplay.textContent = '0:00';
            timerDisplay.classList.remove('warning', 'danger');
            timerDisplay.style.display = 'none';
        }
        
        console.log('Timer stopped and reset');
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
