from datetime import datetime
import enum

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Enum,
)
from sqlalchemy.orm import relationship

from .database import Base


# ============================================================
# 🔹 ENUMS
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
    ID = "id"  # CNI / Passeport
    PAYSLIP = "payslip"  # Fiche de paie
    TAX = "tax"  # Avis d'imposition
    WORK_CONTRACT = "work_contract"
    BANK = "bank"  # RIB / relevé
    OTHER = "other"


class DocQuality(str, enum.Enum):
    OK = "ok"
    UNCLEAR = "unclear"
    INVALID = "invalid"


# ============================================================
# 🔹 CORE SAAS MODELS
# ============================================================

class Agency(Base):
    __tablename__ = "agencies"

    id = Column(Integer, primary_key=True, index=True)

    # ✅ Petite amélioration : nullable=False (une agence doit avoir un nom)
    name = Column(String, unique=True, index=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    # ✅ Identifiant pour le routage email
    email_alias = Column(String, unique=True, nullable=True, index=True)

    # Relations
    users = relationship("User", back_populates="agency")
    settings = relationship("AppSettings", back_populates="agency", uselist=False)

    # ✅ Gestion locative
    tenant_files = relationship(
        "TenantFile",
        back_populates="agency",
        cascade="all, delete-orphan",
    )


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    # ✅ Petite amélioration : nullable=False (un user doit avoir un email)
    email = Column(String, unique=True, index=True, nullable=False)

    # ⚠️ On laisse tel quel (si tu as des users Google sans password, il faudra gérer ça à part)
    hashed_password = Column(String)

    # ✅ Email verification (UNIQUE, pas en double)
    email_verified = Column(Boolean, default=False, nullable=False)
    email_verification_token_hash = Column(String, nullable=True, index=True)
    email_verification_expires_at = Column(DateTime, nullable=True)

    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=True)

    # ✅ On garde String pour éviter migration / changement de type DB
    role = Column(String, default=UserRole.AGENT)

    agency = relationship("Agency", back_populates="users")

    refresh_tokens = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class RefreshToken(Base):
    """
    - On ne stocke JAMAIS le refresh token en clair.
    - On stocke un HASH sha256 (token_hash).
    - Logout = revoked_at rempli.
    """
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    token_hash = Column(String, unique=True, index=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)

    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="refresh_tokens")


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


# ============================================================
# 🔹 GESTION LOCATIVE — DOSSIER LOCATAIRE
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
    risk_level = Column(String, nullable=True)  # "low" / "medium" / "high"

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    agency = relationship("Agency", back_populates="tenant_files")
    email_links = relationship(
        "TenantEmailLink",
        back_populates="tenant_file",
        cascade="all, delete-orphan",
    )
    document_links = relationship(
        "TenantDocumentLink",
        back_populates="tenant_file",
        cascade="all, delete-orphan",
    )


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
