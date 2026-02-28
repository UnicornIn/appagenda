# ============================================================
# models_cash.py - Modelos Pydantic para cierre de caja
# ============================================================

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum

# ============================================================
# ENUMS
# ============================================================

class TipoEgreso(str, Enum):
    COMPRA_INTERNA = "compra_interna"
    GASTO_OPERATIVO = "gasto_operativo"
    RETIRO_CAJA = "retiro_caja"
    OTRO = "otro"

class EstadoCierre(str, Enum):
    ABIERTO = "abierto"
    CERRADO = "cerrado"
    REVISADO = "revisado"
    APROBADO = "aprobado"

class Moneda(str, Enum):
    USD = "USD"
    COP = "COP"
    EUR = "EUR"
    MXN = "MXN"

# ============================================================
# REQUEST MODELS
# ============================================================

class AperturaCajaRequest(BaseModel):
    sede_id: str = Field(..., description="ID de la sede")
    efectivo_inicial: float = Field(..., ge=0, description="Efectivo inicial en caja")
    fecha: str = Field(..., description="Fecha de apertura (YYYY-MM-DD)")
    moneda: Moneda = Field(default=Moneda.COP)
    observaciones: Optional[str] = None
    
    @validator('fecha')
    def validar_fecha(cls, v):
        try:
            datetime.strptime(v, "%Y-%m-%d")
            return v
        except ValueError:
            raise ValueError("Formato de fecha inválido. Use YYYY-MM-DD")

class RegistroEgresoRequest(BaseModel):
    sede_id: str = Field(..., description="ID de la sede")
    tipo: TipoEgreso = Field(..., description="Tipo de egreso")
    monto: float = Field(..., gt=0, description="Monto del egreso")
    concepto: str = Field(..., min_length=3, max_length=200, description="Concepto del gasto")
    descripcion: Optional[str] = Field(None, max_length=1000, description="Descripción detallada")
    fecha: Optional[str] = Field(None, description="Fecha del egreso (default: hoy)")
    moneda: Moneda = Field(default=Moneda.COP)
    comprobante_numero: Optional[str] = None
    comprobante_tipo: Optional[str] = None
    categoria: Optional[str] = None

class DesgloseFisicoItem(BaseModel):
    denominacion: str = Field(..., description="Ej: 'billete_100', 'moneda_0.25'")
    cantidad: int = Field(..., ge=0)
    valor_unitario: float = Field(..., gt=0)
    subtotal: float = Field(..., ge=0)

class CierreCajaRequest(BaseModel):
    sede_id: str = Field(..., description="ID de la sede")
    fecha: str = Field(..., description="Fecha del cierre (YYYY-MM-DD)")
    efectivo_contado: float = Field(..., ge=0, description="Efectivo físico contado")
    desglose_fisico: Optional[List[DesgloseFisicoItem]] = None
    observaciones: Optional[str] = None
    moneda: Moneda = Field(default=Moneda.COP)

class ConsultaEfectivoRequest(BaseModel):
    sede_id: str
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None
    
    @validator('fecha_inicio', 'fecha_fin')
    def validar_fecha(cls, v):
        if v is None:
            return v
        try:
            datetime.strptime(v, "%Y-%m-%d")
            return v
        except ValueError:
            raise ValueError("Formato de fecha inválido. Use YYYY-MM-DD")

# ============================================================
# RESPONSE MODELS
# ============================================================

class DetalleIngresos(BaseModel):
    citas: Dict[str, float] = Field(default={"total": 0, "cantidad": 0})
    ventas: Dict[str, float] = Field(default={"total": 0, "cantidad": 0})
    productos_citas: Dict[str, float] = Field(default={"total": 0, "cantidad": 0})
    total: float = 0

class DetalleEgresos(BaseModel):
    compras_internas: Dict[str, float] = Field(default={"total": 0, "cantidad": 0})
    gastos_operativos: Dict[str, float] = Field(default={"total": 0, "cantidad": 0})
    retiros_caja: Dict[str, float] = Field(default={"total": 0, "cantidad": 0})
    otros: Dict[str, float] = Field(default={"total": 0, "cantidad": 0})
    total: float = 0

class ResumenEfectivoResponse(BaseModel):
    sede_id: str
    sede_nombre: Optional[str] = None
    fecha: str
    moneda: str
    efectivo_inicial: float = 0
    ingresos: DetalleIngresos
    egresos: DetalleEgresos
    efectivo_esperado: float
    efectivo_contado: Optional[float] = None
    diferencia: Optional[float] = None
    estado: Optional[str] = None

class EgresoResponse(BaseModel):
    egreso_id: str
    sede_id: str
    sede_nombre: Optional[str] = None
    tipo: str
    concepto: str
    descripcion: Optional[str]
    monto: float
    moneda: str
    fecha: str
    registrado_por: str
    registrado_por_nombre: Optional[str]
    comprobante_numero: Optional[str]
    creado_en: datetime

class CierreResponse(BaseModel):
    cierre_id: str
    sede_id: str
    sede_nombre: Optional[str]
    fecha: str
    moneda: str
    efectivo_inicial: float
    total_ingresos: float
    total_egresos: float
    efectivo_esperado: float
    efectivo_contado: float
    diferencia: float
    estado: str
    observaciones: Optional[str]
    cerrado_por: str
    cerrado_por_nombre: Optional[str]
    creado_en: datetime
    aprobado_por: Optional[str] = None
    aprobado_en: Optional[datetime] = None

# ============================================================
# INTERNAL MODELS (para cálculos)
# ============================================================

class TransaccionCita(BaseModel):
    cita_id: str
    cliente_nombre: str
    servicios: List[str]
    monto: float
    metodo_pago: str
    fecha: str
    hora: str

class TransaccionVenta(BaseModel):
    venta_id: str
    cliente_nombre: str
    productos: List[str]
    monto: float
    metodo_pago: str
    fecha: datetime