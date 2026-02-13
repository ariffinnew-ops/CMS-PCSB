"use client";

// ---------------------------------------------------------------------------
// Safe storage wrappers -- the v0 embedded preview iframe blocks
// sessionStorage / localStorage.  Every access goes through these helpers
// so the rest of the file never touches storage directly.
// ---------------------------------------------------------------------------
function safeGetSession(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function safeSetSession(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* blocked */ }
}
function safeRemoveSession(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* blocked */ }
}
function safeGetLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* blocked */ }
}
function safeRemoveLocal(key: string): void {
  try { localStorage.removeItem(key); } catch { /* blocked */ }
}

// ---------------------------------------------------------------------------
// Role system: L1 (Super Admin) through L7
// ---------------------------------------------------------------------------
export type UserRole = "L1" | "L2A" | "L2B" | "L4" | "L5A" | "L5B" | "L6" | "L7";

// Keep legacy aliases so existing code that checks "admin" / "datalogger" still compiles
export type LegacyRole = "admin" | "datalogger" | "guest";

export type ProjectKey = "PCSB" | "OTHERS";

export interface AuthUser {
  username: string;
  fullName: string;
  role: UserRole;
  defaultProject?: ProjectKey;
}

// Legacy type kept for backward compat -- actual logging uses cms_login_logs via actions.ts
export interface LoginLog {
  id?: number;
  username: string;
  role: string;
  timestamp: string;
  success: boolean;
}

// Role hierarchy level (lower = higher privilege)
export const ROLE_LEVELS: Record<UserRole, number> = {
  L1: 1,
  L2A: 2,
  L2B: 2,
  L4: 4,
  L5A: 5,
  L5B: 5,
  L6: 6,
  L7: 7,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  L1: "Super Admin",
  L2A: "Data Lodger (PCSB)",
  L2B: "Data Lodger (Others)",
  L4: "PMT",
  L5A: "Project Manager (PCSB)",
  L5B: "Project Manager (Others)",
  L6: "HR Payroll",
  L7: "Account",
};

// ---------------------------------------------------------------------------
// Permission matrix: per page, per project => "EDIT" | "VIEW" | "NONE"
// Pages: P1=Dashboard, P2=Roster, P3=Training, P4=Staff, P5=Statement,
//        P6=Financial, P7=Data Manager, P8=User Mgmt
// ---------------------------------------------------------------------------
export type PermissionLevel = "EDIT" | "VIEW" | "NONE";

interface PagePermission {
  PCSB: Record<UserRole, PermissionLevel>;
  OTHERS: Record<UserRole, PermissionLevel>;
}

const perm = (l1: PermissionLevel, l2a: PermissionLevel, l2b: PermissionLevel, l4: PermissionLevel, l5a: PermissionLevel, l5b: PermissionLevel, l6: PermissionLevel, l7: PermissionLevel): Record<UserRole, PermissionLevel> => ({
  L1: l1, L2A: l2a, L2B: l2b, L4: l4, L5A: l5a, L5B: l5b, L6: l6, L7: l7,
});

const DEFAULT_PERMISSION_MATRIX: Record<string, PagePermission> = {
  "/dashboard":  { PCSB: perm("EDIT","VIEW","VIEW","VIEW","VIEW","VIEW","VIEW","VIEW"), OTHERS: perm("EDIT","VIEW","VIEW","VIEW","VIEW","VIEW","VIEW","VIEW") },
  "/roster":     { PCSB: perm("EDIT","VIEW","VIEW","VIEW","VIEW","NONE","NONE","NONE"), OTHERS: perm("EDIT","VIEW","VIEW","VIEW","NONE","VIEW","NONE","NONE") },
  "/training":   { PCSB: perm("EDIT","EDIT","VIEW","EDIT","VIEW","NONE","NONE","NONE"), OTHERS: perm("EDIT","VIEW","EDIT","EDIT","NONE","VIEW","NONE","NONE") },
  "/staff":      { PCSB: perm("EDIT","EDIT","VIEW","EDIT","VIEW","NONE","NONE","NONE"), OTHERS: perm("EDIT","VIEW","EDIT","EDIT","NONE","VIEW","NONE","NONE") },
  "/statement":  { PCSB: perm("EDIT","VIEW","NONE","VIEW","VIEW","NONE","VIEW","VIEW"), OTHERS: perm("EDIT","NONE","VIEW","VIEW","NONE","VIEW","VIEW","VIEW") },
  "/financial":  { PCSB: perm("EDIT","VIEW","NONE","VIEW","VIEW","NONE","VIEW","VIEW"), OTHERS: perm("EDIT","NONE","VIEW","VIEW","NONE","VIEW","VIEW","VIEW") },
  "/admin":      { PCSB: perm("EDIT","EDIT","VIEW","VIEW","VIEW","NONE","NONE","NONE"), OTHERS: perm("EDIT","VIEW","EDIT","VIEW","NONE","VIEW","NONE","NONE") },
  "/users":      { PCSB: perm("EDIT","NONE","NONE","NONE","NONE","NONE","NONE","NONE"), OTHERS: perm("EDIT","NONE","NONE","NONE","NONE","NONE","NONE","NONE") },
};

