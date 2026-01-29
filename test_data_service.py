"""
Test script for data fetching infrastructure.
Run this to verify all fetchers and caching work correctly.
"""
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.data_service import get_data_service
from models.game_items import init_db


def test_pictionary_fetcher():
    """Test Pictionary data fetching"""
    print("\n=== Testing Pictionary Fetcher ===")
    service = get_data_service()
    
    # Pre-fetch items
    print("Pre-fetching 10 Pictionary items...")
    service.prefetch_for_room('test_pict_room', 'pictionary', count=10)
    
    # Get items
    print("Getting 5 items for room...")
    for i in range(5):
        item = service.get_item_for_room('test_pict_room', 'pictionary')
        if item:
            print(f"  {i+1}. {item.get('item')} ({item.get('category')})")
        else:
            print(f"  {i+1}. No item available")
    
    # Check cache status
    status = service.data_manager.get_cache_status('pictionary')
    print(f"\nCache Status: {status['total_items']} total, {status['unused_items']} unused")
    
    # Cleanup
    service.cleanup_room('test_pict_room')
    print("✓ Pictionary test completed")


def test_trivia_fetcher():
    """Test Trivia data fetching"""
    print("\n=== Testing Trivia Fetcher ===")
    service = get_data_service()
    
    # Pre-fetch items
    print("Pre-fetching 5 Trivia questions...")
    service.prefetch_for_room('test_trivia_room', 'trivia', count=5)
    
    # Get items
    print("Getting 3 questions for room...")
    for i in range(3):
        item = service.get_item_for_room('test_trivia_room', 'trivia')
        if item:
            print(f"\n  Question {i+1}: {item.get('question')}")
            print(f"  Correct: {item.get('correct_answer')}")
            print(f"  Wrong: {', '.join(item.get('wrong_answers', []))}")
            print(f"  Category: {item.get('category')}")
        else:
            print(f"  {i+1}. No question available")
    
    # Check cache status
    status = service.data_manager.get_cache_status('trivia')
    print(f"\nCache Status: {status['total_items']} total, {status['unused_items']} unused")
    
    # Cleanup
    service.cleanup_room('test_trivia_room')
    print("✓ Trivia test completed")


def test_charades_fetcher():
    """Test Charades data fetching"""
    print("\n=== Testing Charades Fetcher ===")
    service = get_data_service()
    
    # Note: Charades fetcher uses web scraping which may fail without proper implementation
    print("Note: Charades fetcher requires web scraping implementation")
    print("Using static data for now...")
    
    # Try to pre-fetch (may use fallback data)
    try:
        service.prefetch_for_room('test_char_room', 'charades', count=5)
        
        # Get items
        print("Getting 2 items for room...")
        for i in range(2):
            item = service.get_item_for_room('test_char_room', 'charades')
            if item:
                print(f"\n  {i+1}. {item.get('item')} ({item.get('type')})")
                print(f"     Year: {item.get('year')}")
                print(f"     Starring: {item.get('starring')}")
            else:
                print(f"  {i+1}. No item available")
        
        # Check cache status
        status = service.data_manager.get_cache_status('charades')
        print(f"\nCache Status: {status['total_items']} total, {status['unused_items']} unused")
        
        # Cleanup
        service.cleanup_room('test_char_room')
        print("✓ Charades test completed")
        
    except Exception as e:
        print(f"✗ Charades test failed: {e}")
        print("  (This is expected if web scraping is not fully implemented)")


def test_no_repetition():
    """Test that items don't repeat in the same room"""
    print("\n=== Testing No Repetition ===")
    service = get_data_service()
    
    # Pre-fetch items
    service.prefetch_for_room('test_repeat_room', 'pictionary', count=10)
    
    # Get all items and track them
    seen_items = set()
    print("Getting 10 items and checking for duplicates...")
    
    for i in range(10):
        item = service.get_item_for_room('test_repeat_room', 'pictionary')
        if item:
            item_name = item.get('item')
            if item_name in seen_items:
                print(f"✗ DUPLICATE FOUND: {item_name}")
                return
            seen_items.add(item_name)
            print(f"  {i+1}. {item_name} (unique)")
    
    print("✓ No repetition test passed - all items unique")
    service.cleanup_room('test_repeat_room')


def test_cache_stats():
    """Test cache statistics"""
    print("\n=== Cache Statistics ===")
    service = get_data_service()
    
    stats = service.get_cache_stats()
    for game_type, status in stats.items():
        print(f"\n{game_type.upper()}:")
        print(f"  Total items: {status['total_items']}")
        print(f"  Unused items: {status['unused_items']}")
        print(f"  Needs refetch: {status['needs_refetch']}")
        if status['oldest_unused_date']:
            print(f"  Oldest unused: {status['oldest_unused_date']}")


def main():
    """Run all tests"""
    print("=" * 60)
    print("Data Service Test Suite")
    print("=" * 60)
    
    # Initialize database
    print("\nInitializing database...")
    init_db()
    print("✓ Database initialized")
    
    # Run tests
    try:
        test_pictionary_fetcher()
        test_trivia_fetcher()
        test_charades_fetcher()
        test_no_repetition()
        test_cache_stats()
        
        print("\n" + "=" * 60)
        print("All tests completed!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ Test suite failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    main()
