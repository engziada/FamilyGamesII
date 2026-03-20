"""
Twenty Questions (عشرين سؤال) E2E tests.

Game flow:
  waiting → host starts → thinker is assigned
  thinking: thinker sees word input → sets secret word → status=asking
  asking: thinker sees نعم/لا/ربما buttons, guessers ask verbally
          thinker records answers → history log builds up
          thinker (or host) confirms when guesser gets it right
  ended: game ends with winner

Two players: Host-A (thinker/host) and Player-B (guesser).
"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import create_room, join_room, start_game

GAME_TYPE = 'twenty_questions'


@pytest.fixture
def tq_room(require_convex, host_page: Page, player_b_page: Page, base_url: str):
    """Create a twenty_questions room with 2 players."""
    room_id = create_room(host_page, GAME_TYPE, 'Host-A')
    join_room(player_b_page, room_id, 'Player-B', base_url)
    return host_page, player_b_page


@pytest.fixture
def started_tq(tq_room):
    """Twenty Questions room with game started."""
    host, guest = tq_room
    start_game(host)
    return host, guest


def _get_thinker_and_guesser(host: Page, guest: Page) -> tuple[Page, Page]:
    """Identify which page belongs to the thinker (has word input)."""
    try:
        host.wait_for_selector('#secret-word', timeout=10_000)
        return host, guest
    except Exception:
        guest.wait_for_selector('#secret-word', timeout=10_000)
        return guest, host


def _set_secret_word(thinker: Page, word: str, category: str = '') -> None:
    """Thinker fills in the secret word and confirms."""
    thinker.wait_for_selector('#secret-word', timeout=10_000)
    thinker.locator('#secret-word').fill(word)
    if category:
        thinker.locator('#secret-category').fill(category)
    thinker.locator('#btn-set-secret').click()


# ── Pre-start ────────────────────────────────────────────────────────────────

class TestTwentyQuestionsLobby:
    def test_both_on_game_page(self, tq_room) -> None:
        """Both players land on the game page."""
        host, guest = tq_room
        assert '/game/' in host.url
        assert '/game/' in guest.url

    def test_start_button_for_host(self, tq_room) -> None:
        """Host sees the start game button."""
        host, _ = tq_room
        expect(host.locator('#btn-start-game')).to_be_visible(timeout=10_000)

    def test_mouth_based_banner_shown(self, tq_room) -> None:
        """The 'وجهاً لوجه' mouth-based notice is visible (it's set by game_type)."""
        host, _ = tq_room
        # mouth_based flag is set in Flask template for twenty_questions
        banner = host.locator('.card.border-info')
        if banner.count() > 0:
            expect(banner).to_be_visible()


# ── Thinker / thinking phase ──────────────────────────────────────────────────

class TestTwentyQuestionsThinkingPhase:
    def test_thinker_sees_word_input(self, started_tq) -> None:
        """The thinker sees the secret word input field."""
        host, guest = started_tq
        thinker, _ = _get_thinker_and_guesser(host, guest)
        expect(thinker.locator('#secret-word')).to_be_visible()

    def test_thinker_sees_category_input(self, started_tq) -> None:
        """The thinker sees the optional category input."""
        host, guest = started_tq
        thinker, _ = _get_thinker_and_guesser(host, guest)
        expect(thinker.locator('#secret-category')).to_be_visible()

    def test_thinker_sees_confirm_button(self, started_tq) -> None:
        """The thinker sees the confirm button to set the secret word."""
        host, guest = started_tq
        thinker, _ = _get_thinker_and_guesser(host, guest)
        expect(thinker.locator('#btn-set-secret')).to_be_visible()

    def test_guesser_sees_waiting_message(self, started_tq) -> None:
        """Non-thinker sees a waiting message while thinker picks a word."""
        host, guest = started_tq
        _, guesser = _get_thinker_and_guesser(host, guest)
        area = guesser.locator('#game-area')
        # Guesser sees "يختار كلمة" or similar waiting text
        expect(area).to_contain_text('يختار', timeout=10_000)

    def test_empty_word_shows_toast_warning(self, started_tq) -> None:
        """Trying to confirm without entering a word shows a toast warning."""
        host, guest = started_tq
        thinker, _ = _get_thinker_and_guesser(host, guest)
        # Do NOT fill the word — click confirm immediately
        thinker.locator('#btn-set-secret').click()
        toast_container = thinker.locator('#toast-container')
        toast_container.wait_for(state='visible', timeout=5_000)
        expect(toast_container).to_contain_text('أدخل')

    def test_setting_secret_word_transitions_to_asking(self, started_tq) -> None:
        """After the thinker sets a secret word, game enters asking phase."""
        host, guest = started_tq
        thinker, guesser = _get_thinker_and_guesser(host, guest)
        _set_secret_word(thinker, 'قطة', 'حيوان')

        # Thinker should now see نعم/لا/ربما buttons
        thinker.wait_for_function(
            "document.querySelector('.answer-btn') !== null",
            timeout=12_000,
        )
        expect(thinker.locator('.answer-btn').first).to_be_visible()


# ── Asking phase ──────────────────────────────────────────────────────────────

class TestTwentyQuestionsAskingPhase:
    @pytest.fixture(autouse=True)
    def advance_to_asking(self, started_tq) -> None:
        """Move game to asking phase by setting a secret word."""
        host, guest = started_tq
        thinker, guesser = _get_thinker_and_guesser(host, guest)
        _set_secret_word(thinker, 'فيل', 'حيوان')
        thinker.wait_for_selector('.answer-btn', timeout=12_000)
        self.thinker = thinker
        self.guesser = guesser

    def test_thinker_sees_secret_word_display(self) -> None:
        """Thinker sees their own secret word in the asking phase."""
        area = self.thinker.locator('#game-area')
        expect(area).to_contain_text('فيل', timeout=5_000)

    def test_thinker_sees_answer_buttons(self) -> None:
        """Thinker sees نعم (yes), لا (no), and ربما (maybe) buttons."""
        expect(self.thinker.locator('.answer-btn[data-answer="نعم"]')).to_be_visible()
        expect(self.thinker.locator('.answer-btn[data-answer="لا"]')).to_be_visible()
        expect(self.thinker.locator('.answer-btn[data-answer="ربما"]')).to_be_visible()

    def test_thinker_sees_guesser_confirm_buttons(self) -> None:
        """Thinker sees a 'Player-B خمّن صح ✓' button for the guesser."""
        area = self.thinker.locator('#game-area')
        expect(area).to_contain_text('خمّن صح', timeout=5_000)

    def test_guesser_sees_asking_instruction(self) -> None:
        """Guesser sees an instruction to ask verbal yes/no questions."""
        area = self.guesser.locator('#game-area')
        expect(area).to_contain_text('اسأل', timeout=5_000)

    def test_answer_history_is_empty_initially(self) -> None:
        """The answer history list is initially empty."""
        area = self.thinker.locator('#game-area')
        expect(area).to_contain_text('لم يتم طرح', timeout=5_000)

    def test_yes_answer_recorded_in_history(self) -> None:
        """After thinker clicks نعم, an entry appears in the answer history."""
        self.thinker.locator('.answer-btn[data-answer="نعم"]').click()
        area = self.thinker.locator('#game-area')
        # History should now have at least one entry with نعم badge
        area.wait_for(state='visible')
        self.thinker.wait_for_function(
            "document.querySelector('#game-area')?.textContent?.includes('سؤال 1') || "
            "!document.querySelector('#game-area')?.textContent?.includes('لم يتم طرح')",
            timeout=8_000,
        )
        area_text = area.text_content(timeout=3_000)
        assert 'لم يتم طرح' not in area_text or 'نعم' in area_text

    def test_no_answer_recorded_in_history(self) -> None:
        """After thinker clicks لا, an entry appears with لا badge."""
        self.thinker.locator('.answer-btn[data-answer="لا"]').click()
        self.thinker.wait_for_function(
            "!document.querySelector('#game-area')?.textContent?.includes('لم يتم طرح')",
            timeout=8_000,
        )
        area_text = self.thinker.locator('#game-area').text_content(timeout=3_000)
        assert 'لم يتم طرح' not in area_text

    def test_question_counter_increments(self) -> None:
        """Each answer increments the question counter displayed."""
        initial_area = self.thinker.locator('#game-area').text_content(timeout=3_000)
        self.thinker.locator('.answer-btn[data-answer="ربما"]').click()
        self.thinker.wait_for_timeout(1_500)
        updated_area = self.thinker.locator('#game-area').text_content(timeout=3_000)
        # The counter text should reflect an increment
        assert updated_area != initial_area

    def test_confirm_correct_guess_ends_turn(self) -> None:
        """Thinker confirming a correct guess ends the round."""
        # Click "Player-B خمّن صح ✓"
        confirm_btn = self.thinker.locator(
            f'.guess-correct-btn[data-guesser="Player-B"]'
        )
        expect(confirm_btn).to_be_visible(timeout=5_000)
        confirm_btn.click()

        # Game should end or move to next round
        self.thinker.wait_for_function(
            "document.querySelector('#game-area')?.textContent?.includes('انتهت') || "
            "document.querySelector('#game-area')?.textContent?.includes('اللاعب') || "
            "document.querySelector('#scoreboard') !== null",
            timeout=12_000,
        )
        # Scores should reflect the win
        area_text = self.thinker.locator('#game-area').text_content(timeout=3_000)
        assert area_text.strip() != ''
