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
      if (isAuthenticated()) {
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
