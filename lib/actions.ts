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
export async function getPivotedRosterData(): Promise<PivotedCrewRow[]> {
  const rows = await getRosterData()
  const map = new Map<string, PivotedCrewRow>()

  for (const row of rows) {
    const key = row.crew_id || row.crew_name
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

// Login Logs
export interface LoginLogEntry {
  id?: number;
  username: string;
  role: string;
  timestamp: string;
  success: boolean;
}

export async function recordLoginLog(log: Omit<LoginLogEntry, 'id'>): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('login_logs')
      .insert(log)

    if (error) {
      console.warn('Login logging skipped (table may not exist):', error.message)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.warn('Login logging failed:', err)
    return { success: false, error: 'Logging unavailable' }
  }
}

export async function getLoginLogs(): Promise<LoginLogEntry[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('login_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Error fetching login logs:', error)
    return []
  }

  return data || []
}

// ─── Crew Master Data (salary, fixed_allowance, rates) ───

export interface CrewMasterRecord {
  id: string;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  salary: number;
  fixed_allowance: number;
  relief_rate: number;
  standby_rate: number;
}

export async function getCrewMasterData(): Promise<CrewMasterRecord[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cms_pcsb_master')
    .select('id, crew_name, post, client, location, salary, fixed_allowance, relief_rate, standby_rate')
    .order('crew_name', { ascending: true })

  if (error) {
    console.error('Error fetching crew master data:', error)
    return []
  }

  return (data || []).map((d) => ({
    id: d.id,
    crew_name: d.crew_name || '',
    post: d.post || '',
    client: d.client || '',
    location: d.location || '',
    salary: d.salary ?? 0,
    fixed_allowance: d.fixed_allowance ?? 0,
    relief_rate: d.relief_rate ?? 0,
    standby_rate: d.standby_rate ?? 0,
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
