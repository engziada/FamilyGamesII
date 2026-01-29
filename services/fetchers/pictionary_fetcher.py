"""
Pictionary data fetcher for Arabic vocabulary (excluding movies/series/plays).
Sources: Arabic vocabulary databases and educational resources.
"""
from typing import List, Dict
import random
from .base_fetcher import BaseFetcher


class PictionaryFetcher(BaseFetcher):
    """
    Fetches Arabic vocabulary items for Pictionary game.
    Categories: animals, objects, professions, places, food, etc.
    """
    
    def __init__(self):
        super().__init__(rate_limit_delay=1.0)
        
        # Fallback static vocabulary by category (will be replaced by API calls)
        self.static_vocabulary = {
            'حيوانات': [
                'أسد', 'فيل', 'زرافة', 'قرد', 'حصان', 'جمل', 'نمر', 'دب', 'ثعلب', 'أرنب',
                'قط', 'كلب', 'بقرة', 'خروف', 'ماعز', 'دجاجة', 'بطة', 'حمامة', 'نسر', 'صقر',
                'تمساح', 'ثعبان', 'سلحفاة', 'ضفدع', 'سمكة', 'حوت', 'دولفين', 'قرش', 'أخطبوط', 'نحلة',
                'فراشة', 'نملة', 'عنكبوت', 'ذبابة', 'بعوضة', 'جرادة', 'خنفساء', 'دودة', 'عقرب', 'فأر'
            ],
            'أشياء': [
                'كرسي', 'طاولة', 'سرير', 'باب', 'نافذة', 'مصباح', 'ساعة', 'مفتاح', 'كتاب', 'قلم',
                'كوب', 'صحن', 'ملعقة', 'سكين', 'شوكة', 'هاتف', 'تلفاز', 'حاسوب', 'كاميرا', 'نظارة',
                'مروحة', 'ثلاجة', 'فرن', 'غسالة', 'مكواة', 'مكنسة', 'مقص', 'إبرة', 'خيط', 'زر',
                'مرآة', 'فرشاة', 'مشط', 'منشفة', 'صابون', 'شامبو', 'معجون', 'فرشاة أسنان', 'منديل', 'سلة'
            ],
            'مهن': [
                'طبيب', 'مهندس', 'معلم', 'محامي', 'طباخ', 'نجار', 'حداد', 'كهربائي', 'سباك', 'رسام',
                'مصور', 'صحفي', 'طيار', 'سائق', 'بائع', 'مزارع', 'صياد', 'خياط', 'حلاق', 'عامل',
                'ممرض', 'صيدلي', 'مهندس معماري', 'محاسب', 'مبرمج', 'مصمم', 'موسيقار', 'ممثل', 'مخرج', 'كاتب',
                'شاعر', 'نحات', 'خزاف', 'بناء', 'دهان', 'ميكانيكي', 'عطار', 'جزار', 'خباز', 'حارس'
            ],
            'أماكن': [
                'مدرسة', 'مستشفى', 'مطار', 'محطة', 'مسجد', 'كنيسة', 'متحف', 'مكتبة', 'حديقة', 'شاطئ',
                'جبل', 'نهر', 'بحر', 'صحراء', 'غابة', 'سوق', 'مطعم', 'فندق', 'بنك', 'مصنع',
                'مزرعة', 'حقل', 'بستان', 'ملعب', 'مسرح', 'سينما', 'حديقة حيوان', 'حوض سمك', 'ميناء', 'قلعة',
                'قصر', 'كوخ', 'خيمة', 'كهف', 'جسر', 'نفق', 'برج', 'سد', 'بئر', 'ينبوع'
            ],
            'طعام': [
                'خبز', 'أرز', 'معكرونة', 'لحم', 'دجاج', 'سمك', 'بيض', 'جبن', 'زبدة', 'حليب',
                'تفاح', 'موز', 'برتقال', 'عنب', 'بطيخ', 'طماطم', 'خيار', 'بطاطس', 'جزر', 'بصل',
                'فراولة', 'مانجو', 'أناناس', 'كمثرى', 'خوخ', 'مشمش', 'تين', 'رمان', 'تمر', 'جوز',
                'لوز', 'فستق', 'كاجو', 'عسل', 'سكر', 'ملح', 'فلفل', 'كمون', 'قرفة', 'زعتر'
            ],
            'رياضة': [
                'كرة قدم', 'كرة سلة', 'كرة طائرة', 'تنس', 'سباحة', 'جري', 'قفز', 'ملاكمة', 'مصارعة', 'جمباز',
                'كاراتيه', 'جودو', 'رماية', 'سهام', 'بلياردو', 'شطرنج', 'طاولة', 'دراجة', 'تزلج', 'غوص',
                'كرة يد', 'هوكي', 'رجبي', 'كريكيت', 'جولف', 'بولينج', 'تسلق', 'يوجا', 'رقص', 'باليه',
                'كونغ فو', 'تايكوندو', 'مبارزة', 'رفع أثقال', 'ركوب خيل', 'سباق', 'قفز بالزانة', 'رمي جلة', 'رمي رمح', 'مشي'
            ],
            'طبيعة': [
                'شمس', 'قمر', 'نجم', 'سحاب', 'مطر', 'برق', 'رعد', 'ريح', 'ثلج', 'قوس قزح',
                'شجرة', 'زهرة', 'عشب', 'ورقة', 'جذر', 'فرع', 'بذرة', 'ثمرة', 'حجر', 'تراب',
                'جبل', 'تل', 'وادي', 'كهف', 'بركان', 'زلزال', 'إعصار', 'عاصفة', 'فيضان', 'جفاف',
                'شلال', 'بحيرة', 'بركة', 'مستنقع', 'جزيرة', 'شبه جزيرة', 'خليج', 'رمل', 'طين', 'صخر'
            ],
            'مواصلات': [
                'سيارة', 'حافلة', 'قطار', 'طائرة', 'سفينة', 'قارب', 'دراجة', 'دراجة نارية', 'شاحنة', 'سيارة إسعاف',
                'سيارة شرطة', 'سيارة إطفاء', 'تاكسي', 'مترو', 'ترام', 'عربة', 'حنطور', 'بالون', 'صاروخ', 'غواصة',
                'طائرة هليكوبتر', 'طائرة شراعية', 'زورق', 'يخت', 'عبارة', 'قارب شراعي', 'قارب تجديف', 'جت سكي', 'عربة نقل', 'جرار'
            ],
            'ألوان': [
                'أحمر', 'أزرق', 'أخضر', 'أصفر', 'برتقالي', 'بنفسجي', 'وردي', 'بني', 'أسود', 'أبيض',
                'رمادي', 'ذهبي', 'فضي', 'بيج', 'كريمي', 'زيتي', 'سماوي', 'فيروزي', 'كحلي', 'عنابي'
            ],
            'مشاعر': [
                'فرح', 'حزن', 'غضب', 'خوف', 'حب', 'كره', 'سعادة', 'حماس', 'ملل', 'قلق',
                'راحة', 'ألم', 'فخر', 'خجل', 'ندم', 'أمل', 'يأس', 'شوق', 'غيرة', 'رضا'
            ],
            'أجزاء الجسم': [
                'رأس', 'عين', 'أنف', 'فم', 'أذن', 'شعر', 'وجه', 'رقبة', 'كتف', 'ذراع',
                'يد', 'إصبع', 'ظهر', 'صدر', 'بطن', 'ساق', 'قدم', 'ركبة', 'كوع', 'قلب'
            ],
            'ملابس': [
                'قميص', 'بنطلون', 'فستان', 'تنورة', 'جاكيت', 'معطف', 'عباءة', 'جلباب', 'حذاء', 'جورب',
                'قبعة', 'طاقية', 'عمامة', 'حجاب', 'نقاب', 'قفاز', 'حزام', 'ربطة عنق', 'وشاح', 'بيجامة'
            ],
            'أدوات': [
                'مطرقة', 'منشار', 'مفك', 'كماشة', 'مسمار', 'برغي', 'مسطرة', 'قلم رصاص', 'ممحاة', 'شريط قياس',
                'فأس', 'معول', 'مجرفة', 'شوكة حديقة', 'خرطوم', 'سلم', 'حبل', 'سلسلة', 'قفل', 'مفتاح'
            ]
        }
    
    def get_source_name(self) -> str:
        return "Arabic Vocabulary Database"
    
    def fetch_batch(self, count: int = 30) -> List[Dict]:
        """
        Fetch a batch of Arabic vocabulary items for Pictionary.
        
        Returns:
            List of dicts with: item, category
        """
        items = []
        
        try:
            # Try to fetch from online sources first
            online_items = self._fetch_from_online_sources(count)
            if online_items:
                items.extend(online_items)
            
            # If not enough items, use static vocabulary
            if len(items) < count:
                static_items = self._fetch_from_static(count - len(items))
                items.extend(static_items)
                
        except Exception as e:
            print(f"Error fetching pictionary data: {e}")
            # Fallback to static
            items = self._fetch_from_static(count)
        
        return items[:count]
    
    def _fetch_from_online_sources(self, count: int) -> List[Dict]:
        """
        Fetch from online Arabic vocabulary APIs.
        TODO: Implement actual API calls to Arabic learning platforms
        """
        items = []
        
        # Placeholder for future API integration
        # Could integrate with:
        # - Arabic learning websites
        # - Educational APIs
        # - Open Arabic dictionaries
        
        return items
    
    def _fetch_from_static(self, count: int) -> List[Dict]:
        """
        Fetch from static vocabulary database.
        
        Returns:
            List of vocabulary items with categories
        """
        items = []
        categories = list(self.static_vocabulary.keys())
        
        # Distribute items across categories
        items_per_category = max(1, count // len(categories))
        
        for category in categories:
            words = self.static_vocabulary[category]
            selected = random.sample(words, min(items_per_category, len(words)))
            
            for word in selected:
                items.append({
                    'item': word,
                    'category': category
                })
            
            if len(items) >= count:
                break
        
        random.shuffle(items)
        return items[:count]
    
    def add_custom_vocabulary(self, category: str, words: List[str]):
        """
        Add custom vocabulary to a category.
        
        Args:
            category: Category name in Arabic
            words: List of words to add
        """
        if category not in self.static_vocabulary:
            self.static_vocabulary[category] = []
        
        self.static_vocabulary[category].extend(words)
