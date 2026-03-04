-- Migration : création table email_feedbacks
CREATE TABLE IF NOT EXISTS email_feedbacks (
    id                SERIAL       PRIMARY KEY,
    email_analysis_id INTEGER      NOT NULL REFERENCES email_analyses(id) ON DELETE CASCADE,
    agency_id         INTEGER      NOT NULL REFERENCES agencies(id)       ON DELETE CASCADE,
    reported_by       INTEGER      REFERENCES users(id)                   ON DELETE SET NULL,
    reason            VARCHAR(255) NOT NULL,
    auto_blacklisted  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_feedbacks_email_analysis_id ON email_feedbacks(email_analysis_id);
CREATE INDEX IF NOT EXISTS idx_email_feedbacks_agency_id         ON email_feedbacks(agency_id);
