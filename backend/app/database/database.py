# backend/database/database.py

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .models import Base  # Importe la Base que nous avons définie

# 1. Configuration de l'URL de la base de données
# Nous utilisons un fichier SQLite nommé 'cipherflow.db' dans le même répertoire.
SQLALCHEMY_DATABASE_URL = "sqlite:///./cipherflow.db"

# 2. Création de l'Engine (Moteur)
# 'connect_args' est nécessaire UNIQUEMENT pour SQLite pour permettre plusieurs threads
# de se connecter à la même base de données.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# 3. Création de la Session Locale
# SessionLocal est la classe que nous utiliserons pour créer une session de base de données.
# Elle est "autocommit=False" et "autoflush=False" par défaut.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. Fonction pour créer les tables
# Elle vérifie si les tables existent et les crée si ce n'est pas le cas.
def create_tables():
    """Crée toutes les tables définies dans Base (models.py) si elles n'existent pas."""
    Base.metadata.create_all(bind=engine)

# 5. Fonction de Dépendance pour FastAPI
# C'est une fonction 'generator' que FastAPI utilisera pour gérer la connexion
# à la base de données par requête (appelée Dependency Injection).
def get_db():
    """
    Fournit une session de base de données, s'assure qu'elle est fermée
    après que la requête ait été traitée.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()