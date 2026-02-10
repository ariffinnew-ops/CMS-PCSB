-- Migration: Add two-stage approval workflow columns to cms_pcsb_approvals
-- Adds: submission_status, submitted_by, submitted_at columns
-- submission_status: 'Draft' | 'Submitted' | 'Approved'

-- Add submission_status column (default 'Draft')
ALTER TABLE cms_pcsb_approvals
ADD COLUMN IF NOT EXISTS submission_status text NOT NULL DEFAULT 'Draft';

-- Add submitted_by column
ALTER TABLE cms_pcsb_approvals
ADD COLUMN IF NOT EXISTS submitted_by text;

-- Add submitted_at column
ALTER TABLE cms_pcsb_approvals
ADD COLUMN IF NOT EXISTS submitted_at text;

-- Migrate existing approved records: set their status to 'Approved'
UPDATE cms_pcsb_approvals
SET submission_status = 'Approved'
WHERE approved_by IS NOT NULL AND approved_by != '';
