# ============================================================
# routes_cash.py - REFACTORIZADO CON LÓGICA CONTABLE CORRECTA
# Ubicación: app/cash/routes_cash.py
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime

# Importar lógica contable separada
from .accounting_logic import (
    calcular_resumen_dia,
    obtener_ventas_dia,        # ← NUEVO
    obtener_egresos_dia,          # ← NUEVO
    obtener_movimientos_efectivo_dia  # ← NUEVO
)

# Importar generador de Excel
from .excel_generator import generar_reporte_excel_caja_completo, generar_nombre_archivo_excel

# Importar modelos y utilidades
from .models_cash import (
    AperturaCajaRequest, RegistroEgresoRequest, CierreCajaRequest,
    EgresoResponse, CierreResponse
)
from .utils_cash import (
    generar_cierre_id, generar_egreso_id, generar_apertura_id,
    calcular_diferencia, validar_diferencia_aceptable,
    construir_filtro_fecha, convertir_mongo_a_json
)

# Importar autenticación
from app.auth.routes import get_current_user

# Importar colecciones
from app.database.mongo import (
    db,
    collection_locales as locales
)

router = APIRouter(prefix="/cash", tags=["Cash Management"])

# Colecciones
cash_expenses = db["cash_expenses"]
cash_closures = db["cash_closures"]

# ============================================================
# 1. CALCULAR EFECTIVO DEL DÍA (REFACTORIZADO ✅)
# ============================================================

@router.get("/efectivo-dia")
async def calcular_efectivo_dia_endpoint(
    sede_id: str = Query(..., description="ID de la sede"),
    fecha: Optional[str] = Query(None, description="Fecha (YYYY-MM-DD), default: hoy"),
    current_user: dict = Depends(get_current_user)
):
    """
    Calcula el efectivo del día con criterio contable correcto.
    
    ✅ CRITERIO CONTABLE:
    - Solo suma pagos con metodo == "efectivo" del historial_pagos
    - NO suma valor_total completo
    - NO duplica productos (ya están en historial_pagos)
    - Discrimina ingresos por método de pago
    
    Returns:
        {
            "sede_id": "SD-88809",
            "fecha": "2026-02-09",
            "efectivo_inicial": 100000,
            "ingresos_efectivo": {
                "citas": 127400,
                "ventas": 77400,
                "total": 204800
            },
            "ingresos_otros_metodos": {
                "tarjeta": 185000,
                "transferencia": 0,
                "total": 185000
            },
            "egresos": {...},
            "efectivo_esperado": 304800,
            "total_vendido": 389800
        }
    """
    
    if not fecha:
        fecha = datetime.now().strftime("%Y-%m-%d")
    
    # Usar lógica contable separada
    resumen = await calcular_resumen_dia(sede_id, fecha)
    
    # Verificar si hay cierre
    cierre = await cash_closures.find_one({
        "sede_id": sede_id,
        "fecha": fecha,
        "tipo": "cierre"
    })
    
    if cierre:
        resumen["efectivo_contado"] = cierre.get("efectivo_contado")
        resumen["diferencia"] = cierre.get("diferencia")
        resumen["estado"] = cierre.get("estado")
    
    return resumen

# ============================================================
# 2. REGISTRAR EGRESO (SIN CAMBIOS)
# ============================================================

@router.post("/egreso", response_model=EgresoResponse, status_code=status.HTTP_201_CREATED)
async def registrar_egreso(
    egreso: RegistroEgresoRequest,
    current_user: dict = Depends(get_current_user)
):
    """Registra un egreso de efectivo."""
    
    fecha = egreso.fecha or datetime.now().strftime("%Y-%m-%d")
    
    sede = await locales.find_one({"sede_id": egreso.sede_id})
    sede_nombre = sede.get("nombre") if sede else None
    
    egreso_doc = {
        "egreso_id": generar_egreso_id(),
        "sede_id": egreso.sede_id,
        "tipo": egreso.tipo.value,
        "concepto": egreso.concepto,
        "descripcion": egreso.descripcion,
        "monto": egreso.monto,
        "moneda": egreso.moneda.value,
        "fecha": fecha,
        "registrado_por": current_user["email"],
        "registrado_por_nombre": current_user.get("nombre"),
        "registrado_por_rol": current_user.get("rol"),
        "comprobante_numero": egreso.comprobante_numero,
        "comprobante_tipo": egreso.comprobante_tipo,
        "categoria": egreso.categoria,
        "creado_en": datetime.now(),
        "actualizado_en": datetime.now()
    }
    
    resultado = await cash_expenses.insert_one(egreso_doc)
    
    if not resultado.inserted_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al registrar el egreso"
        )
    
    return EgresoResponse(
        egreso_id=egreso_doc["egreso_id"],
        sede_id=egreso_doc["sede_id"],
        sede_nombre=sede_nombre,
        tipo=egreso_doc["tipo"],
        concepto=egreso_doc["concepto"],
        descripcion=egreso_doc["descripcion"],
        monto=egreso_doc["monto"],
        moneda=egreso_doc["moneda"],
        fecha=egreso_doc["fecha"],
        registrado_por=egreso_doc["registrado_por"],
        registrado_por_nombre=egreso_doc.get("registrado_por_nombre"),
        comprobante_numero=egreso_doc.get("comprobante_numero"),
        creado_en=egreso_doc["creado_en"]
    )

