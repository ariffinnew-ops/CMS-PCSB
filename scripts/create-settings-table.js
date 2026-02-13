import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Try reading from cms_settings first
  const { data, error } = await supabase
    .from("cms_settings")
    .select("*")
    .eq("key", "maintenance_mode")
    .maybeSingle();

  if (error && error.code === "42P01") {
    // Table doesn't exist -- user needs to create it manually
    console.log("TABLE cms_settings DOES NOT EXIST.");
    console.log("Please run this SQL in your Supabase SQL Editor:");
    console.log(`
CREATE TABLE IF NOT EXISTS cms_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT 'false',
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO cms_settings (key, value)
VALUES ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;
    `);
    process.exit(0);
  }

  if (error) {
    console.log("Error reading cms_settings:", error.message, error.code);
    process.exit(1);
  }

  if (!data) {
    // Table exists but no row -- insert it
    const { error: insertErr } = await supabase
      .from("cms_settings")
      .insert({ key: "maintenance_mode", value: "false" });
    if (insertErr) {
      console.log("Error inserting:", insertErr.message);
    } else {
      console.log("Inserted maintenance_mode = false");
    }
  } else {
    console.log("cms_settings already has maintenance_mode =", data.value);
  }
}

main();
