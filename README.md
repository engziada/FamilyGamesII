# Family Games II

A modern web-based platform for family-friendly multiplayer games, starting with the classic Charades game.

## Project Description
A Flask-based web application that allows families and friends to play games together in real-time. The first game implemented is Charades (بدون كلام), where players take turns acting out words while others try to guess them.

## Requirements
- Python 3.8+
- Flask
- Flask-SocketIO
- eventlet
- Additional requirements in `requirements.txt`

## Project Structure
```
FamilyGamesII/
├── app.py                 # Main Flask application entry point
├── requirements.txt       # Python package dependencies
├── games/                 # Game modules directory
│   └── charades/         # Charades game module
│       ├── __init__.py
│       ├── models.py     # Game data models and logic
│       └── routes.py     # Game-specific routes and socket events
├── static/
│   ├── css/
│   │   └── style.css    # Main stylesheet
│   ├── js/
│   │   ├── game.js      # Game-specific JavaScript
│   │   └── game-lobby.js # Lobby and game creation logic
│   └── data/
│       └── charades_items.json # Game items database
├── templates/
│   ├── base.html        # Base template
│   ├── index.html       # Landing page
│   ├── lobby.html       # Game lobby
│   └── game.html        # Game interface
└── Log/                  # Application logs (gitignored)
```

## Features
1. Real-time Multiplayer
   - Socket.IO for real-time communication
   - Multiple players in the same game room
   - Host/Guest player roles

2. Game Management
   - Create/Join game rooms
   - Unique room IDs
   - Player score tracking
   - Round-based gameplay

3. User Interface
   - Modern, responsive design
   - Arabic language support
   - Real-time score updates
   - Timer-based rounds

4. Game Flow
   - Lobby system for game setup
   - Turn-based gameplay
   - Score calculation based on time
   - Round management by host

## Checkpoints

### Checkpoint 1 (2025-02-02 22:56)
- Refactored game code into modular structure
- Moved game logic to dedicated charades module
- Enhanced URL parameters for player tracking
- Improved error handling and logging
- Updated templates for conditional rendering
- Command to revert: `git checkout 6e9a0d2`

### Checkpoint 2 (2025-02-22 02:30)
- Enhanced game screen UI/UX
- Improved WebSocket connection handling
- Fixed player session management
- Added responsive design for mobile devices
- Enhanced visual feedback and animations
- Improved Arabic text rendering
- Command to revert: `git checkout $(git rev-parse HEAD)`

### Checkpoint 3 (2025-02-23 00:37)
- Enhanced player identification in game UI
- Added visual indicators for current player's turn
- Improved player list display with own player marking
- Enhanced score display with player highlighting
- Added smooth transitions for state changes
- Improved game status visibility
- Command to revert: `git checkout $(git rev-parse HEAD)`

### Checkpoint 4 (2025-02-24 00:06)
- Fixed item display for current player's turn
- Enhanced game state synchronization
- Improved item and category visibility handling
- Fixed parameter order in displayItem function
- Updated player turn management
- Added proper display toggling for game items
- Command to revert: `git checkout $(git rev-parse HEAD)`

### Checkpoint 5 (2025-02-24 02:45)
- Implemented proper timer display in minutes:seconds format (e.g. "2:00" instead of 120)
- Timer now shows countdown properly for all players
- Timer triggers round end and player switch when time is up
- Successfully tested timer synchronization between players
- To revert to this checkpoint:
```powershell
git checkout checkpoint-5
```

## Development Guidelines
1. Code Style
   - Clean, Pythonic code
   - Comprehensive documentation
   - Meaningful variable names
   - Descriptive error messages

2. Architecture
   - Modular design
   - Separation of concerns
   - Client-side validation
   - Minimal JavaScript usage

3. Version Control
   - Regular Git commits
   - Checkpoint system
   - Log folder in .gitignore

4. Error Handling
   - User-friendly error messages
   - Comprehensive logging
   - Graceful fallbacks
