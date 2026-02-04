"use client";

export type UserRole = "admin" | "datalogger" | "guest";

export interface AuthUser {
  username: string;
  role: UserRole;
}

export interface LoginLog {
  id?: number;
  username: string;
  role: string;
  timestamp: string;
  success: boolean;
}

// Role hierarchy: admin (1) > datalogger (2) > guest (3)
export const ROLE_LEVELS: Record<UserRole, number> = {
  admin: 1,
  datalogger: 2,
  guest: 3,
};

const USERS: Record<string, { password: string; role: UserRole }> = {
  admin: { password: "admin999", role: "admin" },
  datalogger: { password: "data999", role: "datalogger" },
  guest: { password: "guest999", role: "guest" },
};

// Page access by role
export const PAGE_ACCESS: Record<string, UserRole[]> = {
  "/dashboard": ["admin", "datalogger", "guest"],
  "/roster": ["admin", "datalogger", "guest"],
  "/training": ["admin", "datalogger", "guest"],
  "/staff": ["admin", "datalogger", "guest"],
  "/admin": ["admin", "datalogger"],
  "/logs": ["admin"],
};

// Session timeout in milliseconds (5 minutes)
const SESSION_TIMEOUT = 5 * 60 * 1000;
const LAST_ACTIVITY_KEY = "cms_last_activity";

export function canAccessPage(role: UserRole, pathname: string): boolean {
  const allowedRoles = PAGE_ACCESS[pathname];
  if (!allowedRoles) return true; // Default allow if not defined
  return allowedRoles.includes(role);
}

export function login(username: string, password: string): AuthUser | null {
  const user = USERS[username.toLowerCase()];
  if (user && user.password === password) {
    const authUser: AuthUser = { username: username.toLowerCase(), role: user.role };
    if (typeof window !== "undefined") {
      // Use sessionStorage so it clears when browser closes
      sessionStorage.setItem("cms_auth_user", JSON.stringify(authUser));
      sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
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
      return JSON.parse(stored) as AuthUser;
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
