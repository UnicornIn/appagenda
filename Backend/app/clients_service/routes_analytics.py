"""
Routes para Analytics de Clientes
📊 Cubre los datos que el frontend reportó como faltantes:
   - Recurrencia promedio (días entre visitas)
   - LTV promedio
   - Nuevos clientes por mes (histórico)
   - Estado base completo (activos / tibios / fríos / churn)
"""
from fastapi import APIRouter, Query, HTTPException, Depends
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from collections import defaultdict
from zoneinfo import ZoneInfo
import logging

from app.database.mongo import collection_clients, collection_sales, collection_locales
from app.auth.routes import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clientes", tags=["Analytics de Clientes"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_sede_filter(current_user: dict, sede_id: Optional[str]) -> Optional[str]:
    """
    Aplica la misma lógica de restricción de sede que el resto de la app.
    Devuelve el sede_id efectivo o None (todas las sedes).
    """
    rol = current_user.get("rol")
    if rol == "admin_sede":
        user_sede = current_user.get("sede_id")
        sedes_perm = set(current_user.get("sedes_permitidas", []))
        sedes_perm.add(user_sede)
        if sede_id and sede_id not in sedes_perm:
            raise HTTPException(status_code=403, detail="Sin acceso a esa sede.")
        return sede_id or user_sede
    return sede_id  # admin_franquicia / super_admin pueden ver todo


async def _zona_horaria(sede_id: Optional[str]) -> str:
    if not sede_id:
        return "America/Bogota"
    doc = await collection_locales.find_one({"_id": sede_id})
    return (doc or {}).get("zona_horaria", "America/Bogota")


# ─── Endpoint principal ────────────────────────────────────────────────────────

