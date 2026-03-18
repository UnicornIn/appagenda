from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from bson import ObjectId
import random

from app.auth.routes import get_current_user
from app.utils.timezone import today_str, today
from app.bills.routes import obtener_porcentaje_comision_producto
from app.database.mongo import (
    collection_products,
    collection_clients,
    collection_locales,
    collection_sales,
    collection_inventarios,
    collection_giftcards,
    collection_auth,
    collection_estilista,  # ⭐ Para buscar estilista por profesional_id
    collection_commissions,    # ⭐ Para registrar comisiones de productos
)

router = APIRouter(prefix="/sales", tags=["Ventas Directas"])


# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════
SIMBOLOS_MONEDA = {"COP": "$", "USD": "USD ", "MXN": "MXN "}

def num(valor: float) -> int | float:
    return int(valor) if valor == int(valor) else valor

def fmt(valor: float, moneda: str = "") -> str:
    return f"{SIMBOLOS_MONEDA.get(moneda, '')}{num(valor)}"


# ═══════════════════════════════════════════════════════════════
# HELPER: CREAR O ACTUALIZAR COMISIÓN EN COLECCIÓN commissions
# ═══════════════════════════════════════════════════════════════
async def registrar_comision_venta_directa(
    *,
    venta_id: str,
    estilista: dict,
    sede: dict,
    items_con_comision: list,
    total_comision: float,
    moneda: str,
    tipo_comision_sede: str,
    registrado_por: str,
):
    """
    Busca una comisión pendiente del estilista en esta sede para el día de hoy.
    Si existe, agrega el detalle. Si no, crea una nueva.

    Estructura de cada item en servicios_detalle para ventas directas:
    {
        "tipo": "venta_directa",
        "venta_id": "...",
        "fecha": "YYYY-MM-DD",
        "descripcion": "Producto X (x2)",
        "valor_servicio": 0,             # Sin valor de servicio en ventas directas
        "valor_comision_servicio": 0,    # Sin comisión de servicio
        "valor_productos": <subtotal>,
        "valor_comision_productos": <comision>,
        "registrado_por": "email"
    }
    """
    profesional_id  = estilista.get("profesional_id")
    profesional_nombre = (
        estilista.get("nombre", "") + " " + estilista.get("apellido", "")
    ).strip()
    sede_id   = sede.get("sede_id")
    sede_nombre = sede.get("nombre", "")
    hoy = datetime.now().strftime("%Y-%m-%d")

    # Construir detalle de cada producto con comisión
    detalle_items = []
    for item in items_con_comision:
        detalle_items.append({
            "tipo": "venta_directa",
            "venta_id": venta_id,
            "fecha": hoy,
            "descripcion": f"{item['nombre']} (x{item['cantidad']})",
            "valor_servicio": 0,
            "valor_comision_servicio": 0,
            "valor_productos": num(item["subtotal"]),
            "valor_comision_productos": num(item["comision_valor"]),
            "registrado_por": registrado_por,
        })

    # Buscar comisión pendiente del mismo estilista/sede del día de hoy
    # (se acumula en la misma hasta que se liquide, como en citas)
    comision_existente = await collection_commissions.find_one({
        "profesional_id": profesional_id,
        "sede_id": sede_id,
        "$or": [
            {"estado": "pendiente"},
            {"estado": {"$exists": False}},
        ],
    })

    if comision_existente:
        # ─── ACTUALIZAR la comisión existente ───────────────────────
        servicios_actuales = comision_existente.get("productos_detalle", [])
        nuevo_total_comision = round(
            float(comision_existente.get("total_comisiones", 0)) + total_comision, 2
        )
        nuevo_total_servicios = round(
            float(comision_existente.get("total_servicios", 0)) + sum(i["subtotal"] for i in items_con_comision), 2
        )

        # Actualizar periodo_fin al día más reciente
        await collection_commissions.update_one(
            {"_id": comision_existente["_id"]},
            {
                "$set": {
                    "total_comisiones": num(nuevo_total_comision),
                    "total_servicios": num(nuevo_total_servicios),
                    "periodo_fin": hoy,
                    "ultima_actualizacion": today(sede).replace(tzinfo=None)
                },
                "$push": {
                    "productos_detalle": {"$each": detalle_items},
                },
            }
        )
        print(f"💰 Comisión actualizada para {profesional_nombre}: +{fmt(total_comision, moneda)}")
        return str(comision_existente["_id"])

    else:
        # ─── CREAR nueva comisión ────────────────────────────────────
        nueva_comision = {
            "profesional_id": profesional_id,
            "profesional_nombre": profesional_nombre,
            "sede_id": sede_id,
            "sede_nombre": sede_nombre,
            "moneda": moneda,
            "tipo_comision": tipo_comision_sede,
            "total_servicios": num(round(sum(i["subtotal"] for i in items_con_comision), 2)),
            "total_comisiones": num(round(total_comision, 2)),
            "productos_detalle": detalle_items,
            "periodo_inicio": hoy,
            "periodo_fin": hoy,
            "estado": "pendiente",
            "creado_en": today(sede).replace(tzinfo=None),
        }
        result = await collection_commissions.insert_one(nueva_comision)
        print(f"💰 Nueva comisión creada para {profesional_nombre}: {fmt(total_comision, moneda)}")
        return str(result.inserted_id)


