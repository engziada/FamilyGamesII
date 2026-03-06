"""
Integration tests for Rapid Fire (الأسئلة السريعة) socket events.
Tests the full game flow through Flask-SocketIO.
"""
import pytest


class TestRapidFireIntegration:
    """Integration tests for Rapid Fire game flow via SocketIO."""

    def test_create_game_success(self, app, socket_client, game_rooms):
        """Host creates a Rapid Fire game successfully."""
        socket_client.emit('create_game', {
            'game_id': 'rf1234',
            'player_name': 'host',
            'game_type': 'rapid_fire',
            'settings': {'teams': False, 'time_limit': 30}
        })

        received = socket_client.get_received()
        events = [r['name'] for r in received]
        assert 'game_created' in events

        # Verify game was created
        assert 'rf1234' in game_rooms
        assert game_rooms['rf1234'].game_type == 'rapid_fire'

    def test_join_game_success(self, app, socket_client, game_rooms):
        """Player joins an existing Rapid Fire game."""
        from games.rapid_fire.models import RapidFireGame

        # Create game first
        game = RapidFireGame('rf1234', 'host')
        game_rooms['rf1234'] = game

        # Player joins
        socket_client.emit('join_game', {
            'game_id': 'rf1234',
            'player_name': 'player2'
        })

        received = socket_client.get_received()
        events = [r['name'] for r in received]
        assert 'join_success' in events
        assert 'player_joined' in events

        # Verify player was added
        assert len(game.players) == 2

    def test_join_game_room_full(self, app, socket_client, game_rooms):
        """Trying to join a full room (8 players) is rejected."""
        from games.rapid_fire.models import RapidFireGame

        game = RapidFireGame('rf1234', 'host')
        # Add 7 more players
        for i in range(7):
            game.add_player(f'p{i}')
        game_rooms['rf1234'] = game

        socket_client.emit('join_game', {
            'game_id': 'rf1234',
            'player_name': 'extra'
        })

        received = socket_client.get_received()
        error_events = [r for r in received if r['name'] == 'error']
        assert len(error_events) > 0

    def test_start_game_min_players(self, app, socket_client, game_rooms):
        """Need at least 2 players to start."""
        from games.rapid_fire.models import RapidFireGame

        game = RapidFireGame('rf1234', 'host')  # only 1 player
        game_rooms['rf1234'] = game

        socket_client.emit('start_game', {'game_id': 'rf1234'})

        received = socket_client.get_received()
        error_events = [r for r in received if r['name'] == 'error']
        assert len(error_events) > 0

    def test_start_game_success(self, app, socket_client, game_rooms):
        """Game starts successfully with 2 players."""
        from games.rapid_fire.models import RapidFireGame

        game = RapidFireGame('rf1234', 'host')
        game.add_player('player2')
        game_rooms['rf1234'] = game

        socket_client.emit('start_game', {'game_id': 'rf1234'})

        received = socket_client.get_received()
        events = [r['name'] for r in received]
        assert 'game_started' in events

    def test_buzz_in_socket(self, app, socket_client, game_rooms):
        """Player buzzes in and event is broadcast."""
        from games.rapid_fire.models import RapidFireGame

        game = RapidFireGame('rf1234', 'host')
        game.add_player('player2')
        game.start_game()
        game_rooms['rf1234'] = game

        socket_client.emit('verify_game', {
            'game_id': 'rf1234',
            'player_name': 'host'
        })

        # Clear initial events
        socket_client.get_received()

        socket_client.emit('buzz_in', {'game_id': 'rf1234'})

        received = socket_client.get_received()
        events = [r['name'] for r in received]
        assert 'player_buzzed' in events or 'game_state' in events

    def test_game_state_broadcasts(self, app, socket_client, game_rooms):
        """Game state is broadcast to all players."""
        from games.rapid_fire.models import RapidFireGame

        game = RapidFireGame('rf1234', 'host')
        game.add_player('player2')
        game_rooms['rf1234'] = game

        socket_client.emit('verify_game', {
            'game_id': 'rf1234',
            'player_name': 'host'
        })

        received = socket_client.get_received()
        state_events = [r for r in received if r['name'] == 'game_state']
        assert len(state_events) > 0
        assert state_events[0]['args'][0]['game_type'] == 'rapid_fire'
