'use server'

import { createClient } from '@/lib/supabase/server'
import type { RosterRow, MatrixRecord } from './types'

export async function getRosterData(): Promise<RosterRow[]> {
  const supabase = await createClient()
  
  // Fetch roster rows
  const { data: rosterData, error: rosterError } = await supabase
    .from('pcsb_roster')
    .select('*')
    .order('id', { ascending: true })

  if (rosterError) {
    console.error('Error fetching roster data:', rosterError)
    return []
  }

  // Fetch crew details for joining
  const { data: crewData } = await supabase
    .from('pcsb_crew_detail')
    .select('id, crew_name, post, client, location')

  const crewMap = new Map<string, { crew_name: string; post: string; client: string; location: string }>();
  for (const c of (crewData || [])) {
    crewMap.set(c.id, { crew_name: c.crew_name || '', post: c.post || '', client: c.client || '', location: c.location || '' });
  }

  // Join roster with crew details
  return (rosterData || []).map((row: Record<string, unknown>) => {
    const crew = crewMap.get(row.crew_id as string);
    return {
      ...row,
      crew_name: crew?.crew_name || '',
      post: crew?.post || '',
      client: crew?.client || '',
      location: crew?.location || '',
    } as RosterRow;
  })
}

export async function updateRosterRow(id: number, updates: Partial<RosterRow>): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('pcsb_roster')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) {
    console.error('Error updating roster row:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function createRosterRow(row: Omit<RosterRow, 'id'> | { crew_id: string }): Promise<{ success: boolean; data?: RosterRow; error?: string }> {
  const supabase = await createClient()

  // Only send crew_id to pcsb_roster (name/post/client/location come from the join with pcsb_crew_detail)
  const insertPayload: Record<string, unknown> = { crew_id: (row as { crew_id?: string }).crew_id };

  const { data: insertedRow, error } = await supabase
    .from('pcsb_roster')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    console.error('Error creating roster row:', error)
    return { success: false, error: error.message }
  }

  // Re-fetch with crew detail join for the returned data
  if (insertedRow) {
    const { data: crewData } = await supabase
      .from('pcsb_crew_detail')
      .select('crew_name, post, client, location')
      .eq('id', insertedRow.crew_id)
      .single()

    const fullRow = {
      ...insertedRow,
      crew_name: crewData?.crew_name || '',
      post: crewData?.post || '',
      client: crewData?.client || '',
      location: crewData?.location || '',
    } as RosterRow

    return { success: true, data: fullRow }
  }

  return { success: true, data: insertedRow }
}

export async function deleteRosterRow(id: number): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('pcsb_roster')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting roster row:', error)
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
      // Silently fail if table doesn't exist - logging is optional
      console.warn('Login logging skipped (table may not exist):', error.message)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    // Catch any unexpected errors to prevent login from failing
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

// Fetch training matrix data - fetches both tables and joins client-side for reliability
export async function getMatrixData(): Promise<{ success: boolean; data?: MatrixRecord[]; error?: string }> {
  const supabase = await createClient()

  // Fetch crew details
  const { data: crewData, error: crewError } = await supabase
    .from('pcsb_crew_detail')
    .select('id, crew_name, post, client, location')

  if (crewError) {
    console.error('Error fetching crew detail:', crewError)
    return { success: false, error: crewError.message }
  }

  // Fetch matrix records
  const { data: matrixData, error: matrixError } = await supabase
    .from('pcsb_matrix')
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

  // If matrix table has data, join it
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

  // If matrix table is empty but crew table has data, return crew list with empty certs
  // so the table at least shows all names
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
    .from('pcsb_matrix')
    .update({ [field]: value })
    .eq('id', matrixId)

  if (error) {
    console.error('Error updating matrix cell:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// Create a new matrix record (when editing a cell that doesn't exist yet)
export async function createMatrixRecord(
  crewId: string,
  certType: string,
  field: 'attended_date' | 'expiry_date' | 'plan_date' | 'cert_no',
  value: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('pcsb_matrix')
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

// ─── Staff Detail Actions ───

// Get all crew members list (for dropdown)
export async function getCrewList(): Promise<{ success: boolean; data?: { id: string; crew_name: string; post: string; client: string; location: string; status?: string }[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pcsb_crew_detail')
    .select('id, crew_name, post, client, location, status')
    .order('crew_name', { ascending: true })

  if (error) {
    console.error('Error fetching crew list:', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data || [] }
}

// Get single crew detail
export async function getCrewDetail(crewId: string): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pcsb_crew_detail')
    .select('*')
    .eq('id', crewId)
    .single()

  if (error) {
    console.error('Error fetching crew detail:', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data || {} }
}

// Update crew detail fields
export async function updateCrewDetail(crewId: string, updates: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pcsb_crew_detail')
    .update(updates)
    .eq('id', crewId)

  if (error) {
    console.error('Error updating crew detail:', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}

// Get crew training matrix
export async function getCrewMatrix(crewId: string): Promise<{ success: boolean; data?: { id: string; cert_type: string; cert_no: string | null; expiry_date: string | null; attended_date: string | null; plan_date: string | null }[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pcsb_matrix')
    .select('id, cert_type, cert_no, expiry_date, attended_date, plan_date')
    .eq('crew_id', crewId)
    .order('cert_type', { ascending: true })

  if (error) {
    console.error('Error fetching crew matrix:', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data || [] }
}

// Get crew roster/movement history by crew_id
export async function getCrewRoster(crewId: string): Promise<{ success: boolean; data?: RosterRow[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pcsb_roster')
    .select('*')
    .eq('crew_id', crewId)
    .order('id', { ascending: true })

  if (error) {
    console.error('Error fetching crew roster:', error)
    return { success: false, error: error.message }
  }
  return { success: true, data: data || [] }
}

// List crew documents
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

// Delete crew document
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

// Create new crew member
export async function createCrewMember(crewData: Record<string, unknown>): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pcsb_crew_detail')
    .insert(crewData)
    .select('id')
    .single()

  if (error) {
    console.error('Error creating crew member:', error)
    return { success: false, error: error.message }
  }
  return { success: true, id: data?.id }
}

// Bulk update for Save Changes
export async function bulkUpdateRosterRows(updates: { id: number; updates: Partial<RosterRow> }[]): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  for (const item of updates) {
    const { error } = await supabase
      .from('pcsb_roster')
      .update(item.updates)
      .eq('id', item.id)

    if (error) {
      console.error('Error in bulk update:', error)
      return { success: false, error: error.message }
    }
  }

  return { success: true }
}
