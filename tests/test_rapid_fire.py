"""
Unit tests for Rapid Fire game model.
"""
import pytest
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from games.rapid_fire.models import RapidFireGame


class TestRapidFireGame:
    """Test cases for RapidFireGame class."""

    def test_game_initialization(self):
        """Test game initializes with correct default values."""
        game = RapidFireGame('test_room', 'host_player')
        
        assert game.game_id == 'test_room'
        assert game.host == 'host_player'
        assert game.status == 'waiting'
        assert len(game.players) == 1
        assert game.players[0]['name'] == 'host_player'
        assert game.players[0]['isHost'] is True
        assert game.game_type == 'rapid_fire'
        assert game.current_question is None
        assert game.question_active is False
        assert game.buzzed_player is None

    def test_add_player(self):
        """Test adding players to the game."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        
        assert len(game.players) == 2
        assert game.players[1]['name'] == 'player2'
        assert game.players[1]['isHost'] is False

    def test_add_player_room_full(self):
        """Test that adding more than 8 players raises error."""
        game = RapidFireGame('test_room', 'host_player')
        for i in range(2, 9):
            game.add_player(f'player{i}')
        
        assert len(game.players) == 8
        
        with pytest.raises(ValueError, match="الغرفة ممتلئة"):
            game.add_player('player9')

    def test_add_duplicate_player(self):
        """Test that adding duplicate player raises error."""
        game = RapidFireGame('test_room', 'host_player')
        
        with pytest.raises(ValueError, match="اللاعب موجود بالفعل"):
            game.add_player('host_player')

    def test_remove_player(self):
        """Test removing a player from the game."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.remove_player('player2')
        
        assert len(game.players) == 1
        assert not any(p['name'] == 'player2' for p in game.players)

    def test_remove_host_transfers_host(self):
        """Test that removing host transfers host to another player."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        
        result = game.remove_player('host_player')
        
        assert result is True  # Host was transferred
        assert game.host == 'player2'
        assert game.players[0]['isHost'] is True

    def test_start_game(self, sample_trivia_questions):
        """Test starting the game."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        
        assert game.status == 'playing'
        assert game.current_question is not None
        assert game.question_active is True
        assert game.questions_asked == 1

    def test_start_game_insufficient_players(self):
        """Test that starting with less than 2 players raises error."""
        game = RapidFireGame('test_room', 'host_player')
        
        with pytest.raises(ValueError, match="عدد اللاعبين غير كافي"):
            game.start_game()

    def test_buzz_registers_first_player(self, sample_trivia_questions):
        """Test that first buzz is registered successfully."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        
        result = game.buzz('host_player')
        
        assert result['success'] is True
        assert game.buzzed_player == 'host_player'
        assert game.question_active is False  # Locked for others

    def test_buzz_rejected_after_first_buzz(self, sample_trivia_questions):
        """Test that subsequent buzzes are rejected."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        
        game.buzz('host_player')
        result = game.buzz('player2')
        
        assert result['success'] is False
        assert game.buzzed_player == 'host_player'

    def test_buzz_rejected_already_buzzed(self, sample_trivia_questions):
        """Test that same player can't buzz twice in same round."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        
        game.buzz('host_player')
        # Simulate wrong answer unlocking
        game.question_active = True
        game.buzzed_player = None
        
        result = game.buzz('host_player')
        
        assert result['success'] is False
        assert 'لقد ضغطت بالفعل' in result['message']

    def test_submit_answer_correct(self, sample_trivia_questions):
        """Test submitting correct answer."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        game.buzz('host_player')
        
        # Get the correct answer index
        correct_idx = game.current_question['answer']
        result = game.submit_answer('host_player', correct_idx)
        
        assert result['correct'] is True
        assert result['points'] > 0
        assert 'host_player' in game.scores
        assert game.scores['host_player'] > 0

    def test_submit_answer_wrong(self, sample_trivia_questions):
        """Test submitting wrong answer unlocks for others."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        game.buzz('host_player')
        
        # Submit wrong answer
        wrong_idx = (game.current_question['answer'] + 1) % 4
        result = game.submit_answer('host_player', wrong_idx)
        
        assert result['correct'] is False
        assert game.question_active is True  # Unlocked for others
        assert game.buzzed_player is None

    def test_buzz_timeout(self, sample_trivia_questions):
        """Test buzz timeout unlocks for other players."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        game.buzz('host_player')
        
        result = game.buzz_timeout()
        
        assert result['unlocked'] is True
        assert game.buzzed_player is None
        assert game.question_active is True

    def test_next_question_resets_state(self, sample_trivia_questions):
        """Test that next_question resets buzz state."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        game.buzz('host_player')
        
        game.next_question()
        
        assert game.buzzed_player is None
        assert game.players_answered == set()
        assert game.question_active is True

    def test_game_ends_after_max_questions(self, sample_trivia_questions):
        """Test game ends after all questions asked."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.settings['questions_per_game'] = 2
        game.test_questions = sample_trivia_questions
        game.start_game()
        
        # Answer first question
        game.next_question()
        # Answer second question
        result = game.next_question()
        
        # Should be None after max questions
        assert result is None
        assert game.status == 'ended'

    def test_to_dict_hides_answer(self, sample_trivia_questions):
        """Test that to_dict hides the answer by default."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        
        state = game.to_dict()
        
        assert state['current_question'] is not None
        assert 'answer' not in state['current_question']
        assert 'answer_text' not in state['current_question']

    def test_to_dict_includes_answer_when_requested(self, sample_trivia_questions):
        """Test that to_dict includes answer when requested."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        
        state = game.to_dict(include_answer=True)
        
        assert 'answer' in state['current_question']
        assert 'answer_text' in state['current_question']

    def test_points_calculation_quick_answer(self, sample_trivia_questions):
        """Test that quick answer (<=3s) gives 10 points."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        game.buzz('host_player')
        
        # Simulate quick answer by not waiting
        correct_idx = game.current_question['answer']
        result = game.submit_answer('host_player', correct_idx)
        
        # Should be 10 points for quick answer (elapsed <= 3s)
        assert result['points'] == 10

    def test_transfer_host(self):
        """Test host transfer functionality."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        
        game.transfer_host('player2')
        
        assert game.host == 'player2'
        assert game.players[1]['isHost'] is True
        assert game.players[0]['isHost'] is False

    def test_from_dict_reconstruction(self, sample_trivia_questions):
        """Test game reconstruction from dictionary."""
        game = RapidFireGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_questions = sample_trivia_questions
        game.start_game()
        
        state = game.to_dict(include_answer=True)
        reconstructed = RapidFireGame.from_dict('test_room', state)
        
        assert reconstructed.game_id == game.game_id
        assert reconstructed.host == game.host
        assert reconstructed.status == game.status
        assert len(reconstructed.players) == len(game.players)
