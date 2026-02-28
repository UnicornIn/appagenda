import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { API_BASE_URL } from "../../types/config";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  token: string;
  access_token: string;
  pais?: string;
  sede_id?: string;
  nombre_local?: string;
  moneda?: string;
  zona_horaria?: string;
  telefono?: string;
  direccion?: string;
  informacion_adicional?: string;
  activa?: boolean;
  reglas_comision?: {
    tipo: string;
  };
};

type LocalData = {
  _id: string;
  nombre: string;
  direccion: string;
  informacion_adicional: string;
  zona_horaria: string;
  telefono: string;
  email: string;
  sede_id: string;
  fecha_creacion: string;
  creado_por: string;
  activa: boolean;
  moneda: string;
  reglas_comision: {
    tipo: string;
  };
  pais: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// Función para obtener información del local por sede_id
const fetchLocalBySedeId = async (sedeId: string, token: string): Promise<LocalData | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}admin/locales/${sedeId}`, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Error obteniendo locales: ${response.status}`);
    }

    const local: LocalData = await response.json();
    return local || null;
  } catch (error) {
    console.error("Error obteniendo información del local:", error);
    return null;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Limpiar storage
  const clearAuthStorage = useCallback(() => {
    const keys = [
      "beaux-id", 
      "beaux-name", 
      "beaux-email",  
      "beaux-role", 
      "access_token",
      "beaux-pais",
      "beaux-sede_id",
      "beaux-nombre_local",
      "beaux-moneda",
      "beaux-zona_horaria",
      "beaux-telefono",
      "beaux-direccion",
      "beaux-activa",
      "beaux-reglas_comision"
    ];
    keys.forEach((k) => {
      sessionStorage.removeItem(k);
    });
  }, []);

  // Validar token
  const validateToken = useCallback(async (token: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}auth/validate_token`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      return response.ok;
    } catch (error) {
      console.error("Error validando token:", error);
      return false;
    }
  }, []);

  // Función para guardar usuario en storage
  const saveUserToStorage = useCallback((userData: User, _remember: boolean) => {
    // Solo usar sessionStorage
    sessionStorage.setItem("beaux-id", userData.id);
    sessionStorage.setItem("beaux-name", userData.name);
    sessionStorage.setItem("beaux-email", userData.email);
    sessionStorage.setItem("beaux-role", userData.role);
    sessionStorage.setItem("access_token", userData.token);
    // Guardar información adicional si existe
    const additionalFields = {
      'beaux-pais': userData.pais,
      'beaux-sede_id': userData.sede_id,
      'beaux-nombre_local': userData.nombre_local,
      'beaux-moneda': userData.moneda,
      'beaux-zona_horaria': userData.zona_horaria,
      'beaux-telefono': userData.telefono,
      'beaux-direccion': userData.direccion,
      'beaux-activa': userData.activa?.toString(),
      'beaux-reglas_comision': userData.reglas_comision ? JSON.stringify(userData.reglas_comision) : undefined
    };
    Object.entries(additionalFields).forEach(([key, value]) => {
      if (value !== undefined) {
        sessionStorage.setItem(key, value);
      }
    });
  }, []);

  // Inicializar autenticación
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedEmail = sessionStorage.getItem("beaux-email");
        const storedToken =  sessionStorage.getItem("access_token");

        if (storedEmail && storedToken) {
          const isValid = await validateToken(storedToken);
          if (isValid) {
            const userData: User = {
              id: sessionStorage.getItem("beaux-id") || "",
              name: sessionStorage.getItem("beaux-name") || "",
              email: storedEmail,
              role: sessionStorage.getItem("beaux-role") || "user",
              token: storedToken,
              access_token: storedToken,
              pais: sessionStorage.getItem("beaux-pais") || undefined,
              sede_id: sessionStorage.getItem("beaux-sede_id") || undefined,
              nombre_local: sessionStorage.getItem("beaux-nombre_local") || undefined,
              moneda: sessionStorage.getItem("beaux-moneda") || undefined,
              zona_horaria: sessionStorage.getItem("beaux-zona_horaria") || undefined,
              telefono: sessionStorage.getItem("beaux-telefono") || undefined,
              direccion: sessionStorage.getItem("beaux-direccion") || undefined,
              activa: sessionStorage.getItem("beaux-activa") === 'true',
              reglas_comision: sessionStorage.getItem("beaux-reglas_comision") 
                ? JSON.parse(sessionStorage.getItem("beaux-reglas_comision")!) 
                : undefined,
            };
            setUser(userData);
          } else {
            console.warn("Token inválido, limpiando sesión");
            clearAuthStorage();
          }
        } else {
          clearAuthStorage();
        }
      } catch (error) {
        console.error("Error inicializando auth:", error);
        clearAuthStorage();
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, [clearAuthStorage, validateToken]);

  // Login
  const login = useCallback(
    async (email: string, password: string, remember: boolean = true): Promise<boolean> => {
      setIsLoading(true);
      try {
        // 1. Hacer login para obtener el token
        const loginResponse = await fetch(`${API_BASE_URL}auth/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            username: email,
            password: password,
          }),
        });

        if (!loginResponse.ok) {
          throw new Error("Credenciales incorrectas");
        }

        const loginData = await loginResponse.json();
        
        // 2. Crear objeto de usuario básico
        const userData: User = {
          id: loginData.email || email,
          name: loginData.nombre || loginData.name || email.split('@')[0],
          email: loginData.email || email,
          role: loginData.rol || "user",
          token: loginData.access_token,
          access_token: loginData.access_token,
          sede_id: loginData.sede_id || undefined,
        };

        // 3. Buscar información del local por sede_id real del usuario
        if (loginData.access_token && loginData.sede_id) {
          const localInfo = await fetchLocalBySedeId(loginData.sede_id, loginData.access_token);
          
          if (localInfo) {
            // Enriquecer userData con TODOS los datos del local
            userData.pais = localInfo.pais;
            userData.sede_id = localInfo.sede_id;
            userData.nombre_local = localInfo.nombre;
            userData.moneda = localInfo.moneda;
            userData.zona_horaria = localInfo.zona_horaria;
            userData.telefono = localInfo.telefono;
            userData.direccion = localInfo.direccion;
            userData.activa = localInfo.activa;
            userData.reglas_comision = localInfo.reglas_comision;
            // Puedes agregar más campos si los necesitas
          } else {
            console.warn("No se encontró información de sede para sede_id:", loginData.sede_id);
          }
        }

        // 4. Establecer usuario y guardar en storage
        setUser(userData);
        clearAuthStorage();
        saveUserToStorage(userData, remember);

        return true;
      } catch (error) {
        console.error("Error en login:", error);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [clearAuthStorage, saveUserToStorage]
  );

  // Logout
  const logout = useCallback(() => {
    setUser(null);
    clearAuthStorage();
  }, [clearAuthStorage]);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};