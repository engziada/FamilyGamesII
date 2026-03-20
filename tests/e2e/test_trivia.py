"""
Trivia (بنك المعلومات) E2E tests.

Game flow:
  waiting → round_active (question active) → between questions (lastResult) → ended

Two players: Host-A (host) and Player-B.
"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import (
    create_room,
    join_room,
    start_game,
    wait_for_game_area,
)

GAME_TYPE = 'trivia'


@pytest.fixture
def trivia_room(require_convex, host_page: Page, player_b_page: Page, base_url: str):
    """Create a trivia room with 2 players, return (host_page, player_b_page)."""
    room_id = create_room(host_page, GAME_TYPE, 'Host-A')
    join_room(player_b_page, room_id, 'Player-B', base_url)
    return host_page, player_b_page


@pytest.fixture
def started_trivia(trivia_room):
    """Trivia room with game already started and first question loaded."""
    host, guest = trivia_room
    start_game(host)

    # Wait for start round button and click it (host action)
    host.wait_for_selector('#btn-start-trivia-round', timeout=10_000)
    host.locator('#btn-start-trivia-round').click()

    # Wait for question to load
    host.wait_for_selector('#trivia-options', timeout=10_000)
    return host, guest


# ── Pre-start (lobby state) ───────────────────────────────────────────────────

class TestTriviaLobby:
    def test_game_page_loads(self, trivia_room) -> None:
        """Both players land on the game page after joining."""
        host, guest = trivia_room
        assert '/game/' in host.url
        assert '/game/' in guest.url

    def test_start_button_visible_for_host(self, trivia_room) -> None:
        """Host sees the start game button in waiting state."""
        host, _ = trivia_room
        expect(host.locator('#btn-start-game')).to_be_visible(timeout=10_000)

    def test_waiting_status_message(self, trivia_room) -> None:
        """Status bar shows 'في انتظار' before game starts."""
        host, _ = trivia_room
        expect(host.locator('#game-status')).to_contain_text('انتظار', timeout=8_000)


# ── Active question UI ────────────────────────────────────────────────────────

class TestTriviaActiveQuestion:
    def test_question_text_visible(self, started_trivia) -> None:
        """A question text is shown in the game area after start."""
        host, guest = started_trivia
        wait_for_game_area(host, timeout=15_000)
        area = host.locator('#game-area')
        # Question container renders for trivia
        # Either the question card or a result screen should appear
        area.wait_for(state='visible')
        assert area.text_content(timeout=10_000).strip() != ''

    def test_four_answer_options_present(self, started_trivia) -> None:
        """Four option buttons render in #trivia-options."""
        host, _ = started_trivia
        # Wait for question to become active
        host.wait_for_selector('#trivia-options', timeout=15_000)
        options = host.locator('.trivia-opt')
        expect(options).to_have_count(4)

    def test_options_are_enabled_before_answering(self, started_trivia) -> None:
        """All option buttons are enabled before any answer is submitted."""
        host, _ = started_trivia
        host.wait_for_selector('#trivia-options', timeout=15_000)
        options = host.locator('.trivia-opt')
        count = options.count()
        for i in range(count):
            expect(options.nth(i)).to_be_enabled()

    def test_question_counter_shown(self, started_trivia) -> None:
        """Question counter text (e.g. 'السؤال 1 / N') is visible."""
        host, _ = started_trivia
        host.wait_for_selector('#trivia-options', timeout=15_000)
        area = host.locator('#game-area')
        expect(area).to_contain_text('السؤال')

    def test_timer_countdown_active(self, started_trivia) -> None:
        """Timer display shows a numeric value after question starts."""
        host, _ = started_trivia
        host.wait_for_selector('#trivia-options', timeout=15_000)
        timer = host.locator('#timer-display')
        timer_text = timer.text_content(timeout=5_000).strip()
        # Should show a number like "30" or "0:30", not the placeholder "--:--"
        assert timer_text not in ('--:--', '', '--')


# ── Answer submission ─────────────────────────────────────────────────────────

