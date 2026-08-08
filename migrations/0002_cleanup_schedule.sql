CREATE INDEX IF NOT EXISTS reading_guest_cleanup_idx
ON reading_operations(expires_at)
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS share_active_idx
ON share_snapshots(expires_at)
WHERE revoked_at IS NULL;
