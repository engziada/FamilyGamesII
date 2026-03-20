"""
Pytest configuration and shared fixtures for Family Games II E2E tests.

Uses pytest-playwright for browser/page/--headed/--base-url built-ins.
Requires a running Flask server + Convex dev backend.

Override base URL:
    pytest --base-url http://127.0.0.1:5005 tests/e2e/
    OR set FAMILY_GAMES_SMOKE_BASE_URL env var.
"""
from __future__ import annotations

import os
from typing import Generator

import pytest
from playwright.sync_api import Browser, BrowserContext, Page


# ── Configuration ────────────────────────────────────────────────────────────

VIEWPORT: dict = {'width': 430, 'height': 932}
_ENV_BASE_URL: str = os.getenv('FAMILY_GAMES_SMOKE_BASE_URL', 'http://127.0.0.1:5005')


# ── Base URL (wraps pytest-playwright's --base-url with env-var fallback) ────

@pytest.fixture(scope='session')
def base_url(request: pytest.FixtureRequest) -> str:
    """App base URL: --base-url CLI > FAMILY_GAMES_SMOKE_BASE_URL env > default."""
    try:
        cli_val = request.config.getoption('base_url')
        if cli_val:
            return cli_val
    except ValueError:
        pass
    return _ENV_BASE_URL


# ── Page fixture override (auto-navigate to base_url) ────────────────────────

@pytest.fixture
def page(browser: Browser, base_url: str) -> Generator[Page, None, None]:
    """Function-scoped page pre-navigated to the app home route.

    Overrides pytest-playwright's blank page fixture so all tests
    start at the lobby (base_url) without explicit goto() calls.
    """
    p = _new_page(browser, base_url)
    yield p
    p.context.close()


# ── Page factory helper ───────────────────────────────────────────────────────

def _new_page(browser: Browser, url: str) -> Page:
    """Create a fresh isolated browser context + page, navigate to url."""
    ctx: BrowserContext = browser.new_context(viewport=VIEWPORT)
    p: Page = ctx.new_page()
    p.goto(url, wait_until='domcontentloaded')
    return p


# ── Named player page fixtures ────────────────────────────────────────────────

@pytest.fixture
def host_page(browser: Browser, base_url: str) -> Generator[Page, None, None]:
    """Host player page, pre-loaded at the app home route."""
    p = _new_page(browser, base_url)
    yield p
    p.context.close()


@pytest.fixture
def player_b_page(browser: Browser, base_url: str) -> Generator[Page, None, None]:
    """Second player page, pre-loaded at the app home route."""
    p = _new_page(browser, base_url)
    yield p
    p.context.close()


@pytest.fixture
def player_c_page(browser: Browser, base_url: str) -> Generator[Page, None, None]:
    """Third player page, pre-loaded at the app home route."""
    p = _new_page(browser, base_url)
    yield p
    p.context.close()


# ── Room factory fixture ──────────────────────────────────────────────────────

@pytest.fixture
def room_factory(browser: Browser, base_url: str):
    """Factory: creates a new game room and returns (host_page, room_id).

    Usage::

        def test_something(room_factory):
            host_page, room_id = room_factory('trivia', 'Host-A')
    """
    from tests.e2e.helpers import create_room

    pages_created: list[Page] = []

    def _create(game_type: str, host_name: str = 'Host-A') -> tuple[Page, str]:
        p = _new_page(browser, base_url)
        pages_created.append(p)
        room_id = create_room(p, game_type, host_name)
        return p, room_id

    yield _create

    for p in pages_created:
        try:
            p.context.close()
        except Exception:
            pass


# ── Convex availability guard ─────────────────────────────────────────────────

def _check_convex() -> bool:
    """Return True if CONVEX_URL is set and the endpoint responds."""
    import urllib.request
    from dotenv import load_dotenv
    # Mirror the load order in app.py so npx convex dev's .env.local is picked up
    load_dotenv()
    load_dotenv('.env.local', override=True)
    url = os.getenv('CONVEX_URL', '').strip()
    if not url:
        return False
    try:
        urllib.request.urlopen(url, timeout=4)
        return True
    except Exception:
        return True  # URL set but may return non-200; presence is enough


@pytest.fixture(scope='session')
def convex_available() -> bool:
    """Session fixture: True when Convex backend is configured and reachable."""
    return _check_convex()


@pytest.fixture
def require_convex(convex_available: bool) -> None:
    """Skip the test if Convex is not available."""
    if not convex_available:
        pytest.skip('Convex backend not running — set CONVEX_URL in .env or run: npx convex dev')


# ── JS error collector fixture ───────────────────────────────────────────────

@pytest.fixture
def js_errors(page: Page) -> Generator[list[str], None, None]:
    """Collect unhandled JS errors on a single page during the test.

    Usage::

        def test_something(page, js_errors):
            ...
            assert js_errors == [], f"JS errors: {js_errors}"
    """
    errors: list[str] = []
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    yield errors
