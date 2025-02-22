from datetime import datetime
import json

class CharadesGame:
    def __init__(self, game_id, host):
        self.game_id = game_id
        self.host = host
        self.players = [{'name': host, 'isHost': True}]
        self.game_type = 'charades'
        self.status = 'waiting'
        self.scores = {}
        self.current_player = ''
        self.current_item = ''
        self.round_start_time = None

    def add_player(self, player_name):
        if len(self.players) >= 8:
            raise ValueError("غرفة اللعب ممتلئة")
        if any(p['name'] == player_name for p in self.players):
            raise ValueError("اللاعب موجود بالفعل")
        self.players.append({'name': player_name, 'isHost': False})

    def remove_player(self, player_name):
        self.players = [p for p in self.players if p['name'] != player_name]
        if player_name in self.scores:
            del self.scores[player_name]

    def start_game(self):
        if len(self.players) < 2:
            raise ValueError("عدد اللاعبين غير كافي")
        self.status = 'playing'
        self.current_player = self.players[0]['name']

    def next_round(self, item):
        if not self.players:
            raise ValueError("لا يوجد لاعبين")
        
        # Find next player
        current_idx = next((i for i, p in enumerate(self.players) if p['name'] == self.current_player), 0)
        next_idx = (current_idx + 1) % len(self.players)
        self.current_player = self.players[next_idx]['name']
        
        self.current_item = item
        self.round_start_time = datetime.now()

    def add_score(self, player_name, points):
        if player_name not in self.scores:
            self.scores[player_name] = 0
        self.scores[player_name] += points

    def to_dict(self):
        return {
            'host': self.host,
            'players': self.players,
            'game_type': self.game_type,
            'status': self.status,
            'scores': self.scores,
            'current_player': self.current_player,
            'current_item': self.current_item,
            'round_start_time': self.round_start_time.isoformat() if self.round_start_time else None
        }

    @classmethod
    def from_dict(cls, game_id, data):
        game = cls(game_id, data['host'])
        game.players = data['players']
        game.game_type = data['game_type']
        game.status = data['status']
        game.scores = data['scores']
        game.current_player = data['current_player']
        game.current_item = data['current_item']
        game.round_start_time = datetime.fromisoformat(data['round_start_time']) if data['round_start_time'] else None
        return game