# ============================================================
# 3. LISTAR EGRESOS (SIN CAMBIOS)
# ============================================================

@router.get("/egresos", response_model=List[EgresoResponse])
async def listar_egresos(
    sede_id: str = Query(...),
    fecha: Optional[str] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    tipo: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Lista los egresos con filtros opcionales."""
    
    filtro = {"sede_id": sede_id}
    filtro.update(construir_filtro_fecha(fecha, fecha_inicio, fecha_fin))
    
    if tipo:
        filtro["tipo"] = tipo
    
    egresos_list = await cash_expenses.find(filtro).sort("creado_en", -1).to_list(None)
    
    sede = await locales.find_one({"sede_id": sede_id})
    sede_nombre = sede.get("nombre") if sede else None
    
    return [
        EgresoResponse(
            egreso_id=e["egreso_id"],
            sede_id=e["sede_id"],
            sede_nombre=sede_nombre,
            tipo=e["tipo"],
            concepto=e["concepto"],
            descripcion=e.get("descripcion"),
            monto=e["monto"],
            moneda=e["moneda"],
            fecha=e["fecha"],
            registrado_por=e["registrado_por"],
            registrado_por_nombre=e.get("registrado_por_nombre"),
            comprobante_numero=e.get("comprobante_numero"),
            creado_en=e["creado_en"]
        )
        for e in egresos_list
    ]

# ============================================================
# 4. APERTURA DE CAJA (SIN CAMBIOS)
# ============================================================

@router.post("/apertura", status_code=status.HTTP_201_CREATED)
async def apertura_caja(
    apertura: AperturaCajaRequest,
    current_user: dict = Depends(get_current_user)
):
    """Registra la apertura de caja del día."""
    
    apertura_existente = await cash_closures.find_one({
        "sede_id": apertura.sede_id,
        "fecha": apertura.fecha,
        "tipo": "apertura"
    })
    
    if apertura_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe una apertura de caja para {apertura.sede_id} el {apertura.fecha}"
        )
    
    sede = await locales.find_one({"sede_id": apertura.sede_id})
    sede_nombre = sede.get("nombre") if sede else None
    
    apertura_doc = {
        "apertura_id": generar_apertura_id(apertura.sede_id, apertura.fecha),
        "tipo": "apertura",
        "sede_id": apertura.sede_id,
        "sede_nombre": sede_nombre,
        "fecha": apertura.fecha,
        "efectivo_inicial": apertura.efectivo_inicial,
        "moneda": apertura.moneda.value,
        "observaciones": apertura.observaciones,
        "abierto_por": current_user["email"],
        "abierto_por_nombre": current_user.get("nombre"),
        "abierto_por_rol": current_user.get("rol"),
        "creado_en": datetime.now()
    }
    
    resultado = await cash_closures.insert_one(apertura_doc)
    
    if not resultado.inserted_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al registrar la apertura de caja"
        )
    
    return {
        "ok": True,
        "mensaje": f"Caja abierta exitosamente para {apertura.sede_id} el {apertura.fecha}",
        "apertura_id": apertura_doc["apertura_id"],
        "efectivo_inicial": apertura_doc["efectivo_inicial"]
    }

# ============================================================
# 5. CERRAR CAJA (REFACTORIZADO ✅)
# ============================================================

@router.post("/cierre", response_model=CierreResponse, status_code=status.HTTP_201_CREATED)
async def cerrar_caja(
    cierre: CierreCajaRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Cierra la caja del día con criterio contable correcto.
    
    ✅ Usa la lógica contable refactorizada
    """
    
    cierre_existente = await cash_closures.find_one({
        "sede_id": cierre.sede_id,
        "fecha": cierre.fecha,
        "tipo": "cierre"
    })
    
    if cierre_existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un cierre de caja para {cierre.sede_id} el {cierre.fecha}"
        )
    
    # Usar lógica contable refactorizada
    resumen = await calcular_resumen_dia(cierre.sede_id, cierre.fecha)
    
    diferencia = calcular_diferencia(resumen["efectivo_esperado"], cierre.efectivo_contado)
    es_aceptable, mensaje_validacion = validar_diferencia_aceptable(diferencia)
    
    if cierre.desglose_fisico:
        total_desglose = sum(item.subtotal for item in cierre.desglose_fisico)
        if abs(total_desglose - cierre.efectivo_contado) > 0.01:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El desglose físico no coincide con el efectivo contado"
            )
    
    cierre_doc = {
        "cierre_id": generar_cierre_id(cierre.sede_id, cierre.fecha),
        "tipo": "cierre",
        "sede_id": cierre.sede_id,
        "sede_nombre": resumen["sede_nombre"],
        "fecha": cierre.fecha,
        "moneda": cierre.moneda.value,
        "efectivo_inicial": resumen["efectivo_inicial"],
        "total_ingresos": resumen["ingresos_efectivo"]["total"],
        "total_egresos": resumen["egresos"]["total"],
        "efectivo_esperado": resumen["efectivo_esperado"],
        "efectivo_contado": cierre.efectivo_contado,
        "diferencia": diferencia,
        "ingresos_detalle": resumen["ingresos_efectivo"],
        "ingresos_otros_metodos": resumen["ingresos_otros_metodos"],
        "egresos_detalle": resumen["egresos"],
        "desglose_fisico": [item.dict() for item in cierre.desglose_fisico] if cierre.desglose_fisico else None,
        "estado": "cerrado",
        "diferencia_aceptable": es_aceptable,
        "mensaje_validacion": mensaje_validacion,
        "observaciones": cierre.observaciones,
        "cerrado_por": current_user["email"],
        "cerrado_por_nombre": current_user.get("nombre"),
        "cerrado_por_rol": current_user.get("rol"),
        "creado_en": datetime.now(),
        "aprobado_por": None,
        "aprobado_en": None
    }
    
    resultado = await cash_closures.insert_one(cierre_doc)
    
    if not resultado.inserted_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al registrar el cierre de caja"
        )
    
    return CierreResponse(
        cierre_id=cierre_doc["cierre_id"],
        sede_id=cierre_doc["sede_id"],
        sede_nombre=cierre_doc["sede_nombre"],
        fecha=cierre_doc["fecha"],
        moneda=cierre_doc["moneda"],
        efectivo_inicial=cierre_doc["efectivo_inicial"],
        total_ingresos=cierre_doc["total_ingresos"],
        total_egresos=cierre_doc["total_egresos"],
        efectivo_esperado=cierre_doc["efectivo_esperado"],
        efectivo_contado=cierre_doc["efectivo_contado"],
        diferencia=cierre_doc["diferencia"],
        estado=cierre_doc["estado"],
        observaciones=cierre_doc.get("observaciones"),
        cerrado_por=cierre_doc["cerrado_por"],
        cerrado_por_nombre=cierre_doc.get("cerrado_por_nombre"),
        creado_en=cierre_doc["creado_en"],
        aprobado_por=cierre_doc.get("aprobado_por"),
        aprobado_en=cierre_doc.get("aprobado_en")
    )

