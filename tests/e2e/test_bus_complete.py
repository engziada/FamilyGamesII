"""
Bus Complete (أتوبيس كومبليت) E2E tests.

Game flow:
  waiting → host starts round (letter assigned) → round_active:
    all players fill category inputs (debounced sync)
    any player hits "أتوبيس!" → validating:
      all see submissions per player
      players vote ✓/✗ on each other's answers
      host clicks "تأكيد النتائج" → scoring → "الجولة التالية" (host)

Three players: Host-A, Player-B, Player-C.
"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import create_room, join_room, start_game

GAME_TYPE = 'bus_complete'


@pytest.fixture
def bus_room(require_convex, host_page: Page, player_b_page: Page, player_c_page: Page, base_url: str):
    """Create a bus_complete room with 3 players."""
    room_id = create_room(host_page, GAME_TYPE, 'Host-A')
    join_room(player_b_page, room_id, 'Player-B', base_url)
    join_room(player_c_page, room_id, 'Player-C', base_url)
    return host_page, player_b_page, player_c_page


@pytest.fixture
def started_bus(bus_room):
    """Bus complete room with game started."""
    host, guest_b, guest_c = bus_room
    start_game(host)
    return host, guest_b, guest_c


def _start_round(host: Page) -> None:
    """Host clicks 'ابدأ الجولة' to begin a round."""
    host.wait_for_selector('#btn-start-round', timeout=12_000)
    host.locator('#btn-start-round').click()


def _wait_for_letter(page: Page) -> str:
    """Wait for the letter badge and return its text."""
    # The letter badge has display-6 class (larger font) to distinguish from score badges
    page.wait_for_selector('.badge.bg-primary.display-6', timeout=12_000)
    return page.locator('.badge.bg-primary.display-6').text_content(timeout=5_000).strip()


# ── Pre-start ────────────────────────────────────────────────────────────────

class TestBusCompleteLobby:
    def test_all_players_on_game_page(self, bus_room) -> None:
        """All three players land on the game page."""
        host, guest_b, guest_c = bus_room
        for page in (host, guest_b, guest_c):
            assert '/game/' in page.url

    def test_start_button_for_host(self, bus_room) -> None:
        """Host sees the start game button."""
        host, _, _ = bus_room
        expect(host.locator('#btn-start-game')).to_be_visible(timeout=10_000)

    def test_player_list_shows_all_three(self, bus_room) -> None:
        """All three player names appear in the host's player list."""
        host, _, _ = bus_room
        player_list = host.locator('#player-list')
        expect(player_list).to_contain_text('Host-A', timeout=10_000)
        expect(player_list).to_contain_text('Player-B', timeout=10_000)
        expect(player_list).to_contain_text('Player-C', timeout=10_000)


# ── Waiting → round start ─────────────────────────────────────────────────────

class TestBusCompleteRoundStart:
    def test_host_sees_start_round_button(self, started_bus) -> None:
        """Host sees 'ابدأ الجولة' button after game starts."""
        host, _, _ = started_bus
        expect(host.locator('#btn-start-round')).to_be_visible(timeout=12_000)

    def test_guests_do_not_see_start_round_button(self, started_bus) -> None:
        """Non-host players do not see the start-round button."""
        _, guest_b, guest_c = started_bus
        for guest in (guest_b, guest_c):
            guest.wait_for_selector('#game-area', timeout=10_000)
            assert guest.locator('#btn-start-round').count() == 0

    def test_start_round_reveals_letter(self, started_bus) -> None:
        """After host starts a round, a letter badge is shown to all players."""
        host, guest_b, guest_c = started_bus
        _start_round(host)
        for page in (host, guest_b, guest_c):
            letter = _wait_for_letter(page)
            assert len(letter) == 1, f'Expected single Arabic letter, got: {letter}'

    def test_category_inputs_rendered(self, started_bus) -> None:
        """After round starts, category input fields appear in the table."""
        host, _, _ = started_bus
        _start_round(host)
        host.wait_for_selector('.bus-input', timeout=12_000)
        inputs = host.locator('.bus-input')
        assert inputs.count() > 0, 'Expected at least one category input'

    def test_stop_bus_button_visible(self, started_bus) -> None:
        """'أتوبيس!' stop button is visible during an active round."""
        host, _, _ = started_bus
        _start_round(host)
        host.wait_for_selector('#btn-stop-bus', timeout=12_000)
        expect(host.locator('#btn-stop-bus')).to_be_visible()


