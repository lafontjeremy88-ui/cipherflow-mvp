# backend/app/database/models.py

from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from sqlalchemy.orm import declarative_base

# Base est la classe de base pour toutes les classes de modèles ORM
Base = declarative_base()

class EmailAnalysis(Base):
    """
    Modèle de base de données pour stocker l'analyse complète d'un email.
    """
    __tablename__ = "email_analyses"

    # Données primaires
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=func.now())

    # Données de l'email entrant
    sender_email = Column(String, index=True, nullable=False)
    subject = Column(String, nullable=False)
    raw_email_text = Column(String, nullable=False)

    # Données du JSON d'analyse IA
    is_devis = Column(Boolean, nullable=False)
    category = Column(String, nullable=False)
    urgency = Column(String, nullable=False)
    summary = Column(String, nullable=False)

    # Données de la réponse
    suggested_title = Column(String, nullable=False)
    suggested_response_text = Column(String, nullable=False)

    # Pour le débogage
    raw_ai_output = Column(String)

    def __repr__(self):
        return f"<EmailAnalysis(id={self.id}, category='{self.category}')>"

class AppSettings(Base):
    """
    Stocke la configuration globale du SaaS.
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, default="CipherFlow")
    agent_name = Column(String, default="Assistant IA")
    tone = Column(String, default="professionnel et empathique")
    signature = Column(String, default="L'équipe CipherFlow")

class User(Base):
    """
    Table des utilisateurs autorisés.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)

# --- NOUVEAUTÉ : LA BRIQUE A (FACTURES) ---
class Invoice(Base):
    """
    Table pour stocker l'historique des factures générées.
    """
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String, unique=True, index=True)  # Ex: FAC-001
    client_name = Column(String)
    amount_total = Column(String) # On stocke en texte pour simplifier (ex: "100.00")
    date_issued = Column(DateTime, default=func.now())
    status = Column(String, default="émise") # émise, brouillon, annulée
    items_json = Column(String) # On stocke la liste des articles en format JSON texte