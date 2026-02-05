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
# 🔹 ENUMS MÉTIER
# ============================================================
# Les enums servent à :
# - éviter les fautes de frappe (strings libres)
# - garantir des valeurs cohérentes en base
# - faciliter les règles métier et l’IA
# - garder une cohérence backend / frontend / watcher / IA


class UserRole(str, enum.Enum):
    """
    Rôles possibles pour un utilisateur interne.
    """
    SUPER_ADMIN = "super_admin"      # gestion globale (toi)
    AGENCY_ADMIN = "agency_admin"    # admin d’agence
    AGENT = "agent"                  # agent standard


class TenantFileStatus(str, enum.Enum):
    """
    États possibles d’un dossier locataire.
    """
    NEW = "new"                  # dossier créé, aucun document reçu
    INCOMPLETE = "incomplete"    # documents manquants
    TO_VALIDATE = "to_validate"  # complet, attente validation humaine
    VALIDATED = "validated"      # validé
    REJECTED = "rejected"        # rejeté


class TenantDocType(str, enum.Enum):
    """
    Typologie métier des documents locataires.
    """
    ID = "id"                    # pièce d'identité
    PAYSLIP = "payslip"          # fiche de paie
    TAX = "tax"                  # avis d'imposition
    WORK_CONTRACT = "work_contract"
    BANK = "bank"                # RIB / relevé bancaire
    OTHER = "other"


class DocQuality(str, enum.Enum):
    """
    Qualité estimée d’un document après analyse.
    """
    OK = "ok"
    UNCLEAR = "unclear"
    INVALID = "invalid"


# ============================================================
# 🏢 AGENCE (MULTI-TENANT SAAS)
# ============================================================

class Agency(Base):
    """
    Représente une agence ou un syndic client.

    RGPD :
    - Responsable de traitement
    - Données strictement professionnelles
    """
    __tablename__ = "agencies"

    id = Column(Integer, primary_key=True, index=True)

    # Nom affiché dans l’interface
    name = Column(String, unique=True, index=True, nullable=False)

    # Alias email pour le routage automatique
    # ex: contact+agence123@cipherflow.io
    email_alias = Column(String, unique=True, nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    # Relations
    users = relationship("User", back_populates="agency")
    settings = relationship("AppSettings", back_populates="agency", uselist=False)

    tenant_files = relationship(
        "TenantFile",
        back_populates="agency",
        cascade="all, delete-orphan",
    )


# ============================================================
# 👤 UTILISATEURS
# ============================================================

class User(Base):
    """
    Utilisateur interne d’une agence.

    RGPD :
    - Données minimales
    - Pas de données locataire ici
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    # Email = identifiant principal
    email = Column(String, unique=True, index=True, nullable=False)

    # Profil facultatif
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)

    preferred_language = Column(String, default="fr", nullable=False)
    ui_prefs_json = Column(Text, nullable=True)

    account_status = Column(String, default="active", nullable=False)

    # Mot de passe hashé (jamais le brut)
    hashed_password = Column(String)

    # Vérification email
    email_verified = Column(Boolean, default=False, nullable=False)
    email_verification_token_hash = Column(String, nullable=True, index=True)
    email_verification_expires_at = Column(DateTime, nullable=True)

    # Reset password
    reset_password_token_hash = Column(String, nullable=True, index=True)
    reset_password_expires_at = Column(DateTime, nullable=True)
    reset_password_used_at = Column(DateTime, nullable=True)

    # Lien agence
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=True)
    role = Column(String, default=UserRole.AGENT.value)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    agency = relationship("Agency", back_populates="users")

    refresh_tokens = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )


# ============================================================
# 🔐 REFRESH TOKENS (SÉCURITÉ SESSION)
# ============================================================

class RefreshToken(Base):
    """
    Gestion sécurisée des sessions utilisateur.
    """
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    # Hash du refresh token (jamais stocker le token brut)
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
    """
    Paramétrage fonctionnel et RGPD par agence.
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), unique=True)

    company_name = Column(String, default="Ma Société")
    agent_name = Column(String, default="Assistant IA")
    tone = Column(String, default="pro")
    signature = Column(String, default="Cordialement")
    logo = Column(Text, nullable=True)

    # JSON de configuration RGPD (durées de conservation)
    retention_config_json = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    agency = relationship("Agency", back_populates="settings")


# ============================================================
# 🧠 EMAIL ANALYSIS (AVEC FILTRAGE WATCHER)
# ============================================================

class EmailAnalysis(Base):
    """
    Représente un email reçu et son traitement (IA + métier).
    """
    __tablename__ = "email_analyses"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)

    sender_email = Column(String)
    subject = Column(String)
    raw_email_text = Column(Text)

    # Résultat IA
    is_devis = Column(Boolean, default=False)
    category = Column(String)
    urgency = Column(String)

    summary = Column(Text)
    suggested_title = Column(String)
    suggested_response_text = Column(Text)

    raw_ai_output = Column(Text)

    # Envoi de réponse
    reply_sent = Column(Boolean, default=False)
    reply_sent_at = Column(DateTime, nullable=True)

    # 🔍 Décision du watcher (avant IA)
    filter_decision = Column(String, nullable=True, index=True)
    filter_score = Column(Integer, nullable=True)
    filter_reasons = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


# ============================================================
# 📄 DOCUMENTS ANALYSÉS
# ============================================================

class FileAnalysis(Base):
    """
    Métadonnées des documents analysés.
    Les fichiers réels sont chiffrés sur disque.
    """
    __tablename__ = "file_analyses"

    id = Column(Integer, primary_key=True, index=True)

    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))

    filename = Column(String)
    file_type = Column(String)

    # Empreinte SHA-256 pour éviter les doublons
    file_hash = Column(String, index=True, nullable=True)

    sender = Column(String)
    extracted_date = Column(String)
    amount = Column(String)
    summary = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


# ============================================================
# 🗂️ DOSSIER LOCATAIRE
# ============================================================

class TenantFile(Base):
    """
    Dossier locataire regroupant emails et documents.
    """
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
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

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
    """
    Lien entre un email et un dossier locataire.
    """
    __tablename__ = "tenant_email_links"

    id = Column(Integer, primary_key=True, index=True)
    tenant_file_id = Column(Integer, ForeignKey("tenant_files.id"), index=True, nullable=False)
    email_analysis_id = Column(Integer, ForeignKey("email_analyses.id"), index=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    tenant_file = relationship("TenantFile", back_populates="email_links")
    email = relationship("EmailAnalysis")


class TenantDocumentLink(Base):
    """
    Lien entre un document et un dossier locataire.
    """
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
# 💰 FACTURATION (OPTIONNEL / FUTUR)
# ============================================================

class Invoice(Base):
    """
    Facture liée à une agence.
    (brique encore simple, prête à évoluer)
    """
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=False)

    reference = Column(String, nullable=True)
    amount = Column(String, nullable=True)
    issued_at = Column(DateTime, default=datetime.utcnow)

    created_at = Column(DateTime, default=datetime.utcnow)