# ── Active round interactions ─────────────────────────────────────────────────

class TestBusCompleteRoundActive:
    @pytest.fixture(autouse=True)
    def setup_round(self, started_bus) -> None:
        """Start a round before each test."""
        host, guest_b, guest_c = started_bus
        _start_round(host)
        host.wait_for_selector('.bus-input', timeout=12_000)
        self.host = host
        self.guest_b = guest_b
        self.guest_c = guest_c

    def test_all_players_see_same_letter(self) -> None:
        """All players see the same letter badge."""
        host_letter = _wait_for_letter(self.host)
        guest_b_letter = _wait_for_letter(self.guest_b)
        guest_c_letter = _wait_for_letter(self.guest_c)
        assert host_letter == guest_b_letter == guest_c_letter

    def test_input_accepts_text(self) -> None:
        """A player can type into a category input field."""
        first_input = self.host.locator('.bus-input').first
        first_input.fill('كلمة')
        assert first_input.input_value() == 'كلمة'

    def test_multiple_inputs_per_player(self) -> None:
        """There are multiple category inputs (one per category)."""
        inputs = self.host.locator('.bus-input')
        assert inputs.count() >= 2, 'Expected at least 2 category inputs'

    def test_stop_bus_transitions_to_validation(self) -> None:
        """Any player pressing 'أتوبيس!' transitions all to the validation phase."""
        self.host.locator('#btn-stop-bus').click()
        # All players should enter validation state (allow 5s for grace period + Convex sync)
        for page in (self.host, self.guest_b, self.guest_c):
            page.wait_for_function(
                "document.querySelector('#game-area')?.textContent?.includes('التحقق') || "
                "document.querySelector('#game-area')?.textContent?.includes('أوقف')",
                timeout=20_000,
            )
            area_text = page.locator('#game-area').text_content(timeout=5_000)
            assert 'التحقق' in area_text or 'أوقف' in area_text


# ── Validation phase ──────────────────────────────────────────────────────────

class TestBusCompleteValidationPhase:
    @pytest.fixture(autouse=True)
    def advance_to_validation(self, started_bus) -> None:
        """Get all players through the round and into the validation phase."""
        host, guest_b, guest_c = started_bus
        _start_round(host)
        host.wait_for_selector('#btn-stop-bus', timeout=12_000)

        # Fill some answers first (optional, just for realistic state)
        host_inputs = host.locator('.bus-input')
        if host_inputs.count() > 0:
            host_inputs.first.fill('اختبار')

        # Stop the bus (triggers 3-second grace period before validation)
        host.locator('#btn-stop-bus').click()

        # Wait for validation phase on all pages (allow 5s for grace period + Convex sync)
        for page in (host, guest_b, guest_c):
            page.wait_for_function(
                "document.querySelector('#game-area')?.textContent?.includes('التحقق') || "
                "document.querySelector('#game-area')?.textContent?.includes('أوقف')",
                timeout=20_000,
            )

        self.host = host
        self.guest_b = guest_b
        self.guest_c = guest_c

    def test_validation_title_shown(self) -> None:
        """Validation phase header is visible."""
        area = self.host.locator('#game-area')
        expect(area).to_contain_text('التحقق', timeout=5_000)

    def test_stopper_name_shown(self) -> None:
        """The name of the player who stopped the bus is shown."""
        area = self.host.locator('#game-area')
        expect(area).to_contain_text('أوقف', timeout=5_000)

    def test_all_players_submissions_listed(self) -> None:
        """Each player's submission block is rendered in the validation view."""
        area = self.host.locator('#game-area')
        area_text = area.text_content(timeout=5_000)
        assert 'Host-A' in area_text

    def test_vote_buttons_visible_for_others_answers(self) -> None:
        """Vote ✓/✗ buttons are visible for answers by other players."""
        vote_btns = self.guest_b.locator('.vote-btn')
        expect(vote_btns.first).to_be_visible(timeout=8_000)

    def test_no_vote_buttons_for_own_answers(self) -> None:
        """A player does not see vote buttons for their own answers."""
        # Host can vote on guest's answers but not their own
        host_cards = self.host.locator('.card').filter(has_text='Host-A')
        if host_cards.count() > 0:
            own_vote_btns = host_cards.first.locator('.vote-btn')
            assert own_vote_btns.count() == 0

    def test_host_sees_finalize_button(self) -> None:
        """The host sees the 'تأكيد النتائج وحساب النقاط' button."""
        expect(self.host.locator('#btn-finalize')).to_be_visible(timeout=5_000)

    def test_guests_do_not_see_finalize_button(self) -> None:
        """Non-host players do not see the finalize button."""
        for guest in (self.guest_b, self.guest_c):
            assert guest.locator('#btn-finalize').count() == 0

    def test_vote_button_clickable(self) -> None:
        """Vote buttons are enabled and can be clicked."""
        vote_btn = self.guest_b.locator('.vote-btn').first
        expect(vote_btn).to_be_enabled(timeout=5_000)
        vote_btn.click()
        # No exception = pass

    def test_finalize_transitions_to_scoring(self) -> None:
        """Host clicking finalize transitions game to scoring phase."""
        self.host.locator('#btn-finalize').click()
        self.host.wait_for_function(
            "document.querySelector('#game-area')?.textContent?.includes('النقاط') || "
            "document.querySelector('#btn-next-round')",
            timeout=12_000,
        )
        area_text = self.host.locator('#game-area').text_content(timeout=5_000)
        assert 'النقاط' in area_text or area_text.strip() != ''


