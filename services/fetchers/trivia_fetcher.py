"""
Trivia questions fetcher with AI translation support.
Sources: Egyptian cinema quiz, OpenTDB, Islamic Quiz API
"""
from typing import List, Dict, Optional
import requests
import random
from .base_fetcher import BaseFetcher


class TriviaFetcher(BaseFetcher):
    """
    Fetches trivia questions from multiple sources with Arabic translation.
    """
    
    def __init__(self, ai_api_key: Optional[str] = None):
        super().__init__(rate_limit_delay=1.0)
        self.ai_api_key = ai_api_key
        
        # API endpoints
        self.opentdb_url = "https://opentdb.com/api.php"
        self.islamic_quiz_url = "https://raw.githubusercontent.com/rn0x/IslamicQuizAPI/main/data"
        self.groq_url = "https://api.groq.com/openai/v1/chat/completions"
    
    def get_source_name(self) -> str:
        return "OpenTDB + Islamic Quiz + Egyptian Cinema"
    
    def fetch_batch(self, count: int = 30) -> List[Dict]:
        """
        Fetch a batch of trivia questions from multiple sources.
        
        Returns:
            List of dicts with: question, correct_answer, wrong_answers, category, difficulty
        """
        items = []
        
        try:
            # Distribute across sources
            egyptian_count = count // 3
            islamic_count = count // 3
            general_count = count - egyptian_count - islamic_count
            
            # Fetch from Egyptian cinema
            egyptian_items = self._fetch_egyptian_cinema(egyptian_count)
            items.extend(egyptian_items)
            
            # Fetch from Islamic Quiz API
            islamic_items = self._fetch_islamic_quiz(islamic_count)
            items.extend(islamic_items)
            
            # Fetch from OpenTDB with translation
            general_items = self._fetch_opentdb(general_count)
            items.extend(general_items)
            
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
        
        # Static Egyptian cinema questions (to be replaced with actual scraping)
        static_questions = [
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
                'question': 'ما اسم الشخصية التي لعبها عادل إمام في فيلم "الإرهاب والكباب"؟',
                'correct_answer': 'أحمد',
                'wrong_answers': ['محمود', 'حسن', 'علي'],
                'category': 'سينما مصرية',
                'difficulty': 'medium'
            }
        ]
        
        questions = random.sample(static_questions, min(count, len(static_questions)))
        return questions
    
    def _fetch_islamic_quiz(self, count: int) -> List[Dict]:
        """Fetch Islamic quiz questions from GitHub API"""
        questions = []
        
        try:
            # Fetch from Islamic Quiz API repository
            url = f"{self.islamic_quiz_url}/ar/questions.json"
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
