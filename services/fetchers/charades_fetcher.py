"""
Charades data fetcher for Egyptian movies, series, and plays.
Sources: elcinema.com + Arabic Wikipedia
"""
from typing import List, Dict
from bs4 import BeautifulSoup
import requests
from .base_fetcher import BaseFetcher


class CharadesFetcher(BaseFetcher):
    """
    Fetches Egyptian movies, series, and plays with production date and starring info.
    """
    
    def __init__(self):
        super().__init__(rate_limit_delay=2.0)  # 2 seconds between requests
        self.elcinema_base = "https://elcinema.com"
        
        # Static fallback data (used when web scraping fails)
        self.static_movies = [
            {'item': 'الناصر صلاح الدين', 'category': 'أفلام', 'year': '1963', 'starring': 'أحمد مظهر، صلاح ذو الفقار', 'type': 'فيلم'},
            {'item': 'الأرض', 'category': 'أفلام', 'year': '1969', 'starring': 'محمود المليجي، عزت العلايلي', 'type': 'فيلم'},
            {'item': 'باب الحديد', 'category': 'أفلام', 'year': '1958', 'starring': 'يوسف شاهين، هند رستم', 'type': 'فيلم'},
            {'item': 'دعاء الكروان', 'category': 'أفلام', 'year': '1959', 'starring': 'فاتن حمامة، أحمد مظهر', 'type': 'فيلم'},
            {'item': 'الإرهاب والكباب', 'category': 'أفلام', 'year': '1992', 'starring': 'عادل إمام، كمال الشناوي', 'type': 'فيلم'},
            {'item': 'إسماعيلية رايح جاي', 'category': 'أفلام', 'year': '1997', 'starring': 'محمد هنيدي، علاء ولي الدين', 'type': 'فيلم'},
            {'item': 'الكيت كات', 'category': 'أفلام', 'year': '1991', 'starring': 'محمود عبد العزيز، شريف منير', 'type': 'فيلم'},
            {'item': 'المصير', 'category': 'أفلام', 'year': '1997', 'starring': 'نور الشريف، ليلى علوي', 'type': 'فيلم'},
            {'item': 'عمارة يعقوبيان', 'category': 'أفلام', 'year': '2006', 'starring': 'عادل إمام، نور الشريف', 'type': 'فيلم'},
            {'item': 'هي فوضى', 'category': 'أفلام', 'year': '2007', 'starring': 'خالد صالح، يسرا اللوزي', 'type': 'فيلم'},
        ]
        
        self.static_series = [
            {'item': 'رأفت الهجان', 'category': 'مسلسلات', 'year': '1987', 'starring': 'محمود عبد العزيز', 'type': 'مسلسل'},
            {'item': 'ليالي الحلمية', 'category': 'مسلسلات', 'year': '1987', 'starring': 'يحيى الفخراني، صفية العمري', 'type': 'مسلسل'},
            {'item': 'زيزينيا', 'category': 'مسلسلات', 'year': '1997', 'starring': 'سمير غانم، دلال عبد العزيز', 'type': 'مسلسل'},
            {'item': 'الحاج متولي', 'category': 'مسلسلات', 'year': '1994', 'starring': 'نور الشريف', 'type': 'مسلسل'},
            {'item': 'الشهد والدموع', 'category': 'مسلسلات', 'year': '2006', 'starring': 'نور الشريف، بوسي', 'type': 'مسلسل'},
            {'item': 'الجماعة', 'category': 'مسلسلات', 'year': '2010', 'starring': 'عمرو واكد، هند صبري', 'type': 'مسلسل'},
            {'item': 'الكبير أوي', 'category': 'مسلسلات', 'year': '2010', 'starring': 'أحمد مكي، محمد سعد', 'type': 'مسلسل'},
            {'item': 'لن أعيش في جلباب أبي', 'category': 'مسلسلات', 'year': '1996', 'starring': 'يحيى الفخراني', 'type': 'مسلسل'},
        ]
        
        self.static_plays = [
            {'item': 'مدرسة المشاغبين', 'category': 'مسرحيات', 'year': '1973', 'starring': 'عادل إمام، سعيد صالح', 'type': 'مسرحية'},
            {'item': 'الواد سيد الشغال', 'category': 'مسرحيات', 'year': '1985', 'starring': 'عادل إمام', 'type': 'مسرحية'},
            {'item': 'شاهد ماشفش حاجة', 'category': 'مسرحيات', 'year': '1976', 'starring': 'عادل إمام، عمر الحريري', 'type': 'مسرحية'},
            {'item': 'المتزوجون', 'category': 'مسرحيات', 'year': '1970', 'starring': 'سمير غانم، الضيف أحمد', 'type': 'مسرحية'},
            {'item': 'العيال كبرت', 'category': 'مسرحيات', 'year': '1979', 'starring': 'سمير غانم، جورج سيدهم', 'type': 'مسرحية'},
        ]
    
    def get_source_name(self) -> str:
        return "elcinema.com + Wikipedia"
    
    def fetch_batch(self, count: int = 30) -> List[Dict]:
        """
        Fetch a batch of Egyptian movies/series/plays.
        Falls back to static data if web scraping fails.
        
        Returns:
            List of dicts with: item, category, year, starring, type
        """
        items = []
        
        try:
            # Try to fetch from web
            movies = self._fetch_movies(count // 3)
            items.extend(movies)
            
            series = self._fetch_series(count // 3)
            items.extend(series)
            
            plays = self._fetch_plays(count // 3)
            items.extend(plays)
            
        except Exception as e:
            print(f"Error fetching charades data from web: {e}")
        
        # If web scraping failed or didn't get enough items, use static data
        if len(items) < count:
            print("Using static fallback data for Charades")
            static_items = self._fetch_from_static(count - len(items))
            items.extend(static_items)
        
        return items[:count]
    
    def _fetch_movies(self, count: int) -> List[Dict]:
        """Fetch Egyptian movies from elcinema.com"""
        movies = []
        
        try:
            # elcinema.com Egyptian movies section
            url = f"{self.elcinema_base}/en/movies/egyptian/"
            response = self._get(url)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Parse movie listings
            movie_items = soup.find_all('div', class_='movie-item', limit=count)
            
            for item in movie_items:
                try:
                    title_elem = item.find('h3') or item.find('a', class_='title')
                    if not title_elem:
                        continue
                    
                    title = title_elem.get_text(strip=True)
                    
                    # Get year
                    year_elem = item.find('span', class_='year')
                    year = year_elem.get_text(strip=True) if year_elem else None
                    
                    # Get starring info
                    cast_elem = item.find('div', class_='cast') or item.find('span', class_='starring')
                    starring = cast_elem.get_text(strip=True) if cast_elem else None
                    
                    movies.append({
                        'item': title,
                        'category': 'أفلام',
                        'year': year,
                        'starring': starring,
                        'type': 'فيلم'
                    })
                    
                except Exception as e:
                    print(f"Error parsing movie item: {e}")
                    continue
                    
        except Exception as e:
            print(f"Error fetching movies: {e}")
        
        return movies
    
    def _fetch_series(self, count: int) -> List[Dict]:
        """Fetch Egyptian series from elcinema.com"""
        series = []
        
        try:
            url = f"{self.elcinema_base}/en/series/egyptian/"
            response = self._get(url)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            series_items = soup.find_all('div', class_='series-item', limit=count)
            
            for item in series_items:
                try:
                    title_elem = item.find('h3') or item.find('a', class_='title')
                    if not title_elem:
                        continue
                    
                    title = title_elem.get_text(strip=True)
                    
                    year_elem = item.find('span', class_='year')
                    year = year_elem.get_text(strip=True) if year_elem else None
                    
                    cast_elem = item.find('div', class_='cast') or item.find('span', class_='starring')
                    starring = cast_elem.get_text(strip=True) if cast_elem else None
                    
                    series.append({
                        'item': title,
                        'category': 'مسلسلات',
                        'year': year,
                        'starring': starring,
                        'type': 'مسلسل'
                    })
                    
                except Exception as e:
                    print(f"Error parsing series item: {e}")
                    continue
                    
        except Exception as e:
            print(f"Error fetching series: {e}")
        
        return series
    
    def _fetch_plays(self, count: int) -> List[Dict]:
        """Fetch Egyptian plays from elcinema.com"""
        plays = []
        
        try:
            url = f"{self.elcinema_base}/en/plays/egyptian/"
            response = self._get(url)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            play_items = soup.find_all('div', class_='play-item', limit=count)
            
            for item in play_items:
                try:
                    title_elem = item.find('h3') or item.find('a', class_='title')
                    if not title_elem:
                        continue
                    
                    title = title_elem.get_text(strip=True)
                    
                    year_elem = item.find('span', class_='year')
                    year = year_elem.get_text(strip=True) if year_elem else None
                    
                    cast_elem = item.find('div', class_='cast') or item.find('span', class_='starring')
                    starring = cast_elem.get_text(strip=True) if cast_elem else None
                    
                    plays.append({
                        'item': title,
                        'category': 'مسرحيات',
                        'year': year,
                        'starring': starring,
                        'type': 'مسرحية'
                    })
                    
                except Exception as e:
                    print(f"Error parsing play item: {e}")
                    continue
                    
        except Exception as e:
            print(f"Error fetching plays: {e}")
        
        return plays
    
    def fetch_from_wikipedia(self, title: str) -> Dict:
        """
        Fetch additional info from Arabic Wikipedia for a specific title.
        
        Args:
            title: Movie/series/play title
            
        Returns:
            Dict with additional metadata
        """
        try:
            # Wikipedia API endpoint
            url = "https://ar.wikipedia.org/w/api.php"
            params = {
                'action': 'query',
                'format': 'json',
                'titles': title,
                'prop': 'extracts|pageimages',
                'exintro': True,
                'explaintext': True,
                'piprop': 'original'
            }
            
            response = self._get(url, params=params)
            data = response.json()
            
            pages = data.get('query', {}).get('pages', {})
            for page_id, page_data in pages.items():
                if page_id != '-1':  # Page exists
                    return {
                        'title': page_data.get('title'),
                        'extract': page_data.get('extract', '')[:200],  # First 200 chars
                        'image': page_data.get('original', {}).get('source')
                    }
            
        except Exception as e:
            print(f"Error fetching from Wikipedia: {e}")
        
        return {}
    
    def _fetch_from_static(self, count: int) -> List[Dict]:
        """
        Fetch from static fallback data.
        
        Returns:
            List of Egyptian movies/series/plays
        """
        import random
        
        items = []
        items_per_type = count // 3
        
        # Get movies
        if self.static_movies:
            selected_movies = random.sample(
                self.static_movies, 
                min(items_per_type, len(self.static_movies))
            )
            items.extend(selected_movies)
        
        # Get series
        if self.static_series:
            selected_series = random.sample(
                self.static_series,
                min(items_per_type, len(self.static_series))
            )
            items.extend(selected_series)
        
        # Get plays
        if self.static_plays:
            selected_plays = random.sample(
                self.static_plays,
                min(items_per_type, len(self.static_plays))
            )
            items.extend(selected_plays)
        
        random.shuffle(items)
        return items
