"""
Static trivia questions organized by category.
All questions in Arabic covering diverse topics.
"""
import random
from typing import List, Dict


class TriviaCategories:
    """
    Static trivia questions across multiple categories.
    """
    
    @staticmethod
    def get_general_knowledge(count: int) -> List[Dict]:
        """General knowledge questions in Arabic"""
        questions = [
            {
                'question': 'ما هي عاصمة مصر؟',
                'correct_answer': 'القاهرة',
                'wrong_answers': ['الإسكندرية', 'الجيزة', 'أسوان'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد أيام السنة الميلادية؟',
                'correct_answer': '365',
                'wrong_answers': ['360', '366', '364'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هي أكبر قارة في العالم؟',
                'correct_answer': 'آسيا',
                'wrong_answers': ['أفريقيا', 'أوروبا', 'أمريكا الشمالية'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد ألوان قوس قزح؟',
                'correct_answer': '7',
                'wrong_answers': ['6', '8', '5'],
                'category': 'ثقافة عامة',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هي اللغة الأكثر انتشاراً في العالم؟',
                'correct_answer': 'الإنجليزية',
                'wrong_answers': ['الصينية', 'الإسبانية', 'العربية'],
                'category': 'ثقافة عامة',
                'difficulty': 'medium'
            },
            {
                'question': 'كم عدد دول العالم العربي؟',
                'correct_answer': '22',
                'wrong_answers': ['20', '25', '18'],
                'category': 'ثقافة عامة',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هو أطول نهر في العالم؟',
                'correct_answer': 'النيل',
                'wrong_answers': ['الأمازون', 'المسيسيبي', 'اليانغتسي'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد قارات العالم؟',
                'correct_answer': '7',
                'wrong_answers': ['6', '5', '8'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هي عملة المملكة العربية السعودية؟',
                'correct_answer': 'الريال',
                'wrong_answers': ['الدينار', 'الدرهم', 'الجنيه'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد أشهر السنة الهجرية؟',
                'correct_answer': '12',
                'wrong_answers': ['10', '11', '13'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هي أكبر دولة في العالم من حيث المساحة؟',
                'correct_answer': 'روسيا',
                'wrong_answers': ['كندا', 'الصين', 'الولايات المتحدة'],
                'category': 'ثقافة عامة',
                'difficulty': 'medium'
            },
            {
                'question': 'كم عدد لاعبي فريق كرة القدم؟',
                'correct_answer': '11',
                'wrong_answers': ['10', '12', '9'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هو أصغر محيط في العالم؟',
                'correct_answer': 'المحيط المتجمد الشمالي',
                'wrong_answers': ['المحيط الهندي', 'المحيط الأطلسي', 'المحيط الهادئ'],
                'category': 'ثقافة عامة',
                'difficulty': 'hard'
            },
            {
                'question': 'كم عدد أسنان الإنسان البالغ؟',
                'correct_answer': '32',
                'wrong_answers': ['28', '30', '34'],
                'category': 'ثقافة عامة',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هي عاصمة فرنسا؟',
                'correct_answer': 'باريس',
                'wrong_answers': ['لندن', 'روما', 'برلين'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد حروف اللغة العربية؟',
                'correct_answer': '28',
                'wrong_answers': ['26', '30', '27'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هي أكبر صحراء في العالم؟',
                'correct_answer': 'الصحراء الكبرى',
                'wrong_answers': ['صحراء الربع الخالي', 'صحراء جوبي', 'صحراء كالاهاري'],
                'category': 'ثقافة عامة',
                'difficulty': 'medium'
            },
            {
                'question': 'كم عدد أيام شهر رمضان؟',
                'correct_answer': '29 أو 30',
                'wrong_answers': ['30 فقط', '28', '31'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هي عاصمة الإمارات العربية المتحدة؟',
                'correct_answer': 'أبو ظبي',
                'wrong_answers': ['دبي', 'الشارقة', 'عجمان'],
                'category': 'ثقافة عامة',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد كواكب المجموعة الشمسية؟',
                'correct_answer': '8',
                'wrong_answers': ['9', '7', '10'],
                'category': 'ثقافة عامة',
                'difficulty': 'medium'
            }
        ]
        return random.sample(questions, min(count, len(questions)))
    
    @staticmethod
    def get_science(count: int) -> List[Dict]:
        """Science questions in Arabic"""
        questions = [
            {
                'question': 'ما هو الرمز الكيميائي للماء؟',
                'correct_answer': 'H2O',
                'wrong_answers': ['CO2', 'O2', 'H2'],
                'category': 'علوم',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد عظام جسم الإنسان البالغ؟',
                'correct_answer': '206',
                'wrong_answers': ['200', '210', '195'],
                'category': 'علوم',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هو أسرع حيوان على وجه الأرض؟',
                'correct_answer': 'الفهد',
                'wrong_answers': ['الأسد', 'الحصان', 'النمر'],
                'category': 'علوم',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هو الكوكب الأقرب إلى الشمس؟',
                'correct_answer': 'عطارد',
                'wrong_answers': ['الزهرة', 'المريخ', 'الأرض'],
                'category': 'علوم',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هو الغاز الذي نتنفسه؟',
                'correct_answer': 'الأكسجين',
                'wrong_answers': ['النيتروجين', 'ثاني أكسيد الكربون', 'الهيدروجين'],
                'category': 'علوم',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد قلوب الأخطبوط؟',
                'correct_answer': '3',
                'wrong_answers': ['2', '4', '1'],
                'category': 'علوم',
                'difficulty': 'hard'
            },
            {
                'question': 'ما هو أكبر كوكب في المجموعة الشمسية؟',
                'correct_answer': 'المشتري',
                'wrong_answers': ['زحل', 'الأرض', 'المريخ'],
                'category': 'علوم',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هي درجة غليان الماء؟',
                'correct_answer': '100 درجة مئوية',
                'wrong_answers': ['90 درجة', '110 درجة', '95 درجة'],
                'category': 'علوم',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هو أكبر عضو في جسم الإنسان؟',
                'correct_answer': 'الجلد',
                'wrong_answers': ['الكبد', 'القلب', 'الدماغ'],
                'category': 'علوم',
                'difficulty': 'medium'
            },
            {
                'question': 'كم عدد أرجل العنكبوت؟',
                'correct_answer': '8',
                'wrong_answers': ['6', '10', '12'],
                'category': 'علوم',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هو الرمز الكيميائي للذهب؟',
                'correct_answer': 'Au',
                'wrong_answers': ['Ag', 'Fe', 'Cu'],
                'category': 'علوم',
                'difficulty': 'hard'
            },
            {
                'question': 'ما هي سرعة الضوء تقريباً؟',
                'correct_answer': '300,000 كم/ث',
                'wrong_answers': ['150,000 كم/ث', '500,000 كم/ث', '200,000 كم/ث'],
                'category': 'علوم',
                'difficulty': 'hard'
            },
            {
                'question': 'كم عدد أجنحة النحلة؟',
                'correct_answer': '4',
                'wrong_answers': ['2', '6', '8'],
                'category': 'علوم',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هو أصغر كوكب في المجموعة الشمسية؟',
                'correct_answer': 'عطارد',
                'wrong_answers': ['المريخ', 'الزهرة', 'بلوتو'],
                'category': 'علوم',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هي وحدة قياس القوة؟',
                'correct_answer': 'نيوتن',
                'wrong_answers': ['جول', 'واط', 'أمبير'],
                'category': 'علوم',
                'difficulty': 'hard'
            },
            {
                'question': 'كم عدد أسنان القط؟',
                'correct_answer': '30',
                'wrong_answers': ['28', '32', '26'],
                'category': 'علوم',
                'difficulty': 'hard'
            },
            {
                'question': 'ما هو الحيوان الذي ينام واقفاً؟',
                'correct_answer': 'الحصان',
                'wrong_answers': ['الفيل', 'الزرافة', 'البقرة'],
                'category': 'علوم',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هي المادة الأكثر صلابة في جسم الإنسان؟',
                'correct_answer': 'مينا الأسنان',
                'wrong_answers': ['العظام', 'الأظافر', 'الجمجمة'],
                'category': 'علوم',
                'difficulty': 'medium'
            },
            {
                'question': 'كم عدد حجرات القلب؟',
                'correct_answer': '4',
                'wrong_answers': ['2', '3', '5'],
                'category': 'علوم',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هو الكوكب الأحمر؟',
                'correct_answer': 'المريخ',
                'wrong_answers': ['المشتري', 'زحل', 'عطارد'],
                'category': 'علوم',
                'difficulty': 'easy'
            }
        ]
        return random.sample(questions, min(count, len(questions)))
    
    @staticmethod
    def get_history(count: int) -> List[Dict]:
        """History questions in Arabic"""
        questions = [
            {
                'question': 'في أي عام تم فتح مكة؟',
                'correct_answer': '8 هجرية',
                'wrong_answers': ['7 هجرية', '9 هجرية', '10 هجرية'],
                'category': 'تاريخ',
                'difficulty': 'medium'
            },
            {
                'question': 'من هو أول خليفة في الإسلام؟',
                'correct_answer': 'أبو بكر الصديق',
                'wrong_answers': ['عمر بن الخطاب', 'عثمان بن عفان', 'علي بن أبي طالب'],
                'category': 'تاريخ',
                'difficulty': 'easy'
            },
            {
                'question': 'في أي عام تم بناء الأهرامات تقريباً؟',
                'correct_answer': '2560 قبل الميلاد',
                'wrong_answers': ['3000 قبل الميلاد', '2000 قبل الميلاد', '1500 قبل الميلاد'],
                'category': 'تاريخ',
                'difficulty': 'hard'
            },
            {
                'question': 'من هو قائد الفتح الإسلامي لمصر؟',
                'correct_answer': 'عمرو بن العاص',
                'wrong_answers': ['خالد بن الوليد', 'سعد بن أبي وقاص', 'أبو عبيدة بن الجراح'],
                'category': 'تاريخ',
                'difficulty': 'medium'
            },
            {
                'question': 'في أي عام قامت ثورة 23 يوليو في مصر؟',
                'correct_answer': '1952',
                'wrong_answers': ['1950', '1954', '1948'],
                'category': 'تاريخ',
                'difficulty': 'easy'
            },
            {
                'question': 'من هو أول رئيس لمصر؟',
                'correct_answer': 'محمد نجيب',
                'wrong_answers': ['جمال عبد الناصر', 'أنور السادات', 'حسني مبارك'],
                'category': 'تاريخ',
                'difficulty': 'medium'
            },
            {
                'question': 'في أي عام تم بناء قناة السويس؟',
                'correct_answer': '1869',
                'wrong_answers': ['1850', '1880', '1900'],
                'category': 'تاريخ',
                'difficulty': 'hard'
            },
            {
                'question': 'من هو صلاح الدين الأيوبي؟',
                'correct_answer': 'قائد مسلم حرر القدس',
                'wrong_answers': ['خليفة عباسي', 'سلطان عثماني', 'ملك مصري'],
                'category': 'تاريخ',
                'difficulty': 'easy'
            },
            {
                'question': 'في أي عام انتهت الحرب العالمية الثانية؟',
                'correct_answer': '1945',
                'wrong_answers': ['1944', '1946', '1943'],
                'category': 'تاريخ',
                'difficulty': 'medium'
            },
            {
                'question': 'من هو مؤسس الدولة العثمانية؟',
                'correct_answer': 'عثمان بن أرطغرل',
                'wrong_answers': ['محمد الفاتح', 'سليمان القانوني', 'مراد الأول'],
                'category': 'تاريخ',
                'difficulty': 'medium'
            },
            {
                'question': 'في أي عام تم فتح القسطنطينية؟',
                'correct_answer': '1453',
                'wrong_answers': ['1400', '1500', '1350'],
                'category': 'تاريخ',
                'difficulty': 'hard'
            },
            {
                'question': 'من هو أول من اخترع الطباعة؟',
                'correct_answer': 'يوهان غوتنبرغ',
                'wrong_answers': ['توماس إديسون', 'ألكسندر بيل', 'بنجامين فرانكلين'],
                'category': 'تاريخ',
                'difficulty': 'medium'
            },
            {
                'question': 'في أي عام تم اكتشاف أمريكا؟',
                'correct_answer': '1492',
                'wrong_answers': ['1500', '1480', '1510'],
                'category': 'تاريخ',
                'difficulty': 'medium'
            },
            {
                'question': 'من هو نابليون بونابرت؟',
                'correct_answer': 'إمبراطور فرنسي',
                'wrong_answers': ['ملك إنجليزي', 'قيصر روسي', 'سلطان عثماني'],
                'category': 'تاريخ',
                'difficulty': 'easy'
            },
            {
                'question': 'في أي عام سقطت الأندلس؟',
                'correct_answer': '1492',
                'wrong_answers': ['1400', '1500', '1450'],
                'category': 'تاريخ',
                'difficulty': 'hard'
            },
            {
                'question': 'من هو أول من طاف حول الأرض؟',
                'correct_answer': 'فرديناند ماجلان',
                'wrong_answers': ['كريستوفر كولومبوس', 'فاسكو دا غاما', 'ماركو بولو'],
                'category': 'تاريخ',
                'difficulty': 'hard'
            },
            {
                'question': 'في أي عام بدأت الحرب العالمية الأولى؟',
                'correct_answer': '1914',
                'wrong_answers': ['1910', '1918', '1920'],
                'category': 'تاريخ',
                'difficulty': 'medium'
            },
            {
                'question': 'من هو أول رائد فضاء؟',
                'correct_answer': 'يوري غاغارين',
                'wrong_answers': ['نيل أرمسترونغ', 'بز ألدرين', 'جون غلين'],
                'category': 'تاريخ',
                'difficulty': 'medium'
            },
            {
                'question': 'في أي عام تم هدم جدار برلين؟',
                'correct_answer': '1989',
                'wrong_answers': ['1985', '1990', '1987'],
                'category': 'تاريخ',
                'difficulty': 'medium'
            },
            {
                'question': 'من هو كليوباترا؟',
                'correct_answer': 'ملكة مصرية',
                'wrong_answers': ['ملكة رومانية', 'ملكة يونانية', 'ملكة فارسية'],
                'category': 'تاريخ',
                'difficulty': 'easy'
            }
        ]
        return random.sample(questions, min(count, len(questions)))
    
    @staticmethod
    def get_geography(count: int) -> List[Dict]:
        """Geography questions in Arabic"""
        questions = [
            {
                'question': 'ما هي عاصمة اليابان؟',
                'correct_answer': 'طوكيو',
                'wrong_answers': ['كيوتو', 'أوساكا', 'هيروشيما'],
                'category': 'جغرافيا',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هو أعلى جبل في العالم؟',
                'correct_answer': 'إيفرست',
                'wrong_answers': ['كليمنجارو', 'الألب', 'الأنديز'],
                'category': 'جغرافيا',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد محيطات العالم؟',
                'correct_answer': '5',
                'wrong_answers': ['4', '6', '7'],
                'category': 'جغرافيا',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هي أكبر دولة في أفريقيا من حيث المساحة؟',
                'correct_answer': 'الجزائر',
                'wrong_answers': ['السودان', 'ليبيا', 'مصر'],
                'category': 'جغرافيا',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هي عاصمة تركيا؟',
                'correct_answer': 'أنقرة',
                'wrong_answers': ['إسطنبول', 'إزمير', 'بورصة'],
                'category': 'جغرافيا',
                'difficulty': 'medium'
            },
            {
                'question': 'في أي قارة تقع مصر؟',
                'correct_answer': 'أفريقيا',
                'wrong_answers': ['آسيا', 'أوروبا', 'أفريقيا وآسيا'],
                'category': 'جغرافيا',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هي أصغر دولة في العالم؟',
                'correct_answer': 'الفاتيكان',
                'wrong_answers': ['موناكو', 'سان مارينو', 'ليختنشتاين'],
                'category': 'جغرافيا',
                'difficulty': 'hard'
            },
            {
                'question': 'ما هو أطول نهر في أوروبا؟',
                'correct_answer': 'الفولغا',
                'wrong_answers': ['الدانوب', 'الراين', 'التايمز'],
                'category': 'جغرافيا',
                'difficulty': 'hard'
            },
            {
                'question': 'ما هي عاصمة أستراليا؟',
                'correct_answer': 'كانبرا',
                'wrong_answers': ['سيدني', 'ملبورن', 'بريسبان'],
                'category': 'جغرافيا',
                'difficulty': 'hard'
            },
            {
                'question': 'كم عدد الدول التي تحد مصر؟',
                'correct_answer': '4',
                'wrong_answers': ['3', '5', '6'],
                'category': 'جغرافيا',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هي أكبر جزيرة في العالم؟',
                'correct_answer': 'جرينلاند',
                'wrong_answers': ['مدغشقر', 'بورنيو', 'نيوزيلندا'],
                'category': 'جغرافيا',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هي عاصمة البرازيل؟',
                'correct_answer': 'برازيليا',
                'wrong_answers': ['ريو دي جانيرو', 'ساو باولو', 'سلفادور'],
                'category': 'جغرافيا',
                'difficulty': 'hard'
            },
            {
                'question': 'في أي قارة تقع الأرجنتين؟',
                'correct_answer': 'أمريكا الجنوبية',
                'wrong_answers': ['أمريكا الشمالية', 'أوروبا', 'أفريقيا'],
                'category': 'جغرافيا',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هو أعمق محيط في العالم؟',
                'correct_answer': 'المحيط الهادئ',
                'wrong_answers': ['المحيط الأطلسي', 'المحيط الهندي', 'المحيط المتجمد الجنوبي'],
                'category': 'جغرافيا',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هي عاصمة كندا؟',
                'correct_answer': 'أوتاوا',
                'wrong_answers': ['تورونتو', 'مونتريال', 'فانكوفر'],
                'category': 'جغرافيا',
                'difficulty': 'hard'
            },
            {
                'question': 'كم عدد الدول في قارة أفريقيا؟',
                'correct_answer': '54',
                'wrong_answers': ['50', '60', '48'],
                'category': 'جغرافيا',
                'difficulty': 'hard'
            },
            {
                'question': 'ما هي عاصمة المغرب؟',
                'correct_answer': 'الرباط',
                'wrong_answers': ['الدار البيضاء', 'مراكش', 'فاس'],
                'category': 'جغرافيا',
                'difficulty': 'medium'
            },
            {
                'question': 'ما هو أكبر بحر مغلق في العالم؟',
                'correct_answer': 'بحر قزوين',
                'wrong_answers': ['البحر الميت', 'بحر آرال', 'البحر الأحمر'],
                'category': 'جغرافيا',
                'difficulty': 'hard'
            },
            {
                'question': 'في أي دولة يقع برج إيفل؟',
                'correct_answer': 'فرنسا',
                'wrong_answers': ['إيطاليا', 'إسبانيا', 'ألمانيا'],
                'category': 'جغرافيا',
                'difficulty': 'easy'
            },
            {
                'question': 'ما هي عاصمة الهند؟',
                'correct_answer': 'نيودلهي',
                'wrong_answers': ['مومباي', 'كلكتا', 'بنغالور'],
                'category': 'جغرافيا',
                'difficulty': 'medium'
            }
        ]
        return random.sample(questions, min(count, len(questions)))
    
    @staticmethod
    def get_sports(count: int) -> List[Dict]:
        """Sports questions in Arabic"""
        questions = [
            {
                'question': 'كم عدد لاعبي فريق كرة السلة؟',
                'correct_answer': '5',
                'wrong_answers': ['6', '7', '4'],
                'category': 'رياضة',
                'difficulty': 'easy'
            },
            {
                'question': 'في أي دولة أقيمت كأس العالم 2022؟',
                'correct_answer': 'قطر',
                'wrong_answers': ['الإمارات', 'السعودية', 'البحرين'],
                'category': 'رياضة',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد الأشواط في مباراة كرة القدم؟',
                'correct_answer': '2',
                'wrong_answers': ['3', '4', '1'],
                'category': 'رياضة',
                'difficulty': 'easy'
            },
            {
                'question': 'من هو أفضل لاعب كرة قدم في التاريخ حسب الكثيرين؟',
                'correct_answer': 'بيليه أو مارادونا',
                'wrong_answers': ['رونالدو', 'ميسي', 'زيدان'],
                'category': 'رياضة',
                'difficulty': 'medium'
            },
            {
                'question': 'كم مدة مباراة كرة القدم؟',
                'correct_answer': '90 دقيقة',
                'wrong_answers': ['80 دقيقة', '100 دقيقة', '120 دقيقة'],
                'category': 'رياضة',
                'difficulty': 'easy'
            },
            {
                'question': 'في أي رياضة يستخدم المضرب؟',
                'correct_answer': 'التنس',
                'wrong_answers': ['كرة القدم', 'السباحة', 'الجري'],
                'category': 'رياضة',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد الحلقات في شعار الأولمبياد؟',
                'correct_answer': '5',
                'wrong_answers': ['4', '6', '7'],
                'category': 'رياضة',
                'difficulty': 'medium'
            },
            {
                'question': 'من هو أسرع رجل في العالم؟',
                'correct_answer': 'يوسين بولت',
                'wrong_answers': ['كارل لويس', 'مو فرح', 'مايكل جونسون'],
                'category': 'رياضة',
                'difficulty': 'medium'
            },
            {
                'question': 'كم عدد لاعبي فريق الكريكيت؟',
                'correct_answer': '11',
                'wrong_answers': ['9', '10', '12'],
                'category': 'رياضة',
                'difficulty': 'medium'
            },
            {
                'question': 'في أي رياضة يستخدم القوس والسهم؟',
                'correct_answer': 'الرماية',
                'wrong_answers': ['الفروسية', 'المبارزة', 'الرجبي'],
                'category': 'رياضة',
                'difficulty': 'easy'
            },
            {
                'question': 'من فاز بكأس العالم 2018؟',
                'correct_answer': 'فرنسا',
                'wrong_answers': ['كرواتيا', 'ألمانيا', 'البرازيل'],
                'category': 'رياضة',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد الأشواط في مباراة كرة السلة؟',
                'correct_answer': '4',
                'wrong_answers': ['2', '3', '5'],
                'category': 'رياضة',
                'difficulty': 'medium'
            },
            {
                'question': 'من هو الملاكم الأسطوري الملقب بـ "الأعظم"؟',
                'correct_answer': 'محمد علي كلاي',
                'wrong_answers': ['مايك تايسون', 'فلويد مايويذر', 'جو فريزر'],
                'category': 'رياضة',
                'difficulty': 'medium'
            },
            {
                'question': 'في أي رياضة تستخدم الشبكة والكرة الطائرة؟',
                'correct_answer': 'الكرة الطائرة',
                'wrong_answers': ['التنس', 'كرة القدم', 'كرة اليد'],
                'category': 'رياضة',
                'difficulty': 'easy'
            },
            {
                'question': 'كم عدد البطولات الكبرى في التنس؟',
                'correct_answer': '4',
                'wrong_answers': ['3', '5', '6'],
                'category': 'رياضة',
                'difficulty': 'hard'
            },
            {
                'question': 'من هو أكثر لاعب تتويجاً بالكرة الذهبية؟',
                'correct_answer': 'ليونيل ميسي',
                'wrong_answers': ['كريستيانو رونالدو', 'ميشيل بلاتيني', 'يوهان كرويف'],
                'category': 'رياضة',
                'difficulty': 'medium'
            },
            {
                'question': 'في أي دولة نشأت رياضة الجودو؟',
                'correct_answer': 'اليابان',
                'wrong_answers': ['الصين', 'كوريا', 'تايلاند'],
                'category': 'رياضة',
                'difficulty': 'medium'
            },
            {
                'question': 'كم عدد لاعبي فريق الرجبي؟',
                'correct_answer': '15',
                'wrong_answers': ['11', '13', '17'],
                'category': 'رياضة',
                'difficulty': 'hard'
            },
            {
                'question': 'من فاز بكأس العالم 2014؟',
                'correct_answer': 'ألمانيا',
                'wrong_answers': ['الأرجنتين', 'البرازيل', 'هولندا'],
                'category': 'رياضة',
                'difficulty': 'easy'
            },
            {
                'question': 'في أي رياضة يستخدم الحلبة المربعة؟',
                'correct_answer': 'الملاكمة',
                'wrong_answers': ['المصارعة', 'الكاراتيه', 'الجودو'],
                'category': 'رياضة',
                'difficulty': 'easy'
            }
        ]
        return random.sample(questions, min(count, len(questions)))
