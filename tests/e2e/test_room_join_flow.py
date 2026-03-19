"""
Room join flow E2E tests.

Covers:
 1. Host alone → start button is visible but DISABLED (not enough players)
 2. Guest joins via 4-digit room code → start button becomes ENABLED
 3. Host starts game → both players land on game page
"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import create_room, navigate_to_root


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_room_code(host_page: Page, timeout: int = 10_000) -> str:
    """Return the 4-digit room code shown on the game page."""
    el = host_page.locator('#room-code-display')
    el.wait_for(state='visible', timeout=timeout)
    # Wait until the placeholder '----' is replaced with a real code
    host_page.wait_for_function(
        "document.getElementById('room-code-display')?.textContent.trim() !== '----' && "
        "document.getElementById('room-code-display')?.textContent.trim().length > 0",
        timeout=timeout,
    )
    return el.text_content().strip()


def _join_via_code(page: Page, room_code: str, player_name: str) -> None:
    """Navigate to lobby, enter 4-digit code, open modal, fill name, confirm."""
    page.locator('#join-room-input').fill(room_code)
    page.locator('#btn-open-join').click()

    modal = page.locator('#joinGameModal')
    modal.wait_for(state='visible', timeout=10_000)
    page.wait_for_function(
        "document.getElementById('joinGameModal')?.classList.contains('show')",
        timeout=5_000,
    )
    modal.locator('#join-name').fill(player_name)
    page.evaluate("document.getElementById('btn-join-confirm').click()")
    page.wait_for_url('**/game/**', timeout=15_000)


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestStartButtonEnforcement:
    def test_start_button_disabled_with_one_player(
        self, require_convex, host_page: Page
    ) -> None:
        """Start button is visible for host but disabled when only 1 player is in room."""
        create_room(host_page, 'trivia', 'Solo-Host')

        btn = host_page.locator('#btn-start-game')
        # Button must appear for the host
        btn.wait_for(state='visible', timeout=12_000)
        # Must be disabled — only host is in the room
        expect(btn).to_be_disabled(timeout=5_000)

    def test_start_button_enabled_after_second_player_joins(
        self, require_convex, host_page: Page, player_b_page: Page, base_url: str
    ) -> None:
        """Start button becomes enabled once a second player joins."""
        create_room(host_page, 'trivia', 'Host-Start')

        # Get the 4-digit room code
        room_code = _get_room_code(host_page)
        assert room_code.isdigit() and len(room_code) == 4, (
            f"Expected 4-digit code, got: '{room_code}'"
        )

        # Guest joins using the code
        _join_via_code(player_b_page, room_code, 'Player-Join')

        # Host's start button should now be enabled
        btn = host_page.locator('#btn-start-game')
        btn.wait_for(state='visible', timeout=12_000)
        expect(btn).to_be_enabled(timeout=10_000)


class TestRoomCodeJoinFlow:
    def test_room_code_displayed_on_game_page(
        self, require_convex, host_page: Page
    ) -> None:
        """4-digit room code is shown on the game page sidebar."""
        create_room(host_page, 'charades', 'Code-Host')
        code = _get_room_code(host_page)
        assert code.isdigit(), f"Room code should be numeric, got: '{code}'"
        assert len(code) == 4, f"Room code should be 4 digits, got: '{code}' (len={len(code)})"

    def test_join_via_4digit_code_navigates_to_game(
        self, require_convex, host_page: Page, player_b_page: Page, base_url: str
    ) -> None:
        """Guest can enter 4-digit code, open modal, fill name, and reach the game page."""
        create_room(host_page, 'trivia', 'Code-Room-Host')
        room_code = _get_room_code(host_page)

        _join_via_code(player_b_page, room_code, 'Code-Joiner')

        assert '/game/' in player_b_page.url, (
            f"Expected navigation to /game/... but got: {player_b_page.url}"
        )
        expect(player_b_page.locator('text=أنت: Code-Joiner')).to_be_visible(timeout=8_000)

    def test_join_modal_opens_on_code_input(
        self, require_convex, host_page: Page, player_b_page: Page, base_url: str
    ) -> None:
        """Entering room code in join input opens the join modal with room preview."""
        create_room(host_page, 'rapid_fire', 'Preview-Host')
        room_code = _get_room_code(host_page)

        player_b_page.locator('#join-room-input').fill(room_code)
        player_b_page.locator('#btn-open-join').click()

        modal = player_b_page.locator('#joinGameModal')
        modal.wait_for(state='visible', timeout=10_000)
        # Room preview should be populated
        preview = modal.locator('#join-room-preview')
        preview.wait_for(state='visible', timeout=8_000)
        expect(preview).not_to_be_empty()

    def test_invalid_code_shows_toast(
        self, page: Page
    ) -> None:
        """Entering a non-existent 4-digit code shows an error toast."""
        page.locator('#join-room-input').fill('0000')
        page.locator('#btn-open-join').click()
        toast = page.locator('#toast-container .toast-body').first
        toast.wait_for(state='visible', timeout=8_000)
        text = toast.text_content().strip()
        assert text, "Expected a toast error message for invalid room code"


class TestFullLobbyJourney:
    def test_full_journey_host_create_guest_join_start(
        self, require_convex, host_page: Page, player_b_page: Page, base_url: str
    ) -> None:
        """Full journey: host creates → guest joins via code → host starts game."""
        # 1. Host creates room
        create_room(host_page, 'trivia', 'Journey-Host')
        assert '/game/' in host_page.url

        # 2. Room code is shown
        room_code = _get_room_code(host_page)
        assert room_code.isdigit() and len(room_code) == 4

        # 3. Start button exists but is disabled (only host)
        btn = host_page.locator('#btn-start-game')
        btn.wait_for(state='visible', timeout=12_000)
        expect(btn).to_be_disabled(timeout=5_000)

        # 4. Guest joins via 4-digit code
        _join_via_code(player_b_page, room_code, 'Journey-Guest')
        assert '/game/' in player_b_page.url

        # 5. Host sees both players in list
        player_list = host_page.locator('#player-list')
        expect(player_list).to_contain_text('Journey-Host', timeout=10_000)
        expect(player_list).to_contain_text('Journey-Guest', timeout=10_000)

        # 6. Start button is now enabled
        expect(btn).to_be_enabled(timeout=10_000)

        # 7. Host starts the game
        btn.click()

        # 8. Both players land on active game (status no longer 'waiting')
        host_page.wait_for_function(
            "document.getElementById('game-status')?.textContent !== 'في انتظار اللاعبين...'",
            timeout=15_000,
        )
        player_b_page.wait_for_function(
            "document.getElementById('game-status')?.textContent !== 'في انتظار اللاعبين...'",
            timeout=15_000,
        )
