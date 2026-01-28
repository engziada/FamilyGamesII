# Data Integration Guide

## Overview

The new dynamic data fetching system provides:
- **Online data sources** for all game types
- **Intelligent caching** with SQLite database
- **No repetition** within the same room
- **Usage tracking** to prioritize least-used items
- **Pre-fetching** to ensure smooth gameplay

## Architecture

```
┌─────────────────┐
│   Game Model    │
│  (charades.py)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Data Service   │
│ (coordinator)   │
└────────┬────────┘
         │
    ┌────┴────┬────────┬────────┐
    ▼         ▼        ▼        ▼
┌────────┐ ┌──────┐ ┌──────┐ ┌──────────┐
│Charades│ │Pict. │ │Trivia│ │  Data    │
│Fetcher │ │Fetch.│ │Fetch.│ │ Manager  │
└────────┘ └──────┘ └──────┘ └────┬─────┘
                                   ▼
                            ┌──────────────┐
                            │   Database   │
                            │ (game_data.db)│
                            └──────────────┘
```

## Database Schema

### GameItem Table
- `id`: Primary key
- `game_type`: charades, pictionary, trivia
- `category`: Item category (أفلام, مسلسلات, etc.)
- `item_data`: JSON with item details
- `source`: Data source name
- `last_used`: Last usage timestamp
- `use_count`: Total usage count
- `created_at`: Creation timestamp

### RoomItemUsage Table
- `id`: Primary key
- `room_id`: Room identifier
- `item_id`: Reference to GameItem
- `used_at`: Usage timestamp

## Usage in Game Models

### Basic Integration

```python
from services.data_service import get_data_service

class CharadesGame:
    def __init__(self, game_id, host, settings):
        self.game_id = game_id
        self.data_service = get_data_service()
        
        # Pre-fetch items on room creation
        self.data_service.prefetch_for_room(
            room_id=game_id,
            game_type='charades',
            count=30
        )
    
    def get_item(self):
        """Get next item for the game"""
        item = self.data_service.get_item_for_room(
            room_id=self.game_id,
            game_type='charades'
        )
        return item
    
    def close_room(self):
        """Clean up when room closes"""
        self.data_service.cleanup_room(self.game_id)
```

### Trivia Integration

```python
def get_question(self):
    """Get next trivia question"""
    question = self.data_service.get_item_for_room(
        room_id=self.game_id,
        game_type='trivia',
        category='ثقافة عامة'  # Optional category filter
    )
    
    # question structure:
    # {
    #     'question': 'السؤال',
    #     'correct_answer': 'الإجابة الصحيحة',
    #     'wrong_answers': ['خطأ 1', 'خطأ 2', 'خطأ 3'],
    #     'category': 'ثقافة عامة',
    #     'difficulty': 'medium'
    # }
    
    return question
```

### Pictionary Integration

```python
def get_word(self):
    """Get next word to draw"""
    word = self.data_service.get_item_for_room(
        room_id=self.game_id,
        game_type='pictionary'
    )
    
    # word structure:
    # {
    #     'item': 'الكلمة',
    #     'category': 'حيوانات'
    # }
    
    return word
```

## Data Sources

### Charades (Egyptian Movies/Series/Plays)
- **Source**: elcinema.com + Arabic Wikipedia
- **Data**: Movie/series/play name, production year, starring cast
- **Categories**: أفلام, مسلسلات, مسرحيات
- **Rate Limit**: 2 seconds between requests

### Pictionary (Arabic Vocabulary)
- **Source**: Static vocabulary database (expandable)
- **Data**: Word and category
- **Categories**: حيوانات, أشياء, مهن, أماكن, طعام, رياضة, طبيعة, مواصلات
- **Future**: Integration with Arabic learning APIs

### Trivia (Questions)
- **Sources**: 
  - Egyptian Cinema Quiz (static)
  - Islamic Quiz API (GitHub)
  - OpenTDB (with AI translation)
- **Data**: Question, correct answer, wrong answers, category, difficulty
- **Translation**: Uses Groq AI API for Arabic translation
- **Rate Limit**: 1 second between requests

## Environment Setup

1. Copy `.env.example` to `.env`
2. Add your Groq API key (free at https://console.groq.com/)
3. Install dependencies: `uv pip install -r requirements.txt`

## Cache Management

### Pre-fetching Strategy
- **On room creation**: Fetch 30 items
- **During gameplay**: When cache < 10 items, fetch 20 more
- **Priority**: Oldest unused items first (nulls first)

### Room Isolation
- Items never repeat within the same room
- Each room tracks its own used items
- Room usage cleared on room close

### Cleanup
- Old room usage records (>7 days) automatically cleaned
- Can be triggered manually via `data_manager.cleanup_old_room_usage()`

## Testing

```python
from services.data_service import get_data_service

# Initialize service
service = get_data_service()

# Check cache status
stats = service.get_cache_stats()
print(stats)

# Pre-fetch for a test room
service.prefetch_for_room('test_room', 'charades', count=10)

# Get an item
item = service.get_item_for_room('test_room', 'charades')
print(item)

# Cleanup
service.cleanup_room('test_room')
```

## Migration Steps

1. **Install dependencies**: `uv pip install -r requirements.txt`
2. **Set environment variables**: Copy `.env.example` to `.env`
3. **Update game models**: Replace static data loading with data service calls
4. **Test each game type**: Verify data fetching and caching
5. **Monitor performance**: Check database size and fetch times

## Performance Considerations

- **Database**: SQLite with indexes on frequently queried fields
- **Caching**: Items cached indefinitely, prioritized by usage
- **Rate Limiting**: Respectful scraping with configurable delays
- **Batch Fetching**: Reduces API calls and improves response time

## Future Enhancements

1. **Charades**: Implement actual elcinema.com scraping (currently placeholder)
2. **Pictionary**: Integrate with Arabic learning APIs
3. **Trivia**: Add more Egyptian cinema questions via scraping
4. **AI Translation**: Improve translation quality and add caching
5. **Admin Panel**: Web interface for cache management and statistics
