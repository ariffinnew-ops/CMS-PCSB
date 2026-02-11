'use server'

import { createClient } from '@/lib/supabase/server'
import type { RosterRow, PivotedCrewRow, MatrixRecord } from './types'

// ─── Roster Actions (normalized: one row per crew per cycle) ───

export async function getRosterData(): Promise<RosterRow[]> {
  const supabase = await createClient()

  const { data: rosterData, error: rosterError } = await supabase
    .from('cms_pcsb_roster')
    .select('*')
    .order('crew_name', { ascending: true })
    .order('cycle_number', { ascending: true })

  if (rosterError) {
    console.error('Error fetching roster data:', rosterError)
    return []
  }

  return (rosterData || []) as RosterRow[]
}

// Pivot roster rows into one entry per crew with all cycles grouped
// Fetches ONLY from cms_pcsb_roster
// Key uses crew_id + crew_name so suffixed duplicates (e.g. "JOHN (R1)") get their own row
export async function getPivotedRosterData(): Promise<PivotedCrewRow[]> {
  const rows = await getRosterData()
  const map = new Map<string, PivotedCrewRow>()

  for (const row of rows) {
    // Use both crew_id and crew_name as key so suffixed entries stay separate
    const key = `${row.crew_id || ''}::${row.crew_name || ''}`
    if (!map.has(key)) {
      map.set(key, {
        crew_id: row.crew_id || '',
        crew_name: row.crew_name,
        post: row.post,
        client: row.client,
        location: row.location,
        roles_em: row.roles_em,
        cycles: {},
      })
    }
    const entry = map.get(key)!
    if (row.cycle_number) {
      entry.cycles[row.cycle_number] = {
        id: row.id,
        sign_on: row.sign_on,
        sign_off: row.sign_off,
        notes: row.notes,
        relief_all: row.relief_all,
        standby_all: row.standby_all,
        day_relief: row.day_relief ?? null,
        day_standby: row.day_standby ?? null,
        is_offshore: row.is_offshore ?? null,
        medevac_dates: row.medevac_dates ?? null,
      }
    }
  }

  return Array.from(map.values())
}

export async function updateRosterRow(id: number, updates: Partial<RosterRow>): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('cms_pcsb_roster')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) {
    console.error('Error updating roster row:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function createRosterRow(row: {
  crew_id: string;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  cycle_number?: number;
  sign_on?: string | null;
  sign_off?: string | null;
}): Promise<{ success: boolean; data?: RosterRow; error?: string }> {
  const supabase = await createClient()

  const { data: insertedRow, error } = await supabase
    .from('cms_pcsb_roster')
    .insert({
      crew_id: row.crew_id,
      crew_name: row.crew_name,
      post: row.post,
      client: row.client,
      location: row.location,
      cycle_number: row.cycle_number || 1,
      sign_on: row.sign_on || null,
      sign_off: row.sign_off || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating roster row:', error)
    return { success: false, error: error.message }
  }

  return { success: true, data: insertedRow as RosterRow }
}

export async function deleteRosterRow(id: number): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('cms_pcsb_roster')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting roster row:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// Delete all roster rows for a crew_id
export async function deleteCrewFromRoster(crewId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
  .from('cms_pcsb_roster')
  .delete()
  .eq('crew_id', crewId)
  
  if (error) {
  console.error('Error deleting crew roster:', error)
  return { success: false, error: error.message }
  }
  
  return { success: true }
  }

// Delete roster rows for a specific crew_id + crew_name combo (for suffixed entries)
export async function deleteCrewByName(crewId: string, crewName: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
  .from('cms_pcsb_roster')
  .delete()
  .eq('crew_id', crewId)
  .eq('crew_name', crewName)
  
  if (error) {
  console.error('Error deleting crew by name:', error)
  return { success: false, error: error.message }
  }
  
  return { success: true }
  }

// Login Logs
// ---------------------------------------------------------------------------
// Login Logs — maps to `cms_login_logs` table
// Columns: username_attempt, login_status, user_level, project_scope,
//          error_message, created_at
// ---------------------------------------------------------------------------
export interface LoginLogEntry {
  id?: number;
  username_attempt: string;
  login_status: "SUCCESS" | "FAILED";
  user_level: string;
  project_scope: string;
  error_message: string | null;
  created_at?: string;
}

export interface RecordLoginLogParams {
  username_attempt: string;
  login_status: "SUCCESS" | "FAILED";
  user_level: string;
  project_scope: string;
  error_message?: string | null;
}

export async function recordLoginLog(params: RecordLoginLogParams): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()

    const { error } = await supabase
      .from('cms_login_logs')
      .insert({
        username_attempt: params.username_attempt,
        login_status: params.login_status,
        user_level: params.user_level,
        project_scope: params.project_scope,
        error_message: params.error_message || null,
      })

    if (error) {
      console.warn('Login logging skipped:', error.message)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.warn('Login logging failed:', err)
    return { success: false, error: 'Logging unavailable' }
  }
}

