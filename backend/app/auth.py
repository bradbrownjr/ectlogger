from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings
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
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def verify_token(token: str):
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
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
