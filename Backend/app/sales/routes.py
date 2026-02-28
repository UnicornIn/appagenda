from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from bson import ObjectId

from app.auth.routes import get_current_user
from app.database.mongo import (
    collection_products,
    collection_clients,
    collection_locales,
    collection_sales,
    collection_inventarios
)

router = APIRouter(prefix="/sales", tags=["Ventas Directas"])


# ============================================================
# 📦 MODELOS
# ============================================================
class ProductoVenta(BaseModel):
    producto_id: str
    cantidad: int


class VentaDirecta(BaseModel):
    cliente_id: str
    sede_id: str
    productos: List[ProductoVenta]
    metodo_pago: str  # efectivo, tarjeta, transferencia, etc.
    abono: Optional[float] = 0  # Por si paga parcial
    notas: Optional[str] = None


# ============================================================
# 🛒 CREAR VENTA DIRECTA (sin cita)
# ============================================================
@router.post("/", response_model=dict)
async def crear_venta_directa(
    venta: VentaDirecta,
    current_user: dict = Depends(get_current_user)
):
    """
    Crea una venta directa de productos sin necesidad de cita.
    ⭐ NO genera comisión (las ventas directas no comisionan).
    ⭐ Solo VALIDA stock disponible (NO lo descuenta, eso lo hace la facturación).
    ⭐ NO registra movimientos de inventario (lo hace la facturación).
    ⭐ NO genera numero_comprobante (se genera al facturar).
    """
    # Validar permisos
    if current_user["rol"] not in ["admin_sede", "super_admin", "estilista"]:
        raise HTTPException(
            status_code=403,
            detail="No tienes permisos para registrar ventas"
        )

    rol_usuario = current_user["rol"]
    email_usuario = current_user.get("email")

    # === Validar cliente ===
    cliente = await collection_clients.find_one({"cliente_id": venta.cliente_id})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # === Validar sede ===
    sede = await collection_locales.find_one({"sede_id": venta.sede_id})
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")

    moneda_sede = sede.get("moneda", "COP")

    # === Procesar productos ===
    items = []
    total_venta = 0

    for item in venta.productos:
        # Buscar producto
        producto_db = await collection_products.find_one({"id": item.producto_id})
        
        if not producto_db:
            raise HTTPException(
                status_code=404,
                detail=f"Producto con ID '{item.producto_id}' no encontrado"
            )
        
        # ⭐ Solo VALIDAR stock disponible (no descontar)
        inventario = await collection_inventarios.find_one({
            "producto_id": item.producto_id,
            "sede_id": venta.sede_id
        })
        
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
        
        # Obtener precio en la moneda correcta
        precios_producto = producto_db.get("precios", {})
        
        if moneda_sede not in precios_producto:
            raise HTTPException(
                status_code=400,
                detail=f"El producto '{producto_db.get('nombre')}' no tiene precio en {moneda_sede}"
            )
        
        precio_unitario = round(precios_producto[moneda_sede], 2)
        subtotal = round(item.cantidad * precio_unitario, 2)
        
        # ⭐ NO generar comisión en ventas directas
        producto_item = {
            "tipo": "producto",
            "producto_id": item.producto_id,
            "nombre": producto_db.get("nombre"),
            "cantidad": item.cantidad,
            "precio_unitario": precio_unitario,
            "subtotal": subtotal,
            "moneda": moneda_sede,
            "comision": 0  # ⭐ Siempre 0 en ventas directas
        }
        
        items.append(producto_item)
        total_venta += subtotal

    # Redondear totales
    total_venta = round(total_venta, 2)
    abono = round(venta.abono or 0, 2)
    saldo_pendiente = round(total_venta - abono, 2)

    # Determinar estado de pago
    if saldo_pendiente <= 0:
        estado_pago = "pagado"
    elif abono > 0:
        estado_pago = "abonado"
    else:
        estado_pago = "pendiente"

    # === Crear historial de pagos ===
    historial_pagos = []
    if abono > 0:
        historial_pagos.append({
            "fecha": datetime.now(),
            "monto": float(abono),
            "metodo": venta.metodo_pago,
            "tipo": "pago_inicial",
            "registrado_por": email_usuario,
            "saldo_despues": float(saldo_pendiente)
        })

    # === Desglose de pagos ===
    desglose_pagos = {
        venta.metodo_pago: round(abono, 2),
        "total": round(total_venta, 2)
    }

    # === Generar identificador único ===
    import random
    identificador = str(random.randint(10000000, 99999999))

    # === Crear documento de venta ===
    venta_doc = {
        "identificador": identificador,
        "tipo_venta": "venta_directa",
        "fecha_pago": datetime.now(),
        "local": sede.get("nombre"),
        "sede_id": venta.sede_id,
        "moneda": moneda_sede,
        "tipo_comision": "sin_comision",  # ⭐ Ventas directas no comisionan
        "cliente_id": venta.cliente_id,
        "nombre_cliente": cliente.get("nombre", "") + " " + cliente.get("apellido", ""),
        "cedula_cliente": cliente.get("cedula", ""),
        "email_cliente": cliente.get("correo", ""),
        "telefono_cliente": cliente.get("telefono", ""),
        "items": items,
        "historial_pagos": historial_pagos,
        "desglose_pagos": desglose_pagos,
        "vendido_por": email_usuario,
        "facturado_por": None,  # Se llena al facturar
        "notas": venta.notas,
        "estado_pago": estado_pago,
        "estado_factura": "pendiente",
        "saldo_pendiente": saldo_pendiente
    }

    # ⭐ Guardar en BD (solo la venta, SIN tocar inventario)
    result = await collection_sales.insert_one(venta_doc)
    venta_id = str(result.inserted_id)

    return {
        "success": True,
        "message": "Venta registrada exitosamente (pendiente de facturación)",
        "venta_id": venta_id,
        "data": {
            "venta_id": venta_id,
            "identificador": identificador,
            "cliente": cliente.get("nombre"),
            "productos": len(items),
            "total": total_venta,
            "abono": abono,
            "saldo_pendiente": saldo_pendiente,
            "estado_pago": estado_pago,
            "estado_factura": "pendiente",
            "metodo_pago": venta.metodo_pago,
            "moneda": moneda_sede,
            "vendido_por": {
                "email": email_usuario,
                "rol": rol_usuario
            }
        }
    }


