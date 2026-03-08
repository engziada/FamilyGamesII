"""
Riddles data fetcher with online-first and local fallback behavior.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

from .base_fetcher import BaseFetcher


class RiddlesFetcher(BaseFetcher):
    """Fetches Arabic riddles from a configurable online source with local fallback."""

    def __init__(self, source_url: str | None = None) -> None:
        super().__init__(rate_limit_delay=1.0)
        self.source_url = source_url
        self.local_path = Path(__file__).resolve().parents[2] / 'static' / 'data' / 'riddles.json'

    def get_source_name(self) -> str:
        """Return the current source label for cached riddles."""
        if self.source_url:
            return self.source_url
        return 'local_riddles_fallback'

    def fetch_batch(self, count: int = 30) -> List[Dict]:
        """Fetch riddles from an online JSON document, then fall back to local static data."""
        riddles = self._fetch_remote_riddles()
        if not riddles:
            riddles = self._load_local_riddles()
        return riddles[:count]

    def _fetch_remote_riddles(self) -> List[Dict]:
        """Load riddles from a remote JSON endpoint if configured."""
        if not self.source_url:
            return []
        try:
            response = self._get(self.source_url)
            payload = response.json()
            riddles = payload.get('riddles', payload if isinstance(payload, list) else [])
            return self._normalize_riddles(riddles)
        except Exception:
            return []

    def _load_local_riddles(self) -> List[Dict]:
        """Load local riddles JSON as a fallback source."""
        try:
            with self.local_path.open('r', encoding='utf-8') as handle:
                payload = json.load(handle)
            riddles = payload.get('riddles', [])
            return self._normalize_riddles(riddles)
        except Exception:
            return []

    def _normalize_riddles(self, riddles: List[Dict]) -> List[Dict]:
        """Normalize riddle records into the shape expected by the game models."""
        normalized: List[Dict] = []
        for riddle in riddles:
            if not riddle.get('riddle') or not riddle.get('answer'):
                continue
            normalized.append({
                'riddle': str(riddle['riddle']).strip(),
                'answer': str(riddle['answer']).strip(),
                'accepted_answers': [str(answer).strip() for answer in riddle.get('accepted_answers', []) if str(answer).strip()],
                'hints': [str(hint).strip() for hint in riddle.get('hints', []) if str(hint).strip()],
                'category': str(riddle.get('category', 'ألغاز عامة')).strip() or 'ألغاز عامة',
                'difficulty': str(riddle.get('difficulty', 'medium')).strip() or 'medium',
            })
        return normalized
