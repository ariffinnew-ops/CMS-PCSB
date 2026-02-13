const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== Checking cms_users with ANON key ===");
const res1 = await fetch(`${url}/rest/v1/cms_users?select=username,password_manual,full_name,user_level,assigned_project&limit=10`, {
  headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}`, "Content-Type": "application/json" }
});
if (!res1.ok) {
  console.log("ANON ERROR:", res1.status, await res1.text());
} else {
  const data1 = await res1.json();
  console.log("ANON rows:", data1.length);
  for (const r of data1) {
    console.log(`  ${r.username} | pwd=${r.password_manual ? "SET(" + r.password_manual.length + " chars)" : "EMPTY"} | ${r.user_level} | ${r.assigned_project}`);
  }
}

console.log("\n=== Checking cms_users with SERVICE ROLE key ===");
const res2 = await fetch(`${url}/rest/v1/cms_users?select=username,password_manual,full_name,user_level,assigned_project&limit=10`, {
  headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" }
});
if (!res2.ok) {
  console.log("SERVICE ERROR:", res2.status, await res2.text());
} else {
  const data2 = await res2.json();
  console.log("SERVICE rows:", data2.length);
  for (const r of data2) {
    console.log(`  ${r.username} | pwd=${r.password_manual ? "SET(" + r.password_manual.length + " chars)" : "EMPTY"} | ${r.user_level} | ${r.assigned_project}`);
  }
}
