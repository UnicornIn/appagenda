from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime
from typing import Optional, List
from bson import ObjectId
import random
import asyncio
from datetime import timedelta

from app.database.mongo import (
    collection_citas,
    collection_servicios,
    collection_commissions,
    collection_clients,
    collection_locales,
    collection_invoices,
    collection_sales,
    collection_inventarios,           # 🆕
    collection_inventory_motions,
    collection_productos            # 🆕
)
from app.auth.routes import get_current_user

router = APIRouter()

def generar_numero_comprobante() -> str:
    """
    Genera un número de comprobante único de 8 dígitos
    """
    return str(random.randint(10000000, 99999999))

def generar_identificador() -> str:
    """
    Genera un identificador único de 8 dígitos
    """
    return str(random.randint(10000000, 99999999))


# ============================================================
# 🧾 Facturar cita O venta directa - VERSIÓN CORREGIDA
# ============================================================
@router.post("/quotes/facturar/{id}")
async def facturar_cita_o_venta(
    id: str,
    tipo: str = Query("cita", regex="^(cita|venta)$"),
    current_user: dict = Depends(get_current_user)
):
    """
    Factura una cita o venta directa.
    ✅ Maneja múltiples servicios (servicios_detalle)
    ✅ Maneja precios personalizados
    ✅ Estructura correcta de items
    """
    print(f"🔍 Facturar invocada por {current_user.get('email')} (rol={current_user.get('rol')})")
    print(f"📋 ID: {id}, Tipo: {tipo}")

    # Solo admin sede / superadmin
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado para facturar")

    # ====================================
    # 1️⃣ BUSCAR Y VALIDAR DOCUMENTO
    # ====================================
    if tipo == "cita":
        documento = await collection_citas.find_one({"_id": ObjectId(id)})
        if not documento:
            raise HTTPException(status_code=404, detail="Cita no encontrada")

        if documento.get("estado_factura") == "facturado":
            raise HTTPException(status_code=400, detail="La cita ya está facturada")

        print("✅ Cita lista para facturar")
        
    else:  # tipo == "venta"
        documento = await collection_sales.find_one({"_id": ObjectId(id)})
        if not documento:
            raise HTTPException(status_code=404, detail="Venta no encontrada")

        if documento.get("estado_factura") == "facturado":
            raise HTTPException(status_code=400, detail="Esta venta ya fue facturada")

        print("✅ Venta lista para facturar")

    # ====================================
    # 2️⃣ OBTENER DATOS BÁSICOS
    # ====================================
    cliente_id = documento["cliente_id"]
    sede_id = documento["sede_id"]
    profesional_id = documento.get("profesional_id")
    profesional_nombre = documento.get("profesional_nombre", "")

    # Obtener sede
    sede = await collection_locales.find_one({"sede_id": sede_id})
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")

    moneda_sede = sede.get("moneda", "COP")
    reglas_comision = sede.get("reglas_comision", {"tipo": "servicios"})
    tipo_comision = reglas_comision.get("tipo", "servicios")
    
    print(f"💰 Moneda: {moneda_sede}, Tipo comisión: {tipo_comision}")

    # Obtener cliente
    cliente = await collection_clients.find_one({"cliente_id": cliente_id})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # ====================================
    # 3️⃣ PREPARAR ITEMS - SERVICIOS
    # ====================================
    items = []
    total_comision_servicios = 0

    if tipo == "cita":
        # ⭐ NUEVA ESTRUCTURA: Leer directamente de servicios[]
        servicios_cita = documento.get("servicios", [])
    
    if servicios_cita:
        # ====================================
        # NUEVA ESTRUCTURA (precio ya calculado en la cita)
        # ====================================
        print(f"📋 Procesando {len(servicios_cita)} servicios (nueva estructura)")
        
        for servicio_item in servicios_cita:
            servicio_id = servicio_item.get("servicio_id")
            nombre = servicio_item.get("nombre", "Servicio")
            precio = servicio_item.get("precio", 0)  # ⭐ Ya está calculado
            
            # Calcular comisión
            comision_servicio = 0
            if tipo_comision in ["servicios", "mixto"] and profesional_id:
                # Buscar servicio en BD para obtener % de comisión
                servicio_db = await collection_servicios.find_one({"servicio_id": servicio_id})
                if servicio_db:
                    comision_porcentaje = servicio_db.get("comision_estilista", 0)
                    comision_servicio = round((precio * comision_porcentaje) / 100, 2)
                    total_comision_servicios += comision_servicio
            
            items.append({
                "tipo": "servicio",
                "servicio_id": servicio_id,
                "nombre": nombre,  # ⭐ Ya está en la cita
                "cantidad": 1,
                "precio_unitario": precio,  # ⭐ Ya está calculado
                "subtotal": precio,
                "moneda": moneda_sede,
                "comision": comision_servicio
            })
            
            print(f"  ✅ {nombre}: ${precio} (comisión: ${comision_servicio})")
    
    elif documento.get("servicio_id"):
        # Estructura muy antigua (un solo servicio)
        print(f"📋 Procesando servicio único (estructura muy antigua)")
        servicio_id = documento["servicio_id"]
        servicio_nombre = documento.get("servicio_nombre", "")
        
        servicio = await collection_servicios.find_one({"servicio_id": servicio_id})
        if not servicio:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        
        precio_personalizado = documento.get("precio_fue_personalizado", False)
        precio_custom = documento.get("precio_personalizado", 0)
        
        if precio_personalizado and precio_custom > 0:
            precio_servicio = precio_custom
        else:
            precios_servicio = servicio.get("precios", {})
            if moneda_sede not in precios_servicio:
                raise HTTPException(
                    status_code=400,
                    detail=f"El servicio no tiene precio en {moneda_sede}"
                )
            precio_servicio = precios_servicio[moneda_sede]
        
        # Calcular comisión
        comision_servicio = 0
        if tipo_comision in ["servicios", "mixto"] and profesional_id:
            comision_porcentaje = servicio.get("comision_estilista", 0)
            comision_servicio = round((precio_servicio * comision_porcentaje) / 100, 2)
            total_comision_servicios = comision_servicio
        
        items.append({
            "tipo": "servicio",
            "servicio_id": servicio_id,
            "nombre": servicio_nombre,
            "cantidad": 1,
            "precio_unitario": precio_servicio,
            "subtotal": precio_servicio,
            "moneda": moneda_sede,
            "comision": comision_servicio
        })

    # ====================================
    # 4️⃣ PREPARAR ITEMS - PRODUCTOS
    # ====================================
    total_comision_productos = 0
    
    if tipo == "cita":
        productos_lista = documento.get("productos", [])
    else:  # venta directa
        # Extraer productos de items
        productos_lista = []
        items_venta = documento.get("items", [])
        for item in items_venta:
            if item.get("tipo") == "producto":
                productos_lista.append({
                    "producto_id": item["producto_id"],
                    "nombre": item["nombre"],
                    "cantidad": item["cantidad"],
                    "precio_unitario": item["precio_unitario"],
                    "subtotal": item["subtotal"]
                })
    
    # Procesar productos
    for producto in productos_lista:
        producto_id = producto.get("producto_id")
        precio_producto = producto.get("precio_unitario", 0)
        cantidad = producto.get("cantidad", 1)
        subtotal_producto = producto.get("subtotal", precio_producto * cantidad)
        
        # Calcular comisión
        comision_producto = 0
        if tipo_comision in ["productos", "mixto"] and profesional_id:
            # Obtener % de comisión del producto
            producto_db = await collection_productos.find_one({"id": producto_id})
            if producto_db:
                porcentaje_producto = producto_db.get("comision", 0)
                comision_producto = round((subtotal_producto * porcentaje_producto) / 100, 2)
                total_comision_productos += comision_producto
        
        items.append({
            "tipo": "producto",
            "producto_id": producto_id,
            "nombre": producto.get("nombre"),
            "cantidad": cantidad,
            "precio_unitario": precio_producto,
            "subtotal": subtotal_producto,
            "moneda": moneda_sede,
            "comision": comision_producto
        })
        
        print(f"  🛍️ {producto.get('nombre')}: ${subtotal_producto} (comisión: ${comision_producto})")

    # ====================================
    # 5️⃣ CALCULAR TOTALES
    # ====================================
    total_final = round(sum(item["subtotal"] for item in items), 2)
    valor_comision_total = round(total_comision_servicios + total_comision_productos, 2)
    
    print(f"💰 Total: ${total_final} {moneda_sede}")
    print(f"💵 Comisión total: ${valor_comision_total} {moneda_sede}")

    # ====================================
    # 6️⃣ GENERAR NÚMEROS ÚNICOS
    # ====================================
    numero_comprobante = generar_numero_comprobante()
    identificador = generar_identificador()
    fecha_actual = datetime.now()

    # ====================================
    # 7️⃣ PREPARAR HISTORIAL Y DESGLOSE DE PAGOS
    # ====================================
    # 1️⃣ Tomar el historial REAL (fuente de verdad)
    historial_pagos = documento.get("historial_pagos", [])

    if not historial_pagos:
        raise ValueError("No se puede facturar sin historial de pagos")
    
    # 2️⃣ Construir desglose a partir del historial
    desglose_pagos = {}
    total_pagado = 0.0

    
    for pago in historial_pagos:
        metodo = pago.get("metodo")
        monto = float(pago.get("monto", 0))

        if not metodo or monto <= 0:
            continue

        desglose_pagos[metodo] = round(
        desglose_pagos.get(metodo, 0) + monto, 2
        )
        total_pagado += monto

    desglose_pagos["total"] = round(total_pagado, 2)

    if round(total_pagado, 2) != round(total_final, 2):
        raise ValueError(
            f"Inconsistencia de pagos: pagado={total_pagado}, total_factura={total_final}"
    )

    # ====================================
    # 8️⃣ CREAR/ACTUALIZAR VENTA EN SALES
    # ====================================
    if tipo == "cita":
        # Crear nuevo documento en sales
        venta = {
            "identificador": identificador,
            "tipo_origen": "cita",
            "origen_id": id,
            "fecha_pago": fecha_actual,
            "local": sede.get("nombre"),
            "sede_id": sede_id,
            "moneda": moneda_sede,
            "tipo_comision": tipo_comision,
            "cliente_id": cliente_id,
            "nombre_cliente": cliente.get("nombre", "") + " " + cliente.get("apellido", ""),
            "cedula_cliente": cliente.get("cedula", ""),
            "email_cliente": cliente.get("correo", ""),
            "telefono_cliente": cliente.get("telefono", ""),
            "items": items,
            "historial_pagos": historial_pagos,
            "desglose_pagos": desglose_pagos,
            "profesional_id": profesional_id,
            "profesional_nombre": profesional_nombre,
            "numero_comprobante": numero_comprobante,
            "facturado_por": current_user.get("email")
        }
        
        result_sale = await collection_sales.insert_one(venta)
        venta_id = str(result_sale.inserted_id)
        print(f"✅ Venta creada en sales: {venta_id}")
        
    else:  # venta directa
        # Actualizar documento existente
        await collection_sales.update_one(
            {"_id": ObjectId(id)},
            {
                "$set": {
                    "numero_comprobante": numero_comprobante,
                    "identificador": identificador,
                    "facturado_por": current_user.get("email"),
                    "fecha_facturacion": fecha_actual,
                    "items": items,
                    "estado_factura": "facturado"
                }
            }
        )
        venta_id = id
        print(f"✅ Venta actualizada en sales: {venta_id}")

    # ====================================
    # 9️⃣ ACTUALIZAR DOCUMENTO ORIGINAL
    # ====================================
    if tipo == "cita":
        await collection_citas.update_one(
            {"_id": ObjectId(id)},
            {
                "$set": {
                    "estado": "completada",
                    "estado_pago": "pagado",
                    "saldo_pendiente": 0,
                    "abono": total_final,
                    "fecha_facturacion": fecha_actual,
                    "numero_comprobante": numero_comprobante,
                    "facturado_por": current_user.get("email"),
                    "estado_factura": "facturado"
                }
            }
        )
        print("✅ Cita actualizada")

    # ====================================
    # 🔟 CREAR FACTURA EN INVOICES
    # ====================================
    factura = {
        "identificador": identificador,
        "tipo_origen": tipo,
        "origen_id": id,
        "fecha_pago": fecha_actual,
        "local": sede.get("nombre"),
        "sede_id": sede_id,
        "moneda": moneda_sede,
        "tipo_comision": tipo_comision,
        "cliente_id": cliente_id,
        "nombre_cliente": cliente.get("nombre", "") + " " + cliente.get("apellido", ""),
        "cedula_cliente": cliente.get("cedula", ""),
        "email_cliente": cliente.get("correo", ""),
        "telefono_cliente": cliente.get("telefono", ""),
        "total": total_final,
        "comprobante_de_pago": "Factura",
        "numero_comprobante": numero_comprobante,
        "fecha_comprobante": fecha_actual,
        "monto": total_final,
        "profesional_id": profesional_id,
        "profesional_nombre": profesional_nombre,
        "historial_pagos": historial_pagos,
        "desglose_pagos": desglose_pagos,
        "facturado_por": current_user.get("email"),
        "estado": "pagado"
    }

    await collection_invoices.insert_one(factura)
    print("✅ Factura creada")

    # ====================================
    # 1️⃣1️⃣ REGISTRAR MOVIMIENTOS DE INVENTARIO
    # ====================================
    movimientos_inventario = []

    for item in items:
        if item["tipo"] == "producto":
            producto_id = item["producto_id"]
            cantidad = item["cantidad"]
        
            inventario = await collection_inventarios.find_one({
                "producto_id": producto_id,
                "sede_id": sede_id
            })
        
            if not inventario:
                print(f"⚠️ No existe inventario para {item['nombre']}")
                continue
        
            stock_anterior = inventario["stock_actual"]
            nuevo_stock = stock_anterior - cantidad
        
            await collection_inventarios.update_one(
                {"_id": inventario["_id"]},
                {
                    "$set": {
                        "stock_actual": nuevo_stock,
                        "fecha_ultima_actualizacion": fecha_actual
                    }
                }
            )
        
            movimientos_inventario.append({
                "producto_id": producto_id,
                "nombre_producto": item["nombre"],
                "cantidad": -cantidad,
                "tipo_movimiento": f"venta_{tipo}",
                "stock_anterior": stock_anterior,
                "stock_nuevo": nuevo_stock,
                "referencia_id": venta_id,
                "referencia_tipo": tipo,
                "numero_comprobante": numero_comprobante,
                "cliente_id": cliente_id,
                "profesional_id": profesional_id,
                "usuario": current_user.get("email")
            })
        
            print(f"📉 Inventario: {item['nombre']} ({stock_anterior} → {nuevo_stock})")

    if movimientos_inventario:
        motion_doc = {
            "sede_id": sede_id,
            "fecha": fecha_actual,
            "movimientos": movimientos_inventario,
            "creado_por": current_user.get("email")
        }
        
        await collection_inventory_motions.insert_one(motion_doc)
        print(f"✅ Movimientos registrados: {len(movimientos_inventario)} productos")

    # ====================================
    # 1️⃣2️⃣ ACUMULAR COMISIONES DEL ESTILISTA (SI APLICA)
    # ====================================
    comision_msg = "No aplica comisión para esta sede"

    if valor_comision_total > 0 and profesional_id:
        print(f"👤 Profesional ID: {profesional_id}")

        # 🔍 Buscar documento de comisión PENDIENTE
        comision_document = await collection_commissions.find_one({
            "profesional_id": profesional_id,
            "sede_id": sede_id,
            "estado": "pendiente"
        })
        print(f"📂 Documento de comisión encontrado: {comision_document is not None}")

        # Preparar detalle de comisión CON MÚLTIPLES SERVICIOS
        servicios_comision = []
        for item in items:
            if item["tipo"] == "servicio" and item.get("comision", 0) > 0:
                servicios_comision.append({
                    "servicio_id": item["servicio_id"],
                    "servicio_nombre": item["nombre"],
                    "valor_servicio": item["precio_unitario"],
                    "valor_comision": round(item["comision"], 2),
                    "fecha": fecha_actual.strftime("%Y-%m-%d"),
                    "numero_comprobante": numero_comprobante,
                    "origen_tipo": tipo,
                    "origen_id": id
                })
        
        # Agregar productos con comisión
        productos_comision = []
        for item in items:
            if item["tipo"] == "producto" and item.get("comision", 0) > 0:
                productos_comision.append({
                    "producto_id": item["producto_id"],
                    "producto_nombre": item["nombre"],
                    "cantidad": item["cantidad"],
                    "valor_producto": item["subtotal"],
                    "valor_comision": round(item["comision"], 2),
                    "fecha": fecha_actual.strftime("%Y-%m-%d"),
                    "numero_comprobante": numero_comprobante,
                    "origen_tipo": tipo,
                    "origen_id": id
                })

        # ⭐ INICIALIZAR VARIABLES
        crear_nuevo_documento = False
        fecha_actual_str = fecha_actual.strftime("%Y-%m-%d")

        # ⭐ VALIDAR SI SE DEBE CREAR NUEVO DOCUMENTO (15 DÍAS)
        if comision_document:
            servicios_existentes = comision_document.get("servicios_detalle", [])
            
            # ⭐ MIGRAR DOCUMENTOS ANTIGUOS SIN periodo_inicio
            if servicios_existentes and "periodo_inicio" not in comision_document:
                print("⚠️ Documento sin periodo_inicio detectado. Migrando...")
                fechas_migracion = []
                for s in servicios_existentes:
                    try:
                        fecha = datetime.strptime(s["fecha"], "%Y-%m-%d")
                        fechas_migracion.append(fecha)
                    except:
                        continue
                
                if fechas_migracion:
                    fecha_inicio_migracion = min(fechas_migracion).strftime("%Y-%m-%d")
                    fecha_fin_migracion = max(fechas_migracion).strftime("%Y-%m-%d")
                    
                    await collection_commissions.update_one(
                        {"_id": comision_document["_id"]},
                        {"$set": {
                            "periodo_inicio": fecha_inicio_migracion,
                            "periodo_fin": fecha_fin_migracion
                        }}
                    )
                    
                    comision_document["periodo_inicio"] = fecha_inicio_migracion
                    comision_document["periodo_fin"] = fecha_fin_migracion
            
            # ⭐ VALIDAR RANGO DE 15 DÍAS
            if servicios_existentes:
                fechas = []
                for s in servicios_existentes:
                    try:
                        fecha = datetime.strptime(s["fecha"], "%Y-%m-%d")
                        fechas.append(fecha)
                    except:
                        continue
                
                if fechas:
                    fecha_mas_antigua = min(fechas)
                    fecha_mas_reciente = max(fechas)
                    
                    fecha_inicio_rango = min(fecha_mas_antigua, fecha_actual)
                    fecha_fin_rango = max(fecha_mas_reciente, fecha_actual)
                    dias_totales = (fecha_fin_rango - fecha_inicio_rango).days + 1
                    
                    print(f"📅 Rango actual: {dias_totales} días")
                    
                    if dias_totales > 15:
                        print(f"⚠️ El rango superaría los 15 días. Cerrando documento actual.")
                        crear_nuevo_documento = True
                        
                        await collection_commissions.update_one(
                            {"_id": comision_document["_id"]},
                            {"$set": {
                                "periodo_inicio": fecha_mas_antigua.strftime("%Y-%m-%d"),
                                "periodo_fin": fecha_mas_reciente.strftime("%Y-%m-%d")
                            }}
                        )

        # ⭐ Decidir: Actualizar o Crear
        if comision_document and not crear_nuevo_documento:
            print("🔄 Actualizando documento de comisión existente...")
            
            update_operations = {
                "$inc": {
                    "total_servicios": len(servicios_comision),
                    "total_productos": len(productos_comision),
                    "total_comisiones": valor_comision_total
                },
                "$set": {
                    "estado": "pendiente",
                    "periodo_fin": fecha_actual_str
                }
            }
            
            # Agregar servicios si hay
            if servicios_comision:
                if "servicios_detalle" not in comision_document:
                    update_operations["$set"]["servicios_detalle"] = servicios_comision
                else:
                    update_operations["$push"] = {"servicios_detalle": {"$each": servicios_comision}}
            
            # Agregar productos si hay
            if productos_comision:
                if "productos_detalle" not in comision_document:
                    update_operations["$set"]["productos_detalle"] = productos_comision
                else:
                    if "$push" not in update_operations:
                        update_operations["$push"] = {}
                    update_operations["$push"]["productos_detalle"] = {"$each": productos_comision}
            
            if "periodo_inicio" not in comision_document:
                update_operations["$set"]["periodo_inicio"] = fecha_actual_str
            
            await collection_commissions.update_one(
                {"_id": comision_document["_id"]},
                update_operations
            )
            
            # Redondear total
            doc_actualizado = await collection_commissions.find_one({"_id": comision_document["_id"]})
            if doc_actualizado:
                total_redondeado = round(doc_actualizado.get("total_comisiones", 0), 2)
                await collection_commissions.update_one(
                    {"_id": doc_actualizado["_id"]},
                    {"$set": {"total_comisiones": total_redondeado}}
                )
            
            comision_msg = f"Comisión actualizada (+{valor_comision_total} {moneda_sede})"
            print(f"✅ {comision_msg}")
        else:
            print("🆕 Creando nuevo documento de comisión...")
            nuevo_doc = {
                "profesional_id": profesional_id,
                "profesional_nombre": profesional_nombre,
                "sede_id": sede_id,
                "sede_nombre": sede.get("nombre", ""),
                "moneda": moneda_sede,
                "tipo_comision": tipo_comision,
                "total_servicios": len(servicios_comision),
                "total_productos": len(productos_comision),
                "total_comisiones": round(valor_comision_total, 2),
                "servicios_detalle": servicios_comision,
                "productos_detalle": productos_comision,
                "periodo_inicio": fecha_actual_str,
                "periodo_fin": fecha_actual_str,
                "estado": "pendiente",
                "creado_en": fecha_actual
            }
            await collection_commissions.insert_one(nuevo_doc)
            comision_msg = f"Comisión creada ({valor_comision_total} {moneda_sede})"
            print(f"✅ {comision_msg}")
    else:
        print("⚠️ No se generó comisión")

    # ====================================
    # RESPUESTA FINAL
    # ====================================
    return {
        "success": True,
        "message": f"{tipo.capitalize()} facturada correctamente",
        "comision_mensaje": comision_msg,
        "tipo_facturado": tipo,
        "numero_comprobante": numero_comprobante,
        "identificador": identificador,
        "total": total_final,
        "moneda": moneda_sede,
        "items": items,
        "detalles": {
            "servicios": sum(item["subtotal"] for item in items if item["tipo"] == "servicio"),
            "productos": sum(item["subtotal"] for item in items if item["tipo"] == "producto"),
            "comision_servicios": total_comision_servicios,
            "comision_productos": total_comision_productos,
            "comision_total": valor_comision_total,
            "total": total_final,
            "moneda": moneda_sede
        }
    }