# ============================================================
# MODELOS
# ============================================================
class ProductoVenta(BaseModel):
    producto_id: str
    cantidad: int

class VentaDirecta(BaseModel):
    cliente_id: Optional[str] = None
    sede_id: str
    vendido_por: Optional[str] = None        # Nombre libre (default: usuario autenticado)
    profesional_id: Optional[str] = None       # ⭐ ID del estilista para enlazar comisiones
    productos: List[ProductoVenta]
    metodo_pago: str
    abono: Optional[float] = 0
    notas: Optional[str] = None
    codigo_giftcard: Optional[str] = None

class PagoVentaRequest(BaseModel):
    monto: float
    metodo_pago: str
    notas: Optional[str] = None
    codigo_giftcard: Optional[str] = None


# ============================================================
# CREAR VENTA DIRECTA
# ============================================================
@router.post("/", response_model=dict)
async def crear_venta_directa(venta: VentaDirecta, current_user: dict = Depends(get_current_user)):
    if current_user["rol"] not in ["admin_sede", "super_admin", "estilista", "recepcionista", "call_center"]:
        raise HTTPException(status_code=403, detail="No tienes permisos para registrar ventas")

    rol_usuario    = current_user["rol"]
    email_usuario  = current_user.get("email")
    nombre_usuario = current_user.get("nombre", "")

    # ─── Cliente opcional (venta de mostrador) ──────────────────────
    cliente_id = venta.cliente_id.strip() if isinstance(venta.cliente_id, str) else None
    if cliente_id == "":
        cliente_id = None

    cliente = None
    if cliente_id:
        cliente = await collection_clients.find_one({"cliente_id": cliente_id})
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # ─── Validar sede ────────────────────────────────────────────────
    sede = await collection_locales.find_one({"sede_id": venta.sede_id})
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")

    moneda = sede.get("moneda", "COP")

    # ─── Reglas de comisión de la sede ──────────────────────────────
    reglas_comision       = sede.get("reglas_comision", {"tipo": "servicios"})
    tipo_comision_sede    = reglas_comision.get("tipo", "servicios")
    permite_comision_prod = tipo_comision_sede in ["productos", "mixto"]

    # ─── Resolver estilista y vendido_por ───────────────────────────
    #
    #  Prioridad del campo "vendido_por":
    #   1. Si se envía profesional_id → se usa el nombre del estilista encontrado en BD
    #   2. Si se envía vendido_por (texto libre) → se usa tal cual
    #   3. Fallback → nombre del usuario autenticado
    #
    estilista_doc   = None
    profesional_id_guardado = None

    if venta.profesional_id:
        estilista_doc = await collection_estilista.find_one(
            {"profesional_id": venta.profesional_id}
        )
        if not estilista_doc:
            raise HTTPException(
                status_code=404,
                detail=f"Estilista con ID '{venta.profesional_id}' no encontrado"
            )
        profesional_id_guardado = venta.profesional_id
        nombre_vendedor = (
            estilista_doc.get("nombre", "") + " " + estilista_doc.get("apellido", "")
        ).strip()
    elif venta.vendido_por and venta.vendido_por.strip():
        nombre_vendedor = venta.vendido_por.strip()
    else:
        nombre_vendedor = nombre_usuario

    # ─── Determina si aplica comisión de productos ──────────────────
    #
    #   Aplica si:
    #   - La sede lo permite (tipo_comision "productos" o "mixto")
    #   - Y el rol del usuario es uno de los que generan comisión por productos (estilista, recepcionista, call_center, admin_sede)
    #
    ROLES_CON_COMISION = {"estilista", "recepcionista", "call_center", "admin_sede"}
    auth_vendedor_doc = None
    if not estilista_doc and rol_usuario in ROLES_CON_COMISION:
        auth_vendedor_doc = await collection_auth.find_one(
            {"correo_electronico": email_usuario}
        )
    vendedor_doc_para_comision = estilista_doc or auth_vendedor_doc

    aplica_comision = permite_comision_prod and (
        rol_usuario in ROLES_CON_COMISION or estilista_doc is not None
    )


    # ─── Procesar productos ─────────────────────────────────────────
    items = []
    items_con_comision = []   # solo los que generan comisión
    total_venta = 0
    total_comision_productos = 0

    for item in venta.productos:
        producto_db = await collection_products.find_one({"id": item.producto_id})
        if not producto_db:
            raise HTTPException(status_code=404, detail=f"Producto '{item.producto_id}' no encontrado")

        inventario = await collection_inventarios.find_one(
            {"producto_id": item.producto_id, "sede_id": venta.sede_id}
        )
        if not inventario:
            raise HTTPException(
                status_code=400,
                detail=f"No hay inventario para '{producto_db.get('nombre')}' en esta sede"
            )

        stock_actual = inventario.get("stock_actual", 0)
        if stock_actual < item.cantidad:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente para '{producto_db.get('nombre')}'. Disponible: {stock_actual}"
            )

        precios_producto = producto_db.get("precios", {})
        if moneda not in precios_producto:
            raise HTTPException(
                status_code=400,
                detail=f"El producto '{producto_db.get('nombre')}' no tiene precio en {moneda}"
            )

        precio_unitario = round(precios_producto[moneda], 2)
        subtotal        = round(item.cantidad * precio_unitario, 2)

        # Comisión por producto (solo si aplica)
        comision_porcentaje = 0
        comision_valor      = 0
        if aplica_comision:
            comision_porcentaje = obtener_porcentaje_comision_producto(
                producto_db, vendedor_doc_para_comision, inventario
            )
            comision_valor      = round((subtotal * comision_porcentaje) / 100, 2)
            total_comision_productos += comision_valor

        item_doc = {
            "tipo": "producto",
            "producto_id": item.producto_id,
            "nombre": producto_db.get("nombre"),
            "cantidad": item.cantidad,
            "precio_unitario": num(precio_unitario),
            "subtotal": num(subtotal),
            "moneda": moneda,
            "comision": num(comision_valor),          # ⭐ valor de comisión calculado
            "comision_porcentaje": comision_porcentaje,
        }
        items.append(item_doc)
        total_venta += subtotal

        if aplica_comision and comision_valor > 0:
            items_con_comision.append({
                **item_doc,
                "comision_valor": comision_valor,
            })

    total_venta              = round(total_venta, 2)
    total_comision_productos = round(total_comision_productos, 2)
    abono_solicitado         = round(float(venta.abono or 0), 2)

    if abono_solicitado > total_venta:
        raise HTTPException(
            status_code=400,
            detail=f"El abono ({fmt(abono_solicitado, moneda)}) excede el total ({fmt(total_venta, moneda)})"
        )

    # ─── Giftcard — validar antes del insert ────────────────────────
    abono_real = abono_solicitado
    codigo_giftcard_guardado = None

    if venta.metodo_pago == "giftcard" and abono_solicitado > 0:
        if not venta.codigo_giftcard:
            raise HTTPException(
                status_code=400,
                detail="Debe enviar codigo_giftcard cuando el método de pago es 'giftcard'"
            )

        from app.giftcards.routes_giftcards import _estado_giftcard

        codigo_gc = venta.codigo_giftcard.upper().strip()
        gc_doc = await collection_giftcards.find_one({"codigo": codigo_gc})
        if not gc_doc:
            raise HTTPException(status_code=404, detail=f"Giftcard '{codigo_gc}' no encontrada")

        estado_gc = _estado_giftcard(gc_doc)
        if estado_gc in ["cancelada", "vencida", "usada"]:
            raise HTTPException(status_code=400, detail=f"Giftcard no válida: estado '{estado_gc}'")

        saldo_gc = round(float(gc_doc.get("saldo_disponible", 0)), 2)
        if saldo_gc <= 0:
            raise HTTPException(status_code=400, detail="La giftcard no tiene saldo disponible")

        abono_real = round(min(abono_solicitado, saldo_gc), 2)
        codigo_giftcard_guardado = codigo_gc
        print(f"🎁 Giftcard {codigo_gc} validada: cubre {fmt(abono_real, moneda)}")

    saldo_pendiente = round(total_venta - abono_real, 2)
    estado_pago = "pagado" if saldo_pendiente <= 0 else ("abonado" if abono_real > 0 else "pendiente")

    historial_pagos = []
    if abono_real > 0:
        historial_pagos.append({
            "fecha": today(sede).replace(tzinfo=None),
            "monto": num(abono_real),
            "metodo": venta.metodo_pago,
            "tipo": "pago_inicial",
            "registrado_por": email_usuario,
            "saldo_despues": num(saldo_pendiente),
            **({"codigo_giftcard": codigo_giftcard_guardado} if codigo_giftcard_guardado else {})
        })

    identificador = str(random.randint(10000000, 99999999))

    venta_doc = {
        "identificador": identificador,
        "tipo_venta": "venta_directa",
        "fecha_pago": today(sede).replace(tzinfo=None),
        "local": sede.get("nombre"),
        "sede_id": venta.sede_id,
        "moneda": moneda,
        "tipo_comision": "sin_comision" if not aplica_comision else tipo_comision_sede,
        "cliente_id": cliente_id,
        "nombre_cliente": ((cliente.get("nombre", "") + " " + cliente.get("apellido", "")).strip() if cliente else ""),
        "cedula_cliente": cliente.get("cedula", "") if cliente else "",
        "email_cliente": cliente.get("correo", "") if cliente else "",
        "telefono_cliente": cliente.get("telefono", "") if cliente else "",
        "items": items,
        "historial_pagos": historial_pagos,
        "desglose_pagos": {venta.metodo_pago: num(abono_real), "total": num(total_venta)},
        # ⭐ Vendedor: puede ser el usuario autenticado, un nombre libre, o el estilista asignado
        "vendido_por": nombre_vendedor,
        "profesional_id": profesional_id_guardado,        # ⭐ null si no se asignó estilista
        "facturado_por": email_usuario,
        "notas": venta.notas,
        "estado_pago": estado_pago,
        "estado_factura": "pendiente",
        "saldo_pendiente": num(saldo_pendiente),
        "codigo_giftcard": codigo_giftcard_guardado,
        # ⭐ Resumen de comisiones (para referencia rápida)
        "comision_productos_total": num(total_comision_productos) if aplica_comision else 0,
        "comision_registrada": False,  # se actualiza a True si se crea/actualiza registro en commissions
    }

    result  = await collection_sales.insert_one(venta_doc)
    venta_id = str(result.inserted_id)

    # ─── Reservar en Giftcard — post-insert para tener venta_id ────
    if codigo_giftcard_guardado and abono_real > 0:
        try:
            gc_doc = await collection_giftcards.find_one({"codigo": codigo_giftcard_guardado})
            saldo_gc = round(float(gc_doc.get("saldo_disponible", 0)), 2)
            nuevo_disponible_gc = round(saldo_gc - abono_real, 2)
            nuevo_reservado_gc  = round(float(gc_doc.get("saldo_reservado", 0)) + abono_real, 2)

            await collection_giftcards.update_one(
                {"codigo": codigo_giftcard_guardado},
                {
                    "$set": {
                        "saldo_disponible": num(nuevo_disponible_gc),
                        "saldo_reservado": num(nuevo_reservado_gc),
                    },
                    "$push": {"historial": {
                        "tipo": "reserva", "venta_id": venta_id, "concepto": "venta_directa",
                        "monto": num(abono_real), "fecha": today(sede).replace(tzinfo=None), "registrado_por": email_usuario,
                        "saldo_disponible_antes": num(saldo_gc),
                        "saldo_disponible_despues": num(nuevo_disponible_gc),
                    }}
                }
            )
            print(f"🎁 Giftcard {codigo_giftcard_guardado}: reservados {fmt(abono_real, moneda)}")

        except Exception as e:
            await collection_sales.delete_one({"_id": result.inserted_id})
            raise HTTPException(
                status_code=500,
                detail=f"Error reservando giftcard, venta revertida: {str(e)}"
            )

    # ─── Registrar comisión del estilista si aplica ──────────────────
    comision_id_generado = None
    if aplica_comision and items_con_comision and total_comision_productos > 0:
        try:
            # El estilista puede ser el usuario autenticado (si es estilista)
            # o el estilista asignado por el admin
            if estilista_doc:
                doc_para_comision = estilista_doc
            elif auth_vendedor_doc:
                doc_para_comision = {
                    "profesional_id": str(auth_vendedor_doc["_id"]),
                    "nombre": auth_vendedor_doc.get("nombre", ""),
                    "apellido": "",
                }
            else:
                doc_para_comision = {
                    "profesional_id": email_usuario,
                    "nombre": nombre_usuario,
                    "apellido": "",
                }

            comision_id_generado = await registrar_comision_venta_directa(
                venta_id=venta_id,
                estilista=doc_para_comision,
                sede=sede,
                items_con_comision=items_con_comision,
                total_comision=total_comision_productos,
                moneda=moneda,
                tipo_comision_sede=tipo_comision_sede,
                registrado_por=email_usuario,
            )

            # Marcar la venta como comisionada
            await collection_sales.update_one(
                {"_id": result.inserted_id},
                {"$set": {
                    "comision_registrada": True,
                    "comision_id": comision_id_generado,
                }}
            )

        except Exception as e:
            # La comisión es secundaria — no revertir la venta, solo loguear
            print(f"⚠️ Error registrando comisión para venta {venta_id}: {e}")

    return {
        "success": True,
        "message": "Venta registrada exitosamente (pendiente de facturación)",
        "venta_id": venta_id,
        "data": {
            "venta_id": venta_id,
            "identificador": identificador,
            "cliente": ((cliente.get("nombre", "") + " " + cliente.get("apellido", "")).strip() if cliente else None),
            "productos": len(items),
            "total": num(total_venta),
            "abono": num(abono_real),
            "saldo_pendiente": num(saldo_pendiente),
            "estado_pago": estado_pago,
            "estado_factura": "pendiente",
            "metodo_pago": venta.metodo_pago,
            "moneda": moneda,
            "giftcard_reservada": bool(codigo_giftcard_guardado),
            "vendido_por": nombre_vendedor,
            "profesional_id": profesional_id_guardado,
            # ⭐ Información de comisión generada
            "comision": {
                "aplica": aplica_comision,
                "total": num(total_comision_productos),
                "comision_id": comision_id_generado,
            },
            "registrado_por": {"email": email_usuario, "rol": rol_usuario},
        }
    }


