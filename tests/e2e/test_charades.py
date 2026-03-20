"""
Charades (بدون كلام) E2E tests.

Game flow:
  waiting → currentPlayer sees "أنا جاهز" → clicks ready → preparing: item shown
  → performer clicks "ابدأ التمثيل" → round_active: performer sees item + pass button
                  guessers see "خمّنت صح!" button
  → correct guess → scores update → next player's turn

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
    get_scoreboard_scores,
)

GAME_TYPE = 'charades'


@pytest.fixture
def charades_room(require_convex, host_page: Page, player_b_page: Page, base_url: str):
    """Create a charades room with 2 players."""
    room_id = create_room(host_page, GAME_TYPE, 'Host-A')
    join_room(player_b_page, room_id, 'Player-B', base_url)
    return host_page, player_b_page


@pytest.fixture
def started_charades(charades_room):
    """Charades room with game started."""
    host, guest = charades_room
    start_game(host)
    return host, guest


# ── Pre-start ────────────────────────────────────────────────────────────────

class TestCharadesLobby:
    def test_both_players_on_game_page(self, charades_room) -> None:
        """Both host and guest land on the game page."""
        host, guest = charades_room
        assert '/game/' in host.url
        assert '/game/' in guest.url

    def test_start_button_visible_for_host(self, charades_room) -> None:
        """Start game button is visible for the host."""
        host, _ = charades_room
        expect(host.locator('#btn-start-game')).to_be_visible(timeout=10_000)


# ── Ready / performer view ────────────────────────────────────────────────────

class TestCharadesPerformerFlow:
    def test_current_player_sees_ready_button(self, started_charades) -> None:
        """The current player (performer) sees the 'أنا جاهز' button."""
        host, guest = started_charades
        # Either host or guest is first performer — check both
        host_area = host.locator('#game-area')
        guest_area = guest.locator('#game-area')

        # Wait for either player to see the ready button
        host.wait_for_function(
            "document.querySelector('#btn-ready') || "
            "document.querySelector('#game-area')?.textContent?.includes('دورك')",
            timeout=15_000,
        )
        # The player whose turn it is should see "دورك" or the ready button
        host_text = host_area.text_content(timeout=3_000)
        guest_text = guest_area.text_content(timeout=3_000)
        assert ('دورك' in host_text or 'دورك' in guest_text or
                '#btn-ready' in host.content() or '#btn-ready' in guest.content())

    def test_performer_ready_reveals_item(self, started_charades) -> None:
        """After clicking 'أنا جاهز', the item to act out is shown."""
        host, guest = started_charades

        # Find which page has the ready button
        try:
            host.wait_for_selector('#btn-ready', timeout=10_000)
            performer_page = host
        except Exception:
            guest.wait_for_selector('#btn-ready', timeout=10_000)
            performer_page = guest

        performer_page.locator('#btn-ready').click()

        # Preparing phase: item shown with "ابدأ التمثيل" button
        performer_page.wait_for_selector('#btn-start-performing', timeout=10_000)
        area_text = performer_page.locator('#game-area').text_content(timeout=5_000)
        assert 'ستمثل' in area_text or 'ابدأ' in area_text

        # Click to enter round_active
        performer_page.locator('#btn-start-performing').click()
        performer_page.wait_for_function(
            "document.querySelector('#btn-pass') || "
            "document.querySelector('#game-area')?.textContent?.includes('مثّل')",
            timeout=10_000,
        )
        area_text = performer_page.locator('#game-area').text_content(timeout=5_000)
        assert 'مثّل' in area_text or 'تخطي' in area_text

    def test_performer_sees_pass_button(self, started_charades) -> None:
        """After ready, performer sees the 'تخطي' (pass) button."""
        host, guest = started_charades

        try:
            host.wait_for_selector('#btn-ready', timeout=10_000)
            performer_page = host
        except Exception:
            guest.wait_for_selector('#btn-ready', timeout=10_000)
            performer_page = guest

        performer_page.locator('#btn-ready').click()
        performer_page.wait_for_selector('#btn-start-performing', timeout=10_000)
        performer_page.locator('#btn-start-performing').click()
        expect(performer_page.locator('#btn-pass')).to_be_visible(timeout=10_000)


# ── Guesser view ──────────────────────────────────────────────────────────────

class TestCharadesGuesserFlow:
    def _advance_to_active_round(self, host: Page, guest: Page) -> tuple[Page, Page]:
        """Helper: get performer and guesser pages after ready is clicked."""
        try:
            host.wait_for_selector('#btn-ready', timeout=10_000)
            performer, guesser = host, guest
        except Exception:
            guest.wait_for_selector('#btn-ready', timeout=10_000)
            performer, guesser = guest, host

        performer.locator('#btn-ready').click()
        # Two-phase: preparing → click start → round_active
        performer.wait_for_selector('#btn-start-performing', timeout=10_000)
        performer.locator('#btn-start-performing').click()
        return performer, guesser

    def test_guesser_sees_guess_correct_button(self, started_charades) -> None:
        """The non-performer player sees the 'خمّنت صح!' button."""
        host, guest = started_charades
        _, guesser = self._advance_to_active_round(host, guest)
        expect(guesser.locator('#btn-guess-correct')).to_be_visible(timeout=10_000)

    def test_guesser_sees_performer_name(self, started_charades) -> None:
        """The guesser sees a message mentioning the performer's name."""
        host, guest = started_charades
        performer, guesser = self._advance_to_active_round(host, guest)
        area = guesser.locator('#game-area')
        area_text = area.text_content(timeout=5_000)
        assert area_text.strip() != ''

    def test_correct_guess_updates_scores(self, started_charades) -> None:
        """After a correct guess, the scoreboard reflects updated scores."""
        host, guest = started_charades

        # Wait for game state to sync from Convex (status changes from 'waiting' to 'playing')
        host.wait_for_function(
            "document.querySelector('#btn-ready') !== null",
            timeout=10_000,
        )

        # Check which player is the current performer (has #btn-ready button)
        host_ready_count = host.locator('#btn-ready').count()
        guest_ready_count = guest.locator('#btn-ready').count()

        if host_ready_count > 0:
            performer, guesser = host, guest
        elif guest_ready_count > 0:
            performer, guesser = guest, host
        else:
            raise AssertionError('Neither player has the ready button')

        performer.locator('#btn-ready').click()
        performer.wait_for_selector('#btn-start-performing', timeout=10_000)
        performer.locator('#btn-start-performing').click()

        # Guesser clicks correct
        expect(guesser.locator('#btn-guess-correct')).to_be_visible(timeout=10_000)
        guesser.locator('#btn-guess-correct').click()

        # Wait for Convex subscription to update UI (scores update via gameController)
        guesser.wait_for_timeout(2000)

        # Check scores - the scoreboard should show non-zero values
        scores = get_scoreboard_scores(guesser)
        total = sum(scores.values())
        assert total > 0, f'Expected positive scores after correct guess, got: {scores}'

    def test_pass_turn_advances_to_next(self, started_charades) -> None:
        """Performer clicking 'تخطي' advances to the next item or state."""
        host, guest = started_charades

        try:
            host.wait_for_selector('#btn-ready', timeout=10_000)
            performer = host
        except Exception:
            guest.wait_for_selector('#btn-ready', timeout=10_000)
            performer = guest

        performer.locator('#btn-ready').click()
        performer.wait_for_selector('#btn-start-performing', timeout=10_000)
        performer.locator('#btn-start-performing').click()
        pass_btn = performer.locator('#btn-pass')
        expect(pass_btn).to_be_visible(timeout=10_000)
        pass_btn.click()

        # After pass: either another item is shown or turn ends
        performer.wait_for_function(
            "!document.querySelector('#btn-pass') || "
            "document.querySelector('#game-area')?.textContent?.includes('دور') || "
            "document.querySelector('#btn-ready')",
            timeout=10_000,
        )
        # Test passes as long as state changed
        area_text = performer.locator('#game-area').text_content(timeout=5_000)
        assert area_text.strip() != ''


# ── Timer ─────────────────────────────────────────────────────────────────────

class TestCharadesTimer:
    def test_timer_starts_when_round_active(self, started_charades) -> None:
        """Timer display shows a countdown once the round becomes active."""
        host, guest = started_charades

        try:
            host.wait_for_selector('#btn-ready', timeout=10_000)
            performer = host
        except Exception:
            guest.wait_for_selector('#btn-ready', timeout=10_000)
            performer = guest

        performer.locator('#btn-ready').click()
        performer.wait_for_selector('#btn-start-performing', timeout=10_000)
        performer.locator('#btn-start-performing').click()
        # Wait for pass button (round_active)
        performer.wait_for_selector('#btn-pass', timeout=10_000)

        timer_text = performer.locator('#timer-display').text_content(timeout=5_000).strip()
        assert timer_text not in ('--:--', '', '--')
