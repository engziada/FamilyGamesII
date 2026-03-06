"""
Regression tests for existing games after adding new games.
Ensures Charades, Pictionary, Trivia, and Bus Complete still work correctly.
"""
import pytest
from games.charades.models import CharadesGame
from games.trivia.models import TriviaGame
from games.pictionary.models import PictionaryGame
from games.bus_complete.models import BusCompleteGame


# ══════════════════════════════════════════════════════════════════════
# Charades Regression
# ══════════════════════════════════════════════════════════════════════


class TestCharadesRegression:
    """Ensure Charades game model still functions correctly."""

    def test_create_game(self):
        game = CharadesGame('ch1', 'host')
        assert game.game_type == 'charades'
        assert game.host == 'host'
        assert game.status == 'waiting'
        assert len(game.players) == 1

    def test_add_player(self):
        game = CharadesGame('ch1', 'host')
        game.add_player('player2')
        assert len(game.players) == 2
        assert any(p['name'] == 'player2' for p in game.players)

    def test_add_player_duplicate_raises(self):
        game = CharadesGame('ch1', 'host')
        with pytest.raises(ValueError):
            game.add_player('host')

    def test_start_game(self):
        game = CharadesGame('ch1', 'host')
        game.add_player('player2')
        game.start_game()
        assert game.status == 'playing'
        assert game.current_player == 'host'

    def test_start_game_needs_two(self):
        game = CharadesGame('ch1', 'host')
        with pytest.raises(ValueError):
            game.start_game()

    def test_next_round(self):
        game = CharadesGame('ch1', 'host')
        game.add_player('player2')
        game.start_game()
        item = game.get_item()
        game.next_round(item)
        assert game.current_player == 'player2'

    def test_scoring(self):
        game = CharadesGame('ch1', 'host')
        game.add_player('player2')
        game.start_game()
        game.add_score('host', 10)
        assert game.scores['host'] == 10

    def test_remove_player_transfers_host(self):
        game = CharadesGame('ch1', 'host')
        game.add_player('player2')
        game.remove_player('host')
        assert game.host == 'player2'

    def test_to_dict_structure(self):
        game = CharadesGame('ch1', 'host')
        game.add_player('player2')
        state = game.to_dict()
        assert 'game_id' in state
        assert 'host' in state
        assert 'players' in state
        assert 'game_type' in state
        assert state['game_type'] == 'charades'
        assert 'scores' in state
        assert 'status' in state

    def test_to_dict_hides_item(self):
        game = CharadesGame('ch1', 'host')
        game.add_player('player2')
        game.start_game()
        game.set_current_item({'item': 'test', 'category': 'cat'})
        state = game.to_dict(include_item=False)
        assert state['current_item'] is None


# ══════════════════════════════════════════════════════════════════════
# Pictionary Regression
# ══════════════════════════════════════════════════════════════════════


class TestPictionaryRegression:
    """Ensure Pictionary game model still functions correctly."""

    def test_create_game(self):
        game = PictionaryGame('pic1', 'host')
        assert game.game_type == 'pictionary'
        assert game.canvas_data == []

    def test_add_stroke(self):
        game = PictionaryGame('pic1', 'host')
        stroke = {'from': {'x': 0, 'y': 0}, 'to': {'x': 10, 'y': 10}, 'color': '#000', 'size': 3}
        game.add_stroke(stroke)
        assert len(game.canvas_data) == 1

    def test_clear_canvas(self):
        game = PictionaryGame('pic1', 'host')
        game.add_stroke({'from': {'x': 0, 'y': 0}, 'to': {'x': 1, 'y': 1}, 'color': '#000', 'size': 3})
        game.clear_canvas()
        assert game.canvas_data == []

    def test_inherits_charades_behavior(self):
        game = PictionaryGame('pic1', 'host')
        game.add_player('player2')
        game.start_game()
        assert game.status == 'playing'
        assert game.current_player == 'host'

    def test_to_dict_structure(self):
        game = PictionaryGame('pic1', 'host')
        state = game.to_dict()
        assert state['game_type'] == 'pictionary'


# ══════════════════════════════════════════════════════════════════════
# Trivia Regression
# ══════════════════════════════════════════════════════════════════════


