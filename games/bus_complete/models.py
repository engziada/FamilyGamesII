from datetime import datetime
import json
import logging
import os
import random

import eventlet
import requests
from games.charades.models import CharadesGame

logger = logging.getLogger(__name__)

class BusCompleteGame(CharadesGame):
    def __init__(self, game_id, host, settings=None):
        super().__init__(game_id, host, settings)
        self.game_type = 'bus_complete'
        self.alphabet = "أ ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي".split()
        self.categories = ['اسم', 'حيوان', 'نبات', 'جماد', 'بلاد', 'أكلة', 'مهنة']
        self.current_letter = None
        self.player_submissions = {}  # {player_name: {category: answer}}
        self.round_scores = {} # {player_name: {category: points}}
        self.stopped_by = None
        self.invalid_answers = {}  # {player_name: {category: answer}}
        self.answer_dictionary = self._load_answer_dictionary()
        self.validate_answers = self.settings.get('validate_answers', True)
        self.use_online_validation = self.settings.get('use_online_validation', True)
        self.wrong_letter_answers = {}  # {player_name: {category: answer}}
        self.validation_cache = {}
        self.category_keywords = self.settings.get('category_keywords', {
            'اسم': ['أسماء', 'اسم', 'أعلام', 'شخصيات', 'مواليد'],
            'حيوان': ['حيوانات', 'ثدييات', 'طيور', 'زواحف', 'أسماك', 'حشرات'],
            'نبات': ['نباتات', 'أشجار', 'محاصيل', 'زهور', 'أعشاب'],
            'جماد': ['أدوات', 'أجهزة', 'مكونات', 'معدات', 'أشياء'],
            'بلاد': ['دول', 'بلدان', 'مدن', 'عواصم', 'جغرافيا'],
            'أكلة': ['أطعمة', 'مأكولات', 'أطباق', 'حلويات', 'مطبخ'],
            'مهنة': ['مهن', 'وظائف', 'أعمال', 'حرف']
        })

    def start_game(self):
        if len(self.players) < 2:
            raise ValueError("عدد اللاعبين غير كافي")
        self.next_round()

    def next_round(self, item=None):
        self.status = 'round_active'
        self.current_letter = random.choice(self.alphabet)
        self.player_submissions = {}
        self.round_scores = {}
        self.stopped_by = None
        self.invalid_answers = {}
        self.wrong_letter_answers = {}
        self.round_start_time = datetime.now()

    def submit_answers(self, player_name, answers):
        """Store player answers after checking the starting letter only.
        
        This method is non-blocking. It only checks that each answer
        starts with the current letter. Full validation (online + dict)
        runs later during calculate_scores() so it doesn't block the
        player's submission.
        """
        if self.status != 'round_active':
            return False

        if not isinstance(answers, dict):
            return False

        normalized_answers = {}
        wrong_letter = {}

        for k, v in answers.items():
            if k is None:
                continue
            key = str(k)

            if v is None:
                value = ''
            elif isinstance(v, str):
                value = v.strip()
            else:
                value = str(v).strip()

            if not value:
                normalized_answers[key] = ''
                continue

            # Only check: must start with the current letter
            if not self._starts_with_letter(value):
                wrong_letter[key] = value
                normalized_answers[key] = ''
                continue

            normalized_answers[key] = value

        self.player_submissions[player_name] = normalized_answers
        self.wrong_letter_answers[player_name] = wrong_letter
        return True

    def stop_bus(self, player_name):
        if self.status != 'round_active':
            return False
        self.status = 'scoring'
        self.stopped_by = player_name
        self._validate_all_answers()
        self.calculate_scores()
        return True

    def _validate_all_answers(self):
        """Run online + dictionary validation on all submitted answers.
        
        Uses eventlet to validate all answers in parallel (non-blocking).
        Online (Wikipedia) is primary; local dictionary is fallback.
        """
        if not self.validate_answers:
            return

        # Collect all (player, category, answer) tuples to validate
        tasks = []
        for pname, answers in self.player_submissions.items():
            for cat, ans in answers.items():
                if ans:  # skip empty
                    tasks.append((pname, cat, ans))

        if not tasks:
            return

        # Validate in parallel using eventlet green threads
        pool = eventlet.GreenPool(size=min(len(tasks), 20))
        results = []

        def validate_task(task):
            pname, cat, ans = task
            valid = self._is_valid_answer(cat, ans)
            return (pname, cat, ans, valid)

        for result in pool.imap(validate_task, tasks):
            results.append(result)

        # Apply validation results: blank invalid answers and track them
        for pname, cat, ans, valid in results:
            if not valid:
                if pname not in self.invalid_answers:
                    self.invalid_answers[pname] = {}
                self.invalid_answers[pname][cat] = ans
                self.player_submissions[pname][cat] = ''

    def calculate_scores(self):
        """Calculate round scores based on validated submissions."""
        self.round_scores = {p['name']: {cat: 0 for cat in self.categories} for p in self.players}

        for cat in self.categories:
            answers_map = {}  # {normalized_answer: [player_names]}
            for p in self.players:
                pname = p['name']
                raw_ans = self.player_submissions.get(pname, {}).get(cat, '').strip()

                if not raw_ans:
                    continue

                norm_ans = self._normalize_text(raw_ans)
                norm_letter = self._normalize_text(self.current_letter)

                if norm_ans.startswith(norm_letter):
                    if norm_ans not in answers_map:
                        answers_map[norm_ans] = []
                    answers_map[norm_ans].append(pname)

            # Assign points
            for players in answers_map.values():
                points = 10 if len(players) == 1 else 5
                for pname in players:
                    self.round_scores[pname][cat] = points
                    self.add_score(pname, points)

    def add_score(self, player_name, points):
        if player_name not in self.scores:
            self.scores[player_name] = 0
        self.scores[player_name] += points

        if self.settings.get('teams'):
            p = next((p for p in self.players if p['name'] == player_name), None)
            if p:
                team_id = str(p['team'])
                if team_id not in self.team_scores:
                    self.team_scores[team_id] = 0
                self.team_scores[team_id] += points

    def to_dict(self, **kwargs):
        d = super().to_dict(**kwargs)
        d.update({
            'current_letter': self.current_letter,
            'categories': self.categories,
            'stopped_by': self.stopped_by
        })

        if self.status == 'scoring':
            d['player_submissions'] = self.player_submissions
            d['round_scores'] = self.round_scores
            d['invalid_answers'] = self.invalid_answers
            d['wrong_letter_answers'] = self.wrong_letter_answers
        else:
            d['submitted_players'] = list(self.player_submissions.keys())
            d.pop('current_item', None) # Not used in bus complete

        return d

    def _load_answer_dictionary(self):
        if isinstance(self.settings, dict) and self.settings.get('answer_dictionary'):
            return self._normalize_dictionary(self.settings['answer_dictionary'])

        dictionary_path = self.settings.get('answer_dictionary_path', 'static/data/bus_complete_dictionary.json')
        if not os.path.exists(dictionary_path):
            return {}

        try:
            with open(dictionary_path, 'r', encoding='utf-8') as handle:
                data = json.load(handle)
                return self._normalize_dictionary(data)
        except (OSError, json.JSONDecodeError):
            return {}

    def _normalize_dictionary(self, data):
        normalized = {}
        if not isinstance(data, dict):
            return normalized

        for category, words in data.items():
            if not isinstance(words, list):
                continue
            normalized_words = set()
            for word in words:
                if not word:
                    continue
                normalized_words.add(self._normalize_text(str(word)))
            normalized[str(category)] = normalized_words

        return normalized

    def _normalize_text(self, text):
        if text is None:
            return ''
        normalized = str(text).strip()
        normalized = normalized.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
        normalized = normalized.replace('ة', 'ه').replace('ى', 'ي').replace('ئ', 'ي').replace('ؤ', 'و')
        return normalized

    def _starts_with_letter(self, answer):
        """Check if the answer starts with the current round letter."""
        if not self.current_letter or not answer:
            return False
        norm_answer = self._normalize_text(answer)
        norm_letter = self._normalize_text(self.current_letter)
        return norm_answer.startswith(norm_letter)

    def _is_valid_answer(self, category, answer):
        """Validate an answer. Online (Wikipedia) is primary, local dict is fallback.
        
        Returns True if the answer is valid, False otherwise.
        """
        if not self.validate_answers:
            return True

        normalized_answer = self._normalize_text(answer)
        normalized_category = str(category)

        # Primary: online validation via Wikipedia
        if self.use_online_validation:
            online_result = self._validate_online(normalized_category, normalized_answer)
            if online_result is not None:
                return online_result
            # online_result is None means Wikipedia was unreachable -> fall through to dict

        # Fallback: local dictionary
        allowed_words = self.answer_dictionary.get(normalized_category)
        if not allowed_words:
            # No dictionary for this category -> accept the answer
            return True

        return normalized_answer in allowed_words

    def _validate_online(self, category, normalized_answer):
        """Validate an answer against Arabic Wikipedia.
        
        Returns True/False if Wikipedia gives a definitive answer,
        or None if the request fails (caller should fall back to dict).
        """
        cache_key = (category, normalized_answer)
        if cache_key in self.validation_cache:
            return self.validation_cache[cache_key]

        params = {
            'action': 'query',
            'titles': normalized_answer,
            'prop': 'categories',
            'format': 'json',
            'cllimit': 50
        }

        try:
            response = requests.get(
                'https://ar.wikipedia.org/w/api.php',
                params=params,
                timeout=self.settings.get('validation_timeout', 3)
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            logger.debug(f"Wikipedia validation failed for '{normalized_answer}', falling back to dictionary")
            self.validation_cache[cache_key] = None
            return None

        pages = data.get('query', {}).get('pages', {})
        if not pages:
            self.validation_cache[cache_key] = False
            return False

        page = next(iter(pages.values()))
        if 'missing' in page:
            self.validation_cache[cache_key] = False
            return False

        # Page exists on Wikipedia — if we have no keywords for this category,
        # existence alone is enough to consider it valid
        if category not in self.category_keywords:
            self.validation_cache[cache_key] = True
            return True

        keywords = self.category_keywords.get(category, [])
        if not keywords:
            self.validation_cache[cache_key] = True
            return True

        # Check if any Wikipedia category matches our keywords
        categories = page.get('categories', [])
        for cat in categories:
            title = cat.get('title', '')
            if any(keyword in title for keyword in keywords):
                self.validation_cache[cache_key] = True
                return True

        # Page exists but no category match — still accept it
        # (Wikipedia categories are inconsistent, better to be lenient)
        self.validation_cache[cache_key] = True
        return True
