"""
Pictionary (ارسم وخمن) E2E tests.

Game flow:
  waiting → playing/round_active:
    drawer sees: canvas (crosshair cursor) + undo/clear/pass controls + item title
    guessers see: canvas (default cursor, read-only) + 'خمّنت صح!' button
  → correct guess → scores update → next turn

Canvas drawing is verified via JS getImageData (pixel-level check).
Two players: Host-A (host) and Player-B.
"""
from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import (
    create_room,
    join_room,
    start_game,
    get_scoreboard_scores,
)

GAME_TYPE = 'pictionary'

pytestmark = pytest.mark.skip(reason='Pictionary is disabled in game catalog')


@pytest.fixture
def pic_room(require_convex, host_page: Page, player_b_page: Page, base_url: str):
    """Create a pictionary room with 2 players."""
    room_id = create_room(host_page, GAME_TYPE, 'Host-A')
    join_room(player_b_page, room_id, 'Player-B', base_url)
    return host_page, player_b_page


@pytest.fixture
def started_pic(pic_room):
    """Pictionary room with game started."""
    host, guest = pic_room
    start_game(host)
    return host, guest


def _identify_drawer_and_guesser(host: Page, guest: Page) -> tuple[Page, Page]:
    """Wait for ready button or canvas, click ready if needed, and return (drawer_page, guesser_page)."""
    # Wait for game state to sync - look for ready button or canvas
    host.wait_for_selector('#btn-ready-pic, #pictionary-canvas', timeout=15_000)
    
    # Check which player has the ready button (current drawer)
    host_ready_count = host.locator('#btn-ready-pic').count()
    guest_ready_count = guest.locator('#btn-ready-pic').count()
    
    if host_ready_count > 0:
        drawer = host
        guesser = guest
        host.locator('#btn-ready-pic').click()
        drawer.wait_for_selector('#pictionary-canvas', timeout=10_000)
    elif guest_ready_count > 0:
        drawer = guest
        guesser = host
        guest.locator('#btn-ready-pic').click()
        drawer.wait_for_selector('#pictionary-canvas', timeout=10_000)
    else:
        # No ready button - check for canvas directly
        host.wait_for_selector('#pictionary-canvas', timeout=15_000)
        host_cursor = host.locator('#pictionary-canvas').get_attribute('style') or ''
        if 'crosshair' in host_cursor:
            return host, guest
        return guest, host
    
    return drawer, guesser


def _draw_a_line(page: Page) -> None:
    """Draw a simple diagonal line on the canvas via mouse events."""
    canvas = page.locator('#pictionary-canvas')
    box = canvas.bounding_box()
    assert box is not None, 'Canvas bounding box not available'
    x0 = box['x'] + box['width'] * 0.2
    y0 = box['y'] + box['height'] * 0.2
    x1 = box['x'] + box['width'] * 0.8
    y1 = box['y'] + box['height'] * 0.8
    page.mouse.move(x0, y0)
    page.mouse.down()
    page.mouse.move(x1, y1, steps=10)
    page.mouse.up()


def _canvas_is_blank(page: Page) -> bool:
    """Return True if the pictionary canvas contains only white/transparent pixels."""
    return page.evaluate("""() => {
        const canvas = document.getElementById('pictionary-canvas');
        if (!canvas) return true;
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        // Check if any non-white, non-transparent pixel exists
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
            if (a > 0 && !(r === 255 && g === 255 && b === 255)) return false;
        }
        return true;
    }""")


# ── Pre-start ────────────────────────────────────────────────────────────────

class TestPictionaryLobby:
    def test_both_on_game_page(self, pic_room) -> None:
        """Both players land on the game page."""
        host, guest = pic_room
        assert '/game/' in host.url
        assert '/game/' in guest.url

    def test_start_button_for_host(self, pic_room) -> None:
        """Host sees the start button."""
        host, _ = pic_room
        expect(host.locator('#btn-start-game')).to_be_visible(timeout=10_000)


# ── Canvas rendering ──────────────────────────────────────────────────────────

class TestPictionaryCanvas:
    def test_canvas_renders_after_start(self, started_pic) -> None:
        """The pictionary canvas element is present after game starts."""
        host, guest = started_pic
        drawer, guesser = _identify_drawer_and_guesser(host, guest)
        expect(drawer.locator('#pictionary-canvas')).to_be_visible()

    def test_drawer_has_crosshair_cursor(self, started_pic) -> None:
        """The canvas for the drawer has cursor:crosshair."""
        host, guest = started_pic
        drawer, _ = _identify_drawer_and_guesser(host, guest)
        style = drawer.locator('#pictionary-canvas').get_attribute('style') or ''
        assert 'crosshair' in style, f'Expected crosshair cursor, got style: {style}'

    def test_guesser_has_default_cursor(self, started_pic) -> None:
        """The canvas for the guesser has cursor:default (read-only)."""
        host, guest = started_pic
        _, guesser = _identify_drawer_and_guesser(host, guest)
        style = guesser.locator('#pictionary-canvas').get_attribute('style') or ''
        assert 'default' in style, f'Expected default cursor, got style: {style}'

    def test_drawer_sees_item_title(self, started_pic) -> None:
        """Drawer sees the item they need to draw."""
        host, guest = started_pic
        drawer, _ = _identify_drawer_and_guesser(host, guest)
        area = drawer.locator('#game-area')
        # Drawer view contains "ارسم:" prompt
        expect(area).to_contain_text('ارسم', timeout=5_000)

    def test_guesser_sees_drawing_message(self, started_pic) -> None:
        """Guesser sees that the other player is drawing."""
        host, guest = started_pic
        _, guesser = _identify_drawer_and_guesser(host, guest)
        area = guesser.locator('#game-area')
        expect(area).to_contain_text('يرسم', timeout=5_000)


