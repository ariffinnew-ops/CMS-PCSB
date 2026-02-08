export type ClientType = 'SKA' | 'SBA';
export type TradeType = 'OM' | 'EM' | 'IMP/OHN';

// Normalized roster row: one row per crew per cycle
export interface RosterRow {
  id: number;
  crew_id?: string;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  roles_em?: string;
  cycle_number: number;      // 1-24 rotation cycle
  sign_on: string | null;    // date string (YYYY-MM-DD)
  sign_off: string | null;   // date string (YYYY-MM-DD)
  notes: string | null;
  relief_all: number | null;
  standby_all: number | null;
  is_offshore: boolean | null;    // only meaningful for OFFSHORE MEDIC
  medevac_dates: string[] | null; // only meaningful for ESCORT MEDIC (up to 3 dates)
}

// Pivoted view: one row per crew with all cycles grouped (for UI rendering)
export interface PivotedCrewRow {
  crew_id: string;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  roles_em?: string;
  cycles: Record<number, {
    id: number;
    sign_on: string | null;
    sign_off: string | null;
    notes: string | null;
    relief_all: number | null;
    standby_all: number | null;
    is_offshore: boolean | null;
    medevac_dates: string[] | null;
  }>;
}

export interface CrewMember {
  name: string;
  trade: string;
  client: ClientType;
  location: string;
  isPrimary: boolean;
}

export interface Movement {
  crew_name: string;
  movement_date: string;
  move_type: string;
}

export interface CompetencyRecord {
  crew_name: string;
  course_name: string;
  attended_date: string;
  expiry_date: string;
  plan_date: string;
}

export interface PersonnelStatus {
  isOnBoard: boolean;
  daysOnBoard: number;
  rotationStart: Date | null;
  rotationEnd: Date | null;
}

// New schema: cms_pcsb_matrix joined with cms_pcsb_master
export interface MatrixRecord {
  id: string;
  crew_id: string;
  cert_type: string;
  cert_no: string | null;
  expiry_date: string | null;
  attended_date: string | null;
  plan_date: string | null;
  // Joined from cms_pcsb_master
  crew_name: string;
  post: string;
  client: string;
  location: string;
}
