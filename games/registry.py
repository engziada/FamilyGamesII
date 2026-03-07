from __future__ import annotations

from typing import Any

from games.bus_complete.models import BusCompleteGame
from games.charades.models import CharadesGame
from games.pictionary.models import PictionaryGame
from games.rapid_fire.models import RapidFireGame
from games.riddles.models import RiddlesGame
from games.trivia.models import TriviaGame
from games.twenty_questions.models import TwentyQuestionsGame

GAME_REGISTRY: dict[str, dict[str, Any]] = {
    'charades': {'title': 'بدون كلام', 'icon': 'fa-mask', 'factory': CharadesGame},
    'pictionary': {'title': 'ارسم وخمن', 'icon': 'fa-paint-brush', 'factory': PictionaryGame},
    'trivia': {'title': 'بنك المعلومات', 'icon': 'fa-lightbulb', 'factory': TriviaGame},
    'rapid_fire': {'title': 'الأسئلة السريعة', 'icon': 'fa-bolt', 'factory': RapidFireGame},
    'twenty_questions': {'title': 'عشرين سؤال', 'icon': 'fa-question-circle', 'factory': TwentyQuestionsGame},
    'riddles': {'title': 'الألغاز', 'icon': 'fa-brain', 'factory': RiddlesGame},
    'bus_complete': {'title': 'أتوبيس كومبليت', 'icon': 'fa-bus', 'factory': BusCompleteGame},
}

DEFAULT_GAME_TYPE = 'charades'


def get_game_metadata(game_type: str) -> dict[str, Any]:
    return GAME_REGISTRY.get(game_type, GAME_REGISTRY[DEFAULT_GAME_TYPE])


def create_game_instance(game_type: str, game_id: str, host: str, settings: dict[str, Any] | None = None) -> Any:
    metadata = get_game_metadata(game_type)
    factory = metadata['factory']
    return factory(game_id, host, settings)
