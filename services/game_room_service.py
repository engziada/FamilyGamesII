from __future__ import annotations

from typing import Any

from games.registry import create_game_instance, get_game_metadata


class GameRoomService:
    def __init__(self, game_rooms: dict[str, Any]) -> None:
        self.game_rooms = game_rooms

    def create_room(self, game_id: str, player_name: str, game_type: str, settings: dict[str, Any] | None = None) -> Any:
        game = create_game_instance(game_type, game_id, player_name, settings or {})
        self.game_rooms[game_id] = game
        return game

    def get_room(self, game_id: str) -> Any:
        return self.game_rooms.get(str(game_id))

    def room_exists(self, game_id: str) -> bool:
        return str(game_id) in self.game_rooms

    def get_room_preview(self, game_id: str) -> dict[str, Any]:
        game = self.get_room(game_id)
        if not game:
            raise ValueError('الغرفة غير موجودة')
        preview = game.get_room_preview() if hasattr(game, 'get_room_preview') else {
            'game_id': game.game_id,
            'game_type': game.game_type,
            'host': game.host,
            'players_count': len(game.players),
            'players': game.players,
            'status': game.status,
            'join_allowed': game.status == 'waiting',
            'join_block_reason': '' if game.status == 'waiting' else 'اللعبة بدأت بالفعل',
            'state_version': getattr(game, 'state_version', 0),
        }
        metadata = get_game_metadata(preview['game_type'])
        preview['game_title'] = metadata['title']
        preview['game_icon'] = metadata['icon']
        return preview

    def validate_join(self, game_id: str, player_name: str) -> tuple[Any, str]:
        game = self.get_room(game_id)
        if not game:
            raise ValueError('الغرفة غير موجودة')
        if any(player['name'] == player_name for player in game.players):
            raise ValueError('اللاعب موجود بالفعل')
        if hasattr(game, 'can_join'):
            allowed, reason = game.can_join()
            if not allowed:
                raise ValueError(reason)
        elif game.status != 'waiting':
            raise ValueError('اللعبة بدأت بالفعل')
        return game, ''

    def join_room(self, game_id: str, player_name: str) -> Any:
        game, _ = self.validate_join(game_id, player_name)
        game.add_player(player_name)
        return game

    def remove_room(self, game_id: str) -> None:
        self.game_rooms.pop(str(game_id), None)