const MATRIX_STORAGE_KEY = "cms_permission_matrix";

function loadMatrix(): Record<string, PagePermission> {
  if (typeof window === "undefined") return DEFAULT_PERMISSION_MATRIX;
  const stored = safeGetLocal(MATRIX_STORAGE_KEY);
  if (!stored) return DEFAULT_PERMISSION_MATRIX;
  try {
    const parsed = JSON.parse(stored) as Record<string, PagePermission>;
    const firstPage = Object.values(parsed)[0];
    if (firstPage && firstPage.PCSB && ("L5" in firstPage.PCSB) && !("L5A" in firstPage.PCSB)) {
      safeRemoveLocal(MATRIX_STORAGE_KEY);
      return DEFAULT_PERMISSION_MATRIX;
    }
    return parsed;
  } catch { return DEFAULT_PERMISSION_MATRIX; }
}

export function getPermissionMatrix(): Record<string, PagePermission> {
  return loadMatrix();
}

export function savePermissionMatrix(matrix: Record<string, PagePermission>): void {
  if (typeof window !== "undefined") {
    safeSetLocal(MATRIX_STORAGE_KEY, JSON.stringify(matrix));
  }
}

// Live reference (always reads latest)
export const PERMISSION_MATRIX = DEFAULT_PERMISSION_MATRIX;

// Get permission for a specific page + project + role (reads live stored matrix)
export function getPermission(pathname: string, project: ProjectKey, role: UserRole): PermissionLevel {
  const matrix = loadMatrix();
  const pagePerm = matrix[pathname];
  if (!pagePerm) return "VIEW"; // default allow view for undefined pages
  return pagePerm[project]?.[role] ?? "NONE";
}

// Check if user can access a page at all (VIEW or EDIT)
export function canAccessPage(role: UserRole, pathname: string): boolean {
  const pcsbPerm = getPermission(pathname, "PCSB", role);
  const othersPerm = getPermission(pathname, "OTHERS", role);
  return pcsbPerm !== "NONE" || othersPerm !== "NONE";
}

// Check if user can edit on a page for a specific project
export function canEdit(pathname: string, project: ProjectKey, role: UserRole): boolean {
  return getPermission(pathname, project, role) === "EDIT";
}

// ---------------------------------------------------------------------------
// User store (client-side, will be replaced by DB later)
// ---------------------------------------------------------------------------
const STORAGE_KEY = "cms_users_store";

export interface StoredUser {
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  defaultProject?: ProjectKey;
}

// Default seed users (fallback when Supabase is unavailable)
const DEFAULT_USERS: StoredUser[] = [
  { username: "admin", password: "admin009", fullName: "System Administrator", role: "L1", defaultProject: "PCSB" },
];

