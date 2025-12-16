from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from .database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)

class AppSettings(Base):
    __tablename__ = "app_settings"
    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, default="CipherFlow")
    agent_name = Column(String, default="Sophie")
    tone = Column(String, default="pro")
    signature = Column(String, default="L'équipe")
    logo = Column(Text, nullable=True)  # <-- C'est ici que 'Text' est utilisé

class EmailAnalysis(Base):
    __tablename__ = "email_analyses"
    id = Column(Integer, primary_key=True, index=True)
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
    reference = Column(String, index=True)
    client_name = Column(String)
    amount_total = Column(String)  # Note: on l'avait peut-être passé en Float ou String selon votre choix
    date_issued = Column(DateTime, default=datetime.utcnow)
    items_json = Column(Text)
    owner_id = Column(Integer, ForeignKey("users.id"))

class FileAnalysis(Base):
    __tablename__ = "file_analyses"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    file_type = Column(String)
    sender = Column(String)
    extracted_date = Column(String)
    amount = Column(String)
    summary = Column(Text)
    owner_id = Column(Integer, ForeignKey("users.id"))