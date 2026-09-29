"""Fernet keys derived from a SECRET_KEY, one per purpose.

Kept free of app.config so a backup can be checked against the SECRET_KEY it
carries, which has to work on a new server before any .env exists. The running
app reaches these through app.auth.fernet_for_purpose with its own key.
"""
import base64

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

# Each purpose gets its own label, so one derived key doesn't cross-contaminate
# another and a leaked derived key can't be used to recover SECRET_KEY itself.
MFA_SECRET_PURPOSE = b"ectlogger-mfa-secret-v1"


def fernet_from_secret(secret_key: str, purpose: bytes) -> Fernet:
    key_material = HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=purpose
    ).derive(secret_key.encode())
    return Fernet(base64.urlsafe_b64encode(key_material))
