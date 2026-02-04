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
      localStorage.setItem("cms_auth_user", JSON.stringify(authUser));
    }
    return authUser;
  }
  return null;
}

export function logout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("cms_auth_user");
  }
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("cms_auth_user");
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
