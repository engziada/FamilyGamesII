"""Debug test to trace charades score update issue."""
import pytest
from playwright.sync_api import Page, expect
from tests.e2e.helpers import create_room, join_room, start_game

GAME_TYPE = 'charades'


def test_debug_charades_scores(host_page: Page, player_b_page: Page, base_url: str) -> None:
    """Debug test to trace charades score updates."""
    # Collect console messages
    console_msgs = []
    for page in (host_page, player_b_page):
        page.on('console', lambda msg, p=page: console_msgs.append(f"[{p.url.split('/')[-1][:10]}] [{msg.type}] {msg.text}"))
    
    # Create room
    room_id = create_room(host_page, GAME_TYPE, 'Host-A')
    join_room(player_b_page, room_id, 'Player-B', base_url)
    
    # Start game
    start_game(host_page)
    
    # Wait for ready button
    host_page.wait_for_function(
        "document.querySelector('#btn-ready') !== null",
        timeout=10_000,
    )
    
    # Identify performer and guesser
    host_ready_count = host_page.locator('#btn-ready').count()
    if host_ready_count > 0:
        performer, guesser = host_page, player_b_page
    else:
        performer, guesser = player_b_page, host_page
    
    print(f"\n=== PERFORMER: {performer.url.split('?')[0].split('/')[-1]} ===")
    print(f"=== GUESSER: {guesser.url.split('?')[0].split('/')[-1]} ===")
    
    # Click ready → preparing phase → click start performing
    performer.locator('#btn-ready').click()
    performer.wait_for_selector('#btn-start-performing', timeout=10_000)
    performer.locator('#btn-start-performing').click()
    
    # Wait for guess correct button
    guesser.wait_for_selector('#btn-guess-correct', timeout=10_000)
    
    # Get initial scores
    initial_scores = guesser.evaluate("""() => {
        const tds = document.querySelectorAll('#scoreboard td');
        const scores = {};
        for (let i = 0; i < tds.length; i += 2) {
            const name = tds[i].textContent.trim();
            const score = parseInt(tds[i+1].textContent) || 0;
            scores[name] = score;
        }
        return scores;
    }""")
    print(f"\n=== INITIAL SCORES: {initial_scores} ===")
    
    # Check game state before guess
    state_before = guesser.evaluate("window.__lastGameState")
    print(f"\n=== STATE BEFORE GUESS: {state_before} ===")
    
    # Click guess correct and trace the mutation
    result = guesser.evaluate("""async () => {
        try {
            const res = await convex.mutate(api.games.charades.guessCorrect, {
                roomId: gameController.getRoomId(),
                guesserName: gameController.getPlayerName(),
            });
            return { success: true, result: res };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }""")
    print(f"\n=== GUESS CORRECT RESULT: {result} ===")
    
    # Wait a bit
    guesser.wait_for_timeout(3000)
    
    # Get final scores
    final_scores = guesser.evaluate("""() => {
        const tds = document.querySelectorAll('#scoreboard td');
        const scores = {};
        for (i = 0; i < tds.length; i += 2) {
            const name = tds[i].textContent.trim();
            const score = parseInt(tds[i+1].textContent) || 0;
            scores[name] = score;
        }
        return scores;
    }""")
    print(f"\n=== FINAL SCORES: {final_scores} ===")
    
    # Print console messages
    print("\n=== BROWSER CONSOLE ===")
    for msg in console_msgs[-30:]:
        print(msg)
