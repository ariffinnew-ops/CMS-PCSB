"use client";

// ---------------------------------------------------------------------------
// Role system: L1 (Super Admin) through L7
// ---------------------------------------------------------------------------
export type UserRole = "L1" | "L2A" | "L2B" | "L4" | "L5" | "L6" | "L7";

// Keep legacy aliases so existing code that checks "admin" / "datalogger" still compiles
export type LegacyRole = "admin" | "datalogger" | "guest";

export type ProjectKey = "PCSB" | "OTHERS";

export interface AuthUser {
  username: string;
  fullName: string;
  role: UserRole;
  defaultProject?: ProjectKey;
}

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
  L5: 5,
  L6: 6,
  L7: 7,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  L1: "Super Admin",
  L2A: "Data Lodger (PCSB)",
  L2B: "Data Lodger (Others)",
  L4: "PMT",
  L5: "Project Manager",
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

const perm = (l1: PermissionLevel, l2a: PermissionLevel, l2b: PermissionLevel, l4: PermissionLevel, l5: PermissionLevel, l6: PermissionLevel, l7: PermissionLevel): Record<UserRole, PermissionLevel> => ({
  L1: l1, L2A: l2a, L2B: l2b, L4: l4, L5: l5, L6: l6, L7: l7,
});

const DEFAULT_PERMISSION_MATRIX: Record<string, PagePermission> = {
  "/dashboard":  { PCSB: perm("EDIT","VIEW","VIEW","VIEW","VIEW","VIEW","VIEW"), OTHERS: perm("EDIT","VIEW","VIEW","VIEW","VIEW","VIEW","VIEW") },
  "/roster":     { PCSB: perm("EDIT","VIEW","VIEW","VIEW","VIEW","NONE","NONE"), OTHERS: perm("EDIT","VIEW","VIEW","VIEW","VIEW","NONE","NONE") },
  "/training":   { PCSB: perm("EDIT","EDIT","VIEW","EDIT","VIEW","NONE","NONE"), OTHERS: perm("EDIT","VIEW","EDIT","EDIT","VIEW","NONE","NONE") },
  "/staff":      { PCSB: perm("EDIT","EDIT","VIEW","EDIT","VIEW","NONE","NONE"), OTHERS: perm("EDIT","VIEW","EDIT","EDIT","VIEW","NONE","NONE") },
  "/statement":  { PCSB: perm("EDIT","VIEW","NONE","VIEW","VIEW","VIEW","VIEW"), OTHERS: perm("EDIT","NONE","VIEW","VIEW","VIEW","VIEW","VIEW") },
  "/financial":  { PCSB: perm("EDIT","VIEW","NONE","VIEW","VIEW","VIEW","VIEW"), OTHERS: perm("EDIT","NONE","VIEW","VIEW","VIEW","VIEW","VIEW") },
  "/admin":      { PCSB: perm("EDIT","EDIT","VIEW","VIEW","VIEW","NONE","NONE"), OTHERS: perm("EDIT","VIEW","EDIT","VIEW","VIEW","NONE","NONE") },
  "/users":      { PCSB: perm("EDIT","NONE","NONE","NONE","NONE","NONE","NONE"), OTHERS: perm("EDIT","NONE","NONE","NONE","NONE","NONE","NONE") },
  "/logs":       { PCSB: perm("EDIT","NONE","NONE","NONE","NONE","NONE","NONE"), OTHERS: perm("EDIT","NONE","NONE","NONE","NONE","NONE","NONE") },
};

const MATRIX_STORAGE_KEY = "cms_permission_matrix";

function loadMatrix(): Record<string, PagePermission> {
  if (typeof window === "undefined") return DEFAULT_PERMISSION_MATRIX;
  const stored = localStorage.getItem(MATRIX_STORAGE_KEY);
  if (!stored) return DEFAULT_PERMISSION_MATRIX;
  try { return JSON.parse(stored) as Record<string, PagePermission>; } catch { return DEFAULT_PERMISSION_MATRIX; }
}

export function getPermissionMatrix(): Record<string, PagePermission> {
  return loadMatrix();
}

export function savePermissionMatrix(matrix: Record<string, PagePermission>): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(MATRIX_STORAGE_KEY, JSON.stringify(matrix));
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

// Default seed users
const DEFAULT_USERS: StoredUser[] = [
  { username: "admin", password: "admin999", fullName: "System Administrator", role: "L1", defaultProject: "PCSB" },
  { username: "datalogger", password: "data999", fullName: "Data Logger PCSB", role: "L2A", defaultProject: "PCSB" },
  { username: "guest", password: "guest999", fullName: "Guest User", role: "L4", defaultProject: "PCSB" },
];

function getAllUsers(): StoredUser[] {
  if (typeof window === "undefined") return DEFAULT_USERS;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  try { return JSON.parse(stored) as StoredUser[]; } catch { return DEFAULT_USERS; }
}

export function getStoredUsers(): StoredUser[] {
  return getAllUsers();
}

export function saveUsers(users: StoredUser[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  }
}

// ---------------------------------------------------------------------------
// Selected project (stored in sessionStorage)
// ---------------------------------------------------------------------------
const PROJECT_KEY = "cms_selected_project";

export function getSelectedProject(): ProjectKey {
  if (typeof window === "undefined") return "PCSB";
  return (sessionStorage.getItem(PROJECT_KEY) as ProjectKey) || "PCSB";
}

export function setSelectedProject(project: ProjectKey): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(PROJECT_KEY, project);
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
      sessionStorage.setItem("cms_auth_user", JSON.stringify(authUser));
      sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      // Set default project on login
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
    sessionStorage.removeItem("cms_auth_user");
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
  }
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  
  // Check for session timeout
  const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY);
  if (lastActivity) {
    const elapsed = Date.now() - parseInt(lastActivity, 10);
    if (elapsed > SESSION_TIMEOUT) {
      // Session expired due to inactivity
      logout();
      return null;
    }
  }
  
  const stored = sessionStorage.getItem("cms_auth_user");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as AuthUser;
      // Force re-login if stored session has old role format
      const validRoles: UserRole[] = ["L1","L2A","L2B","L4","L5","L6","L7"];
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
    sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
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
