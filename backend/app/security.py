"""
Security utilities for input sanitization and validation
"""
import html
import re
from typing import Optional


def sanitize_html(text: Optional[str]) -> Optional[str]:
    """
    Remove all HTML tags and escape remaining HTML entities
    to prevent XSS attacks
    """
    if not text:
        return text
    
    # Remove all HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Escape HTML entities
    text = html.escape(text)
    
    # Remove any remaining script-like patterns
    text = re.sub(r'javascript:', '', text, flags=re.IGNORECASE)
    text = re.sub(r'on\w+\s*=', '', text, flags=re.IGNORECASE)
    
    return text


def sanitize_dict(data: dict) -> dict:
    """
    Recursively sanitize all string values in a dictionary
    """
    sanitized = {}
    for key, value in data.items():
        if isinstance(value, str):
            sanitized[key] = sanitize_html(value)
        elif isinstance(value, dict):
            sanitized[key] = sanitize_dict(value)
        elif isinstance(value, list):
            sanitized[key] = [
                sanitize_html(item) if isinstance(item, str)
                else sanitize_dict(item) if isinstance(item, dict)
                else item
                for item in value
            ]
        else:
            sanitized[key] = value
    return sanitized


def validate_sql_safe(text: str) -> bool:
    """
    Check if text contains potentially dangerous SQL patterns
    Returns True if safe, False if suspicious
    """
    if not text:
        return True
    
    # Patterns that might indicate SQL injection attempts
    dangerous_patterns = [
        r"('\s*(or|and)\s*')",  # ' or ', ' and '
        r"(--)",                 # SQL comments
        r"(/\*|\*/)",           # SQL block comments
        r"(;\s*drop)",          # Drop statements
        r"(;\s*delete)",        # Delete statements
        r"(;\s*update)",        # Update statements
        r"(;\s*insert)",        # Insert statements
        r"(union\s+select)",    # Union select
        r"(exec\s*\()",         # Exec statements
    ]
    
    text_lower = text.lower()
    for pattern in dangerous_patterns:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return False
    
    return True


def validate_no_path_traversal(text: str) -> bool:
    """
    Check if text contains path traversal patterns
    Returns True if safe, False if suspicious
    """
    if not text:
        return True
    
    # Check for path traversal patterns
    dangerous_patterns = [
        r'\.\.',           # Parent directory
        r'~/',             # Home directory
        r'/etc/',          # System directories
        r'/var/',
        r'/usr/',
        r'C:\\',           # Windows paths
        r'\\\\',           # UNC paths
    ]
    
    for pattern in dangerous_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return False
    
    return True
