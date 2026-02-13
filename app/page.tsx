"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export default function RootPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      // Preview bypass: auto-login as L1 and go straight to dashboard
      const isPreview = typeof window !== "undefined" && window.location.hostname.includes("vusercontent.net");
      if (isPreview && !isAuthenticated()) {
        sessionStorage.setItem("cms_user", JSON.stringify({ username: "admin", fullName: "Preview Admin", role: "L1", defaultProject: "PCSB" }));
      }
      if (isAuthenticated() || isPreview) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    }
  }, [mounted, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
    </div>
  );
}