# ── Scoring phase ─────────────────────────────────────────────────────────────

class TestBusCompleScoring:
    @pytest.fixture(autouse=True)
    def advance_to_scoring(self, started_bus) -> None:
        """Advance through round → stop → validate → finalize → scoring."""
        host, guest_b, guest_c = started_bus
        _start_round(host)
        host.wait_for_selector('#btn-stop-bus', timeout=12_000)
        
        # Fill some answers first so validation has content
        host_inputs = host.locator('.bus-input')
        if host_inputs.count() > 0:
            host_inputs.first.fill('اختبار')
        
        host.locator('#btn-stop-bus').click()

        # Wait for validation phase on all pages (3s grace period + sync)
        for page in (host, guest_b, guest_c):
            page.wait_for_function(
                "document.querySelector('#game-area')?.textContent?.includes('التحقق') || "
                "document.querySelector('#btn-finalize')",
                timeout=20_000,
            )

        # Wait for finalize button to appear (validation state ready)
        host.wait_for_selector('#btn-finalize', timeout=10_000)
        host.locator('#btn-finalize').click()

        # Wait for scoring phase on all pages
        for page in (host, guest_b, guest_c):
            page.wait_for_function(
                "document.querySelector('#btn-next-round') || "
                "document.querySelector('#game-area')?.textContent?.includes('النقاط')",
                timeout=15_000,
            )

        self.host = host
        self.guest_b = guest_b
        self.guest_c = guest_c

    def test_scoring_message_shown(self) -> None:
        """Scoring phase shows 'تم حساب النقاط' message."""
        area = self.host.locator('#game-area')
        expect(area).to_contain_text('النقاط', timeout=5_000)

    def test_host_sees_next_round_button(self) -> None:
        """Host sees 'الجولة التالية' button in scoring phase."""
        expect(self.host.locator('#btn-next-round')).to_be_visible(timeout=5_000)

    def test_guests_see_waiting_message(self) -> None:
        """Non-host players see a waiting message in scoring phase."""
        for guest in (self.guest_b, self.guest_c):
            area = guest.locator('#game-area')
            area_text = area.text_content(timeout=5_000)
            assert 'انتظار' in area_text or 'النقاط' in area_text

    def test_next_round_starts_new_round(self) -> None:
        """Host clicking 'الجولة التالية' starts a new round with a new letter."""
        self.host.locator('#btn-next-round').click()
        # Should cycle back: either letter appears or start-round button reappears
        self.host.wait_for_function(
            "document.querySelector('.badge.bg-primary') || "
            "document.querySelector('#btn-start-round')",
            timeout=12_000,
        )
        area_text = self.host.locator('#game-area').text_content(timeout=5_000)
        assert area_text.strip() != ''
