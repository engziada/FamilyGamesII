"""
Unit tests for Rapid Fire (الأسئلة السريعة) game model.
"""
import pytest
from games.rapid_fire.models import RapidFireGame


def make_game() -> RapidFireGame:
    """Create a test game with a mock question pre-loaded."""
    game = RapidFireGame('rf1', 'host', {
        'teams': False,
        'difficulty': 'all',
        'time_limit': 30,
    })
    game.add_player('player2')
    # Inject a known question so tests are deterministic
    game.current_question = {
        'question': 'ما هي عاصمة مصر؟',
        'options': ['القاهرة', 'الإسكندرية', 'أسوان', 'الأقصر'],
        'answer': 0,
        'category': 'جغرافيا',
        'difficulty': 'easy',
    }
    return game


# ── Player Management ────────────────────────────────────────────────


def test_add_player():
    game = RapidFireGame('rf1', 'host')
    game.add_player('p2')
    assert len(game.players) == 2
    assert game.players[1]['name'] == 'p2'


def test_add_player_duplicate_raises():
    game = RapidFireGame('rf1', 'host')
    with pytest.raises(ValueError, match='موجود'):
        game.add_player('host')


def test_add_player_full_raises():
    game = RapidFireGame('rf1', 'host')
    for i in range(7):
        game.add_player(f'p{i}')
    with pytest.raises(ValueError, match='ممتلئة'):
        game.add_player('extra')


def test_remove_player():
    game = RapidFireGame('rf1', 'host')
    game.add_player('p2')
    game.remove_player('p2')
    assert len(game.players) == 1


def test_remove_host_transfers():
    game = RapidFireGame('rf1', 'host')
    game.add_player('p2')
    game.remove_player('host')
    assert game.host == 'p2'
    assert game.players[0]['isHost'] is True


# ── Game Start ───────────────────────────────────────────────────────


def test_start_game_needs_two_players():
    game = RapidFireGame('rf1', 'host')
    with pytest.raises(ValueError, match='غير كافي'):
        game.start_game()


def test_start_game_sets_status():
    game = make_game()
    game.start_game()
    assert game.status == 'round_active'
    assert game.question_active is True


# ── Buzz Mechanics ───────────────────────────────────────────────────


def test_buzz_registers_first_player():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    assert game.buzz('host') is True
    assert game.buzzed_player == 'host'
    assert game.status == 'buzzed'


def test_buzz_rejects_second_player():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    game.buzz('host')
    assert game.buzz('player2') is False
    assert game.buzzed_player == 'host'


def test_buzz_rejected_when_question_inactive():
    game = make_game()
    game.status = 'round_active'
    game.question_active = False

    assert game.buzz('host') is False


def test_buzz_rejected_after_wrong_answer():
    """Player who already answered wrong cannot buzz again on same question."""
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    game.buzz('host')
    game.submit_answer('host', 3)  # wrong answer
    assert 'host' in game.players_buzzed_wrong

    # Host tries to buzz again - rejected
    assert game.buzz('host') is False

    # Player2 can still buzz
    assert game.buzz('player2') is True


# ── Answer Submission ────────────────────────────────────────────────


def test_submit_answer_correct():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    game.buzz('host')
    result = game.submit_answer('host', 0)  # القاهرة = correct

    assert result is True
    assert game.question_active is False
    assert game.scores.get('host', 0) == 10


def test_submit_answer_wrong():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    game.buzz('host')
    result = game.submit_answer('host', 2)  # أسوان = wrong

    assert result is False
    assert game.question_active is True  # question still active for others
    assert game.buzzed_player is None
    assert 'host' in game.players_buzzed_wrong
    assert game.scores.get('host', 0) == 0


def test_submit_answer_wrong_player_rejected():
    """Only the buzzed player can submit an answer."""
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    game.buzz('host')
    result = game.submit_answer('player2', 0)
    assert result is False


# ── All Players Wrong ────────────────────────────────────────────────


def test_all_players_wrong_ends_question():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    # Host buzzes and answers wrong
    game.buzz('host')
    game.submit_answer('host', 2)

    # Player2 buzzes and answers wrong
    game.buzz('player2')
    game.submit_answer('player2', 3)

    # All players exhausted
    assert game.question_active is False


# ── Buzz Timeout ─────────────────────────────────────────────────────


def test_buzz_timeout_reopens_for_others():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    game.buzz('host')
    game.buzz_timeout()

    assert game.buzzed_player is None
    assert 'host' in game.players_buzzed_wrong
    assert game.status == 'round_active'
    assert game.question_active is True  # player2 can still buzz


def test_buzz_timeout_all_exhausted():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    # Host buzzes and times out
    game.buzz('host')
    game.buzz_timeout()

    # Player2 buzzes and times out
    game.buzz('player2')
    game.buzz_timeout()

    assert game.question_active is False


# ── Question Timeout ─────────────────────────────────────────────────


def test_question_timeout():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    game.question_timeout()

    assert game.question_active is False
    assert game.buzzed_player is None


# ── Next Question ────────────────────────────────────────────────────


def test_next_question_resets_state():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    game.buzz('host')
    game.submit_answer('host', 0)  # correct

    old_question = game.current_question
    game.next_question()

    assert game.question_active is True
    assert game.buzzed_player is None
    assert game.players_buzzed_wrong == set()
    assert game.status == 'round_active'


# ── Scoring ──────────────────────────────────────────────────────────


def test_scoring_multiple_rounds():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    # Host answers correctly twice
    game.buzz('host')
    game.submit_answer('host', 0)
    assert game.scores['host'] == 10

    game.next_question()
    game.current_question = {
        'question': 'test', 'options': ['a', 'b'], 'answer': 0,
        'category': 'test', 'difficulty': 'easy'
    }
    game.buzz('host')
    game.submit_answer('host', 0)
    assert game.scores['host'] == 20


def test_team_scoring():
    game = RapidFireGame('rf1', 'host', {'teams': True, 'time_limit': 30})
    game.add_player('player2')
    game.current_question = {
        'question': 'test', 'options': ['a', 'b'], 'answer': 0,
        'category': 'test', 'difficulty': 'easy'
    }
    game.status = 'round_active'
    game.question_active = True

    # player2 is team 1 (auto-assigned)
    game.buzz('player2')
    game.submit_answer('player2', 0)

    assert game.scores['player2'] == 10
    # Team scores should be updated
    p2 = next(p for p in game.players if p['name'] == 'player2')
    team_id = str(p2['team'])
    assert game.team_scores[team_id] == 10


# ── Serialization ────────────────────────────────────────────────────


def test_to_dict_hides_answer():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    state = game.to_dict(include_answer=False)
    assert state['game_type'] == 'rapid_fire'
    assert state['current_question'] is not None
    assert 'answer' not in state['current_question']


def test_to_dict_includes_answer():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    state = game.to_dict(include_answer=True)
    assert state['current_question']['answer'] == 0


def test_to_dict_includes_buzz_state():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True
    game.buzz('host')

    state = game.to_dict()
    assert state['buzzed_player'] == 'host'
    assert state['question_active'] is True
    assert state['status'] == 'buzzed'


def test_to_dict_includes_players_buzzed_wrong():
    game = make_game()
    game.status = 'round_active'
    game.question_active = True

    game.buzz('host')
    game.submit_answer('host', 2)  # wrong

    state = game.to_dict()
    assert 'host' in state['players_buzzed_wrong']
