from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Dict
from datetime import datetime
from collections import OrderedDict

# =====================================================
# 🏢 MODELO: Local (Sede)
# =====================================================
class Local(BaseModel):
    nombre: str
    direccion: str
    informacion_adicional: Optional[str] = None
    zona_horaria: str
    pais: Optional[str] = None
    moneda: str = Field(..., description="Código de moneda: COP, USD, MXN")
    reglas_comision: Optional[Dict[str, str]] = Field(
        default={"tipo": "servicios"},
        description="Reglas de comisión: {'tipo': 'servicios' | 'productos' | 'mixto'}"
    )
    telefono: Optional[str] = None
    email: Optional[EmailStr] = None
    
    @validator('moneda')
    def validar_moneda(cls, v):
        monedas_validas = ['COP', 'USD', 'MXN', 'EUR', 'PEN', 'ARS']
        if v and v.upper() not in monedas_validas:
            raise ValueError(f'Moneda debe ser: {", ".join(monedas_validas)}')
        return v.upper() if v else v
    
    @validator('reglas_comision')
    def validar_reglas_comision(cls, v):
        if v and 'tipo' in v:
            tipos_validos = ['servicios', 'productos', 'mixto']
            if v['tipo'] not in tipos_validos:
                raise ValueError(f"Tipo de comisión debe ser: {', '.join(tipos_validos)}")
        return v


# =====================================================
# 💇‍♀️ MODELO: Profesional / Estilista
# =====================================================
class Profesional(BaseModel):
    nombre: str
    email: EmailStr
    sede_id: str
    especialidades: bool = Field(default=True)
    servicios_no_presta: Optional[List[str]] = Field(default=[])
    activo: bool = True
    comision: Optional[float] = None
    password: str


# ============================================
# 💅 MODELO: ServicioAdmin (con ejemplo ordenado)
# ============================================
class ServicioAdmin(BaseModel):
    # Datos principales
    nombre: str = Field(..., description="Nombre del servicio")
    duracion_minutos: int = Field(..., description="Duración en minutos")
    precios: Dict[str, float] = Field(..., description="Precios por moneda",
        example={"COP": 50000, "USD": 12.5, "MXN": 250})
    comision_estilista: Optional[float] = Field(None, description="Porcentaje de comisión del estilista")
    categoria: Optional[str] = Field(None, description="Categoría del servicio")
    requiere_producto: bool = Field(default=False, description="Indica si requiere producto")
    activo: bool = Field(default=True, description="Indica si el servicio está activo")

    # IDs relacionales
    sede_id: Optional[str] = Field(None, description="ID de la sede")

    # Auditoría
    creado_por: Optional[str] = Field(None, description="Usuario que creó el servicio")
    created_at: Optional[datetime] = Field(None, description="Fecha de creación")
    updated_at: Optional[datetime] = Field(None, description="Fecha de última actualización")

    # ===========================
    # Validaciones
    # ===========================
    @validator('precios')
    def validar_precios(cls, v):
        if not v:
            raise ValueError('Debe incluir al menos un precio')
        for moneda, precio in v.items():
            if precio <= 0:
                raise ValueError(f'Precio en {moneda} debe ser mayor a 0')
        return v

    @validator('comision_estilista')
    def validar_comision(cls, v):
        if v is not None and (v < 0 or v > 100):
            raise ValueError('Comisión debe estar entre 0 y 100')
        return v