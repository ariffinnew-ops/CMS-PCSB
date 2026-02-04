"use client";

export type UserRole = "admin" | "guest";

export interface AuthUser {
  username: string;
  role: UserRole;
}

const USERS: Record<string, { password: string; role: UserRole }> = {
  admin: { password: "admin999", role: "admin" },
  guest: { password: "guest999", role: "guest" },
};

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
