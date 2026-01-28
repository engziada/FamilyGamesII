"""
Data Service Coordinator
Manages all data fetchers and coordinates with DataManager for caching.
"""
from typing import List, Dict, Optional
import os
from .data_manager import DataManager
from .fetchers.charades_fetcher import CharadesFetcher
from .fetchers.pictionary_fetcher import PictionaryFetcher
from .fetchers.trivia_fetcher import TriviaFetcher


class DataService:
    """
    Central service for managing game data fetching and caching.
    """
    
    def __init__(self, ai_api_key: Optional[str] = None):
        """
        Initialize data service with all fetchers.
        
        Args:
            ai_api_key: Optional API key for AI translation (Groq)
        """
        self.data_manager = DataManager()
        self.charades_fetcher = CharadesFetcher()
        self.pictionary_fetcher = PictionaryFetcher()
        self.trivia_fetcher = TriviaFetcher(ai_api_key=ai_api_key)
    
    def get_item_for_room(self, room_id: str, game_type: str, category: Optional[str] = None) -> Optional[Dict]:
        """
        Get a single item for a room, fetching more if cache is low.
        
        Args:
            room_id: Room identifier
            game_type: Type of game (charades, pictionary, trivia)
            category: Optional category filter
            
        Returns:
            Item data dict or None
        """
        # Check cache status
        cache_status = self.data_manager.get_cache_status(game_type, category)
        
        # If cache is low, fetch more items in background
        if cache_status['needs_refetch']:
            self._refetch_items(game_type, category)
        
        # Get item from cache
        items = self.data_manager.get_items_for_room(room_id, game_type, category, count=1)
        return items[0] if items else None
    
    def prefetch_for_room(self, room_id: str, game_type: str, category: Optional[str] = None, count: int = 30):
        """
        Pre-fetch items when a room is created.
        
        Args:
            room_id: Room identifier
            game_type: Type of game
            category: Optional category filter
            count: Number of items to pre-fetch
        """
        # Check if we have enough items in cache
        cache_status = self.data_manager.get_cache_status(game_type, category)
        
        if cache_status['total_items'] < count:
            # Need to fetch more items
            self._refetch_items(game_type, category, count=count)
    
    def _refetch_items(self, game_type: str, category: Optional[str] = None, count: int = 30):
        """
        Fetch new items and add to cache.
        
        Args:
            game_type: Type of game
            category: Optional category filter
            count: Number of items to fetch
        """
        try:
            if game_type == 'charades':
                items = self.charades_fetcher.fetch_batch(count)
                source = self.charades_fetcher.get_source_name()
                
                # Add items to cache
                for item in items:
                    item_category = item.get('category', category or 'أفلام')
                    self.data_manager.add_items(
                        game_type='charades',
                        category=item_category,
                        items=[item],
                        source=source
                    )
            
            elif game_type == 'pictionary':
                items = self.pictionary_fetcher.fetch_batch(count)
                source = self.pictionary_fetcher.get_source_name()
                
                # Add items to cache
                for item in items:
                    item_category = item.get('category', category or 'عام')
                    self.data_manager.add_items(
                        game_type='pictionary',
                        category=item_category,
                        items=[item],
                        source=source
                    )
            
            elif game_type == 'trivia':
                items = self.trivia_fetcher.fetch_batch(count)
                source = self.trivia_fetcher.get_source_name()
                
                # Add items to cache
                for item in items:
                    item_category = item.get('category', category or 'ثقافة عامة')
                    self.data_manager.add_items(
                        game_type='trivia',
                        category=item_category,
                        items=[item],
                        source=source
                    )
            
        except Exception as e:
            print(f"Error refetching items for {game_type}: {e}")
    
    def cleanup_room(self, room_id: str):
        """Clean up room usage tracking when room closes"""
        self.data_manager.clear_room_usage(room_id)
    
    def get_cache_stats(self) -> Dict:
        """Get cache statistics for all game types"""
        return {
            'charades': self.data_manager.get_cache_status('charades'),
            'pictionary': self.data_manager.get_cache_status('pictionary'),
            'trivia': self.data_manager.get_cache_status('trivia')
        }


# Global data service instance
_data_service = None

def get_data_service() -> DataService:
    """Get or create the global data service instance"""
    global _data_service
    if _data_service is None:
        # Get AI API key from environment
        ai_api_key = os.getenv('GROQ_API_KEY')
        _data_service = DataService(ai_api_key=ai_api_key)
    return _data_service
