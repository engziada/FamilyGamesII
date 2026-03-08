from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import List

from playwright.sync_api import Browser, Page, Playwright, sync_playwright


BASE_URL = os.getenv('FAMILY_GAMES_SMOKE_BASE_URL', 'http://127.0.0.1:5005')
OUTPUT_PATH = Path(os.getenv('FAMILY_GAMES_SMOKE_OUTPUT', 'smoke-findings.json'))


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
        for game_type in [
            'charades',
            'pictionary',
            'trivia',
            'rapid_fire',
            'twenty_questions',
            'riddles',
            'bus_complete',
        ]:
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

            self.start_room(host_page)
            finding.add('start_game', 'passed', 'Host started the game')

            finding.add('interaction', 'manual_check', 'Complete one correct path, one wrong path, and one withdrawal path for this game in-browser if needed')
        except Exception as exc:
            finding.add('runner', 'failed', str(exc))
        finally:
            host_page.close()
            guest_one.close()
            guest_two.close()
        return finding

    def new_page(self) -> Page:
        context = self.browser.new_context(viewport={'width': 430, 'height': 932})
        page = context.new_page()
        page.goto(BASE_URL)
        return page

    def create_room(self, page: Page, game_type: str, player_name: str) -> str:
        game_titles = {
            'charades': 'بدون كلام',
            'pictionary': 'ارسم وخمن',
            'trivia': 'بنك المعلومات',
            'rapid_fire': 'الأسئلة السريعة',
            'twenty_questions': 'عشرين سؤال',
            'riddles': 'الألغاز',
            'bus_complete': 'أتوبيس كومبليت',
        }
        page.get_by_role('heading', name=game_titles[game_type]).locator('..').get_by_role('button', name='+ لعبة جديدة').click()
        page.get_by_role('textbox', name='اسمك').fill(player_name)
        page.get_by_role('button', name='أنشئ الغرفة').click()
        room_text = page.locator('#room-id').inner_text()
        return room_text.strip()

    def join_room(self, page: Page, room_id: str, player_name: str) -> None:
        page.get_by_role('button', name='انضمام إلى غرفة').click()
        textboxes = page.get_by_role('textbox')
        textboxes.nth(0).fill(player_name)
        textboxes.nth(1).fill(room_id)
        page.get_by_role('button', name='عرض الغرفة').click()
        page.get_by_role('button', name='تأكيد الانضمام').click()

    def start_room(self, page: Page) -> None:
        page.get_by_role('button', name='يالا نبدأ').click()


def main() -> None:
    with sync_playwright() as playwright:
        runner = SmokeRunner(playwright)
        try:
            findings = runner.run()
        finally:
            runner.close()
    OUTPUT_PATH.write_text(
        json.dumps([
            {
                'game_type': finding.game_type,
                'room_id': finding.room_id,
                'steps': [asdict(step) for step in finding.steps],
            }
            for finding in findings
        ], ensure_ascii=False, indent=2),
        encoding='utf-8',
    )


if __name__ == '__main__':
    main()
