import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Try to add basic column
  const { error: e1 } = await supabase.rpc("exec_sql", {
    query: "ALTER TABLE cms_pcsb_master ADD COLUMN IF NOT EXISTS basic numeric DEFAULT 0;"
  });
  if (e1) {
    console.log("Could not add 'basic' via rpc:", e1.message);
    // Try direct REST approach - just test if column exists by selecting it
    const { error: testErr } = await supabase.from("cms_pcsb_master").select("basic").limit(1);
    if (testErr) {
      console.log("Column 'basic' does not exist and could not be added. Will use defaults.");
    } else {
      console.log("Column 'basic' already exists.");
    }
  } else {
    console.log("Added 'basic' column successfully.");
  }

  // Try to add fixed_all column
  const { error: e2 } = await supabase.rpc("exec_sql", {
    query: "ALTER TABLE cms_pcsb_master ADD COLUMN IF NOT EXISTS fixed_all numeric DEFAULT 0;"
  });
  if (e2) {
    console.log("Could not add 'fixed_all' via rpc:", e2.message);
    const { error: testErr2 } = await supabase.from("cms_pcsb_master").select("fixed_all").limit(1);
    if (testErr2) {
      console.log("Column 'fixed_all' does not exist and could not be added. Will use defaults.");
    } else {
      console.log("Column 'fixed_all' already exists.");
    }
  } else {
    console.log("Added 'fixed_all' column successfully.");
  }
}

run();
