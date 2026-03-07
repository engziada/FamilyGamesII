"""
Shared test fixtures for Family Games II test suite.
Provides mock game rooms, socket clients, and sample data for all game types.
"""
import sys
import os
import pytest

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def app():
    """Create a Flask test application with SocketIO."""
    os.environ['FAMILY_GAMES_SKIP_EVENTLET_PATCH'] = '1'

    from app import app as flask_app, socketio, game_rooms
    flask_app.config['TESTING'] = True
    flask_app.config['SECRET_KEY'] = 'test-secret-key'

    # Clear game rooms before each test
    game_rooms.clear()

    yield flask_app

    # Cleanup
    game_rooms.clear()
    os.environ.pop('FAMILY_GAMES_SKIP_EVENTLET_PATCH', None)


@pytest.fixture
def client(app):
    """Create a Flask test client."""
    return app.test_client()


@pytest.fixture
def socket_client(app):
    """Create a Flask-SocketIO test client."""
    from app import socketio
    return socketio.test_client(app)


@pytest.fixture
def game_rooms():
    """Direct access to the game_rooms dict."""
    from app import game_rooms as rooms
    rooms.clear()
    yield rooms
    rooms.clear()


# ── Sample Data Fixtures ──────────────────────────────────────────────


@pytest.fixture
def sample_trivia_questions() -> list[dict]:
    """Sample trivia questions for testing Rapid Fire and Trivia."""
    return [
        {
            'question': 'ما هي عاصمة مصر؟',
            'options': ['القاهرة', 'الإسكندرية', 'أسوان', 'الأقصر'],
            'answer': 0,
            'category': 'جغرافيا',
            'difficulty': 'easy'
        },
        {
            'question': 'كم عدد أيام السنة الكبيسة؟',
            'options': ['365', '366', '364', '367'],
            'answer': 1,
            'category': 'علوم',
            'difficulty': 'easy'
        },
        {
            'question': 'ما هو أكبر كوكب في المجموعة الشمسية؟',
            'options': ['زحل', 'المشتري', 'أورانوس', 'نبتون'],
            'answer': 1,
            'category': 'فضاء',
            'difficulty': 'medium'
        },
    ]


@pytest.fixture
def sample_riddles() -> list[dict]:
    """Sample riddles for testing the Riddles game."""
    return [
        {
            'riddle': 'شيء له رأس وليس له عيون، ما هو؟',
            'answer': 'الدبوس',
            'accepted_answers': ['دبوس', 'الدبوس'],
            'hints': ['يُستخدم في الخياطة', 'معدني وصغير', 'يثبت القماش'],
            'category': 'ألغاز عامة',
            'difficulty': 'easy'
        },
        {
            'riddle': 'ما هو الشيء الذي كلما أخذت منه كبر؟',
            'answer': 'الحفرة',
            'accepted_answers': ['حفرة', 'الحفرة'],
            'hints': ['موجود في الأرض', 'يُحفر بالمعول', 'عكس التل'],
            'category': 'ألغاز عامة',
            'difficulty': 'easy'
        },
        {
            'riddle': 'أنا ابن الماء ولكن إن وُضعت في الماء مت، من أنا؟',
            'answer': 'الثلج',
            'accepted_answers': ['ثلج', 'الثلج'],
            'hints': ['بارد جداً', 'يتكون في الشتاء', 'يذوب بالحرارة'],
            'category': 'ألغاز عامة',
            'difficulty': 'medium'
        },
    ]


@pytest.fixture
def sample_twenty_q_words() -> list[dict]:
    """Sample words for 20 Questions testing."""
    return [
        {'word': 'قطة', 'category': 'حيوان'},
        {'word': 'تفاحة', 'category': 'طعام'},
        {'word': 'سيارة', 'category': 'جماد'},
        {'word': 'مصر', 'category': 'بلد'},
        {'word': 'طبيب', 'category': 'مهنة'},
    ]


# ── Game Helper Fixtures ──────────────────────────────────────────────


@pytest.fixture
def make_charades_game():
    """Factory fixture: create a CharadesGame with 2 players."""
    from games.charades.models import CharadesGame

    def _make(game_id: str = 'test_room', host: str = 'host', player2: str = 'player2'):
        game = CharadesGame(game_id, host)
        game.add_player(player2)
        return game

    return _make


@pytest.fixture
def make_trivia_game():
    """Factory fixture: create a TriviaGame with 2 players."""
    from games.trivia.models import TriviaGame

    def _make(game_id: str = 'test_room', host: str = 'host', player2: str = 'player2'):
        game = TriviaGame(game_id, host)
        game.add_player(player2)
        return game

    return _make


@pytest.fixture
def make_bus_game():
    """Factory fixture: create a BusCompleteGame with 2 players."""
    from games.bus_complete.models import BusCompleteGame

    def _make(game_id: str = 'test_room', host: str = 'host', player2: str = 'player2',
              letter: str = 'ا'):
        game = BusCompleteGame(game_id, host, {
            'teams': False,
            'validate_answers': False,
            'use_online_validation': False,
        })
        game.add_player(player2)
        game.start_game()
        game.current_letter = letter
        return game

    return _make


@pytest.fixture
def make_rapid_fire_game():
    """Factory fixture: create a RapidFireGame with 2 players."""
    from games.rapid_fire.models import RapidFireGame

    def _make(game_id: str = 'test_room', host: str = 'host', player2: str = 'player2'):
        game = RapidFireGame(game_id, host)
        game.add_player(player2)
        return game

    return _make
