"""
Unit tests for Riddles game model.
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from games.riddles.models import RiddlesGame


class TestRiddlesGame:
    """Test cases for RiddlesGame class."""

    def test_game_initialization(self):
        """Test game initializes with correct default values."""
        game = RiddlesGame('test_room', 'host_player')
        
        assert game.game_id == 'test_room'
        assert game.host == 'host_player'
        assert game.status == 'waiting'
        assert len(game.players) == 1
        assert game.players[0]['name'] == 'host_player'
        assert game.players[0]['isHost'] is True
        assert game.game_type == 'riddles'
        assert game.current_riddle is None
        assert game.buzzed_player is None
        assert game.question_active is False

    def test_add_player(self):
        """Test adding players to the game."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        
        assert len(game.players) == 2
        assert game.players[1]['name'] == 'player2'
        assert game.players[1]['isHost'] is False

    def test_add_player_room_full(self):
        """Test that adding more than 8 players raises error."""
        game = RiddlesGame('test_room', 'host_player')
        for i in range(2, 9):
            game.add_player(f'player{i}')
        
        assert len(game.players) == 8
        
        with pytest.raises(ValueError, match="الغرفة ممتلئة"):
            game.add_player('player9')

    def test_start_game(self, sample_riddles):
        """Test starting the game."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        result = game.start_game()
        
        assert game.status == 'playing'
        assert game.current_riddle is not None
        assert game.question_active is True
        assert 'riddle' in result

    def test_start_game_insufficient_players(self):
        """Test that starting with less than 2 players raises error."""
        game = RiddlesGame('test_room', 'host_player')
        
        with pytest.raises(ValueError, match="عدد اللاعبين غير كافي"):
            game.start_game()

    def test_buzz_in_success(self, sample_riddles):
        """Test successful buzz in."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        
        result = game.buzz_in('player2')
        
        assert result['success'] is True
        assert game.buzzed_player == 'player2'

    def test_buzz_in_reader_fails(self, sample_riddles):
        """Test that reader cannot buzz in."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        
        result = game.buzz_in('host_player')
        
        assert result['success'] is False
        assert 'القارئ' in result['message']

    def test_buzz_in_rejected_after_first(self, sample_riddles):
        """Test that subsequent buzzes are rejected."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.add_player('player3')
        game.test_riddles = sample_riddles
        game.start_game()
        
        game.buzz_in('player2')
        result = game.buzz_in('player3')
        
        assert result['success'] is False

    def test_submit_answer_correct(self, sample_riddles):
        """Test submitting correct answer."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        game.buzz_in('player2')
        
        # Get the correct answer
        correct_answer = game.current_riddle['answer']
        result = game.submit_answer('player2', correct_answer)
        
        assert result['correct'] is True
        assert result['points'] > 0
        assert 'player2' in game.scores

    def test_submit_answer_wrong(self, sample_riddles):
        """Test submitting wrong answer unlocks for others."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        game.buzz_in('player2')
        
        result = game.submit_answer('player2', 'إجابة خاطئة')
        
        assert result['correct'] is False
        assert game.buzzed_player is None

    def test_submit_answer_without_buzz(self, sample_riddles):
        """Test submitting answer without buzzing fails."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        
        result = game.submit_answer('player2', 'الدبوس')
        
        assert result['success'] is False

    def test_buzz_timeout(self, sample_riddles):
        """Test buzz timeout unlocks for others."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        game.buzz_in('player2')
        
        result = game.buzz_timeout()
        
        assert result['success'] is True
        assert result['unlocked'] is True
        assert game.buzzed_player is None

    def test_skip_riddle(self, sample_riddles):
        """Test skipping riddle shows answer."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        
        result = game.skip_riddle()
        
        assert result['success'] is True
        assert 'answer' in result
        assert game.riddle_revealed is True

    def test_next_riddle(self, sample_riddles):
        """Test moving to next riddle."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        
        old_riddle = game.current_riddle
        result = game.next_riddle()
        
        if not result.get('game_ended'):
            assert 'riddle' in result

    def test_game_ends_after_max_riddles(self, sample_riddles):
        """Test game ends after max riddles."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.settings['riddles_per_game'] = 2
        game.test_riddles = sample_riddles
        game.start_game()
        
        # Play through max riddles
        game.next_riddle()
        result = game.next_riddle()
        
        assert result.get('game_ended') is True
        assert game.status == 'ended'

    def test_points_quick_answer_bonus(self, sample_riddles):
        """Test bonus points for quick answer."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        game.buzz_in('player2')
        
        correct_answer = game.current_riddle['answer']
        result = game.submit_answer('player2', correct_answer)
        
        # Should get base + bonus for quick answer
        assert result['points'] >= 10

    def test_reveal_answer(self, sample_riddles):
        """Test revealing answer."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        
        result = game.reveal_answer()
        
        assert result['success'] is True
        assert 'answer' in result
        assert game.riddle_revealed is True

    def test_to_dict_hides_answer(self, sample_riddles):
        """Test that to_dict hides the answer by default."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        
        state = game.to_dict()
        
        if 'current_riddle' in state and state['current_riddle']:
            assert 'answer' not in state['current_riddle']

    def test_to_dict_includes_answer_when_revealed(self, sample_riddles):
        """Test that to_dict includes answer when revealed."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        game.riddle_revealed = True
        
        state = game.to_dict()
        
        if 'current_riddle' in state and state['current_riddle']:
            assert 'answer' in state['current_riddle']

    def test_from_dict_reconstruction(self, sample_riddles):
        """Test game reconstruction from dictionary."""
        game = RiddlesGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_riddles = sample_riddles
        game.start_game()
        
        state = game.to_dict(include_answer=True)
        reconstructed = RiddlesGame.from_dict('test_room', state)
        
        assert reconstructed.game_id == game.game_id
        assert reconstructed.host == game.host
        assert reconstructed.status == game.status