# ============================================================
# 📄 Obtener facturas
# ============================================================
@router.get("/invoices/{cliente_id}")
async def obtener_facturas_cliente(
    cliente_id: str,
    current_user: dict = Depends(get_current_user)
):
    facturas = await collection_invoices.find({
        "cliente_id": cliente_id
    }).sort("fecha_pago", -1).to_list(None)

    for factura in facturas:
        factura["_id"] = str(factura["_id"])

    return {
        "success": True,
        "total": len(facturas),
        "facturas": facturas
    }


# ============================================================
# 🔹 Obtener ventas con paginación y filtros
# ============================================================
@router.get("/sales/{sede_id}")
async def obtener_ventas_sede(
    sede_id: str,
    # Parámetros de paginación
    page: int = Query(1, ge=1, description="Número de página (inicia en 1)"),
    limit: int = Query(50, ge=1, le=200, description="Registros por página (máx 200)"),
    
    # Filtros de fecha
    fecha_desde: Optional[str] = Query(
        None, 
        description="Fecha inicio (formato: YYYY-MM-DD)",
        regex=r"^\d{4}-\d{2}-\d{2}$"
    ),
    fecha_hasta: Optional[str] = Query(
        None,
        description="Fecha fin (formato: YYYY-MM-DD)",
        regex=r"^\d{4}-\d{2}-\d{2}$"
    ),
    
    # Filtros adicionales
    profesional_id: Optional[str] = Query(None, description="Filtrar por profesional"),
    search: Optional[str] = Query(None, description="Buscar en nombre, cédula o email del cliente"),
    
    # Ordenamiento
    sort_order: str = Query("desc", regex=r"^(asc|desc)$", description="Orden ascendente o descendente"),
    
    current_user: dict = Depends(get_current_user)
):
    """
    Obtiene ventas paginadas con múltiples filtros
    
    Parámetros:
    - **sede_id**: ID de la sede (SD-XXXXX)
    - **page**: Número de página (default: 1)
    - **limit**: Registros por página (default: 50, max: 200)
    - **fecha_desde**: Filtro fecha inicio (YYYY-MM-DD)
    - **fecha_hasta**: Filtro fecha fin (YYYY-MM-DD)
    - **profesional_id**: ID del profesional
    - **search**: Buscar en nombre, cédula o email del cliente
    
    Ejemplo de uso:
    /sales/SD-88809?page=1&limit=50&fecha_desde=2025-12-01&fecha_hasta=2025-12-31
    """
    
    # Validar permisos
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    try:
        from datetime import timedelta
        
        # ============================================================
        # 🔹 Construir filtros dinámicos
        # ============================================================
        filtros = {"sede_id": sede_id}
        
        # DEBUG: Log para ver qué estamos buscando
        print(f"🔍 Buscando ventas para sede_id: {sede_id}")
        
        # Filtro de fechas (usando ISODate para MongoDB)
        if fecha_desde or fecha_hasta:
            filtros["fecha_pago"] = {}
            
            if fecha_desde:
                # Convertir a inicio del día en UTC
                fecha_inicio = datetime.strptime(fecha_desde, "%Y-%m-%d")
                filtros["fecha_pago"]["$gte"] = fecha_inicio
                print(f"📅 Filtro fecha_desde: {fecha_inicio}")
            
            if fecha_hasta:
                # Convertir a fin del día en UTC
                fecha_fin = datetime.strptime(fecha_hasta, "%Y-%m-%d")
                fecha_fin = fecha_fin.replace(hour=23, minute=59, second=59)
                filtros["fecha_pago"]["$lte"] = fecha_fin
                print(f"📅 Filtro fecha_hasta: {fecha_fin}")
        else:
            # Si NO hay filtros de fecha, buscar últimos 7 días por defecto
            if not profesional_id and not search:
                fecha_fin = datetime.now()
                fecha_inicio = fecha_fin - timedelta(days=7)
                filtros["fecha_pago"] = {
                    "$gte": fecha_inicio,
                    "$lte": fecha_fin
                }
                print(f"📅 Filtro automático (últimos 7 días): {fecha_inicio} a {fecha_fin}")
        
        # DEBUG: Imprimir filtros aplicados
        print(f"🔎 Filtros aplicados: {filtros}")
        
        # ============================================================
        # 🔹 Filtros adicionales (manejo especial de $or)
        # ============================================================
        condiciones_or = []
        
        # Filtro por profesional (búsqueda híbrida)
        if profesional_id:
            condiciones_or.extend([
                {"profesional_id": profesional_id},  # Sistema actual
                {"items.profesional_id": profesional_id}  # Data migrada
            ])
        
        # Búsqueda de texto en datos del cliente
        if search:
            condiciones_or.extend([
                {"nombre_cliente": {"$regex": search, "$options": "i"}},
                {"cedula_cliente": {"$regex": search, "$options": "i"}},
                {"email_cliente": {"$regex": search, "$options": "i"}},
                {"telefono_cliente": {"$regex": search, "$options": "i"}}
            ])
        
        # Si hay condiciones OR, agregarlas al filtro
        if condiciones_or:
            # Si solo hay un tipo de filtro OR, usar directamente
            if profesional_id and not search:
                filtros["$or"] = condiciones_or
            elif search and not profesional_id:
                filtros["$or"] = condiciones_or
            # Si hay ambos filtros, combinarlos con $and
            else:
                filtros["$and"] = [
                    {
                        "$or": [
                            {"profesional_id": profesional_id},
                            {"items.profesional_id": profesional_id}
                        ]
                    },
                    {
                        "$or": [
                            {"nombre_cliente": {"$regex": search, "$options": "i"}},
                            {"cedula_cliente": {"$regex": search, "$options": "i"}},
                            {"email_cliente": {"$regex": search, "$options": "i"}},
                            {"telefono_cliente": {"$regex": search, "$options": "i"}}
                        ]
                    }
                ]
        
        # DEBUG: Imprimir filtros finales
        print(f"🔎 Filtros finales completos: {filtros}")
        
        # ============================================================
        # 🔹 Contar total de registros (con timeout)
        # ============================================================
        try:
            total_ventas = await asyncio.wait_for(
                collection_sales.count_documents(filtros),
                timeout=10.0  # 10 segundos máximo
            )
        except asyncio.TimeoutError:
            # Si tarda mucho, retornar -1 (frontend puede manejarlo)
            total_ventas = -1
        
        # ============================================================
        # 🔹 Calcular paginación
        # ============================================================
        skip = (page - 1) * limit
        total_pages = (total_ventas + limit - 1) // limit if total_ventas > 0 else 0
        
        # ============================================================
        # 🔹 Ordenamiento (fijo por fecha descendente)
        # ============================================================
        sort_by = "fecha_pago"
        sort_direction = -1  # Descendente (más recientes primero)
        
        # ============================================================
        # 🔹 Proyección optimizada (campos de tu schema)
        # ============================================================
        projection = {
            "_id": 1,
            "identificador": 1,
            "fecha_pago": 1,
            "moneda": 1,
            "local": 1,
            "sede_id": 1,
            "cliente_id": 1,
            "nombre_cliente": 1,
            "cedula_cliente": 1,
            "email_cliente": 1,
            "telefono_cliente": 1,
            "items": 1,
            "desglose_pagos": 1,
            "facturado_por": 1,
            "numero_comprobante": 1,
            "tipo_comision": 1,
            "profesional_id": 1,
            "profesional_nombre": 1,
            "historial_pagos": 1
        }
        
        # ============================================================
        # 🔹 Obtener ventas paginadas
        # ============================================================
        ventas = await collection_sales.find(filtros, projection)\
            .sort(sort_by, sort_direction,)\
            .skip(skip)\
            .limit(limit)\
            .to_list(limit)
        
        # ============================================================
        # 🔹 Procesar datos y convertir ObjectIds RECURSIVAMENTE
        # ============================================================
        from bson import ObjectId
        
        def limpiar_objectids(obj):
            """
            Convierte recursivamente TODOS los ObjectId a string
            Funciona con diccionarios, listas y valores anidados
            """
            if isinstance(obj, ObjectId):
                return str(obj)
            elif isinstance(obj, dict):
                return {key: limpiar_objectids(value) for key, value in obj.items()}
            elif isinstance(obj, list):
                return [limpiar_objectids(item) for item in obj]
            elif isinstance(obj, datetime):
                return obj.isoformat()
            else:
                return obj
        
        # Limpiar TODAS las ventas recursivamente
        ventas = [limpiar_objectids(venta) for venta in ventas]

        
        # ============================================================
        # 🔹 Respuesta estructurada
        # ============================================================
        return {
            "success": True,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total_ventas,
                "total_pages": total_pages,
                "has_next": skip + limit < total_ventas if total_ventas > 0 else False,
                "has_prev": page > 1,
                "showing": len(ventas),
                "from": skip + 1 if len(ventas) > 0 else 0,
                "to": skip + len(ventas)
            },
            "filters_applied": {
                "sede_id": sede_id,
                "fecha_desde": fecha_desde,
                "fecha_hasta": fecha_hasta,
                "profesional_id": profesional_id,
                "search": search
            },
            "ventas": ventas
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al obtener ventas: {str(e)}"
        )


# ============================================================
# 🔹 Endpoint para obtener detalle de una venta específica
# ============================================================
@router.get("/sales/{sede_id}/{venta_id}")
async def obtener_detalle_venta(
    sede_id: str,
    venta_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Obtiene el detalle completo de una venta específica
    """
    
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    try:
        from bson import ObjectId
        
        # Función reutilizable para limpiar ObjectIds
        def limpiar_objectids(obj):
            """Convierte recursivamente TODOS los ObjectId a string"""
            if isinstance(obj, ObjectId):
                return str(obj)
            elif isinstance(obj, dict):
                return {key: limpiar_objectids(value) for key, value in obj.items()}
            elif isinstance(obj, list):
                return [limpiar_objectids(item) for item in obj]
            elif isinstance(obj, datetime):
                return obj.isoformat()
            else:
                return obj
        
        venta = await collection_sales.find_one({
            "_id": ObjectId(venta_id),
            "sede_id": sede_id
        })
        
        if not venta:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        
        # Limpiar todos los ObjectIds recursivamente
        venta = limpiar_objectids(venta)
        
        return {
            "success": True,
            "venta": venta
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al obtener detalle de venta: {str(e)}"
        )