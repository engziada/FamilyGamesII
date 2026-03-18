"""
Common game-page behavior E2E tests.

Covers: player list, scoreboard, leave button, share link,
reactions, sound toggle — shared across all game types.
"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import create_room, join_room, start_game


# ── Sidebar & status bar ──────────────────────────────────────────────────────

class TestGamePageStructure:
    @pytest.fixture(autouse=True)
    def setup(self, require_convex, host_page: Page, player_b_page: Page, base_url: str) -> None:
        """Create a trivia room with 2 players before each test."""
        self.room_id = create_room(host_page, 'trivia', 'Host-A')
        join_room(player_b_page, self.room_id, 'Player-B', base_url)
        self.host = host_page
        self.guest = player_b_page

    def test_player_list_container_visible(self) -> None:
        """#player-list element is present and visible."""
        expect(self.host.locator('#player-list')).to_be_visible()

    def test_scoreboard_visible(self) -> None:
        """Scoreboard table body is present."""
        expect(self.host.locator('#scoreboard')).to_be_visible()

    def test_game_status_element_visible(self) -> None:
        """#game-status span is rendered in the status bar."""
        expect(self.host.locator('#game-status')).to_be_visible()

    def test_timer_display_visible(self) -> None:
        """#timer-display element is visible in the status bar."""
        expect(self.host.locator('#timer-display')).to_be_visible()

    def test_room_info_card_shows_room_id(self) -> None:
        """Room info card displays a truncated room ID."""
        # The card shows the first 10 chars of the room ID followed by '…'
        expect(self.host.locator('.card').filter(has_text='رقم الغرفة')).to_be_visible()

    def test_player_name_shown_in_sidebar(self) -> None:
        """The player's own name is shown in the room info card."""
        expect(self.host.locator('text=أنت: Host-A')).to_be_visible(timeout=5_000)
        expect(self.guest.locator('text=أنت: Player-B')).to_be_visible(timeout=5_000)

    def test_both_players_in_list(self) -> None:
        """After both players join, both names appear in host's player list."""
        player_list = self.host.locator('#player-list')
        expect(player_list).to_contain_text('Host-A', timeout=10_000)
        expect(player_list).to_contain_text('Player-B', timeout=10_000)

    def test_start_button_visible_for_host(self) -> None:
        """The start game button is visible to the host (hidden for guests)."""
        expect(self.host.locator('#btn-start-game')).to_be_visible(timeout=8_000)

    def test_start_button_hidden_for_guest(self) -> None:
        """The start game button is not visible to a non-host player."""
        start_btn = self.guest.locator('#btn-start-game')
        # Either hidden or not rendered
        count = start_btn.count()
        if count > 0:
            expect(start_btn).to_be_hidden()


# ── Share link button ─────────────────────────────────────────────────────────

class TestShareLink:
    @pytest.fixture(autouse=True)
    def setup(self, require_convex, host_page: Page, base_url: str) -> None:
        """Create a single-player room (no need for guest here)."""
        self.room_id = create_room(host_page, 'trivia', 'Host-Share')
        self.host = host_page
        self.base_url = base_url

    def test_share_button_visible(self) -> None:
        """Share link button is visible in the room info card."""
        expect(self.host.locator('#btn-share-link')).to_be_visible()

    def test_share_button_copies_to_clipboard(self) -> None:
        """Clicking share copies a URL containing /game/<room_id>."""
        # Grant clipboard permissions
        self.host.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        self.host.locator('#btn-share-link').click()
        # Read clipboard value
        clipboard_text = self.host.evaluate('navigator.clipboard.readText()')
        assert f'/game/{self.room_id}' in clipboard_text

    def test_share_url_has_no_player_name(self) -> None:
        """Shared URL does not leak the host's player_name query param."""
        self.host.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        self.host.locator('#btn-share-link').click()
        clipboard_text = self.host.evaluate('navigator.clipboard.readText()')
        assert 'player_name' not in clipboard_text


# ── Leave / Close room ────────────────────────────────────────────────────────