# ============================================================
# 💰 REGISTRAR PAGO ADICIONAL
# ============================================================
@router.post("/{venta_id}/pago", response_model=dict)
async def registrar_pago_venta(
    venta_id: str,
    monto: float,
    metodo_pago: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Registra un pago adicional para una venta con saldo pendiente.
    """
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    # Buscar venta
    venta = await collection_sales.find_one({"_id": ObjectId(venta_id)})
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    saldo_actual = venta.get("saldo_pendiente", 0)
    
    if saldo_actual <= 0:
        raise HTTPException(
            status_code=400,
            detail="Esta venta ya está completamente pagada"
        )
    
    if monto > saldo_actual:
        raise HTTPException(
            status_code=400,
            detail=f"El monto excede el saldo pendiente ({saldo_actual})"
        )

    # Calcular nuevo saldo
    nuevo_saldo = round(saldo_actual - monto, 2)
    
    # Determinar nuevo estado
    if nuevo_saldo <= 0:
        nuevo_estado = "pagado"
    else:
        nuevo_estado = "abonado"

    # Agregar al historial
    nuevo_pago = {
        "fecha": datetime.now(),
        "monto": float(monto),
        "metodo": metodo_pago,
        "tipo": "pago_adicional",
        "registrado_por": current_user.get("email"),
        "saldo_despues": float(nuevo_saldo)
    }
    
    historial_actual = venta.get("historial_pagos", [])
    historial_actual.append(nuevo_pago)

    # Actualizar desglose_pagos
    desglose_actual = venta.get("desglose_pagos", {})
    desglose_actual[metodo_pago] = round(desglose_actual.get(metodo_pago, 0) + monto, 2)

    # Actualizar venta
    await collection_sales.update_one(
        {"_id": ObjectId(venta_id)},
        {
            "$set": {
                "saldo_pendiente": nuevo_saldo,
                "estado_pago": nuevo_estado,
                "historial_pagos": historial_actual,
                "desglose_pagos": desglose_actual,
                "ultima_actualizacion": datetime.now()
            }
        }
    )

    return {
        "success": True,
        "message": "Pago registrado correctamente",
        "nuevo_saldo": nuevo_saldo,
        "estado_pago": nuevo_estado
    }


# ============================================================
# 🗑️ ELIMINAR PRODUCTO DE UNA VENTA DIRECTA
# ============================================================
@router.delete("/{venta_id}/productos/{producto_id}", response_model=dict)
async def eliminar_producto_de_venta(
    venta_id: str,
    producto_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Elimina un producto específico de una venta directa y recalcula totales.
    ⭐ NO toca el inventario (como nunca se descontó, no hay nada que devolver).
    ⭐ Solo actualiza los datos de la venta.
    """
    # Validar permisos
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(
            status_code=403,
            detail="No tienes permisos para eliminar productos"
        )

    # Buscar venta
    venta = await collection_sales.find_one({"_id": ObjectId(venta_id)})
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    # Verificar que sea venta directa
    if venta.get("tipo_venta") != "venta_directa":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden eliminar productos de ventas directas"
        )

    # Verificar que la venta no esté facturada
    if venta.get("estado_factura") == "facturado":
        raise HTTPException(
            status_code=400,
            detail="No se pueden eliminar productos de una venta ya facturada"
        )

    # Verificar que la venta tenga productos
    items_actuales = venta.get("items", [])
    if not items_actuales:
        raise HTTPException(
            status_code=400,
            detail="Esta venta no tiene productos"
        )

    # Buscar y filtrar el producto a eliminar
    producto_encontrado = None
    items_filtrados = []
    
    for item in items_actuales:
        if item.get("producto_id") == producto_id:
            producto_encontrado = item
        else:
            items_filtrados.append(item)

    # Validar que el producto existe en la venta
    if not producto_encontrado:
        raise HTTPException(
            status_code=404,
            detail=f"Producto con ID '{producto_id}' no encontrado en esta venta"
        )

    # Calcular nuevos totales
    nuevo_total = round(sum(item.get("subtotal", 0) for item in items_filtrados), 2)
    abono_actual = round(venta.get("desglose_pagos", {}).get("total", 0) - venta.get("saldo_pendiente", 0), 2)
    nuevo_saldo = round(nuevo_total - abono_actual, 2)

    # Recalcular estado de pago
    if nuevo_saldo <= 0:
        nuevo_estado_pago = "pagado"
    elif abono_actual > 0:
        nuevo_estado_pago = "abonado"
    else:
        nuevo_estado_pago = "pendiente"

    # Actualizar desglose_pagos
    desglose_actual = venta.get("desglose_pagos", {})
    desglose_actual["total"] = nuevo_total

    # Actualizar venta
    await collection_sales.update_one(
        {"_id": ObjectId(venta_id)},
        {
            "$set": {
                "items": items_filtrados,
                "desglose_pagos": desglose_actual,
                "saldo_pendiente": nuevo_saldo,
                "estado_pago": nuevo_estado_pago,
                "ultima_actualizacion": datetime.now()
            }
        }
    )

    return {
        "success": True,
        "message": "Producto eliminado correctamente",
        "producto_eliminado": producto_encontrado.get("nombre"),
        "cantidad": producto_encontrado.get("cantidad"),
        "productos_restantes": len(items_filtrados),
        "nuevo_total": nuevo_total,
        "nuevo_saldo": nuevo_saldo,
        "nuevo_estado_pago": nuevo_estado_pago,
        "moneda": venta.get("moneda")
    }