class TestTriviaRegression:
    """Ensure Trivia game model still functions correctly."""

    def test_create_game(self):
        game = TriviaGame('tr1', 'host')
        assert game.game_type == 'trivia'
        assert game.status == 'waiting'

    def test_add_player(self):
        game = TriviaGame('tr1', 'host')
        game.add_player('player2')
        assert len(game.players) == 2

    def test_start_game(self):
        game = TriviaGame('tr1', 'host')
        game.add_player('player2')
        game.start_game()
        assert game.status == 'round_active'
        assert game.question_active is True


    def test_next_round(self):
        game = TriviaGame('tr1', 'host')
        game.add_player('player2')
        game.start_game()
        old_q = game.current_question
        game.next_round()
        assert game.status == 'round_active'
        assert game.players_answered == set()

    def test_scoring(self):
        game = TriviaGame('tr1', 'host')
        game.add_player('player2')
        game.add_score('host', 10)
        assert game.scores['host'] == 10

    def test_to_dict_hides_answer(self):
        game = TriviaGame('tr1', 'host')
        game.add_player('player2')
        game.start_game()
        state = game.to_dict(include_answer=False)
        if state['current_question']:
            assert 'answer' not in state['current_question']

    def test_to_dict_includes_answer(self):
        game = TriviaGame('tr1', 'host')
        game.add_player('player2')
        game.start_game()
        state = game.to_dict(include_answer=True)
        if state['current_question']:
            assert 'answer' in state['current_question']

    def test_remove_player(self):
        game = TriviaGame('tr1', 'host')
        game.add_player('player2')
        game.remove_player('player2')
        assert len(game.players) == 1


# ══════════════════════════════════════════════════════════════════════
# Bus Complete Regression
# ══════════════════════════════════════════════════════════════════════


class TestBusCompleteRegression:
    """Ensure Bus Complete game model still functions correctly."""

    def _make_game(self, letter='ا'):
        game = BusCompleteGame('bus1', 'host', {
            'teams': False,
            'validate_answers': False,
            'use_online_validation': False,
        })
        game.add_player('player2')
        game.start_game()
        game.current_letter = letter
        return game

    def test_create_game(self):
        game = BusCompleteGame('bus1', 'host')
        assert game.game_type == 'bus_complete'
        assert len(game.categories) == 7

    def test_start_game(self):
        game = BusCompleteGame('bus1', 'host')
        game.add_player('player2')
        game.start_game()
        assert game.status == 'round_active'
        assert game.current_letter is not None

    def test_submit_answers(self):
        game = self._make_game()
        result = game.submit_answers('host', {'اسم': 'أحمد', 'حيوان': 'أرنب'})
        assert result is True
        assert game.player_submissions['host']['اسم'] == 'أحمد'

    def test_submit_wrong_letter(self):
        game = self._make_game(letter='ب')
        game.submit_answers('host', {'اسم': 'أحمد'})
        assert game.player_submissions['host']['اسم'] == ''
        assert game.wrong_letter_answers['host']['اسم'] == 'أحمد'

    def test_stop_bus(self):
        game = self._make_game()
        game.submit_answers('host', {'اسم': 'أحمد'})
        game.submit_answers('player2', {'اسم': 'إبراهيم'})
        result = game.stop_bus('host')
        assert result is True
        assert game.status == 'validating'
        assert game.stopped_by == 'host'

    def test_validation_vote(self):
        game = self._make_game()
        game.submit_answers('host', {'اسم': 'أحمد'})
        game.submit_answers('player2', {'اسم': 'إبراهيم'})
        game.stop_bus('host')

        statuses = game.get_all_validation_statuses()
        for key in statuses:
            result = game.submit_validation_vote('host', key, True)
            assert result is not None

    def test_finalize_and_score(self):
        game = self._make_game(letter='ب')
        game.submit_answers('host', {'حيوان': 'بقرة'})
        game.submit_answers('player2', {'حيوان': 'بطة'})
        game.stop_bus('host')

        statuses = game.get_all_validation_statuses()
        for key in statuses:
            game.submit_validation_vote('host', key, True)
            game.submit_validation_vote('player2', key, True)

        result = game.finalize_validation()
        assert result is True
        assert game.status == 'scoring'

    def test_shared_words_scoring(self):
        game = self._make_game(letter='ه')
        game.submit_answers('host', {'بلاد': 'هولندا'})
        game.submit_answers('player2', {'بلاد': 'هولندا'})
        game.stop_bus('host')

        statuses = game.get_all_validation_statuses()
        for key in statuses:
            game.submit_validation_vote('host', key, True)
            game.submit_validation_vote('player2', key, True)
        game.finalize_validation()

        assert game.round_scores['host']['بلاد'] == 5
        assert game.round_scores['player2']['بلاد'] == 5

    def test_next_round_resets(self):
        game = self._make_game()
        game.submit_answers('host', {'اسم': 'أحمد'})
        game.next_round()
        assert game.player_submissions == {}
        assert game.invalid_answers == {}
        assert game.wrong_letter_answers == {}

    def test_to_dict_round_active(self):
        game = self._make_game()
        state = game.to_dict()
        assert state['game_type'] == 'bus_complete'
        assert 'current_letter' in state
        assert 'categories' in state

    def test_to_dict_validating(self):
        game = self._make_game()
        game.submit_answers('host', {'اسم': 'أحمد'})
        game.submit_answers('player2', {'اسم': 'إبراهيم'})
        game.stop_bus('host')
        state = game.to_dict()
        assert state['status'] == 'validating'
        assert 'validation_statuses' in state
        assert 'player_votes' in state
