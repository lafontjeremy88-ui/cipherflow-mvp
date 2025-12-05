# backend/database/models.py

from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from sqlalchemy.orm import declarative_base

# Base est la classe de base pour toutes les classes de modèles ORM
Base = declarative_base()

class EmailAnalysis(Base):
    """
    Modèle de base de données pour stocker l'analyse complète d'un email.
    Chaque attribut correspond à une colonne de la table 'email_analyses'.
    """
    __tablename__ = "email_analyses"

    # Données primaires
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=func.now())  # Ajout de la date de création

    # Données de l'email entrant
    sender_email = Column(String, index=True, nullable=False)
    subject = Column(String, nullable=False)
    raw_email_text = Column(String, nullable=False)

    # Données du JSON d'analyse IA
    is_devis = Column(Boolean, nullable=False)
    category = Column(String, nullable=False)  # ex: "demande_devis"
    urgency = Column(String, nullable=False)   # ex: "haute"
    summary = Column(String, nullable=False)

    # Données de la réponse
    suggested_title = Column(String, nullable=False)
    suggested_response_text = Column(String, nullable=False) # Le contenu brut de la réponse professionnelle

    # Pour le débogage/traçage (facultatif mais pro)
    raw_ai_output = Column(String)  # Contenu brut complet retourné par l'IA

    def __repr__(self):
        return f"<EmailAnalysis(id={self.id}, category='{self.category}', sender='{self.sender_email}')>"

# NOTE POUR VOUS : 
# Nous avons ajouté 'raw_email_text' pour stocker le corps de l'email client 
# et 'suggested_response_text' pour stocker la réponse générée.
class AppSettings(Base):
    """
    Stocke la configuration globale du SaaS (une seule ligne prévue).
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, default="CipherFlow")
    agent_name = Column(String, default="Assistant IA")
    tone = Column(String, default="professionnel et empathique") # ex: "strict", "cool", "commercial"
    signature = Column(String, default="L'équipe CipherFlow")

class User(Base):
    """
    Table des utilisateurs autorisés à accéder au SaaS.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String) # On stocke le mot de passe crypté, jamais en clair !