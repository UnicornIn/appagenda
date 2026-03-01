import { useState, useEffect } from "react";
import { Plus, Loader } from "lucide-react";
import { SedesList } from "./sedes-list";
import { SedeFormModal } from "./sede-form-modal";
import type { Sede } from "../../../types/sede";
import { sedeService } from "./sedeService";
import { useAuth } from "../../../components/Auth/AuthContext";
import { Sidebar } from "../../../components/Layout/Sidebar";
import { PageHeader } from "../../../components/Layout/PageHeader";

export default function SedesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSede, setSelectedSede] = useState<Sede | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, isLoading: authLoading } = useAuth();

  const loadSedes = async () => {
    if (!user?.access_token) {
      setError('No hay token de autenticación disponible');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const sedesData = await sedeService.getSedes(user.access_token);
      setSedes(sedesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las sedes');
      console.error('Error loading sedes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      loadSedes();
    }
  }, [user, authLoading]);

  const handleAddSede = () => {
    setSelectedSede(null);
    setIsModalOpen(true);
  };

  const handleEditSede = (sede: Sede) => {
    setSelectedSede(sede);
    setIsModalOpen(true);
  };

  const handleSaveSede = async (sedeData: Sede) => {
    if (!user?.access_token) {
      setError('No hay token de autenticación disponible');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      if (selectedSede) {
        const response = await sedeService.updateSede(
          user.access_token, 
          selectedSede.sede_id,
          {
            nombre: sedeData.nombre,
            direccion: sedeData.direccion,
            informacion_adicional: sedeData.informacion_adicional,
            zona_horaria: sedeData.zona_horaria,
            telefono: sedeData.telefono,
            email: sedeData.email,
            activa: sedeData.activa
          }
        );

        setSedes(sedes.map((s) => (s.sede_id === response.sede_id ? response : s)));
      } else {
        const response = await sedeService.createSede(user.access_token, {
          nombre: sedeData.nombre,
          direccion: sedeData.direccion,
          informacion_adicional: sedeData.informacion_adicional,
          zona_horaria: sedeData.zona_horaria,
          telefono: sedeData.telefono,
          email: sedeData.email
        });

        setSedes([...sedes, response]);
      }

      setIsModalOpen(false);
      setSelectedSede(null);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la sede');
      console.error('Error saving sede:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSede = async (sedeId: string) => {
    if (!user?.access_token) {
      setError('No hay token de autenticación disponible');
      return;
    }

    try {
      const sedeToDelete = sedes.find(s => s._id === sedeId);
      if (!sedeToDelete) {
        throw new Error('Sede no encontrada');
      }

      await sedeService.deleteSede(user.access_token, sedeToDelete.sede_id);
      setSedes(sedes.filter((s) => s._id !== sedeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la sede');
      console.error('Error deleting sede:', err);
    }
  };

  const handleRetry = () => {
    loadSedes();
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-2">No autenticado</div>
          <div className="text-sm text-gray-600">Inicia sesión para continuar</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      
      <main className="flex-1 lg:ml-0 overflow-auto">
        <div className="w-full min-h-screen overflow-auto lg:mt-0 mt-16">
          {isLoading ? (
            <div className="flex min-h-screen items-center justify-center">
              <Loader className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex min-h-screen items-center justify-center">
              <div className="text-center">
                <div className="mb-2">Error</div>
                <div className="text-sm text-gray-600 mb-4">{error}</div>
                <button
                  onClick={handleRetry}
                  className="px-3 py-1 border border-black text-sm hover:bg-gray-50"
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl px-4 py-8">
              <PageHeader
                title="Sedes"
                subtitle={`${sedes.length} sedes en total`}
                actions={
                  <button
                    onClick={handleAddSede}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-gray-900 text-white text-sm hover:bg-gray-800"
                  >
                    <Plus className="w-4 h-4" />
                    Añadir sede
                  </button>
                }
              />

              <SedesList 
                sedes={sedes} 
                onEdit={handleEditSede} 
                onDelete={handleDeleteSede} 
              />

              <SedeFormModal
                isOpen={isModalOpen}
                onClose={() => {
                  setIsModalOpen(false);
                  setSelectedSede(null);
                }}
                onSave={handleSaveSede}
                sede={selectedSede}
                isSaving={isSaving}
              />
            </div>    
          )}
        </div>
      </main>
    </div>
  );
}
