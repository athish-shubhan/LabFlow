import logging

from fastapi import APIRouter, FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.db import engine
from app.errors import register_error_handlers
from app.routers import auth, experiments, organizations, projects, samples

app = FastAPI(title="LabFlow API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_error_handlers(app)

api = APIRouter(prefix="/api")
for module in (auth, organizations, projects, experiments, samples):
    api.include_router(module.router)
app.include_router(api)


@app.get("/health", tags=["meta"], responses={503: {"description": "Database unreachable"}})
def health(response: Response) -> dict[str, str]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logging.getLogger("labflow").warning("health check: database unreachable", exc_info=True)
        response.status_code = 503
        return {"status": "unavailable", "database": "unreachable"}
    return {"status": "ok"}
