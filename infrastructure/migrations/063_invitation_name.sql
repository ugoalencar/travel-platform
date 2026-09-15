-- ============================================================
-- INVITATION NAME (Navigable Pilot Flow track, 2026-09-14)
-- ============================================================
-- Staff invitations previously only captured email+role; the invitee
-- typed their own name on the accept-invitation page. Requested
-- directly: the admin should be able to enter the employee's name up
-- front, so the invitee's first-access screen is just "confirm and set
-- a password," not a second registration form. Nullable and additive
-- -- existing PENDING invitations created before this migration simply
-- have no name, and acceptInvitation() falls back to asking for one in
-- that case (see services/api/src/invitations.ts).
-- ============================================================

ALTER TABLE invitations ADD COLUMN IF NOT EXISTS name TEXT;
