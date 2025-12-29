from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from .database import Base
from datetime import datetime
import enum

# --- ÉNUMÉRATION DES RÔLES ---
class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"  # Toi (pour gérer tout le SaaS)
    AGENCY_ADMIN = "agency_admin" # Le patron de l'agence
    AGENT = "agent"               # L'employé de l'agence

# --- TABLE AGENCE (Le Coeur du Système) ---
class Agency(Base):
    __tablename__ = "agencies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True) # Ex: "Century 21 Arveyres"
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Configuration technique spécifique à l'agence (Optionnel mais recommandé)
    # email_ingestion_alias = Column(String) # Ex: "century21@cipherflow.com"
    
    # Relations
    users = relationship("User", back_populates="agency")
    settings = relationship("AppSettings", back_populates="agency", uselist=False)
    # On pourra ajouter les relations invoices/emails plus tard si besoin

# --- UTILISATEUR (Modifié) ---
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    # NOUVEAU : Lien vers l'agence + Rôle
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=True) # Nullable pour le SuperAdmin
    role = Column(String, default=UserRole.AGENT) # Stocké en string pour simplicité
    
    agency = relationship("Agency", back_populates="users")

# --- SETTINGS (Lié à l'Agence, plus "Global") ---
class AppSettings(Base):
    __tablename__ = "app_settings"
    id = Column(Integer, primary_key=True, index=True)
    
    # NOUVEAU : Chaque agence a ses propres settings
    agency_id = Column(Integer, ForeignKey("agencies.id"), unique=True)
    
    company_name = Column(String, default="Ma Société")
    agent_name = Column(String, default="L'Assistant")
    tone = Column(String, default="pro")
    signature = Column(String, default="Cordialement")
    logo = Column(Text, nullable=True)

    agency = relationship("Agency", back_populates="settings")

# --- DONNÉES MÉTIER (Isolées par Agence) ---
# Astuce : On lie à l'agence, pas juste à l'user. 
# Si un agent part, l'agence garde les données.

class EmailAnalysis(Base):
    __tablename__ = "email_analyses"
    id = Column(Integer, primary_key=True, index=True)
    
    # NOUVEAU : Cloisonnement
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    sender_email = Column(String)
    subject = Column(String)
    raw_email_text = Column(Text)
    is_devis = Column(Boolean, default=False)
    category = Column(String)
    urgency = Column(String)
    summary = Column(Text)
    suggested_title = Column(String)
    suggested_response_text = Column(Text)
    raw_ai_output = Column(Text)

class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(Integer, primary_key=True, index=True)
    
    # NOUVEAU : Cloisonnement + Qui l'a créé
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)
    owner_id = Column(Integer, ForeignKey("users.id")) # L'agent qui a cliqué
    
    reference = Column(String, index=True)
    client_name = Column(String)
    amount_total = Column(String) 
    date_issued = Column(DateTime, default=datetime.utcnow)
    items_json = Column(Text)

class FileAnalysis(Base):
    __tablename__ = "file_analyses"
    id = Column(Integer, primary_key=True, index=True)
    
    # NOUVEAU : Cloisonnement
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))

    filename = Column(String)
    file_type = Column(String)
    sender = Column(String)
    extracted_date = Column(String)
    amount = Column(String)
    summary = Column(Text)