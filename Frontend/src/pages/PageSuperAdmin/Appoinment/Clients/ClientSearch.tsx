// components/Quotes/ClientSearch.tsx
import React, { useState, useEffect } from 'react';
import { Search, Plus, User, X } from 'lucide-react';
import { getClientesPorSede, crearCliente, buscarClientesPorSede, Cliente, CrearClienteRequest } from '../../../../components/Quotes/clientsService';
import { useAuth } from '../../../../components/Auth/AuthContext';

const SEARCH_DEBOUNCE_MS = 300;

interface ClientSearchProps {
  sedeId: string;
  selectedClient: Cliente | null;
  onClientSelect: (cliente: Cliente) => void;
  onClientClear: () => void;
  required?: boolean;
}

interface NewClientForm extends CrearClienteRequest {
  nombre: string;
  correo?: string;
  telefono?: string;
  cedula?: string;
  ciudad?: string;
  fecha_de_nacimiento?: string;
  notas?: string;
}

export const ClientSearch: React.FC<ClientSearchProps> = ({
  sedeId,
  selectedClient,
  onClientSelect,
  onClientClear,
  required = true
}) => {
  const { user } = useAuth();
  const [clientSearch, setClientSearch] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newClient, setNewClient] = useState<NewClientForm>({
    nombre: '',
    correo: '',
    telefono: '',
    cedula: '',
    ciudad: '',
    fecha_de_nacimiento: '',
    sede_id: sedeId,
    notas: ''
  });

  // Cargar y buscar clientes (una sola llamada, paginada y con debounce)
  useEffect(() => {
    let cancel = false;

    const buscar = async () => {
      if (!user?.access_token || !sedeId) {
        setClientes([]);
        setLoadingClientes(false);
        return;
      }

      setLoadingClientes(true);
      try {
        const filtro = clientSearch.trim();
        const resultados = filtro
          ? await buscarClientesPorSede(user.access_token, sedeId, filtro, 25)
          : await getClientesPorSede(user.access_token, sedeId, { limite: 25, pagina: 1 });

        if (!cancel) {
          setClientes(resultados);
        }
      } catch (error) {
        if (!cancel) setClientes([]);
      } finally {
        if (!cancel) setLoadingClientes(false);
      }
    };

    const timeoutId = setTimeout(buscar, SEARCH_DEBOUNCE_MS);
    return () => {
      cancel = true;
      clearTimeout(timeoutId);
    };
  }, [clientSearch, user?.access_token, sedeId]);

  // Función para crear nuevo cliente
  const handleCreateClient = async () => {
    if (!newClient.nombre.trim()) {
      setError('El nombre del cliente es requerido');
      return;
    }
    
    if (!user?.access_token) {
      setError('No hay sesión activa');
      return;
    }
    
    setCreatingClient(true);
    setError(null);
    
    try {
      const result = await crearCliente(user.access_token, {
        ...newClient,
        sede_id: sedeId
      });
      
      if (result.success) {
        const clientesActualizados = await getClientesPorSede(user.access_token, sedeId);
        setClientes(clientesActualizados);
        
        onClientSelect(result.cliente);
        setClientSearch(result.cliente.nombre);
        setShowClientModal(false);
        setNewClient({
          nombre: '',
          correo: '',
          telefono: '',
          cedula: '',
          ciudad: '',
          fecha_de_nacimiento: '',
          sede_id: sedeId,
          notas: ''
        });
      }
    } catch (error: any) {
      setError(error.message || "Error al crear cliente");
    } finally {
      setCreatingClient(false);
    }
  };

  const handleSelectClient = (cliente: Cliente) => {
    onClientSelect(cliente);
    setClientSearch(cliente.nombre);
  };

  const handleClearClient = () => {
    onClientClear();
    setClientSearch('');
  };

  const formatDateForInput = (dateString?: string) => {
    if (!dateString) return '';
    return dateString.split('T')[0];
  };

  return (
    <>
      <div className="space-y-1">
        <label className="block text-xs font-semibold text-gray-700">
          Cliente {required && '*'}
        </label>
        
        {/* CLIENTE SELECCIONADO */}
        {selectedClient ? (
          <div className="flex items-center justify-between p-2 bg-gray-50 border border-gray-300 rounded">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-gray-700" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">{selectedClient.nombre}</div>
                <div className="text-xs text-gray-600">
                  {selectedClient.telefono && `📞 ${selectedClient.telefono}`}
                  {selectedClient.correo && ` • 📧 ${selectedClient.correo}`}
                </div>
              </div>
            </div>
            <button 
              onClick={handleClearClient}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* BÚSQUEDA DE CLIENTE */
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar cliente..." 
              value={clientSearch} 
              onChange={(e) => setClientSearch(e.target.value)}
              className="w-full border border-gray-300 rounded px-8 py-2 text-sm focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
            />
            <button 
              onClick={() => setShowClientModal(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            >
              <Plus className="w-4 h-4" />
            </button>
            
            {/* LISTA DE CLIENTES SUGERIDOS */}
            {clientSearch && clientes.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded shadow max-h-48 overflow-y-auto">
                {clientes.map(cliente => (
                  <button 
                    key={cliente.cliente_id}
                    onClick={() => handleSelectClient(cliente)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 border-b border-gray-200 last:border-b-0 flex items-center gap-2"
                  >
                    <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                      <User className="w-3 h-3 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{cliente.nombre}</div>
                      <div className="text-xs text-gray-600">
                        {cliente.telefono && `📞 ${cliente.telefono}`}
                        {cliente.correo && ` • 📧 ${cliente.correo}`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {/* MENSAJES DE ESTADO */}
            {loadingClientes && (
              <div className="mt-1 text-xs text-gray-600">
                🔄 Buscando...
              </div>
            )}
            {clientSearch && clientes.length === 0 && !loadingClientes && (
              <div className="mt-1 text-xs text-gray-600">
                No encontrado. Haz clic en "+" para agregar.
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL PARA CREAR NUEVO CLIENTE */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded border border-gray-300 w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-300">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Nuevo Cliente</h3>
                <button
                  onClick={() => setShowClientModal(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1">Completa los datos del nuevo cliente</p>
            </div>
            
            <div className="p-4 space-y-3">
              {error && (
                <div className="p-2 bg-gray-100 border border-gray-300 rounded text-xs text-gray-700">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700">
                  Nombre completo *
                </label>
                <input
                  type="text"
                  value={newClient.nombre}
                  onChange={(e) => setNewClient({...newClient, nombre: e.target.value})}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                  placeholder="Ej: María González"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-700">
                    Cédula
                  </label>
                  <input
                    type="text"
                    value={newClient.cedula}
                    onChange={(e) => setNewClient({...newClient, cedula: e.target.value})}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                    placeholder="Ej: 123456789"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-700">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={newClient.telefono}
                    onChange={(e) => setNewClient({...newClient, telefono: e.target.value})}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                    placeholder="Ej: 3001234567"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  value={newClient.correo}
                  onChange={(e) => setNewClient({...newClient, correo: e.target.value})}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                  placeholder="Ej: cliente@email.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-700">
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={newClient.ciudad}
                    onChange={(e) => setNewClient({...newClient, ciudad: e.target.value})}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                    placeholder="Ej: Bogotá"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-700">
                    Fecha de nacimiento
                  </label>
                  <input
                    type="date"
                    value={formatDateForInput(newClient.fecha_de_nacimiento)}
                    onChange={(e) => setNewClient({...newClient, fecha_de_nacimiento: e.target.value})}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                  />
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-700">
                  Notas (opcional)
                </label>
                <textarea
                  value={newClient.notas}
                  onChange={(e) => setNewClient({...newClient, notas: e.target.value})}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none resize-none"
                  rows={2}
                  placeholder="Información adicional del cliente..."
                />
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-300 flex gap-2">
              <button
                onClick={() => setShowClientModal(false)}
                disabled={creatingClient}
                className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateClient}
                disabled={!newClient.nombre.trim() || creatingClient}
                className="flex-1 px-3 py-2 bg-gray-900 text-white rounded text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                {creatingClient ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                    Creando...
                  </>
                ) : (
                  'Crear Cliente'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay para cerrar modal */}
      {showClientModal && (
        <div 
          className="fixed inset-0 z-[9998]" 
          onClick={() => {
            if (!creatingClient) setShowClientModal(false);
          }} 
        />
      )}
    </>
  );
};
