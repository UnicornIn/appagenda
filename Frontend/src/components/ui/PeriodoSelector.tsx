"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange as RdpDateRange } from "react-day-picker";
import { es } from "date-fns/locale";
import { format } from "date-fns";

export type PeriodoId = "hoy" | "7dias" | "mes" | "30dias" | "rango";

export interface PeriodoSelectorProps {
  periodoActivo: PeriodoId;
  onPeriodoChange: (periodo: PeriodoId, fechas?: { from: Date; to: Date }) => void;
  rangoAplicado?: { from: Date; to: Date };
  className?: string;
}

const OPCIONES: Array<{ id: PeriodoId; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "7dias", label: "7 días" },
  { id: "mes", label: "Mes actual" },
  { id: "30dias", label: "30 días" },
  { id: "rango", label: "Rango" },
];

export function PeriodoSelector({
  periodoActivo,
  onPeriodoChange,
  rangoAplicado,
  className,
}: PeriodoSelectorProps) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<RdpDateRange | undefined>(undefined);
  const rangeButtonRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!rangeOpen) return;
    const handler = (e: MouseEvent) => {
      if (rangeButtonRef.current && !rangeButtonRef.current.contains(e.target as Node)) {
        setRangeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [rangeOpen]);

  // Close on Escape
  useEffect(() => {
    if (!rangeOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRangeOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [rangeOpen]);

  const getRangeButtonLabel = () => {
    if (periodoActivo === "rango" && rangoAplicado) {
      return `${format(rangoAplicado.from, "dd/MM")} – ${format(rangoAplicado.to, "dd/MM")}`;
    }
    return "Rango";
  };

  const handleApply = () => {
    if (draftRange?.from && draftRange?.to) {
      onPeriodoChange("rango", { from: draftRange.from, to: draftRange.to });
      setRangeOpen(false);
    }
  };

  const handleCancel = () => {
    setDraftRange(
      rangoAplicado
        ? { from: rangoAplicado.from, to: rangoAplicado.to }
        : undefined
    );
    setRangeOpen(false);
  };

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className ?? ""}`}>
      <span className="text-xs text-slate-500 font-medium">Período:</span>
      {OPCIONES.map((option) =>
        option.id === "rango" ? (
          <div key="rango" className="relative" ref={rangeButtonRef}>
            <button
              onClick={() => {
                setDraftRange(
                  rangoAplicado
                    ? { from: rangoAplicado.from, to: rangoAplicado.to }
                    : undefined
                );
                setRangeOpen((o) => !o);
              }}
              className={`px-3.5 py-1.5 border rounded-full text-[11px] font-medium transition-colors ${
                periodoActivo === "rango"
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {getRangeButtonLabel()}
            </button>
            {rangeOpen && (
              <div className="rdp-popover">
                <p style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>
                  {!draftRange?.from
                    ? "Selecciona el día de inicio"
                    : !draftRange?.to
                    ? "Ahora selecciona el día fin"
                    : `${format(draftRange.from, "dd/MM/yyyy")} → ${format(draftRange.to, "dd/MM/yyyy")}`}
                </p>
                <DayPicker
                  mode="range"
                  numberOfMonths={1}
                  selected={draftRange}
                  onSelect={setDraftRange}
                  locale={es}
                  disabled={{ after: new Date() }}
                />
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    paddingTop: 12,
                    borderTop: "1px solid #e5e5e5",
                    marginTop: 8,
                  }}
                >
                  <button
                    onClick={handleApply}
                    disabled={!draftRange?.from || !draftRange?.to}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      borderRadius: 8,
                      background: draftRange?.from && draftRange?.to ? "#000" : "#ccc",
                      color: "#fff",
                      border: "none",
                      fontWeight: 500,
                      cursor: draftRange?.from && draftRange?.to ? "pointer" : "not-allowed",
                      fontSize: 14,
                    }}
                  >
                    Aplicar rango
                  </button>
                  <button
                    onClick={handleCancel}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      borderRadius: 8,
                      background: "#fff",
                      border: "1px solid #e5e5e5",
                      fontWeight: 500,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            key={option.id}
            onClick={() => onPeriodoChange(option.id)}
            className={`px-3.5 py-1.5 border rounded-full text-[11px] font-medium transition-colors ${
              periodoActivo === option.id
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        )
      )}
    </div>
  );
}
