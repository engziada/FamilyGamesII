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
        self.player_votes = {}  # {answer_key: {player_name: True/False}} - manual validation votes
        self.partial_submissions = {}  # {player_name: {category: answer}} - real-time submissions
        self.validated_words = self._load_validated_words()  # Tier 3: previously validated words
        self._groq_client = None  # lazy-initialized

    def start_game(self):
        if len(self.players) < 2:
            raise ValueError("عدد اللاعبين غير كافي")
        self.next_round()

    def next_round(self, item=None):
        self.status = 'round_active'
        self.current_letter = random.choice(self.alphabet)
        self.player_submissions = {}
        self.partial_submissions = {}  # Reset partial submissions
        self.round_scores = {}
        self.stopped_by = None
        self.invalid_answers = {}
        self.wrong_letter_answers = {}
        self.player_votes = {}  # Reset votes for new round
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
        
        # Merge with existing partial_submissions (keep latest non-empty answer per category)
        if player_name not in self.partial_submissions:
            self.partial_submissions[player_name] = {}
        for cat, ans in normalized_answers.items():
            if ans:  # Only update if new answer is non-empty
                self.partial_submissions[player_name][cat] = ans
        
        self.wrong_letter_answers[player_name] = wrong_letter
        return True

    def stop_bus(self, player_name):
        """Stop the bus and transition to manual validation phase.

        Any player can stop the bus. When stopped, all players' partial
        submissions are collected and used for validation.
        """
        if self.status != 'round_active':
            return False
        self.status = 'validating'
        self.stopped_by = player_name

        # Merge all partial submissions into player_submissions
        # This ensures all players' words are included, not just the one who stopped
        for pname, answers in self.partial_submissions.items():
            if pname not in self.player_submissions:
                self.player_submissions[pname] = {}
            # Merge, ALWAYS overwriting with non-empty answers from partial_submissions
            for cat, ans in answers.items():
                if ans:  # Only overwrite if partial submission has a value
                    self.player_submissions[pname][cat] = ans

        # Run only Tier 1 validation (letter check) and Tier 2 (dictionary) - NOT auto-scoring
        self._validate_all_answers()
        return True

    def _validate_all_answers(self):
        """Run Tier 1 (letter) and Tier 2 (dictionary) validation only.

        Tier 1: Check starting letter (already done in submit_answers)
        Tier 2: Categorized dictionary (offline fallback per-answer)
        Tier 3: Previously validated words (manual validation history)

        Manual validation (Tier 4 by players) happens separately after this.
        NOTE: We do NOT auto-reject words that fail Tier 2/3 - they go to manual validation.
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

        # Run offline dictionary validation (Tier 2 & 3) - cache results but don't reject
        for pname, cat, ans in tasks:
            cache_key = (cat, ans)
            valid = self._is_valid_offline(cat, ans)
            self.validation_cache[cache_key] = valid
            # Don't auto-reject - let manual validation decide

    def calculate_scores(self):
        """Calculate round scores based on validated submissions.
        
        Scoring rules:
        - Unique word (used by 1 player only): 10 points
        - Shared word (used by 2+ players): 5 points each
        - Single-letter words: 0 points (automatically invalid)
        """
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

                # Skip single-letter words (Tier 2a rejection)
                if len(norm_ans) < 2:
                    continue

                # Only include if it starts with current letter
                if norm_ans.startswith(norm_letter):
                    if norm_ans not in answers_map:
                        answers_map[norm_ans] = []
                    answers_map[norm_ans].append(pname)

            # Assign points based on how many players used each word
            for norm_ans, players_list in answers_map.items():
                count = len(players_list)
                points = 10 if count == 1 else 5
                for pname in players_list:
                    self.round_scores[pname][cat] = points
                    self.add_score(pname, points)

    def submit_validation_vote(self, voter_name, answer_key, is_valid):
        """Submit a player's vote for a word's validity.

        Args:
            voter_name: Name of the player casting the vote
            answer_key: Key in format "category|normalized_word" identifying the word
            is_valid: Boolean indicating if the voter thinks the word is valid

        Returns:
            dict with current vote counts and validity status for the word
        """
        if self.status != 'validating':
            return None

        if answer_key not in self.player_votes:
            self.player_votes[answer_key] = {}

        # Toggle vote: if clicking same state, remove vote
        current_vote = self.player_votes[answer_key].get(voter_name)
        if current_vote == is_valid:
            del self.player_votes[answer_key][voter_name]
        else:
            self.player_votes[answer_key][voter_name] = is_valid

        return self._get_validation_status(answer_key)

    def _get_validation_status(self, answer_key):
        """Get the current validation status for a word.

        Returns dict with:
            - valid_count: number of valid votes
            - invalid_count: number of invalid votes
            - total_players: total number of players
            - is_valid: True if majority voted valid, False if majority voted invalid,
                       None if no clear majority
        """
        votes = self.player_votes.get(answer_key, {})
        valid_count = sum(1 for v in votes.values() if v)
        invalid_count = sum(1 for v in votes.values() if not v)
        total_players = len(self.players)

        # Need majority (> 50%) to determine validity
        if valid_count > total_players / 2:
            is_valid = True
        elif invalid_count > total_players / 2:
            is_valid = False
        else:
            is_valid = None

        return {
            'valid_count': valid_count,
            'invalid_count': invalid_count,
            'total_players': total_players,
            'is_valid': is_valid,
            'votes': votes
        }

    def finalize_validation(self):
        """Finalize validation and calculate scores based on majority votes.

        Only the host can call this. Applies the majority votes to mark words
        as valid/invalid, updates the validated_words dictionary, and calculates scores.

        Returns:
            True if finalized successfully, False otherwise
        """
        if self.status != 'validating':
            return False

        statuses = self.get_all_validation_statuses()
        words_to_add = {cat: [] for cat in self.categories}  # Words to add to validated_words
        words_to_remove = {cat: [] for cat in self.categories}  # Words to remove (overridden)

        # Process each unique word
        for answer_key, status in statuses.items():
            category = status['category']
            normalized = status['normalized']
            players = status['players']
            is_valid = status['is_valid']
            previously_validated = status['previously_validated']

            if is_valid is True:
                # Word passed validation
                if not previously_validated:
                    # Add to validated_words dictionary
                    words_to_add[category].append(normalized)
                # Mark as valid for all players who used it
                for pname in players:
                    if pname not in self.player_submissions:
                        self.player_submissions[pname] = {}
                    self.player_submissions[pname][category] = status['answer']
            elif is_valid is False:
                # Word failed validation
                if previously_validated:
                    # Override: remove from validated_words
                    words_to_remove[category].append(normalized)
                # Mark as invalid for all players who used it
                for pname in players:
                    if pname not in self.invalid_answers:
                        self.invalid_answers[pname] = {}
                    self.invalid_answers[pname][category] = status['answer']
                    if pname in self.player_submissions and category in self.player_submissions[pname]:
                        del self.player_submissions[pname][category]
            else:
                # No majority - treat as invalid (no score)
                for pname in players:
                    if pname not in self.invalid_answers:
                        self.invalid_answers[pname] = {}
                    self.invalid_answers[pname][category] = status['answer']
                    if pname in self.player_submissions and category in self.player_submissions[pname]:
                        del self.player_submissions[pname][category]

        # Update validated_words.json file
        self._update_validated_words_file(words_to_add, words_to_remove)

        # Calculate scores
        self.status = 'scoring'
        self.calculate_scores()
        return True

    def _update_validated_words_file(self, words_to_add, words_to_remove):
        """Update the validated_words.json file with new validated words.

        Args:
            words_to_add: {category: [normalized_words]} to add
            words_to_remove: {category: [normalized_words]} to remove (overridden)
        """
        validated_path = self.settings.get('validated_words_path', 'static/data/validated_words.json')

        # Load current data
        try:
            if os.path.exists(validated_path):
                with open(validated_path, 'r', encoding='utf-8') as handle:
                    data = json.load(handle)
            else:
                data = {cat: [] for cat in self.categories}
        except (OSError, json.JSONDecodeError):
            data = {cat: [] for cat in self.categories}

        # Update each category
        for cat in self.categories:
            current_words = set(data.get(cat, []))
            # Add new validated words
            current_words.update(words_to_add.get(cat, []))
            # Remove overridden words
            current_words.difference_update(words_to_remove.get(cat, []))
            data[cat] = list(current_words)

            # Update in-memory cache
            self.validated_words[cat] = current_words

        # Save to file
        try:
            os.makedirs(os.path.dirname(validated_path), exist_ok=True)
            with open(validated_path, 'w', encoding='utf-8') as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
            logger.info(f"Updated validated_words.json")
        except OSError as e:
            logger.error(f"Failed to save validated_words.json: {e}")

    def get_unique_words_for_validation(self):
        """Get unique words per category for validation (deduplicated, no player names).

        Filters out single-letter words (Tier 2a rejection).

        Returns dict: {category: [{word, players: [names], previously_validated: bool}]}
        """
        result = {cat: {} for cat in self.categories}  # {cat: {normalized_word: {word, players}}}

        for pname, answers in self.player_submissions.items():
            for cat, ans in answers.items():
                if not ans:
                    continue
                # Tier 2a: Skip single-letter words (they're automatically invalid)
                if len(self._normalize_text(ans)) < 2:
                    continue
                norm_ans = self._normalize_text(ans)
                if norm_ans not in result[cat]:
                    result[cat][norm_ans] = {
                        'word': ans,  # Keep original spelling for display
                        'players': []
                    }
                result[cat][norm_ans]['players'].append(pname)

        # Convert to list format and add previously_validated flag
        validation_data = {}
        for cat in self.categories:
            validation_data[cat] = []
            for norm_word, data in result[cat].items():
                previously_validated = norm_word in self.validated_words.get(cat, set())
                validation_data[cat].append({
                    'word': data['word'],
                    'normalized': norm_word,
                    'players': data['players'],
                    'previously_validated': previously_validated
                })

        return validation_data

    def get_all_validation_statuses(self):
        """Get validation status for unique words per category.

        Returns dict mapping answer_key (category|normalized_word) to validation status.
        """
        statuses = {}
        unique_words = self.get_unique_words_for_validation()

        for cat, words in unique_words.items():
            for word_data in words:
                # Key is category|normalized_word (no player name)
                key = f"{cat}|{word_data['normalized']}"
                votes = self.player_votes.get(key, {})
                valid_count = sum(1 for v in votes.values() if v)
                invalid_count = sum(1 for v in votes.values() if not v)
                total_players = len(self.players)

                # Determine validity
                if valid_count > total_players / 2:
                    is_valid = True
                elif invalid_count > total_players / 2:
                    is_valid = False
                else:
                    is_valid = None

                statuses[key] = {
                    'category': cat,
                    'answer': word_data['word'],
                    'normalized': word_data['normalized'],
                    'players': word_data['players'],
                    'previously_validated': word_data['previously_validated'],
                    'valid_count': valid_count,
                    'invalid_count': invalid_count,
                    'total_players': total_players,
                    'is_valid': is_valid,
                    'votes': votes
                }

        return statuses

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
        elif self.status == 'validating':
            d['player_submissions'] = self.player_submissions
            d['invalid_answers'] = self.invalid_answers
            d['wrong_letter_answers'] = self.wrong_letter_answers
            d['validation_statuses'] = self.get_all_validation_statuses()
            d['player_votes'] = self.player_votes
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

    def _load_validated_words(self):
        """Load previously validated words from permanent storage.
        
        This is the Tier 3 dictionary - words that passed manual validation.
        Returns dict: {category: set(normalized_words)}
        """
        validated_path = self.settings.get('validated_words_path', 'static/data/validated_words.json')
        if not os.path.exists(validated_path):
            return {cat: set() for cat in self.categories}

        try:
            with open(validated_path, 'r', encoding='utf-8') as handle:
                data = json.load(handle)
                normalized = {}
                for cat in self.categories:
                    words = data.get(cat, [])
                    if isinstance(words, list):
                        normalized[cat] = {self._normalize_text(w) for w in words if w}
                    else:
                        normalized[cat] = set()
                logger.info(f"Loaded validated words dictionary")
                return normalized
        except (OSError, json.JSONDecodeError) as e:
            logger.warning(f"Failed to load validated_words.json: {e}")
            return {cat: set() for cat in self.categories}

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

        prompt = f"""You are a judge for the Arabic word game "اتوبيس كومبليت" (Bus Complete).
