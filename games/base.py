from __future__ import annotations

from datetime import datetime
from typing import Any, Optional


class BaseGame:
    def __init__(self, game_id: str, host: str, game_type: str, settings: Optional[dict[str, Any]] = None) -> None:
        self.game_id = game_id
        self.host = host
        self.players: list[dict[str, Any]] = [{'name': host, 'isHost': True, 'team': 1}]
        self.game_type = game_type
        self.status = 'waiting'
        self.scores: dict[str, int] = {}
        self.team_scores: dict[str, int] = {'1': 0, '2': 0}
        self.current_player = ''
        self.settings = settings or {}
        self.state_version = 0
        self.created_at = datetime.now()
        self.updated_at = self.created_at

    def bump_state_version(self) -> int:
        self.state_version += 1
        self.updated_at = datetime.now()
        return self.state_version

    def transfer_host(self, new_host: str) -> None:
        for player in self.players:
            player['isHost'] = False
        for player in self.players:
            if player['name'] == new_host:
                player['isHost'] = True
                self.host = new_host
                break

    def _get_next_team(self) -> int:
        if not self.settings.get('teams'):
            return 1
        team1_count = len([player for player in self.players if player.get('team') == 1])
        team2_count = len([player for player in self.players if player.get('team') == 2])
        return 2 if team2_count < team1_count else 1

    def add_player(self, player_name: str) -> None:
        if len(self.players) >= 8:
            raise ValueError('غرفة اللعب ممتلئة')
        if any(player['name'] == player_name for player in self.players):
            raise ValueError('اللاعب موجود بالفعل')
        self.players.append({'name': player_name, 'isHost': False, 'team': self._get_next_team()})

    def remove_player(self, player_name: str) -> bool:
        was_host = player_name == self.host
        self.players = [player for player in self.players if player['name'] != player_name]
        self.scores.pop(player_name, None)
        if was_host and self.players:
            self.transfer_host(self.players[0]['name'])
            return True
        return False

    def add_score(self, player_name: str, points: int) -> None:
        self.scores[player_name] = self.scores.get(player_name, 0) + points
        if self.settings.get('teams'):
            player = next((item for item in self.players if item['name'] == player_name), None)
            if player:
                team_id = str(player.get('team', 1))
                self.team_scores[team_id] = self.team_scores.get(team_id, 0) + points

    def can_join(self) -> tuple[bool, str]:
        if self.status != 'waiting':
            return False, 'اللعبة بدأت بالفعل'
        if len(self.players) >= 8:
            return False, 'غرفة اللعب ممتلئة'
        return True, ''

    def get_room_preview(self) -> dict[str, Any]:
        join_allowed, join_block_reason = self.can_join()
        return {
            'game_id': self.game_id,
            'game_type': self.game_type,
            'host': self.host,
            'players_count': len(self.players),
            'players': self.players,
            'status': self.status,
            'join_allowed': join_allowed,
            'join_block_reason': join_block_reason,
            'state_version': self.state_version,
        }

    def _build_base_state(self) -> dict[str, Any]:
        return {
            'game_id': self.game_id,
            'host': self.host,
            'players': self.players,
            'game_type': self.game_type,
            'status': self.status,
            'scores': self.scores,
            'team_scores': self.team_scores,
            'settings': self.settings,
            'current_player': self.current_player,
            'state_version': self.state_version,
        }
