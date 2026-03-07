from __future__ import annotations

from typing import Any, Optional


class RealtimeSyncService:
    def __init__(self, game_rooms: dict[str, Any]) -> None:
        self.game_rooms = game_rooms

    def build_public_state(self, game_id: str) -> dict[str, Any] | None:
        game = self.game_rooms.get(str(game_id))
        if not game:
            return None
        state = game.to_dict(include_answer=False)
        if 'state_version' not in state:
            state['state_version'] = getattr(game, 'state_version', 0)
        return state

    def build_private_state(self, game_id: str, player_name: str) -> dict[str, Any] | None:
        game = self.game_rooms.get(str(game_id))
        if not game:
            return None
        game_type = getattr(game, 'game_type', '')
        if game_type in ['charades', 'pictionary'] and getattr(game, 'current_player', None) == player_name and getattr(game, 'current_item', None):
            return {'event': 'new_item', 'payload': game.current_item}
        if game_type == 'twenty_questions':
            state = game.to_dict(for_player=player_name)
            return {'event': 'private_game_state', 'payload': state}
        return None

    def bump_game_version(self, game: Any) -> int:
        if hasattr(game, 'bump_state_version'):
            return game.bump_state_version()
        current = getattr(game, 'state_version', 0) + 1
        setattr(game, 'state_version', current)
        return current
