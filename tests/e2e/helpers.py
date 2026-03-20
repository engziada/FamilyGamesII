"""
Shared helper functions for Family Games II Playwright E2E tests.

All selectors reference live DOM IDs/attributes from the current templates.
"""
from __future__ import annotations

import time
from typing import Optional

from playwright.sync_api import Page, expect


# ── Room management helpers ─────────────────────────────────────────────────

# Maps game_type key → Arabic card title shown in the UI
GAME_TITLES: dict[str, str] = {
    'charades': 'بدون كلام',
    'pictionary': 'ارسم وخمن',
    'trivia': 'بنك المعلومات',
    'rapid_fire': 'الأسئلة السريعة',
    'twenty_questions': 'عشرين سؤال',
    'riddles': 'الألغاز',
    'bus_complete': 'أتوبيس كومبليت',
    'who_am_i': 'من أنا؟',
}


def create_room(page: Page, game_type: str, player_name: str) -> str:
    """Create a new game room as host.

    Clicks the matching game card's "لعبة جديدة" button, fills the host name,
    confirms creation, and returns the room ID extracted from #full-room-id.

    Args:
        page: Playwright page already loaded at the app root (/).
        game_type: Game type key (e.g. 'charades').
        player_name: Host display name.

    Returns:
        The Convex room ID string.
    """
    title = GAME_TITLES[game_type]
    # Find the card whose .card-title text matches, then click its create button
    card = page.locator('.game-card').filter(has_text=title)
    card.get_by_role('button', name='لعبة جديدة').click()

    # Modal opens — wait for Bootstrap animation, fill name, submit via JS
    modal = page.locator('#createGameModal')
    modal.wait_for(state='visible')
    page.wait_for_function(
        "document.getElementById('createGameModal')?.classList.contains('show')",
        timeout=5_000,
    )
    modal.locator('#host-name').fill(player_name)
    # Use JS click to bypass backdrop hit-test (Bootstrap event delegation)
    page.evaluate("document.getElementById('btn-create-room').click()")

    # Wait for navigation to game page
    page.wait_for_url('**/game/**', timeout=15_000)

    # Extract room ID from hidden span (set by Flask template)
    room_id = page.locator('#full-room-id').text_content(timeout=10_000).strip()
    return room_id


def join_room(page: Page, room_id: str, player_name: str, base_url: str) -> None:
    """Join an existing room as a non-host player.

    Pastes the room link into the join input, opens the join modal,
    fills the player name, and confirms.

    Args:
        page: Playwright page already loaded at the app root (/).
        room_id: Convex room ID returned by create_room().
        player_name: Player display name.
        base_url: App base URL (e.g. 'http://127.0.0.1:5005').
    """
    join_url = f'{base_url}/game/{room_id}'
    # Remove maxlength (UI limits to 4 chars for short codes; tests use full URLs)
    page.evaluate("document.getElementById('join-room-input').removeAttribute('maxlength')")
    page.locator('#join-room-input').fill(join_url)
    page.locator('#btn-open-join').click()

    modal = page.locator('#joinGameModal')
    modal.wait_for(state='visible')
    page.wait_for_function(
        "document.getElementById('joinGameModal')?.classList.contains('show')",
        timeout=5_000,
    )
    modal.locator('#join-name').fill(player_name)
    # Use JS click to bypass backdrop hit-test
    page.evaluate("document.getElementById('btn-join-confirm').click()")

    # Wait for navigation to game page
    page.wait_for_url('**/game/**', timeout=15_000)


def start_game(host_page: Page) -> None:
    """Click the start game button (host only).

    Waits for the button to become visible (it's hidden until host is on page).

    Args:
        host_page: The host's Playwright page on the game route.
    """
    btn = host_page.locator('#btn-start-game')
    btn.wait_for(state='visible', timeout=10_000)
    btn.click()


def wait_for_game_area(page: Page, text_contains: Optional[str] = None, timeout: int = 15_000) -> None:
    """Wait for #game-area to be populated (loading spinner gone).

    Args:
        page: Playwright page on the game route.
        text_contains: Optional text that must appear inside #game-area.
        timeout: Max wait in milliseconds.
    """
    area = page.locator('#game-area')
    # Wait until the hourglass spinner disappears
    page.wait_for_function(
        "!document.querySelector('#game-area')?.innerHTML.includes('fa-hourglass-half')",
        timeout=timeout,
    )
    if text_contains:
        expect(area).to_contain_text(text_contains, timeout=timeout)


def get_player_name_from_page(page: Page) -> str:
    """Extract the current player's name from the game page sidebar.

    Args:
        page: Playwright page on the game route.

    Returns:
        Player name string.
    """
    text = page.locator('text=أنت:').text_content(timeout=5_000)
    # Format: "أنت: Name"
    return text.split('أنت:')[-1].strip()


def get_room_id_from_page(page: Page) -> str:
    """Return the full room ID from the hidden span on the game page."""
    return page.locator('#full-room-id').text_content(timeout=5_000).strip()


def navigate_to_root(page: Page, base_url: str) -> None:
    """Navigate to the app root (home page).

    Args:
        page: Playwright page.
        base_url: App base URL.
    """
    page.goto(base_url, wait_until='domcontentloaded')


# ── Assertion helpers ────────────────────────────────────────────────────────

def assert_no_js_errors(page: Page) -> None:
    """Assert no unhandled JS errors were logged on the page.

    Attach this to `page.on('pageerror', ...)` in the fixture to collect errors,
    then call this to assert the list is empty.
    """
    # This is a convenience reminder; actual error collection is in conftest.py
    pass


def wait_for_toast(page: Page, timeout: int = 8_000) -> str:
    """Wait for a toast notification to appear and return its text.

    Args:
        page: Playwright page.
        timeout: Max wait in ms.

    Returns:
        Toast text content.
    """
    toast = page.locator('#toast-container .toast-body').first
    toast.wait_for(state='visible', timeout=timeout)
    return toast.text_content().strip()


def get_scoreboard_scores(page: Page) -> dict[str, int]:
    """Parse the scoreboard table and return {player_name: score}.

    Args:
        page: Playwright page on the game route.

    Returns:
        Dict mapping player name to integer score.
    """
    rows = page.locator('#scoreboard tr')
    scores: dict[str, int] = {}
    count = rows.count()
    for i in range(count):
        row = rows.nth(i)
        cells = row.locator('td')
        if cells.count() >= 2:
            name = cells.nth(0).text_content().strip()
            try:
                score = int(cells.nth(1).text_content().strip())
            except ValueError:
                score = 0
            scores[name] = score
    return scores
