# ألعاب العيلة (Family Games)

A real-time multiplayer game platform built with Flask and Socket.IO, featuring Arabic interface.

## Features

- Real-time multiplayer gaming using Socket.IO
- Arabic interface for better accessibility
- Session-based game rooms
- Multiple game modes (currently featuring "بدون كلام" / Charades)
- Responsive design for all devices

## Project Structure

```
FamilyGamesII/
├── app.py                 # Main Flask application
├── games/                 # Game modules
│   ├── __init__.py
│   └── charades/         # Charades game implementation
│       ├── __init__.py
│       ├── models.py     # Game models and logic
│       └── routes.py     # Game-specific routes
├── static/
│   ├── css/             # Stylesheets
│   ├── js/              # Client-side JavaScript
│   └── images/          # Game images and assets
├── templates/           # HTML templates
│   ├── base.html       # Base template
│   ├── index.html      # Home page
│   └── game.html       # Game interface
└── Log/                # Application logs (gitignored)
```

## Setup and Installation

1. Create a Python virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the application:
```bash
python app.py
```

## Development

The application uses:
- Flask for the web framework
- Socket.IO for real-time communication
- SQLite for data storage
- Vanilla JavaScript for frontend interactions

## Checkpoints

### Checkpoint 8 (2025-02-01 19:48:51)
- Fixed game room connection issues:
  - Implemented proper transfer ID handling for each player
  - Fixed session management and player state tracking
  - Improved error handling for game room operations
  - Added player-specific game state management
  - Enhanced game start logic with individual player states

To revert to this checkpoint:
```bash
git checkout checkpoint-8
```
