from datetime import datetime
import enum

from sqlalchemy import (
    Column, Integer, String, Boolean,
    DateTime, ForeignKey, Text, Enum,
)
from sqlalchemy.orm import relationship

from .database import Base


# ============================================================
# 🔹 ENUMS MÉTIER
# ============================================================

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    AGENCY_ADMIN = "agency_admin"
    AGENT = "agent"


class TenantFileStatus(str, enum.Enum):
    NEW = "new"
    INCOMPLETE = "incomplete"
    TO_VALIDATE = "to_validate"
    VALIDATED = "validated"
    REJECTED = "rejected"


class TenantDocType(str, enum.Enum):
    ID = "id"
    PAYSLIP = "payslip"
    TAX = "tax"
    WORK_CONTRACT = "work_contract"
    ADDRESS_PROOF = "address_proof"
    BANK = "bank"
    OTHER = "other"


class DocQuality(str, enum.Enum):
    OK = "ok"
    UNCLEAR = "unclear"
    INVALID = "invalid"


# ============================================================
# 🏢 AGENCE (MULTI-TENANT SAAS)
# ============================================================

class Agency(Base):
    __tablename__ = "agencies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    email_alias = Column(String, unique=True, nullable=True, index=True)
    last_watcher_heartbeat = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    users = relationship("User", back_populates="agency")
    settings = relationship("AppSettings", back_populates="agency", uselist=False)
    email_config = relationship("AgencyEmailConfig", back_populates="agency", uselist=False)
    tenant_files = relationship("TenantFile", back_populates="agency", cascade="all, delete-orphan")


# ============================================================
# 📬 CONFIGURATION EMAIL IMAP PAR AGENCE  ← NOUVEAU
# ============================================================

class AgencyEmailConfig(Base):
    """
    Credentials IMAP par agence.
    Permet au watcher multi-tenant de surveiller
    une boîte email dédiée par agence.
    """
    __tablename__ = "agency_email_configs"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), unique=True, nullable=False, index=True)

    # ── Activation ─────────────────────────────────────────
    enabled = Column(Boolean, default=False, nullable=False)

    # ── IMAP ───────────────────────────────────────────────
    imap_host = Column(String, nullable=True)          # ex: imap.gmail.com
    imap_port = Column(Integer, default=993)
    imap_user = Column(String, nullable=True)          # adresse email
    imap_password_encrypted = Column(Text, nullable=True)  # mot de passe chiffré Fernet

    # ── Email sortant (optionnel) ──────────────────────────
    from_email = Column(String, nullable=True)         # adresse affichée dans les réponses

    # ── Gmail OAuth ────────────────────────────────────────
    gmail_access_token  = Column(Text, nullable=True)
    gmail_refresh_token = Column(Text, nullable=True)
    gmail_token_expiry  = Column(DateTime, nullable=True)
    gmail_email         = Column(String, nullable=True)  # adresse Gmail connectée

    # ── Outlook OAuth ───────────────────────────────────────
    outlook_access_token  = Column(Text, nullable=True)
    outlook_refresh_token = Column(Text, nullable=True)
    outlook_token_expiry  = Column(DateTime, nullable=True)
    outlook_email         = Column(String, nullable=True)  # adresse Outlook connectée

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    agency = relationship("Agency", back_populates="email_config")


# ============================================================
# 👤 UTILISATEURS
# ============================================================

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    preferred_language = Column(String, default="fr", nullable=False)
    ui_prefs_json = Column(Text, nullable=True)
    account_status = Column(String, default="active", nullable=False)
    hashed_password = Column(String)
    email_verified = Column(Boolean, default=False, nullable=False)
    email_verification_token_hash = Column(String, nullable=True, index=True)
    email_verification_expires_at = Column(DateTime, nullable=True)
    reset_password_token_hash = Column(String, nullable=True, index=True)
    reset_password_expires_at = Column(DateTime, nullable=True)
    reset_password_used_at = Column(DateTime, nullable=True)
    terms_accepted_at = Column(DateTime, nullable=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=True)
    role = Column(String, default=UserRole.AGENT.value)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    agency = relationship("Agency", back_populates="users")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")


# ============================================================
# 🔐 REFRESH TOKENS
# ============================================================

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    token_hash = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="refresh_tokens")


# ============================================================
# ⚙️ PARAMÈTRES APPLICATION (PAR AGENCE)
# ============================================================

