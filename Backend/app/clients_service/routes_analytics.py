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
    allowed = {"admin_sede", "admin_franquicia", "super_admin", "recepcionista", "call_center"}
    if current_user.get("rol") not in allowed:
        raise HTTPException(status_code=403, detail="No autorizado.")

    sede_efectiva = _build_sede_filter(current_user, sede_id)
    zona = await _zona_horaria(sede_efectiva)
    tz = ZoneInfo(zona)
    ahora = datetime.now(tz)

    # Filtro base de sede/franquicia
    match_base = {}
    if sede_efectiva:
        match_base["sede_id"] = sede_efectiva

    # ── Pipeline único que calcula todo de una vez ─────────────────────────
    pipeline = [
        *([ {"$match": match_base} ] if match_base else []),
        {"$group": {
            "_id": None,
            # LTV promedio — usa ltv_proyectado (ticket × frecuencia_anual × retención)
            "ltv_promedio": {
                "$avg": {
                    "$cond": [
                        {"$and": [
                            {"$gt": ["$ltv_proyectado", 0]},
                            {"$ifNull": ["$ltv_proyectado", False]}
                        ]},
                        "$ltv_proyectado", "$$REMOVE"
                    ]
                }
            },
            # Ticket promedio del negocio
            "ticket_promedio_negocio": {
                "$avg": {
                    "$cond": [{"$gt": ["$ticket_promedio", 0]}, "$ticket_promedio", "$$REMOVE"]
                }
            },
            # Recurrencia promedio — usa frecuencia_dias ya calculada en cada cliente
            "recurrencia_promedio": {
                "$avg": {
                    "$cond": [
                        {"$and": [
                            {"$gt": ["$frecuencia_dias", 0]},
                            {"$ifNull": ["$frecuencia_dias", False]}
                        ]},
                        "$frecuencia_dias", "$$REMOVE"
                    ]
                }
            },
            # Segmentos — alineados con las definiciones oficiales
            "activos":    {"$sum": {"$cond": [{"$eq": ["$segmento", "Activo"]},    1, 0]}},
            "en_riesgo":  {"$sum": {"$cond": [{"$eq": ["$segmento", "En riesgo"]}, 1, 0]}},
            "perdidos":   {"$sum": {"$cond": [{"$eq": ["$segmento", "Perdido"]},   1, 0]}},
            "nuevos":     {"$sum": {"$cond": [{"$eq": ["$segmento", "Nuevo"]},     1, 0]}},
            "sin_visita": {"$sum": {"$cond": [
                {"$or": [
                    {"$not": {"$ifNull": ["$ultima_visita", False]}},
                    {"$eq": ["$dias_sin_visitar", 0]}
                ]}, 1, 0
            ]}},
            # Clientes recurrentes: frecuencia_dias <= 120 días
            "recurrentes": {"$sum": {"$cond": [
                {"$and": [
                    {"$ifNull": ["$frecuencia_dias", False]},
                    {"$lte": ["$frecuencia_dias", 120]}
                ]}, 1, 0
            ]}},
            "con_frecuencia": {"$sum": {"$cond": [
                {"$ifNull": ["$frecuencia_dias", False]}, 1, 0
            ]}},
            "total": {"$sum": 1}
        }}
    ]

    resultado = await collection_clients.aggregate(pipeline).to_list(1)
    r = resultado[0] if resultado else {}
    r.pop("_id", None)

    # Nuevos clientes por mes (últimos 12 meses)
    fecha_hace_12m = ahora.replace(tzinfo=None) - timedelta(days=365)
    nuevos_pipeline = [
        {"$match": {
            "fecha_creacion": {"$gte": fecha_hace_12m},
            **(match_base if match_base else {})
        }},
        {"$group": {
            "_id": {
                "year":  {"$year":  "$fecha_creacion"},
                "month": {"$month": "$fecha_creacion"}
            },
            "cantidad": {"$sum": 1}
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1}}
    ]
    nuevos_raw = await collection_clients.aggregate(nuevos_pipeline).to_list(None)
    nuevos_por_mes = [
        {
            "periodo":  f"{row['_id']['year']}-{row['_id']['month']:02d}",
            "cantidad": row["cantidad"]
        }
        for row in nuevos_raw
    ]

    recurrencia_dias = r.get("recurrencia_promedio")
    ltv_prom = r.get("ltv_promedio", 0) or 0
    ticket_prom = r.get("ticket_promedio_negocio", 0) or 0
    total = r.get("total", 0)
    con_frecuencia = r.get("con_frecuencia", 0)

    return {
        "success": True,
        "sede_id": sede_efectiva,
        "zona_horaria": zona,
        "generado_en": ahora.isoformat(),
        "ltv": {
            # LTV = ticket_promedio × frecuencia_anual × tiempo_retención (3 años)
            "ltv_promedio":        round(ltv_prom),
            "ticket_promedio":     round(ticket_prom),
            "clientes_con_datos":  con_frecuencia,
            "formula": "ticket_promedio × (365 / frecuencia_dias) × 3 años"
        },
        "recurrencia": {
            # Cada cuántos días vuelve un cliente en promedio
            "promedio_dias":    round(recurrencia_dias) if recurrencia_dias else None,
            "texto":            f"Cada {round(recurrencia_dias)} días" if recurrencia_dias else "Sin datos",
            "clientes_recurrentes":  r.get("recurrentes", 0),     # frecuencia <= 120 días
            "total_con_frecuencia":  con_frecuencia,
            "pct_recurrentes": round(r.get("recurrentes", 0) / con_frecuencia * 100) if con_frecuencia else 0,
            "nota": "Recurrente = vuelve mínimo cada 120 días"
        },
        "estado_base": {
            "activos":   r.get("activos", 0),     # 0-120 días
            "en_riesgo": r.get("en_riesgo", 0),   # 121-180 días
            "perdidos":  r.get("perdidos", 0),    # +181 días
            "nuevos":    r.get("nuevos", 0),       # sin citas aún
            "sin_visita": r.get("sin_visita", 0),
            "total":     total,
        },
        "nuevos_por_mes": nuevos_por_mes,
    }