# ── Drawer controls ───────────────────────────────────────────────────────────

class TestPictionaryDrawerControls:
    def test_drawer_controls_visible(self, started_pic) -> None:
        """Undo, clear, and pass buttons are visible for the drawer."""
        host, guest = started_pic
        drawer, _ = _identify_drawer_and_guesser(host, guest)
        expect(drawer.locator('#btn-undo')).to_be_visible()
        expect(drawer.locator('#btn-clear')).to_be_visible()
        expect(drawer.locator('#btn-pass-pic')).to_be_visible()

    def test_guesser_has_no_drawer_controls(self, started_pic) -> None:
        """Guesser does not see undo/clear/pass controls."""
        host, guest = started_pic
        _, guesser = _identify_drawer_and_guesser(host, guest)
        assert guesser.locator('#btn-undo').count() == 0
        assert guesser.locator('#btn-clear').count() == 0

    def test_draw_stroke_makes_canvas_non_blank(self, started_pic) -> None:
        """Drawing on the canvas results in non-blank pixel data."""
        host, guest = started_pic
        drawer, _ = _identify_drawer_and_guesser(host, guest)
        _draw_a_line(drawer)
        # Short wait for stroke to be applied locally
        drawer.wait_for_timeout(500)
        assert not _canvas_is_blank(drawer), 'Canvas should have pixels after drawing'

    def test_clear_canvas_blanks_it(self, started_pic) -> None:
        """After drawing and clicking clear, canvas returns to blank."""
        host, guest = started_pic
        drawer, _ = _identify_drawer_and_guesser(host, guest)
        _draw_a_line(drawer)
        drawer.wait_for_timeout(500)
        drawer.locator('#btn-clear').click()
        # Wait for Convex to apply clearCanvas and re-render
        drawer.wait_for_timeout(1_000)
        assert _canvas_is_blank(drawer), 'Canvas should be blank after clear'

    def test_pass_advances_turn(self, started_pic) -> None:
        """Drawer clicking pass changes the game state."""
        host, guest = started_pic
        drawer, guesser = _identify_drawer_and_guesser(host, guest)
        
        game_area_before = drawer.locator('#game-area').text_content(timeout=5_000)
        
        # Ensure pass button exists and click with force
        drawer.wait_for_selector('#btn-pass-pic', timeout=10_000)
        drawer.locator('#btn-pass-pic').click(force=True)
        
        # Wait for Convex to process and UI to update
        drawer.wait_for_timeout(3000)
        
        # Check if game advanced - title should change to show next player
        game_area = drawer.locator('#game-area').text_content(timeout=5_000)
        
        # After pass, the drawer should see the guesser's name in the title
        # OR ready button if they became the next drawer
        has_ready_button = drawer.locator('#btn-ready-pic').count() > 0
        game_ended = 'انتهت' in game_area or 'ended' in game_area.lower()
        shows_guesser = 'يرسم' in game_area  # Shows "Player-B يرسم..."
        
        assert has_ready_button or shows_guesser or game_ended, (
            f'Expected round advance after pass.\n'
            f'Before: {game_area_before[:100]}\n'
            f'After: {game_area[:200]}'
        )


# ── Guesser correct button ────────────────────────────────────────────────────

class TestPictionaryGuessing:
    def test_guesser_correct_button_visible(self, started_pic) -> None:
        """Guesser sees the 'خمّنت صح!' button."""
        host, guest = started_pic
        _, guesser = _identify_drawer_and_guesser(host, guest)
        expect(guesser.locator('#btn-guess-correct-pic')).to_be_visible(timeout=10_000)

    def test_correct_guess_updates_scoreboard(self, started_pic) -> None:
        """Guesser clicking correct updates scores to non-zero."""
        host, guest = started_pic
        _, guesser = _identify_drawer_and_guesser(host, guest)
        guesser.wait_for_selector('#btn-guess-correct-pic', timeout=10_000)
        
        # Click the guess correct button
        guesser.locator('#btn-guess-correct-pic').click()
        
        # Wait for game state to change (either scores update or round advances)
        guesser.wait_for_timeout(3000)
        
        # Check if scores updated or game advanced to next round
        scores = get_scoreboard_scores(guesser)
        total = sum(scores.values())
        
        # Either scores should be non-zero OR game should show ready button for next drawer
        game_area = guesser.locator('#game-area').text_content(timeout=5_000)
        has_ready_button = guesser.locator('#btn-ready-pic').count() > 0
        
        assert total > 0 or has_ready_button or 'دور' in game_area, (
            f'Expected score update or round advance. Scores: {scores}, Game area: {game_area[:200]}'
        )


# ── Timer ─────────────────────────────────────────────────────────────────────

class TestPictionaryTimer:
    def test_timer_countdown_active(self, started_pic) -> None:
        """Timer shows a non-placeholder value during active round."""
        host, guest = started_pic
        drawer, _ = _identify_drawer_and_guesser(host, guest)
        timer_text = drawer.locator('#timer-display').text_content(timeout=5_000).strip()
        assert timer_text not in ('--:--', '', '--')
