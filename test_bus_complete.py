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
    """Dictionary validation now goes through manual validation flow.
    
    stop_bus transitions to 'validating'. Words are NOT auto-rejected.
    finalize_validation applies majority votes and then calculates scores.
    With general_wordlist disabled, only the categorized dict is used for
    offline pre-check (validation_cache), but rejection requires player votes.
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
    game.general_wordlist = set()  # disable tier-4 to isolate tier-2
    game.validated_words = {cat: set() for cat in game.categories}  # disable tier-3
    game.add_player('player2')
    game.start_game()
    game.current_letter = 'ا'

    # Both start with alef -> submit_answers accepts both
    assert game.submit_answers('host', {'اسم': 'أحمد', 'حيوان': 'أسد'}) is True
    assert game.player_submissions['host']['اسم'] == 'أحمد'
    assert game.player_submissions['host']['حيوان'] == 'أسد'  # accepted at submit time

    # stop_bus transitions to 'validating' — does NOT auto-reject
    game.submit_answers('player2', {'اسم': 'إبراهيم', 'حيوان': 'أرنب'})
    game.stop_bus('host')
    assert game.status == 'validating'

    # Answers are still present (not blanked) — awaiting manual votes
    assert game.player_submissions['host']['اسم'] == 'أحمد'
    assert game.player_submissions['host']['حيوان'] == 'أسد'

    # Offline validation cache should flag 'أسد' as invalid (not in dict)
    assert game.validation_cache[('حيوان', 'أسد')] is False
    # 'أحمد' is in dict -> cached as valid
    assert game.validation_cache[('اسم', 'أحمد')] is True


def test_starts_with_letter_normalizes_hamza():
    """Hamza variants (أ إ آ) should all match alef (ا)."""
    game = make_game(letter='ا')
    assert game._starts_with_letter('أحمد') is True
    assert game._starts_with_letter('إبراهيم') is True
    assert game._starts_with_letter('آدم') is True
    assert game._starts_with_letter('باسم') is False


def test_to_dict_includes_invalid_and_wrong_letter_in_validating():
    """to_dict should include invalid_answers and wrong_letter_answers during validating."""
    game = make_game(letter='ب')
    game.submit_answers('host', {'اسم': 'أحمد', 'حيوان': 'بقرة'})
    game.submit_answers('player2', {'اسم': 'باسم', 'حيوان': 'بطة'})
    game.stop_bus('host')

    state = game.to_dict()
    assert state['status'] == 'validating'
    assert 'invalid_answers' in state
    assert 'wrong_letter_answers' in state
    assert state['wrong_letter_answers']['host']['اسم'] == 'أحمد'


def test_to_dict_includes_data_after_finalize():
    """to_dict should include scoring data after finalize_validation."""
    game = make_game(letter='ب')
    game.submit_answers('host', {'حيوان': 'بقرة'})
    game.submit_answers('player2', {'حيوان': 'بطة'})
    game.stop_bus('host')

    # Vote both words valid (majority = 2/2)
    game.submit_validation_vote('host', 'حيوان|بقره', True)
    game.submit_validation_vote('player2', 'حيوان|بقره', True)
    game.submit_validation_vote('host', 'حيوان|بطه', True)
    game.submit_validation_vote('player2', 'حيوان|بطه', True)
    game.finalize_validation()

    state = game.to_dict()
    assert state['status'] == 'scoring'
    assert 'round_scores' in state


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
    
    Validation is deferred to stop_bus -> _validate_all_answers, which now
    only populates validation_cache without auto-rejecting. Manual votes
    via finalize_validation determine the final outcome.
    """
    dictionary = {'اسم': ['أحمد']}
    game = BusCompleteGame('g3', 'host', {
        'teams': False,
        'answer_dictionary': dictionary,
        'validate_answers': True,
        'use_online_validation': False
    })
    game.general_wordlist = set()  # disable tier-3 to isolate tier-2
    game.add_player('player2')
    game.start_game()
    game.current_letter = 'ا'

    # 'أمل' starts with alef but NOT in dictionary
    game.submit_answers('host', {'اسم': 'أمل'})

    # At submit time, answer is accepted (only letter checked)
    assert game.player_submissions['host']['اسم'] == 'أمل'
    assert game.invalid_answers.get('host', {}).get('اسم') is None

    # After stop_bus, status becomes 'validating' — answer still present
    game.submit_answers('player2', {'اسم': 'أحمد'})
    game.stop_bus('player2')
    assert game.status == 'validating'
    assert game.player_submissions['host']['اسم'] == 'أمل'

    # Offline cache should flag 'أمل' as invalid (not in dict)
    assert game.validation_cache[('اسم', 'أمل')] is False
    # 'أحمد' is in dict -> cached as valid
    assert game.validation_cache[('اسم', 'أحمد')] is True


