// Initialize socket connection
const socket = io();
let gameId = null;
let playerName = null;
let isHost = false;

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Get game data from server
    gameId = document.getElementById('game-id').value;
    playerName = document.getElementById('player-name').value;
    
    // Connection status handling
    socket.on('connect', () => {
        console.log('Connected to game server');
        document.getElementById('game-status').textContent = 'متصل';
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from game server');
        document.getElementById('game-status').textContent = 'غير متصل';
    });

    // Game event handlers
    socket.on('game_state', (data) => {
        console.log('Game state update:', data);
        updateGameState(data);
    });

    socket.on('player_list', (data) => {
        console.log('Player list update:', data);
        updatePlayerList(data.players);
    });

    socket.on('score_update', (data) => {
        console.log('Score update:', data);
        updateScores(data.scores);
    });

    socket.on('game_error', (error) => {
        console.error('Game error:', error);
        document.getElementById('game-status').textContent = error.message;
    });
});

// Game state update functions
function updateGameState(data) {
    const gameContent = document.getElementById('game-content');
    const gameControls = document.getElementById('game-controls');
    
    // Update game content based on state
    if (data.state === 'waiting') {
        gameContent.innerHTML = '<h2>في انتظار بدء اللعبة...</h2>';
    } else if (data.state === 'playing') {
        // Update game UI based on game type and role
        if (data.currentPlayer === playerName) {
            gameContent.innerHTML = `<h2>دورك يا ${playerName}!</h2>`;
        } else {
            gameContent.innerHTML = `<h2>دور ${data.currentPlayer}</h2>`;
        }
    }
}

function updatePlayerList(players) {
    const playersList = document.getElementById('players');
    playersList.innerHTML = players.map(player => 
        `<li>${player.name}${player.isHost ? ' (اللعيب الكبير)' : ''}</li>`
    ).join('');
}

function updateScores(scores) {
    const scoresDiv = document.getElementById('scores');
    scoresDiv.innerHTML = Object.entries(scores)
        .map(([name, score]) => `<li>${name}: ${score}</li>`)
        .join('');
}
