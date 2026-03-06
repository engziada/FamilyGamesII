"""
Unit tests for Twenty Questions (عشرون سؤال) game model.
"""
import pytest
from games.twenty_questions.models import TwentyQuestionsGame


def make_game() -> TwentyQuestionsGame:
    """Create a test game with 2 players."""
    game = TwentyQuestionsGame('tq1', 'host', {'teams': False, 'time_limit': 60})
    game.add_player('player2')
    return game


# ── Player Management ────────────────────────────────────────────────


def test_add_player():
    game = TwentyQuestionsGame('tq1', 'host')
    game.add_player('p2')
    assert len(game.players) == 2
    assert game.players[1]['name'] == 'p2'


def test_add_player_duplicate_raises():
    game = TwentyQuestionsGame('tq1', 'host')
    with pytest.raises(ValueError, match='موجود'):
        game.add_player('host')


def test_add_player_full_raises():
    game = TwentyQuestionsGame('tq1', 'host')
    for i in range(7):
        game.add_player(f'p{i}')
    with pytest.raises(ValueError, match='ممتلئة'):
        game.add_player('extra')


def test_remove_player():
    game = make_game()
    game.remove_player('player2')
    assert len(game.players) == 1


def test_remove_thinker_ends_game():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')
    game.remove_player('host')  # thinker leaves
    assert game.status == 'ended'


# ── Game Start ───────────────────────────────────────────────────────


def test_start_game_needs_two_players():
    game = TwentyQuestionsGame('tq1', 'host')
    with pytest.raises(ValueError, match='غير كافي'):
        game.start_game()


def test_start_game_sets_thinker():
    game = make_game()
    game.start_game()
    assert game.status == 'thinking'
    assert game.thinker == 'host'
    assert game.round_number == 1


def test_thinker_rotates_each_round():
    game = make_game()
    game.start_game()
    assert game.thinker == 'host'

    game.set_secret('host', 'قطة', 'حيوان')
    game.make_guess('player2', 'قطة')  # correct guess ends round

    game.next_round()
    assert game.thinker == 'player2'


# ── Secret Word ──────────────────────────────────────────────────────


def test_set_secret_success():
    game = make_game()
    game.start_game()
    result = game.set_secret('host', 'قطة', 'حيوان')
    assert result is True
    assert game.secret_word == 'قطة'
    assert game.secret_category == 'حيوان'
    assert game.status == 'asking'


def test_set_secret_only_thinker():
    game = make_game()
    game.start_game()
    result = game.set_secret('player2', 'قطة', 'حيوان')
    assert result is False


def test_set_secret_only_in_thinking_phase():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')  # changes to asking
    result = game.set_secret('host', 'كلب', 'حيوان')  # should fail
    assert result is False


def test_set_secret_rejects_empty():
    game = make_game()
    game.start_game()
    result = game.set_secret('host', '', 'حيوان')
    assert result is False


def test_get_random_word():
    game = make_game()
    word = game.get_random_word()
    assert 'word' in word
    assert 'category' in word


# ── Questions ───────────────────────────────────────────────────────


def test_ask_question_success():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')

    result = game.ask_question('player2', 'هل هو حيوان؟')
    assert result is True
    assert game.question_count == 1
    assert len(game.questions_asked) == 1
    assert game.questions_asked[0]['question'] == 'هل هو حيوان؟'


def test_ask_question_only_in_asking_phase():
    game = make_game()
    game.start_game()
    # still in thinking phase
    result = game.ask_question('player2', 'هل هو حيوان؟')
    assert result is False


def test_ask_question_thinker_cannot_ask():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')

    result = game.ask_question('host', 'هل هو حيوان؟')
    assert result is False


def test_ask_question_max_limit():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')

    for i in range(20):
        game.ask_question('player2', f'سؤال {i}؟')

    result = game.ask_question('player2', 'سؤال 21؟')
    assert result is False


# ── Answer Questions ────────────────────────────────────────────────


def test_answer_question_success():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')
    game.ask_question('player2', 'هل هو حيوان؟')

    result = game.answer_question('host', 'yes')
    assert result is True
    assert game.questions_asked[-1]['answer'] == 'yes'


def test_answer_question_only_thinker():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')
    game.ask_question('player2', 'هل هو حيوان؟')

    result = game.answer_question('player2', 'yes')
    assert result is False


