import json
from app import models

DEFAULT_RETENTION_CONFIG = {
    "emails_days": 365,
    "tenant_files_days_after_closure": 365 * 5,
    "file_analyses_days": 365,
}


def create_default_settings_for_agency(db, agency: models.Agency):
    """
    Crée les AppSettings par défaut pour une agence.
    Appelé UNE SEULE FOIS, juste après la création de l'agence.
    """
    settings = models.AppSettings(
        agency_id=agency.id,
        company_name=agency.name or "Ma Société",
        retention_config_json=json.dumps(DEFAULT_RETENTION_CONFIG),
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings
