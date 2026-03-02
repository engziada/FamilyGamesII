"""
Database models for tracking game items (movies, questions, vocabulary)
with usage statistics and caching support.
"""
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import hashlib
import json as json_module
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
    content_hash = Column(String(64), index=True)  # Hash for deduplication
    last_used = Column(DateTime, default=None, index=True)  # Last time this item was used
    use_count = Column(Integer, default=0)  # How many times used across all rooms
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Composite index for efficient queries
    __table_args__ = (
        Index('idx_game_type_last_used', 'game_type', 'last_used'),
        Index('idx_game_type_category', 'game_type', 'category'),
        Index('idx_game_type_content_hash', 'game_type', 'content_hash'),
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
    """Initialize database tables and migrate schema if needed"""
    Base.metadata.create_all(engine)
    
    # Migration: Add content_hash column if it doesn't exist
    session = SessionLocal()
    try:
        # Check if content_hash column exists
        result = session.execute("PRAGMA table_info(game_items)")
        columns = [row[1] for row in result.fetchall()]
        
        if 'content_hash' not in columns:
            session.execute("ALTER TABLE game_items ADD COLUMN content_hash VARCHAR(64)")
            session.commit()
            print("Migration: Added content_hash column to game_items table")
    except Exception as e:
        session.rollback()
        print(f"Migration warning: {e}")
    finally:
        session.close()

def get_session():
    """Get a new database session"""
    return SessionLocal()


def compute_content_hash(game_type: str, item_data: dict) -> str:
    """
    Compute a SHA-256 hash from item content for deduplication.
    
    For trivia: uses question + correct_answer + category
    For charades/pictionary: uses word/title + category
    """
    hash_parts = [game_type]
    
    if game_type == 'trivia':
        # Trivia items have question, correct_answer, category
        question = item_data.get('question', '')
        answer = item_data.get('correct_answer', '')
        cat = item_data.get('category', '')
        hash_parts.extend([question, answer, cat])
    else:
        # Charades/Pictionary items have word/title and category
        word = item_data.get('word', '') or item_data.get('title', '') or item_data.get('name', '')
        cat = item_data.get('category', '')
        hash_parts.extend([word, cat])
    
    content = '|'.join(str(p) for p in hash_parts)
    return hashlib.sha256(content.encode('utf-8')).hexdigest()
