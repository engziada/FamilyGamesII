"""
Unit tests for TimerManager class
Tests timer creation, cancellation, and cleanup functionality.
"""
import pytest
import eventlet
from services.timer_manager import TimerManager


class TestTimerManager:
    """Test suite for TimerManager class"""
    
    def setup_method(self):
        """Set up test fixtures before each test"""
        self.timer_manager = TimerManager()
        self.callback_executed = []
    
    def test_start_turn_timer(self):
        """Test starting a turn timer"""
        def callback(game_id, player_name):
            self.callback_executed.append((game_id, player_name))
        
        self.timer_manager.start_turn_timer('game1', 'player1', callback, timeout=1)
        
        # Verify timer was created
        assert 'game1' in self.timer_manager.turn_timers
        
        # Wait for timer to execute
        eventlet.sleep(1.5)
        
        # Verify callback was executed
        assert ('game1', 'player1') in self.callback_executed
        
        # Verify timer was cleaned up
        assert 'game1' not in self.timer_manager.turn_timers
    
    def test_cancel_turn_timer(self):
        """Test cancelling a turn timer before it executes"""
        def callback(game_id, player_name):
            self.callback_executed.append((game_id, player_name))
        
        self.timer_manager.start_turn_timer('game1', 'player1', callback, timeout=2)
        
        # Cancel immediately
        self.timer_manager.cancel_turn_timer('game1')
        
        # Verify timer was removed
        assert 'game1' not in self.timer_manager.turn_timers
        
        # Wait to ensure callback doesn't execute
        eventlet.sleep(2.5)
        
        # Verify callback was not executed
        assert len(self.callback_executed) == 0
    
    def test_timer_auto_cleanup(self):
        """Test that timers clean up themselves after execution"""
        def callback(game_id, player_name):
            self.callback_executed.append((game_id, player_name))
        
        self.timer_manager.start_turn_timer('game1', 'player1', callback, timeout=1)
        
        # Wait for execution
        eventlet.sleep(1.5)
        
        # Verify timer was automatically cleaned up
        assert 'game1' not in self.timer_manager.turn_timers
    
    def test_concurrent_timer_operations(self):
        """Test multiple timers for different games"""
        def callback(game_id, player_name):
            self.callback_executed.append((game_id, player_name))
        
        # Start timers for multiple games
        self.timer_manager.start_turn_timer('game1', 'player1', callback, timeout=1)
        self.timer_manager.start_turn_timer('game2', 'player2', callback, timeout=1)
        self.timer_manager.start_turn_timer('game3', 'player3', callback, timeout=1)
        
        # Verify all timers exist
        assert len(self.timer_manager.turn_timers) == 3
        
        # Wait for execution
        eventlet.sleep(1.5)
        
        # Verify all callbacks executed
        assert len(self.callback_executed) == 3
        assert ('game1', 'player1') in self.callback_executed
        assert ('game2', 'player2') in self.callback_executed
        assert ('game3', 'player3') in self.callback_executed
    
    def test_hint_cycle(self):
        """Test starting a hint cycle with multiple hints"""
        def callback(game_id, hint_number):
            self.callback_executed.append((game_id, hint_number))
        
        # Start hint cycle with short delays for testing
        self.timer_manager.start_hint_cycle('game1', callback, delays=[0.5, 1.0, 1.5])
        
        # Verify timers were created
        assert 'game1' in self.timer_manager.hint_timers
        assert len(self.timer_manager.hint_timers['game1']) == 3
        
        # Wait for all hints to execute
        eventlet.sleep(2.0)
        
        # Verify all hints executed
        assert len(self.callback_executed) == 3
        assert ('game1', 1) in self.callback_executed
        assert ('game1', 2) in self.callback_executed
        assert ('game1', 3) in self.callback_executed
    
    def test_cancel_hint_timers(self):
        """Test cancelling hint timers"""
        def callback(game_id, hint_number):
            self.callback_executed.append((game_id, hint_number))
        
        self.timer_manager.start_hint_cycle('game1', callback, delays=[1, 2, 3])
        
        # Cancel immediately
        self.timer_manager.cancel_hint_timers('game1')
        
        # Verify timers were removed
        assert 'game1' not in self.timer_manager.hint_timers
        
        # Wait to ensure callbacks don't execute
        eventlet.sleep(3.5)
        
        # Verify no callbacks executed
        assert len(self.callback_executed) == 0
    
    def test_cleanup_game_timers(self):
        """Test cleaning up all timers for a game"""
        def turn_callback(game_id, player_name):
            self.callback_executed.append(('turn', game_id, player_name))
        
        def hint_callback(game_id, hint_number):
            self.callback_executed.append(('hint', game_id, hint_number))
        
        # Start both turn and hint timers
        self.timer_manager.start_turn_timer('game1', 'player1', turn_callback, timeout=2)
        self.timer_manager.start_hint_cycle('game1', hint_callback, delays=[1, 2, 3])
        
        # Verify timers exist
        assert 'game1' in self.timer_manager.turn_timers
        assert 'game1' in self.timer_manager.hint_timers
        
        # Cleanup all timers
        self.timer_manager.cleanup_game_timers('game1')
        
        # Verify all timers removed
        assert 'game1' not in self.timer_manager.turn_timers
        assert 'game1' not in self.timer_manager.hint_timers
        
        # Wait to ensure no callbacks execute
        eventlet.sleep(3.5)
        
        # Verify no callbacks executed
        assert len(self.callback_executed) == 0
    
    def test_get_active_timers(self):
        """Test getting information about active timers"""
        def callback(game_id, player_name):
            pass
        
        def hint_callback(game_id, hint_number):
            pass
        
        # Start various timers
        self.timer_manager.start_turn_timer('game1', 'player1', callback, timeout=10)
        self.timer_manager.start_hint_cycle('game2', hint_callback, delays=[10, 20, 30])
        self.timer_manager.start_turn_timer('game3', 'player3', callback, timeout=10)
        self.timer_manager.start_hint_cycle('game3', hint_callback, delays=[10, 20])
        
        # Get active timers
        active = self.timer_manager.get_active_timers()
        
        # Verify counts
        assert active['game1']['turn_timer'] == 1
        assert active['game1']['hint_timers'] == 0
        assert active['game2']['turn_timer'] == 0
        assert active['game2']['hint_timers'] == 3
        assert active['game3']['turn_timer'] == 1
        assert active['game3']['hint_timers'] == 2
        
        # Cleanup
        self.timer_manager.cleanup_game_timers('game1')
        self.timer_manager.cleanup_game_timers('game2')
        self.timer_manager.cleanup_game_timers('game3')
    
    def test_replace_existing_timer(self):
        """Test that starting a new timer replaces the existing one"""
        def callback(game_id, player_name):
            self.callback_executed.append((game_id, player_name))
        
        # Start first timer
        self.timer_manager.start_turn_timer('game1', 'player1', callback, timeout=2)
        
        # Start second timer for same game (should replace first)
        self.timer_manager.start_turn_timer('game1', 'player2', callback, timeout=1)
        
        # Wait for second timer to execute
        eventlet.sleep(1.5)
        
        # Verify only second callback executed
        assert len(self.callback_executed) == 1
        assert ('game1', 'player2') in self.callback_executed
        
        # Wait longer to ensure first timer didn't execute
        eventlet.sleep(1.0)
        assert len(self.callback_executed) == 1
