import os
from pathlib import Path

from sqlalchemy import URL, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("PROPERTY_PULSE_DATA_DIR", BACKEND_DIR / "data"))
UPLOAD_DIR = Path(os.getenv("PROPERTY_PULSE_UPLOAD_DIR", BACKEND_DIR / "uploads"))
REPORT_DIR = DATA_DIR / "reports"
MODEL_DIR = Path(os.getenv("PROPERTY_PULSE_MODEL_DIR", BACKEND_DIR / "models"))
DB_PATH = DATA_DIR / "propertypulse.sqlite"

for directory in (DATA_DIR, UPLOAD_DIR, REPORT_DIR, MODEL_DIR):
    directory.mkdir(parents=True, exist_ok=True)

database_url = os.getenv("DATABASE_URL")
if database_url:
    engine = create_engine(database_url, pool_pre_ping=True)
else:
    engine = create_engine(
        URL.create("sqlite", database=str(DB_PATH)),
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
