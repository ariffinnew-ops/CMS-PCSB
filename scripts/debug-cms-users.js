import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// 1. Check cms_users table
console.log('=== cms_users table ===')
const { data: users, error: usersErr } = await supabase
  .from('cms_users')
  .select('id, username, email, full_name, user_level, assigned_project')
  .order('created_at', { ascending: true })

if (usersErr) {
  console.log('ERROR fetching cms_users:', usersErr.message)
} else {
  console.log('Total rows:', users.length)
  for (const u of users) {
    console.log(`  - id=${u.id}, username=${u.username}, email=${u.email}, level=${u.user_level}, project=${u.assigned_project}`)
  }
}

// 2. Check auth.users
console.log('\n=== auth.users (first 10) ===')
const { data: authList, error: authErr } = await supabase.auth.admin.listUsers({ perPage: 10 })
if (authErr) {
  console.log('ERROR fetching auth.users:', authErr.message)
} else {
  for (const u of authList.users) {
    console.log(`  - auth_id=${u.id}, email=${u.email}, metadata=${JSON.stringify(u.user_metadata)}`)
  }
}

// 3. Check if IDs match
console.log('\n=== ID Matching Check ===')
if (users && authList) {
  for (const au of authList.users) {
    const match = users.find(cu => cu.id === au.id)
    const emailMatch = users.find(cu => cu.email === au.email)
    const usernameMatch = users.find(cu => cu.username === au.email?.split('@')[0])
    console.log(`  auth_id=${au.id}, email=${au.email}:`)
    console.log(`    id_match=${match ? 'YES (level=' + match.user_level + ')' : 'NO'}`)
    console.log(`    email_match=${emailMatch ? 'YES (level=' + emailMatch.user_level + ', cms_id=' + emailMatch.id + ')' : 'NO'}`)
    console.log(`    username_match=${usernameMatch ? 'YES (level=' + usernameMatch.user_level + ', cms_id=' + usernameMatch.id + ')' : 'NO'}`)
  }
}

// 4. List cms_users columns
console.log('\n=== cms_users raw first row ===')
const { data: rawRow } = await supabase.from('cms_users').select('*').limit(1)
if (rawRow?.[0]) {
  console.log('Columns:', Object.keys(rawRow[0]).join(', '))
  console.log('Values:', JSON.stringify(rawRow[0]))
}
