"""
Unit tests for Twenty Questions game model.
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from games.twenty_questions.models import TwentyQuestionsGame


class TestTwentyQuestionsGame:
    """Test cases for TwentyQuestionsGame class."""

    def test_game_initialization(self):
        """Test game initializes with correct default values."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        
        assert game.game_id == 'test_room'
        assert game.host == 'host_player'
        assert game.status == 'waiting'
        assert len(game.players) == 1
        assert game.players[0]['name'] == 'host_player'
        assert game.players[0]['isHost'] is True
        assert game.game_type == 'twenty_questions'
        assert game.thinker is None
        assert game.secret_word is None
        assert game.game_phase == 'setup'

    def test_add_player(self):
        """Test adding players to the game."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        
        assert len(game.players) == 2
        assert game.players[1]['name'] == 'player2'
        assert game.players[1]['isHost'] is False

    def test_add_player_room_full(self):
        """Test that adding more than 8 players raises error."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        for i in range(2, 9):
            game.add_player(f'player{i}')
        
        assert len(game.players) == 8
        
        with pytest.raises(ValueError, match="الغرفة ممتلئة"):
            game.add_player('player9')

    def test_start_game(self, sample_twenty_q_words):
        """Test starting the game."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.test_words = sample_twenty_q_words
        result = game.start_game()
        
        assert game.status == 'playing'
        assert game.thinker is not None
        assert game.game_phase == 'setup'

    def test_start_game_insufficient_players(self):
        """Test that starting with less than 2 players raises error."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        
        with pytest.raises(ValueError, match="عدد اللاعبين غير كافي"):
            game.start_game()

    def test_get_random_word_suggestion(self, sample_twenty_q_words):
        """Test getting random word suggestion."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.test_words = sample_twenty_q_words
        
        suggestion = game.get_random_word_suggestion()
        
        assert suggestion is not None
        assert 'word' in suggestion
        assert 'category' in suggestion

    def test_set_secret_word(self):
        """Test setting the secret word."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        
        result = game.set_secret_word('أسد', 'حيوان')
        
        assert result['success'] is True
        assert game.secret_word == 'أسد'
        assert game.secret_category == 'حيوان'
        assert game.game_phase == 'asking'

    def test_ask_question(self):
        """Test asking a question."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        result = game.ask_question('player2', 'هل هو حيوان؟')
        
        assert result['success'] is True
        assert result['question'] == 'هل هو حيوان؟'
        assert result['question_number'] == 1

    def test_ask_question_as_thinker_fails(self):
        """Test that thinker cannot ask questions."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        result = game.ask_question('host_player', 'هل هو حيوان؟')
        
        assert result['success'] is False

    def test_answer_question(self):
        """Test answering a question."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        game.ask_question('player2', 'هل هو حيوان؟')
        
        result = game.answer_question('yes')
        
        assert result['success'] is True
        assert result['answer'] == 'yes'
        assert game.question_count == 1

    def test_answer_question_invalid(self):
        """Test that invalid answer is rejected."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        game.ask_question('player2', 'هل هو حيوان؟')
        
        result = game.answer_question('maybe_not')
        
        assert result['success'] is False

    def test_make_guess_correct(self):
        """Test making correct guess."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        result = game.make_guess('player2', 'أسد')
        
        assert result['correct'] is True
        assert result['winner'] == 'player2'
        assert game.status == 'ended'

    def test_make_guess_wrong(self):
        """Test making wrong guess."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        result = game.make_guess('player2', 'قطة')
        
        assert result['correct'] is False
        assert game.status == 'playing'

    def test_make_guess_case_insensitive(self):
        """Test that guess is case insensitive."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        result = game.make_guess('player2', '  أسد  ')
        
        assert result['correct'] is True

    def test_max_questions_triggers_guessing_phase(self):
        """Test that reaching max questions triggers guessing phase."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        # Ask 20 questions
        for i in range(20):
            game.ask_question('player2', f'سؤال {i+1}')
            game.answer_question('yes')
        
        assert game.game_phase == 'guessing'

    def test_forfeit(self):
        """Test forfeiting the game."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        result = game.forfeit('player2')
        
        assert result['success'] is True
        assert game.status == 'ended'
        assert 'host_player' in game.scores

    def test_points_calculation(self):
        """Test points are calculated correctly."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        # Correct guess with 0 questions = 20 points
        result = game.make_guess('player2', 'أسد')
        
        assert result['points'] == 20

    def test_points_decrease_with_questions(self):
        """Test points decrease as more questions are asked."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        # Ask 5 questions
        for i in range(5):
            game.ask_question('player2', f'سؤال {i+1}')
            game.answer_question('yes')
        
        result = game.make_guess('player2', 'أسد')
        
        assert result['points'] == 15  # 20 - 5 = 15

    def test_to_dict_hides_secret(self):
        """Test that to_dict hides the secret word by default."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        state = game.to_dict()
        
        assert 'secret_word' not in state

    def test_to_dict_includes_secret_when_requested(self):
        """Test that to_dict includes secret when requested."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        state = game.to_dict(include_secret=True)
        
        assert state['secret_word'] == 'أسد'

    def test_from_dict_reconstruction(self):
        """Test game reconstruction from dictionary."""
        game = TwentyQuestionsGame('test_room', 'host_player')
        game.add_player('player2')
        game.start_game()
        game.set_secret_word('أسد', 'حيوان')
        
        state = game.to_dict(include_secret=True)
        reconstructed = TwentyQuestionsGame.from_dict('test_room', state)
        
        assert reconstructed.game_id == game.game_id
        assert reconstructed.host == game.host
        assert reconstructed.secret_word == game.secret_word
