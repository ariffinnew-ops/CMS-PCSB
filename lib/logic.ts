import { PivotedCrewRow } from './types';

export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput || dateInput === '-' || dateInput === 'N/A') return '--';
  const d = (typeof dateInput === 'string') ? safeParseDate(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) return '--';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateLong(dateInput: string | Date | null | undefined): string {
  if (!dateInput || dateInput === '-' || dateInput === 'N/A') return 'N/A';
  const d = (typeof dateInput === 'string') ? safeParseDate(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) return 'N/A';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function safeParseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const ds = dateStr.trim();
  if (ds === '' || ds === '-' || ds === 'N/A') return null;
  
  // Handles YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
    const [y, m, d] = ds.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  // Handles YYYY-MMM-DD (e.g., 2025-Sep-05)
  if (/^\d{4}-[A-Za-z]{3}-\d{2}$/.test(ds)) {
    const parts = ds.split('-');
    const year = parseInt(parts[0]);
    const monthStr = parts[1].toLowerCase();
    const day = parseInt(parts[2]);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = months.indexOf(monthStr);
    if (monthIndex !== -1) {
      return new Date(year, monthIndex, day, 0, 0, 0, 0);
    }
  }
  
  const d = new Date(ds);
  d.setHours(0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

// Check if crew is on board using normalized PivotedCrewRow
export function isPersonnelOnBoard(row: PivotedCrewRow, targetDate: Date): boolean {
  const checkTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0).getTime();
  
  const isOfficeStaff = row.post?.includes("IM") || row.post?.includes("OHN");
  if (isOfficeStaff) {
    const day = targetDate.getDay();
    return day !== 0 && day !== 6;
  }

  // Iterate over cycles instead of m1/d1...m24/d24
  for (const cycle of Object.values(row.cycles)) {
    const m = safeParseDate(cycle.sign_on);
    const d = safeParseDate(cycle.sign_off);
    if (m && d && checkTime >= m.getTime() && checkTime < d.getTime()) {
      return true;
    }
  }
  return false;
}

export function getActiveRotationRange(row: PivotedCrewRow, targetDate: Date): { start: Date | null, end: Date | null } {
  const checkTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0).getTime();
  
  const isOfficeStaff = row.post?.includes("IM") || row.post?.includes("OHN");
  if (isOfficeStaff) {
    return { start: null, end: null };
  }

  for (const cycle of Object.values(row.cycles)) {
    const m = safeParseDate(cycle.sign_on);
    const d = safeParseDate(cycle.sign_off);
    if (m && d && checkTime >= m.getTime() && checkTime < d.getTime()) {
      return { start: m, end: d };
    }
  }
  return { start: null, end: null };
}

export function getDaysOnBoard(row: PivotedCrewRow, targetDate: Date): number {
  const range = getActiveRotationRange(row, targetDate);
  if (!range.start) return 0;
  const checkTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0).getTime();
  return Math.floor((checkTime - range.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export function isDepartureAlert(row: PivotedCrewRow, targetDate: Date): boolean {
  const range = getActiveRotationRange(row, targetDate);
  if (!range.end) return false;
  const checkTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0).getTime();
  const diff = (range.end.getTime() - checkTime) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 3;
}

export function getFullTradeName(post: string = "") {
  const up = post.toUpperCase();
  if (up.includes("OFFSHORE MEDIC")) return "OFFSHORE MEDIC";
  if (up.includes("ESCORT MEDIC")) return "ESCORT MEDIC";
  if (up.includes("IM") || up.includes("OHN")) return "IMP / OHN";
  return post;
}

export function getTradeRank(post: string = "") {
  const up = post.toUpperCase();
  if (up.includes("OFFSHORE MEDIC")) return 1;
  if (up.includes("ESCORT MEDIC")) return 2;
  if (up.includes("IM") || up.includes("OHN")) return 3;
  return 4;
}

export function shortenPost(post: string | null | undefined = "") {
  const up = (post ?? "").toUpperCase();
  if (up.includes("OFFSHORE MEDIC")) return "OM";
  if (up.includes("ESCORT MEDIC")) return "EM";
  if (up.includes("IM") || up.includes("OHN")) return "OHN";
  return post;
}
