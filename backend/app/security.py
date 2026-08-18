"""
Security utilities for input sanitization and validation
"""
import html
import re
from typing import Optional
from fastapi import Request

# Every proxy hop we run ourselves. The backend binds 127.0.0.1 in production
# (see copilot-instructions.md's deployment notes), so Caddy is always the
# immediate peer and is the only thing that can reach the backend directly.
_TRUSTED_PROXIES = {"127.0.0.1", "::1"}


def get_client_ip(request: Request) -> str:
    """
    Extract the client IP address from a request, for logging and Fail2Ban.

    Only trusts X-Forwarded-For / X-Real-IP when the immediate peer is one of
    our own reverse proxies, and takes the LAST X-Forwarded-For entry rather
    than the first. Caddy's reverse_proxy *appends* the peer it actually saw
    to whatever X-Forwarded-For the client sent rather than replacing it, so
    a request from 9.9.9.9 carrying a forged "X-Forwarded-For: 1.2.3.4"
    arrives here as "1.2.3.4, 9.9.9.9". Reading the first entry lets an
    attacker choose which IP gets banned; the rightmost entry is the one our
    own proxy vouched for. If the peer isn't a trusted proxy, the headers are
    ignored entirely and the socket address is used, since a direct
    connection has no reason to be believed about who it is.
    """
    peer = request.client.host if request.client else None
    if peer not in _TRUSTED_PROXIES:
        return peer or "unknown"

    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
        if hops:
            return hops[-1]

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    return peer or "unknown"


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
