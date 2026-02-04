"use client";

import React from "react"

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { id: "dashboard", label: "Dashboard", href: "/" },
  { id: "roster", label: "Roster", href: "/roster" },
  { id: "training", label: "Training", href: "/training" },
  { id: "staff", label: "Staff", href: "/staff" },
  { id: "admin", label: "Data Manager", href: "/admin" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getActiveId = () => {
    if (pathname === "/") return "dashboard";
    const segment = pathname.split("/")[1];
    return segment || "dashboard";
  };

  const activeId = getActiveId();

  return (
    <div className="min-h-screen flex flex-col bg-muted text-foreground">
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-12">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="bg-background p-1.5 w-14 h-14 rounded-xl flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-all overflow-hidden border border-slate-700">
                <span className="text-slate-900 font-black text-xs">BOSH</span>
              </div>
              <div className="flex flex-col">
                <h1 className="font-black text-2xl tracking-tighter text-white uppercase italic leading-none">
                  CMS Portal
                </h1>
                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.3em] mt-1">
                  Personnel Management
                </span>
              </div>
            </Link>

            <nav className="hidden lg:flex items-center gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    "px-6 py-2.5 rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all duration-300",
                    activeId === item.id
                      ? "text-white bg-blue-600/20 shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)] border border-blue-500/30"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="lg:hidden text-white p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>

          <div className="hidden lg:flex items-center gap-6">
            <div className="h-10 w-px bg-white/10 mx-2" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none tracking-tighter">
                Global Hub
              </span>
              <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-tighter italic mt-1">
                Live Telemetry
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-slate-900 border-t border-slate-800 px-4 py-4">
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "px-4 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all",
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
        )}
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 py-8">
        {children}
      </main>
    </div>
  );
}
