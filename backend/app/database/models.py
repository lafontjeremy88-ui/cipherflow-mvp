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
    """
    RGPD :
    - Données : infos d'identification de l'agence / syndic.
    - Finalité : gestion du compte client (responsable de traitement).
    - Base légale : exécution du contrat (SaaS).
    - Conservation : pendant la relation contractuelle + quelques années (à définir au niveau contrat).
    """
    __tablename__ = "agencies"

    id = Column(Integer, primary_key=True, index=True)

    # ✅ Petite amélioration : nullable=False (une agence doit avoir un nom)
    name = Column(String, unique=True, index=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

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
    """
    RGPD :
    - Données : email pro, nom/prénom, préférences UI, statut de compte.
    - Finalité : gestion des accès à la plateforme pour le compte du client (agence/syndic).
    - Base légale : exécution du contrat (compte utilisateur).
    - Conservation : pendant la durée du contrat + délai de prescription (à préciser dans contrat).
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    # ✅ Petite amélioration : nullable=False (un user doit avoir un email)
    email = Column(String, unique=True, index=True, nullable=False)

    # ✅ Profil
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)

    preferred_language = Column(String, default="fr", nullable=False)
    ui_prefs_json = Column(Text, nullable=True)

    account_status = Column(String, default="active", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # ⚠️ On laisse tel quel (si tu as des users Google sans password, il faudra gérer ça à part)
    hashed_password = Column(String)

    # ✅ Email verification (UNIQUE, pas en double)
    email_verified = Column(Boolean, default=False, nullable=False)
    email_verification_token_hash = Column(String, nullable=True, index=True)
    email_verification_expires_at = Column(DateTime, nullable=True)

    # ✅ Password reset (forgot/reset password)
    reset_password_token_hash = Column(String, nullable=True, index=True)
    reset_password_expires_at = Column(DateTime, nullable=True)
    reset_password_used_at = Column(DateTime, nullable=True)

    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=True)

    # ✅ On garde String pour éviter migration / changement de type DB
    role = Column(String, default=UserRole.AGENT.value)

    agency = relationship("Agency", back_populates="users")

    refresh_tokens = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class RefreshToken(Base):
    """
    RGPD :
    - Données : hash de refresh token, horodatages, statut.
    - Finalité : gestion sécurisée des sessions (authentification).
    - Base légale : intérêt légitime (sécurisation des accès).
    - Conservation : durée de vie technique du token + logs de sécurité (à définir).
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
    """
    RGPD :
    - Données : paramètres fonctionnels & UI au niveau agence.
    - Finalité : personnalisation du service pour le compte du client.
    - Base légale : exécution du contrat.
    - Conservation : pendant la durée du contrat.
    - Inclut un champ JSON pour configurer les durées de conservation (retention_config_json).
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), unique=True)

    company_name = Column(String, default="Ma Société")
    agent_name = Column(String, default="L'Assistant")
    tone = Column(String, default="pro")
    signature = Column(String, default="Cordialement")
    logo = Column(Text, nullable=True)

    # ✅ Timestamps de configuration
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # ✅ Configuration RGPD : durées de conservation par type de donnée (JSON)
    # Exemple:
    # {
    #   "emails_days": 365,
    #   "tenant_files_days_after_closure": 1825,
    #   "uploads_days": 180
    # }
    retention_config_json = Column(Text, nullable=True)

    agency = relationship("Agency", back_populates="settings")


class EmailAnalysis(Base):
    """
    RGPD :
    - Données : contenu d'email, résumé, classification IA.
    - Finalité : aide à la gestion des emails pour le compte de l'agence/syndic.
    - Base légale : exécution du contrat avec les clients finaux (via le syndic).
    - Conservation : limitée dans le temps ; possibilité de supprimer le corps tout en gardant les stats.
    """
    __tablename__ = "email_analyses"

    id = Column(Integer, primary_key=True, index=True)

    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

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
    reply_sent = Column(Boolean, default=False)
    # ✅ Nullable=True car une analyse peut exister sans qu'une réponse ait été envoyée
    reply_sent_at = Column(DateTime, nullable=True)


class Invoice(Base):
    """
    RGPD :
    - Données : facturation, identifiants de clients, montants.
    - Finalité : gestion comptable et facturation.
    - Base légale : obligation légale + exécution du contrat.
    - Conservation : en général 10 ans pour la comptabilité (à confirmer avec l'expert comptable).
    """
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)

    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))

    reference = Column(String, index=True)
    client_name = Column(String)
    amount_total = Column(String)
    date_issued = Column(DateTime, default=datetime.utcnow, nullable=False)
    items_json = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class FileAnalysis(Base):
    """
    RGPD :
    - Données : métadonnées de documents analysés (souvent très sensibles :
      fiches de paie, avis d'imposition, etc.).
    - Finalité : aide à l'analyse des documents locataires.
    - Base légale : exécution du contrat (gestion locative).
    - Conservation : limitée au strict nécessaire (période à définir puis purge).
    """
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

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# ============================================================
# 🔹 GESTION LOCATIVE — DOSSIER LOCATAIRE
# ============================================================

class TenantFile(Base):
    """
    RGPD :
    - Données : infos locataire (nom, email, statut du dossier, risque, check-list).
    - Finalité : gestion du dossier locataire pour le compte de l'agence/syndic.
    - Base légale : exécution du contrat de location / gestion locative.
    - Conservation : tant que le dossier est actif, puis X années après la clôture
      (champ is_closed/closed_at pour déclencher la conservation post-contractuelle).
    """
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

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # ✅ Clôture du dossier (pour les règles de conservation)
    is_closed = Column(Boolean, default=False, nullable=False)
    closed_at = Column(DateTime, nullable=True)

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
    """
    RGPD :
    - Données : lien entre un email et un dossier locataire.
    - Finalité : traçabilité des échanges pour la gestion du dossier.
    - Conservation : alignée sur celle du TenantFile lié.
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
    RGPD :
    - Données : lien entre un document analysé et un dossier locataire (type, qualité, notes).
    - Finalité : gestion et validation des pièces du dossier locataire.
    - Conservation : alignée sur celle du TenantFile et des règles de conservation des documents.
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