# ============================================================
# 6. LISTAR CIERRES (SIN CAMBIOS)
# ============================================================

@router.get("/cierres", response_model=List[CierreResponse])
async def listar_cierres(
    sede_id: str = Query(...),
    fecha: Optional[str] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Lista los cierres de caja."""
    
    filtro = {"sede_id": sede_id, "tipo": "cierre"}
    filtro.update(construir_filtro_fecha(fecha, fecha_inicio, fecha_fin))
    
    if estado:
        filtro["estado"] = estado
    
    cierres_list = await cash_closures.find(filtro).sort("creado_en", -1).to_list(None)
    
    return [
        CierreResponse(
            cierre_id=c["cierre_id"],
            sede_id=c["sede_id"],
            sede_nombre=c.get("sede_nombre"),
            fecha=c["fecha"],
            moneda=c["moneda"],
            efectivo_inicial=c["efectivo_inicial"],
            total_ingresos=c["total_ingresos"],
            total_egresos=c["total_egresos"],
            efectivo_esperado=c["efectivo_esperado"],
            efectivo_contado=c["efectivo_contado"],
            diferencia=c["diferencia"],
            estado=c["estado"],
            observaciones=c.get("observaciones"),
            cerrado_por=c["cerrado_por"],
            cerrado_por_nombre=c.get("cerrado_por_nombre"),
            creado_en=c["creado_en"],
            aprobado_por=c.get("aprobado_por"),
            aprobado_en=c.get("aprobado_en")
        )
        for c in cierres_list
    ]

# ============================================================
# 7. VER DETALLE DE CIERRE (SIN CAMBIOS)
# ============================================================

@router.get("/cierres/{cierre_id}")
async def obtener_cierre(
    cierre_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene el detalle completo de un cierre."""
    
    cierre = await cash_closures.find_one({"cierre_id": cierre_id})
    
    if not cierre:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cierre {cierre_id} no encontrado"
        )
    
    cierre = convertir_mongo_a_json(cierre)
    
    return cierre

