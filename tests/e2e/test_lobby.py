"""
Lobby (index page) E2E tests.

Covers: page load, game card rendering, create/join modals,
input validation, dark mode, and the full create → join → navigate flow.
"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import GAME_TITLES, create_room, join_room, navigate_to_root


def _wait_modal_shown(page: Page, modal_id: str) -> None:
    """Wait for Bootstrap fade animation to finish (shown.bs.modal fired)."""
    page.wait_for_function(
        f"document.getElementById('{modal_id}')?.classList.contains('show') && "
        f"!document.getElementById('{modal_id}')?.classList.contains('fade') || "
        f"getComputedStyle(document.getElementById('{modal_id}') ?? document.body).opacity === '1'",
        timeout=5_000,
    )
    # Small buffer for backdrop to settle (Bootstrap backdrop transition is ~150ms)
    page.wait_for_timeout(200)


# ── Page load ────────────────────────────────────────────────────────────────

class TestIndexLoads:
    def test_page_title(self, page: Page) -> None:
        """Page has the correct Arabic title."""
        expect(page).to_have_title('ألعاب العيلة - متعة مع العائلة')

    def test_header_text_visible(self, page: Page) -> None:
        """Main heading is visible."""
        expect(page.locator('h1')).to_contain_text('أهلاً بكم')

    def test_all_eight_game_cards_rendered(self, page: Page) -> None:
        """All 8 game cards are present in the catalog grid."""
        cards = page.locator('.game-card')
        expect(cards).to_have_count(8)

    def test_each_card_has_create_button(self, page: Page) -> None:
        """Every game card has a 'لعبة جديدة' button."""
        for title in GAME_TITLES.values():
            card = page.locator('.game-card').filter(has_text=title)
            expect(card.get_by_role('button', name='لعبة جديدة')).to_be_visible()

    def test_each_card_has_rules_button(self, page: Page) -> None:
        """Every game card has a 'كيف تلعب؟' button."""
        buttons = page.locator('.rules-btn')
        expect(buttons).to_have_count(8)

    def test_join_input_visible(self, page: Page) -> None:
        """The join-room input and button are visible on the page."""
        expect(page.locator('#join-room-input')).to_be_visible()
        expect(page.locator('#btn-open-join')).to_be_visible()


# ── Create Game Modal ────────────────────────────────────────────────────────

class TestCreateModal:
    def test_modal_opens_on_create_click(self, page: Page) -> None:
        """Clicking 'لعبة جديدة' opens the create-game modal."""
        card = page.locator('.game-card').filter(has_text=GAME_TITLES['trivia'])
        card.get_by_role('button', name='لعبة جديدة').click()
        expect(page.locator('#createGameModal')).to_be_visible()

    def test_modal_title_contains_game_name(self, page: Page) -> None:
        """The modal title includes the selected game's Arabic name."""
        card = page.locator('.game-card').filter(has_text=GAME_TITLES['trivia'])
        card.get_by_role('button', name='لعبة جديدة').click()
        modal_title = page.locator('#createGameModalLabel')
        expect(modal_title).to_contain_text(GAME_TITLES['trivia'])

    def test_create_requires_name(self, page: Page) -> None:
        """Submitting create with an empty name shows an error alert."""
        card = page.locator('.game-card').filter(has_text=GAME_TITLES['trivia'])
        card.get_by_role('button', name='لعبة جديدة').click()
        modal = page.locator('#createGameModal')
        modal.wait_for(state='visible')
        _wait_modal_shown(page, 'createGameModal')
        # JS click bypasses backdrop hit-test and fires Bootstrap event handlers
        page.evaluate("document.getElementById('btn-create-room').click()")
        error = modal.locator('#create-error')
        expect(error).to_be_visible()
        expect(error).not_to_be_empty()

    def test_modal_closes_on_cancel(self, page: Page) -> None:
        """Clicking cancel closes the create modal."""
        card = page.locator('.game-card').first
        card.get_by_role('button', name='لعبة جديدة').click()
        modal = page.locator('#createGameModal')
        modal.wait_for(state='visible')
        _wait_modal_shown(page, 'createGameModal')
        page.evaluate("document.querySelector('#createGameModal .btn-secondary').click()")
        expect(modal).not_to_be_visible()

    def test_enter_key_submits_create(self, page: Page) -> None:
        """Pressing Enter in the name input triggers create (fails with empty name)."""
        card = page.locator('.game-card').filter(has_text=GAME_TITLES['riddles'])
        card.get_by_role('button', name='لعبة جديدة').click()
        modal = page.locator('#createGameModal')
        modal.wait_for(state='visible')
        _wait_modal_shown(page, 'createGameModal')
        page.evaluate("document.getElementById('host-name').focus()")
        modal.locator('#host-name').press('Enter')
        expect(modal.locator('#create-error')).to_be_visible()


# ── Join Game Modal ──────────────────────────────────────────────────────────

