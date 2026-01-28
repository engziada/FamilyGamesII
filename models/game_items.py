"""
Database models for tracking game items (movies, questions, vocabulary)
with usage statistics and caching support.
"""
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

Base = declarative_base()

class GameItem(Base):
    """
    Stores fetched game items with usage tracking.
    Supports all game types: charades, pictionary, trivia.
    """
    __tablename__ = 'game_items'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    game_type = Column(String(50), nullable=False, index=True)  # charades, pictionary, trivia
    category = Column(String(100), index=True)  # movies, series, plays, vocabulary, etc.
    item_data = Column(JSON, nullable=False)  # Stores the actual item content
    source = Column(String(200))  # API/website source
    last_used = Column(DateTime, default=None, index=True)  # Last time this item was used
    use_count = Column(Integer, default=0)  # How many times used across all rooms
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Composite index for efficient queries
    __table_args__ = (
        Index('idx_game_type_last_used', 'game_type', 'last_used'),
        Index('idx_game_type_category', 'game_type', 'category'),
    )
    
    def __repr__(self):
        return f"<GameItem(id={self.id}, type={self.game_type}, category={self.category}, uses={self.use_count})>"


class RoomItemUsage(Base):
    """
    Tracks which items have been used in which rooms to prevent repetition.
    """
    __tablename__ = 'room_item_usage'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(String(50), nullable=False, index=True)
    item_id = Column(Integer, nullable=False, index=True)
    used_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        Index('idx_room_item', 'room_id', 'item_id'),
    )
    
    def __repr__(self):
        return f"<RoomItemUsage(room={self.room_id}, item={self.item_id})>"


# Database setup
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'game_data.db')
engine = create_engine(f'sqlite:///{DB_PATH}', echo=False)
SessionLocal = sessionmaker(bind=engine)

def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(engine)

def get_session():
    """Get a new database session"""
    return SessionLocal()
