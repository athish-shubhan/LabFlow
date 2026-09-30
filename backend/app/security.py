import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.config import get_settings

# bcrypt is used directly: passlib is unmaintained and breaks against bcrypt>=4
# (it reads the removed bcrypt.__about__ and trips over the 72-byte limit check).


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        # bcrypt>=5 raises on inputs over 72 bytes instead of silently truncating.
        return False


# Checked against when the email is unknown so response timing doesn't reveal
# which accounts exist.
DUMMY_HASH = hash_password("timing-equaliser")


def create_access_token(user_id: uuid.UUID, org_id: uuid.UUID) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "org_id": str(org_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["sub", "org_id", "exp"]},
    )
