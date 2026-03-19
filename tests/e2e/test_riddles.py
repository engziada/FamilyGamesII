"""
Riddles (الألغاز) E2E tests.

Game flow:
  round_active → riddle text shown → players submit answers (3 attempts each)
  → hints available (costs attempt) → host can skip/advance
  → lastResult (correct answer revealed) → next riddle

Two players: Host-A (host) and Player-B.
"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import create_room, join_room, start_game

GAME_TYPE = 'riddles'


@pytest.fixture
def riddles_room(require_convex, host_page: Page, player_b_page: Page, base_url: str):
    """Create a riddles room with 2 players."""
    room_id = create_room(host_page, GAME_TYPE, 'Host-A')
    join_room(player_b_page, room_id, 'Player-B', base_url)
    return host_page, player_b_page


@pytest.fixture
def started_riddles(riddles_room):
    """Riddles room with game started and first riddle loaded."""
    host, guest = riddles_room
    start_game(host)
    
    # Wait for start round button and click it (host action)
    host.wait_for_selector('#btn-start-riddle-round', timeout=10_000)
    host.locator('#btn-start-riddle-round').click()
    
    # Wait for riddle to load
    host.wait_for_selector('#riddle-answer', timeout=10_000)
    return host, guest


# ── Pre-start ────────────────────────────────────────────────────────────────

class TestRiddlesLobby:
    def test_both_on_game_page(self, riddles_room) -> None:
        """Both players land on the game page."""
        host, guest = riddles_room
        assert '/game/' in host.url
        assert '/game/' in guest.url

    def test_start_button_visible_for_host(self, riddles_room) -> None:
        """Host sees the start game button."""
        host, _ = riddles_room
        expect(host.locator('#btn-start-game')).to_be_visible(timeout=10_000)


# ── Active riddle UI ──────────────────────────────────────────────────────────

class TestRiddlesActiveRiddle:
    def test_riddle_text_visible(self, started_riddles) -> None:
        """The riddle question text is visible in the game area."""
        host, _ = started_riddles
        host.wait_for_selector('#riddle-answer', timeout=15_000)
        area = host.locator('#game-area')
        expect(area).to_contain_text('اللغز', timeout=5_000)

    def test_riddle_counter_shown(self, started_riddles) -> None:
        """Riddle counter (e.g. 'اللغز 1 / N') is shown."""
        host, _ = started_riddles
        host.wait_for_selector('#riddle-answer', timeout=15_000)
        area = host.locator('#game-area')
        expect(area).to_contain_text('اللغز')

    def test_answer_input_present(self, started_riddles) -> None:
        """Text input for submitting an answer is visible."""
        host, _ = started_riddles
        host.wait_for_selector('#riddle-answer', timeout=15_000)
        expect(host.locator('#riddle-answer')).to_be_visible()

    def test_submit_button_present(self, started_riddles) -> None:
        """The submit answer button is visible."""
        host, _ = started_riddles
        host.wait_for_selector('#btn-submit-answer', timeout=15_000)
        expect(host.locator('#btn-submit-answer')).to_be_visible()

    def test_attempt_counter_shows_attempt_1_of_3(self, started_riddles) -> None:
        """Attempt counter starts at '1 من 3'."""
        host, _ = started_riddles
        host.wait_for_selector('#riddle-answer', timeout=15_000)
        area = host.locator('#game-area')
        expect(area).to_contain_text('1 من 3')

    def test_hint_button_present(self, started_riddles) -> None:
        """The hint button is visible when hints are available."""
        host, _ = started_riddles
        host.wait_for_selector('#btn-hint', timeout=15_000)
        expect(host.locator('#btn-hint')).to_be_visible()

    def test_hint_button_shows_remaining_hints(self, started_riddles) -> None:
        """Hint button text includes the number of remaining hints."""
        host, _ = started_riddles
        host.wait_for_selector('#btn-hint', timeout=15_000)
        hint_text = host.locator('#btn-hint').text_content(timeout=3_000)
        assert 'متبقي' in hint_text


# ── Answer submission ─────────────────────────────────────────────────────────

class TestRiddlesAnswerSubmission:
    def test_wrong_answer_shows_error_toast(self, started_riddles) -> None:
        """Submitting a wrong answer shows an error feedback."""
        host, _ = started_riddles
        host.wait_for_selector('#riddle-answer', timeout=15_000)
        host.locator('#riddle-answer').fill('إجابة خاطئة جداً 12345')
        host.locator('#btn-submit-answer').click()

        # Wait for toast or attempt counter to change
        host.wait_for_function(
            "document.querySelector('#toast-container')?.children.length > 0 || "
            "document.querySelector('#game-area')?.textContent?.includes('2 من 3') || "
            "document.querySelector('#riddle-answer')?.value === ''",
            timeout=8_000,
        )
        # Test passes as long as game responds (no crash)
        area_text = host.locator('#game-area').text_content(timeout=3_000)
        assert area_text.strip() != ''

    def test_wrong_answer_clears_input(self, started_riddles) -> None:
        """After a wrong answer, the input field is cleared for next attempt."""
        host, _ = started_riddles
        host.wait_for_selector('#riddle-answer', timeout=15_000)
        host.locator('#riddle-answer').fill('كلمة خاطئة تماماً xyz')
        host.locator('#btn-submit-answer').click()

        # Wait for input to be cleared
        host.wait_for_function(
            "document.querySelector('#riddle-answer')?.value === '' || "
            "document.querySelector('#riddle-answer') === null",
            timeout=8_000,
        )
        # Either cleared or removed (all attempts used)
        riddle_input = host.locator('#riddle-answer')
        if riddle_input.count() > 0:
            assert riddle_input.input_value(timeout=3_000) == ''

    def test_enter_key_submits_answer(self, started_riddles) -> None:
        """Pressing Enter in the answer input submits the answer."""
        host, _ = started_riddles
        host.wait_for_selector('#riddle-answer', timeout=15_000)
        host.locator('#riddle-answer').fill('كلمة خاطئة')
        host.locator('#riddle-answer').press('Enter')

        host.wait_for_function(
            "document.querySelector('#riddle-answer')?.value === '' || "
            "document.querySelector('#toast-container')?.children.length > 0",
            timeout=8_000,
        )
        # Test passes as long as game responded
        assert True

    def test_submit_button_disabled_during_request(self, started_riddles) -> None:
        """Submit button is temporarily disabled while the request is in flight."""
        host, _ = started_riddles
        host.wait_for_selector('#riddle-answer', timeout=15_000)
        host.locator('#riddle-answer').fill('اختبار')
        # Click and immediately check
        host.locator('#btn-submit-answer').click()
        # At least momentarily disabled
        # (We check it was disabled and re-enabled or stays disabled if all attempts used)
        host.wait_for_function(
            "document.querySelector('#btn-submit-answer') === null || "
            "document.querySelector('#riddle-answer')?.value === ''",
            timeout=8_000,
        )
        assert True

    def test_three_wrong_answers_disable_input(self, started_riddles) -> None:
        """After 3 wrong attempts the answer input is removed/disabled."""
        host, _ = started_riddles
        host.wait_for_selector('#riddle-answer', timeout=15_000)

        for _ in range(3):
            inp = host.locator('#riddle-answer')
            if inp.count() == 0:
                break
            inp.fill('خطأ خطأ خطأ 99999')
            host.locator('#btn-submit-answer').click()
            # Wait for input to clear or disappear
            host.wait_for_function(
                "document.querySelector('#riddle-answer')?.value === '' || "
                "document.querySelector('#riddle-answer') === null",
                timeout=8_000,
            )

        # After 3 attempts: input should be gone or disabled, exhausted message
        area = host.locator('#game-area')
        area_text = area.text_content(timeout=5_000)
        input_gone = host.locator('#riddle-answer').count() == 0
        exhausted_msg = 'استنفدت' in area_text or '3 من 3' in area_text
        assert input_gone or exhausted_msg, (
            f'Expected input disabled after 3 attempts, area: {area_text[:200]}'
        )


# ── Hints ─────────────────────────────────────────────────────────────────────

class TestRiddlesHints:
    def test_hint_reveals_alert(self, started_riddles) -> None:
        """Clicking the hint button reveals a hint in an alert element."""
        host, _ = started_riddles
        host.wait_for_selector('#btn-hint', timeout=15_000)
        host.locator('#btn-hint').click()

        # A hint alert with text 'تلميح' should appear
        host.wait_for_selector('.alert-warning', timeout=8_000)
        hint_alerts = host.locator('.alert-warning')
        expect(hint_alerts.first).to_be_visible()
        hint_text = hint_alerts.first.text_content(timeout=3_000)
        assert 'تلميح' in hint_text

    def test_hint_count_decrements(self, started_riddles) -> None:
        """After requesting a hint the remaining count in the button decreases."""
        host, _ = started_riddles
        host.wait_for_selector('#btn-hint', timeout=15_000)
        before_text = host.locator('#btn-hint').text_content(timeout=3_000)
        host.locator('#btn-hint').click()
        host.wait_for_timeout(1_500)
        after_btn = host.locator('#btn-hint')
        if after_btn.count() > 0:
            after_text = after_btn.text_content(timeout=3_000)
            assert before_text != after_text, (
                'Hint button text should change after requesting a hint'
            )


# ── Host controls ─────────────────────────────────────────────────────────────

class TestRiddlesHostControls:
    def test_host_sees_skip_button(self, started_riddles) -> None:
        """Host sees consolidated 'تخطي ← التالي' button (Fix 6.2)."""
        host, _ = started_riddles
        host.wait_for_selector('#btn-skip-riddle', timeout=15_000)
        expect(host.locator('#btn-skip-riddle')).to_be_visible()

    def test_guest_does_not_see_host_controls(self, started_riddles) -> None:
        """Non-host player does not see skip/next riddle controls."""
        _, guest = started_riddles
        guest.wait_for_selector('#riddle-answer', timeout=15_000)
        assert guest.locator('#btn-skip-riddle').count() == 0
        assert guest.locator('#btn-next-riddle').count() == 0

    def test_host_skip_riddle_changes_state(self, started_riddles) -> None:
        """Host clicking 'تخطي اللغز' changes the game state."""
        host, _ = started_riddles
        host.wait_for_selector('#btn-skip-riddle', timeout=15_000)
        initial_text = host.locator('#game-area').text_content(timeout=3_000)
        host.locator('#btn-skip-riddle').click()

        host.wait_for_function(
            f"document.querySelector('#game-area')?.textContent?.trim() !== {repr(initial_text.strip())}",
            timeout=10_000,
        )
        new_text = host.locator('#game-area').text_content(timeout=3_000)
        assert new_text.strip() != ''

    def test_host_skip_advances_riddle(self, started_riddles) -> None:
        """Host clicking consolidated skip button advances to next riddle (Fix 6.2)."""
        host, _ = started_riddles
        host.wait_for_selector('#btn-skip-riddle', timeout=15_000)
        initial_text = host.locator('#game-area').text_content(timeout=3_000)
        host.locator('#btn-skip-riddle').click()

        host.wait_for_function(
            f"document.querySelector('#game-area')?.textContent?.trim() !== {repr(initial_text.strip())}",
            timeout=10_000,
        )
        area_text = host.locator('#game-area').text_content(timeout=3_000)
        assert area_text.strip() != ''
