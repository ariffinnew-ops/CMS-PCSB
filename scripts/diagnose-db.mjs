import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.log('MISSING ENV VARS:', { url: !!url, key: !!key })
  process.exit(1)
}

const supabase = createClient(url, key)

// Test 1: Does cms_master_crew exist? What columns does it have?
console.log('\n=== TEST 1: cms_master_crew ===')
const { data: d1, error: e1 } = await supabase.from('cms_master_crew').select('*').limit(2)
if (e1) {
  console.log('ERROR:', e1.code, e1.message)
} else {
  console.log('Row count (first 2):', d1?.length)
  if (d1 && d1.length > 0) {
    console.log('Columns:', Object.keys(d1[0]))
    console.log('Sample row:', JSON.stringify(d1[0], null, 2))
  }
}

// Test 2: What project values exist?
console.log('\n=== TEST 2: project column values ===')
const { data: d2, error: e2 } = await supabase.from('cms_master_crew').select('project')
if (e2) {
  console.log('ERROR:', e2.code, e2.message)
} else {
  const counts = {}
  for (const r of d2 || []) {
    const p = String(r.project ?? 'NULL')
    counts[p] = (counts[p] || 0) + 1
  }
  console.log('Project distribution:', counts)
}

// Test 3: Filter by PCSB
console.log('\n=== TEST 3: filter project=PCSB ===')
const { data: d3, error: e3 } = await supabase.from('cms_master_crew').select('id, crew_name, post').eq('project', 'PCSB').limit(3)
if (e3) {
  console.log('ERROR:', e3.code, e3.message)
} else {
  console.log('PCSB rows (first 3):', d3?.length, d3)
}

// Test 4: Check basic and fixed_all columns
console.log('\n=== TEST 4: basic/fixed_all/offshore_rate ===')
const { data: d4, error: e4 } = await supabase.from('cms_master_crew').select('crew_name, basic, fixed_all, offshore_rate, project').limit(5)
if (e4) {
  console.log('ERROR:', e4.code, e4.message)
} else {
  console.log('Sample financial data:', JSON.stringify(d4, null, 2))
}

// Test 5: Check if old table still exists
console.log('\n=== TEST 5: old cms_pcsb_master table? ===')
const { data: d5, error: e5 } = await supabase.from('cms_pcsb_master').select('id').limit(1)
if (e5) {
  console.log('cms_pcsb_master:', e5.code, e5.message)
} else {
  console.log('cms_pcsb_master EXISTS, rows:', d5?.length)
}