class TestJoinModal:
    def test_join_button_requires_room_input(self, page: Page) -> None:
        """Clicking join with empty room input shows a toast warning."""
        page.locator('#btn-open-join').click()
        # Toast should appear warning user
        toast_container = page.locator('#toast-container')
        toast_container.wait_for(state='visible', timeout=5_000)
        expect(toast_container).to_contain_text('أولاً')

    def test_join_modal_opens_with_valid_room_id(self, page: Page, base_url: str) -> None:
        """Pasting a well-formed room URL opens the join modal."""
        # Use a fake room ID — we only test modal opening, not Convex lookup
        fake_room = 'test-room-id-1234'
        page.locator('#join-room-input').fill(f'{base_url}/game/{fake_room}')
        page.locator('#btn-open-join').click()
        expect(page.locator('#joinGameModal')).to_be_visible()

    def test_join_requires_name(self, page: Page, base_url: str) -> None:
        """Confirming join with empty player name shows an error alert."""
        page.locator('#join-room-input').fill(f'{base_url}/game/any-room-id')
        page.locator('#btn-open-join').click()
        modal = page.locator('#joinGameModal')
        modal.wait_for(state='visible')
        _wait_modal_shown(page, 'joinGameModal')
        # Confirm without entering a name
        page.evaluate("document.getElementById('btn-join-confirm').click()")
        expect(modal.locator('#join-error')).to_be_visible()

    def test_join_modal_cancel(self, page: Page, base_url: str) -> None:
        """Cancel button closes the join modal."""
        page.locator('#join-room-input').fill(f'{base_url}/game/any-room-id')
        page.locator('#btn-open-join').click()
        modal = page.locator('#joinGameModal')
        modal.wait_for(state='visible')
        _wait_modal_shown(page, 'joinGameModal')
        page.evaluate("document.querySelector('#joinGameModal .btn-secondary').click()")
        expect(modal).not_to_be_visible()

    def test_room_id_extracted_from_url(self, page: Page, base_url: str) -> None:
        """Room ID is correctly parsed from a full game URL."""
        room_id = 'abc123xyz'
        page.locator('#join-room-input').fill(f'{base_url}/game/{room_id}?player_name=X')
        page.locator('#btn-open-join').click()
        modal = page.locator('#joinGameModal')
        modal.wait_for(state='visible')
        _wait_modal_shown(page, 'joinGameModal')
        # Hidden input should contain extracted room ID
        stored_id = modal.locator('#join-room-id').input_value()
        assert stored_id == room_id

    def test_auto_open_join_on_url_param(self, page: Page, base_url: str) -> None:
        """Navigating to /?join=<roomId> auto-opens the join modal."""
        page.goto(f'{base_url}/?join=some-room-id', wait_until='domcontentloaded')
        expect(page.locator('#joinGameModal')).to_be_visible(timeout=5_000)


# ── Dark mode ────────────────────────────────────────────────────────────────

class TestDarkMode:
    def test_dark_mode_toggle_sets_attribute(self, page: Page) -> None:
        """Clicking the dark mode button sets data-theme=dark on <html>."""
        page.locator('#dark-mode-toggle').click()
        html_el = page.locator('html')
        expect(html_el).to_have_attribute('data-theme', 'dark')

    def test_dark_mode_toggle_switches_icon(self, page: Page) -> None:
        """Dark mode toggle icon changes from moon to sun."""
        btn = page.locator('#dark-mode-toggle')
        # Activate dark mode
        btn.click()
        expect(btn.locator('i')).to_have_class('fas fa-sun')

    def test_dark_mode_persists_in_localstorage(self, page: Page) -> None:
        """Dark mode preference is saved to localStorage."""
        page.locator('#dark-mode-toggle').click()
        theme = page.evaluate("localStorage.getItem('theme')")
        assert theme == 'dark'

    def test_light_mode_toggle_reverts(self, page: Page) -> None:
        """Toggling again reverts from dark to light."""
        btn = page.locator('#dark-mode-toggle')
        btn.click()  # → dark
        btn.click()  # → light
        html_el = page.locator('html')
        current_theme = html_el.get_attribute('data-theme')
        assert current_theme in ('light', None)


# ── Full create → join → navigate flow ───────────────────────────────────────

class TestFullFlow:
    @pytest.mark.parametrize('game_type', ['trivia', 'rapid_fire'])
    def test_host_creates_room_and_lands_on_game_page(
        self, require_convex, host_page: Page, game_type: str
    ) -> None:
        """Host creates a room and navigates to the game page successfully."""
        room_id = create_room(host_page, game_type, 'Test-Host')
        assert room_id, 'Room ID should not be empty'
        assert '/game/' in host_page.url
        expect(host_page.locator('#full-room-id')).to_have_text(room_id)

    def test_guest_joins_room_via_link(
        self, require_convex, host_page: Page, player_b_page: Page, base_url: str
    ) -> None:
        """Guest can join host's room and both appear in the player list."""
        room_id = create_room(host_page, 'trivia', 'Host-X')
        join_room(player_b_page, room_id, 'Guest-Y', base_url)

        # Both should be on the game page
        assert '/game/' in host_page.url
        assert '/game/' in player_b_page.url

        # Guest's player name appears in their sidebar
        expect(player_b_page.locator('text=أنت: Guest-Y')).to_be_visible(timeout=5_000)

    def test_player_list_shows_both_players(
        self, require_convex, host_page: Page, player_b_page: Page, base_url: str
    ) -> None:
        """After host + guest join, both names appear in the player list."""
        room_id = create_room(host_page, 'trivia', 'Host-A')
        join_room(player_b_page, room_id, 'Player-B', base_url)

        player_list = host_page.locator('#player-list')
        expect(player_list).to_contain_text('Host-A', timeout=10_000)
        expect(player_list).to_contain_text('Player-B', timeout=10_000)
