import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None:
        raise _unauthorized("Not authenticated")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
        org_id = uuid.UUID(payload["org_id"])
    except jwt.PyJWTError, ValueError, KeyError:
        raise _unauthorized("Invalid or expired token") from None

    user = db.get(User, user_id)
    if user is None or user.org_id != org_id:
        raise _unauthorized("Invalid or expired token")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
