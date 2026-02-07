from datetime import datetime
import json
import os
import random
import requests
from games.charades.models import CharadesGame

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
        self.validate_answers = self.settings.get('validate_answers', bool(self.answer_dictionary))
        self.use_online_validation = self.settings.get('use_online_validation', False)
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
        """Validate and store player answers. Returns True on success.
        
        Checks:
        1. Answer starts with the current letter
        2. Answer passes dictionary/online validation (if enabled)
        Invalid answers are tracked separately for frontend feedback.
        """
        if self.status != 'round_active':
            return False

        if not isinstance(answers, dict):
            return False

        normalized_answers = {}
        invalid_answers = {}
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

            # Check 1: Must start with the current letter
            if not self._starts_with_letter(value):
                wrong_letter[key] = value
                normalized_answers[key] = ''
                continue

            # Check 2: Dictionary / online validation
            if value and not self._is_valid_answer(key, value):
                invalid_answers[key] = value
                normalized_answers[key] = ''
            else:
                normalized_answers[key] = value

        self.player_submissions[player_name] = normalized_answers
        self.invalid_answers[player_name] = invalid_answers
        self.wrong_letter_answers[player_name] = wrong_letter
        return True

    def stop_bus(self, player_name):
        if self.status != 'round_active':
            return False
        self.status = 'scoring'
        self.stopped_by = player_name
        self.calculate_scores()
        return True

    def calculate_scores(self):
        # Initialize scores for this round
        self.round_scores = {p['name']: {cat: 0 for cat in self.categories} for p in self.players}

        for cat in self.categories:
            # Collect all answers for this category, normalized for comparison
            answers_map = {} # {normalized_answer: [player_names]}
            for p in self.players:
                pname = p['name']
                raw_ans = self.player_submissions.get(pname, {}).get(cat, '').strip()

                if not raw_ans:
                    continue

                # Normalization for comparison
                norm_ans = self._normalize_text(raw_ans)

                # Check if it starts with the current letter (also normalized)
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
        if not self.validate_answers:
            return True

        normalized_answer = self._normalize_text(answer)
        normalized_category = str(category)

        if self.use_online_validation:
            online_result = self._validate_online(normalized_category, normalized_answer)
            if online_result is not None:
                return online_result

        allowed_words = self.answer_dictionary.get(normalized_category)
        if not allowed_words:
            return True

        return normalized_answer in allowed_words

    def _validate_online(self, category, normalized_answer):
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
                timeout=self.settings.get('validation_timeout', 2)
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
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

        if category not in self.category_keywords:
            self.validation_cache[cache_key] = True
            return True

        keywords = self.category_keywords.get(category, [])
        if not keywords:
            self.validation_cache[cache_key] = True
            return True

        categories = page.get('categories', [])
        for cat in categories:
            title = cat.get('title', '')
            if any(keyword in title for keyword in keywords):
                self.validation_cache[cache_key] = True
                return True

        self.validation_cache[cache_key] = False
        return False
