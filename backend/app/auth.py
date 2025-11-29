from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings
from app.logger import logger
from itsdangerous import URLSafeTimedSerializer

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
serializer = URLSafeTimedSerializer(settings.secret_key)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    logger.debug("AUTH", f"Creating JWT with payload: {to_encode}")
    logger.debug("AUTH", f"Using algorithm: {settings.algorithm}")
    logger.debug("AUTH", f"Using secret key (first 10 chars): {settings.secret_key[:10]}...")
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    logger.debug("AUTH", f"JWT created: {encoded_jwt[:30]}...{encoded_jwt[-20:]}")
    return encoded_jwt


def verify_token(token: str, client_ip: str = None):
    try:
        logger.debug("AUTH", "Attempting to decode token...")
        logger.debug("AUTH", f"Algorithm: {settings.algorithm}")
        logger.debug("AUTH", f"Secret key (first 10 chars): {settings.secret_key[:10]}...")
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        logger.debug("AUTH", f"Token decoded successfully: {payload}")
        return payload
    except JWTError as e:
        if client_ip:
            logger.auth_failure(f"JWT decode error: {type(e).__name__}: {str(e)}", client_ip)
        else:
            logger.warning("AUTH", f"JWT decode error: {type(e).__name__}: {str(e)}")
        return None
    except Exception as e:
        if client_ip:
            logger.auth_failure(f"Unexpected error decoding token: {type(e).__name__}: {str(e)}", client_ip)
        else:
            logger.error("AUTH", f"Unexpected error decoding token: {type(e).__name__}: {str(e)}")
        return None


def create_magic_link_token(email: str) -> str:
    """Create a magic link token that expires based on config setting"""
    return serializer.dumps(email, salt='magic-link')


def verify_magic_link_token(token: str, max_age: int = None) -> Optional[str]:
    """Verify magic link token with configurable expiry"""
    from app.config import settings
    if max_age is None:
        max_age = settings.magic_link_expire_days * 24 * 60 * 60  # Convert days to seconds
    try:
        email = serializer.loads(token, salt='magic-link', max_age=max_age)
        return email
    except:
        return None
