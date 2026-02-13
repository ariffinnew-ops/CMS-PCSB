const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// 1. Check cms_access_matrix structure
console.log("=== cms_access_matrix ===");
const { data: matrix, error: matrixErr } = await supabase
  .from("cms_access_matrix")
  .select("*")
  .limit(20);

if (matrixErr) {
  console.log("ERROR:", matrixErr.message);
} else {
  console.log("Row count:", matrix.length);
  if (matrix.length > 0) {
    console.log("Columns:", Object.keys(matrix[0]).join(", "));
    matrix.forEach(row => console.log(JSON.stringify(row)));
  }
}
