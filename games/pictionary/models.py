from games.charades.models import CharadesGame

class PictionaryGame(CharadesGame):
    def __init__(self, game_id, host, settings=None):
        # Initialize parent without prefetching (we'll do it for pictionary)
        super().__init__(game_id, host, settings)
        self.game_type = 'pictionary'
        self.canvas_data = [] # Store drawing strokes to sync new joiners
        
        # Pre-fetch pictionary items for this room (overrides charades prefetch)
        self.data_service.prefetch_for_room(self.game_id, 'pictionary', count=30)

    def clear_canvas(self):
        self.canvas_data = []

    def add_stroke(self, stroke):
        self.canvas_data.append(stroke)

    def get_hints(self, elapsed):
        hints = []
        if not self.current_item: return hints

        word = self.current_item.get('item', '')
        # 30s: Word length
        if elapsed >= 30:
            hints.append(f"الكلمة من {len(word)} حروف")
        # 60s: First letter
        if elapsed >= 60:
            hints.append(f"أول حرف هو: {word[0]}")
        return hints
