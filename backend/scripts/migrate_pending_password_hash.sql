-- =============================================================================
-- Migration: Add pending_password_hash to users and email_otps
-- Supports: PostgreSQL and SQLite (nullable, no backfill)
-- =============================================================================

-- For PostgreSQL:
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_password_hash VARCHAR(255);
ALTER TABLE email_otps ADD COLUMN IF NOT EXISTS pending_password_hash VARCHAR(255);

-- For SQLite (run if columns do not exist yet):
-- ALTER TABLE users ADD COLUMN pending_password_hash VARCHAR(255);
-- ALTER TABLE email_otps ADD COLUMN pending_password_hash VARCHAR(255);

