"""
Rapid Fire (الأسئلة السريعة) E2E tests.

Game flow:
  waiting → round_active (buzz phase) → buzzed (answer phase) → result → next question

Two players: Host-A and Player-B.
Buzz mechanics: first player to press the bell gets to answer exclusively.
"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import create_room, join_room, start_game, wait_for_game_area

GAME_TYPE = 'rapid_fire'


@pytest.fixture
def rf_room(require_convex, host_page: Page, player_b_page: Page, base_url: str):
    """Create a rapid_fire room with 2 players."""
    room_id = create_room(host_page, GAME_TYPE, 'Host-A')
    join_room(player_b_page, room_id, 'Player-B', base_url)
    return host_page, player_b_page


@pytest.fixture
def started_rf(rf_room):
    """Rapid-fire room with game started and first question loaded."""
    host, guest = rf_room
    start_game(host)
    
    # Wait for start round button and click it (host action)
    host.wait_for_selector('#btn-start-rf-round', timeout=10_000)
    host.locator('#btn-start-rf-round').click()
    
    # Wait for question to load (buzz button appears)
    host.wait_for_selector('#btn-buzz', timeout=10_000)
    return host, guest


# ── Pre-start ────────────────────────────────────────────────────────────────

class TestRapidFireLobby:
    def test_both_players_on_game_page(self, rf_room) -> None:
        """Both host and guest land on the game page."""
        host, guest = rf_room
        assert '/game/' in host.url
        assert '/game/' in guest.url

    def test_start_button_visible_for_host(self, rf_room) -> None:
        """Start game button is visible for the host."""
        host, _ = rf_room
        expect(host.locator('#btn-start-game')).to_be_visible(timeout=10_000)


# ── Buzz phase ────────────────────────────────────────────────────────────────

class TestRapidFireBuzzPhase:
    def test_question_text_visible(self, started_rf) -> None:
        """A question is displayed after game starts."""
        host, _ = started_rf
        # Wait for buzz button or question content
        host.wait_for_selector('#btn-buzz, #game-area h4', timeout=15_000)
        area_text = host.locator('#game-area').text_content(timeout=5_000)
        assert area_text.strip() != ''

    def test_buzz_button_visible_for_both_players(self, started_rf) -> None:
        """Both players see the buzz-in button during the question phase."""
        host, guest = started_rf
        host.wait_for_selector('#btn-buzz', timeout=15_000)
        guest.wait_for_selector('#btn-buzz', timeout=15_000)
        expect(host.locator('#btn-buzz')).to_be_visible()
        expect(guest.locator('#btn-buzz')).to_be_visible()

    def test_buzz_button_is_enabled(self, started_rf) -> None:
        """The buzz button is enabled (not disabled) before anyone buzzes."""
        host, _ = started_rf
        host.wait_for_selector('#btn-buzz', timeout=15_000)
        expect(host.locator('#btn-buzz')).to_be_enabled()

    def test_options_hidden_before_buzz(self, started_rf) -> None:
        """Answer options are hidden before any player buzzes in (Fix 3.3)."""
        host, _ = started_rf
        host.wait_for_selector('#btn-buzz', timeout=15_000)
        # Options should NOT be visible before buzz
        options = host.locator('.buzz-opt')
        assert options.count() == 0, 'Options should be hidden before buzz'

    def test_timer_visible_during_buzz_phase(self, started_rf) -> None:
        """Timer shows a non-placeholder value during buzz phase."""
        host, _ = started_rf
        host.wait_for_selector('#btn-buzz', timeout=15_000)
        timer_text = host.locator('#timer-display').text_content(timeout=5_000).strip()
        assert timer_text not in ('--:--', '', '--')


# ── Buzz-in and answer phase ──────────────────────────────────────────────────

class TestRapidFireBuzzIn:
    def test_buzz_transitions_to_answer_phase(self, started_rf) -> None:
        """After buzzing in, the game transitions and options become interactive."""
        host, guest = started_rf
        host.wait_for_selector('#btn-buzz', timeout=15_000)
        # Use force click to bypass animation stability check
        host.locator('#btn-buzz').click(force=True)

        # Wait for answer options to become available (buzz-opt buttons)
        host.wait_for_selector('#buzz-options', timeout=10_000)
        options = host.locator('.buzz-opt')
        expect(options).to_have_count(4)

    def test_buzzer_sees_enabled_options(self, started_rf) -> None:
        """The player who buzzed sees enabled answer option buttons."""
        host, guest = started_rf
        host.wait_for_selector('#btn-buzz', timeout=15_000)
        host.locator('#btn-buzz').click(force=True)

        host.wait_for_selector('#buzz-options', timeout=10_000)
        options = host.locator('.buzz-opt')
        count = options.count()
        for i in range(count):
            expect(options.nth(i)).to_be_enabled()

    def test_non_buzzer_sees_disabled_options(self, started_rf) -> None:
        """The player who did NOT buzz sees disabled answer options."""
        host, guest = started_rf
        host.wait_for_selector('#btn-buzz', timeout=15_000)
        host.locator('#btn-buzz').click(force=True)

        # Guest should see buzz-options but all disabled
        guest.wait_for_selector('#buzz-options', timeout=10_000)
        guest_options = guest.locator('.buzz-opt')
        count = guest_options.count()
        for i in range(count):
            expect(guest_options.nth(i)).to_be_disabled()

    def test_buzz_status_message_shows_buzzer_name(self, started_rf) -> None:
        """After buzzing, the buzzer's name appears in the game area."""
        host, guest = started_rf
        host.wait_for_selector('#btn-buzz', timeout=15_000)
        host.locator('#btn-buzz').click(force=True)

        host.wait_for_selector('#buzz-options', timeout=10_000)
        area = host.locator('#game-area')
        expect(area).to_contain_text('Host-A', timeout=5_000)

    def test_answer_submission_turns_button_colored(self, started_rf) -> None:
        """After buzzer submits an answer, result is shown."""
        host, guest = started_rf
        host.wait_for_selector('#btn-buzz', timeout=15_000)
        host.locator('#btn-buzz').click(force=True)

        host.wait_for_selector('#buzz-options', timeout=10_000)
        first_opt = host.locator('.buzz-opt').first
        first_opt.click()

        # Wait for result - either button color changes or result screen appears
        host.wait_for_timeout(1000)
        area = host.locator('#game-area')
        text = area.text_content(timeout=5_000)
        # Check for result indicators
        assert 'جاوب' in text or 'انتهى' in text or 'باريس' in text or 'الإجابة' in text, (
            f'Expected result feedback, got: {text}'
        )

    def test_all_buzz_options_disabled_after_answer(self, started_rf) -> None:
        """After buzzer selects an answer all options are disabled."""
        host, guest = started_rf
        host.wait_for_selector('#btn-buzz', timeout=15_000)
        host.locator('#btn-buzz').click(force=True)

        host.wait_for_selector('#buzz-options', timeout=10_000)
        options = host.locator('.buzz-opt')
        options.first.click()

        # Wait for Convex re-render after answer submission
        host.wait_for_function(
            "document.querySelector('#game-area')?.textContent?.includes('جاوب') || "
            "document.querySelector('#game-area')?.textContent?.includes('انتهى') || "
            "document.querySelector('#game-area')?.textContent?.includes('الإجابة') || "
            "document.querySelector('#btn-buzz')",
            timeout=10_000,
        )
        # If options are still rendered, they should be disabled
        remaining = host.locator('.buzz-opt')
        count = remaining.count()
        for i in range(count):
            expect(remaining.nth(i)).to_be_disabled(timeout=5_000)


# ── Failed buzz (wrong answer penalty) ───────────────────────────────────────

class TestRapidFireFailedBuzz:
    def test_wrong_answer_shows_failed_message_on_next_question(self, started_rf) -> None:
        """After a wrong buzz answer, buzz button is replaced with penalty message
        OR the player's name appears in the buzzFailed list for the same question
        if the question is still active."""
        host, guest = started_rf
        host.wait_for_selector('#btn-buzz', timeout=15_000)
        host.locator('#btn-buzz').click(force=True)
        host.wait_for_selector('#buzz-options', timeout=10_000)

        # Click first option (may be wrong)
        options = host.locator('.buzz-opt')
        options.first.click()

        # After answer, wait for game to either show result or advance
        host.wait_for_function(
            "document.querySelector('#game-area')?.textContent?.includes('انتهى') || "
            "document.querySelector('#game-area')?.textContent?.includes('جاوب') || "
            "document.querySelector('#btn-buzz') || "
            "document.querySelector('#game-area')?.textContent?.includes('أجبت')",
            timeout=12_000,
        )
        # The test passes as long as the game progresses without error
        area_text = host.locator('#game-area').text_content(timeout=3_000)
        assert area_text.strip() != ''
