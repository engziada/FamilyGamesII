from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import List

from playwright.sync_api import Browser, Page, Playwright, sync_playwright


BASE_URL = os.getenv('FAMILY_GAMES_SMOKE_BASE_URL', 'http://127.0.0.1:5005')
OUTPUT_PATH = Path(os.getenv('FAMILY_GAMES_SMOKE_OUTPUT', 'smoke-findings.json'))

# Maps game_type key → Arabic card title in the catalog grid
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


@dataclass
class StepFinding:
    step: str
    status: str
    details: str


@dataclass
class GameFinding:
    game_type: str
    room_id: str = ''
    steps: List[StepFinding] = field(default_factory=list)

    def add(self, step: str, status: str, details: str) -> None:
        self.steps.append(StepFinding(step=step, status=status, details=details))


class SmokeRunner:
    def __init__(self, playwright: Playwright) -> None:
        self.playwright = playwright
        self.browser: Browser = playwright.chromium.launch(headless=True)

    def close(self) -> None:
        self.browser.close()

    def run(self) -> List[GameFinding]:
        findings: List[GameFinding] = []
        for game_type in GAME_TITLES:
            findings.append(self.run_for_game(game_type))
        return findings

    def run_for_game(self, game_type: str) -> GameFinding:
        finding = GameFinding(game_type=game_type)
        host_page = self.new_page()
        guest_one = self.new_page()
        guest_two = self.new_page()
        try:
            room_id = self.create_room(host_page, game_type, 'Host-A')
            finding.room_id = room_id
            finding.add('create_room', 'passed', f'Created room {room_id}')

            self.join_room(guest_one, room_id, 'Player-B')
            finding.add('join_guest_1', 'passed', 'Player-B joined room')

            self.join_room(guest_two, room_id, 'Player-C')
            finding.add('join_guest_2', 'passed', 'Player-C joined room')

            self.start_game(host_page)
            finding.add('start_game', 'passed', 'Host started the game')

            finding.add(
                'interaction',
                'manual_check',
                'Run tests/e2e/ for automated interaction coverage',
            )
        except Exception as exc:
            finding.add('runner', 'failed', str(exc))
        finally:
            host_page.close()
            guest_one.close()
            guest_two.close()
        return finding

    def new_page(self) -> Page:
        """Open a fresh browser context and navigate to the home page."""
        context = self.browser.new_context(viewport={'width': 430, 'height': 932})
        page = context.new_page()
        page.goto(BASE_URL, wait_until='domcontentloaded')
        return page

    def create_room(self, page: Page, game_type: str, player_name: str) -> str:
        """Create a game room and return the Convex room ID.

        Uses the live selectors from the current templates:
          - .game-card filtered by title → 'لعبة جديدة' button
          - #createGameModal → #host-name → 'أنشئ الغرفة' button
          - #full-room-id hidden span on the game page
        """
        title = GAME_TITLES[game_type]
        card = page.locator('.game-card').filter(has_text=title)
        card.get_by_role('button', name='لعبة جديدة').click()

        modal = page.locator('#createGameModal')
        modal.wait_for(state='visible', timeout=8_000)
        modal.locator('#host-name').fill(player_name)
        modal.get_by_role('button', name='أنشئ الغرفة').click()

        # Wait for navigation to the game page
        page.wait_for_url('**/game/**', timeout=15_000)

        # Extract room ID from the hidden span injected by Flask template
        room_id = page.locator('#full-room-id').text_content(timeout=10_000).strip()
        return room_id

    def join_room(self, page: Page, room_id: str, player_name: str) -> None:
        """Join an existing room as a non-host player.

        Pastes the full game URL into #join-room-input, opens the join modal,
        fills #join-name, and clicks #btn-join-confirm.
        """
        join_url = f'{BASE_URL}/game/{room_id}'
        page.locator('#join-room-input').fill(join_url)
        page.locator('#btn-open-join').click()

        modal = page.locator('#joinGameModal')
        modal.wait_for(state='visible', timeout=8_000)
        modal.locator('#join-name').fill(player_name)
        modal.locator('#btn-join-confirm').click()

        page.wait_for_url('**/game/**', timeout=15_000)

    def start_game(self, page: Page) -> None:
        """Click the start game button (visible only for the host).

        Waits for #btn-start-game to become visible before clicking.
        """
        btn = page.locator('#btn-start-game')
        btn.wait_for(state='visible', timeout=10_000)
        btn.click()


def main() -> None:
    with sync_playwright() as playwright:
        runner = SmokeRunner(playwright)
        try:
            findings = runner.run()
        finally:
            runner.close()
    OUTPUT_PATH.write_text(
        json.dumps(
            [
                {
                    'game_type': finding.game_type,
                    'room_id': finding.room_id,
                    'steps': [asdict(step) for step in finding.steps],
                }
                for finding in findings
            ],
            ensure_ascii=False,
            indent=2,
        ),
        encoding='utf-8',
    )
    print(f'Smoke findings written to {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