# ============================================================
# 8. ELIMINAR EGRESO (SIN CAMBIOS)
# ============================================================

@router.delete("/egresos/{egreso_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_egreso(
    egreso_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Elimina un egreso."""
    
    if current_user["rol"] not in ["admin_sede", "super_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para eliminar egresos"
        )
    
    egreso = await cash_expenses.find_one({"egreso_id": egreso_id})
    
    if not egreso:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Egreso {egreso_id} no encontrado"
        )
    
    resultado = await cash_expenses.delete_one({"egreso_id": egreso_id})
    
    if resultado.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al eliminar el egreso"
        )
    
    return None

# ============================================================
# 9. REPORTE DE PERIODO (CORREGIDO)
# ============================================================

@router.get("/reporte-periodo")
async def reporte_periodo(
    sede_id: str = Query(...),
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    current_user: dict = Depends(get_current_user)
):
    """Genera un reporte consolidado para un periodo de fechas."""
    
    cierres_list = await cash_closures.find({
        "sede_id": sede_id,
        "fecha": {"$gte": fecha_inicio, "$lte": fecha_fin},
        "tipo": "cierre"
    }).sort("fecha", 1).to_list(None)
    
    cierres_list = [convertir_mongo_a_json(c) for c in cierres_list]
    
    total_ingresos = sum(c.get("total_ingresos", 0) for c in cierres_list)
    total_egresos = sum(c.get("total_egresos", 0) for c in cierres_list)
    total_diferencias = sum(c.get("diferencia", 0) for c in cierres_list)
    
    return {
        "sede_id": sede_id,
        "periodo": {
            "inicio": fecha_inicio,
            "fin": fecha_fin,
            "dias": len(cierres_list)
        },
        "totales": {
            "ingresos": total_ingresos,
            "egresos": total_egresos,
            "neto": total_ingresos - total_egresos,
            "diferencias_acumuladas": total_diferencias
        },
        "cierres": cierres_list
    }

# ============================================================
# 10. DESCARGAR REPORTE EXCEL (NUEVO ⭐)
# ============================================================

@router.get("/reporte-excel")
async def descargar_reporte_excel(
    sede_id: str = Query(..., description="ID de la sede"),
    fecha: str = Query(..., description="Fecha del cierre (YYYY-MM-DD)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Descarga el reporte de cierre de caja en formato Excel con 4 hojas:
    
    1. Resumen de Caja - Efectivo inicial, ingresos/egresos, saldo final
    2. Flujo de Ingresos - TODAS las ventas (todos los métodos de pago) desde sales
    3. Flujo de Egresos - Todos los egresos del día
    4. Movimientos Efectivo - Solo efectivo con saldo corrido
    
    ✅ Usa collection_sales (compatible con datos nuevos y migrados)
    ✅ Formato contable profesional
    ✅ Archivo descargable
    """
    
    # 1. Obtener resumen del día
    resumen = await calcular_resumen_dia(sede_id, fecha)
    
    # 2. Obtener información completa de la sede
    sede = await locales.find_one({"sede_id": sede_id})
    if not sede:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sede {sede_id} no encontrada"
        )
    
    sede_info = {
        "razon_social": sede.get("razon_social", "SALÓN RIZOS FELICES CL SAS"),
        "direccion": sede.get("direccion", ""),
        "ciudad": sede.get("ciudad", ""),
        "pais": sede.get("pais", "")
    }
    
    # 3. Obtener todas las ventas del día (todos los métodos) desde SALES
    ventas = await obtener_ventas_dia(sede_id, fecha)  # ← CAMBIO AQUÍ
    
    # 4. Obtener todos los egresos del día
    egresos = await obtener_egresos_dia(sede_id, fecha)
    
    # 5. Obtener movimientos en efectivo con saldo corrido
    movimientos_efectivo = await obtener_movimientos_efectivo_dia(sede_id, fecha)
    
    # 6. Agregar quien genera el reporte
    resumen["generado_por"] = current_user.get("email")
    
    # 7. Generar Excel con 4 hojas
    excel_file = generar_reporte_excel_caja_completo(
        resumen=resumen,
        sede_info=sede_info,
        facturas=ventas,  # ← Ahora son ventas de sales, no facturas de invoices
        egresos=egresos,
        movimientos_efectivo=movimientos_efectivo
    )
    
    # 8. Nombre del archivo
    nombre_sede = sede.get("nombre", sede_id).replace(" ", "_")
    filename = generar_nombre_archivo_excel(nombre_sede, fecha)
    
    # 9. Retornar como descarga
    return StreamingResponse(
        excel_file,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )
