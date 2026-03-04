-- Migration : création table agency_blacklists
CREATE TABLE IF NOT EXISTS agency_blacklists (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    pattern VARCHAR(255) NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agency_blacklists_agency_id ON agency_blacklists(agency_id);