Players write one word per category, all starting with the same letter.

Your job: check if each word reasonably fits its category.

CATEGORIES:
- اسم = Any real human first name (Arabic, foreign, or dialect names all count)
- حيوان = Any animal (mammal, bird, fish, insect, reptile)
- نبات = Any plant, flower, tree, fruit, or vegetable
- جماد = Any inanimate physical object (tool, furniture, device, etc.)
- بلاد = Any country, city, island, or region. Accept variant spellings.
- أكلة = Any food, dish, dessert, or snack (including regional/dialect foods)
- مهنة = Any job, profession, occupation, or field of work (e.g. زراعة = agriculture/farming counts as مهنة)

KEY RULES:
- BE LENIENT: if a word can reasonably fit the category, accept it
- Dialect/colloquial words are VALID (e.g. زلومة is a real Levantine food)
- Names that also have other meanings still count as names (e.g. زيادة is both a name and a word)
- Fields of work count as مهنة (زراعة = farming, تجارة = trade, هندسة = engineering)
- ONLY reject if the word clearly belongs to a completely different category
  Example: زرافة (giraffe) is حيوان, so it's INVALID for نبات

Words to validate (letter "{self.current_letter}"):
{chr(10).join(items_text)}

Return JSON: {{"results": [{{"word":"...","category":"...","valid":true/false}}]}}"""

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
        """Offline validation using categorized dict (tier 2) + validated_words (tier 3) + Hans Wehr (tier 4).
        
        Also rejects single-letter words (must be at least 2 characters).
        
        Returns True if the answer is valid, False otherwise.
        """
        normalized_answer = self._normalize_text(answer)
        normalized_category = str(category)

        # Tier 2a: Reject single letters (must be at least 2 characters)
        if len(normalized_answer) < 2:
            return False

        # Tier 2b: Categorized dictionary (category-specific)
        allowed_words = self.answer_dictionary.get(normalized_category)
        if allowed_words and normalized_answer in allowed_words:
            return True

        # Tier 3: Previously validated words (manual validation history)
        if normalized_answer in self.validated_words.get(normalized_category, set()):
            return True

        # Tier 4: General Arabic wordlist (Hans Wehr — 34K words)
        if self.general_wordlist and normalized_answer in self.general_wordlist:
            return True

        # If we have no dictionaries at all, accept the answer
        if not allowed_words and not self.general_wordlist:
            return True

        return False
