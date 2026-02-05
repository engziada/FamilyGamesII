from games.bus_complete.models import BusCompleteGame


def make_game():
    game = BusCompleteGame('g1', 'host', {'teams': False})
    game.add_player('player2')
    game.start_game()
    game.current_letter = 'ا'
    return game


def test_submit_answers_rejects_non_dict_payload():
    game = make_game()

    assert game.submit_answers('host', ['bad', 'payload']) is False
    assert 'host' not in game.player_submissions


def test_submit_answers_coerces_and_trims_values():
    game = make_game()

    assert game.submit_answers('host', {'اسم': '  أحمد  ', 'حيوان': 123, None: 'x', 'بلاد': None}) is True

    assert game.player_submissions['host']['اسم'] == 'أحمد'
    assert game.player_submissions['host']['حيوان'] == '123'
    assert game.player_submissions['host']['بلاد'] == ''
    assert 'None' not in game.player_submissions['host']
