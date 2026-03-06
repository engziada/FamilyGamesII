"""
Shared pytest fixtures for Family Games II test suite.
"""
import pytest
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def mock_game_room():
    """Create a mock game room dictionary for testing.
    
    Returns:
        dict: A dictionary to simulate game_rooms storage
    """
    return {}


@pytest.fixture
def sample_trivia_questions():
    """Sample trivia questions for testing.
    
    Returns:
        list: List of trivia question objects
    """
    return [
        {
            'question': 'ما هي عاصمة مصر؟',
            'correct_answer': 'القاهرة',
            'wrong_answers': ['الإسكندرية', 'الجيزة', 'الأقصر'],
            'category': 'جغرافيا',
            'difficulty': 'easy'
        },
        {
            'question': 'كم عدد أيام السنة الكبيسة؟',
            'correct_answer': '366',
            'wrong_answers': ['365', '364', '367'],
            'category': 'علوم',
            'difficulty': 'easy'
        },
        {
            'question': 'من هو مؤلف رواية "البؤساء"؟',
            'correct_answer': 'فيكتور هوغو',
            'wrong_answers': ['تشارلز ديكنز', 'ليو تولستوي', 'جين أوستن'],
            'category': 'أدب',
            'difficulty': 'medium'
        }
    ]


@pytest.fixture
def sample_riddles():
    """Sample riddles for testing.
    
    Returns:
        list: List of riddle objects
    """
    return [
        {
            'riddle': 'لي أسنان لكن لا أعض، ما أنا؟',
            'answer': 'المشط',
            'hints': ['تستخدمه كل يوم', 'له عدة أسنان', 'يستخدم للشعر'],
            'category': 'جماد',
            'difficulty': 'easy'
        },
        {
            'riddle': 'أمشي بلا أرجل، ولي عين واحدة، ما أنا؟',
            'answer': 'الإبرة',
            'hints': ['تستخدم في الخياطة', 'لها ثقب', 'معدنية صغيرة'],
            'category': 'جماد',
            'difficulty': 'medium'
        },
        {
            'riddle': 'أكون أخضر في الصيف، وأصفر في الخريف، ما أنا؟',
            'answer': 'الشجرة',
            'hints': ['لها أوراق', 'تتغير ألوانها', 'تعطي ظلاً'],
            'category': 'نبات',
            'difficulty': 'easy'
        }
    ]


@pytest.fixture
def sample_twenty_q_words():
    """Sample words for 20 Questions game testing.
    
    Returns:
        list: List of word objects with category hints
    """
    return [
        {'word': 'أسد', 'category': 'حيوان', 'difficulty': 'easy'},
        {'word': 'تفاحة', 'category': 'فاكهة', 'difficulty': 'easy'},
        {'word': 'القاهرة', 'category': 'مدينة', 'difficulty': 'easy'},
        {'word': 'سيارة', 'category': 'مركبة', 'difficulty': 'easy'},
        {'word': 'طبيب', 'category': 'مهنة', 'difficulty': 'easy'},
        {'word': 'كرة القدم', 'category': 'رياضة', 'difficulty': 'medium'},
        {'word': 'هرم الأهرامات', 'category': 'معلم أثري', 'difficulty': 'medium'},
        {'word': 'نيل أرمسترونج', 'category': 'شخصية تاريخية', 'difficulty': 'hard'}
    ]


@pytest.fixture
def sample_charades_items():
    """Sample charades items for testing.
    
    Returns:
        list: List of charades item objects
    """
    return [
        {'item': 'فيلم تيتانيك', 'category': 'أفلام', 'type': 'فيلم', 'year': '1997', 'starring': 'ليوناردو دي كابريو'},
        {'item': 'مسلسل لعبة الحيتان', 'category': 'مسلسلات', 'type': 'مسلسل', 'year': '2024'},
        {'item': 'أغنية أنا قلبي دليلي', 'category': 'أغاني', 'type': 'أغنية', 'starring': 'أم كلثوم'}
    ]


@pytest.fixture
def sample_bus_complete_answers():
    """Sample answers for Bus Complete game testing.
    
    Returns:
        dict: Sample answers organized by category
    """
    return {
        'اسم': ['أحمد', 'إبراهيم', 'إيمان'],
        'حيوان': ['أسد', 'أرنب', 'أفعى'],
        'نبات': ['أرز', 'تفاح', 'تين'],
        'جماد': ['إبرة', 'أسورة', 'تابلوه'],
        'بلاد': ['أمريكا', 'إيطاليا', 'ألمانيا'],
        'أكلة': ['أرز باللبن', 'تبولة', 'تميس'],
        'مهنة': ['أمين مكتبة', 'إداري', 'تاجر']
    }


@pytest.fixture
def rapid_fire_game(mock_game_room, sample_trivia_questions):
    """Create a RapidFireGame instance for testing.
    
    Returns:
        RapidFireGame: A game instance with sample data
    """
    from games.rapid_fire.models import RapidFireGame
    game = RapidFireGame('test_room', 'host_player')
    game.add_player('player2')
    # Pre-populate with test questions
    game.test_questions = sample_trivia_questions
    return game


@pytest.fixture
def twenty_questions_game(mock_game_room, sample_twenty_q_words):
    """Create a TwentyQuestionsGame instance for testing.
    
    Returns:
        TwentyQuestionsGame: A game instance with sample data
    """
    from games.twenty_questions.models import TwentyQuestionsGame
    game = TwentyQuestionsGame('test_room', 'host_player')
    game.add_player('player2')
    game.test_words = sample_twenty_q_words
    return game


@pytest.fixture
def riddles_game(mock_game_room, sample_riddles):
    """Create a RiddlesGame instance for testing.
    
    Returns:
        RiddlesGame: A game instance with sample data
    """
    from games.riddles.models import RiddlesGame
    game = RiddlesGame('test_room', 'host_player')
    game.add_player('player2')
    game.test_riddles = sample_riddles
    return game


@pytest.fixture
def charades_game(mock_game_room):
    """Create a CharadesGame instance for testing.
    
    Returns:
        CharadesGame: A game instance
    """
    from games.charades.models import CharadesGame
    game = CharadesGame('test_charades', 'host_player')
    game.add_player('player2')
    return game


@pytest.fixture
def trivia_game(mock_game_room):
    """Create a TriviaGame instance for testing.
    
    Returns:
        TriviaGame: A game instance
    """
    from games.trivia.models import TriviaGame
    game = TriviaGame('test_trivia', 'host_player')
    game.add_player('player2')
    return game


@pytest.fixture
def bus_complete_game(mock_game_room):
    """Create a BusCompleteGame instance for testing.
    
    Returns:
        BusCompleteGame: A game instance
    """
    from games.bus_complete.models import BusCompleteGame
    game = BusCompleteGame('test_bus', 'host_player', {'validate_answers': False})
    game.add_player('player2')
    return game
