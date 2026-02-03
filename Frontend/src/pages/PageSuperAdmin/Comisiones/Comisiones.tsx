// app/comisiones/page.tsx
"use client";

import { Sidebar } from "../../../components/Layout/Sidebar";
import { ComisionesPendientes } from "./comisiones-pendientes";

export default function ComisionesPage() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-8">
          {/* Header */}
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-lg bg-gray-100 p-2">
              <svg
                className="h-6 w-6 text-gray-800"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            <div>
              <h1 className="text-xl font-semibold text-gray-900">Comisiones</h1>
            </div>
          </div>

          {/* Content */}
          <ComisionesPendientes />
        </div>
      </div>
    </div>
  );
}
