"""
Unit tests for Riddles (الألغاز) game model.
"""
import pytest
from games.riddles.models import RiddlesGame


def make_game() -> RiddlesGame:
    """Create a test game with 2 players and mock riddle."""
    game = RiddlesGame('r1', 'host', {'teams': False, 'time_limit': 60})
    game.add_player('player2')
    # Inject a known riddle
    game.riddle_pool = [
        {
            'riddle': 'شيء له رأس وليس له عين، ما هو؟',
            'answer': 'الدبوس',
            'accepted_answers': ['دبوس', 'الدبوس', 'إبرة'],
            'hints': ['يُستخدم في الخياطة', 'معدني وصغير', 'يثبت القماش'],
            'category': 'ألغاز عامة',
            'difficulty': 'easy',
        }
    ]
    return game


# ── Player Management ────────────────────────────────────────────────


def test_add_player():
    game = RiddlesGame('r1', 'host')
    game.add_player('p2')
    assert len(game.players) == 2


def test_add_player_duplicate_raises():
    game = RiddlesGame('r1', 'host')
    with pytest.raises(ValueError, match='موجود'):
        game.add_player('host')


def test_add_player_full_raises():
    game = RiddlesGame('r1', 'host')
    for i in range(7):
        game.add_player(f'p{i}')
    with pytest.raises(ValueError, match='ممتلئة'):
        game.add_player('extra')


def test_remove_player():
    game = make_game()
    game.remove_player('player2')
    assert len(game.players) == 1


def test_remove_host_transfers():
    game = make_game()
    game.remove_player('host')
    assert game.host == 'player2'


# ── Game Flow ───────────────────────────────────────────────────────


def test_start_game_needs_two():
    game = RiddlesGame('r1', 'host')
    with pytest.raises(ValueError, match='غير كافي'):
        game.start_game()


def test_start_game():
    game = make_game()
    game.start_game()
    assert game.status == 'round_active'
    assert game.riddle_active is True
    assert game.current_riddle is not None
    assert game.round_number == 1


def test_next_riddle():
    game = make_game()
    game.start_game()
    first_riddle = game.current_riddle
    game.next_riddle()
    assert game.round_number == 2
    assert game.riddle_active is True
    assert game.hints_revealed == 0


# ── Answer Submission ──────────────────────────────────────────────


def test_submit_answer_correct():
    game = make_game()
    game.start_game()
    result = game.submit_answer('player2', 'دبوس')
    assert result['correct'] is True
    assert game.scores.get('player2', 0) > 0


def test_submit_answer_accepted_variants():
    """Test that accepted_answers are recognized."""
    game = make_game()
    game.start_game()
    result = game.submit_answer('player2', 'إبرة')
    assert result['correct'] is True


def test_submit_answer_wrong():
    game = make_game()
    game.start_game()
    result = game.submit_answer('player2', 'كتاب')
    assert result['correct'] is False
    assert 'message' in result


def test_submit_answer_only_once():
    """Player cannot answer twice on same riddle."""
    game = make_game()
    game.start_game()
    game.submit_answer('player2', 'كتاب')  # wrong
    result = game.submit_answer('player2', 'دبوس')
    assert result['correct'] is False  # rejected
    assert 'لقد جاوبت' in result['message']


def test_submit_answer_no_riddle():
    game = make_game()
    result = game.submit_answer('player2', 'test')
    assert result['correct'] is False


def test_answer_normalization():
    """Test Arabic text normalization."""
    game = make_game()
    game.start_game()
    # Test with taa marbuta -> ha normalization (more common case)
    game2 = RiddlesGame('r2', 'host', {'teams': False, 'time_limit': 60})
    game2.add_player('p2')
    game2.riddle_pool = [
        {
            'riddle': 'test',
            'answer': 'سارة',
            'accepted_answers': [],
            'hints': [],
            'category': 'test',
            'difficulty': 'easy',
        }
    ]
    game2.start_game()
    result = game2.submit_answer('p2', 'ساره')  # ta marbuta -> ha
    assert result['correct'] is True


# ── Hint Mechanics ─────────────────────────────────────────────────


def test_reveal_hint():
    game = make_game()
    game.start_game()
    hint = game.reveal_hint()
    assert hint is not None
    assert game.hints_revealed == 1


def test_reveal_hint_max_limit():
    game = make_game()
    game.start_game()
    for _ in range(5):  # More than MAX_HINTS
        game.reveal_hint()
    # After 3 hints, should return None
    assert game.hints_revealed <= 3


def test_hint_reduces_points():
    """Points decrease when hints are revealed."""
    game = make_game()
    game.start_game()
    game.reveal_hint()  # 1 hint
    game.reveal_hint()  # 2 hints
    # Points = 10 - (2 * 2) = 6
    points = game._calculate_points()
    assert points == 6


# ── Skip Riddle ─────────────────────────────────────────────────────


def test_skip_riddle():
    game = make_game()
    game.start_game()
    result = game.skip_riddle()
    assert result['answer'] == 'الدبوس'
    assert game.riddle_active is False


def test_skip_riddle_only_host():
    """Only host can skip (enforced by socket handler, not model)."""
    # Model allows any player to skip (handler enforces restriction)
    game = make_game()
    game.start_game()
    result = game.skip_riddle()
    assert 'answer' in result


# ── Riddle Timeout ─────────────────────────────────────────────────


def test_riddle_timeout():
    game = make_game()
    game.start_game()
    result = game.riddle_timeout()
    assert result['answer'] == 'الدبوس'
    assert game.riddle_active is False


# ── Scoring ──────────────────────────────────────────────────────────


def test_scoring_tracks():
    game = make_game()
    game.start_game()
    game.submit_answer('player2', 'دبوس')
    assert game.scores['player2'] == 10  # no hints used


def test_team_scoring():
    game = RiddlesGame('r1', 'host', {'teams': True})
    game.add_player('player2')
    game.riddle_pool = [
        {
            'riddle': 'test',
            'answer': 'test',
            'accepted_answers': [],
            'hints': [],
            'category': 'test',
            'difficulty': 'easy',
        }
    ]
    game.start_game()
    game.submit_answer('player2', 'test')
    assert game.scores['player2'] > 0
    # player2 should be on a team (either 1 or 2)
    p2 = next(p for p in game.players if p['name'] == 'player2')
    team_id = str(p2['team'])
    assert game.team_scores[team_id] > 0


# ── Serialization ────────────────────────────────────────────────────


def test_to_dict_hides_answer():
    game = make_game()
    game.start_game()
    state = game.to_dict()
    assert 'answer' not in state['current_riddle']


def test_to_dict_shows_answer_when_inactive():
    game = make_game()
    game.start_game()
    game.skip_riddle()
    state = game.to_dict()
    assert state['current_riddle']['answer'] == 'الدبوس'


def test_to_dict_includes_hints():
    game = make_game()
    game.start_game()
    game.reveal_hint()
    state = game.to_dict()
    assert len(state['current_riddle']['hints']) == 1


def test_to_dict_structure():
    game = make_game()
    game.start_game()
    state = game.to_dict()
    assert state['game_type'] == 'riddles'
    assert 'scores' in state
    assert 'riddle_active' in state