# ============================================================
# 🗑️ ELIMINAR TODOS LOS PRODUCTOS DE UNA VENTA DIRECTA
# ============================================================
@router.delete("/{venta_id}/productos", response_model=dict)
async def eliminar_todos_productos_de_venta(
    venta_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Elimina TODOS los productos de una venta directa.
    ⭐ NO toca el inventario (como nunca se descontó, no hay nada que devolver).
    ⭐ Cancela la venta completamente.
    """
    # Validar permisos
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(
            status_code=403,
            detail="No tienes permisos para eliminar productos"
        )

    # Buscar venta
    venta = await collection_sales.find_one({"_id": ObjectId(venta_id)})
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    # Verificar que sea venta directa
    if venta.get("tipo_venta") != "venta_directa":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden eliminar productos de ventas directas"
        )

    # Verificar que la venta no esté facturada
    if venta.get("estado_factura") == "facturado":
        raise HTTPException(
            status_code=400,
            detail="No se pueden eliminar productos de una venta ya facturada"
        )

    # Verificar que la venta tenga productos
    items_actuales = venta.get("items", [])
    if not items_actuales:
        raise HTTPException(
            status_code=400,
            detail="Esta venta no tiene productos"
        )

    # ⭐ Cancelar la venta completamente (SIN tocar inventario)
    await collection_sales.update_one(
        {"_id": ObjectId(venta_id)},
        {
            "$set": {
                "items": [],
                "desglose_pagos": {"total": 0},
                "saldo_pendiente": 0,
                "estado_pago": "cancelado",
                "estado_factura": "cancelado",
                "cancelado_por": current_user.get("email"),
                "fecha_cancelacion": datetime.now(),
                "ultima_actualizacion": datetime.now()
            }
        }
    )

    return {
        "success": True,
        "message": f"Venta cancelada. Se eliminaron {len(items_actuales)} productos",
        "productos_eliminados": len(items_actuales),
        "estado": "cancelado"
    }