function getAllUsers(): StoredUser[] {
  if (typeof window === "undefined") return DEFAULT_USERS;
  const stored = safeGetLocal(STORAGE_KEY);
  if (!stored) {
    safeSetLocal(STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  try { return JSON.parse(stored) as StoredUser[]; } catch { return DEFAULT_USERS; }
}

export function getStoredUsers(): StoredUser[] {
  return getAllUsers();
}

export function saveUsers(users: StoredUser[]): void {
  if (typeof window !== "undefined") {
    safeSetLocal(STORAGE_KEY, JSON.stringify(users));
  }
}

// Merge Supabase cms_users into local store
// Supabase users are added, but L1 admin from DEFAULT_USERS is always protected
// Actual columns: username, password_manual, full_name, user_level, assigned_project
export function mergeSupabaseUsers(supabaseUsers: { username: string; password_manual: string; full_name: string; user_level: string; assigned_project: string }[]): StoredUser[] {
  if (supabaseUsers.length === 0) return getAllUsers();

  // Convert Supabase column names to StoredUser format
  const sbUsers: StoredUser[] = supabaseUsers.map(u => ({
    username: u.username.toLowerCase(),
    password: u.password_manual,
    fullName: u.full_name,
    role: u.user_level as UserRole,
    defaultProject: (u.assigned_project || "PCSB") as ProjectKey,
  }));

  // Start with DEFAULT_USERS as base, then overlay Supabase users
  // EXCEPT: never let Supabase overwrite the hardcoded "admin" L1 account
  const merged = new Map<string, StoredUser>();
  for (const u of DEFAULT_USERS) merged.set(u.username.toLowerCase(), u);
  for (const u of sbUsers) {
    if (u.username.toLowerCase() === "admin") continue; // protect L1 admin
    merged.set(u.username.toLowerCase(), u);
  }

  const result = Array.from(merged.values());
  saveUsers(result);
  return result;
}

// ---------------------------------------------------------------------------
// Selected project (stored in sessionStorage)
// ---------------------------------------------------------------------------
const PROJECT_KEY = "cms_selected_project";

export function getSelectedProject(): ProjectKey {
  if (typeof window === "undefined") return "PCSB";
  return (safeGetSession(PROJECT_KEY) as ProjectKey) || "PCSB";
}

export function setSelectedProject(project: ProjectKey): void {
  if (typeof window !== "undefined") {
    safeSetSession(PROJECT_KEY, project);
  }
}

// Session timeout in milliseconds (5 minutes)
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LAST_ACTIVITY_KEY = "cms_last_activity";

export function login(username: string, password: string): AuthUser | null {
  const users = getAllUsers();
  const found = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  if (found) {
    const authUser: AuthUser = {
      username: found.username.toLowerCase(),
      fullName: found.fullName,
      role: found.role,
      defaultProject: found.defaultProject,
    };
    if (typeof window !== "undefined") {
      safeSetSession("cms_auth_user", JSON.stringify(authUser));
      safeSetSession(LAST_ACTIVITY_KEY, Date.now().toString());
      if (found.defaultProject) {
        setSelectedProject(found.defaultProject);
      }
    }
    return authUser;
  }
  return null;
}

export function logout(): void {
  if (typeof window !== "undefined") {
    safeRemoveSession("cms_auth_user");
    safeRemoveSession(LAST_ACTIVITY_KEY);
  }
}

// Preview bypass: in-memory flag for v0 embedded preview where sessionStorage is blocked
const PREVIEW_USER: AuthUser = { username: "admin", fullName: "Preview Admin", role: "L1", defaultProject: "PCSB" };
function isV0Preview(): boolean {
  return typeof window !== "undefined" && window.location.hostname.includes("vusercontent.net");
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  
  // Preview bypass: skip storage entirely in embedded v0 preview
  if (isV0Preview()) return PREVIEW_USER;

  // Check for session timeout
  const lastActivity = safeGetSession(LAST_ACTIVITY_KEY);
  if (lastActivity) {
    const elapsed = Date.now() - parseInt(lastActivity, 10);
    if (elapsed > SESSION_TIMEOUT) {
      logout();
      return null;
    }
  }
  
  const stored = safeGetSession("cms_auth_user");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as AuthUser;
      // Force re-login if stored session has old role format
      const validRoles: UserRole[] = ["L1","L2A","L2B","L4","L5A","L5B","L6","L7"];
      if (!validRoles.includes(parsed.role)) {
        logout();
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export function isAuthenticated(): boolean {
  return getUser() !== null;
}

// Update last activity timestamp
export function updateActivity(): void {
  if (typeof window !== "undefined" && isAuthenticated()) {
    safeSetSession(LAST_ACTIVITY_KEY, Date.now().toString());
  }
}

// Setup idle timeout listener - call this once in app shell
let idleTimer: ReturnType<typeof setTimeout> | null = null;

export function setupIdleTimeout(onTimeout: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  
  const resetTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    updateActivity();
    idleTimer = setTimeout(() => {
      logout();
      onTimeout();
    }, SESSION_TIMEOUT);
  };
  
  // Events that reset the idle timer
  const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click"];
  
  events.forEach((event) => {
    window.addEventListener(event, resetTimer, { passive: true });
  });
  
  // Start the timer
  resetTimer();
  
  // Cleanup function
  return () => {
    if (idleTimer) clearTimeout(idleTimer);
    events.forEach((event) => {
      window.removeEventListener(event, resetTimer);
    });
  };
}
