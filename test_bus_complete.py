from games.bus_complete.models import BusCompleteGame


def make_game(letter='ا'):
    """Create a test game with validation disabled and a fixed current letter."""
    game = BusCompleteGame('g1', 'host', {'teams': False, 'validate_answers': False, 'use_online_validation': False})
    game.add_player('player2')
    game.start_game()
    game.current_letter = letter
    return game


def test_submit_answers_rejects_non_dict_payload():
    game = make_game()

    assert game.submit_answers('host', ['bad', 'payload']) is False
    assert 'host' not in game.player_submissions


def test_submit_answers_coerces_and_trims_values():
    game = make_game()

    # 'أحمد' starts with alef (matches 'ا'), '123' does not start with 'ا' -> wrong letter
    assert game.submit_answers('host', {'اسم': '  أحمد  ', 'حيوان': 123, None: 'x', 'بلاد': None}) is True

    assert game.player_submissions['host']['اسم'] == 'أحمد'
    # '123' doesn't start with 'ا', so it's flagged as wrong letter and blanked
    assert game.player_submissions['host']['حيوان'] == ''
    assert game.wrong_letter_answers['host']['حيوان'] == '123'
    assert game.player_submissions['host']['بلاد'] == ''
    assert 'None' not in game.player_submissions['host']


def test_submit_answers_wrong_letter_detected():
    """Answers that don't start with the current letter are flagged."""
    game = make_game(letter='ب')

    assert game.submit_answers('host', {'اسم': 'أحمد', 'حيوان': 'بقرة'}) is True

    # 'أحمد' starts with alef, not 'ب' -> wrong letter
    assert game.player_submissions['host']['اسم'] == ''
    assert game.wrong_letter_answers['host']['اسم'] == 'أحمد'
    # 'بقرة' starts with 'ب' -> accepted
    assert game.player_submissions['host']['حيوان'] == 'بقرة'


def test_submit_answers_flags_invalid_words_with_dictionary():
    """Dictionary validation runs during stop_bus, not submit_answers.
    
    submit_answers only checks the letter. _validate_all_answers (called
    by stop_bus) uses the dictionary as fallback when online is off.
    """
    dictionary = {
        'اسم': ['أحمد'],
        'حيوان': ['أرنب']
    }
    game = BusCompleteGame('g2', 'host', {
        'teams': False,
        'answer_dictionary': dictionary,
        'validate_answers': True,
        'use_online_validation': False
    })
    game.add_player('player2')
    game.start_game()
    game.current_letter = 'ا'

    # Both start with alef -> submit_answers accepts both
    assert game.submit_answers('host', {'اسم': 'أحمد', 'حيوان': 'أسد'}) is True
    assert game.player_submissions['host']['اسم'] == 'أحمد'
    assert game.player_submissions['host']['حيوان'] == 'أسد'  # accepted at submit time

    # Now stop_bus triggers _validate_all_answers -> dict check
    game.submit_answers('player2', {'اسم': 'إبراهيم', 'حيوان': 'أرنب'})
    game.stop_bus('host')

    # 'أحمد' is in dict -> still accepted
    assert game.player_submissions['host']['اسم'] == 'أحمد'
    # 'أسد' NOT in dict -> blanked and tracked as invalid
    assert game.player_submissions['host']['حيوان'] == ''
    assert game.invalid_answers['host']['حيوان'] == 'أسد'


def test_starts_with_letter_normalizes_hamza():
    """Hamza variants (أ إ آ) should all match alef (ا)."""
    game = make_game(letter='ا')
    assert game._starts_with_letter('أحمد') is True
    assert game._starts_with_letter('إبراهيم') is True
    assert game._starts_with_letter('آدم') is True
    assert game._starts_with_letter('باسم') is False


def test_to_dict_includes_invalid_and_wrong_letter_in_scoring():
    """to_dict should include invalid_answers and wrong_letter_answers during scoring."""
    game = make_game(letter='ب')
    game.submit_answers('host', {'اسم': 'أحمد', 'حيوان': 'بقرة'})
    game.submit_answers('player2', {'اسم': 'باسم', 'حيوان': 'بطة'})
    game.stop_bus('host')

    state = game.to_dict()
    assert state['status'] == 'scoring'
    assert 'invalid_answers' in state
    assert 'wrong_letter_answers' in state
    assert state['wrong_letter_answers']['host']['اسم'] == 'أحمد'


def test_next_round_resets_invalid_and_wrong_letter():
    """next_round should clear invalid_answers and wrong_letter_answers."""
    game = make_game(letter='ب')
    game.submit_answers('host', {'اسم': 'أحمد'})
    assert len(game.wrong_letter_answers) > 0

    game.next_round()
    assert game.invalid_answers == {}
    assert game.wrong_letter_answers == {}
    assert game.player_submissions == {}


def test_submit_is_nonblocking_validation_deferred():
    """submit_answers should NOT run dictionary validation — only letter check.
    
    Validation is deferred to stop_bus -> _validate_all_answers.
    """
    dictionary = {'اسم': ['أحمد']}
    game = BusCompleteGame('g3', 'host', {
        'teams': False,
        'answer_dictionary': dictionary,
        'validate_answers': True,
        'use_online_validation': False
    })
    game.add_player('player2')
    game.start_game()
    game.current_letter = 'ا'

    # 'أمل' starts with alef but NOT in dictionary
    game.submit_answers('host', {'اسم': 'أمل'})

    # At submit time, answer is accepted (only letter checked)
    assert game.player_submissions['host']['اسم'] == 'أمل'
    assert game.invalid_answers.get('host', {}).get('اسم') is None

    # After stop_bus, dictionary validation kicks in
    game.submit_answers('player2', {'اسم': 'أحمد'})
    game.stop_bus('player2')

    # Now 'أمل' should be flagged as invalid
    assert game.player_submissions['host']['اسم'] == ''
    assert game.invalid_answers['host']['اسم'] == 'أمل'