# ============================================================
# REGISTRAR PAGO ADICIONAL
# ============================================================
@router.post("/{venta_id}/pago", response_model=dict)
async def registrar_pago_venta(
    venta_id: str,
    data: PagoVentaRequest,
    current_user: dict = Depends(get_current_user)
):
    if current_user["rol"] not in ["admin_sede", "super_admin", "recepcionista"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    venta = await collection_sales.find_one({"_id": ObjectId(venta_id)})
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    sede = await collection_locales.find_one({"sede_id": venta.get("sede_id")})
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")

    moneda = venta.get("moneda", "COP")
    saldo_pendiente_actual = round(float(venta.get("saldo_pendiente", 0)), 2)

    if saldo_pendiente_actual <= 0:
        raise HTTPException(status_code=400, detail="Esta venta ya está completamente pagada")

    monto_solicitado = round(float(data.monto), 2)
    if monto_solicitado <= 0:
        raise HTTPException(status_code=400, detail="Monto inválido")

    if monto_solicitado > saldo_pendiente_actual:
        raise HTTPException(
            status_code=400,
            detail=f"El monto ({fmt(monto_solicitado, moneda)}) excede el saldo pendiente ({fmt(saldo_pendiente_actual, moneda)})"
        )

    # ─── Giftcard ───────────────────────────────────────────────────
    monto_real = monto_solicitado
    codigo_giftcard_usado = None

    if data.metodo_pago == "giftcard":
        if not data.codigo_giftcard:
            raise HTTPException(
                status_code=400,
                detail="Debe enviar codigo_giftcard cuando el método de pago es 'giftcard'"
            )

        from app.giftcards.routes_giftcards import _estado_giftcard

        codigo_gc = data.codigo_giftcard.upper().strip()
        gc_doc = await collection_giftcards.find_one({"codigo": codigo_gc})
        if not gc_doc:
            raise HTTPException(status_code=404, detail=f"Giftcard '{codigo_gc}' no encontrada")

        estado_gc = _estado_giftcard(gc_doc)
        if estado_gc in ["cancelada", "vencida", "usada"]:
            raise HTTPException(status_code=400, detail=f"Giftcard no válida: estado '{estado_gc}'")

        saldo_gc = round(float(gc_doc.get("saldo_disponible", 0)), 2)
        if saldo_gc <= 0:
            raise HTTPException(status_code=400, detail="La giftcard no tiene saldo disponible")

        monto_real = round(min(monto_solicitado, saldo_gc), 2)
        nuevo_disponible_gc = round(saldo_gc - monto_real, 2)
        nuevo_reservado_gc  = round(float(gc_doc.get("saldo_reservado", 0)) + monto_real, 2)

        await collection_giftcards.update_one(
            {"codigo": codigo_gc},
            {
                "$set": {
                    "saldo_disponible": num(nuevo_disponible_gc),
                    "saldo_reservado": num(nuevo_reservado_gc),
                },
                "$push": {"historial": {
                    "tipo": "reserva", "venta_id": venta_id, "concepto": "pago_adicional",
                    "monto": num(monto_real), "fecha": datetime.now(),
                    "registrado_por": current_user.get("email"),
                    "saldo_disponible_antes": num(saldo_gc),
                    "saldo_disponible_despues": num(nuevo_disponible_gc),
                }}
            }
        )

        if not venta.get("codigo_giftcard"):
            await collection_sales.update_one(
                {"_id": ObjectId(venta_id)},
                {"$set": {"codigo_giftcard": codigo_gc}}
            )

        codigo_giftcard_usado = codigo_gc
        print(f"🎁 Giftcard {codigo_gc}: reservados {fmt(monto_real, moneda)} en venta {venta_id}")

    nuevo_saldo = round(saldo_pendiente_actual - monto_real, 2)
    nuevo_estado = "pagado" if nuevo_saldo <= 0 else "abonado"

    historial_actual = venta.get("historial_pagos", [])
    historial_actual.append({
        "fecha": today(sede).replace(tzinfo=None),
        "monto": num(monto_real),
        "metodo": data.metodo_pago,
        "tipo": "pago_adicional",
        "registrado_por": current_user.get("email"),
        "saldo_despues": num(nuevo_saldo),
        "notas": data.notas,
        **({"codigo_giftcard": codigo_giftcard_usado} if codigo_giftcard_usado else {})
    })

    desglose_actual = venta.get("desglose_pagos", {})
    desglose_actual[data.metodo_pago] = num(
        round(desglose_actual.get(data.metodo_pago, 0) + monto_real, 2)
    )

    await collection_sales.update_one(
        {"_id": ObjectId(venta_id)},
        {"$set": {
            "saldo_pendiente": num(nuevo_saldo),
            "estado_pago": nuevo_estado,
            "historial_pagos": historial_actual,
            "desglose_pagos": desglose_actual,
            "ultima_actualizacion": today(sede).replace(tzinfo=None)
        }}
    )

    respuesta = {
        "success": True,
        "message": f"Pago de {fmt(monto_real, moneda)} registrado vía {data.metodo_pago}",
        "nuevo_saldo": num(nuevo_saldo),
        "estado_pago": nuevo_estado,
        "moneda": moneda,
        "giftcard_reservada": bool(codigo_giftcard_usado),
    }

    if codigo_giftcard_usado and monto_real < monto_solicitado:
        faltante = round(monto_solicitado - monto_real, 2)
        respuesta["giftcard_info"] = {
            "monto_cubierto": num(monto_real),
            "monto_pendiente": num(faltante),
            "aviso": f"La giftcard cubrió {fmt(monto_real, moneda)}. Quedan {fmt(faltante, moneda)} en saldo pendiente."
        }

    return respuesta


# ============================================================
# ELIMINAR PRODUCTO DE UNA VENTA DIRECTA
# ============================================================
@router.delete("/{venta_id}/productos/{producto_id}", response_model=dict)
async def eliminar_producto_de_venta(
    venta_id: str,
    producto_id: str,
    current_user: dict = Depends(get_current_user)
):
    if current_user["rol"] not in ["admin_sede", "super_admin", "recepcionista"]:
        raise HTTPException(status_code=403, detail="No tienes permisos para eliminar productos")

    venta = await collection_sales.find_one({"_id": ObjectId(venta_id)})
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    sede = await collection_locales.find_one({"sede_id": venta.get("sede_id")})
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")

    if venta.get("tipo_venta") != "venta_directa":
        raise HTTPException(status_code=400, detail="Solo se pueden eliminar productos de ventas directas")

    if venta.get("estado_factura") == "facturado":
        raise HTTPException(status_code=400, detail="No se pueden eliminar productos de una venta ya facturada")

    items_actuales = venta.get("items", [])
    if not items_actuales:
        raise HTTPException(status_code=400, detail="Esta venta no tiene productos")

    producto_encontrado = None
    items_filtrados = []
    for item in items_actuales:
        if item.get("producto_id") == producto_id:
            producto_encontrado = item
        else:
            items_filtrados.append(item)

    if not producto_encontrado:
        raise HTTPException(status_code=404, detail=f"Producto '{producto_id}' no encontrado en esta venta")

    nuevo_total   = round(sum(item.get("subtotal", 0) for item in items_filtrados), 2)
    abono_actual  = round(
        float(venta.get("desglose_pagos", {}).get("total", 0)) - float(venta.get("saldo_pendiente", 0)), 2
    )
    nuevo_saldo   = round(nuevo_total - abono_actual, 2)
    nuevo_estado_pago = "pagado" if nuevo_saldo <= 0 else ("abonado" if abono_actual > 0 else "pendiente")

    desglose_actual = venta.get("desglose_pagos", {})
    desglose_actual["total"] = num(nuevo_total)

    await collection_sales.update_one(
        {"_id": ObjectId(venta_id)},
        {"$set": {
            "items": items_filtrados,
            "desglose_pagos": desglose_actual,
            "saldo_pendiente": num(nuevo_saldo),
            "estado_pago": nuevo_estado_pago,
            "ultima_actualizacion": today(sede).replace(tzinfo=None)
        }}
    )

    return {
        "success": True,
        "message": "Producto eliminado correctamente",
        "producto_eliminado": producto_encontrado.get("nombre"),
        "cantidad": producto_encontrado.get("cantidad"),
        "productos_restantes": len(items_filtrados),
        "nuevo_total": num(nuevo_total),
        "nuevo_saldo": num(nuevo_saldo),
        "nuevo_estado_pago": nuevo_estado_pago,
        "moneda": venta.get("moneda")
    }


# ============================================================
# ELIMINAR TODOS LOS PRODUCTOS (CANCELAR VENTA)
# ============================================================
@router.delete("/{venta_id}/productos", response_model=dict)
async def eliminar_todos_productos_de_venta(
    venta_id: str,
    current_user: dict = Depends(get_current_user)
):
    if current_user["rol"] not in ["admin_sede", "super_admin", "recepcionista"]:
        raise HTTPException(status_code=403, detail="No tienes permisos para cancelar ventas")

    venta = await collection_sales.find_one({"_id": ObjectId(venta_id)})
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    sede = await collection_locales.find_one({"sede_id": venta.get("sede_id")})
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")

    if venta.get("tipo_venta") != "venta_directa":
        raise HTTPException(status_code=400, detail="Solo se pueden cancelar ventas directas")

    if venta.get("estado_factura") == "facturado":
        raise HTTPException(status_code=400, detail="No se puede cancelar una venta ya facturada")

    items_actuales = venta.get("items", [])
    if not items_actuales:
        raise HTTPException(status_code=400, detail="Esta venta no tiene productos")

    # ─── Giftcard — liberar reservas ────────────────────────────────
    codigo_giftcard = venta.get("codigo_giftcard")
    giftcard_liberada = False

    if codigo_giftcard:
        try:
            from app.giftcards.routes_giftcards import _estado_giftcard

            gc_doc = await collection_giftcards.find_one({"codigo": codigo_giftcard})
            if gc_doc:
                historial_gc = gc_doc.get("historial", [])
                ya_redimida = any(
                    m.get("venta_id") == venta_id and m.get("tipo") == "redencion"
                    for m in historial_gc
                )

                if not ya_redimida:
                    monto_liberar = round(sum(
                        float(m.get("monto", 0))
                        for m in historial_gc
                        if m.get("venta_id") == venta_id and m.get("tipo") == "reserva"
                    ), 2)

                    if monto_liberar > 0:
                        nuevo_disponible_gc = round(float(gc_doc.get("saldo_disponible", 0)) + monto_liberar, 2)
                        nuevo_reservado_gc  = max(
                            0.0, round(float(gc_doc.get("saldo_reservado", 0)) - monto_liberar, 2)
                        )

                        await collection_giftcards.update_one(
                            {"codigo": codigo_giftcard},
                            {
                                "$set": {
                                    "saldo_disponible": num(nuevo_disponible_gc),
                                    "saldo_reservado": num(nuevo_reservado_gc),
                                },
                                "$push": {"historial": {
                                    "tipo": "liberacion", "venta_id": venta_id,
                                    "monto": num(monto_liberar), "fecha": datetime.now(),
                                    "registrado_por": current_user.get("email"),
                                    "motivo": "venta_cancelada"
                                }}
                            }
                        )
                        giftcard_liberada = True
                        print(f"🎁 Giftcard {codigo_giftcard}: liberados {num(monto_liberar)} por cancelación")

        except Exception as e:
            print(f"⚠️ Error liberando giftcard al cancelar venta: {e}")

    # ─── Revertir comisión del estilista si aplica ──────────────────
    #
    #   Si la venta tenía comisión registrada, se eliminan los items
    #   de tipo "venta_directa" con este venta_id del productos_detalle
    #   y se recalcula el total de la comisión.
    #
    comision_revertida = False
    if venta.get("comision_registrada") and venta.get("comision_id"):
        try:
            comision_id = venta["comision_id"]
            comision_doc = await collection_commissions.find_one({"_id": ObjectId(comision_id)})

            if comision_doc and comision_doc.get("estado") == "pendiente":
                detalle_actual = comision_doc.get("productos_detalle", [])

                # Filtrar los items de esta venta
                detalle_sin_venta = [
                    d for d in detalle_actual
                    if not (d.get("tipo") == "venta_directa" and d.get("venta_id") == venta_id)
                ]
                items_revertidos = [
                    d for d in detalle_actual
                    if d.get("tipo") == "venta_directa" and d.get("venta_id") == venta_id
                ]
                monto_revertido = round(
                    sum(float(d.get("valor_comision_productos", 0)) for d in items_revertidos), 2
                )

                nuevo_total_comision = round(
                    float(comision_doc.get("total_comisiones", 0)) - monto_revertido, 2
                )
                nuevo_total_servicios = round(
                    float(comision_doc.get("total_servicios", 0)) - sum(
                        float(d.get("valor_productos", 0)) for d in items_revertidos
                    ), 2
                )

                await collection_commissions.update_one(
                    {"_id": ObjectId(comision_id)},
                    {"$set": {
                        "productos_detalle": detalle_sin_venta,
                        "total_comisiones": num(max(0, nuevo_total_comision)),
                        "total_productos": num(max(0, nuevo_total_servicios)),
                        "ultima_actualizacion": datetime.now(),
                    }}
                )
                comision_revertida = True
                print(f"💰 Comisión revertida para venta {venta_id}: -{fmt(monto_revertido, venta.get('moneda', ''))}")

        except Exception as e:
            print(f"⚠️ Error revirtiendo comisión al cancelar venta: {e}")

    await collection_sales.update_one(
        {"_id": ObjectId(venta_id)},
        {"$set": {
            "items": [],
            "desglose_pagos": {"total": 0},
            "saldo_pendiente": 0,
            "estado_pago": "cancelado",
            "estado_factura": "cancelado",
            "cancelado_por": current_user.get("email"),
            "fecha_cancelacion": today(sede).replace(tzinfo=None),
            "ultima_actualizacion": today(sede).replace(tzinfo=None)
        }}
    )

    return {
        "success": True,
        "message": f"Venta cancelada. Se eliminaron {len(items_actuales)} productos",
        "productos_eliminados": len(items_actuales),
        "estado": "cancelado",
        "giftcard_liberada": giftcard_liberada,
        "comision_revertida": comision_revertida,  # ⭐
    }
