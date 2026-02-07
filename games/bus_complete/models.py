from datetime import datetime
import json
import logging
import os
import random

from dotenv import load_dotenv
from groq import Groq
from games.charades.models import CharadesGame

load_dotenv()
logger = logging.getLogger(__name__)

GROQ_MODEL = 'llama-3.3-70b-versatile'
CATEGORIES_DESCRIPTION = {
    'اسم': 'human first name (Arabic or common)',
    'حيوان': 'animal (mammal, bird, fish, insect, reptile)',
    'نبات': 'plant, flower, tree, fruit, or vegetable',
    'جماد': 'inanimate physical object',
    'بلاد': 'country or city',
    'أكلة': 'food or dish',
    'مهنة': 'job or profession title',
}


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
        self.general_wordlist = self._load_general_wordlist()
        self.validate_answers = self.settings.get('validate_answers', True)
        self.use_online_validation = self.settings.get('use_online_validation', True)
        self.wrong_letter_answers = {}  # {player_name: {category: answer}}
        self.validation_cache = {}
        self._groq_client = None  # lazy-initialized

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
        """Run AI + dictionary validation on all submitted answers.
        
        Tier 1: Groq AI (category-aware, batch call)
        Tier 2: Categorized dictionary (offline fallback per-answer)
        Tier 3: General Arabic wordlist (offline fallback per-answer)
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

        # Tier 1: Try AI batch validation
        ai_results = {}  # {(category, answer): True/False}
        if self.use_online_validation:
            ai_results = self._validate_ai_batch(tasks)

        # Apply results: AI first, then dict+wordlist fallback
        for pname, cat, ans in tasks:
            cache_key = (cat, ans)

            if cache_key in ai_results:
                valid = ai_results[cache_key]
            else:
                # AI didn't cover this answer -> offline fallback
                valid = self._is_valid_offline(cat, ans)

            self.validation_cache[cache_key] = valid

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

    def _load_general_wordlist(self):
        """Load the general Arabic wordlist (Hans Wehr, 34K words) as a normalized set.
        
        This flat wordlist is used as tier-3 fallback validation to check
        if a word exists in Arabic at all, regardless of category.
        """
        wordlist_path = self.settings.get('general_wordlist_path', 'static/data/arabic_wordlist.txt')
        if not os.path.exists(wordlist_path):
            return set()

        try:
            with open(wordlist_path, 'r', encoding='utf-8') as handle:
                words = set()
                for line in handle:
                    word = line.strip()
                    if word:
                        words.add(self._normalize_text(word))
                logger.info(f"Loaded general Arabic wordlist: {len(words)} words")
                return words
        except OSError:
            return set()

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

    def _get_groq_client(self):
        """Lazy-initialize the Groq client."""
        if self._groq_client is None:
            api_key = os.getenv('GROQ_API_KEY', '')
            if api_key and api_key != 'your_groq_api_key_here':
                self._groq_client = Groq(api_key=api_key)
        return self._groq_client

    def _validate_ai_batch(self, tasks):
        """Validate all answers in a single Groq AI call.
        
        Args:
            tasks: list of (player_name, category, answer) tuples
            
        Returns:
            dict of {(category, answer): True/False} for each validated pair.
            Empty dict if AI is unavailable.
        """
        client = self._get_groq_client()
        if not client:
            logger.debug("Groq API key not configured, falling back to offline validation")
            return {}

        # Deduplicate: same word+category only needs one check
        unique_pairs = list({(cat, ans) for _, cat, ans in tasks})

        items_text = []
        for cat, ans in unique_pairs:
            desc = CATEGORIES_DESCRIPTION.get(cat, cat)
            items_text.append(f'  "{ans}" -> category "{cat}" ({desc})')

        prompt = f"""You validate answers for the Arabic game "اتوبيس كومبليت".
Letter: "{self.current_letter}"

STRICT RULES — a word is valid ONLY if ALL conditions are met:
1. The word is a real, commonly known Arabic word (colloquial OK)
2. The word ACTUALLY BELONGS to the given category — not any other category
   - اسم = human first name ONLY (not an object, animal, place, or food name)
   - حيوان = animal ONLY (mammal, bird, fish, insect, reptile)
   - نبات = plant/flower/tree/fruit/vegetable ONLY
   - جماد = inanimate physical object ONLY (not food, not a person, not an animal)
   - بلاد = country or city ONLY
   - أكلة = food or dish ONLY (not a country, person, or object)
   - مهنة = job/profession title ONLY (not an object, animal, or food)
3. A word that exists in Arabic but belongs to a DIFFERENT category must be marked false
   Example: "بقرة" is valid for حيوان but INVALID for نبات

For each word, think: "What category does this word ACTUALLY belong to? Does it match the given category?"

Words:
{chr(10).join(items_text)}

Return ONLY a JSON array: [{{"word":"...","category":"...","valid":true/false}}]"""

        timeout = self.settings.get('validation_timeout', 8)
        for attempt in range(2):
            try:
                response = client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0,
                    max_tokens=1024,
                    timeout=timeout,
                    response_format={"type": "json_object"},
                )
                raw = response.choices[0].message.content.strip()
                # Strip markdown code fences if present
                if raw.startswith('```'):
                    raw = raw.split('\n', 1)[1].rsplit('```', 1)[0].strip()

                parsed = json.loads(raw)
                # Handle both {"results": [...]} and [...] formats
                if isinstance(parsed, dict):
                    results = parsed.get('results', parsed.get('data', parsed.get('words', [])))
                    if not results:
                        # Try first list-valued key
                        for v in parsed.values():
                            if isinstance(v, list):
                                results = v
                                break
                else:
                    results = parsed

                ai_map = {}
                for r in results:
                    ai_map[(r['category'], r['word'])] = bool(r['valid'])
                logger.info(f"AI validated {len(ai_map)} word-category pairs")
                return ai_map

            except json.JSONDecodeError as e:
                logger.warning(f"AI JSON parse error (attempt {attempt+1}): {e}")
                continue
            except Exception as e:
                logger.warning(f"Groq AI validation failed: {e}, falling back to offline")
                return {}

        logger.warning("AI validation failed after retries, falling back to offline")
        return {}

    def _is_valid_answer(self, category, answer):
        """Check validation cache or run offline fallback.
        
        This is called per-answer when AI batch didn't cover it.
        """
        if not self.validate_answers:
            return True

        cache_key = (category, answer)
        if cache_key in self.validation_cache:
            return self.validation_cache[cache_key]

        valid = self._is_valid_offline(category, answer)
        self.validation_cache[cache_key] = valid
        return valid

    def _is_valid_offline(self, category, answer):
        """Offline validation using categorized dict (tier 2) + Hans Wehr (tier 3).
        
        Returns True if the answer is valid, False otherwise.
        """
        normalized_answer = self._normalize_text(answer)
        normalized_category = str(category)

        # Tier 2: Categorized dictionary (category-specific)
        allowed_words = self.answer_dictionary.get(normalized_category)
        if allowed_words and normalized_answer in allowed_words:
            return True

        # Tier 3: General Arabic wordlist (Hans Wehr — 34K words)
        if self.general_wordlist and normalized_answer in self.general_wordlist:
            return True

        # If we have no dictionaries at all, accept the answer
        if not allowed_words and not self.general_wordlist:
            return True

        return False
