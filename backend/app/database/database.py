import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# 1. Configuration de l'URL
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./sql_app.db"

# Petit fix pour Railway (parfois l'URL commence par postgres:// au lieu de postgresql://)
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# 2. Création du Moteur
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

# 3. Session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. Base (Le socle commun)
Base = declarative_base()

# 5. Dépendance
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()