@router.get("/analytics")
async def clientes_analytics(
    sede_id: Optional[str] = Query(None, description="Filtrar por sede"),
    current_user: dict = Depends(get_current_user)
):
    """
    Métricas agregadas de clientes que el frontend necesita y antes no existían.

    Devuelve:
    - **ltv_promedio**: LTV promedio entre todos los clientes con ventas.
    - **recurrencia_promedio_dias**: Promedio de días entre visitas consecutivas.
    - **nuevos_por_mes**: Historial mensual de clientes nuevos (últimos 12 meses).
    - **estado_base**: Conteo de clientes activos / tibios / fríos / churn.

    🔒 Requiere autenticación. admin_sede solo ve su sede.
    """
    allowed = {"admin_sede", "admin_franquicia", "super_admin", "recepcionista", "call_center"}
    if current_user.get("rol") not in allowed:
        raise HTTPException(status_code=403, detail="No autorizado.")

    sede_efectiva = _build_sede_filter(current_user, sede_id)
    zona = await _zona_horaria(sede_efectiva)
    tz = ZoneInfo(zona)
    ahora = datetime.now(tz)

    # ── 1. LTV promedio ────────────────────────────────────────────────────────
    ltv_pipeline = [
        *([ {"$match": {"sede_id": sede_efectiva}} ] if sede_efectiva else []),
        {"$match": {"total_gastado": {"$exists": True, "$gt": 0}}},
        {"$group": {
            "_id": None,
            "ltv_promedio": {"$avg": "$total_gastado"},
            "total_clientes_con_ltv": {"$sum": 1}
        }}
    ]
    ltv_result = await collection_clients.aggregate(ltv_pipeline).to_list(1)
    ltv_promedio = round((ltv_result[0]["ltv_promedio"] if ltv_result else 0), 2)
    total_clientes_con_ltv = ltv_result[0]["total_clientes_con_ltv"] if ltv_result else 0

    # ── 2. Recurrencia promedio (días entre visitas) ───────────────────────────
    # Agrupamos collection_sales por cliente, ordenamos fechas y promediamos gaps.
    # Para no matar la DB con millones de docs, limitamos a los últimos 12 meses.
    fecha_hace_12m = ahora - timedelta(days=365)
    recurrencia_pipeline = [
        {"$match": {
            "fecha_pago": {"$gte": fecha_hace_12m},
            **({"sede_id": sede_efectiva} if sede_efectiva else {})
        }},
        {"$group": {
            "_id": "$cliente_id",
            "fechas": {"$push": "$fecha_pago"}
        }},
        # Solo clientes con ≥ 2 visitas tienen recurrencia calculable
        {"$match": {"fechas.1": {"$exists": True}}},
        {"$project": {
            "fechas_sorted": {
                "$sortArray": {"input": "$fechas", "sortBy": 1}
            }
        }}
    ]
    ventas_por_cliente = await collection_sales.aggregate(recurrencia_pipeline).to_list(None)

    gaps_dias: List[float] = []
    for doc in ventas_por_cliente:
        fechas = doc["fechas_sorted"]
        for i in range(1, len(fechas)):
            f_prev = fechas[i - 1]
            f_curr = fechas[i]
            # Normalizar a datetime naive si vienen con tz
            if hasattr(f_prev, "tzinfo") and f_prev.tzinfo:
                f_prev = f_prev.replace(tzinfo=None)
            if hasattr(f_curr, "tzinfo") and f_curr.tzinfo:
                f_curr = f_curr.replace(tzinfo=None)
            delta = (f_curr - f_prev).days
            if 0 < delta <= 365:  # filtramos outliers (mismo día o > 1 año)
                gaps_dias.append(delta)

    recurrencia_promedio = round(sum(gaps_dias) / len(gaps_dias), 1) if gaps_dias else None
    clientes_con_recurrencia = len(ventas_por_cliente)

    # ── 3. Nuevos clientes por mes (últimos 12 meses) ─────────────────────────
    nuevos_pipeline = [
        {"$match": {
            "fecha_creacion": {"$gte": fecha_hace_12m},
            **({"sede_id": sede_efectiva} if sede_efectiva else {})
        }},
        {"$group": {
            "_id": {
                "year": {"$year": "$fecha_creacion"},
                "month": {"$month": "$fecha_creacion"}
            },
            "cantidad": {"$sum": 1}
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1}}
    ]
    nuevos_raw = await collection_clients.aggregate(nuevos_pipeline).to_list(None)
    nuevos_por_mes = [
        {
            "periodo": f"{r['_id']['year']}-{r['_id']['month']:02d}",
            "cantidad": r["cantidad"]
        }
        for r in nuevos_raw
    ]

    # ── 4. Estado base completo ───────────────────────────────────────────────
    # Activo  → última visita ≤ 30 días
    # Tibio   → 31–60 días
    # Frío    → 61–90 días
    # Churn   → > 90 días o sin visita registrada
    estado_pipeline = [
        *([ {"$match": {"sede_id": sede_efectiva}} ] if sede_efectiva else []),
        {"$group": {
            "_id": None,
            "activo":  {"$sum": {"$cond": [{"$and": [
                {"$gt": ["$dias_sin_visitar", 0]},
                {"$lte": ["$dias_sin_visitar", 30]}
            ]}, 1, 0]}},
            "tibio":   {"$sum": {"$cond": [{"$and": [
                {"$gt": ["$dias_sin_visitar", 30]},
                {"$lte": ["$dias_sin_visitar", 60]}
            ]}, 1, 0]}},
            "frio":    {"$sum": {"$cond": [{"$and": [
                {"$gt": ["$dias_sin_visitar", 60]},
                {"$lte": ["$dias_sin_visitar", 90]}
            ]}, 1, 0]}},
            "churn":   {"$sum": {"$cond": [
                {"$gt": ["$dias_sin_visitar", 90]}, 1, 0
            ]}},
            "sin_visita": {"$sum": {"$cond": [
                {"$or": [
                    {"$eq": ["$dias_sin_visitar", None]},
                    {"$eq": ["$dias_sin_visitar", 0]}
                ]}, 1, 0
            ]}},
            "total": {"$sum": 1}
        }}
    ]
    estado_raw = await collection_clients.aggregate(estado_pipeline).to_list(1)
    estado_base = estado_raw[0] if estado_raw else {
        "activo": 0, "tibio": 0, "frio": 0, "churn": 0, "sin_visita": 0, "total": 0
    }
    estado_base.pop("_id", None)

    # ── Respuesta ──────────────────────────────────────────────────────────────
    return {
        "success": True,
        "sede_id": sede_efectiva,
        "zona_horaria": zona,
        "generado_en": ahora.isoformat(),
        "ltv": {
            "ltv_promedio": ltv_promedio,
            "clientes_con_datos": total_clientes_con_ltv,
            "nota": "Promedio de total_gastado entre clientes con al menos una venta"
        },
        "recurrencia": {
            "promedio_dias": recurrencia_promedio,
            "clientes_analizados": clientes_con_recurrencia,
            "ventana_analisis": "últimos 12 meses",
            "nota": "Promedio de días entre visitas consecutivas del mismo cliente"
        },
        "nuevos_por_mes": nuevos_por_mes,
        "estado_base": estado_base
    }