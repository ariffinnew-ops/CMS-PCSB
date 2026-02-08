"use client";

import dynamic from "next/dynamic";

const FinancialDashboard = dynamic(
  () => import("@/components/financial-dashboard"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
      </div>
    ),
  }
);

export default function FinancialPage() {
  return <FinancialDashboard />;
}
