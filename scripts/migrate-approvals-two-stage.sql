-- Migration: Add two-stage approval workflow columns to cms_pcsb_approvals
-- Adds: submission_status, submitted_by, submitted_at columns
-- submission_status: 'Draft' | 'Submitted' | 'Approved'

DO $$
BEGIN
  -- Add submission_status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cms_pcsb_approvals' AND column_name = 'submission_status'
  ) THEN
    ALTER TABLE cms_pcsb_approvals ADD COLUMN submission_status text DEFAULT 'Draft';
  END IF;

  -- Add submitted_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cms_pcsb_approvals' AND column_name = 'submitted_by'
  ) THEN
    ALTER TABLE cms_pcsb_approvals ADD COLUMN submitted_by text;
  END IF;

  -- Add submitted_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cms_pcsb_approvals' AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE cms_pcsb_approvals ADD COLUMN submitted_at text;
  END IF;
END $$;

-- Migrate existing approved records: set their status to 'Approved'
UPDATE cms_pcsb_approvals
SET submission_status = 'Approved'
WHERE approved_by IS NOT NULL AND approved_by != '' AND (submission_status IS NULL OR submission_status = 'Draft');