export async function getLoginLogs(): Promise<LoginLogEntry[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('cms_login_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Error fetching login logs:', error)
    return []
  }

  return (data as LoginLogEntry[]) || []
}

// ─── Crew Master Data (for rates/financial lookups) ───

export interface CrewMasterRecord {
  id: string;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  basic: number;
  fixed_all: number;
}

export async function getCrewMasterData(): Promise<CrewMasterRecord[]> {
  const supabase = await createClient()

  // Try with basic & fixed_all columns first; fall back without them if columns don't exist yet
  let { data, error } = await supabase
    .from('cms_pcsb_master')
    .select('id, crew_name, post, client, location, basic, fixed_all')
    .order('crew_name', { ascending: true })

  if (error?.code === '42703') {
    // Column doesn't exist yet -- fall back to base columns
    const fallback = await supabase
      .from('cms_pcsb_master')
      .select('id, crew_name, post, client, location')
      .order('crew_name', { ascending: true })
    data = fallback.data
    error = fallback.error
  }

  if (error) {
    console.error('Error fetching crew master data:', error)
    return []
  }

  return (data || []).map((d: Record<string, unknown>) => ({
    id: String(d.id || ''),
    crew_name: String(d.crew_name || ''),
    post: String(d.post || ''),
    client: String(d.client || ''),
    location: String(d.location || ''),
    basic: Number(d.basic) || 0,
    fixed_all: Number(d.fixed_all) || 0,
  }))
}

// ─── Training Matrix Actions (cms_pcsb_matrix + cms_pcsb_master) ───

export async function getMatrixData(): Promise<{ success: boolean; data?: MatrixRecord[]; error?: string }> {
  const supabase = await createClient()

  // Fetch crew details from master table
  const { data: crewData, error: crewError } = await supabase
    .from('cms_pcsb_master')
    .select('id, crew_name, post, client, location')

  if (crewError) {
    console.error('Error fetching crew detail:', crewError)
    return { success: false, error: crewError.message }
  }

  // Fetch matrix records
  const { data: matrixData, error: matrixError } = await supabase
    .from('cms_pcsb_matrix')
    .select('id, crew_id, cert_type, cert_no, expiry_date, attended_date, plan_date')

  if (matrixError) {
    console.error('Error fetching matrix data:', matrixError)
    return { success: false, error: matrixError.message }
  }

  // Build crew lookup
  const crewMap = new Map<string, { crew_name: string; post: string; client: string; location: string }>();
  for (const c of (crewData || [])) {
    crewMap.set(c.id, { crew_name: c.crew_name || '', post: c.post || '', client: c.client || '', location: c.location || '' });
  }

  // Join matrix with crew data
  if (matrixData && matrixData.length > 0) {
    const flattened: MatrixRecord[] = matrixData.map((row) => {
      const crew = crewMap.get(row.crew_id);
      return {
        id: row.id,
        crew_id: row.crew_id,
        cert_type: row.cert_type || '',
        cert_no: row.cert_no || null,
        expiry_date: row.expiry_date || null,
        attended_date: row.attended_date || null,
        plan_date: row.plan_date || null,
        crew_name: crew?.crew_name || '',
        post: crew?.post || '',
        client: crew?.client || '',
        location: crew?.location || '',
      };
    });
    return { success: true, data: flattened }
  }

  // Fallback: if matrix empty but crew exists, return crew with empty certs
  if (crewData && crewData.length > 0) {
    const fallback: MatrixRecord[] = crewData.map((c) => ({
      id: c.id,
      crew_id: c.id,
      cert_type: '',
      cert_no: null,
      expiry_date: null,
      attended_date: null,
      plan_date: null,
      crew_name: c.crew_name || '',
      post: c.post || '',
      client: c.client || '',
      location: c.location || '',
    }));
    return { success: true, data: fallback }
  }

  return { success: true, data: [] }
}

