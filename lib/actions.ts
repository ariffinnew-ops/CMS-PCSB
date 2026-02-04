'use server'

import { createClient } from '@/lib/supabase/server'
import type { RosterRow } from './types'

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
  console.log('[v0] updateRosterRow called with id:', id, 'updates:', updates)
  
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('staffing_roster')
    .update(updates)
    .eq('id', id)
    .select()

  console.log('[v0] Supabase update result - data:', data, 'error:', error)

  if (error) {
    console.error('[v0] Error updating roster row:', error)
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
  const supabase = await createClient()

  const { error } = await supabase
    .from('login_logs')
    .insert(log)

  if (error) {
    console.error('Error recording login log:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
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
