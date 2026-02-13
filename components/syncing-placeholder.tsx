"use client";

import type { ProjectKey } from "@/lib/auth";

/**
 * Shown when the selected project's data source doesn't exist yet
 * (e.g. cms_others_roster table not created).
 */
export function SyncingPlaceholder({ project, label }: { project: ProjectKey; label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-background border border-border rounded-2xl shadow-lg px-10 py-10 max-w-md text-center">
        {/* Sync icon */}
        <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-blue-600 animate-spin" style={{ animationDuration: "2s" }}>
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h3 className="text-lg font-black text-foreground uppercase tracking-wide mb-2">
          Data Synchronizing
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {label || "Roster"} data for <span className="font-bold text-foreground">{project}</span> project is currently being set up. Please check back shortly.
        </p>
      </div>
    </div>
  );
}
