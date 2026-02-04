"use client";

import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { CREW_DATA, MOVEMENT_DATA, COMPETENCY_DATA } from "@/lib/data";
import { formatDate } from "@/lib/logic";

export default function StaffPage() {
  const [selectedName, setSelectedName] = useState(CREW_DATA[0].name);

  const staff = useMemo(
    () => CREW_DATA.find((c) => c.name === selectedName),
    [selectedName]
  );
  const movements = useMemo(
    () =>
      MOVEMENT_DATA.filter((m) => m.crew_name === selectedName).sort((a, b) =>
        b.movement_date.localeCompare(a.movement_date)
      ),
    [selectedName]
  );
  const competencies = useMemo(
    () => COMPETENCY_DATA.filter((c) => c.crew_name === selectedName),
    [selectedName]
  );

  if (!staff) return null;

  return (
    <AppShell>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-3xl font-bold text-foreground tracking-tight">
            Staff Profiles
          </h2>
          <select
            value={selectedName}
            onChange={(e) => setSelectedName(e.target.value)}
            className="bg-card border border-border rounded-lg px-4 py-2 font-semibold text-sm outline-none shadow-sm"
          >
            {CREW_DATA.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="bg-blue-600 h-24" />
              <div className="px-6 pb-6">
                <div className="relative -mt-10">
                  <div className="w-20 h-20 bg-slate-800 rounded-2xl border-4 border-card flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                    {staff.name.charAt(0)}
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-xl font-bold text-foreground">
                    {staff.name}
                  </h3>
                  <p className="text-sm font-semibold text-blue-600 mt-0.5">
                    {staff.trade}
                  </p>
                </div>

                <div className="mt-6 space-y-4 pt-6 border-t border-border">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Assignment
                    </label>
                    <p className="text-sm font-bold text-foreground">
                      {staff.location}
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Client
                    </label>
                    <p className="text-sm font-bold text-foreground">
                      {staff.client} Project
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h4 className="text-sm font-bold text-foreground uppercase tracking-wider mb-6">
                Movement History
              </h4>
              <div className="space-y-4">
                {movements.length > 0 ? (
                  movements.map((m, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                        {i < movements.length - 1 && (
                          <div className="w-px h-full bg-border mt-1" />
                        )}
                      </div>
                      <div className="pb-4">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-bold text-foreground">
                            {m.move_type}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(m.movement_date)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs font-medium text-muted-foreground italic">
                    No movement records found.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h4 className="text-sm font-bold text-foreground uppercase tracking-wider mb-6">
                Certification List
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {competencies.slice(0, 6).map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border"
                  >
                    <div>
                      <p className="text-xs font-bold text-foreground">
                        {c.course_name}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Exp: {formatDate(c.expiry_date)}
                      </p>
                    </div>
                    <div
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        new Date(c.expiry_date) > new Date(2025, 11, 31)
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {new Date(c.expiry_date) > new Date(2025, 11, 31)
                        ? "Valid"
                        : "Expired"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
