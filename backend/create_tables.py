"""
Script de migration — à lancer UNE SEULE FOIS via Railway CLI :
    railway run python create_tables.py

Crée uniquement la table manquante (AgencyEmailConfig).
N'écrase pas les tables existantes.
"""

from app.database.database import engine, Base

# Import des modèles pour que SQLAlchemy les connaisse
from app.database.models import AgencyEmailConfig  # noqa

print("Création des tables manquantes...")
Base.metadata.create_all(bind=engine)
print("✅ Table 'agency_email_configs' créée (ou déjà existante).")