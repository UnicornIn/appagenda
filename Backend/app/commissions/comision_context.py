# app/commissions/comision_context.py
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo
from typing import Optional

from app.commissions.comision_engine import PeriodoConfig, get_periodo_actual
from app.database.mongo import collection_sales, collection_locales, collection_commissions


# ══════════════════════════════════════════════════════════════
# CONTEXTO — dataclass interno, no toca la BD
# ══════════════════════════════════════════════════════════════

@dataclass
class ComisionContexto:
    cantidad_actual: int
    cantidad_acumulada_periodo: int
    moneda_sede: str
    inicio_periodo: date
    fin_periodo: date


# ══════════════════════════════════════════════════════════════
# HELPER — fecha local de la sede
# ══════════════════════════════════════════════════════════════

def _hoy_sede(sede: dict) -> date:
    zona = sede.get("zona_horaria", "America/Bogota")
    return datetime.now(ZoneInfo(zona)).date()


def _ahora_sede(sede: dict) -> datetime:
    zona = sede.get("zona_horaria", "America/Bogota")
    return datetime.now(ZoneInfo(zona))


# ══════════════════════════════════════════════════════════════
# CONSTRUIR CONTEXTO — consulta async pre-cálculo
# ══════════════════════════════════════════════════════════════

async def construir_contexto(
    *,
    profesional_id: Optional[str],
    sede_id: str,
    cantidad_actual: int,
    moneda_sede: str,
    hoy: Optional[date] = None,
) -> ComisionContexto:
    """
    Consulta MongoDB para saber cuántas unidades lleva el vendedor
    en el período activo de la sede. Resultado va al ComisionContexto.
    La fecha usa la zona horaria de la sede para evitar desfases.
    """
    sede = await collection_locales.find_one({"sede_id": sede_id})
    hoy = hoy or _hoy_sede(sede or {})

    periodo_raw = (sede or {}).get("comision_periodo_config", {})
    periodo_cfg = PeriodoConfig(**periodo_raw) if periodo_raw else PeriodoConfig()
    inicio, fin = get_periodo_actual(periodo_cfg, hoy)

    cantidad_acumulada = 0

    if profesional_id:
        pipeline = [
            {"$match": {
                "profesional_id": profesional_id,
                "sede_id": sede_id,
                "estado_factura": "facturado",
                "fecha_pago": {
                    "$gte": datetime.combine(inicio, datetime.min.time()),
                    "$lte": datetime.combine(fin,   datetime.max.time()),
                }
            }},
            {"$unwind": "$items"},
            {"$match": {"items.tipo": "producto"}},
            {"$group": {"_id": None, "total": {"$sum": "$items.cantidad"}}}
        ]
        resultado = await collection_sales.aggregate(pipeline).to_list(1)
        cantidad_acumulada = resultado[0]["total"] if resultado else 0

    return ComisionContexto(
        cantidad_actual=cantidad_actual,
        cantidad_acumulada_periodo=cantidad_acumulada,
        moneda_sede=moneda_sede,
        inicio_periodo=inicio,
        fin_periodo=fin,
    )


# ══════════════════════════════════════════════════════════════
# RECÁLCULO RETROACTIVO — solo para tipo escalonado
# ══════════════════════════════════════════════════════════════

async def recalcular_comisiones_periodo(
    *,
    profesional_id: str,
    sede_id: str,
    nuevo_porcentaje: float,
    nuevo_tipo: str,          # "porcentaje" | "fijo"
    inicio_periodo: date,
    fin_periodo: date,
) -> None:
    """
    Cuando el vendedor sube de nivel escalonado, recalcula todas las
    comisiones de productos del período activo al nuevo porcentaje/valor.
    Actualiza collection_commissions directamente.
    Solo actúa si el documento de comisión está en estado 'pendiente'.
    """
    sede = await collection_locales.find_one({"sede_id": sede_id})
    ahora = _ahora_sede(sede or {}).replace(tzinfo=None)

    comision_doc = await collection_commissions.find_one({
        "profesional_id": profesional_id,
        "sede_id": sede_id,
        "estado": "pendiente",
        # Confirmar que el doc pertenece al período activo
        "periodo_inicio": {"$gte": inicio_periodo.strftime("%Y-%m-%d")},
        "periodo_fin":    {"$lte": fin_periodo.strftime("%Y-%m-%d")},
    })

    if not comision_doc:
        print(f"⚠️ recalcular_comisiones_periodo: no se encontró doc pendiente para {profesional_id}")
        return

    detalle = comision_doc.get("productos_detalle", [])
    if not detalle:
        return

    nuevo_total = 0.0
    for item in detalle:
        valor_producto = float(item.get("valor_producto", item.get("valor_comision", 0)))
        if nuevo_tipo == "porcentaje":
            item["valor_comision"] = round((valor_producto * nuevo_porcentaje) / 100, 2)
        else:
            # fijo: el valor es el monto fijo, independiente del subtotal
            item["valor_comision"] = round(float(nuevo_porcentaje), 2)
        nuevo_total += item["valor_comision"]

    nuevo_total = round(nuevo_total, 2)

    await collection_commissions.update_one(
        {"_id": comision_doc["_id"]},
        {"$set": {
            "productos_detalle": detalle,
            "total_comisiones": nuevo_total,
            "ultima_actualizacion": ahora,
            "nivel_escalonado_actual": nuevo_porcentaje,
        }}
    )
    print(f"♻️ Comisiones recalculadas → {nuevo_porcentaje}{'%' if nuevo_tipo == 'porcentaje' else ' (fijo)'} para {profesional_id} | total: {nuevo_total}")