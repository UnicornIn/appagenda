// app/comisiones/page.tsx
"use client";

import { Sidebar } from "../../../components/Layout/Sidebar";
import { PageHeader } from "../../../components/Layout/PageHeader";
import { ComisionesPendientes } from "./comisiones-pendientes";

export default function ComisionesPage() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-8">
          <PageHeader title="Comisiones" />

          {/* Content */}
          <ComisionesPendientes />
        </div>
      </div>
    </div>
  );
}
