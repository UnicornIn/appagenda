"""
╔══════════════════════════════════════════════════════════════════════╗
║               MÓDULO DE GIFTCARDS - routes_giftcards.py              ║
║                                                                      ║
║  Flujo de integración:                                               ║
║  1. CRUD de giftcards (crear, listar, consultar, cancelar)           ║
║  2. Al crear/abonar cita → reservar saldo (no se descuenta aún)      ║
║  3. Al facturar → redimir definitivamente y descontar saldo          ║
║  4. Si cita cancela → liberar la reserva                             ║
╚══════════════════════════════════════════════════════════════════════╝
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timedelta
from typing import Optional, List
from bson import ObjectId
import random
import string
from pydantic import BaseModel, Field

from app.database.mongo import (
    collection_giftcards,     # ← agregar en mongo.py
    collection_citas,
    collection_clients,
    collection_locales,
)
from app.auth.routes import get_current_user

router = APIRouter()


# ══════════════════════════════════════════
# MODELOS / SCHEMAS
# ══════════════════════════════════════════

class GiftcardCreate(BaseModel):
    sede_id: str
    comprador_cliente_id: Optional[str] = None      # quien la paga
    beneficiario_cliente_id: Optional[str] = None   # a quien va dirigida
    comprador_nombre: Optional[str] = None          # si no es cliente registrado
    beneficiario_nombre: Optional[str] = None
    valor: float                                    # monto cargado
    moneda: Optional[str] = None                    # hereda de la sede si no se envía
    dias_vigencia: Optional[int] = 365              # vence en N días (None = no vence)
    notas: Optional[str] = None


class GiftcardUpdate(BaseModel):
    beneficiario_cliente_id: Optional[str] = None
    beneficiario_nombre: Optional[str] = None
    dias_vigencia: Optional[int] = None
    notas: Optional[str] = None
    estado: Optional[str] = None  # solo admin puede cambiar estado manual


class ReservaRequest(BaseModel):
    cita_id: str
    monto: float                  # cuánto se descontará de la giftcard
    codigo: str


class LiberarRequest(BaseModel):
    cita_id: str


class RedimirRequest(BaseModel):
    cita_id: str
    factura_id: Optional[str] = None
    numero_comprobante: Optional[str] = None
    monto: float                  # monto final a redimir (puede diferir si hubo ajuste)


# ══════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════

def _generar_codigo() -> str:
    """
    Genera un código de giftcard único tipo: GC-XXXX-XXXX-XXXX
    Alfanumérico sin caracteres ambiguos (0/O, 1/I/l).
    """
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    grupos = ["".join(random.choices(chars, k=4)) for _ in range(3)]
    return "GC-" + "-".join(grupos)


def _estado_giftcard(doc: dict) -> str:
    """
    Recalcula el estado dinámicamente según saldo y vencimiento.
    No depende del campo 'estado' guardado (que puede quedar desactualizado).
    """
    if doc.get("estado") == "cancelada":
        return "cancelada"

    # Verificar vencimiento
    # ⚠️ El campo puede llegar como datetime (desde Mongo) o como str (post-serialización)
    fecha_vencimiento = doc.get("fecha_vencimiento")
    if fecha_vencimiento:
        if isinstance(fecha_vencimiento, str):
            try:
                fecha_vencimiento = datetime.fromisoformat(fecha_vencimiento)
            except ValueError:
                fecha_vencimiento = None
        if fecha_vencimiento and datetime.now() > fecha_vencimiento:
            return "vencida"

    saldo = round(float(doc.get("saldo_disponible", 0)), 2)
    valor = round(float(doc.get("valor", 0)), 2)
    saldo_reservado = round(float(doc.get("saldo_reservado", 0)), 2)

    if saldo <= 0 and saldo_reservado <= 0:
        return "usada"
    if saldo < valor:
        return "parcialmente_usada"
    return "activa"


def _serializar(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    for campo in ["fecha_emision", "fecha_vencimiento", "fecha_primer_uso", "created_at"]:
        if isinstance(doc.get(campo), datetime):
            doc[campo] = doc[campo].isoformat()
    # Recalcular estado dinámico
    doc["estado"] = _estado_giftcard(doc)
    return doc


# ══════════════════════════════════════════
# CRUD - CREAR GIFTCARD
# ══════════════════════════════════════════

@router.post("/", response_model=dict)
async def crear_giftcard(
    data: GiftcardCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Crea una nueva giftcard.
    - Solo admin_sede o super_admin pueden crearlas.
    - El código se genera automáticamente (único en la sede).
    - El saldo inicial = valor cargado.
    """
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado para crear giftcards")

    # Validar sede
    sede = await collection_locales.find_one({"sede_id": data.sede_id})
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")

    moneda = data.moneda or sede.get("moneda", "COP")

    if data.valor <= 0:
        raise HTTPException(status_code=400, detail="El valor de la giftcard debe ser mayor a 0")

    # Validar comprador si viene cliente_id
    comprador_nombre = data.comprador_nombre
    if data.comprador_cliente_id:
        comprador = await collection_clients.find_one({"cliente_id": data.comprador_cliente_id})
        if not comprador:
            raise HTTPException(status_code=404, detail="Cliente comprador no encontrado")
        comprador_nombre = comprador_nombre or comprador.get("nombre", "")

    # Validar beneficiario si viene cliente_id
    beneficiario_nombre = data.beneficiario_nombre
    if data.beneficiario_cliente_id:
        beneficiario = await collection_clients.find_one({"cliente_id": data.beneficiario_cliente_id})
        if not beneficiario:
            raise HTTPException(status_code=404, detail="Cliente beneficiario no encontrado")
        beneficiario_nombre = beneficiario_nombre or beneficiario.get("nombre", "")

    # Generar código único (reintento si colisiona)
    for _ in range(5):
        codigo = _generar_codigo()
        existente = await collection_giftcards.find_one({"codigo": codigo})
        if not existente:
            break
    else:
        raise HTTPException(status_code=500, detail="No se pudo generar código único. Intenta de nuevo.")

    # Calcular fecha de vencimiento
    fecha_emision = datetime.now()
    fecha_vencimiento = None
    if data.dias_vigencia and data.dias_vigencia > 0:
        fecha_vencimiento = fecha_emision + timedelta(days=data.dias_vigencia)

    doc = {
        "codigo": codigo,
        "sede_id": data.sede_id,
        "sede_nombre": sede.get("nombre"),
        "moneda": moneda,

        # Comprador
        "comprador_cliente_id": data.comprador_cliente_id,
        "comprador_nombre": comprador_nombre,

        # Beneficiario
        "beneficiario_cliente_id": data.beneficiario_cliente_id,
        "beneficiario_nombre": beneficiario_nombre,

        # Valor y saldo
        "valor": round(float(data.valor), 2),          # valor original (nunca cambia)
        "saldo_disponible": round(float(data.valor), 2), # decrece con cada uso
        "saldo_reservado": 0.0,                        # bloqueado por citas pendientes de factura
        "saldo_usado": 0.0,                            # acumulado definitivo

        # Fechas
        "fecha_emision": fecha_emision,
        "fecha_vencimiento": fecha_vencimiento,
        "fecha_primer_uso": None,

        # Estado
        "estado": "activa",

        # Historial de movimientos
        "historial": [],

        # Metadata
        "notas": data.notas,
        "creada_por": current_user.get("email"),
        "created_at": fecha_emision,
    }

    result = await collection_giftcards.insert_one(doc)
    doc["_id"] = str(result.inserted_id)

    return {
        "success": True,
        "message": "Giftcard creada exitosamente",
        "giftcard": _serializar(doc)
    }


