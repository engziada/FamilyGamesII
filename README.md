# Family Games II

A modern web-based platform for family-friendly multiplayer games with real-time gameplay.

## Project Description
A Flask-based web application that allows families and friends to play games together in real-time. Features seven game modes:
- **Charades (بدون كلام)**: Players act out items while others guess
- **Pictionary (تعاضل)**: Players draw items while others guess
- **Trivia (بنك المعلومات)**: Multiple-choice trivia questions with AI translation
- **Bus Complete (أتوبيس كومبليت)**: Fill-in-the-blank word game with letter categories
- **Rapid Fire (الأسئلة السريعة)**: Fast-paced trivia where players buzz in to answer
- **Twenty Questions (العشرين سؤال)**: Guess the secret word by asking yes/no questions
- **Riddles (الألغاز)**: Solve riddles by buzzing in with the correct answer

## Requirements
- Python 3.11+
- Flask + Flask-SocketIO
- eventlet (async I/O)
- SQLAlchemy (data management)
- Groq API key (for trivia translation)
- Additional requirements in `requirements.txt`

## Project Structure
```
FamilyGamesII/
├── app.py                 # Main Flask application entry point
├── config.py              # Production configuration
├── requirements.txt       # Python package dependencies
├── .env.example          # Environment variables template
├── DEPLOYMENT.md         # Production deployment guide
├── games/                 # Game modules directory
│   ├── charades/         # Charades game module
│   │   ├── models.py     # Game logic
│   │   └── routes.py     # Socket events
│   ├── pictionary/       # Pictionary game module
│   │   └── models.py     # Game logic
│   ├── trivia/           # Trivia game module
│   │   ├── models.py     # Game logic
│   │   └── questions.json # Question bank
│   ├── bus_complete/     # Bus Complete game module
│   │   └── models.py     # Game logic
│   ├── rapid_fire/       # Rapid Fire game module
│   │   └── models.py     # Game logic
│   ├── twenty_questions/ # Twenty Questions game module
│   │   └── models.py     # Game logic
│   └── riddles/          # Riddles game module
│       └── models.py     # Game logic
├── services/             # Data management services
│   ├── data_service.py   # Main data service
│   ├── data_manager.py   # Database operations
│   └── fetchers/         # Content fetchers
│       ├── charades_fetcher.py
│       ├── pictionary_fetcher.py
│       └── trivia_fetcher.py
├── models/               # Data models
│   └── game_items.py     # SQLAlchemy models
├── static/
│   ├── css/
│   │   └── style.css     # Main stylesheet
│   ├── js/
│   │   └── charades.js   # Game logic & UI
│   ├── sounds/           # Audio files
│   └── data/             # Static game data
├── templates/
│   ├── base.html         # Base template
│   ├── index.html        # Landing page
│   └── game.html         # Game interface
├── Log/                  # Application logs (gitignored)
└── game_data.db          # SQLite database (gitignored)
```

## Features

### 1. Seven Game Modes

- **Charades**: 70+ items across multiple categories
- **Pictionary**: 400+ items with drawing canvas and category hints
- **Trivia**: 150+ questions with AI-powered Arabic translation
- **Bus Complete**: Fill-in-the-blank word game with 7 categories and AI validation
- **Rapid Fire**: Fast-paced trivia with buzz-in mechanics and scoring
- **Twenty Questions**: Word guessing game with yes/no questions (50+ Arabic words)
- **Riddles**: 50+ Arabic riddles with buzz-to-answer mechanics

### 2. Real-time Multiplayer
   - Socket.IO for real-time communication
   - Multiple players in the same game room
   - Host/Guest player roles
   - Team mode support

### 3. Smart Data Management
   - SQLite database with 620+ total items
   - Automatic caching and pre-fetching
   - No item repetition within rooms
   - Usage tracking and analytics
   - Automatic cleanup on game end

### 4. Game Management
   - Create/Join game rooms with unique IDs
   - Player score tracking (individual + team)
   - Round-based gameplay with timer
   - Difficulty levels (easy/medium/hard)
   - Host controls (force next, close room)

### 5. User Interface
   - Modern, playful design with animations
   - Full Arabic language support (RTL)
   - Real-time score updates
   - Timer with visual warnings
   - Sound effects for game events
   - Responsive design for mobile/desktop

### 6. Pictionary Features
   - HTML5 canvas for drawing
   - Color picker and brush size controls
   - Real-time stroke synchronization
   - Category hints (difficulty-based)
   - Clear canvas functionality

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