def test_answer_question_invalid_answer():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')
    game.ask_question('player2', 'هل هو حيوان؟')

    result = game.answer_question('host', 'invalid')
    assert result is False


def test_answer_question_only_once():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')
    game.ask_question('player2', 'هل هو حيوان؟')

    game.answer_question('host', 'yes')
    result = game.answer_question('host', 'no')  # second attempt
    assert result is False


# ── Guessing ─────────────────────────────────────────────────────────


def test_make_guess_correct():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')

    result = game.make_guess('player2', 'قطة')
    assert result['correct'] is True
    assert game.scores.get('player2', 0) > 0


def test_make_guess_wrong():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')

    result = game.make_guess('player2', 'كلب')
    assert result['correct'] is False
    assert 'guess' in result


def test_make_guess_normalized_arabic():
    """Test that Arabic normalization works for guessing."""
    game = make_game()
    game.start_game()
    game.set_secret('host', 'أحمد', 'اسم')

    # Different hamza forms should match
    result = game.make_guess('player2', 'احمد')  # without hamza
    assert result['correct'] is True

    # Test with taa marbuta
    game2 = make_game()
    game2.start_game()
    game2.set_secret('host', 'سارة', 'اسم')
    result = game2.make_guess('player2', 'ساره')  # ta marbuta -> ha
    assert result['correct'] is True


def test_thinker_cannot_guess():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')

    result = game.make_guess('host', 'قطة')
    assert result['correct'] is False


def test_make_guess_only_in_asking_phase():
    game = make_game()
    game.start_game()
    # still in thinking phase
    result = game.make_guess('player2', 'قطة')
    assert 'message' in result


def test_make_guess_tracks_history():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')

    game.make_guess('player2', 'كلب')
    game.make_guess('player2', 'أسد')
    assert len(game.guesses_made['player2']) == 2


# ── Scoring ──────────────────────────────────────────────────────────


def test_guesser_wins_points():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')
    # Ask 5 questions first
    for i in range(5):
        game.ask_question('player2', f'سؤال {i}؟')
        game.answer_question('host', 'yes')

    game.make_guess('player2', 'قطة')
    # Points = 10 + remaining questions (15) = 25
    assert game.scores['player2'] == 25


def test_thinker_wins_on_forfeit():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')
    # Use all 20 questions
    for i in range(20):
        game.ask_question('player2', f'سؤال {i}؟')
        game.answer_question('host', 'yes')

    assert game.status == 'ended'
    assert game.scores.get('host', 0) == 15


def test_team_scoring():
    game = TwentyQuestionsGame('tq1', 'host', {'teams': True})
    game.add_player('player2')
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')
    game.make_guess('player2', 'قطة')

    assert game.scores['player2'] > 0
    # player2 should be on team 1
    p2 = next(p for p in game.players if p['name'] == 'player2')
    team_id = str(p2['team'])
    assert game.team_scores[team_id] > 0


# ── Forfeit ───────────────────────────────────────────────────────────


def test_forfeit_reveals_answer():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')

    result = game.forfeit_round()
    assert result['word'] == 'قطة'
    assert result['category'] == 'حيوان'
    assert game.status == 'ended'


# ── Serialization ────────────────────────────────────────────────────


def test_to_dict_hides_secret_from_guesser():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')

    state = game.to_dict(for_player='player2')
    assert state['secret_word'] is None
    assert state['secret_category'] is not None  # category is shown


def test_to_dict_shows_secret_to_thinker():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')

    state = game.to_dict(for_player='host')
    assert state['secret_word'] == 'قطة'


def test_to_dict_shows_secret_when_ended():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')
    game.make_guess('player2', 'قطة')

    state = game.to_dict(for_player='player2')
    assert state['secret_word'] == 'قطة'


def test_to_dict_includes_questions():
    game = make_game()
    game.start_game()
    game.set_secret('host', 'قطة', 'حيوان')
    game.ask_question('player2', 'هل هو حيوان؟')
    game.answer_question('host', 'yes')

    state = game.to_dict()
    assert len(state['questions_asked']) == 1
    assert state['questions_asked'][0]['question'] == 'هل هو حيوان؟'
    assert state['questions_asked'][0]['answer'] == 'yes'
