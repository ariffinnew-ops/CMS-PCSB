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

// Fetch training matrix data from pcsb_matrix joined with pcsb_crew_detail
export async function getMatrixData(): Promise<{ success: boolean; data?: MatrixRecord[]; error?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('pcsb_matrix')
    .select(`
      id,
      crew_id,
      cert_type,
      expiry_date,
      attended_date,
      pcsb_crew_detail (
        crew_name,
        post,
        client,
        location
      )
    `)
    .order('crew_id', { ascending: true })

  if (error) {
    console.error('Error fetching matrix data:', error)
    return { success: false, error: error.message }
  }

  // Flatten the joined data
  const flattened: MatrixRecord[] = (data || []).map((row: Record<string, unknown>) => {
    const crew = row.pcsb_crew_detail as Record<string, string> | null;
    return {
      id: row.id as string,
      crew_id: row.crew_id as string,
      cert_type: row.cert_type as string,
      expiry_date: row.expiry_date as string | null,
      attended_date: row.attended_date as string | null,
      crew_name: crew?.crew_name || '',
      post: crew?.post || '',
      client: crew?.client || '',
      location: crew?.location || '',
    };
  });

  return { success: true, data: flattened }
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
