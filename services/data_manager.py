"""
Data Manager Service
Handles caching, pre-fetching, and item distribution for all game types.
"""
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlalchemy import and_, or_
from models.game_items import GameItem, RoomItemUsage, get_session, init_db
import random


class DataManager:
    """
    Manages game item caching, fetching, and distribution.
    Ensures no repetition within rooms and prioritizes least-used items.
    """
    
    BATCH_SIZE = 30
    REFETCH_THRESHOLD = 10
    
    def __init__(self):
        """Initialize database"""
        init_db()
    
    def get_items_for_room(self, room_id: str, game_type: str, category: Optional[str] = None, count: int = 1) -> List[Dict]:
        """
        Get items for a room, ensuring no repetition and prioritizing old items.
        
        Args:
            room_id: Room identifier
            game_type: Type of game (charades, pictionary, trivia)
            category: Optional category filter
            count: Number of items to return
            
        Returns:
            List of item data dictionaries
        """
        session = get_session()
        try:
            # Get items already used in this room
            used_item_ids = session.query(RoomItemUsage.item_id).filter(
                RoomItemUsage.room_id == room_id
            ).all()
            used_ids = [item_id for (item_id,) in used_item_ids]
            
            # Build query for available items
            query = session.query(GameItem).filter(
                GameItem.game_type == game_type
            )
            
            if category:
                query = query.filter(GameItem.category == category)
            
            # Exclude already used items in this room
            if used_ids:
                query = query.filter(~GameItem.id.in_(used_ids))
            
            # Order by last_used (oldest first, nulls first)
            query = query.order_by(GameItem.last_used.asc().nullsfirst())
            
            # Get items
            items = query.limit(count).all()
            
            if not items:
                return []
            
            # Mark items as used in this room
            for item in items:
                # Update item usage
                item.last_used = datetime.utcnow()
                item.use_count += 1
                
                # Track room usage
                room_usage = RoomItemUsage(
                    room_id=room_id,
                    item_id=item.id
                )
                session.add(room_usage)
            
            session.commit()
            
            # Return item data
            return [item.item_data for item in items]
            
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_cache_status(self, game_type: str, category: Optional[str] = None) -> Dict:
        """
        Check cache status for a game type/category.
        
        Returns:
            Dict with total_items, oldest_unused_date, needs_refetch
        """
        session = get_session()
        try:
            query = session.query(GameItem).filter(GameItem.game_type == game_type)
            
            if category:
                query = query.filter(GameItem.category == category)
            
            total = query.count()
            unused = query.filter(GameItem.last_used == None).count()
            
            oldest_unused = query.filter(GameItem.last_used == None).order_by(
                GameItem.created_at.asc()
            ).first()
            
            return {
                'total_items': total,
                'unused_items': unused,
                'oldest_unused_date': oldest_unused.created_at if oldest_unused else None,
                'needs_refetch': total < self.REFETCH_THRESHOLD
            }
        finally:
            session.close()
    
    def add_items(self, game_type: str, category: str, items: List[Dict], source: str):
        """
        Add fetched items to the cache.
        
        Args:
            game_type: Type of game
            category: Item category
            items: List of item data dictionaries
            source: Source API/website
        """
        session = get_session()
        try:
            for item_data in items:
                game_item = GameItem(
                    game_type=game_type,
                    category=category,
                    item_data=item_data,
                    source=source
                )
                session.add(game_item)
            
            session.commit()
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def clear_room_usage(self, room_id: str):
        """Clear usage tracking for a room (when room closes)"""
        session = get_session()
        try:
            session.query(RoomItemUsage).filter(
                RoomItemUsage.room_id == room_id
            ).delete()
            session.commit()
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def cleanup_old_room_usage(self, days: int = 7):
        """Remove room usage records older than specified days"""
        session = get_session()
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            session.query(RoomItemUsage).filter(
                RoomItemUsage.used_at < cutoff_date
            ).delete()
            session.commit()
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