class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), unique=True)
    company_name = Column(String, default="Ma Société")
    agent_name = Column(String, default="Assistant IA")
    tone = Column(String, default="pro")
    signature = Column(String, default="Cordialement")
    logo = Column(Text, nullable=True)
    retention_config_json = Column(Text, nullable=True)
    auto_reply_enabled        = Column(Boolean, default=False, nullable=False)
    auto_reply_delay_minutes  = Column(Integer, default=0,     nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    agency = relationship("Agency", back_populates="settings")


# ============================================================
# 🧠 EMAIL ANALYSIS
# ============================================================

class EmailAnalysis(Base):
    __tablename__ = "email_analyses"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)
    sender_email = Column(String)
    subject = Column(String)
    is_devis = Column(Boolean, default=False)
    category = Column(String)
    urgency = Column(String)
    summary = Column(Text)
    suggested_title = Column(String)
    suggested_response_text = Column(Text)
    raw_ai_output = Column(Text)
    reply_sent = Column(Boolean, default=False)
    reply_sent_at = Column(DateTime, nullable=True)
    filter_decision = Column(String, nullable=True, index=True)
    filter_score = Column(Integer, nullable=True)
    filter_reasons = Column(Text, nullable=True)
    # ── Tracking pipeline ──────────────────────────────────────────────────────
    # Valeurs possibles : "pending" | "processing" | "success" | "failed"
    processing_status = Column(String, default="pending", nullable=False, index=True)
    processed_at = Column(DateTime, nullable=True)
    processing_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# ============================================================
# 📄 DOCUMENTS ANALYSÉS
# ============================================================

class FileAnalysis(Base):
    __tablename__ = "file_analyses"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    filename = Column(String)
    file_type = Column(String)
    file_hash = Column(String, index=True, nullable=True)
    sender = Column(String)
    extracted_date = Column(String)
    amount = Column(String)
    summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# ============================================================
# 🗂️ DOSSIER LOCATAIRE
# ============================================================

class TenantFile(Base):
    __tablename__ = "tenant_files"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True, nullable=False)
    status = Column(Enum(TenantFileStatus), default=TenantFileStatus.NEW, nullable=False)
    candidate_email = Column(String, index=True, nullable=True)
    candidate_name = Column(String, nullable=True)
    checklist_json = Column(Text, nullable=True)
    risk_level = Column(String, nullable=True)
    is_closed = Column(Boolean, default=False, nullable=False)
    closed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    agency = relationship("Agency", back_populates="tenant_files")
    email_links = relationship("TenantEmailLink", back_populates="tenant_file", cascade="all, delete-orphan")
    document_links = relationship("TenantDocumentLink", back_populates="tenant_file", cascade="all, delete-orphan")


class TenantEmailLink(Base):
    __tablename__ = "tenant_email_links"

    id = Column(Integer, primary_key=True, index=True)
    tenant_file_id = Column(Integer, ForeignKey("tenant_files.id"), index=True, nullable=False)
    email_analysis_id = Column(Integer, ForeignKey("email_analyses.id"), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    tenant_file = relationship("TenantFile", back_populates="document_links")
    file = relationship("FileAnalysis")


# ============================================================
# 🚫 BLACKLIST PERSONNALISÉE PAR AGENCE
# ============================================================

class AgencyBlacklist(Base):
    __tablename__ = "agency_blacklists"

    id         = Column(Integer, primary_key=True)
    agency_id  = Column(Integer, ForeignKey("agencies.id"), nullable=False, index=True)
    pattern    = Column(String(255), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    agency = relationship("Agency")


# ============================================================
# ⚠️ FEEDBACK EMAIL (signalement erreur de classification)
# ============================================================

class EmailFeedback(Base):
    __tablename__ = "email_feedbacks"

    id                = Column(Integer, primary_key=True)
    email_analysis_id = Column(Integer, ForeignKey("email_analyses.id"), nullable=False, index=True)
    agency_id         = Column(Integer, ForeignKey("agencies.id"),         nullable=False, index=True)
    reported_by       = Column(Integer, ForeignKey("users.id"),            nullable=True)
    reason            = Column(String(255), nullable=False)
    auto_blacklisted  = Column(Boolean, default=False, nullable=False)
    created_at        = Column(DateTime, default=datetime.utcnow, nullable=False)


# ============================================================
# 💰 FACTURATION
# ============================================================

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=False)
    reference = Column(String, nullable=True)
    amount = Column(String, nullable=True)
    issued_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)