# ══════════════════════════════════════════
# CRUD - LISTAR GIFTCARDS DE UNA SEDE
# ══════════════════════════════════════════

@router.get("/sede/{sede_id}", response_model=dict)
async def listar_giftcards(
    sede_id: str,
    estado: Optional[str] = Query(None, description="Filtrar: activa, usada, vencida, cancelada, parcialmente_usada"),
    cliente_id: Optional[str] = Query(None, description="Filtrar por comprador o beneficiario"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user)
):
    """
    Lista giftcards de una sede con filtros opcionales.
    """
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    filtro = {"sede_id": sede_id}

    if estado:
        filtro["estado"] = estado

    if cliente_id:
        filtro["$or"] = [
            {"comprador_cliente_id": cliente_id},
            {"beneficiario_cliente_id": cliente_id}
        ]

    skip = (page - 1) * limit
    total = await collection_giftcards.count_documents(filtro)
    docs = await collection_giftcards.find(filtro).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)

    return {
        "success": True,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit if total > 0 else 0
        },
        "giftcards": [_serializar(d) for d in docs]
    }


# ══════════════════════════════════════════
# CRUD - CONSULTAR GIFTCARD POR CÓDIGO
# ══════════════════════════════════════════

@router.get("/{codigo}", response_model=dict)
async def consultar_giftcard(
    codigo: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Consulta el detalle y saldo actual de una giftcard.
    Útil para la caja antes de aceptar pago con giftcard.
    """
    codigo = codigo.upper().strip()
    doc = await collection_giftcards.find_one({"codigo": codigo})
    if not doc:
        raise HTTPException(status_code=404, detail="Giftcard no encontrada")

    # ⚠️ Calcular alerta ANTES de _serializar() porque esa función
    # muta el dict convirtiendo los datetime a str in-place
    alerta_vencimiento = None
    fecha_venc = doc.get("fecha_vencimiento")
    if fecha_venc:
        # Puede llegar como datetime (Mongo) o str (edge case)
        if isinstance(fecha_venc, str):
            try:
                fecha_venc = datetime.fromisoformat(fecha_venc)
            except ValueError:
                fecha_venc = None
        if fecha_venc:
            dias_restantes = (fecha_venc - datetime.now()).days
            if 0 < dias_restantes <= 30:
                alerta_vencimiento = f"Vence en {dias_restantes} días"

    giftcard = _serializar(doc)

    return {
        "success": True,
        "giftcard": giftcard,
        "alerta_vencimiento": alerta_vencimiento
    }


# ══════════════════════════════════════════
# CRUD - EDITAR GIFTCARD
# ══════════════════════════════════════════

@router.put("/{codigo}", response_model=dict)
async def editar_giftcard(
    codigo: str,
    cambios: GiftcardUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Edita campos no financieros de una giftcard.
    El valor y saldo NO se pueden editar directamente (solo via movimientos).
    """
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    codigo = codigo.upper().strip()
    doc = await collection_giftcards.find_one({"codigo": codigo})
    if not doc:
        raise HTTPException(status_code=404, detail="Giftcard no encontrada")

    update_fields = {}

    if cambios.beneficiario_cliente_id is not None:
        beneficiario = await collection_clients.find_one({"cliente_id": cambios.beneficiario_cliente_id})
        if not beneficiario:
            raise HTTPException(status_code=404, detail="Beneficiario no encontrado")
        update_fields["beneficiario_cliente_id"] = cambios.beneficiario_cliente_id
        update_fields["beneficiario_nombre"] = cambios.beneficiario_nombre or beneficiario.get("nombre")

    if cambios.beneficiario_nombre is not None:
        update_fields["beneficiario_nombre"] = cambios.beneficiario_nombre

    if cambios.dias_vigencia is not None:
        nueva_fecha = doc["fecha_emision"] + timedelta(days=cambios.dias_vigencia)
        update_fields["fecha_vencimiento"] = nueva_fecha

    if cambios.notas is not None:
        update_fields["notas"] = cambios.notas

    # Solo super_admin puede cambiar estado manualmente
    if cambios.estado and current_user["rol"] == "super_admin":
        estados_validos = {"activa", "cancelada", "usada", "parcialmente_usada"}
        if cambios.estado not in estados_validos:
            raise HTTPException(status_code=400, detail=f"Estado inválido. Use: {estados_validos}")
        update_fields["estado"] = cambios.estado

    if not update_fields:
        raise HTTPException(status_code=400, detail="No hay campos válidos para actualizar")

    update_fields["actualizado_por"] = current_user.get("email")
    update_fields["ultima_actualizacion"] = datetime.now()

    await collection_giftcards.update_one({"codigo": codigo}, {"$set": update_fields})

    doc_actualizado = await collection_giftcards.find_one({"codigo": codigo})
    return {
        "success": True,
        "message": "Giftcard actualizada",
        "giftcard": _serializar(doc_actualizado)
    }


# ══════════════════════════════════════════
# CRUD - CANCELAR GIFTCARD
# ══════════════════════════════════════════

@router.delete("/{codigo}", response_model=dict)
async def cancelar_giftcard(
    codigo: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Cancela una giftcard. Solo si no tiene saldo reservado.
    No se elimina físicamente (auditoría).
    """
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    codigo = codigo.upper().strip()
    doc = await collection_giftcards.find_one({"codigo": codigo})
    if not doc:
        raise HTTPException(status_code=404, detail="Giftcard no encontrada")

    if doc.get("estado") == "cancelada":
        raise HTTPException(status_code=400, detail="La giftcard ya está cancelada")

    if float(doc.get("saldo_reservado", 0)) > 0:
        raise HTTPException(
            status_code=400,
            detail="No se puede cancelar: tiene saldo reservado en citas pendientes de facturar"
        )

    await collection_giftcards.update_one(
        {"codigo": codigo},
        {"$set": {
            "estado": "cancelada",
            "cancelada_por": current_user.get("email"),
            "fecha_cancelacion": datetime.now()
        }}
    )

    return {"success": True, "message": "Giftcard cancelada exitosamente", "codigo": codigo}


# ══════════════════════════════════════════════════════════
# OPERACIONES DE FLUJO - RESERVAR SALDO
# Al crear/abonar cita con método "giftcard"
# El saldo se mueve de disponible → reservado (no se pierde aún)
# ══════════════════════════════════════════════════════════

@router.post("/{codigo}/reservar", response_model=dict)
async def reservar_saldo_giftcard(
    codigo: str,
    data: ReservaRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Reserva saldo de una giftcard al crear/abonar una cita.
    
    El dinero NO se descuenta aún — se bloquea temporalmente.
    Se descuenta definitivamente en el endpoint /redimir (al facturar).
    
    Si la cita se cancela → llamar a /liberar para devolver el saldo.
    
    Reglas:
    - La giftcard debe estar activa y no vencida
    - El monto no puede superar el saldo disponible
    - No se puede reservar dos veces para la misma cita
    """
    if current_user["rol"] not in ["usuario", "admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    codigo = codigo.upper().strip()
    doc = await collection_giftcards.find_one({"codigo": codigo})
    if not doc:
        raise HTTPException(status_code=404, detail="Giftcard no encontrada")

    # Verificar estado
    estado_actual = _estado_giftcard(doc)
    if estado_actual in ["cancelada", "vencida", "usada"]:
        raise HTTPException(
            status_code=400,
            detail=f"La giftcard no puede usarse: estado '{estado_actual}'"
        )

    # Verificar que no esté ya reservada para esta cita
    historial = doc.get("historial", [])
    ya_reservada = any(
        m.get("cita_id") == data.cita_id and m.get("tipo") == "reserva"
        for m in historial
    )
    if ya_reservada:
        raise HTTPException(
            status_code=400,
            detail="Ya existe una reserva activa de esta giftcard para esta cita"
        )

    # Verificar saldo suficiente
    saldo_disponible = round(float(doc.get("saldo_disponible", 0)), 2)
    monto = round(float(data.monto), 2)

    if monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")

    if monto > saldo_disponible:
        raise HTTPException(
            status_code=400,
            detail=f"Saldo insuficiente. Disponible: {saldo_disponible} {doc.get('moneda')}, solicitado: {monto}"
        )

    # Mover saldo: disponible → reservado
    nuevo_disponible = round(saldo_disponible - monto, 2)
    nuevo_reservado = round(float(doc.get("saldo_reservado", 0)) + monto, 2)

    movimiento = {
        "tipo": "reserva",
        "cita_id": data.cita_id,
        "monto": monto,
        "fecha": datetime.now(),
        "registrado_por": current_user.get("email"),
        "saldo_disponible_antes": saldo_disponible,
        "saldo_disponible_despues": nuevo_disponible,
    }

    await collection_giftcards.update_one(
        {"codigo": codigo},
        {
            "$set": {
                "saldo_disponible": nuevo_disponible,
                "saldo_reservado": nuevo_reservado,
            },
            "$push": {"historial": movimiento}
        }
    )

    doc_actualizado = await collection_giftcards.find_one({"codigo": codigo})
    return {
        "success": True,
        "message": f"Saldo de {monto} {doc.get('moneda')} reservado correctamente",
        "saldo_disponible": nuevo_disponible,
        "saldo_reservado": nuevo_reservado,
        "moneda": doc.get("moneda"),
        "giftcard": _serializar(doc_actualizado)
    }


# ══════════════════════════════════════════════════════════
# OPERACIONES DE FLUJO - LIBERAR RESERVA
# Si la cita se cancela → devolver saldo reservado → disponible
# ══════════════════════════════════════════════════════════

@router.post("/{codigo}/liberar", response_model=dict)
async def liberar_reserva_giftcard(
    codigo: str,
    data: LiberarRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Libera la reserva de saldo cuando una cita se cancela.
    El saldo vuelve de reservado → disponible.
    """
    if current_user["rol"] not in ["admin_sede", "super_admin", "usuario"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    codigo = codigo.upper().strip()
    doc = await collection_giftcards.find_one({"codigo": codigo})
    if not doc:
        raise HTTPException(status_code=404, detail="Giftcard no encontrada")

    # Buscar la reserva correspondiente a esta cita
    historial = doc.get("historial", [])
    reserva = next(
        (m for m in historial
         if m.get("cita_id") == data.cita_id and m.get("tipo") == "reserva"),
        None
    )

    if not reserva:
        raise HTTPException(
            status_code=404,
            detail="No existe reserva activa de esta giftcard para esta cita"
        )

    # Verificar que no haya sido ya redimida
    ya_redimida = any(
        m.get("cita_id") == data.cita_id and m.get("tipo") == "redencion"
        for m in historial
    )
    if ya_redimida:
        raise HTTPException(
            status_code=400,
            detail="Esta reserva ya fue redimida en facturación, no se puede liberar"
        )

    monto_reservado = round(float(reserva.get("monto", 0)), 2)

    nuevo_disponible = round(float(doc.get("saldo_disponible", 0)) + monto_reservado, 2)
    nuevo_reservado = round(float(doc.get("saldo_reservado", 0)) - monto_reservado, 2)
    nuevo_reservado = max(0.0, nuevo_reservado)  # Nunca negativo

    movimiento = {
        "tipo": "liberacion",
        "cita_id": data.cita_id,
        "monto": monto_reservado,
        "fecha": datetime.now(),
        "registrado_por": current_user.get("email"),
        "motivo": "cita_cancelada"
    }

    await collection_giftcards.update_one(
        {"codigo": codigo},
        {
            "$set": {
                "saldo_disponible": nuevo_disponible,
                "saldo_reservado": nuevo_reservado,
            },
            "$push": {"historial": movimiento}
        }
    )

    doc_actualizado = await collection_giftcards.find_one({"codigo": codigo})
    return {
        "success": True,
        "message": f"Saldo de {monto_reservado} {doc.get('moneda')} liberado correctamente",
        "saldo_disponible": nuevo_disponible,
        "saldo_reservado": nuevo_reservado,
        "giftcard": _serializar(doc_actualizado)
    }


# ══════════════════════════════════════════════════════════
# OPERACIONES DE FLUJO - REDIMIR (llamado desde facturación)
# Descuenta definitivamente el saldo reservado
# ══════════════════════════════════════════════════════════

@router.post("/{codigo}/redimir", response_model=dict)
async def redimir_giftcard(
    codigo: str,
    data: RedimirRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    ⚡ Llamado automáticamente desde el endpoint de facturación.
    Convierte la reserva en redencion definitiva.
    
    - Descuenta del saldo_reservado
    - Acumula en saldo_usado
    - Registra referencia de la factura
    - Actualiza estado (usada / parcialmente_usada)
    
    Permite redención parcial: si se reservó 50k pero el ajuste fue 45k,
    los 5k sobrantes vuelven a disponible.
    """
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado para redimir giftcards")

    codigo = codigo.upper().strip()
    doc = await collection_giftcards.find_one({"codigo": codigo})
    if not doc:
        raise HTTPException(status_code=404, detail="Giftcard no encontrada")

    # Verificar que no esté ya redimida para esta cita
    historial = doc.get("historial", [])
    ya_redimida = any(
        m.get("cita_id") == data.cita_id and m.get("tipo") == "redencion"
        for m in historial
    )
    if ya_redimida:
        raise HTTPException(
            status_code=400,
            detail="Esta giftcard ya fue redimida para esta cita"
        )

    # Buscar la reserva para obtener el monto bloqueado
    reserva = next(
        (m for m in historial
         if m.get("cita_id") == data.cita_id and m.get("tipo") == "reserva"),
        None
    )

    monto_redimir = round(float(data.monto), 2)

    # Si no hay reserva previa (uso directo en facturación sin reserva)
    if not reserva:
        # Verificar saldo disponible directamente
        saldo_disponible = round(float(doc.get("saldo_disponible", 0)), 2)
        if monto_redimir > saldo_disponible:
            raise HTTPException(
                status_code=400,
                detail=f"Saldo insuficiente: disponible {saldo_disponible}, requerido {monto_redimir}"
            )
        nuevo_disponible = round(saldo_disponible - monto_redimir, 2)
        nuevo_reservado = float(doc.get("saldo_reservado", 0))
    else:
        # Ajuste entre lo reservado y lo que se redime realmente
        monto_reservado = round(float(reserva.get("monto", 0)), 2)
        diferencia = round(monto_reservado - monto_redimir, 2)

        nuevo_reservado = round(float(doc.get("saldo_reservado", 0)) - monto_reservado, 2)
        nuevo_reservado = max(0.0, nuevo_reservado)

        # Si el monto redimido es menor al reservado, la diferencia vuelve a disponible
        nuevo_disponible = float(doc.get("saldo_disponible", 0))
        if diferencia > 0:
            nuevo_disponible = round(nuevo_disponible + diferencia, 2)

    nuevo_usado = round(float(doc.get("saldo_usado", 0)) + monto_redimir, 2)

    movimiento = {
        "tipo": "redencion",
        "cita_id": data.cita_id,
        "factura_id": data.factura_id,
        "numero_comprobante": data.numero_comprobante,
        "monto": monto_redimir,
        "fecha": datetime.now(),
        "registrado_por": current_user.get("email"),
    }

    # Primer uso
    update_set = {
        "saldo_disponible": nuevo_disponible,
        "saldo_reservado": nuevo_reservado,
        "saldo_usado": nuevo_usado,
    }
    if not doc.get("fecha_primer_uso"):
        update_set["fecha_primer_uso"] = datetime.now()

    await collection_giftcards.update_one(
        {"codigo": codigo},
        {
            "$set": update_set,
            "$push": {"historial": movimiento}
        }
    )

    # Recalcular estado
    doc_actualizado = await collection_giftcards.find_one({"codigo": codigo})
    estado_nuevo = _estado_giftcard(doc_actualizado)
    await collection_giftcards.update_one(
        {"codigo": codigo},
        {"$set": {"estado": estado_nuevo}}
    )

    doc_final = await collection_giftcards.find_one({"codigo": codigo})
    return {
        "success": True,
        "message": f"Giftcard redimida: {monto_redimir} {doc.get('moneda')}",
        "monto_redimido": monto_redimir,
        "saldo_restante": nuevo_disponible,
        "estado": estado_nuevo,
        "giftcard": _serializar(doc_final)
    }


# ══════════════════════════════════════════════════════════
# HISTORIAL DE MOVIMIENTOS
# ══════════════════════════════════════════════════════════

@router.get("/{codigo}/historial", response_model=dict)
async def historial_giftcard(
    codigo: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Devuelve el historial completo de movimientos de una giftcard.
    """
    codigo = codigo.upper().strip()
    doc = await collection_giftcards.find_one({"codigo": codigo})
    if not doc:
        raise HTTPException(status_code=404, detail="Giftcard no encontrada")

    historial = doc.get("historial", [])
    # Serializar fechas dentro del historial
    for mov in historial:
        if isinstance(mov.get("fecha"), datetime):
            mov["fecha"] = mov["fecha"].isoformat()

    return {
        "success": True,
        "codigo": codigo,
        "valor_original": doc.get("valor"),
        "saldo_disponible": doc.get("saldo_disponible"),
        "saldo_usado": doc.get("saldo_usado"),
        "moneda": doc.get("moneda"),
        "estado": _estado_giftcard(doc),
        "total_movimientos": len(historial),
        "historial": historial
    }