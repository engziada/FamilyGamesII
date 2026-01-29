"""
Base fetcher class with common functionality for all data fetchers.
"""
import time
import requests
from typing import List, Dict, Optional
from abc import ABC, abstractmethod


class BaseFetcher(ABC):
    """
    Abstract base class for all data fetchers.
    Provides rate limiting and common HTTP functionality.
    """
    
    def __init__(self, rate_limit_delay: float = 1.0):
        """
        Initialize fetcher with rate limiting.
        
        Args:
            rate_limit_delay: Seconds to wait between requests
        """
        self.rate_limit_delay = rate_limit_delay
        self.last_request_time = 0
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def _rate_limit(self):
        """Enforce rate limiting between requests"""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.rate_limit_delay:
            time.sleep(self.rate_limit_delay - elapsed)
        self.last_request_time = time.time()
    
    def _get(self, url: str, **kwargs) -> requests.Response:
        """
        Make a rate-limited GET request.
        
        Args:
            url: URL to fetch
            **kwargs: Additional arguments for requests.get
            
        Returns:
            Response object
        """
        self._rate_limit()
        try:
            response = self.session.get(url, timeout=10, **kwargs)
            response.raise_for_status()
            return response
        except requests.RequestException as e:
            print(f"Request error for {url}: {e}")
            raise
    
    def _post(self, url: str, **kwargs) -> requests.Response:
        """
        Make a rate-limited POST request.
        
        Args:
            url: URL to post to
            **kwargs: Additional arguments for requests.post
            
        Returns:
            Response object
        """
        self._rate_limit()
        try:
            response = self.session.post(url, timeout=10, **kwargs)
            response.raise_for_status()
            return response
        except requests.RequestException as e:
            print(f"Request error for {url}: {e}")
            raise
    
    @abstractmethod
    def fetch_batch(self, count: int = 30) -> List[Dict]:
        """
        Fetch a batch of items.
        
        Args:
            count: Number of items to fetch
            
        Returns:
            List of item dictionaries
        """
        pass
    
    @abstractmethod
    def get_source_name(self) -> str:
        """Return the name of this data source"""
        pass
