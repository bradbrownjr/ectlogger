"""
Centralized logging utility for ECTLogger
Provides log level control via LOG_LEVEL environment variable
"""
from app.config import settings
from enum import IntEnum


class LogLevel(IntEnum):
    """Log levels in order of severity"""
    DEBUG = 10
    INFO = 20
    WARNING = 30
    ERROR = 40


class Logger:
    """Simple logger with configurable levels"""
    
    def __init__(self):
        self._level = self._parse_level(settings.log_level)
    
    @staticmethod
    def _parse_level(level_str: str) -> LogLevel:
        """Parse log level from string"""
        level_map = {
            "DEBUG": LogLevel.DEBUG,
            "INFO": LogLevel.INFO,
            "WARNING": LogLevel.WARNING,
            "ERROR": LogLevel.ERROR,
        }
        return level_map.get(level_str.upper(), LogLevel.INFO)
    
    def _log(self, level: LogLevel, category: str, message: str):
        """Internal logging method"""
        if level >= self._level:
            print(f"[{category}] {message}")
    
    def debug(self, category: str, message: str):
        """Debug level - detailed information for diagnosing problems"""
        self._log(LogLevel.DEBUG, category, message)
    
    def info(self, category: str, message: str):
        """Info level - general informational messages"""
        self._log(LogLevel.INFO, category, message)
    
    def warning(self, category: str, message: str):
        """Warning level - something unexpected but not critical"""
        self._log(LogLevel.WARNING, category, message)
    
    def error(self, category: str, message: str):
        """Error level - something failed"""
        self._log(LogLevel.ERROR, category, message)


# Global logger instance
logger = Logger()
