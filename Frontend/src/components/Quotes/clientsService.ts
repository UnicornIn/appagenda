// services/clientsService.ts
import { API_BASE_URL } from "../../types/config";
import { clientesService } from "../../pages/PageSede/Clients/clientesService"; // 🔥 RUTA CORRECTA

export interface Cliente {
  _id?: string;
  cliente_id: string;
  nombre: string;
  correo?: string;
  telefono?: string;
  cedula?: string;
  ciudad?: string;
  fecha_de_nacimiento?: string;
  sede_id: string;
  notas?: string;
  fecha_creacion?: string;
  notas_historial?: NotaCliente[];
}

export interface NotaCliente {
  contenido: string;
  fecha?: string;
  autor?: string;
}

export interface CrearClienteRequest {
  nombre: string;
  correo?: string;
  telefono?: string;
  cedula?: string;
  ciudad?: string;
  fecha_de_nacimiento?: string;
  sede_id?: string;
  notas?: string;
}

type FetchClientesOpts = { filtro?: string; limite?: number; pagina?: number };
const DEFAULT_LIMIT = 25;

const normalize = (value?: string) =>
  (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const withOptionalField = (
  payload: Record<string, string>,
  key: string,
  value?: string
) => {
  const normalized = value?.trim();
  if (normalized) {
    payload[key] = normalized;
  }
};

const buildCrearClientePayload = (clienteData: CrearClienteRequest): Record<string, string> => {
  const nombre = clienteData.nombre?.trim();
  if (!nombre) {
    throw new Error("El nombre del cliente es requerido");
  }

  const payload: Record<string, string> = { nombre };
  withOptionalField(payload, "correo", clienteData.correo);
  withOptionalField(payload, "telefono", clienteData.telefono);
  withOptionalField(payload, "cedula", clienteData.cedula);
  withOptionalField(payload, "ciudad", clienteData.ciudad);
  withOptionalField(payload, "fecha_de_nacimiento", clienteData.fecha_de_nacimiento);
  withOptionalField(payload, "sede_id", clienteData.sede_id);
  withOptionalField(payload, "notas", clienteData.notas);

  return payload;
};

const normalizarCliente = (c: any): Cliente => ({
  _id: c._id,
  cliente_id: c.cliente_id || c.id || c._id,
  nombre: c.nombre || "",
  correo: c.email || c.correo,
  telefono: c.telefono,
  cedula: c.cedula,
  ciudad: c.ciudad,
  fecha_de_nacimiento: c.fecha_de_nacimiento,
  sede_id: c.sede_id || "",
  notas: c.nota || c.notas,
  fecha_creacion: c.fecha_creacion,
  notas_historial: c.notas_historial,
});

const fetchClientesLivianos = async (
  token: string,
  opciones?: FetchClientesOpts
): Promise<Cliente[]> => {
  const pagina = opciones?.pagina ?? 1;
  const limite = Math.min(Math.max(opciones?.limite ?? DEFAULT_LIMIT, 1), 100);
  const filtro = opciones?.filtro?.trim();

  const { clientes } = await clientesService.getClientesPaginados(token, {
    pagina,
    limite,
    filtro,
  });

  return clientes.map(normalizarCliente);
};

const priorizarCoincidenciasPorNombre = (
  clientes: Cliente[],
  filtro?: string,
  limite: number = DEFAULT_LIMIT
) => {
  if (!filtro) return clientes.slice(0, limite);

  const filtroNorm = normalize(filtro);
  const buscaEmail = filtro.includes("@");

  // Si el usuario teclea un correo, buscamos por correo/ID/teléfono directamente
  if (buscaEmail) {
    const porEmail = clientes.filter(
      (c) =>
        normalize(c.correo).includes(filtroNorm) ||
        normalize(c.cliente_id).includes(filtroNorm) ||
        normalize(c.telefono).includes(filtroNorm)
    );
    return porEmail.slice(0, limite);
  }

  // Ranking por nombre:
  // 1) nombre comienza con filtro
  // 2) alguna palabra del nombre comienza con filtro
  // 3) nombre contiene filtro
  const empiezaCon = clientes.filter((c) =>
    normalize(c.nombre).startsWith(filtroNorm)
  );

  const palabraEmpieza = clientes.filter((c) => {
    const palabras = normalize(c.nombre).split(/\s+/);
    return palabras.some((p) => p.startsWith(filtroNorm));
  });

  const contiene = clientes.filter(
    (c) =>
      !empiezaCon.includes(c) &&
      !palabraEmpieza.includes(c) &&
      normalize(c.nombre).includes(filtroNorm)
  );

  // fallback: otros campos (tel/ID) solo si no hubo coincidencias de nombre
  const fallbackMatches = clientes.filter((c) => {
    const coincideTelefono = normalize(c.telefono).includes(filtroNorm);
    const coincideId = normalize(c.cliente_id).includes(filtroNorm);
    return coincideTelefono || coincideId;
  });

  const unidos = [
    ...empiezaCon,
    ...palabraEmpieza.filter((c) => !empiezaCon.includes(c)),
    ...contiene,
    ...fallbackMatches,
  ];

  // evitar duplicados respetando el orden
  const únicos: Cliente[] = [];
  const vistos = new Set<string>();
  for (const c of unidos) {
    const key = c.cliente_id || c._id || c.nombre;
    if (!vistos.has(key)) {
      únicos.push(c);
      vistos.add(key);
    }
    if (únicos.length >= limite) break;
  }

  return únicos.slice(0, limite);
};

// 🔥 OBTENER CLIENTES POR SEDE (ahora paginado y sin traer los 42k de golpe)
export async function getClientesPorSede(
  token: string,
  sedeId: string,
  opciones?: FetchClientesOpts
): Promise<Cliente[]> {
  try {
    console.log(
      `🔄 Obteniendo clientes para reservas (sede: ${sedeId || "auto"})...`
    );

    const clientes = await fetchClientesLivianos(token, opciones);

    console.log(`✅ Clientes cargados para reservas: ${clientes.length}`);
    return clientes;
  } catch (error) {
    console.error("❌ Error cargando clientes para reservas:", error);
    throw error;
  }
}

// 🔥 BUSCAR CLIENTES (con filtro opcional)
export async function buscarClientes(
  token: string,
  filtro?: string,
  limite: number = DEFAULT_LIMIT
): Promise<Cliente[]> {
  try {
    console.log(`🔍 Buscando clientes con filtro: "${filtro}"`);

    const clientes = await fetchClientesLivianos(token, {
      filtro,
      limite,
      pagina: 1,
    });

    const ordenados = priorizarCoincidenciasPorNombre(clientes, filtro, limite);

    console.log(
      `✅ ${ordenados.length} clientes devueltos desde el backend (sin cargar todo el universo)`
    );
    return ordenados;
  } catch (error) {
    console.error("❌ Error buscando clientes:", error);
    return [];
  }
}

// 🔥 BUSCAR CLIENTES POR SEDE Y FILTRO
export async function buscarClientesPorSede(
  token: string,
  sedeId: string,
  filtro?: string,
  limite: number = DEFAULT_LIMIT
): Promise<Cliente[]> {
  try {
    console.log(`🔍 Buscando clientes con filtro: "${filtro}"`);

    const clientes = await getClientesPorSede(token, sedeId, {
      filtro,
      limite,
      pagina: 1,
    });

    const ordenados = priorizarCoincidenciasPorNombre(clientes, filtro, limite);

    console.log(`✅ ${ordenados.length} clientes disponibles`);
    return ordenados;
  } catch (error) {
    console.error("❌ Error buscando clientes por sede:", error);
    return [];
  }
}

// 🔥 NUEVA FUNCIÓN: Buscar con debounce para el input del modal
let searchTimeout: NodeJS.Timeout | null = null;

export async function buscarClientesConDebounce(
  token: string,
  filtro: string,
  callback: (clientes: Cliente[]) => void,
  delay: number = 300
): Promise<void> {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  searchTimeout = setTimeout(async () => {
    try {
      const resultados = await buscarClientes(token, filtro, 50);
      callback(resultados);
    } catch (error) {
      console.error("❌ Error en búsqueda con debounce:", error);
      callback([]);
    }
  }, delay);
}

// 🔥 CREAR NUEVO CLIENTE
export async function crearCliente(token: string, clienteData: CrearClienteRequest): Promise<{success: boolean; cliente: Cliente}> {
  try {
    const payload = buildCrearClientePayload(clienteData);
    console.log('🔄 Creando nuevo cliente:', payload);
    const res = await fetch(`${API_BASE_URL}clientes/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      let message = `Error ${res.status} al crear cliente`;

      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          message = parsed?.detail || parsed?.message || raw;
        } catch {
          message = raw;
        }
      }

      throw new Error(message);
    }
    
    const data = await res.json();
    console.log('✅ Cliente creado exitosamente');
    return data;
  } catch (error) {
    console.error('❌ Error creando cliente:', error);
    throw error;
  }
}

// 🔥 OBTENER CLIENTE POR ID
export async function getClientePorId(token: string, clienteId: string): Promise<Cliente> {
  try {
    const res = await fetch(`${API_BASE_URL}clientes/${clienteId}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });
    
    if (!res.ok) throw new Error("Error al cargar cliente");
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('❌ Error cargando cliente:', error);
    throw error;
  }
}

// 🔥 ACTUALIZAR CLIENTE
export async function actualizarCliente(token: string, clienteId: string, clienteData: Partial<CrearClienteRequest>): Promise<{success: boolean; msg: string}> {
  try {
    const res = await fetch(`${API_BASE_URL}clientes/${clienteId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify(clienteData),
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || "Error al actualizar cliente");
    }
    
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('❌ Error actualizando cliente:', error);
    throw error;
  }
}

// 🔥 AGREGAR NOTA A CLIENTE
export async function agregarNotaCliente(token: string, clienteId: string, nota: string): Promise<{success: boolean; msg: string}> {
  try {
    const res = await fetch(`${API_BASE_URL}clientes/${clienteId}/notas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify({ contenido: nota }),
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || "Error al agregar nota");
    }
    
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('❌ Error agregando nota:', error);
    throw error;
  }
}

// 🔥 OBTENER HISTORIAL DE CLIENTE
export async function getHistorialCliente(token: string, clienteId: string): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE_URL}clientes/${clienteId}/historial`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });
    
    if (!res.ok) throw new Error("Error al cargar historial del cliente");
    const data = await res.json();
    return data || [];
  } catch (error) {
    console.error('❌ Error cargando historial:', error);
    throw error;
  }
}