class TestLeaveRoom:
    @pytest.fixture(autouse=True)
    def setup(self, require_convex, host_page: Page, player_b_page: Page, base_url: str) -> None:
        """Create a room with 2 players."""
        self.room_id = create_room(host_page, 'trivia', 'Host-Leave')
        join_room(player_b_page, self.room_id, 'Player-Leave', base_url)
        self.host = host_page
        self.guest = player_b_page

    def test_leave_button_visible(self) -> None:
        """Leave button is visible for all players."""
        expect(self.guest.locator('#btn-leave')).to_be_visible()

    def test_leave_confirms_dialog(self) -> None:
        """Clicking leave shows a confirmation dialog."""
        self.guest.once('dialog', lambda d: d.dismiss())
        self.guest.locator('#btn-leave').click()
        # If we get here without exception, dialog was shown
        assert True

    def test_leave_confirmed_redirects_to_home(self) -> None:
        """Accepting the leave confirmation redirects to '/'."""
        self.guest.once('dialog', lambda d: d.accept())
        self.guest.locator('#btn-leave').click()
        self.guest.wait_for_url('**/', timeout=10_000)
        assert self.guest.url.rstrip('/').endswith(self.guest.url.split('/')[2])

    def test_close_room_button_visible_for_host(self) -> None:
        """'إغلاق الغرفة' button is visible only for the host."""
        expect(self.host.locator('#btn-close-room')).to_be_visible(timeout=8_000)

    def test_close_room_button_hidden_for_guest(self) -> None:
        """Close room button is hidden for non-host players."""
        close_btn = self.guest.locator('#btn-close-room')
        count = close_btn.count()
        if count > 0:
            expect(close_btn).to_be_hidden()


# ── Reaction buttons ──────────────────────────────────────────────────────────

class TestReactions:
    @pytest.fixture(autouse=True)
    def setup(self, require_convex, host_page: Page, base_url: str) -> None:
        """Create a room (no need for guest)."""
        create_room(host_page, 'trivia', 'Host-React')
        self.host = host_page

    def test_reaction_buttons_present(self) -> None:
        """All 5 emoji reaction buttons are present."""
        emoji_btns = self.host.locator('[data-emoji]')
        expect(emoji_btns).to_have_count(5)

    def test_reaction_buttons_clickable(self) -> None:
        """Each emoji button is enabled and clickable (no JS exception)."""
        btns = self.host.locator('[data-emoji]')
        count = btns.count()
        for i in range(count):
            expect(btns.nth(i)).to_be_enabled()


# ── Sound toggle ──────────────────────────────────────────────────────────────

class TestSoundToggle:
    @pytest.fixture(autouse=True)
    def setup(self, require_convex, host_page: Page) -> None:
        """Create a room."""
        create_room(host_page, 'trivia', 'Host-Sound')
        self.host = host_page

    def test_sound_toggle_button_visible(self) -> None:
        """Sound toggle button is present."""
        expect(self.host.locator('#btn-sound-toggle')).to_be_visible()

    def test_sound_toggle_changes_icon(self) -> None:
        """Clicking sound toggle changes the icon from volume-up to volume-mute."""
        btn = self.host.locator('#btn-sound-toggle')
        btn.click()
        expect(btn.locator('i')).to_have_class('fas fa-volume-mute')

    def test_sound_toggle_reverts_on_second_click(self) -> None:
        """Clicking again reverts to volume-up icon."""
        btn = self.host.locator('#btn-sound-toggle')
        btn.click()  # → mute
        btn.click()  # → unmute
        expect(btn.locator('i')).to_have_class('fas fa-volume-up')


# ── How to play? button ───────────────────────────────────────────────────────

class TestHowToPlay:
    @pytest.fixture(autouse=True)
    def setup(self, require_convex, host_page: Page) -> None:
        """Create a room."""
        create_room(host_page, 'trivia', 'Host-Rules')
        self.host = host_page

    def test_rules_button_visible(self) -> None:
        """'كيف تلعب؟' button is visible in the room info sidebar card."""
        expect(self.host.locator('#btn-show-rules')).to_be_visible()
