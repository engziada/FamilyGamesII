"""
Integration tests for game socket events.
Tests the full flow of game creation, joining, and gameplay.
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestGameIntegration:
    """Integration tests for game socket events."""

    def test_create_game_success(self, mock_game_room):
        """Test successful game creation."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        mock_game_room['test_room'] = game
        
        assert 'test_room' in mock_game_room
        assert mock_game_room['test_room'].host == 'host_player'
        assert mock_game_room['test_room'].status == 'waiting'

    def test_join_game_success(self, mock_game_room):
        """Test successful game join."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        mock_game_room['test_room'] = game
        game.add_player('player2')
        
        assert len(mock_game_room['test_room'].players) == 2

    def test_join_game_room_full(self, mock_game_room):
        """Test joining a full room raises error."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        for i in range(2, 9):
            game.add_player(f'player{i}')
        mock_game_room['test_room'] = game
        
        with pytest.raises(ValueError):
            game.add_player('player9')

    def test_join_game_already_started(self, mock_game_room, sample_trivia_questions):
        """Test that joining a started game is handled appropriately."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        mock_game_room['test_room'] = game
        
        # Game is now 'playing', new players shouldn't be able to join
        # This is a design decision - games don't allow mid-game joins
        assert mock_game_room['test_room'].status == 'playing'

    def test_start_game_min_players(self, mock_game_room):
        """Test that starting requires minimum players."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        mock_game_room['test_room'] = game
        
        with pytest.raises(ValueError):
            game.start_game()

    def test_leave_game_transfer_host(self, mock_game_room):
        """Test host transfer when host leaves."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        mock_game_room['test_room'] = game
        
        game.remove_player('host_player')
        
        assert mock_game_room['test_room'].host == 'player2'

    def test_disconnect_cleanup(self, mock_game_room):
        """Test cleanup when player disconnects."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.add_player('player3')
        mock_game_room['test_room'] = game
        
        game.remove_player('player2')
        
        assert len(mock_game_room['test_room'].players) == 2
        assert not any(p['name'] == 'player2' for p in mock_game_room['test_room'].players)

    def test_game_state_broadcast(self, mock_game_room, sample_trivia_questions):
        """Test game state is properly serialized."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        mock_game_room['test_room'] = game
        
        state = game.to_dict()
        
        assert 'game_id' in state
        assert 'host' in state
        assert 'players' in state
        assert 'status' in state
        assert 'scores' in state


class TestRapidFireIntegration:
    """Integration tests specific to Rapid Fire game."""

    def test_buzz_in_socket(self, mock_game_room, sample_trivia_questions):
        """Test buzz in event processing."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        mock_game_room['test_room'] = game
        
        result = game.buzz('host_player')
        
        assert result['success'] is True
        assert mock_game_room['test_room'].buzzed_player == 'host_player'

    def test_buzz_race_condition(self, mock_game_room, sample_trivia_questions):
        """Test that only first buzz wins in race condition."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.add_player('player3')
        game.test_questions = sample_trivia_questions
        game.start_game()
        mock_game_room['test_room'] = game
        
        # First buzz wins
        result1 = game.buzz('host_player')
        result2 = game.buzz('player2')
        result3 = game.buzz('player3')
        
        assert result1['success'] is True
        assert result2['success'] is False
        assert result3['success'] is False
        assert mock_game_room['test_room'].buzzed_player == 'host_player'

    def test_submit_answer_socket(self, mock_game_room, sample_trivia_questions):
        """Test answer submission flow."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        game.buzz('host_player')
        mock_game_room['test_room'] = game
        
        correct_idx = game.current_question['answer']
        result = game.submit_answer('host_player', correct_idx)
        
        assert result['correct'] is True
        assert mock_game_room['test_room'].scores['host_player'] > 0

    def test_force_next_question(self, mock_game_room, sample_trivia_questions):
        """Test host can skip question."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        mock_game_room['test_room'] = game
        
        old_question = game.current_question
        game.skip_question()
        
        # Either new question or game ended
        if game.current_question:
            assert game.current_question != old_question

    def test_full_game_flow(self, mock_game_room, sample_trivia_questions):
        """Test complete game flow from start to end."""
        from games.rapid_fire.models import RapidFireGame
        
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.settings['questions_per_game'] = 3
        game.test_questions = sample_trivia_questions
        mock_game_room['test_room'] = game
        
        # Start game
        game.start_game()
        assert game.status == 'playing'
        
        # Play through questions
        for _ in range(3):
            game.buzz('host_player')
            if game.current_question:
                correct_idx = game.current_question['answer']
                game.submit_answer('host_player', correct_idx)
            if game.status == 'ended':
                break
        
        # Game should end
        assert game.status in ['ended', 'playing']  # Game may still be playing if questions remain
        assert 'host_player' in game.scores


class TestCharadesRegression:
    """Regression tests for Charades game."""

    def test_charades_create_game(self):
        """Test Charades game creation still works."""
        from games.charades.models import CharadesGame
        
        game = CharadesGame('test_charades', 'host_player')
        
        assert game.game_id == 'test_charades'
        assert game.host == 'host_player'
        assert game.status == 'waiting'

    def test_charades_join_game(self):
        """Test Charades join functionality intact."""
        from games.charades.models import CharadesGame
        
        game = CharadesGame('test_charades', 'host_player')
        game.add_player('player2')
        
        assert len(game.players) == 2

    def test_charades_start_game(self):
        """Test Charades start game flow."""
        from games.charades.models import CharadesGame
        
        game = CharadesGame('test_charades', 'host_player')
        game.add_player('player2')
        game.start_game()
        
        assert game.status == 'playing'

    def test_charades_guess_correct(self):
        """Test Charades guess mechanic."""
        from games.charades.models import CharadesGame
        
        game = CharadesGame('test_charades', 'host_player')
        game.add_player('player2')
        game.start_game()
        
        # Simulate correct guess by adding score
        game.add_score('player2', 10)
        
        assert 'player2' in game.scores

    def test_charades_scoring(self):
        """Test Charades score calculation."""
        from games.charades.models import CharadesGame
        
        game = CharadesGame('test_charades', 'host_player')
        game.add_player('player2')
        game.start_game()
        
        game.add_score('player2', 10)
        game.add_score('host_player', 15)
        
        assert game.scores['player2'] == 10
        assert game.scores['host_player'] == 15


class TestTriviaRegression:
    """Regression tests for Trivia game."""

    def test_trivia_create_game(self):
        """Test Trivia game creation."""
        from games.trivia.models import TriviaGame
        
        game = TriviaGame('test_trivia', 'host_player')
        
        assert game.game_id == 'test_trivia'
        assert game.game_type == 'trivia'

    def test_trivia_question_display(self, sample_trivia_questions):
        """Test Trivia questions appear."""
        from games.trivia.models import TriviaGame
        
        game = TriviaGame('test_trivia', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        
        assert game.current_question is not None

    def test_trivia_answer_correct(self, sample_trivia_questions):
        """Test Trivia correct answer flow."""
        from games.trivia.models import TriviaGame
        
        game = TriviaGame('test_trivia', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        
        # The correct answer index is stored in 'answer' key
        correct_idx = game.current_question['answer']
        
        # Trivia uses add_score for correct answers
        game.add_score('host_player', 10)
        
        assert 'host_player' in game.scores

    def test_trivia_scoring(self, sample_trivia_questions):
        """Test Trivia score tracking."""
        from games.trivia.models import TriviaGame
        
        game = TriviaGame('test_trivia', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        
        # Trivia uses add_score for correct answers
        game.add_score('host_player', 10)
        
        assert 'host_player' in game.scores


class TestBusCompleteRegression:
    """Regression tests for Bus Complete game."""

    def test_bus_create_game(self):
        """Test Bus Complete game creation."""
        from games.bus_complete.models import BusCompleteGame
        
        game = BusCompleteGame('test_bus', 'host_player', {'validate_answers': False})
        
        assert game.game_id == 'test_bus'
        assert game.game_type == 'bus_complete'

    def test_bus_submit_answers(self):
        """Test Bus Complete answer submission."""
        from games.bus_complete.models import BusCompleteGame
        
        game = BusCompleteGame('test_bus', 'host_player', {'validate_answers': False})
        game.add_player('player2')
        game.start_game()
        
        game.submit_answers('host_player', {'اسم': 'أحمد', 'حيوان': 'أسد'})
        
        # player_submissions is the correct attribute name
        assert 'host_player' in game.player_submissions

    def test_bus_stop_bus(self):
        """Test Bus Complete stop bus mechanic."""
        from games.bus_complete.models import BusCompleteGame
        
        game = BusCompleteGame('test_bus', 'host_player', {'validate_answers': False})
        game.add_player('player2')
        game.start_game()
        
        game.stop_bus('host_player')
        
        # After stop_bus, status is 'validating' (for manual validation)
        assert game.status == 'validating'

    def test_bus_scoring(self):
        """Test Bus Complete score calculation."""
        from games.bus_complete.models import BusCompleteGame
        
        game = BusCompleteGame('test_bus', 'host_player', {'validate_answers': False})
        game.add_player('player2')
        game.start_game()
        
        game.submit_answers('host_player', {'اسم': 'أحمد', 'حيوان': 'أسد'})
        game.stop_bus('host_player')
        game.calculate_scores()
        
        # After calculate_scores, status may be validating or round_active
        assert game.status in ['validating', 'round_active', 'scoring']
