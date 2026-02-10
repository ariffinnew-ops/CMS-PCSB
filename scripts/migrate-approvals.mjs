import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function migrate() {
  // Use rpc to run raw SQL for adding columns
  const sql = `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cms_pcsb_approvals' AND column_name = 'submission_status'
      ) THEN
        ALTER TABLE cms_pcsb_approvals ADD COLUMN submission_status text DEFAULT 'Draft';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cms_pcsb_approvals' AND column_name = 'submitted_by'
      ) THEN
        ALTER TABLE cms_pcsb_approvals ADD COLUMN submitted_by text;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cms_pcsb_approvals' AND column_name = 'submitted_at'
      ) THEN
        ALTER TABLE cms_pcsb_approvals ADD COLUMN submitted_at text;
      END IF;
    END $$;
  `

  const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).single()

  if (error) {
    console.log('RPC exec_sql not available, trying direct approach...')
    
    // Fallback: Try inserting a test row with new columns to see if they exist
    const { data: testData, error: testError } = await supabase
      .from('cms_pcsb_approvals')
      .select('*')
      .limit(1)

    if (testError) {
      console.error('Cannot access cms_pcsb_approvals table:', testError.message)
      process.exit(1)
    }

    console.log('Current columns:', testData?.[0] ? Object.keys(testData[0]) : 'empty table')
    
    // Check if columns already exist
    const cols = testData?.[0] ? Object.keys(testData[0]) : []
    if (cols.includes('submission_status')) {
      console.log('Columns already exist! Migration not needed.')
    } else {
      console.log('New columns not found. Please run this SQL manually in Supabase SQL Editor:')
      console.log(`
ALTER TABLE cms_pcsb_approvals ADD COLUMN submission_status text DEFAULT 'Draft';
ALTER TABLE cms_pcsb_approvals ADD COLUMN submitted_by text;
ALTER TABLE cms_pcsb_approvals ADD COLUMN submitted_at text;
UPDATE cms_pcsb_approvals SET submission_status = 'Approved' WHERE approved_by IS NOT NULL AND approved_by != '';
      `)
    }
  } else {
    console.log('Migration completed successfully!')
    
    // Update existing approved records
    const { error: updateError } = await supabase
      .from('cms_pcsb_approvals')
      .update({ submission_status: 'Approved' })
      .not('approved_by', 'is', null)
      .neq('approved_by', '')

    if (updateError) {
      console.warn('Could not update existing records:', updateError.message)
    } else {
      console.log('Existing approved records migrated.')
    }
  }
}

migrate().catch(console.error)
