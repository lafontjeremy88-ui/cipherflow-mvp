from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from .database import Base
from datetime import datetime
import enum

# --- ÉNUMÉRATION DES RÔLES ---
class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    AGENCY_ADMIN = "agency_admin"
    AGENT = "agent"

# --- TABLE AGENCE (Modifiée pour le routage) ---
class Agency(Base):
    __tablename__ = "agencies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # ✅ NOUVEAU : L'identifiant pour le routage email
    # Permet de router "contact+monalias@gmail.com" vers cette agence
    email_alias = Column(String, unique=True, nullable=True, index=True)
    
    # Relations
    users = relationship("User", back_populates="agency")
    settings = relationship("AppSettings", back_populates="agency", uselist=False)

# --- UTILISATEUR ---
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=True)
    role = Column(String, default=UserRole.AGENT)
    
    agency = relationship("Agency", back_populates="users")

# --- SETTINGS ---
class AppSettings(Base):
    __tablename__ = "app_settings"
    id = Column(Integer, primary_key=True, index=True)
    
    agency_id = Column(Integer, ForeignKey("agencies.id"), unique=True)
    
    company_name = Column(String, default="Ma Société")
    agent_name = Column(String, default="L'Assistant")
    tone = Column(String, default="pro")
    signature = Column(String, default="Cordialement")
    logo = Column(Text, nullable=True)

    agency = relationship("Agency", back_populates="settings")

# --- DONNÉES MÉTIER ---
class EmailAnalysis(Base):
    __tablename__ = "email_analyses"
    id = Column(Integer, primary_key=True, index=True)
    
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
    
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    
    reference = Column(String, index=True)
    client_name = Column(String)
    amount_total = Column(String) 
    date_issued = Column(DateTime, default=datetime.utcnow)
    items_json = Column(Text)

class FileAnalysis(Base):
    __tablename__ = "file_analyses"
    id = Column(Integer, primary_key=True, index=True)
    
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))

    filename = Column(String)
    file_type = Column(String)
    sender = Column(String)
    extracted_date = Column(String)
    amount = Column(String)
    summary = Column(Text)