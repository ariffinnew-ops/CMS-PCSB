'use server'

import { createClient } from '@/lib/supabase/server'
import type { RosterRow, MatrixRecord } from './types'

export async function getRosterData(): Promise<RosterRow[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('staffing_roster')
    .select('*')
    .order('id', { ascending: true })

  if (error) {
    console.error('Error fetching roster data:', error)
    return []
  }

  return data || []
}

export async function updateRosterRow(id: number, updates: Partial<RosterRow>): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('staffing_roster')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) {
    console.error('Error updating roster row:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function createRosterRow(row: Omit<RosterRow, 'id'>): Promise<{ success: boolean; data?: RosterRow; error?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('staffing_roster')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('Error creating roster row:', error)
    return { success: false, error: error.message }
  }

  return { success: true, data }
}

export async function deleteRosterRow(id: number): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('staffing_roster')
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

// Update a single matrix cell (attended_date or expiry_date)
export async function updateMatrixCell(
  matrixId: string,
  field: 'attended_date' | 'expiry_date',
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
  field: 'attended_date' | 'expiry_date',
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

// Bulk update for Save Changes
export async function bulkUpdateRosterRows(updates: { id: number; updates: Partial<RosterRow> }[]): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  for (const item of updates) {
    const { error } = await supabase
      .from('staffing_roster')
      .update(item.updates)
      .eq('id', item.id)

    if (error) {
      console.error('Error in bulk update:', error)
      return { success: false, error: error.message }
    }
  }

  return { success: true }
}
