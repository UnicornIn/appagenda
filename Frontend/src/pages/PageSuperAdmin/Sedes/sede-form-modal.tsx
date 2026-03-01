"use client"

import { useState, useEffect } from "react"
import { X, Loader } from 'lucide-react'
import type { Sede } from "../../../types/sede"

interface SedeFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (sede: Sede) => void
  sede: Sede | null
  isSaving?: boolean
}

export function SedeFormModal({ isOpen, onClose, onSave, sede,  isSaving = false }: SedeFormModalProps) {
  const [formData, setFormData] = useState<Partial<Sede>>({
    nombre: "",
    direccion: "",
    informacion_adicional: "",
    zona_horaria: "Bogota",
    telefono: "",
    email: "",
    activa: true
  })

  // Resetear el formulario cuando se abre/cierra el modal o cambia la sede
  useEffect(() => {
    if (isOpen) {
      if (sede) {
        // Modo edición: cargar datos de la sede existente
        setFormData({
          nombre: sede.nombre,
          direccion: sede.direccion,
          informacion_adicional: sede.informacion_adicional,
          zona_horaria: sede.zona_horaria,
          telefono: sede.telefono,
          email: sede.email,
          activa: sede.activa
        })
      } else {
        // Modo creación: resetear a valores por defecto
        setFormData({
          nombre: "",
          direccion: "",
          informacion_adicional: "",
          zona_horaria: "Bogota",
          telefono: "",
          email: "",
          activa: true
        })
      }
    }
  }, [sede, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validar campos requeridos
    if (!formData.nombre || !formData.direccion || !formData.telefono || !formData.email) {
      alert("Por favor completa todos los campos requeridos")
      return
    }

    try {
      if (sede) {
        // Modo edición: mantener todos los campos existentes y actualizar solo los modificados
        const sedeData: Sede = {
          ...sede, // Mantener todos los campos originales (IDs, fechas, etc.)
          nombre: formData.nombre!,
          direccion: formData.direccion!,
          informacion_adicional: formData.informacion_adicional || "",
          zona_horaria: formData.zona_horaria!,
          telefono: formData.telefono!,
          email: formData.email!,
          activa: formData.activa!
        }
        await onSave(sedeData)
      } else {
        // Modo creación: enviar solo los campos básicos, el backend generará los IDs
        const sedeData: Sede = {
          _id: "", // Será generado por el backend
          sede_id: "", // Será generado por el backend
          fecha_creacion: new Date().toISOString(), // El backend puede sobreescribir esto
          creado_por: "admin", // El backend puede sobreescribir esto
          nombre: formData.nombre!,
          direccion: formData.direccion!,
          informacion_adicional: formData.informacion_adicional || "",
          zona_horaria: formData.zona_horaria!,
          telefono: formData.telefono!,
          email: formData.email!,
          activa: true // Las nuevas sedes siempre son activas
        }
        await onSave(sedeData)
      }

      // Recargar la página después de guardar exitosamente
      window.location.reload()
      
    } catch (error) {
      console.error("Error al guardar la sede:", error)
      // No recargar la página si hay error
    }
  }

  // Cerrar el modal si no está abierto
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {sede ? "Editar sede" : "Añadir sede"}
          </h2>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nombre de la sede *
            </label>
            <input
              type="text"
              value={formData.nombre || ""}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[oklch(0.55_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.25_280)]/20"
              required
              disabled={isSaving}
              placeholder="Ej: Sede Principal"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Dirección *
            </label>
            <input
              type="text"
              value={formData.direccion || ""}
              onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[oklch(0.55_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.25_280)]/20"
              required
              disabled={isSaving}
              placeholder="Ej: Calle 123 #45-67"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Información adicional
            </label>
            <textarea
              value={formData.informacion_adicional || ""}
              onChange={(e) => setFormData({ ...formData, informacion_adicional: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[oklch(0.55_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.25_280)]/20"
              rows={3}
              disabled={isSaving}
              placeholder="Información adicional sobre la sede..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Teléfono *
              </label>
              <input
                type="tel"
                value={formData.telefono || ""}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[oklch(0.55_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.25_280)]/20"
                required
                disabled={isSaving}
                placeholder="Ej: 6011234567"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email *
              </label>
              <input
                type="email"
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[oklch(0.55_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.25_280)]/20"
                required
                disabled={isSaving}
                placeholder="Ej: contacto@sede.com"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Zona horaria *
            </label>
            <select
              value={formData.zona_horaria || "Bogota"}
              onChange={(e) => setFormData({ ...formData, zona_horaria: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[oklch(0.55_0.25_280)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.25_280)]/20"
              required
              disabled={isSaving}
            >
              <option value="Bogota">Bogotá</option>
              <option value="Madrid">Madrid</option>
              <option value="New_York">New York</option>
              <option value="London">London</option>
            </select>
          </div>

          {sede && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="activa"
                checked={formData.activa || false}
                onChange={(e) => setFormData({ ...formData, activa: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-[oklch(0.55_0.25_280)] focus:ring-[oklch(0.55_0.25_280)]"
                disabled={isSaving}
              />
              <label htmlFor="activa" className="text-sm font-medium text-gray-700">
                Sede activa
              </label>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-gray-300 px-6 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-2 font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                sede ? "Guardar cambios" : "Crear sede"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
