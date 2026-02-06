"use client";

import React from "react"

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getUser, logout, canAccessPage, setupIdleTimeout, type AuthUser, type UserRole } from "@/lib/auth";
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
  { id: "dashboard", label: "Dashboard", href: "/dashboard", roles: ["admin", "datalogger", "guest"] },
  { id: "roster", label: "Roster", href: "/roster", roles: ["admin", "datalogger", "guest"] },
  { id: "training", label: "Training Matrix", href: "/training", roles: ["admin", "datalogger", "guest"] },
  { id: "staff", label: "Staff", href: "/staff", roles: ["admin", "datalogger", "guest"] },
  { id: "admin", label: "Data Manager", href: "/admin", roles: ["admin", "datalogger"] },
  { id: "logs", label: "Login Logs", href: "/logs", roles: ["admin"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const currentUser = getUser();
    if (!currentUser) {
      router.push("/login");
      return;
    }
    
    if (!canAccessPage(currentUser.role, pathname)) {
      router.push("/dashboard");
      return;
    }
    
    setUser(currentUser);
    setIsLoading(false);
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

  const navItems = user ? allNavItems.filter(item => item.roles.includes(user.role)) : [];

  const handleLogout = () => {
    logout();
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
      case "admin": return "text-amber-400";
      case "datalogger": return "text-blue-400";
      default: return "text-slate-500";
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case "admin": return "Administrator";
      case "datalogger": return "Data Logger";
      default: return "Guest";
    }
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
          <div className="flex items-center gap-6">
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

          <div className="hidden lg:flex items-center gap-2">
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
                    <span className="text-xs font-semibold capitalize">{user?.username}</span>
                    <span className={cn("text-[9px] font-medium uppercase tracking-wide", getRoleBadgeColor(user?.role || "guest"))}>
                      {getRoleLabel(user?.role || "guest")}
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
                    <p className="text-sm font-medium capitalize">{user?.username}</p>
                    <p className="text-xs text-muted-foreground">{getRoleLabel(user?.role || "guest")}</p>
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
                <p className="text-sm font-semibold text-white capitalize">{user?.username}</p>
                <p className={cn("text-xs font-medium uppercase", getRoleBadgeColor(user?.role || "guest"))}>
                  {getRoleLabel(user?.role || "guest")}
                </p>
              </div>
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
    </div>
  );
}
