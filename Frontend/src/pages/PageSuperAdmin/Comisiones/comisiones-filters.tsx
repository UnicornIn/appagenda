"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Calendar } from "lucide-react";
import { profesionalesService } from "./Api/profesionalesService";
import { Professional } from "../../../types/commissions";
import { sedeService } from "../Sedes/sedeService";
import type { Sede } from "../../../types/sede";
import { formatSedeNombre } from "../../../lib/sede";

interface ComisionesFiltersProps {
  onFiltersChange?: (filters: {
    profesional_id?: string;
    sede?: string;
    nombre?: string;
    estado?: string;
    tipo_comision?: string;
    fecha_inicio?: string;
    fecha_fin?: string;
  }) => void;
}


export function ComisionesFilters({ onFiltersChange }: ComisionesFiltersProps) {
  const [selectedSede, setSelectedSede] = useState<string>("");
  const [estilistaSeleccionado, setEstilistaSeleccionado] =
    useState<string>("placeholder");
  const [tipoComisionSeleccionado, setTipoComisionSeleccionado] =
    useState<string>("placeholder");
  const [fechaInicio, setFechaInicio] = useState<string>("");
  const [fechaFin, setFechaFin] = useState<string>("");

  const [estilistas, setEstilistas] = useState<Professional[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);

  const [cargandoEstilistas, setCargandoEstilistas] = useState(false);
  const [cargandoSedes, setCargandoSedes] = useState(false);

  const [sedeIdMap, setSedeIdMap] = useState<Record<string, string>>({});

  const tiposComision = [
    { id: "placeholder", nombre: "Todos los tipos" },
    { id: "servicios", nombre: "Servicios" },
    { id: "productos", nombre: "Productos" },
    { id: "mixto", nombre: "Mixto" },
  ];

  // ==================================================
  // Cargar sedes
  // ==================================================
  useEffect(() => {
    const cargarSedes = async () => {
      setCargandoSedes(true);
      try {
        const token = sessionStorage.getItem("access_token");
        if (!token) throw new Error("No hay token");

        const sedesData = await sedeService.getSedes(token);
        setSedes(sedesData);

        // Mapa interno: _id → sede_id (SD-XXXX)
        const idMap: Record<string, string> = {};
        sedesData.forEach((sede) => {
          if (sede._id && sede.nombre) {
            idMap[sede._id] = sede.nombre;
          }
        });
        setSedeIdMap(idMap);

        if (sedesData.length === 1) {
          setSelectedSede(sedesData[0]._id);
        }
      } catch (error) {
        console.error("Error cargando sedes:", error);
        setSedes([]);
      } finally {
        setCargandoSedes(false);
      }
    };

    cargarSedes();
  }, []);

  // ==================================================
  // Cargar estilistas por sede
  // ==================================================
  useEffect(() => {
    const cargarEstilistas = async () => {
      if (!selectedSede) {
        setEstilistas([]);
        setEstilistaSeleccionado("placeholder");
        return;
      }

      setCargandoEstilistas(true);
      try {
        const data = await profesionalesService.getProfessionals();
        const sedeApiId = sedeIdMap[selectedSede];

        const filtrados = data.filter((e) =>
          sedeApiId ? e.sede_id === sedeApiId : true
        );

        setEstilistas(filtrados);

        setEstilistaSeleccionado(
          filtrados.length === 1 ? filtrados[0].profesional_id : "placeholder"
        );
      } catch (error) {
        console.error("Error cargando estilistas:", error);
        setEstilistas([]);
        setEstilistaSeleccionado("placeholder");
      } finally {
        setCargandoEstilistas(false);
      }
    };

    cargarEstilistas();
  }, [selectedSede, sedeIdMap]);

  // ==================================================
  // Emitir filtros
  // ==================================================
  useEffect(() => {
    if (!onFiltersChange) return;

    const timer = setTimeout(() => {
      const filters: any = { estado: "pendiente" };

      if (selectedSede && sedeIdMap[selectedSede]) {
        filters.sede_id = sedeIdMap[selectedSede];
      }

      if (
        estilistaSeleccionado &&
        estilistaSeleccionado !== "placeholder"
      ) {
        filters.profesional_id = estilistaSeleccionado;
      }

      if (
        tipoComisionSeleccionado &&
        tipoComisionSeleccionado !== "placeholder"
      ) {
        filters.tipo_comision = tipoComisionSeleccionado;
      }

      if (fechaInicio) filters.fecha_inicio = fechaInicio;
      if (fechaFin) filters.fecha_fin = fechaFin;

      onFiltersChange(filters);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    selectedSede,
    estilistaSeleccionado,
    tipoComisionSeleccionado,
    fechaInicio,
    fechaFin,
    sedeIdMap,
    onFiltersChange,
  ]);

  // ==================================================
  // Fechas por defecto
  // ==================================================
  const formatDate = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;

  const getDefaultDates = () => {
    const hoy = new Date();
    return {
      inicio: formatDate(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
      fin: formatDate(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
    };
  };

  useEffect(() => {
    const { inicio, fin } = getDefaultDates();
    setFechaInicio(inicio);
    setFechaFin(fin);
  }, []);

  // ==================================================
  // UI
  // ==================================================
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:flex-wrap">
      {/* Sede */}
      <div className="min-w-[250px]">
        <Select
          value={selectedSede}
          onValueChange={setSelectedSede}
          disabled={cargandoSedes}
        >
          <SelectTrigger className="w-full bg-white border-gray-300">
            <SelectValue
              placeholder={
                cargandoSedes ? "Cargando sedes..." : "Selecciona una sede *"
              }
            />
          </SelectTrigger>
          <SelectContent className="bg-white border-gray-300 max-h-60">
            <SelectItem value="none" disabled>
              -- Selecciona una sede --
            </SelectItem>
            {sedes.map((sede) => (
              <SelectItem key={sede.nombre} value={sede.nombre}>
                {formatSedeNombre(sede.nombre)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Estado */}
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-100 px-4 py-2.5">
        <span className="text-sm font-medium">Estado:</span>
        <span className="text-sm font-semibold text-gray-700">
          Pendiente
        </span>
      </div>

      {/* Estilista */}
      <div className="min-w-[250px]">
        <Select
          value={estilistaSeleccionado}
          onValueChange={setEstilistaSeleccionado}
          disabled={!selectedSede || cargandoEstilistas}
        >
          <SelectTrigger className="w-full bg-white border-gray-300">
            <SelectValue placeholder="Selecciona un estilista" />
          </SelectTrigger>
          <SelectContent className="bg-white border-gray-300 max-h-60">
            <SelectItem value="placeholder" disabled>
              -- Selecciona un estilista --
            </SelectItem>
            {estilistas.map((e) => (
              <SelectItem
                key={e.profesional_id}
                value={e.profesional_id}
              >
                {e.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tipo */}
      <div className="min-w-[200px]">
        <Select
          value={tipoComisionSeleccionado}
          onValueChange={setTipoComisionSeleccionado}
          disabled={!selectedSede}
        >
          <SelectTrigger className="w-full bg-white border-gray-300">
            <SelectValue placeholder="Tipo de comisión" />
          </SelectTrigger>
          <SelectContent>
            {tiposComision.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fechas */}
      {[["Desde", fechaInicio, setFechaInicio], ["Hasta", fechaFin, setFechaFin]].map(
        ([label, value, setter]: any) => (
          <div
            key={label}
            className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5"
          >
            <Calendar className="h-4 w-4 text-gray-400" />
            <div>
              <span className="text-xs text-gray-500">{label}</span>
              <input
                type="date"
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="text-sm bg-white border-none outline-none"
                disabled={!selectedSede}
              />
            </div>
          </div>
        )
      )}
    </div>
  );
}
