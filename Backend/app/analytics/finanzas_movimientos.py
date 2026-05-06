#Backend/app/analytics/routes_finanzas_movimientos.py  Ruta archivo



from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.auth.routes import get_current_user
from app.database.mongo import collection_finance_movements

router = APIRouter(prefix="/finanzas/movimientos", tags=["Finanzas - Movimientos"])

CategoriaEgresoMayor = Literal[
    "arriendo", "nomina", "comisiones", "servicios_publicos", "impuestos", "proveedor",
    "insumos", "marketing", "mantenimiento", "transporte", "software", "seguros", "honorarios", "otro"
]
MetodoPago = Literal["transferencia", "debito_automatico", "tarjeta_corporativa", "cheque", "efectivo", "pse"]
Origen = Literal["auto_facturacion", "auto_citas", "auto_caja_menor", "manual_caja_mayor", "manual_caja_menor"]
TipoMovimiento = Literal["ingreso", "egreso", "traslado"]
CajaTipo = Literal["caja_menor", "caja_mayor"]


class MovimientoBase(BaseModel):
    sede_id: str
    fecha: str = Field(..., description="YYYY-MM-DD")
    concepto: str = Field(..., min_length=3, max_length=200)
    monto: float = Field(..., gt=0)
    observaciones: Optional[str] = Field(None, max_length=1000)


class EgresoCajaMayorRequest(MovimientoBase):
    categoria: CategoriaEgresoMayor
    metodo_pago: MetodoPago
    referencia_factura: Optional[str] = Field(None, max_length=80)


class IngresoCajaMayorRequest(MovimientoBase):
    categoria: Literal["devolucion_proveedor", "intereses", "ingreso_extraordinario", "otro"]
    metodo_pago: MetodoPago
    referencia_factura: Optional[str] = Field(None, max_length=80)


class EgresoCajaMenorRequest(MovimientoBase):
    categoria: Literal["almuerzos", "domicilios", "propinas", "gasto_operativo", "otro"]
    metodo_pago: Literal["efectivo", "transferencia", "pse"] = "efectivo"


class TrasladoCajasRequest(BaseModel):
    sede_id: str
    fecha: str
    concepto: str = Field(..., min_length=3, max_length=200)
    monto: float = Field(..., gt=0)
    caja_origen: CajaTipo
    caja_destino: CajaTipo
    observaciones: Optional[str] = Field(None, max_length=1000)



def _check_admin(current_user: dict):
    if current_user.get("rol") not in {"admin_sede", "admin_franquicia", "super_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo administradores pueden registrar movimientos.")


def _parse_fecha(fecha: str) -> str:
    try:
        return datetime.strptime(fecha, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="fecha debe tener formato YYYY-MM-DD") from exc


async def _crear_movimiento(doc: dict) -> dict:
    result = await collection_finance_movements.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


@router.post("/egreso-caja-mayor", status_code=201)
async def registrar_egreso_caja_mayor(payload: EgresoCajaMayorRequest, current_user: dict = Depends(get_current_user)):
    _check_admin(current_user)
    doc = {
        **payload.model_dump(),
        "tipo_movimiento": "egreso",
        "caja": "caja_mayor",
        "origen": "manual_caja_mayor",
        "afecta_pl": True,
        "creado_en": datetime.utcnow(),
        "creado_por": current_user.get("email"),
    }
    doc["fecha"] = _parse_fecha(doc["fecha"])
    return await _crear_movimiento(doc)


@router.post("/ingreso-caja-mayor", status_code=201)
async def registrar_ingreso_caja_mayor(payload: IngresoCajaMayorRequest, current_user: dict = Depends(get_current_user)):
    _check_admin(current_user)
    doc = {
        **payload.model_dump(),
        "tipo_movimiento": "ingreso",
        "caja": "caja_mayor",
        "origen": "manual_caja_mayor",
        "afecta_pl": True,
        "creado_en": datetime.utcnow(),
        "creado_por": current_user.get("email"),
    }
    doc["fecha"] = _parse_fecha(doc["fecha"])
    return await _crear_movimiento(doc)


@router.post("/egreso-caja-menor", status_code=201)
async def registrar_egreso_caja_menor(payload: EgresoCajaMenorRequest, current_user: dict = Depends(get_current_user)):
    _check_admin(current_user)
    doc = {
        **payload.model_dump(),
        "tipo_movimiento": "egreso",
        "caja": "caja_menor",
        "origen": "manual_caja_menor",
        "afecta_pl": True,
        "creado_en": datetime.utcnow(),
        "creado_por": current_user.get("email"),
    }
    doc["fecha"] = _parse_fecha(doc["fecha"])
    return await _crear_movimiento(doc)


@router.post("/traslado", status_code=201)
async def registrar_traslado(payload: TrasladoCajasRequest, current_user: dict = Depends(get_current_user)):
    _check_admin(current_user)
    if payload.caja_origen == payload.caja_destino:
        raise HTTPException(status_code=422, detail="caja_origen y caja_destino no pueden ser iguales")
    fecha = _parse_fecha(payload.fecha)
    doc = {
        **payload.model_dump(),
        "fecha": fecha,
        "tipo_movimiento": "traslado",
        "origen": "manual_caja_mayor",
        "afecta_pl": False,
        "creado_en": datetime.utcnow(),
        "creado_por": current_user.get("email"),
    }
    return await _crear_movimiento(doc)


@router.get("/resumen")
async def resumen_financiero(
    sede_id: str,
    fecha_inicio: str = Query(..., description="YYYY-MM-DD"),
    fecha_fin: str = Query(..., description="YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
):
    _parse_fecha(fecha_inicio)
    _parse_fecha(fecha_fin)
    base_q = {"sede_id": sede_id, "fecha": {"$gte": fecha_inicio, "$lte": fecha_fin}}

    docs = await collection_finance_movements.find(base_q).to_list(5000)
    pl_ingresos = sum(d["monto"] for d in docs if d.get("afecta_pl") and d.get("tipo_movimiento") == "ingreso")
    pl_egresos = sum(d["monto"] for d in docs if d.get("afecta_pl") and d.get("tipo_movimiento") == "egreso")

    caja_menor = sum(
        (d["monto"] if d.get("tipo_movimiento") == "ingreso" else -d["monto"])
        for d in docs if d.get("caja") == "caja_menor"
    )
    caja_mayor = sum(
        (d["monto"] if d.get("tipo_movimiento") == "ingreso" else -d["monto"])
        for d in docs if d.get("caja") == "caja_mayor"
    )

    traslados = [d for d in docs if d.get("tipo_movimiento") == "traslado"]
    total_menor_mayor = sum(d["monto"] for d in traslados if d.get("caja_origen") == "caja_menor")
    total_mayor_menor = sum(d["monto"] for d in traslados if d.get("caja_origen") == "caja_mayor")

    return {
        "pl": {
            "ingresos": round(pl_ingresos, 2),
            "egresos": round(pl_egresos, 2),
            "utilidad": round(pl_ingresos - pl_egresos, 2),
            "aclaracion": "Los traslados internos no impactan el P&L."
        },
        "cajas": {
            "caja_menor": round(caja_menor, 2),
            "caja_mayor": round(caja_mayor, 2),
            "consolidado": round(caja_menor + caja_mayor, 2)
        },
        "traslados": {
            "menor_a_mayor": round(total_menor_mayor, 2),
            "mayor_a_menor": round(total_mayor_menor, 2),
            "cantidad": len(traslados)
        }
    }
