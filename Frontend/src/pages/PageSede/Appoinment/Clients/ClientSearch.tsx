// components/Quotes/ClientSearch.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Plus, User, X, Loader2 } from 'lucide-react';
import { getClientesPorSede, crearCliente, buscarClientesPorSede, Cliente, CrearClienteRequest } from '../../../../components/Quotes/clientsService';
import { useAuth } from '../../../../components/Auth/AuthContext';
import { useClientSmartSearch } from '../../../../hooks/useClientSmartSearch';
import { toClienteFromPartial, type RankedClient } from '../../../../lib/client-search';

const SEARCH_DEBOUNCE_MS = 200;

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
  const { user, activeSedeId } = useAuth();
  const [clientSearch, setClientSearch] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cachedClientes, setCachedClientes] = useState<Cliente[]>([]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const searchCacheRef = useRef<Map<string, Cliente[]>>(new Map());
  const lastQueryRef = useRef<string>("");
  const resolvedSedeId = String(
    sedeId ||
      activeSedeId ||
      user?.sede_id ||
      sessionStorage.getItem('beaux-sede_id') ||
      localStorage.getItem('beaux-sede_id') ||
      ''
  ).trim();

  const [newClient, setNewClient] = useState<NewClientForm>({
    nombre: '',
    correo: '',
    telefono: '',
    cedula: '',
    ciudad: '',
    fecha_de_nacimiento: '',
    sede_id: resolvedSedeId,
    notas: ''
  });

  useEffect(() => {
    setNewClient((prev) => {
      if (prev.sede_id === resolvedSedeId) {
        return prev;
      }

      return {
        ...prev,
        sede_id: resolvedSedeId,
      };
    });
  }, [resolvedSedeId]);

  // Mantener lista paginada corta para la tabla y como base local
  useEffect(() => {
    let cancel = false;

    const buscar = async () => {
      if (!user?.access_token || !resolvedSedeId) {
        setClientes([]);
        setLoadingClientes(false);
        return;
      }

      const query = clientSearch.trim();

       // Evitar refetch si es exactamente el mismo query y ya tenemos datos cargados
       if (lastQueryRef.current === query && (searchCacheRef.current.has(query) || clientes.length > 0)) {
        setLoadingClientes(false);
        return;
      }
      lastQueryRef.current = query;

      // Usa caché si existe
      const cached = searchCacheRef.current.get(query);
      if (cached) {
        setClientes(cached);
        setLoadingClientes(false);
        return;
      }

      // Evita request si el término es muy corto; usa solo el caché local
      if (query.length > 0 && query.length < 2) {
        setClientes(cachedClientes);
        setLoadingClientes(false);
        return;
      }

      setLoadingClientes(true);
      try {
        const resultados = query
          ? await buscarClientesPorSede(user.access_token, resolvedSedeId, query, 25)
          : await getClientesPorSede(user.access_token, resolvedSedeId, { limite: 25, pagina: 1 });

        if (!cancel) {
          setClientes(resultados);
          searchCacheRef.current.set(query, resultados);
        }
      } catch (error) {
        console.error('Error buscando clientes:', error);
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
  }, [clientSearch, resolvedSedeId, user?.access_token]);

  // Cache inicial más amplio para búsquedas locales (incluye email)
  useEffect(() => {
    let cancel = false;
    const preload = async () => {
      if (!user?.access_token || !resolvedSedeId) return;
      try {
        const base = await getClientesPorSede(user.access_token, resolvedSedeId, { limite: 150, pagina: 1 });
        if (!cancel) setCachedClientes(base);
      } catch (err) {
        console.warn('No se pudo precargar clientes para búsqueda local:', err);
      }
    };
    preload();
    return () => {
      cancel = true;
    };
  }, [user?.access_token, resolvedSedeId]);

  const fetchSmartResults = useCallback(async (query: string) => {
    if (!user?.access_token || !resolvedSedeId || !query.trim()) return [];
    const res = await buscarClientesPorSede(user.access_token, resolvedSedeId, query, 25);
    return res.map(toClienteFromPartial);
  }, [user?.access_token, resolvedSedeId]);

  const normalizedBase = useMemo(
    () => [...cachedClientes, ...clientes].map(toClienteFromPartial),
    [cachedClientes, clientes]
  );

  const {
    results: smartResults,
    isLoading: smartLoading,
  } = useClientSmartSearch(clientSearch, {
    baseClientes: normalizedBase,
    fetchRemote: fetchSmartResults,
    maxSuggestions: 8,
  });

  const suggestions = useMemo(() => smartResults.slice(0, 8), [smartResults]);

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

    const targetSedeId = String(newClient.sede_id || resolvedSedeId).trim();
    if (!targetSedeId) {
      setError('No se pudo determinar la sede activa');
      return;
    }
    
    setCreatingClient(true);
    setError(null);
    
    try {
      const result = await crearCliente(user.access_token, {
        ...newClient,
        sede_id: targetSedeId
      });
      
      if (result.success) {
        try {
          const clientesActualizados = await getClientesPorSede(user.access_token, targetSedeId, {
            limite: 25,
            pagina: 1,
          });
          setClientes(clientesActualizados);
        } catch (refreshError) {
          console.warn('No se pudo refrescar la lista de clientes tras crear uno nuevo:', refreshError);
          setClientes((prev) => {
            const next = [
              result.cliente,
              ...prev.filter((cliente) => cliente.cliente_id !== result.cliente.cliente_id),
            ];
            return next.slice(0, 25);
          });
        }
        
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
          sede_id: targetSedeId,
          notas: ''
        });
      }
    } catch (error: any) {
      console.error('Error creando cliente:', error);
      setError(error.message || "Error al crear cliente");
    } finally {
      setCreatingClient(false);
    }
  };

  const toLegacyCliente = useCallback((c: any): Cliente => ({
    _id: c._id || c.id || c.cliente_id,
    cliente_id: c.cliente_id || c.id || c._id || "",
    nombre: c.nombre || "",
    correo: c.email || c.correo || "",
    telefono: c.telefono || "",
    cedula: c.cedula || "",
    ciudad: c.ciudad || "",
    fecha_de_nacimiento: c.fecha_de_nacimiento,
    sede_id: c.sede_id || resolvedSedeId,
    notas: c.nota || c.notas,
    fecha_creacion: c.fecha_creacion,
    notas_historial: c.notas_historial,
  }), [resolvedSedeId]);

  const handleSelectClient = (cliente: any) => {
    onClientSelect(toLegacyCliente(cliente));
    setClientSearch(cliente.nombre || "");
    setIsFocused(false);
  };

  const handleClearClient = () => {
    onClientClear();
    setClientSearch('');
  };

  const highlight = useCallback((text: string, query: string) => {
    if (!text) return "—";
    const clean = query.trim();
    if (!clean) return text;
    const lowerText = text.toLowerCase();
    const lowerQuery = clean.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="bg-yellow-100 text-gray-900">{text.slice(idx, idx + clean.length)}</span>
        {text.slice(idx + clean.length)}
      </>
    );
  }, [ ]);

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
        
        {/* Cliente seleccionado */}
        {selectedClient ? (
          <div className="flex items-center justify-between p-2 bg-gray-50 border border-gray-300 rounded">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="w-3 h-3 text-gray-700" />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-900">{selectedClient.nombre}</div>
                <div className="text-[10px] text-gray-600">
                  {selectedClient.telefono && `📞 ${selectedClient.telefono}`}
                  {selectedClient.correo && ` • 📧 ${selectedClient.correo}`}
                </div>
              </div>
            </div>
            <button 
              onClick={handleClearClient}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar cliente..." 
              value={clientSearch} 
              onChange={(e) => setClientSearch(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 120)}
              className="w-full border border-gray-300 rounded px-8 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
            />
            <button 
              onClick={() => setShowClientModal(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            >
              <Plus className="w-3 h-3" />
            </button>
            
            {/* Lista de clientes sugeridos */}
            {clientSearch && isFocused && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded shadow max-h-52 overflow-y-auto">
                {smartLoading && (
                  <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                    Buscando clientes...
                  </div>
                )}

                {!smartLoading && suggestions.length === 0 && (
                  <div className="px-2 py-2 text-[11px] text-gray-500">Sin resultados</div>
                )}

                {suggestions.map((result: RankedClient) => {
                  const c = result.cliente;
                  const email = c.email || (c as any).correo || "";
                  const cedula = c.cedula || (c as any).numero_documento || (c as any).numeroDocumento || "";
                  return (
                    <button 
                      key={c.cliente_id || c.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectClient(c)}
                      className="w-full text-left px-2 py-1.5 hover:bg-gray-100 border-b border-gray-200 last:border-b-0 flex items-center gap-2 text-xs"
                    >
                      <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center">
                        <User className="w-2.5 h-2.5 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{highlight(c.nombre, clientSearch)}</div>
                        <div className="text-[10px] text-gray-600 flex flex-wrap gap-2 truncate">
                          <span className="truncate">{highlight(c.telefono || "—", clientSearch)}</span>
                          <span className="truncate">{highlight(cedula || "—", clientSearch)}</span>
                          {email && (
                            <span className="truncate text-gray-500">{highlight(email, clientSearch)}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            
            {/* Mensajes de estado */}
            {loadingClientes && (
              <div className="mt-1 text-[10px] text-gray-600">
                🔄 Buscando...
              </div>
            )}
            {clientSearch && clientes.length === 0 && !loadingClientes && (
              <div className="mt-1 text-[10px] text-gray-600">
                No encontrado. Haz clic en "+" para agregar.
              </div>
            )}
          </div>
        )}
      </div>

      {showClientModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded border border-gray-300 w-full max-w-sm max-h-[80vh] overflow-y-auto">
            <div className="p-3 border-b border-gray-300">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Nuevo Cliente</h3>
                <button
                  onClick={() => setShowClientModal(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            
            <div className="p-3 space-y-3">
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
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                  placeholder="Ej: María González"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-700">
                    Cédula
                  </label>
                  <input
                    type="text"
                    value={newClient.cedula}
                    onChange={(e) => setNewClient({...newClient, cedula: e.target.value})}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                    placeholder="123456789"
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
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                    placeholder="3001234567"
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
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                  placeholder="cliente@email.com"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-700">
                  Ciudad
                </label>
                <input
                  type="text"
                  value={newClient.ciudad}
                  onChange={(e) => setNewClient({...newClient, ciudad: e.target.value})}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                  placeholder="Bogotá"
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
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                />
              </div>
              
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-700">
                  Notas
                </label>
                <textarea
                  value={newClient.notas}
                  onChange={(e) => setNewClient({...newClient, notas: e.target.value})}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none resize-none"
                  rows={2}
                  placeholder="Información adicional..."
                />
              </div>
            </div>
            
            <div className="p-3 border-t border-gray-300 flex gap-2">
              <button
                onClick={() => setShowClientModal(false)}
                disabled={creatingClient}
                className="flex-1 px-3 py-1.5 border border-gray-300 text-gray-700 rounded text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateClient}
                disabled={!newClient.nombre.trim() || creatingClient}
                className="flex-1 px-3 py-1.5 bg-gray-900 text-white rounded text-xs hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {creatingClient ? (
                  <>
                    <div className="animate-spin rounded-full h-2.5 w-2.5 border-b-2 border-white"></div>
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