// Update a single matrix cell
export async function updateMatrixCell(
  matrixId: string,
  field: 'attended_date' | 'expiry_date' | 'plan_date' | 'cert_no',
  value: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('cms_pcsb_matrix')
    .update({ [field]: value })
    .eq('id', matrixId)

  if (error) {
    console.error('Error updating matrix cell:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// Create a new matrix record
export async function createMatrixRecord(
  crewId: string,
  certType: string,
  field: 'attended_date' | 'expiry_date' | 'plan_date' | 'cert_no',
  value: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cms_pcsb_matrix')
    .insert({
      crew_id: crewId,
      cert_type: certType,
      [field]: value,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error creating matrix record:', error)
    return { success: false, error: error.message }
  }

  return { success: true, id: data?.id }
}

// ─── Staff Detail Actions (cms_pcsb_master) ───

export async function getCrewList(): Promise<{ success: boolean; data?: { id: string; crew_name: string; clean_name: string; post: string; client: string; location: string; status?: string }[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cms_pcsb_master')
    .select('id, crew_name, clean_name, post, client, location, status')
    .order('crew_name', { ascending: true })

  if (error) {
    console.error('Error fetching crew list:', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data || [] }
}

export async function getCrewDetail(crewId: string): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cms_pcsb_master')
    .select('*')
    .eq('id', crewId)
    .single()

  if (error) {
    console.error('Error fetching crew detail:', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data || {} }
}

export async function updateCrewDetail(crewId: string, updates: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cms_pcsb_master')
    .update(updates)
    .eq('id', crewId)

  if (error) {
    console.error('Error updating crew detail:', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function getCrewMatrix(crewId: string): Promise<{ success: boolean; data?: { id: string; cert_type: string; cert_no: string | null; expiry_date: string | null; attended_date: string | null; plan_date: string | null }[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cms_pcsb_matrix')
    .select('id, cert_type, cert_no, expiry_date, attended_date, plan_date')
    .eq('crew_id', crewId)
    .order('cert_type', { ascending: true })

  if (error) {
    console.error('Error fetching crew matrix:', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data || [] }
}

export async function getCrewRoster(crewId: string): Promise<{ success: boolean; data?: RosterRow[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cms_pcsb_roster')
    .select('*')
    .eq('crew_id', crewId)
    .order('cycle_number', { ascending: true })

  if (error) {
    console.error('Error fetching crew roster:', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data || [] }
}

export async function listCrewDocuments(crewId: string): Promise<{ success: boolean; data?: { name: string; size: number; created_at: string }[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('pcsb-doc')
    .list(crewId, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })

  if (error) {
    console.error('Error listing crew documents:', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: (data || []).map(f => ({ name: f.name, size: f.metadata?.size || 0, created_at: f.created_at || '' })) }
}

export async function deleteCrewDocument(crewId: string, fileName: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.storage
    .from('pcsb-doc')
    .remove([`${crewId}/${fileName}`])

  if (error) {
    console.error('Error deleting crew document:', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function createCrewMember(crewData: Record<string, unknown>): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cms_pcsb_master')
    .insert(crewData)
    .select('id')
    .single()

  if (error) {
    console.error('Error creating crew member:', error)
    return { success: false, error: error.message }
  }
  return { success: true, id: data?.id }
}

// Get total cycle count per crew_id from roster (for dynamic relief labeling)
export async function getCrewCycleCounts(): Promise<Map<string, number>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('cms_pcsb_roster')
    .select('crew_id, cycle_number')
    .order('crew_id')

  const map = new Map<string, number>()
  if (data) {
    for (const row of data) {
      const key = row.crew_id || ''
      map.set(key, Math.max(map.get(key) || 0, row.cycle_number || 0))
    }
  }
  return map
}

// Serializable version for client components
export async function getCrewCycleCountsJSON(): Promise<Record<string, number>> {
  const map = await getCrewCycleCounts()
  const obj: Record<string, number> = {}
  for (const [k, v] of map) obj[k] = v
  return obj
}

// Get OHN/IM staff from master for hybrid POB (Dashboard only)
export async function getOHNStaffFromMaster(): Promise<PivotedCrewRow[]> {
  const supabase = await createClient()
  const { data: ohnData } = await supabase
    .from('cms_pcsb_master')
    .select('id, crew_name, post, client, location')
    .or('post.ilike.%IM%,post.ilike.%OHN%')
    .order('crew_name', { ascending: true })

  if (!ohnData) return []

  return ohnData.map((staff) => ({
    crew_id: staff.id || '',
    crew_name: staff.crew_name || '',
    post: staff.post || '',
    client: staff.client || '',
    location: staff.location || '',
    roles_em: undefined,
    cycles: {},
  }))
}

// ─── Two-Stage Approval Persistence (cms_pcsb_approvals) ───

export interface ApprovalRecord {
  month_year: string;
  client: string;
  approved_by: string;
  approved_role: string;
  approved_at: string;
  submission_status?: string;
  submitted_by?: string;
  submitted_at?: string;
}

// Get full approval record with submission_status
export async function getApproval(monthYear: string, client: string): Promise<ApprovalRecord | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cms_pcsb_approvals')
    .select('*')
    .eq('month_year', monthYear)
    .eq('client', client)
    .maybeSingle()

  if (error) {
    console.warn('Approval fetch error:', error.message)
    return null
  }

  return data as ApprovalRecord | null
}

// Stage 1: Submit for approval (admin/datalogger)
export async function submitForApproval(monthYear: string, client: string, submittedBy: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const now = new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })

  const { error } = await supabase
    .from('cms_pcsb_approvals')
    .upsert(
      {
        month_year: monthYear,
        client,
        submission_status: 'Submitted',
        submitted_by: submittedBy,
        submitted_at: now,
        approved_by: '',
        approved_role: '',
        approved_at: '',
      },
      { onConflict: 'month_year,client' }
    )

  if (error) {
    console.warn('Submit for approval error:', error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// Stage 2: Manager approval (PM only)
export async function approveStatement(monthYear: string, client: string, approvedBy: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const now = new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })

  const { error } = await supabase
    .from('cms_pcsb_approvals')
    .upsert(
      {
        month_year: monthYear,
        client,
        submission_status: 'Approved',
        approved_by: approvedBy,
        approved_role: 'Project Manager',
        approved_at: now,
      },
      { onConflict: 'month_year,client' }
    )

  if (error) {
    console.warn('Approve statement error:', error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// Reject / Unlock: reset back to Draft
export async function rejectApproval(monthYear: string, client: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('cms_pcsb_approvals')
    .upsert(
      {
        month_year: monthYear,
        client,
        submission_status: 'Draft',
        submitted_by: '',
        submitted_at: '',
        approved_by: '',
        approved_role: '',
        approved_at: '',
      },
      { onConflict: 'month_year,client' }
    )

  if (error) {
    console.warn('Reject approval error:', error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// Legacy upsert (kept for backward compatibility)
export async function upsertApproval(record: ApprovalRecord): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('cms_pcsb_approvals')
    .upsert(
      {
        month_year: record.month_year,
        client: record.client,
        approved_by: record.approved_by,
        approved_role: record.approved_role,
        approved_at: record.approved_at,
      },
      { onConflict: 'month_year,client' }
    )

  if (error) {
    console.warn('Approval upsert error (table may not exist):', error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// Bulk update for Save Changes
export async function bulkUpdateRosterRows(updates: { id: number; updates: Partial<RosterRow> }[]): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  for (const item of updates) {
    const { error } = await supabase
      .from('cms_pcsb_roster')
      .update(item.updates)
      .eq('id', item.id)

    if (error) {
      console.error('Error in bulk update:', error)
      return { success: false, error: error.message }
    }
  }

  return { success: true }
}
