"use client";

import { useState, useEffect } from "react";
import { getSelectedProject, type ProjectKey } from "@/lib/auth";

/**
 * Reactively tracks the selected project from AppShell's project selector.
 * Polls sessionStorage every 300ms (sessionStorage doesn't fire storage events in the same tab).
 */
export function useProject(): ProjectKey {
  const [project, setProject] = useState<ProjectKey>(getSelectedProject());

  useEffect(() => {
    const sync = () => {
      const current = getSelectedProject();
      setProject((prev) => (prev !== current ? current : prev));
    };
    window.addEventListener("storage", sync);
    const interval = setInterval(sync, 300);
    return () => {
      window.removeEventListener("storage", sync);
      clearInterval(interval);
    };
  }, []);

  return project;
}