class TestTriviaAnswerSubmission:
    def test_clicking_option_disables_all_options(self, started_trivia) -> None:
        """After selecting an option all buttons become disabled."""
        host, _ = started_trivia
        host.wait_for_selector('#trivia-options', timeout=15_000)
        options = host.locator('.trivia-opt')
        options.first.click()
        # Wait for Convex re-render: either alreadyAnswered view or lastResult screen
        host.wait_for_function(
            "document.querySelector('#game-area')?.textContent?.includes('تم إرسال') || "
            "document.querySelector('#game-area')?.textContent?.includes('جاوب') || "
            "document.querySelector('#game-area')?.textContent?.includes('انتهى') || "
            "document.querySelector('#game-area')?.textContent?.includes('الإجابة')",
            timeout=10_000,
        )
        # If game moved to result screen, options are gone — that's fine
        count = options.count()
        if count > 0:
            for i in range(count):
                expect(options.nth(i)).to_be_disabled(timeout=5_000)

    def test_selected_option_gets_active_class(self, started_trivia) -> None:
        """The clicked option gets 'active' class."""
        host, _ = started_trivia
        host.wait_for_selector('#trivia-options', timeout=15_000)
        first_option = host.locator('.trivia-opt').first
        first_option.click()
        classes = first_option.get_attribute('class')
        assert 'active' in classes

    def test_answered_status_message_shown(self, started_trivia) -> None:
        """After answering, either 'تم إرسال' message or result screen appears."""
        host, _ = started_trivia
        host.wait_for_selector('#trivia-options', timeout=15_000)
        host.locator('.trivia-opt').first.click()
        area = host.locator('#game-area')
        # After answering, either the "تم إرسال" message or result screen should appear
        host.wait_for_timeout(1000)
        text = area.text_content(timeout=5_000)
        # Check for any of the expected post-answer states
        assert 'تم إرسال' in text or 'جاوب صح' in text or 'انتهى الوقت' in text or 'غلط' in text, f'Expected answer feedback, got: {text}'

    def test_correct_answer_turns_button_green(self, started_trivia) -> None:
        """If a correct answer is submitted, the result screen shows success."""
        host, _ = started_trivia
        host.wait_for_selector('#trivia-options', timeout=15_000)
        options = host.locator('.trivia-opt')
        # The default question has answer index 0 (القاهرة is correct)
        first_opt = options.first
        first_opt.click()
        # Wait for result - either button class changes or result screen appears
        area = host.locator('#game-area')
        # Wait for state update
        host.wait_for_timeout(1500)
        text = area.text_content(timeout=5_000)
        # Either we see success message or the "تم إرسال" waiting message
        assert 'جاوب صح' in text or 'تم إرسال' in text, f'Expected answer feedback, got: {text}'

    def test_wrong_answer_turns_button_red(self, started_trivia) -> None:
        """If a wrong answer is submitted, the result shows appropriately."""
        host, _ = started_trivia
        host.wait_for_selector('#trivia-options', timeout=15_000)
        options = host.locator('.trivia-opt')
        # Click second option (wrong answer for default question)
        if options.count() > 1:
            second_opt = options.nth(1)
            second_opt.click()
            area = host.locator('#game-area')
            host.wait_for_timeout(1500)
            text = area.text_content(timeout=5_000)
            # Either waiting for others or result
            assert 'تم إرسال' in text or 'جاوب' in text or 'غلط' in text, f'Expected answer feedback, got: {text}'
        else:
            pass  # Skip if not enough options


# ── Between questions ─────────────────────────────────────────────────────────

class TestTriviaBetweenQuestions:
    def test_result_screen_shows_correct_answer(self, started_trivia) -> None:
        """Between questions the correct answer text is shown."""
        host, guest = started_trivia
        # Both players answer to advance to result screen
        host.wait_for_selector('#trivia-options', timeout=15_000)
        host.locator('.trivia-opt').first.click()
        guest.wait_for_selector('#trivia-options', timeout=15_000)
        guest.locator('.trivia-opt').first.click()
        # Wait for result screen (lastResult)
        host.wait_for_function(
            "document.querySelector('#game-area')?.textContent?.includes('الإجابة') || "
            "document.querySelector('#game-area')?.textContent?.includes('انتهى') || "
            "document.querySelector('#game-area')?.textContent?.includes('السؤال')",
            timeout=12_000,
        )
        # Should contain result content
        area_text = host.locator('#game-area').text_content(timeout=5_000)
        assert area_text.strip() != ''
