import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# 1. Configuration de l'URL
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./sql_app.db" # Fallback local

# 2. Création du Moteur
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

# 3. Création de la Session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. DÉFINITION DE LA BASE (C'est ici qu'elle naît !)
Base = declarative_base()

# 5. Fonction pour récupérer la DB
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 6. Fonction pour créer les tables
def create_tables():
    # ASTUCE ANTI-CRASH : On importe les modèles UNIQUEMENT au moment de créer les tables
    # Cela empêche le problème "Circular Import"
    from app.database import models 
    Base.metadata.create_all(bind=engine)