from datetime import datetime
import json
import random
from services.data_service import get_data_service

class CharadesGame:
    def __init__(self, game_id, host, settings=None):
        self.game_id = game_id
        self.host = host
        self.players = [{'name': host, 'isHost': True, 'team': 1}]
        self.game_type = 'charades'
        self.status = 'waiting'
        self.scores = {} # {player_name: score}
        self.team_scores = {'1': 0, '2': 0}
        self.current_player = ''
        self.current_item = None
        self.round_start_time = None
        self.paused = False  # Fix Bug #3: Add paused attribute
        self.ready_players = set()  # Fix Bug #9: Add ready_players attribute
        
        # Settings: {teams: bool, difficulty: str, custom_words: str, time_limit: int}
        self.settings = settings or {
            'teams': False,
            'difficulty': 'all',
            'custom_words': '',
            'time_limit': 120
        }
        
        self.custom_items = []
        if self.settings.get('custom_words'):
            words = [w.strip() for w in self.settings['custom_words'].split(',') if w.strip()]
            for w in words:
                self.custom_items.append({'item': w, 'category': 'كلمات مخصصة', 'difficulty': 'custom'})

        # Get data service instance
        self.data_service = get_data_service()
        
        # Pre-fetch items for this room (30 items as per requirements)
        self.data_service.prefetch_for_room(self.game_id, 'charades', count=30)
        
        # Legacy support - keep for backward compatibility
        self.room_items = []
        self.item_index = 0

    def load_and_shuffle_items(self):
        try:
            with open('static/data/charades_items.json', 'r', encoding='utf-8') as f:
                data = json.load(f)
                items = data.get('items', [])
                random.shuffle(items)
                return items
        except Exception as e:
            print(f"Error loading items: {e}")
            return []

    def add_player(self, player_name):
        if len(self.players) >= 8:
            raise ValueError("غرفة اللعب ممتلئة")
        if any(p['name'] == player_name for p in self.players):
            raise ValueError("اللاعب موجود بالفعل")
        
        # Assign to team with fewer players if teams mode is on
        team = 1
        if self.settings.get('teams'):
            team1_count = len([p for p in self.players if p.get('team') == 1])
            team2_count = len([p for p in self.players if p.get('team') == 2])
            team = 2 if team2_count < team1_count else 1
            
        self.players.append({'name': player_name, 'isHost': False, 'team': team})

    def remove_player(self, player_name):
        was_host = any(p['name'] == player_name and p.get('isHost', True) for p in self.players)
        was_current_player = self.current_player == player_name
        self.players = [p for p in self.players if p['name'] != player_name]
        if player_name in self.scores:
            del self.scores[player_name]
        
        # If the host left and there are other players, transfer host to the next player
        if was_host and self.players:
            new_host = self.players[0]['name']
            self.transfer_host(new_host)

            # If the host was also the current player, transfer the turn to the new host
            if was_current_player and self.status == 'playing':
                self.current_player = new_host
            
            return True
        # If the current player left but wasn't the host, move to the next player
        elif was_current_player and self.status == 'playing' and self.players:
            # Find the next player in the list
            self.current_player = self.players[0]['name']
            return False
        return False

    def transfer_host(self, new_host):
        """Transfer host privileges to another player"""
        # Remove host flag from all players
        for player in self.players:
            player['isHost'] = False
        
        # Set the new host
        for player in self.players:
            if player['name'] == new_host:
                player['isHost'] = True
                self.host = new_host
                break

    def start_game(self):
        if len(self.players) < 2:
            raise ValueError("عدد اللاعبين غير كافي")
        self.ready_players.clear()  # Fix Bug #9: Clear ready players on game start
        self.status = 'playing'
        self.current_player = self.players[0]['name']
        self.current_item = None
        self.round_start_time = None
        
    def set_current_item(self, item):
        """Set the current item for the player's turn"""
        self.current_item = item
        
    def start_round_timer(self):
        """Start the timer for the current round"""
        self.round_start_time = datetime.now()
        
    def next_round(self, item):
        if not self.players:
            raise ValueError("لا يوجد لاعبين")
        
        # Find next player
        current_idx = next((i for i, p in enumerate(self.players) if p['name'] == self.current_player), 0)
        next_idx = (current_idx + 1) % len(self.players)
        self.current_player = self.players[next_idx]['name']
        
        self.current_item = item
        self.round_start_time = None

    def add_score(self, player_name, points):
        if player_name not in self.scores:
            self.scores[player_name] = 0
        self.scores[player_name] += points

    @staticmethod
    def calculate_score(start_time):
        """Calculate score based on elapsed time since round start"""
        if start_time is None:
            return 0

        elapsed_seconds = (datetime.now() - start_time).total_seconds()
        if elapsed_seconds <= 60:  # First minute
            return 10
        elif elapsed_seconds <= 120:  # Second minute
            return 5
        return 0

    def to_dict(self, include_item=False, **kwargs):
        # Compatibility with include_answer if called from generic code
        show = include_item or kwargs.get('include_answer', False)
        
        # For Pictionary in easy/medium difficulty, include category for non-drawer players
        current_item_data = None
        if show:
            current_item_data = self.current_item
        elif self.game_type == 'pictionary' and self.current_item:
            difficulty = self.settings.get('difficulty', 'medium')
            if difficulty in ['easy', 'medium']:
                # Send only category for non-drawer players
                current_item_data = {'category': self.current_item.get('category', '')}
        
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
            'current_item': current_item_data,
            'round_start_time': self.round_start_time.isoformat() if self.round_start_time else None
        }

    def get_item(self):
        """Get an item based on game settings using data service"""
        # Custom items take priority if available
        if self.custom_items and (self.settings.get('difficulty') == 'custom' or random.random() < 0.5):
            return random.choice(self.custom_items)

        # Get item from data service (uses caching and prevents repetition)
        item = self.data_service.get_item_for_room(self.game_id, self.game_type)
        
        if item:
            return item
        
        # Fallback to legacy method if data service fails
        if not self.room_items:
            self.room_items = self.load_and_shuffle_items()

        if not self.room_items:
            return None

        item_data = self.room_items[self.item_index]
        self.item_index = (self.item_index + 1) % len(self.room_items)

        if self.item_index == 0:
            random.shuffle(self.room_items)

        return {
            'item': item_data['name'],
            'category': item_data['category'],
            'year': item_data.get('year', ''),
            'starring': item_data.get('starring', ''),
            'type': item_data.get('type', '')
        }

    @staticmethod
    def get_random_item(difficulty='all'):
        """Get a random item from the charades items list"""
        try:
            if difficulty == 'custom': return None # Should be handled by get_item
            with open('static/data/charades_items.json', 'r', encoding='utf-8') as f:
                data = json.load(f)
                items = data.get('items', [])

                if difficulty != 'all':
                    items = [i for i in items if i.get('difficulty') == difficulty]

                if not items:
                    # Fallback if no items match difficulty
                    items = data.get('items', [])

                if not items:
                    return None

                random_item = random.choice(items)
                return {
                    'item': random_item['name'],
                    'category': random_item['category'],
                    'difficulty': random_item.get('difficulty', 'medium')
                }
        except Exception as e:
            print(f"Error loading charades items: {e}")
            return None

    def get_hint(self, hint_number):
        """
        Get hint for pictionary game.
        
        Args:
            hint_number: Hint number (1, 2, or 3)
            
        Returns:
            Hint string or None if no hint available
        """
        if not self.current_item:
            return None
        
        item_text = self.current_item.get('item', '')
        
        # Fix Bug #6: Add null check for empty item text
        if not item_text:
            return None
        
        if hint_number == 1:
            return f"أول حرف: {item_text[0]}"
        elif hint_number == 2:
            return f"عدد الحروف: {len(item_text)}"
        elif hint_number == 3:
            # Last letter hint
            return f"آخر حرف: {item_text[-1]}"
        
        return None

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