def test_general_wordlist_accepts_real_arabic_words():
    """Tier 3: words not in categorized dict but in Hans Wehr should be accepted."""
    dictionary = {'حيوان': ['أرنب']}  # tiny dict, missing أسد
    game = BusCompleteGame('g4', 'host', {
        'teams': False,
        'answer_dictionary': dictionary,
        'validate_answers': True,
        'use_online_validation': False
    })
    # general_wordlist is loaded from static/data/arabic_wordlist.txt by default
    game.add_player('player2')
    game.start_game()
    game.current_letter = 'ا'

    game.submit_answers('host', {'حيوان': 'أسد'})
    game.submit_answers('player2', {'حيوان': 'أرنب'})
    game.stop_bus('host')

    # Answers remain present during validating phase
    assert game.player_submissions['host']['حيوان'] == 'أسد'
    # 'أسد' is NOT in categorized dict but IS in Hans Wehr -> cached as valid via tier 3
    if game.general_wordlist:
        assert game.validation_cache[('حيوان', 'أسد')] is True


def test_partial_submissions_merged_on_stop_bus():
    """Both players' answers should be available after stop_bus,
    even when only one player clicks stop."""
    game = make_game(letter='ه')

    # Player 1 (z) submits answers via real-time partial sync
    game.submit_answers('player2', {'اسم': 'هند', 'حيوان': 'هدهد', 'بلاد': 'هولندا', 'جماد': 'هامر'})
    # Host submits different answers via real-time partial sync
    game.submit_answers('host', {'اسم': 'هناء', 'أكلة': 'هلام', 'بلاد': 'هولندا', 'جماد': 'هامر'})

    # Player 2 stops the bus (their answers are already in partial_submissions)
    game.stop_bus('player2')

    assert game.status == 'validating'
    # Both players' answers must be present
    assert game.player_submissions['host']['اسم'] == 'هناء'
    assert game.player_submissions['host']['أكلة'] == 'هلام'
    assert game.player_submissions['player2']['اسم'] == 'هند'
    assert game.player_submissions['player2']['حيوان'] == 'هدهد'
    # Shared answers present for both
    assert game.player_submissions['host']['بلاد'] == 'هولندا'
    assert game.player_submissions['player2']['بلاد'] == 'هولندا'


def test_shared_answers_score_5_unique_score_10():
    """Duplicate answers between players should score 5 each, unique ones 10."""
    game = make_game(letter='ه')

    game.submit_answers('host', {'اسم': 'هناء', 'بلاد': 'هولندا', 'جماد': 'هامر'})
    game.submit_answers('player2', {'اسم': 'هند', 'بلاد': 'هولندا', 'جماد': 'هامر'})
    game.stop_bus('player2')

    # Vote all words valid
    statuses = game.get_all_validation_statuses()
    for key in statuses:
        game.submit_validation_vote('host', key, True)
        game.submit_validation_vote('player2', key, True)
    game.finalize_validation()

    assert game.status == 'scoring'
    # Unique answers: 10 pts each
    assert game.round_scores['host']['اسم'] == 10   # هناء (unique)
    assert game.round_scores['player2']['اسم'] == 10  # هند (unique)
    # Shared answers: 5 pts each
    assert game.round_scores['host']['بلاد'] == 5    # هولندا (shared)
    assert game.round_scores['player2']['بلاد'] == 5  # هولندا (shared)
    assert game.round_scores['host']['جماد'] == 5    # هامر (shared)
    assert game.round_scores['player2']['جماد'] == 5  # هامر (shared)
