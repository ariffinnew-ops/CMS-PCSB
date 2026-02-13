"use client";

import React from "react"

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getUser, logout, canAccessPage, getFirstAccessiblePage, getPermission, setupIdleTimeout, getSelectedProject, setSelectedProject, savePermissionMatrix, ROLE_LABELS, type AuthUser, type UserRole, type ProjectKey } from "@/lib/auth";
import { getMaintenanceMode, setMaintenanceMode, signOutServer, getAccessMatrixAsAppFormat } from "@/lib/actions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  id: string;
  label: string;
  href: string;
  roles: UserRole[];
}

const allNavItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", roles: ["L1","L2A","L2B","L4","L5A","L5B","L6","L7"] },
  { id: "roster", label: "Roster", href: "/roster", roles: ["L1","L2A","L2B","L4","L5A","L5B"] },
  { id: "training", label: "Training Matrix", href: "/training", roles: ["L1","L2A","L2B","L4","L5A","L5B"] },
  { id: "staff", label: "Staff Detail", href: "/staff", roles: ["L1","L2A","L2B","L4","L5A","L5B"] },
  { id: "statement", label: "Statement", href: "/statement", roles: ["L1","L2A","L2B","L4","L5A","L5B","L6","L7"] },
  { id: "financial", label: "Financial", href: "/financial", roles: ["L1","L2A","L2B","L4","L5A","L5B","L6","L7"] },
  { id: "admin", label: "Data Manager", href: "/admin", roles: ["L1","L2A","L2B"] },
  { id: "users", label: "User Mgmt", href: "/users", roles: ["L1"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setProject] = useState<ProjectKey>("PCSB");
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [showMaintPanel, setShowMaintPanel] = useState(false);
  const [togglingMaint, setTogglingMaint] = useState(false);

  // Sync project from session on mount + check maintenance
  useEffect(() => {
    setProject(getSelectedProject());
    getMaintenanceMode().then(setMaintenanceOn).catch(() => {});
  }, []);

  const handleToggleMaintenance = async () => {
    setTogglingMaint(true);
    const newVal = !maintenanceOn;
    const res = await setMaintenanceMode(newVal);
    if (res.success) setMaintenanceOn(newVal);
    setTogglingMaint(false);
  };

  const handleProjectSwitch = (proj: ProjectKey) => {
    setProject(proj);
    setSelectedProject(proj);
  };

  useEffect(() => {
    const currentUser = getUser();
    if (!currentUser) {
      router.push("/login");
      return;
    }

    // Fetch access matrix from Supabase, sync to localStorage, then check access
    const initSession = async () => {
      try {
        const dbMatrix = await getAccessMatrixAsAppFormat();
        if (dbMatrix && Object.keys(dbMatrix).length > 0) {
          // Sync Supabase matrix -> localStorage so canAccessPage / getPermission use it
          savePermissionMatrix(dbMatrix as any);
        }
      } catch {
        // Supabase unavailable -- fall through to DEFAULT_PERMISSION_MATRIX
      }

      if (!canAccessPage(currentUser.role, pathname)) {
        const fallback = getFirstAccessiblePage(currentUser.role);
        router.push(fallback);
        return;
      }

      // Check maintenance mode -- kick non-L1 users back to login
      if (currentUser.role !== "L1") {
        try {
          const isMaintenance = await Promise.race([
            getMaintenanceMode(),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
          ]);
          if (isMaintenance) {
            logout();
            router.push("/login");
            return;
          }
        } catch {
          // Allow access if maintenance check fails
        }
      }

      setUser(currentUser);
      setIsLoading(false);
    };

    initSession();
  }, [router, pathname]);

  useEffect(() => {
    if (!user) return;
    
    const cleanup = setupIdleTimeout(() => {
      toast({
        title: "Session Expired",
        description: "You have been logged out due to inactivity.",
        variant: "destructive",
      });
      router.push("/login");
    });
    
    return cleanup;
  }, [user, router, toast]);

  // Filter nav: hide pages where the user has NO ACCESS in BOTH projects
  const navItems = user ? allNavItems.filter(item => {
    const pcsbPerm = getPermission(item.href, "PCSB", user.role);
    const othersPerm = getPermission(item.href, "OTHERS", user.role);
    return pcsbPerm !== "NONE" || othersPerm !== "NONE";
  }) : [];

  const handleLogout = async () => {
    logout(); // clear client session + cookies
    try { await signOutServer(); } catch { /* server sign-out best-effort */ }
    router.push("/login");
  };

  const getActiveId = () => {
    if (pathname === "/dashboard" || pathname === "/") return "dashboard";
    const segment = pathname.split("/")[1];
    return segment || "dashboard";
  };

  const activeId = getActiveId();

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case "L1": return "text-amber-400";
      case "L2A": case "L2B": return "text-blue-400";
      case "L4": return "text-emerald-400";
      case "L5A": case "L5B": return "text-purple-400";
      case "L6": case "L7": return "text-cyan-400";
      default: return "text-slate-500";
    }
  };

  const getRoleLabel = (role: UserRole) => {
    return ROLE_LABELS[role] || role;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted text-foreground">
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo + Project Switcher group */}
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="flex items-center group">
                <div className="bg-white px-4 py-2 rounded-lg shadow-lg transform group-hover:scale-[1.02] transition-all">
                  <Image
                    src="https://cptffqgvibhwjzvklual.supabase.co/storage/v1/object/public/branding/BOSH%20LOGO-trf.png"
                    alt="Company Logo"
                    width={160}
                    height={40}
                    className="h-8 w-auto"
                    style={{ objectFit: 'contain' }}
                    priority
                  />
                </div>
              </Link>
            </div>

            {/* Project Toggle */}
            <div className="hidden lg:flex items-center bg-slate-900 rounded-lg border border-slate-700 p-0.5">
              <button
                type="button"
                onClick={() => handleProjectSwitch("PCSB")}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                  selectedProject === "PCSB"
                    ? "bg-emerald-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                )}
              >
                PCSB
              </button>
              <button
                type="button"
                onClick={() => handleProjectSwitch("OTHERS")}
                className={cn(
                  "px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                  selectedProject === "OTHERS"
                    ? "bg-orange-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                )}
              >
                Others
              </button>
            </div>

            <div className="hidden lg:block w-px h-8 bg-slate-800" />

            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-all duration-200",
                    activeId === item.id
                      ? "text-white bg-blue-600/20 border border-blue-500/30"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <button
            type="button"
            className="lg:hidden text-white p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          <div className="hidden lg:flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 text-slate-300 hover:text-white hover:bg-white/10 px-2 py-1.5 h-auto"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xs uppercase">
                    {user?.username?.charAt(0) || "U"}
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-xs font-semibold lowercase">{user?.username}</span>
                    <span className={cn("text-[9px] font-medium tracking-wide", getRoleBadgeColor(user?.role || "L4"))}>
                      {getRoleLabel(user?.role || "L4")}
                    </span>
                  </div>
                  <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium lowercase">{user?.username}</p>
                    <p className="text-xs text-muted-foreground">{getRoleLabel(user?.role || "L4")}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-500 cursor-pointer">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden bg-slate-900 border-t border-slate-800 px-4 py-3">
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-slate-800">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xs uppercase">
                {user?.username?.charAt(0) || "U"}
              </div>
              <div>
                <p className="text-sm font-semibold text-white lowercase">{user?.username}</p>
                <p className={cn("text-xs font-medium", getRoleBadgeColor(user?.role || "L4"))}>
                  {getRoleLabel(user?.role || "L4")}
                </p>
              </div>
            </div>

            {/* Mobile Project Toggle */}
            <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5 mb-3">
              <button
                type="button"
                onClick={() => handleProjectSwitch("PCSB")}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                  selectedProject === "PCSB"
                    ? "bg-emerald-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                )}
              >
                PCSB
              </button>
              <button
                type="button"
                onClick={() => handleProjectSwitch("OTHERS")}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                  selectedProject === "OTHERS"
                    ? "bg-orange-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                )}
              >
                Others
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wide transition-all",
                    activeId === item.id
                      ? "text-white bg-blue-600/20 border border-blue-500/30"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wide text-red-400 hover:bg-red-500/10 text-left mt-2"
              >
                Logout
              </button>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 py-4">
        {children}
      </main>

 <footer className="no-print bg-slate-950 border-t border-slate-800 py-2.5 relative">
  <div className="flex items-center justify-center gap-3">
    <p className="text-[11px] text-white font-medium tracking-wide">
      &copy; {new Date().getFullYear()} kawie - Crewing Management System. All Rights Reserved.
    </p>
    {user?.role === "L1" && (
      <button
        type="button"
        onClick={() => setShowMaintPanel(!showMaintPanel)}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all ${
          maintenanceOn
            ? "bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30"
            : "bg-slate-800/50 text-slate-400 border-slate-700 hover:text-cyan-400 hover:border-cyan-500/40"
        }`}
        title="Maintenance Mode"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {maintenanceOn ? "MAINT ON" : "MAINT"}
      </button>
    )}
  </div>

  {/* Maintenance Toggle Panel */}
  {showMaintPanel && user?.role === "L1" && (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-60 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">Maintenance Mode</h3>
        <button type="button" onClick={() => setShowMaintPanel(false)} className="text-slate-500 hover:text-white">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${maintenanceOn ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
          <span className="text-[10px] font-medium text-slate-300">
            {maintenanceOn ? "Maintenance ON" : "System Active"}
          </span>
        </div>
        <button
          type="button"
          onClick={handleToggleMaintenance}
          disabled={togglingMaint}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
            maintenanceOn ? "bg-amber-500" : "bg-slate-600"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
              maintenanceOn ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      {maintenanceOn && (
        <p className="text-[9px] text-amber-400/80 mt-1.5 text-center">Non-L1 users are blocked from login</p>
      )}
    </div>
  )}
 </footer>
    </div>
  );
}
