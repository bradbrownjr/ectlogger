"""
Centralized logging utility for ECTLogger
Provides log level control via LOG_LEVEL environment variable
Supports Fail2Ban-compatible security logging for authentication failures
"""
from app.config import settings
from enum import IntEnum
from datetime import datetime
import sys
import os


class LogLevel(IntEnum):
    """Log levels in order of severity"""
    DEBUG = 10
    INFO = 20
    WARNING = 30
    ERROR = 40


class Logger:
    """
    Logger with configurable levels and Fail2Ban-compatible output.
    
    Log format for security events:
    YYYY-MM-DD HH:MM:SS [LEVEL] [CATEGORY] message - IP: x.x.x.x
    
    This format is compatible with Fail2Ban regex parsing.
    """
    
    def __init__(self):
        self._level = self._parse_level(settings.log_level)
        self._log_file = None
        self._setup_log_file()
    
    def _setup_log_file(self):
        """Setup log file if LOG_FILE is configured"""
        log_file_path = os.environ.get("LOG_FILE")
        if log_file_path:
            try:
                # Ensure directory exists
                log_dir = os.path.dirname(log_file_path)
                if log_dir and not os.path.exists(log_dir):
                    os.makedirs(log_dir, exist_ok=True)
                self._log_file = open(log_file_path, "a", buffering=1)  # Line buffered
            except Exception as e:
                print(f"Warning: Could not open log file {log_file_path}: {e}", file=sys.stderr)
    
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
    
    def _format_timestamp(self) -> str:
        """Format current time for log output"""
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    def _log(self, level: LogLevel, category: str, message: str, ip: str = None):
        """Internal logging method with Fail2Ban-compatible format"""
        if level >= self._level:
            timestamp = self._format_timestamp()
            level_name = level.name
            
            # Format: YYYY-MM-DD HH:MM:SS [LEVEL] [CATEGORY] message
            log_line = f"{timestamp} [{level_name}] [{category}] {message}"
            
            # Append IP if provided (for Fail2Ban parsing)
            if ip:
                log_line += f" - IP: {ip}"
            
            # Output to console
            print(log_line)
            
            # Output to file if configured
            if self._log_file:
                try:
                    self._log_file.write(log_line + "\n")
                except Exception:
                    pass  # Fail silently if file write fails
    
    def debug(self, category: str, message: str, ip: str = None):
        """Debug level - detailed information for diagnosing problems"""
        self._log(LogLevel.DEBUG, category, message, ip)
    
    def info(self, category: str, message: str, ip: str = None):
        """Info level - general informational messages"""
        self._log(LogLevel.INFO, category, message, ip)
    
    def warning(self, category: str, message: str, ip: str = None):
        """Warning level - something unexpected but not critical"""
        self._log(LogLevel.WARNING, category, message, ip)
    
    def error(self, category: str, message: str, ip: str = None):
        """Error level - something failed"""
        self._log(LogLevel.ERROR, category, message, ip)
    
    # Security-specific logging methods for Fail2Ban
    def auth_failure(self, message: str, ip: str, email: str = None):
        """
        Log authentication failure with IP address for Fail2Ban.
        
        Format: YYYY-MM-DD HH:MM:SS [WARNING] [AUTH] Authentication failed: message - IP: x.x.x.x
        """
        full_message = f"Authentication failed: {message}"
        if email:
            full_message += f" (email: {email})"
        self._log(LogLevel.WARNING, "AUTH", full_message, ip)
    
    def auth_success(self, email: str, ip: str):
        """Log successful authentication"""
        self._log(LogLevel.INFO, "AUTH", f"Authentication successful for {email}", ip)
    
    def rate_limit(self, ip: str, endpoint: str):
        """Log rate limit exceeded for Fail2Ban"""
        self._log(LogLevel.WARNING, "SECURITY", f"Rate limit exceeded on {endpoint}", ip)
    
    def banned_access(self, email: str, ip: str):
        """Log banned user access attempt"""
        self._log(LogLevel.WARNING, "SECURITY", f"Banned user access attempt: {email}", ip)


# Global logger instance
logger = Logger()
