"""
Trivia questions fetcher with AI translation support.
Sources: Egyptian cinema quiz, OpenTDB, Islamic Quiz API
"""
from typing import List, Dict, Optional
import requests
import random
from .base_fetcher import BaseFetcher
from .trivia_categories import TriviaCategories


class TriviaFetcher(BaseFetcher):
    """
    Fetches trivia questions from multiple sources with Arabic translation.
    """
    
    def __init__(self, ai_api_key: Optional[str] = None):
        super().__init__(rate_limit_delay=1.0)
        self.ai_api_key = ai_api_key
        
        # API endpoints
        self.opentdb_url = "https://opentdb.com/api.php"
        self.islamic_quiz_url = "https://raw.githubusercontent.com/rn0x/IslamicQuizAPI/main"
        self.groq_url = "https://api.groq.com/openai/v1/chat/completions"
    
    def get_source_name(self) -> str:
        return "OpenTDB + Islamic Quiz + Egyptian Cinema"
    
    def fetch_batch(self, count: int = 30) -> List[Dict]:
        """
        Fetch a batch of trivia questions from multiple diverse sources and categories.
        
        Returns:
            List of dicts with: question, correct_answer, wrong_answers, category, difficulty
        """
        items = []
        
        try:
            # Distribute across diverse categories
            items_per_category = max(1, count // 7)  # 7 categories
            
            # Fetch from Islamic questions
            islamic_items = self._fetch_islamic_quiz(items_per_category)
            items.extend(islamic_items)
            
            # Fetch general knowledge
            general_items = self._fetch_general_knowledge(items_per_category)
            items.extend(general_items)
            
            # Fetch science questions
            science_items = self._fetch_science(items_per_category)
            items.extend(science_items)
            
            # Fetch history questions
            history_items = self._fetch_history(items_per_category)
            items.extend(history_items)
            
            # Fetch geography questions
            geography_items = self._fetch_geography(items_per_category)
            items.extend(geography_items)
            
            # Fetch sports questions
            sports_items = self._fetch_sports(items_per_category)
            items.extend(sports_items)
            
            # Fetch Egyptian cinema (as one category among many)
            cinema_items = self._fetch_egyptian_cinema(items_per_category)
            items.extend(cinema_items)
            
            # If we need more items, fetch from OpenTDB
            if len(items) < count:
                opentdb_items = self._fetch_opentdb(count - len(items))
                items.extend(opentdb_items)
            
        except Exception as e:
            print(f"Error fetching trivia data: {e}")
        
        random.shuffle(items)
        return items[:count]
    
    def _fetch_egyptian_cinema(self, count: int) -> List[Dict]:
        """
        Fetch Egyptian cinema trivia questions.
        Note: The wayground.com quiz is a web page, not an API.
        Using static questions as placeholder.
        """
        questions = []
        
        # Expanded Egyptian cinema questions covering different eras and topics
        static_questions = [
            # Classic Cinema Era
            {
                'question': 'من بطل فيلم "الناصر صلاح الدين"؟',
                'correct_answer': 'أحمد مظهر',
                'wrong_answers': ['عمر الشريف', 'رشدي أباظة', 'فريد شوقي'],
                'category': 'سينما مصرية',
                'difficulty': 'medium'
            },
            {
                'question': 'في أي عام تم إنتاج فيلم "الأرض"؟',
                'correct_answer': '1969',
                'wrong_answers': ['1965', '1972', '1975'],
                'category': 'سينما مصرية',
                'difficulty': 'hard'
            },
            {
                'question': 'من مخرج فيلم "باب الحديد"؟',
                'correct_answer': 'يوسف شاهين',
                'wrong_answers': ['صلاح أبو سيف', 'حسن الإمام', 'عاطف الطيب'],
                'category': 'سينما مصرية',
                'difficulty': 'medium'
            },
            {
                'question': 'من بطلة فيلم "دعاء الكروان"؟',
                'correct_answer': 'فاتن حمامة',
                'wrong_answers': ['سعاد حسني', 'شادية', 'هند رستم'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'من مخرج فيلم "القاهرة 30"؟',
                'correct_answer': 'صلاح أبو سيف',
                'wrong_answers': ['يوسف شاهين', 'حسن الإمام', 'كمال الشيخ'],
                'category': 'سينما مصرية',
                'difficulty': 'hard'
            },
            {
                'question': 'من بطلة فيلم "الحرام"؟',
                'correct_answer': 'فاتن حمامة',
                'wrong_answers': ['سعاد حسني', 'نادية لطفي', 'مريم فخر الدين'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            
            # Golden Era
            {
                'question': 'ما اسم الشخصية التي لعبها عادل إمام في فيلم "الإرهاب والكباب"؟',
                'correct_answer': 'أحمد',
                'wrong_answers': ['محمود', 'حسن', 'علي'],
                'category': 'سينما مصرية',
                'difficulty': 'medium'
            },
            {
                'question': 'من مخرج فيلم "الكيت كات"؟',
                'correct_answer': 'داود عبد السيد',
                'wrong_answers': ['محمد خان', 'عاطف الطيب', 'خيري بشارة'],
                'category': 'سينما مصرية',
                'difficulty': 'hard'
            },
            {
                'question': 'من بطل فيلم "المصير"؟',
                'correct_answer': 'نور الشريف',
                'wrong_answers': ['محمود عبد العزيز', 'أحمد زكي', 'عادل إمام'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'في أي فيلم قال محمد هنيدي "أنا مش عارف حاجة"؟',
                'correct_answer': 'إسماعيلية رايح جاي',
                'wrong_answers': ['صعيدي في الجامعة الأمريكية', 'سعيد كلاكيت', 'تيمور وشفيقة'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'من بطلة فيلم "خللي بالك من زوزو"؟',
                'correct_answer': 'سعاد حسني',
                'wrong_answers': ['نادية لطفي', 'شادية', 'ماجدة'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'من مخرج فيلم "الأفوكاتو"؟',
                'correct_answer': 'رأفت الميهي',
                'wrong_answers': ['محمد خان', 'داود عبد السيد', 'عاطف الطيب'],
                'category': 'سينما مصرية',
                'difficulty': 'hard'
            },
            
            # Modern Cinema
            {
                'question': 'من بطل فيلم "عمارة يعقوبيان"؟',
                'correct_answer': 'عادل إمام',
                'wrong_answers': ['أحمد السقا', 'كريم عبد العزيز', 'محمد رمضان'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'من مخرج فيلم "هي فوضى"؟',
                'correct_answer': 'يوسف شاهين',
                'wrong_answers': ['خالد يوسف', 'مروان حامد', 'عمرو سلامة'],
                'category': 'سينما مصرية',
                'difficulty': 'medium'
            },
            {
                'question': 'من بطل فيلم "الفيل الأزرق"؟',
                'correct_answer': 'كريم عبد العزيز',
                'wrong_answers': ['أحمد السقا', 'أحمد عز', 'محمد رمضان'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'في أي عام تم إنتاج فيلم "الفيل الأزرق"؟',
                'correct_answer': '2014',
                'wrong_answers': ['2012', '2016', '2018'],
                'category': 'سينما مصرية',
                'difficulty': 'medium'
            },
            {
                'question': 'من مخرج فيلم "الخلية"؟',
                'correct_answer': 'طارق العريان',
                'wrong_answers': ['مروان حامد', 'أحمد خالد موسى', 'عمرو سلامة'],
                'category': 'سينما مصرية',
                'difficulty': 'hard'
            },
            
            # Actors & Actresses
            {
                'question': 'من لقبت بـ "سندريلا الشاشة العربية"؟',
                'correct_answer': 'سعاد حسني',
                'wrong_answers': ['فاتن حمامة', 'شادية', 'نادية لطفي'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'من لقب بـ "الزعيم"؟',
                'correct_answer': 'عادل إمام',
                'wrong_answers': ['نور الشريف', 'محمود عبد العزيز', 'أحمد زكي'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'من لقب بـ "الملك"؟',
                'correct_answer': 'أحمد زكي',
                'wrong_answers': ['نور الشريف', 'محمود عبد العزيز', 'عادل إمام'],
                'category': 'سينما مصرية',
                'difficulty': 'medium'
            },
            {
                'question': 'من لقبت بـ "سيدة الشاشة العربية"؟',
                'correct_answer': 'فاتن حمامة',
                'wrong_answers': ['سعاد حسني', 'شادية', 'ماجدة'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            
            # Comedy Films
            {
                'question': 'من بطل فيلم "اللمبي"؟',
                'correct_answer': 'محمد سعد',
                'wrong_answers': ['محمد هنيدي', 'أحمد حلمي', 'علاء ولي الدين'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'من بطل فيلم "صعيدي في الجامعة الأمريكية"؟',
                'correct_answer': 'محمد هنيدي',
                'wrong_answers': ['محمد سعد', 'أحمد حلمي', 'أحمد مكي'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'من بطل فيلم "الأيدي الناعمة"؟',
                'correct_answer': 'فؤاد المهندس',
                'wrong_answers': ['عبد المنعم مدبولي', 'سمير غانم', 'جورج سيدهم'],
                'category': 'سينما مصرية',
                'difficulty': 'medium'
            },
            
            # Series
            {
                'question': 'من بطل مسلسل "رأفت الهجان"؟',
                'correct_answer': 'محمود عبد العزيز',
                'wrong_answers': ['نور الشريف', 'يحيى الفخراني', 'أحمد زكي'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'من بطل مسلسل "ليالي الحلمية"؟',
                'correct_answer': 'يحيى الفخراني',
                'wrong_answers': ['نور الشريف', 'محمود عبد العزيز', 'عادل إمام'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'من بطل مسلسل "الكبير أوي"؟',
                'correct_answer': 'أحمد مكي',
                'wrong_answers': ['محمد رمضان', 'أحمد السقا', 'كريم عبد العزيز'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            {
                'question': 'من بطل مسلسل "الاختيار"؟',
                'correct_answer': 'أحمد عز',
                'wrong_answers': ['محمد رمضان', 'أحمد السقا', 'أمير كرارة'],
                'category': 'سينما مصرية',
                'difficulty': 'easy'
            },
            
            # Directors
            {
                'question': 'من مخرج فيلم "المومياء"؟',
                'correct_answer': 'شادي عبد السلام',
                'wrong_answers': ['يوسف شاهين', 'صلاح أبو سيف', 'حسن الإمام'],
                'category': 'سينما مصرية',
                'difficulty': 'hard'
            },
            {
                'question': 'من مخرج فيلم "الكرنك"؟',
                'correct_answer': 'علي بدرخان',
                'wrong_answers': ['يوسف شاهين', 'صلاح أبو سيف', 'عاطف الطيب'],
                'category': 'سينما مصرية',
                'difficulty': 'hard'
            },
            {
                'question': 'من مخرج فيلم "ساعة ونص"؟',
                'correct_answer': 'وائل إحسان',
                'wrong_answers': ['عمرو سلامة', 'مروان حامد', 'أحمد خالد موسى'],
                'category': 'سينما مصرية',
                'difficulty': 'medium'
            }
        ]
        
        questions = random.sample(static_questions, min(count, len(static_questions)))
        return questions
    
    def _fetch_general_knowledge(self, count: int) -> List[Dict]:
        """Fetch general knowledge questions from static database"""
        return TriviaCategories.get_general_knowledge(count)
    
    def _fetch_science(self, count: int) -> List[Dict]:
        """Fetch science questions from static database"""
        return TriviaCategories.get_science(count)
    
    def _fetch_history(self, count: int) -> List[Dict]:
        """Fetch history questions from static database"""
        return TriviaCategories.get_history(count)
    
    def _fetch_geography(self, count: int) -> List[Dict]:
        """Fetch geography questions from static database"""
        return TriviaCategories.get_geography(count)
    
    def _fetch_sports(self, count: int) -> List[Dict]:
        """Fetch sports questions from static database"""
        return TriviaCategories.get_sports(count)
    
    def _fetch_islamic_quiz(self, count: int) -> List[Dict]:
        """Fetch Islamic quiz questions from GitHub API"""
        questions = []
        
        try:
            # Fetch from Islamic Quiz API repository
            # Try multiple possible endpoints
            url = f"{self.islamic_quiz_url}/questions_ar.json"
            response = self._get(url)
            data = response.json()
            
            if isinstance(data, list):
                selected = random.sample(data, min(count, len(data)))
                
                for item in selected:
                    questions.append({
                        'question': item.get('question', ''),
                        'correct_answer': item.get('correct_answer', ''),
                        'wrong_answers': item.get('wrong_answers', []),
                        'category': 'إسلاميات',
                        'difficulty': item.get('difficulty', 'medium')
                    })
        except Exception as e:
            print(f"Error fetching Islamic quiz: {e}")
        
        return questions
    
    def _fetch_opentdb(self, count: int) -> List[Dict]:
        """Fetch general trivia from OpenTDB and translate to Arabic"""
        questions = []
        
        try:
            params = {
                'amount': count,
                'type': 'multiple'
            }
            
            response = self._get(self.opentdb_url, params=params)
            data = response.json()
            
            if data.get('response_code') == 0:
                for item in data.get('results', []):
                    # Translate question and answers
                    translated = self._translate_question(item)
                    if translated:
                        questions.append(translated)
                        
        except Exception as e:
            print(f"Error fetching OpenTDB: {e}")
        
        return questions
    
    def _translate_question(self, question_data: Dict) -> Optional[Dict]:
        """
        Translate a question from English to Arabic using AI.
        
        Args:
            question_data: Question dict from OpenTDB
            
        Returns:
            Translated question dict or None
        """
        if not self.ai_api_key:
            # Skip translation if no API key
            return None
        
        try:
            question = question_data.get('question', '')
            correct = question_data.get('correct_answer', '')
            incorrect = question_data.get('incorrect_answers', [])
            
            # Prepare translation prompt
            text_to_translate = f"""Question: {question}
Correct Answer: {correct}
Wrong Answers: {', '.join(incorrect)}"""
            
            # Call Groq API for translation
            headers = {
                'Authorization': f'Bearer {self.ai_api_key}',
                'Content-Type': 'application/json'
            }
            
            payload = {
                'model': 'mixtral-8x7b-32768',
                'messages': [
                    {
                        'role': 'system',
                        'content': 'You are a translator. Translate the following trivia question and answers from English to Arabic. Return only the translations in the same format.'
                    },
                    {
                        'role': 'user',
                        'content': text_to_translate
                    }
                ],
                'temperature': 0.3
            }
            
            response = self._post(self.groq_url, headers=headers, json=payload)
            result = response.json()
            
            translated_text = result.get('choices', [{}])[0].get('message', {}).get('content', '')
            
            # Parse translated text
            lines = translated_text.strip().split('\n')
            if len(lines) >= 3:
                translated_question = lines[0].replace('Question:', '').replace('السؤال:', '').strip()
                translated_correct = lines[1].replace('Correct Answer:', '').replace('الإجابة الصحيحة:', '').strip()
                translated_wrong = lines[2].replace('Wrong Answers:', '').replace('الإجابات الخاطئة:', '').strip()
                translated_wrong_list = [ans.strip() for ans in translated_wrong.split(',')]
                
                return {
                    'question': translated_question,
                    'correct_answer': translated_correct,
                    'wrong_answers': translated_wrong_list,
                    'category': 'ثقافة عامة',
                    'difficulty': question_data.get('difficulty', 'medium')
                }
                
        except Exception as e:
            print(f"Error translating question: {e}")
        
        return None
