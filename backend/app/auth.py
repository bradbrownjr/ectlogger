import base64
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional
import bcrypt
import pyotp
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from jose import JWTError, jwt
from app.config import settings
from app.logger import logger
from itsdangerous import URLSafeTimedSerializer

serializer = URLSafeTimedSerializer(settings.secret_key)

# Passwords longer than this are rejected at the schema layer (see
# schemas.py) rather than silently truncated -- bcrypt itself ignores
# anything past 72 bytes, so a longer password would still "work" but
# wouldn't mean what the user thinks it means.
MAX_PASSWORD_BYTES = 72

# Industry-standard composition policy (OWASP ASVS / common enterprise AD
# baseline): 12+ characters, at least one of each character class. Applies
# only to self-service/admin-set passwords via PasswordSetRequest -- not to
# admin-issued one-time temporary passwords (generate_temporary_password),
# which are never typed by a human and are replaced on first use.
MIN_PASSWORD_LENGTH = 12
_PASSWORD_SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;:'\",.<>/?`~\\"


def validate_password_strength(password: str) -> Optional[str]:
    """Returns an error message if the password fails the composition
    policy, or None if it passes."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if not any(c.islower() for c in password):
        return "Password must include at least one lowercase letter."
    if not any(c.isupper() for c in password):
        return "Password must include at least one uppercase letter."
    if not any(c.isdigit() for c in password):
        return "Password must include at least one number."
    if not any(c in _PASSWORD_SPECIAL_CHARS for c in password):
        return "Password must include at least one special character."
    return None

MAX_FAILED_PASSWORD_ATTEMPTS = 5
PASSWORD_LOCKOUT_MINUTES = 15
BACKUP_CODE_COUNT = 8

# HKDF-derived from secret_key with a purpose label distinct from any other
# use of secret_key (JWT signing, magic-link tokens), so rotating one
# doesn't cross-contaminate the other and a leaked derived key can't be
# used to recover secret_key itself.
_MFA_SECRET_PURPOSE = b"ectlogger-mfa-secret-v1"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        # Corrupt/foreign hash -- fail closed rather than raise.
        return False


def generate_temporary_password() -> str:
    """Admin-issued reset password, shown once."""
    return secrets.token_urlsafe(12)


def _mfa_fernet() -> Fernet:
    key_material = HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=_MFA_SECRET_PURPOSE
    ).derive(settings.secret_key.encode())
    return Fernet(base64.urlsafe_b64encode(key_material))


def encrypt_mfa_secret(secret: str) -> str:
    return _mfa_fernet().encrypt(secret.encode()).decode()


def decrypt_mfa_secret(token: str) -> Optional[str]:
    """Returns None on any decrypt failure (corrupt data, or secret_key was
    rotated since encryption) -- callers treat that the same as "never
    enrolled" and prompt re-enrollment rather than erroring."""
    try:
        return _mfa_fernet().decrypt(token.encode()).decode()
    except Exception:
        return None


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, account_label: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=account_label, issuer_name=settings.app_name)


def verify_totp_code(secret: str, code: str) -> bool:
    code = (code or "").strip().replace(" ", "")
    if not code:
        return False
    # valid_window=1 tolerates ~30s of clock drift on either side.
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def generate_backup_codes(count: int = BACKUP_CODE_COUNT) -> list[str]:
    return [secrets.token_hex(5) for _ in range(count)]  # 40 bits of entropy each


def hash_backup_code(code: str) -> str:
    # Plain SHA-256, not a slow KDF -- there's nothing to brute-force from a
    # stolen hash of 40 bits of random entropy, unlike a user-chosen password.
    return hashlib.sha256(code.strip().lower().encode()).hexdigest()


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
