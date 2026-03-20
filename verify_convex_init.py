import os
import subprocess
import time
import requests
from playwright.sync_api import sync_playwright

def verify():
    # Set env var
    os.environ['convex_url'] = 'https://mock-convex-url.convex.cloud'

    # Start server in background
    server_process = subprocess.Popen(['python3', 'app.py'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    # Wait for server to be up
    max_retries = 20
    for i in range(max_retries):
        try:
            response = requests.get('http://localhost:5005', timeout=2)
            if response.status_code == 200:
                print("Server is up!")
                break
        except:
            pass
        time.sleep(1)
    else:
        print("Server failed to start")
        server_process.terminate()
        return

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto('http://localhost:5005')

            # 1. Check if window.__CONVEX_URL__ is set
            convex_url = page.evaluate('window.__CONVEX_URL__')
            print(f"window.__CONVEX_URL__: {convex_url}")
            assert convex_url == 'https://mock-convex-url.convex.cloud'

            # 2. Capture console errors to see if "Client not initialized" pops up
            errors = []
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

            # 3. Wait for content to load
            page.wait_for_load_state("networkidle")

            # Use a more generic locator for buttons
            buttons = page.locator('button:has-text("لعبة جديدة")')
            print(f"Found {buttons.count()} game buttons")

            if buttons.count() > 0:
                # Force click the first one if it's hidden or whatever
                buttons.first.click(force=True)
                print("Clicked first game button")
                time.sleep(2)

            # 4. Check for errors
            print(f"Captured {len(errors)} console errors:")
            has_init_error = False
            for err in errors:
                print(f" - {err}")
                if "Client not initialized" in err:
                    has_init_error = True

            if has_init_error:
                 print("FAIL: Found 'Client not initialized' error!")
                 exit(1)
            else:
                 print("PASS: No initialization errors found.")

            # Take a screenshot
            os.makedirs('verification', exist_ok=True)
            page.screenshot(path='verification/verification.png')
            print("Screenshot saved to verification/verification.png")

    finally:
        server_process.terminate()

if __name__ == '__main__':
    verify()
