"""
Centralized Timer Manager Service
Handles all game timers using eventlet greenlets with thread-safe operations.
Prevents race conditions and memory leaks.
"""
from typing import Dict, List, Callable, Optional
import eventlet
import logging

logger = logging.getLogger(__name__)


class TimerManager:
    """
    Centralized manager for all game timers using eventlet greenlets.
    Prevents race conditions and memory leaks through proper synchronization.
    """
    
    def __init__(self):
        """Initialize timer manager with empty timer storage and semaphore lock."""
        self.turn_timers: Dict[str, eventlet.greenthread.GreenThread] = {}
        self.hint_timers: Dict[str, List[eventlet.greenthread.GreenThread]] = {}
        self.lock = eventlet.semaphore.Semaphore()
    
    def start_turn_timer(
        self, 
        game_id: str, 
        player_name: str, 
        callback: Callable[[str, str], None], 
        timeout: int = 30
    ) -> None:
        """
        Start a turn timer for a player with auto-skip on timeout.
        
        Args:
            game_id: Unique game room identifier
            player_name: Name of the player whose turn it is
            callback: Function to call on timeout (receives game_id, player_name)
            timeout: Timeout duration in seconds (default: 30)
        """
        with self.lock:
            # Cancel existing timer for this game if any
            self._cancel_turn_timer_unsafe(game_id)
            
            # Create new timer
            def timer_callback():
                try:
                    callback(game_id, player_name)
                finally:
                    # Clean up timer reference after execution
                    with self.lock:
                        self.turn_timers.pop(game_id, None)
            
            timer = eventlet.spawn_after(timeout, timer_callback)
            self.turn_timers[game_id] = timer
            logger.debug(f"Started turn timer for game {game_id}, player {player_name}, timeout {timeout}s")
    
    def cancel_turn_timer(self, game_id: str) -> None:
        """
        Cancel the turn timer for a game.
        
        Args:
            game_id: Unique game room identifier
        """
        with self.lock:
            self._cancel_turn_timer_unsafe(game_id)
    
    def _cancel_turn_timer_unsafe(self, game_id: str) -> None:
        """
        Internal method to cancel turn timer without acquiring lock.
        Must be called within a lock context.
        
        Args:
            game_id: Unique game room identifier
        """
        if game_id in self.turn_timers:
            try:
                self.turn_timers[game_id].cancel()
                logger.debug(f"Cancelled turn timer for game {game_id}")
            except Exception as e:
                logger.warning(f"Error cancelling turn timer for game {game_id}: {e}")
            finally:
                del self.turn_timers[game_id]
    
    def start_hint_cycle(
        self, 
        game_id: str, 
        callback: Callable[[str, int], None], 
        delays: List[int] = None
    ) -> None:
        """
        Start a cycle of hint timers for a game.
        
        Args:
            game_id: Unique game room identifier
            callback: Function to call for each hint (receives game_id, hint_number)
            delays: List of delays in seconds for each hint (default: [30, 60, 90])
        """
        if delays is None:
            delays = [30, 60, 90]
        
        with self.lock:
            # Cancel existing hint timers for this game
            self._cancel_hint_timers_unsafe(game_id)
            
            # Create new hint timers
            timers = []
            for i, delay in enumerate(delays, 1):
                def hint_callback(hint_num=i):
                    try:
                        callback(game_id, hint_num)
                    except Exception as e:
                        logger.error(f"Error in hint callback for game {game_id}, hint {hint_num}: {e}")
                
                timer = eventlet.spawn_after(delay, hint_callback)
                timers.append(timer)
            
            self.hint_timers[game_id] = timers
            logger.debug(f"Started hint cycle for game {game_id} with delays {delays}")
    
    def cancel_hint_timers(self, game_id: str) -> None:
        """
        Cancel all hint timers for a game.
        
        Args:
            game_id: Unique game room identifier
        """
        with self.lock:
            self._cancel_hint_timers_unsafe(game_id)
    
    def _cancel_hint_timers_unsafe(self, game_id: str) -> None:
        """
        Internal method to cancel hint timers without acquiring lock.
        Must be called within a lock context.
        
        Args:
            game_id: Unique game room identifier
        """
        if game_id in self.hint_timers:
            for timer in self.hint_timers[game_id]:
                try:
                    timer.cancel()
                except Exception as e:
                    logger.warning(f"Error cancelling hint timer for game {game_id}: {e}")
            
            del self.hint_timers[game_id]
            logger.debug(f"Cancelled hint timers for game {game_id}")
    
    def cleanup_game_timers(self, game_id: str) -> None:
        """
        Clean up all timers associated with a game room.
        Should be called when a game room is closed or deleted.
        
        Args:
            game_id: Unique game room identifier
        """
        with self.lock:
            self._cancel_turn_timer_unsafe(game_id)
            self._cancel_hint_timers_unsafe(game_id)
            logger.info(f"Cleaned up all timers for game {game_id}")
    
    def get_active_timers(self) -> Dict[str, Dict[str, int]]:
        """
        Get information about currently active timers.
        Useful for debugging and monitoring.
        
        Returns:
            Dictionary with game_id as key and timer counts as value
        """
        with self.lock:
            return {
                game_id: {
                    'turn_timer': 1 if game_id in self.turn_timers else 0,
                    'hint_timers': len(self.hint_timers.get(game_id, []))
                }
                for game_id in set(list(self.turn_timers.keys()) + list(self.hint_timers.keys()))
            }
