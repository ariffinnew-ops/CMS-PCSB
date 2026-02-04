export type ClientType = 'SKA' | 'SBA';
export type TradeType = 'OM' | 'EM' | 'IMP/OHN';

export interface RosterRow {
  id: number;
  crew_name: string;
  post: string;
  client: string;
  location: string;
  roles_em: string;
  [key: string]: string | number; // For m1, d1, m2, d2, etc.
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
