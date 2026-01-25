from games.charades.models import CharadesGame

class PictionaryGame(CharadesGame):
    def __init__(self, game_id, host, settings=None):
        super().__init__(game_id, host, settings)
        self.game_type = 'pictionary'
        self.canvas_data = [] # Store drawing strokes to sync new joiners

    def clear_canvas(self):
        self.canvas_data = []

    def add_stroke(self, stroke):
        self.canvas_data.append(stroke)
