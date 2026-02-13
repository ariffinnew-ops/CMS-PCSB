const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const res = await fetch(`${url}/rest/v1/cms_access_matrix?select=*&order=page_code.asc,project_scope.asc`, {
  headers: {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json"
  }
});

if (!res.ok) {
  console.log("ERROR:", res.status, await res.text());
  process.exit(1);
}

const data = await res.json();
console.log("=== cms_access_matrix ===");
console.log("Total rows:", data.length);
console.log("Columns:", data.length > 0 ? Object.keys(data[0]).join(", ") : "N/A");
console.log("");

for (const row of data) {
  console.log(`${row.page_code} | ${row.project_scope.padEnd(6)} | ${row.page_name?.padEnd(20) || "N/A".padEnd(20)} | L1=${row.l1_access} L2A=${row.l2a_access} L2B=${row.l2b_access} L4=${row.l4_access} L5=${row.l5_access} L6=${row.l6_access} L7=${row.l7_access}`);
}
