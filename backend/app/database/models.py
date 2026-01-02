from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from .database import Base
from datetime import datetime
import enum


# ============================================================
# 🔹 ENUMS
# ============================================================

# --- ÉNUMÉRATION DES RÔLES ---
class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    AGENCY_ADMIN = "agency_admin"
    AGENT = "agent"


# --- ÉNUMÉRATION STATUT DOSSIER LOCATAIRE ---
class TenantFileStatus(str, enum.Enum):
    NEW = "new"
    INCOMPLETE = "incomplete"
    TO_VALIDATE = "to_validate"
    VALIDATED = "validated"
    REJECTED = "rejected"


# --- ÉNUMÉRATION TYPE DOCUMENT ---
class TenantDocType(str, enum.Enum):
    ID = "id"                 # CNI / Passeport
    PAYSLIP = "payslip"       # Fiche de paie
    TAX = "tax"               # Avis d'imposition
    WORK_CONTRACT = "work_contract"
    BANK = "bank"             # RIB / relevé
    OTHER = "other"


# --- ÉNUMÉRATION QUALITÉ / VALIDITÉ DOCUMENT ---
class DocQuality(str, enum.Enum):
    OK = "ok"
    UNCLEAR = "unclear"
    INVALID = "invalid"


# ============================================================
# 🔹 CORE SAAS MODELS (EXISTANTS)
# ============================================================

# --- TABLE AGENCE (Modifiée pour le routage) ---
class Agency(Base):
    __tablename__ = "agencies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # ✅ Identifiant pour le routage email
    email_alias = Column(String, unique=True, nullable=True, index=True)

    # Relations
    users = relationship("User", back_populates="agency")
    settings = relationship("AppSettings", back_populates="agency", uselist=False)

    # ✅ NOUVEAU (gestion locative)
    tenant_files = relationship("TenantFile", back_populates="agency", cascade="all, delete-orphan")


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


# --- DONNÉES MÉTIER : EMAILS ANALYSÉS ---
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


# --- DONNÉES MÉTIER : QUITTANCES / FACTURES ---
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


# --- DONNÉES MÉTIER : FICHIERS ANALYSÉS ---
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


# ============================================================
# 🔹 GESTION LOCATIVE (NOUVEAU) — DOSSIER LOCATAIRE
# ============================================================

class TenantFile(Base):
    __tablename__ = "tenant_files"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True, nullable=False)

    # Métier
    status = Column(Enum(TenantFileStatus), default=TenantFileStatus.NEW, nullable=False)
    candidate_email = Column(String, index=True, nullable=True)
    candidate_name = Column(String, nullable=True)

    # Checklist & risque (JSON string pour rester simple)
    checklist_json = Column(Text, nullable=True)  # ex: {"missing":["tax"],"received":["id"]}
    risk_level = Column(String, nullable=True)    # "low" / "medium" / "high"

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    agency = relationship("Agency", back_populates="tenant_files")
    email_links = relationship("TenantEmailLink", back_populates="tenant_file", cascade="all, delete-orphan")
    document_links = relationship("TenantDocumentLink", back_populates="tenant_file", cascade="all, delete-orphan")


class TenantEmailLink(Base):
    __tablename__ = "tenant_email_links"

    id = Column(Integer, primary_key=True, index=True)
    tenant_file_id = Column(Integer, ForeignKey("tenant_files.id"), index=True, nullable=False)
    email_analysis_id = Column(Integer, ForeignKey("email_analyses.id"), index=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    tenant_file = relationship("TenantFile", back_populates="email_links")
    email = relationship("EmailAnalysis")


class TenantDocumentLink(Base):
    __tablename__ = "tenant_document_links"

    id = Column(Integer, primary_key=True, index=True)
    tenant_file_id = Column(Integer, ForeignKey("tenant_files.id"), index=True, nullable=False)
    file_analysis_id = Column(Integer, ForeignKey("file_analyses.id"), index=True, nullable=False)

    doc_type = Column(Enum(TenantDocType), default=TenantDocType.OTHER, nullable=False)
    quality = Column(Enum(DocQuality), default=DocQuality.OK, nullable=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    tenant_file = relationship("TenantFile", back_populates="document_links")
    file = relationship("FileAnalysis")
