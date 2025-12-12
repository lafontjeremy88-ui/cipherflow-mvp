from sqlalchemy import Column, Integer, String, Boolean, DateTime, func, ForeignKey
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class EmailAnalysis(Base):
    __tablename__ = "email_analyses"
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=func.now())
    sender_email = Column(String, index=True, nullable=False)
    subject = Column(String, nullable=False)
    raw_email_text = Column(String, nullable=False)
    is_devis = Column(Boolean, nullable=False)
    category = Column(String, nullable=False)
    urgency = Column(String, nullable=False)
    summary = Column(String, nullable=False)
    suggested_title = Column(String, nullable=False)
    suggested_response_text = Column(String, nullable=False)
    raw_ai_output = Column(String)

class AppSettings(Base):
    __tablename__ = "app_settings"
    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, default="CipherFlow")
    agent_name = Column(String, default="Assistant IA")
    tone = Column(String, default="professionnel et empathique")
    signature = Column(String, default="L'équipe CipherFlow")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)

class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String, unique=True, index=True)
    client_name = Column(String)
    amount_total = Column(String)
    date_issued = Column(DateTime, default=func.now())
    status = Column(String, default="émise")
    items_json = Column(String)
    owner_id = Column(Integer, ForeignKey("users.id"))

# --- NOUVELLE TABLE (Bien séparée cette fois) ---
class FileAnalysis(Base):
    __tablename__ = "file_analyses"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    file_type = Column(String)
    sender = Column(String)
    extracted_date = Column(String)
    amount = Column(String)
    summary = Column(String)
    upload_date = Column(DateTime, default=func.now())
    owner_id = Column(Integer, ForeignKey("users.id"))