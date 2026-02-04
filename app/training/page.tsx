"use client";

import { useMemo, useState, Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import { ClientType, TradeType } from "@/lib/types";
import { COMPETENCY_DATA, CREW_DATA } from "@/lib/data";
import { formatDate } from "@/lib/logic";

export default function TrainingPage() {
  const [clientFilter, setClientFilter] = useState<ClientType | "ALL">("ALL");
  const [tradeFilter, setTradeFilter] = useState<TradeType | "ALL">("ALL");
  const courses = ["BOSIET", "APC", "ALS", "BLS"];
  const today = new Date(2026, 11, 31);

  const filteredCrews = useMemo(() => {
    return CREW_DATA.filter((c) => {
      const matchesClient = clientFilter === "ALL" || c.client === clientFilter;
      const matchesTrade = tradeFilter === "ALL" || c.trade === tradeFilter;
      return matchesClient && matchesTrade;
    }).sort(
      (a, b) => a.client.localeCompare(b.client) || a.name.localeCompare(b.name)
    );
  }, [clientFilter, tradeFilter]);

  const getRecord = (name: string, course: string) => {
    return COMPETENCY_DATA.find(
      (r) => r.crew_name === name && r.course_name === course
    );
  };

  const getStatusColor = (expiry: string) => {
    const d = new Date(expiry);
    const diffDays = Math.floor(
      (d.getTime() - today.getTime()) / (1000 * 3600 * 24)
    );

    if (diffDays < 0) return "text-red-600 bg-red-50";
    if (diffDays < 90) return "text-amber-600 bg-amber-50";
    return "text-emerald-600 bg-emerald-50";
  };

  return (
    <AppShell>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">
              Compliance Matrix
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Medical Certification Status Tracking
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={clientFilter}
              onChange={(e) =>
                setClientFilter(e.target.value as ClientType | "ALL")
              }
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm font-semibold outline-none"
            >
              <option value="ALL">All Clients</option>
              <option value="SKA">SKA</option>
              <option value="SBA">SBA</option>
            </select>
            <select
              value={tradeFilter}
              onChange={(e) =>
                setTradeFilter(e.target.value as TradeType | "ALL")
              }
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm font-semibold outline-none"
            >
              <option value="ALL">All Trades</option>
              <option value="OM">OM</option>
              <option value="EM">EM</option>
            </select>
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th
                    rowSpan={2}
                    className="px-6 py-4 border-r border-border text-xs font-bold text-muted-foreground uppercase tracking-wider sticky left-0 bg-muted z-10"
                  >
                    Personnel
                  </th>
                  {courses.map((course) => (
                    <th
                      key={course}
                      colSpan={2}
                      className="px-4 py-2 border-r border-border text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border"
                    >
                      {course}
                    </th>
                  ))}
                </tr>
                <tr className="bg-muted/50 text-[9px] font-bold text-muted-foreground uppercase">
                  {courses.map((course) => (
                    <Fragment key={course}>
                      <th className="px-2 py-2 text-center border-r border-border/50">
                        Attended
                      </th>
                      <th className="px-2 py-2 text-center border-r border-border">
                        Expiry
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredCrews.map((crew, idx) => (
                  <tr key={idx} className="hover:bg-muted/50">
                    <td className="px-6 py-3 border-r border-border/50 sticky left-0 bg-card group-hover:bg-muted/50 z-10">
                      <div className="text-xs font-bold text-foreground">
                        {crew.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {crew.trade} - {crew.client}
                      </div>
                    </td>
                    {courses.map((course) => {
                      const rec = getRecord(crew.name, course);
                      return (
                        <Fragment key={course}>
                          <td className="px-2 py-3 text-[10px] text-center text-muted-foreground border-r border-border/30">
                            {rec ? formatDate(rec.attended_date) : "--"}
                          </td>
                          <td
                            className={`px-2 py-3 text-[10px] font-bold text-center border-r border-border/50 ${
                              rec ? getStatusColor(rec.expiry_date) : ""
                            }`}
                          >
                            {rec ? formatDate(rec.expiry_date) : "--"}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center gap-4 px-4 py-2 bg-card rounded-lg border border-border w-fit text-[10px] font-bold uppercase text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-emerald-100 rounded-sm" />
            Valid
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-amber-100 rounded-sm" />
            {"< "}90 Days
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-red-100 rounded-sm" />
            Expired
          </div>
        </div>
      </div>
    </AppShell>
  );
}
