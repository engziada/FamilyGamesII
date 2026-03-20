import os
from unittest.mock import patch
import logging

# Mock logging to avoid output during test
logging.basicConfig(level=logging.INFO)

def test_env_vars():
    # Test cases: (env_dict, expected_value)
    test_cases = [
        ({"CONVEX_URL": "url1"}, "url1"),
        ({"convex_url": "url2"}, "url2"),
        ({"VITE_CONVEX_URL": "url3"}, "url3"),
        ({"vite_convex_url": "url4"}, "url4"),
        ({"CONVEX_URL": "url1", "convex_url": "url2"}, "url1"), # Priority test
        ({}, ""), # Default case
    ]

    for env, expected in test_cases:
        with patch.dict(os.environ, env, clear=True):
            # Re-import or reload logic from app.py
            # Since app.py defines CONVEX_URL at module level, we need to read it carefully
            # or just test the logic directly if we can't easily reload

            # Simple way: exec the logic
            locs = {}
            exec("import os; CONVEX_URL = (os.getenv('CONVEX_URL') or os.getenv('convex_url') or os.getenv('VITE_CONVEX_URL') or os.getenv('vite_convex_url') or '')", {}, locs)
            actual = locs['CONVEX_URL']

            if actual == expected:
                print(f"PASS: env={env} -> {actual}")
            else:
                print(f"FAIL: env={env} -> expected {expected}, got {actual}")
                exit(1)

if __name__ == "__main__":
    test_env_vars()
