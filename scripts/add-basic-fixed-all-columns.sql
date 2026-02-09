-- Add basic salary and fixed_all columns to cms_pcsb_master
-- basic = monthly basic salary (numeric)
-- fixed_all = fixed monthly allowance (numeric)

ALTER TABLE cms_pcsb_master ADD COLUMN IF NOT EXISTS basic numeric DEFAULT 0;
ALTER TABLE cms_pcsb_master ADD COLUMN IF NOT EXISTS fixed_all numeric DEFAULT 0;
