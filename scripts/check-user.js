const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fetch all cms_users
const res = await fetch(`${url}/rest/v1/cms_users?select=*`, {
  headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }
});

if (!res.ok) {
  console.log("ERROR:", res.status, await res.text());
} else {
  const data = await res.json();
  console.log("=== cms_users ===");
  console.log("Total users:", data.length);
  console.log("Columns:", data.length > 0 ? Object.keys(data[0]).join(", ") : "N/A");
  for (const u of data) {
    console.log(`  ${u.username} | role=${u.user_level} | project=${u.assigned_project} | pw=${u.password_manual ? "SET" : "EMPTY"} | full_name=${u.full_name}`);
  }
}
