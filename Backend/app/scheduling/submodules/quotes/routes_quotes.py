from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File, Form
from datetime import datetime, time, timedelta
import traceback
from typing import Optional, List
from email.message import EmailMessage
import smtplib, ssl, os
from bson import ObjectId
import uuid
import boto3
import json
from dotenv import load_dotenv
load_dotenv()


from app.scheduling.submodules.quotes.controllers import (
    generar_pdf_ficha,
    crear_html_correo_ficha,
    enviar_correo_con_pdf
)
from app.scheduling.models import FichaCreate
from app.scheduling.models import Cita, ProductoItem, PagoRequest, ServicioEnCita, ServicioEnFicha
from app.database.mongo import (
    collection_citas,
    collection_horarios,
    collection_servicios,
    collection_estilista,
    collection_clients,
    collection_locales,
    collection_block,
    collection_card,
    collection_commissions,
    collection_products
)
from app.auth.routes import get_current_user

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_BUCKET_NAME = os.getenv("AWS_BUCKET_NAME")
AWS_REGION = os.getenv("AWS_REGION")

router = APIRouter()

s3_client = boto3.client(
    's3',
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION", "us-west-2")
)


def upload_to_s3(file: UploadFile, folder_path: str) -> str:
    try:
        file_extension = file.filename.split('.')[-1]

        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        s3_key = f"{folder_path}/{unique_filename}"


        s3_client.put_object(
            Bucket=os.getenv("AWS_BUCKET_NAME"),
            Key=s3_key,
            Body=file.file.read(),
            ContentType=file.content_type or "image/webp"
        )

        base_url = os.getenv("AWS_PUBLIC_BASE_URL")
        if not base_url:    
            raise RuntimeError("AWS_PUBLIC_BASE_URL no está configurado")

        return f"{base_url}/{s3_key}"



    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------
# EMAIL (config desde env)
# -----------------------
EMAIL_SENDER = os.getenv("EMAIL_REMITENTE")
EMAIL_PASSWORD = os.getenv("EMAIL_CONTRASENA")
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465

def enviar_correo(destinatario: str, asunto: str, mensaje: str):
    """Envía correo HTML (SSL)."""
    try:
        msg = EmailMessage()
        msg["Subject"] = asunto
        msg["From"] = EMAIL_SENDER
        msg["To"] = destinatario
        msg.set_content(mensaje, subtype="html")

        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.send_message(msg)

        print(f"📧 Correo enviado a {destinatario}")
    except Exception as e:
        print("Error enviando email:", e)

# -----------------------
# HELPERS
# -----------------------
def normalize_cita_doc(doc: dict) -> dict:
    """Convierte _id a str y normaliza fecha si viene como datetime."""
    doc["_id"] = str(doc["_id"])
    if isinstance(doc.get("fecha"), datetime):
        doc["fecha"] = doc["fecha"].strftime("%Y-%m-%d")
    return doc

async def resolve_cita_by_id(cita_id: str) -> Optional[dict]:
    """
    Intenta resolver una cita por:
      1) campo cita_id (string de negocio)
      2) _id (ObjectId)
    Devuelve el documento o None.
    """
    cita = await collection_citas.find_one({"cita_id": cita_id})
    if cita:
        return cita
    try:
        cita = await collection_citas.find_one({"_id": ObjectId(cita_id)})
        return cita
    except Exception:
        return None

# ============================================================
# ENDPOINT OBTENER CITAS (con cálculos en tiempo real) con fecha
# ============================================================
@router.get("/", response_model=dict)
async def obtener_citas(
    sede_id: Optional[str] = Query(None),
    profesional_id: Optional[str] = Query(None),
    fecha: Optional[str] = Query(None, description="Fecha específica (YYYY-MM-DD)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Obtiene citas con datos enriquecidos.
    ✅ Soporta nueva estructura (servicios con nombre/precio)
    ✅ Compatible con estructuras antiguas
    """
    try:
        # === CONSTRUIR FILTRO ===
        filtro = {}
        if sede_id:
            filtro["sede_id"] = sede_id
        if profesional_id:
            filtro["profesional_id"] = profesional_id
        if fecha:
            filtro["fecha"] = fecha
        
        # 🔥 IMPORTANTE: Si no hay filtros, agregar límite temporal
        # Esto evita traer TODA la historia
        if not filtro:
            # Por defecto: solo últimos 30 días y próximos 60 días
            hoy = datetime.now()
            fecha_inicio = (hoy - timedelta(days=30)).strftime("%Y-%m-%d")
            fecha_fin = (hoy + timedelta(days=60)).strftime("%Y-%m-%d")
            filtro["fecha"] = {"$gte": fecha_inicio, "$lte": fecha_fin}
            print(f"⚠️ Filtro vacío detectado, usando rango: {fecha_inicio} a {fecha_fin}")

        print(f"🔍 Buscando citas con filtro: {filtro}")

        # 🔥 OPCIÓN 1: Usar aggregate con allowDiskUse (solución rápida)
        pipeline = [
            {"$match": filtro},
            {"$sort": {"fecha": 1}}
        ]
        
        citas = await collection_citas.aggregate(
            pipeline,
            allowDiskUse=True  # Permite usar disco si se excede memoria
        ).to_list(None)

        # 🔥 ALTERNATIVA: Si prefieres usar find(), agregar límite
        # citas = await collection_citas.find(filtro).sort("fecha", 1).limit(500).to_list(500)

        print(f"✅ Se encontraron {len(citas)} citas")

        if not citas:
            return {"citas": []}

        # === Bulk fetch para enriquecer datos (solo si es necesario) ===
        servicio_ids = set()
        for cita in citas:
            if "servicios" in cita:
                for s in cita["servicios"]:
                    servicio_ids.add(s.get("servicio_id"))
            elif "servicios_ids" in cita:
                servicio_ids.update(cita["servicios_ids"])
            elif "servicio_id" in cita:
                servicio_ids.add(cita["servicio_id"])

        # Solo consultar servicios si hay IDs
        servicios_map = {}
        if servicio_ids:
            print(f"🔍 Buscando {len(servicio_ids)} servicios...")
            servicios = await collection_servicios.find(
                {"servicio_id": {"$in": list(servicio_ids)}}
            ).to_list(None)
            servicios_map = {s["servicio_id"]: s for s in servicios}
            print(f"✅ Se encontraron {len(servicios)} servicios")

        # === Enriquecer cada cita ===
        for cita in citas:
            try:
                normalize_cita_doc(cita)

                # ⭐ NUEVA ESTRUCTURA (con nombre y precio en servicios)
                if "servicios" in cita and cita["servicios"] and isinstance(cita["servicios"][0], dict):
                    primer_servicio = cita["servicios"][0]
                    
                    # Detectar si es nueva estructura (tiene campo "nombre")
                    if "nombre" in primer_servicio:
                        # Nueva estructura - nombres ya están en la cita
                        nombres = [s.get("nombre", "Servicio") for s in cita["servicios"]]
                        cita["servicio_nombre"] = ", ".join(nombres)
                        
                        # Duración: consultar solo para obtener duraciones
                        duracion_total = 0
                        for s in cita["servicios"]:
                            srv = servicios_map.get(s.get("servicio_id"))
                            if srv:
                                duracion_total += srv.get("duracion_minutos", 0)
                        cita["servicio_duracion"] = duracion_total
                        
                        # Ya no necesitas recalcular servicios_detalle, ya está en la cita
                        cita["servicios_detalle"] = cita["servicios"]
                    else:
                        # Estructura antigua (solo tiene servicio_id)
                        nombres = []
                        duracion = 0
                        for s in cita["servicios"]:
                            srv = servicios_map.get(s.get("servicio_id"))
                            if srv:
                                nombres.append(srv.get("nombre", "Servicio"))
                                duracion += srv.get("duracion_minutos", 0)
                        
                        cita["servicio_nombre"] = ", ".join(nombres) if nombres else "Sin servicio"
                        cita["servicio_duracion"] = duracion
                
                elif "servicio_id" in cita:
                    # Estructura muy antigua (un solo servicio)
                    srv = servicios_map.get(cita.get("servicio_id"))
                    cita["servicio_nombre"] = srv.get("nombre", "Sin servicio") if srv else "Sin servicio"
                    
            except Exception as e:
                print(f"❌ Error enriqueciendo cita {cita.get('_id')}: {str(e)}")
                # Continuar con las demás citas
                continue

        print(f"✅ Retornando {len(citas)} citas enriquecidas")
        return {"citas": citas}

    except Exception as e:
        print(f"❌ ERROR EN OBTENER_CITAS:")
        print(f"   Tipo: {type(e).__name__}")
        print(f"   Mensaje: {str(e)}")
        print(f"   Traceback:")
        traceback.print_exc()
        
        # Retornar error HTTP apropiado
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Error al obtener citas",
                "tipo": type(e).__name__,
                "mensaje": str(e),
                "filtro": filtro if 'filtro' in locals() else None
            }
        )

# =============================================================
# 🔹 CREAR CITA (ACTUALIZADA)
# =============================================================
@router.post("/", response_model=dict)
async def crear_cita(
    cita: Cita,
    current_user: dict = Depends(get_current_user)
):
    """
    Crea una cita con la nueva estructura optimizada.
    ✅ Guarda solo servicios: [{servicio_id, precio_personalizado}]
    ✅ Calcula totales en tiempo real
    ✅ Compatible con estructura antigua
    """
    print(f"🔍 crear_cita invocada por {current_user.get('email')}")

    # Validar permisos
    if current_user.get("rol") not in ["usuario", "admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    fecha_str = cita.fecha.strftime("%Y-%m-%d") if isinstance(cita.fecha, datetime) else str(cita.fecha)

    # === Validaciones básicas ===
    cliente = await collection_clients.find_one({"cliente_id": cita.cliente_id})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    profesional = await collection_estilista.find_one({"profesional_id": cita.profesional_id})
    if not profesional:
        raise HTTPException(status_code=404, detail="Profesional no encontrado")

    sede = await collection_locales.find_one({"sede_id": cita.sede_id})
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")

    moneda_sede = sede.get("moneda", "COP")

    # ====================================
    # ⭐ PROCESAR SERVICIOS (NUEVA LÓGICA)
    # ====================================
    if not cita.servicios or len(cita.servicios) == 0:
        raise HTTPException(status_code=400, detail="Debe especificar al menos un servicio")

    servicios_procesados = []
    servicios_info = []  # Para email
    servicios_ids_vistos = set()
    valor_total = 0
    duracion_total = 0
    nombres_servicios = []  # Para denormalizar

    for servicio_item in cita.servicios:
        if servicio_item.servicio_id in servicios_ids_vistos:
            raise HTTPException(
                status_code=400,
                detail=f"Servicio duplicado en la cita: {servicio_item.servicio_id}"
            )
        servicios_ids_vistos.add(servicio_item.servicio_id)

        cantidad = int(servicio_item.cantidad or 1)
        if cantidad < 1:
            raise HTTPException(status_code=400, detail="La cantidad debe ser mayor o igual a 1")

        servicio_db = await collection_servicios.find_one({"servicio_id": servicio_item.servicio_id})
        if not servicio_db:
            raise HTTPException(status_code=404, detail=f"Servicio {servicio_item.servicio_id} no encontrado")

        # ⭐ DETERMINAR PRECIO
        es_personalizado = False
        if servicio_item.precio_personalizado is not None and servicio_item.precio_personalizado > 0:
            # Precio personalizado válido
            precio = float(servicio_item.precio_personalizado)
            es_personalizado = True
        else:
            # Usar precio de BD
            precios = servicio_db.get("precios", {})
            if moneda_sede not in precios:
                raise HTTPException(status_code=400, detail=f"Servicio sin precio en {moneda_sede}")
            precio = float(precios[moneda_sede])
            es_personalizado = False

        # Acumular totales
        subtotal = round(precio * cantidad, 2)
        valor_total += subtotal
        duracion_total += int(servicio_db.get("duracion_minutos", 0) or 0) * cantidad
        nombre_servicio = servicio_db.get("nombre", "Servicio")
        nombres_servicios.append(f"{nombre_servicio} x{cantidad}" if cantidad > 1 else nombre_servicio)
        servicios_info.append({
            "servicio_id": servicio_item.servicio_id,
            "nombre": nombre_servicio,
            "precio_unitario": round(precio, 2),
            "cantidad": cantidad,
            "subtotal": subtotal
        })

        # ⭐ GUARDAR SERVICIO (estructura mejorada)
        servicio_guardado = {
            "servicio_id": servicio_item.servicio_id,
            "nombre": nombre_servicio,  # ⭐ NUEVO
            "precio_personalizado": es_personalizado,  # ⭐ BOOLEANO
            "precio": round(precio, 2),  # ⭐ SIEMPRE guardar el precio unitario usado
            "cantidad": cantidad,
            "subtotal": subtotal
        }
        servicios_procesados.append(servicio_guardado)

    valor_total = round(valor_total, 2)
    # === Calcular estado de pago ===
    abono = float(cita.abono or 0)
    saldo_pendiente = round(valor_total - abono, 2)

    if saldo_pendiente <= 0:
        estado_pago = "pagado"
    elif abono > 0:
        estado_pago = "abonado"
    else:
        estado_pago = "pendiente"

    # === Historial de pagos ===
    historial_pagos = []
    if abono > 0:
        historial_pagos.append({
            "fecha": datetime.now(),
            "monto": float(abono),
            "metodo": cita.metodo_pago_inicial,
            "tipo": "abono_inicial",
            "registrado_por": current_user.get("email"),
            "saldo_despues": float(saldo_pendiente)
        })

    """# === validar horario del profesional ===
    dia_semana = cita.fecha.isoweekday()
    horario = await collection_horarios.find_one({
        "profesional_id": cita.profesional_id,
        "disponibilidad": {
            "$elemMatch": {"dia_semana": dia_semana, "activo": True}
        }
    })
    if not horario:
        raise HTTPException(status_code=400, detail="El profesional no trabaja este día")

    dia_info = next((d for d in horario["disponibilidad"] if d["dia_semana"] == dia_semana), None)
    if not dia_info:
        raise HTTPException(status_code=400, detail="El profesional no tiene disponibilidad para ese día")

    hora_inicio_hor = time.fromisoformat(dia_info["hora_inicio"])
    hora_fin_hor = time.fromisoformat(dia_info["hora_fin"])
    hora_inicio_cita = time.fromisoformat(cita.hora_inicio)
    hora_fin_cita = time.fromisoformat(cita.hora_fin)

    if not (hora_inicio_hor <= hora_inicio_cita < hora_fin_hor and hora_inicio_hor < hora_fin_cita <= hora_fin_hor):
        raise HTTPException(status_code=400, detail="La cita está fuera del horario laboral del profesional")"""

    # === horario fijo para mostrar en email ===
    dia_info = {
        "hora_inicio": "09:00",
        "hora_fin": "18:00"
    }

    """# === validar bloqueos ===
    bloqueo = await collection_block.find_one({
        "profesional_id": cita.profesional_id,
        "fecha": fecha_str,
        "hora_inicio": {"$lt": cita.hora_fin},
        "hora_fin": {"$gt": cita.hora_inicio}
    })
    if bloqueo:
        raise HTTPException(
            status_code=400, 
            detail=f"El profesional tiene un bloqueo en ese horario (Motivo: {bloqueo.get('motivo', 'No especificado')})"
        )

    # === validar solape con otras citas (SOLO para diferentes clientes) ===
    # 🔥 CORRECCIÓN: Permitir al mismo cliente múltiples citas, pero no a diferentes clientes con el mismo profesional
    solape = await collection_citas.find_one({
        "profesional_id": cita.profesional_id,
        "cliente_id": {"$ne": cita.cliente_id},  # Solo verificar citas de OTROS clientes
        "fecha": fecha_str,
        "hora_inicio": {"$lt": cita.hora_fin},
        "hora_fin": {"$gt": cita.hora_inicio},
        "estado": {"$ne": "cancelada"}
    })
    if solape:
        cliente_solape_nombre = solape.get("cliente_nombre", "Cliente")
        raise HTTPException(
            status_code=400, 
            detail=f"El profesional ya tiene una cita con {cliente_solape_nombre} en ese horario"
        )"""

# ====================================
# ⭐ GUARDAR CITA CON DATOS DENORMALIZADOS
# ====================================
    data = {
        "sede_id": cita.sede_id,
        "cliente_id": cita.cliente_id,
        "profesional_id": cita.profesional_id,
    
        # ⭐ SERVICIOS (con nombres y precios)
        "servicios": servicios_procesados,
    
        # ⭐ DATOS DENORMALIZADOS (para consultas rápidas)
        "cliente_nombre": cliente.get("nombre"),
        "cliente_email": cliente.get("email") or cliente.get("correo"),
        "cliente_telefono": cliente.get("telefono"),
        "profesional_nombre": profesional.get("nombre"),
        "sede_nombre": sede.get("nombre"),
    
        # Fechas y estado
        "fecha": fecha_str,
        "hora_inicio": cita.hora_inicio,
        "hora_fin": cita.hora_fin,
        "estado": "confirmada",
    
        # Pagos
        "metodo_pago_inicial": cita.metodo_pago_inicial,
        "metodo_pago_actual": cita.metodo_pago_inicial,
        "abono": float(abono),
        "valor_total": float(valor_total),
        "saldo_pendiente": float(saldo_pendiente),
        "estado_pago": estado_pago,
        "moneda": moneda_sede,
        "historial_pagos": historial_pagos,
    
        # Metadata
        "creada_por": current_user.get("email"),
        "creada_por_rol": current_user.get("rol"),
        "fecha_creacion": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "ultima_actualizacion": datetime.now()
    }

    # Guardar en BD
    result = await collection_citas.insert_one(data)
    cita_id = str(result.inserted_id)

    # === construir email HTML mejorado ===
    estilo = """
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Poppins', sans-serif;
            background-color: #f8f9fa;
            color: #333;
            line-height: 1.6;
        }
        
        .email-container {
            max-width: 700px;
            margin: 30px auto;
            background: white;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
        }
        
        .email-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }
        
        .logo {
            width: 180px;
            margin-bottom: 20px;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
        }
        
        .header-title {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 10px;
        }
        
        .header-subtitle {
            font-size: 16px;
            opacity: 0.9;
            font-weight: 300;
        }
        
        .cita-id {
            background: rgba(255, 255, 255, 0.15);
            display: inline-block;
            padding: 8px 16px;
            border-radius: 50px;
            font-size: 14px;
            margin-top: 15px;
            letter-spacing: 1px;
        }
        
        .email-body {
            padding: 40px 30px;
        }
        
        .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #4a5568;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e9ecef;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .section-title i {
            color: #667eea;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .info-card {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
            border-left: 4px solid #667eea;
        }
        
        .info-label {
            font-size: 13px;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
        }
        
        .info-value {
            font-size: 16px;
            font-weight: 500;
            color: #2d3748;
        }
        
        .pago-section {
            background: linear-gradient(135deg, #f6f9ff 0%, #f0f4ff 100%);
            border-radius: 15px;
            padding: 25px;
            margin: 30px 0;
            border: 1px solid #e2e8f0;
        }
        
        .pago-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        
        .pago-item {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px dashed #cbd5e0;
        }
        
        .pago-item.total {
            border-bottom: 2px solid #4a5568;
            font-weight: 600;
            color: #2d3748;
        }
        
        .estado-pago {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 50px;
            font-size: 14px;
            font-weight: 600;
            margin-top: 10px;
        }
        
        .estado-pagado {
            background: #c6f6d5;
            color: #22543d;
        }
        
        .estado-abonado {
            background: #fed7d7;
            color: #742a2a;
        }
        
        .estado-pendiente {
            background: #feebc8;
            color: #744210;
        }
        
        .instrucciones {
            background: #e6fffa;
            border-radius: 12px;
            padding: 25px;
            margin-top: 30px;
            border-left: 4px solid #38b2ac;
        }
        
        .instrucciones-title {
            font-size: 16px;
            font-weight: 600;
            color: #234e52;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .instrucciones-list {
            list-style: none;
        }
        
        .instrucciones-list li {
            padding: 8px 0;
            color: #4a5568;
        }
        
        .instrucciones-list li:before {
            content: "✓";
            color: #38b2ac;
            font-weight: bold;
            margin-right: 10px;
        }
        
        .email-footer {
            background: #2d3748;
            color: #cbd5e0;
            padding: 30px;
            text-align: center;
            font-size: 14px;
        }
        
        .footer-links {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin: 20px 0;
        }
        
        .footer-links a {
            color: #90cdf4;
            text-decoration: none;
        }
        
        .footer-links a:hover {
            text-decoration: underline;
        }
        
        .social-icons {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-top: 20px;
        }
        
        .social-icon {
            width: 36px;
            height: 36px;
            background: #4a5568;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            text-decoration: none;
            transition: all 0.3s ease;
        }
        
        .social-icon:hover {
            transform: translateY(-3px);
            background: #667eea;
        }
        
        @media (max-width: 600px) {
            .email-container {
                margin: 10px;
                border-radius: 15px;
            }
            
            .email-header {
                padding: 30px 20px;
            }
            
            .email-body {
                padding: 30px 20px;
            }
            
            .info-grid {
                grid-template-columns: 1fr;
            }
            
            .pago-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
    """

    # Símbolos de moneda
    simbolos = {
        "COP": {"simbolo": "$", "nombre": "COP"},
        "USD": {"simbolo": "US$", "nombre": "USD"},
        "MXN": {"simbolo": "MX$", "nombre": "MXN"},
        "EUR": {"simbolo": "€", "nombre": "EUR"}
    }
    moneda_info = simbolos.get(moneda_sede, {"simbolo": "$", "nombre": "COP"})
    
    # Determinar clase CSS para estado de pago
    estado_pago_class = {
        "pagado": "estado-pagado",
        "abonado": "estado-abonado",
        "pendiente": "estado-pendiente"
    }.get(estado_pago, "estado-pendiente")

    # Crear lista de nombres de servicios para el email
    nombres_servicios = [s["nombre"] for s in servicios_info]
    nombres_concatenados = ", ".join(nombres_servicios)

    mensaje_html = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirmación de Cita - Rizos Felices</title>
        {estilo}
    </head>
    <body>
        <div class="email-container">
            <div class="email-header">
                <img class="logo" src="https://rizosfelicesdata.s3.us-east-2.amazonaws.com/logo+principal+rosado+letra+blanco_Mesa+de+tra+(1).png" alt="Rizos Felices">
                <h1 class="header-title">¡Cita Confirmada!</h1>
                <p class="header-subtitle">Tu reserva ha sido agendada exitosamente</p>
                <div class="cita-id">ID de cita: {cita_id[:8].upper()}</div>
            </div>
            
            <div class="email-body">
                <div class="section-title">
                    <span>📅 Detalles de la cita</span>
                </div>
                
                <div class="info-grid">
                    <div class="info-card">
                        <div class="info-label">Cliente</div>
                        <div class="info-value">{cliente.get('nombre')}</div>
                    </div>
                    
                    <div class="info-card">
                        <div class="info-label">Servicio(s)</div>
                        <div class="info-value">{nombres_concatenados}</div>
                        <small>{duracion_total} minutos</small>
                    </div>
                    
                    <div class="info-card">
                        <div class="info-label">Profesional</div>
                        <div class="info-value">{profesional.get('nombre')}</div>
                    </div>
                    
                    <div class="info-card">
                        <div class="info-label">Sede</div>
                        <div class="info-value">{sede.get('nombre')}</div>
                        <small>{sede.get('direccion', '')}</small>
                    </div>
                    
                    <div class="info-card">
                        <div class="info-label">Fecha</div>
                        <div class="info-value">{fecha_str}</div>
                    </div>
                    
                    <div class="info-card">
                        <div class="info-label">Horario</div>
                        <div class="info-value">{cita.hora_inicio} - {cita.hora_fin}</div>
                    </div>
                </div>
                
                <div class="section-title">
                    <span>💰 Información de pago</span>
                </div>
                
                <div class="pago-section">
                    <div class="pago-grid">
                        <div class="pago-item">
                            <span>Precio total:</span>
                            <span><strong>{moneda_info['simbolo']}{valor_total:,.2f} {moneda_info['nombre']}</strong></span>
                        </div>
                        
                        <div class="pago-item">
                            <span>Abono realizado:</span>
                            <span>{moneda_info['simbolo']}{abono:,.2f}</span>
                        </div>
                        
                        <div class="pago-item">
                            <span>Saldo pendiente:</span>
                            <span>{moneda_info['simbolo']}{saldo_pendiente:,.2f}</span>
                        </div>
                        
                        <div class="pago-item total">
                            <span>Estado:</span>
                            <span>
                                <span class="estado-pago {estado_pago_class}">
                                    {estado_pago.upper()}
                                </span>
                            </span>
                        </div>
                    </div>
                    
                    {f'<p style="margin-top: 15px; font-size: 14px; color: #4a5568;">Saldo pendiente por pagar al momento del servicio.</p>' if saldo_pendiente > 0 else ''}
                </div>
                
                <div class="instrucciones">
                    <div class="instrucciones-title">
                        <span>📋 Recomendaciones importantes</span>
                    </div>
                    <ul class="instrucciones-list">
                        <li>Llega 10 minutos antes de tu cita</li>
                        <li>Trae tu identificación para confirmar la reserva</li>
                        <li>Notifica cualquier cancelación con al menos 24 horas de anticipación</li>
                        <li>Usa mascarilla si lo consideras necesario</li>
                        <li>Consulta nuestras políticas en nuestro sitio web</li>
                    </ul>
                </div>
                
                <div style="margin-top: 30px; padding: 20px; background: #fff7ed; border-radius: 12px; border-left: 4px solid #ed8936;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <span style="font-size: 16px; font-weight: 600; color: #9c4221;">📞 ¿Necesitas ayuda?</span>
                    </div>
                    <p style="color: #744210; margin-bottom: 5px;">
                        <strong>{sede.get('nombre')}:</strong> {sede.get('telefono', 'No disponible')}
                    </p>
                    <p style="color: #744210; font-size: 14px;">
                        Horario de atención: {dia_info['hora_inicio']} - {dia_info['hora_fin']}
                    </p>
                </div>
            </div>
            
            <div class="email-footer">
                <p>© {datetime.now().year} Rizos Felices. Todos los derechos reservados.</p>
                <div class="footer-links">
                    <a href="#">Políticas de privacidad</a>
                    <a href="#">Términos de servicio</a>
                    <a href="#">Contacto</a>
                </div>
                <div class="social-icons">
                    <a href="#" class="social-icon">FB</a>
                    <a href="#" class="social-icon">IG</a>
                    <a href="#" class="social-icon">TW</a>
                    <a href="#" class="social-icon">WA</a>
                </div>
                <p style="margin-top: 20px; font-size: 12px; opacity: 0.7;">
                    Este es un correo automático, por favor no responder.
                </p>
            </div>
        </div>
    </body>
    </html>
    """

    # === enviar emails ===
    cliente_email = cliente.get("email") or cliente.get("correo")
    if cliente_email:
        try:
            enviar_correo(
                cliente_email, 
                f"✅ Confirmación de cita - {fecha_str} {cita.hora_inicio}", 
                mensaje_html
            )
            print(f"📧 Email enviado a cliente: {cliente_email}")
        except Exception as e:
            print(f"⚠️ Error enviando email al cliente: {e}")

    # Enviar al profesional si tiene email
    try:
        prof_email = profesional.get("email")
        if prof_email:
            # Modificar ligeramente el email para el profesional
            prof_subject = f"📅 Nueva cita asignada - {fecha_str} {cita.hora_inicio} - {cliente.get('nombre')}"
            enviar_correo(prof_email, prof_subject, mensaje_html)
            print(f"📧 Email enviado a profesional: {prof_email}")
    except Exception as e:
        print(f"⚠️ Error enviando email al profesional: {e}")

    # También enviar a admin de sede si es diferente del creador
    try:
        admin_sede_email = sede.get("email_contacto")
        if admin_sede_email and admin_sede_email != current_user.get("email"):
            admin_subject = f"📋 Nueva cita registrada - {fecha_str} - {cliente.get('nombre')}"
            enviar_correo(admin_sede_email, admin_subject, mensaje_html)
    except Exception as e:
        print(f"⚠️ Error enviando email a admin sede: {e}")

    # ═══════════════════════════════════════════════
    # ⭐ INTEGRACIÓN GIFTCARD - Reservar saldo
    # Si el método de pago inicial es giftcard, reservar saldo.
    # ⭐ Soporta pago parcial: si la giftcard no cubre el abono
    # completo, usa lo que tiene y el resto queda en saldo_pendiente.
    # ═══════════════════════════════════════════════
    codigo_giftcard = getattr(cita, 'codigo_giftcard', None)

    if cita.metodo_pago_inicial == "giftcard" and codigo_giftcard and abono > 0:
        try:
            from app.database.mongo import collection_giftcards
            from app.giftcards.routes_giftcards import _estado_giftcard

            codigo_upper = codigo_giftcard.upper().strip()
            gc_doc = await collection_giftcards.find_one({"codigo": codigo_upper})

            if not gc_doc:
                await collection_citas.delete_one({"_id": result.inserted_id})
                raise HTTPException(
                    status_code=404,
                    detail=f"Giftcard '{codigo_upper}' no encontrada"
                )

            estado_gc = _estado_giftcard(gc_doc)
            if estado_gc in ["cancelada", "vencida", "usada"]:
                await collection_citas.delete_one({"_id": result.inserted_id})
                raise HTTPException(
                    status_code=400,
                    detail=f"Giftcard no válida: estado '{estado_gc}'"
                )

            saldo_gc = round(float(gc_doc.get("saldo_disponible", 0)), 2)

            if saldo_gc <= 0:
                await collection_citas.delete_one({"_id": result.inserted_id})
                raise HTTPException(
                    status_code=400,
                    detail="La giftcard no tiene saldo disponible"
                )

            # ⭐ Pago parcial: usar lo que alcance, el resto queda en saldo_pendiente.
            # El cajero completará la diferencia con otro método después.
            abono_real_gc = round(min(abono, saldo_gc), 2)
            abono_restante = round(abono - abono_real_gc, 2)

            nuevo_disponible = round(saldo_gc - abono_real_gc, 2)
            nuevo_reservado = round(float(gc_doc.get("saldo_reservado", 0)) + abono_real_gc, 2)

            movimiento_gc = {
                "tipo": "reserva",
                "cita_id": cita_id,
                "concepto": "abono_inicial",
                "monto": abono_real_gc,
                "fecha": datetime.now(),
                "registrado_por": current_user.get("email"),
                "saldo_disponible_antes": saldo_gc,
                "saldo_disponible_despues": nuevo_disponible,
                **({"monto_restante_otro_metodo": abono_restante} if abono_restante > 0 else {})
            }

            await collection_giftcards.update_one(
                {"codigo": codigo_upper},
                {
                    "$set": {
                        "saldo_disponible": nuevo_disponible,
                        "saldo_reservado": nuevo_reservado,
                    },
                    "$push": {"historial": movimiento_gc}
                }
            )

            # Si la giftcard solo cubrió parcialmente el abono,
            # recalcular saldo_pendiente con el abono real
            if abono_real_gc < abono:
                saldo_pendiente = round(valor_total - abono_real_gc, 2)
                if saldo_pendiente <= 0:
                    estado_pago = "pagado"
                elif abono_real_gc > 0:
                    estado_pago = "abonado"

                # Actualizar el historial_pagos con el monto real
                historial_pagos[0]["monto"] = abono_real_gc
                historial_pagos[0]["saldo_despues"] = saldo_pendiente

                await collection_citas.update_one(
                    {"_id": result.inserted_id},
                    {"$set": {
                        "codigo_giftcard": codigo_upper,
                        "abono": abono_real_gc,
                        "saldo_pendiente": saldo_pendiente,
                        "estado_pago": estado_pago,
                        "historial_pagos": historial_pagos,
                    }}
                )
                print(f"🎁 Giftcard {codigo_upper}: cubrió {abono_real_gc}, "
                      f"restante {abono_restante} queda en saldo_pendiente")
            else:
                # La giftcard cubrió todo el abono, solo guardar el código
                await collection_citas.update_one(
                    {"_id": result.inserted_id},
                    {"$set": {"codigo_giftcard": codigo_upper}}
                )
                print(f"🎁 Giftcard {codigo_upper}: reservados {abono_real_gc} {gc_doc.get('moneda')}")

        except HTTPException:
            # Re-lanzar los errores que generamos arriba
            # (la cita ya fue eliminada dentro de cada if antes del raise)
            raise
        except Exception as e:
            await collection_citas.delete_one({"_id": result.inserted_id})
            raise HTTPException(
                status_code=500,
                detail=f"Error reservando giftcard: {str(e)}"
            )

    return {
        "success": True, 
        "message": "Cita creada exitosamente", 
        "cita_id": cita_id,
        "data": {
            "cita_id": cita_id,
            "cliente": cliente.get("nombre"),
            "servicios": nombres_servicios,
            "profesional": profesional.get("nombre"),
            "fecha": fecha_str,
            "horario": f"{cita.hora_inicio} - {cita.hora_fin}",
            "duracion_total": duracion_total,
            "valor_total": valor_total,
            "estado_pago": estado_pago,
            "saldo_pendiente": saldo_pendiente,
            "moneda": moneda_sede
        }
    }

# =============================================================
# 🔹 EDITAR CITA (MEJORADA)
# =============================================================
@router.put("/{cita_id}", response_model=dict)
async def editar_cita(
    cita_id: str,
    cambios: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Edita una cita.
    ✅ Soporta edición de servicios, productos y horario
    ✅ Recalcula totales automáticamente
    ✅ Valida disponibilidad y conflictos de agenda
    """
    if current_user.get("rol") not in ["admin_sede", "super_admin"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    cita_actual = await resolve_cita_by_id(cita_id)
    if not cita_actual:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    cita_object_id = cita_actual.get("_id")
    if not cita_object_id:
        raise HTTPException(status_code=500, detail="La cita no tiene _id válido")

    def _hora_a_minutos(hora_str: str) -> int:
        hora_obj = time.fromisoformat(hora_str)
        return (hora_obj.hour * 60) + hora_obj.minute

    def _minutos_a_hora(total_min: int) -> str:
        horas = total_min // 60
        minutos = total_min % 60
        return f"{str(horas).zfill(2)}:{str(minutos).zfill(2)}"

    def _sumar_minutos_hora(hora_str: str, minutos: int) -> str:
        inicio = _hora_a_minutos(hora_str)
        return _minutos_a_hora(inicio + max(0, minutos))

    def _normalizar_fecha(fecha_valor) -> str:
        if isinstance(fecha_valor, datetime):
            return fecha_valor.strftime("%Y-%m-%d")
        fecha_texto = str(fecha_valor)
        try:
            return datetime.strptime(fecha_texto[:10], "%Y-%m-%d").strftime("%Y-%m-%d")
        except Exception:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")

    def _total_productos_desde_lista(productos_lista: list) -> float:
        total = 0.0
        for p in productos_lista or []:
            cantidad = int(p.get("cantidad", 1) or 1)
            precio_unitario = float(p.get("precio_unitario", p.get("precio", 0)) or 0)
            subtotal = float(p.get("subtotal", precio_unitario * cantidad) or 0)
            total += subtotal
        return round(total, 2)

    estado_actual = str(cita_actual.get("estado", "")).strip().lower()
    estados_no_editables = {"cancelada", "completada", "finalizada", "no asistio", "no_asistio"}
    campos_edicion_cita = {"servicios", "productos", "fecha", "hora_inicio", "hora_fin", "profesional_id"}
    solicita_edicion = any(campo in cambios for campo in campos_edicion_cita)

    if solicita_edicion and estado_actual in estados_no_editables:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede editar la cita cuando está en estado '{cita_actual.get('estado')}'"
        )

    sede = await collection_locales.find_one({"sede_id": cita_actual.get("sede_id")})
    if not sede:
        raise HTTPException(status_code=404, detail="Sede de la cita no encontrada")

    moneda_sede = sede.get("moneda", "COP")

    # ====================================
    # ⭐ SERVICIOS
    # ====================================
    valor_servicios = round(
        float(cita_actual.get("valor_total", 0) or 0) - _total_productos_desde_lista(cita_actual.get("productos", [])),
        2
    )
    valor_servicios = max(0, valor_servicios)
    duracion_total = int(cita_actual.get("servicio_duracion", 0) or 0)
    if duracion_total <= 0:
        try:
            duracion_total = max(
                0,
                _hora_a_minutos(str(cita_actual.get("hora_fin", "00:00"))) -
                _hora_a_minutos(str(cita_actual.get("hora_inicio", "00:00")))
            )
        except Exception:
            duracion_total = 0

    if "servicios" in cambios:
        if not isinstance(cambios["servicios"], list) or len(cambios["servicios"]) == 0:
            raise HTTPException(status_code=400, detail="Debe enviar al menos un servicio")

        servicios_procesados = []
        servicios_ids_vistos = set()
        valor_servicios = 0.0
        duracion_total = 0
        nombres_servicios = []

        for servicio_item in cambios["servicios"]:
            if not isinstance(servicio_item, dict):
                raise HTTPException(status_code=400, detail="Formato inválido en servicios")

            servicio_id = servicio_item.get("servicio_id")
            if not servicio_id:
                raise HTTPException(status_code=400, detail="Cada servicio debe incluir servicio_id")

            if servicio_id in servicios_ids_vistos:
                raise HTTPException(status_code=400, detail=f"Servicio duplicado en la cita: {servicio_id}")
            servicios_ids_vistos.add(servicio_id)

            cantidad_raw = servicio_item.get("cantidad", 1)
            try:
                cantidad = int(cantidad_raw)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"Cantidad inválida para servicio {servicio_id}")

            if cantidad < 1:
                raise HTTPException(status_code=400, detail="La cantidad debe ser mayor o igual a 1")

            servicio_db = await collection_servicios.find_one({"servicio_id": servicio_id})
            if not servicio_db:
                raise HTTPException(status_code=404, detail=f"Servicio {servicio_id} no encontrado")

            precios = servicio_db.get("precios", {})
            if moneda_sede not in precios:
                raise HTTPException(status_code=400, detail=f"Servicio sin precio en {moneda_sede}")
            precio_base_sede = float(precios[moneda_sede])

            precio_manual = servicio_item.get("precio")
            precio_personalizado = servicio_item.get("precio_personalizado")
            precio = None

            if precio_manual is not None:
                try:
                    precio_manual_float = float(precio_manual)
                except (TypeError, ValueError):
                    raise HTTPException(status_code=400, detail=f"Precio inválido para servicio {servicio_id}")
                if precio_manual_float > 0:
                    precio = precio_manual_float

            if precio is None and precio_personalizado is not None:
                try:
                    precio_personalizado_float = float(precio_personalizado)
                except (TypeError, ValueError):
                    raise HTTPException(status_code=400, detail=f"Precio personalizado inválido para servicio {servicio_id}")
                if precio_personalizado_float > 0:
                    precio = precio_personalizado_float

            if precio is None:
                precio = precio_base_sede

            es_personalizado = round(precio, 2) != round(precio_base_sede, 2)

            subtotal = round(precio * cantidad, 2)
            duracion_servicio = int(servicio_db.get("duracion_minutos", 0) or 0)
            nombre_servicio = servicio_db.get("nombre", "Servicio")

            valor_servicios += subtotal
            duracion_total += duracion_servicio * cantidad
            nombres_servicios.append(f"{nombre_servicio} x{cantidad}" if cantidad > 1 else nombre_servicio)

            servicios_procesados.append({
                "servicio_id": servicio_id,
                "nombre": nombre_servicio,
                "precio_personalizado": es_personalizado,
                "precio": round(precio, 2),
                "cantidad": cantidad,
                "subtotal": subtotal
            })

        cambios["servicios"] = servicios_procesados
        cambios["servicio_nombre"] = ", ".join(nombres_servicios) if nombres_servicios else "Sin servicio"
        cambios["servicio_duracion"] = duracion_total
        valor_servicios = round(valor_servicios, 2)

    # ====================================
    # ⭐ PRODUCTOS
    # ====================================
    productos_finales = cita_actual.get("productos", [])
    total_productos = _total_productos_desde_lista(productos_finales)

    if "productos" in cambios:
        if not isinstance(cambios["productos"], list):
            raise HTTPException(status_code=400, detail="Formato inválido en productos")

        productos_procesados = []
        productos_ids_vistos = set()
        total_productos = 0.0
        profesional_para_producto = cambios.get("profesional_id", cita_actual.get("profesional_id"))

        for producto_item in cambios["productos"]:
            if not isinstance(producto_item, dict):
                raise HTTPException(status_code=400, detail="Formato inválido en productos")

            producto_id = str(producto_item.get("producto_id", "")).strip()
            if not producto_id:
                raise HTTPException(status_code=400, detail="Cada producto debe incluir producto_id")

            if producto_id in productos_ids_vistos:
                raise HTTPException(status_code=400, detail=f"Producto duplicado en la cita: {producto_id}")
            productos_ids_vistos.add(producto_id)

            cantidad_raw = producto_item.get("cantidad", 1)
            try:
                cantidad = int(cantidad_raw)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"Cantidad inválida para producto {producto_id}")

            if cantidad < 1:
                raise HTTPException(status_code=400, detail="La cantidad de producto debe ser mayor o igual a 1")

            producto_db = await collection_products.find_one({"id": producto_id})
            if not producto_db:
                try:
                    producto_db = await collection_products.find_one({"_id": ObjectId(producto_id)})
                except Exception:
                    producto_db = None
            if not producto_db:
                raise HTTPException(status_code=404, detail=f"Producto {producto_id} no encontrado")

            precio_manual = producto_item.get("precio", producto_item.get("precio_unitario"))
            precio_unitario = None

            if precio_manual is not None:
                try:
                    precio_manual_float = float(precio_manual)
                except (TypeError, ValueError):
                    raise HTTPException(status_code=400, detail=f"Precio inválido para producto {producto_id}")
                if precio_manual_float > 0:
                    precio_unitario = precio_manual_float

            if precio_unitario is None:
                precios_producto = producto_db.get("precios", {})
                if moneda_sede not in precios_producto:
                    raise HTTPException(
                        status_code=400,
                        detail=f"El producto '{producto_db.get('nombre', producto_id)}' no tiene precio en {moneda_sede}"
                    )
                precio_unitario = float(precios_producto[moneda_sede])

            subtotal = round(precio_unitario * cantidad, 2)
            comision_porcentaje = float(producto_db.get("comision", 0) or 0)
            comision_valor = round((subtotal * comision_porcentaje) / 100, 2)

            productos_procesados.append({
                "producto_id": producto_id,
                "nombre": producto_db.get("nombre", "Producto"),
                "cantidad": cantidad,
                "precio_unitario": round(precio_unitario, 2),
                "subtotal": subtotal,
                "moneda": moneda_sede,
                "comision_porcentaje": comision_porcentaje,
                "comision_valor": comision_valor,
                "agregado_por_email": current_user.get("email"),
                "agregado_por_rol": current_user.get("rol"),
                "fecha_agregado": datetime.now(),
                "profesional_id": profesional_para_producto
            })

            total_productos += subtotal

        total_productos = round(total_productos, 2)
        productos_finales = productos_procesados
        cambios["productos"] = productos_procesados

    # ====================================
    # ⭐ FECHA/HORA/PROFESIONAL
    # ====================================
    fecha_final = _normalizar_fecha(cambios.get("fecha", cita_actual.get("fecha")))
    hora_inicio_final = str(cambios.get("hora_inicio", cita_actual.get("hora_inicio")))
    profesional_id_final = str(cambios.get("profesional_id", cita_actual.get("profesional_id")))
    hora_fin_final = str(cambios.get("hora_fin", cita_actual.get("hora_fin")))

    if "servicios" in cambios or "hora_inicio" in cambios:
        hora_fin_final = _sumar_minutos_hora(hora_inicio_final, duracion_total)
        cambios["hora_fin"] = hora_fin_final

    if "fecha" in cambios:
        cambios["fecha"] = fecha_final
    if "hora_inicio" in cambios:
        cambios["hora_inicio"] = hora_inicio_final
    if "profesional_id" in cambios:
        cambios["profesional_id"] = profesional_id_final

    if "profesional_id" in cambios:
        profesional_db = await collection_estilista.find_one({"profesional_id": profesional_id_final})
        if not profesional_db:
            raise HTTPException(status_code=404, detail="Profesional no encontrado")
        cambios["profesional_nombre"] = profesional_db.get("nombre")

    # Validar disponibilidad y conflictos si cambia agenda
    if any(campo in cambios for campo in {"fecha", "hora_inicio", "hora_fin", "profesional_id", "servicios"}):
        try:
            fecha_dt = datetime.strptime(fecha_final, "%Y-%m-%d")
            hora_inicio_obj = time.fromisoformat(hora_inicio_final)
            hora_fin_obj = time.fromisoformat(hora_fin_final)
        except Exception:
            raise HTTPException(status_code=400, detail="Fecha u hora inválida")

        if not hora_inicio_obj < hora_fin_obj:
            raise HTTPException(status_code=400, detail="La hora de fin debe ser mayor a la hora de inicio")

        dia_semana = fecha_dt.isoweekday()
        horario = await collection_horarios.find_one({"profesional_id": profesional_id_final})
        if not horario:
            raise HTTPException(status_code=400, detail="El profesional no tiene horario configurado")

        dia_info = next(
            (
                d for d in horario.get("disponibilidad", [])
                if int(d.get("dia_semana", 0)) == dia_semana and d.get("activo", True) is True
            ),
            None
        )
        if not dia_info:
            raise HTTPException(status_code=400, detail="El profesional no tiene disponibilidad para esa fecha")

        hora_inicio_horario = time.fromisoformat(dia_info.get("hora_inicio"))
        hora_fin_horario = time.fromisoformat(dia_info.get("hora_fin"))

        if not (
            hora_inicio_horario <= hora_inicio_obj < hora_fin_horario and
            hora_inicio_horario < hora_fin_obj <= hora_fin_horario
        ):
            raise HTTPException(status_code=400, detail="La cita está fuera del horario laboral del profesional")

        bloqueo = await collection_block.find_one({
            "profesional_id": profesional_id_final,
            "fecha": fecha_final,
            "hora_inicio": {"$lt": hora_fin_final},
            "hora_fin": {"$gt": hora_inicio_final}
        })
        if bloqueo:
            raise HTTPException(
                status_code=400,
                detail=f"El profesional tiene un bloqueo en ese horario (Motivo: {bloqueo.get('motivo', 'No especificado')})"
            )

        solape = await collection_citas.find_one({
            "_id": {"$ne": cita_object_id},
            "profesional_id": profesional_id_final,
            "fecha": fecha_final,
            "hora_inicio": {"$lt": hora_fin_final},
            "hora_fin": {"$gt": hora_inicio_final},
            "estado": {"$nin": ["cancelada", "no asistio", "no_asistio"]}
        })
        if solape:
            cliente_solape = solape.get("cliente_nombre", "otro cliente")
            raise HTTPException(
                status_code=400,
                detail=f"El profesional ya tiene una cita con {cliente_solape} en ese horario"
            )

    # ====================================
    # ⭐ RECÁLCULO DE TOTALES
    # ====================================
    nuevo_valor_total = round(valor_servicios + total_productos, 2)
    cambios["valor_total"] = nuevo_valor_total

    abono_actual = float(cambios.get("abono", cita_actual.get("abono", 0)) or 0)
    nuevo_saldo = round(nuevo_valor_total - abono_actual, 2)
    cambios["saldo_pendiente"] = nuevo_saldo

    if nuevo_saldo <= 0:
        cambios["estado_pago"] = "pagado"
    elif abono_actual > 0:
        cambios["estado_pago"] = "abonado"
    else:
        cambios["estado_pago"] = "pendiente"

    # ====================================
    # ⭐ Actualizar timestamp
    # ====================================
    cambios["ultima_actualizacion"] = datetime.now()

    # ====================================
    # Ejecutar actualización
    # ====================================
    result = await collection_citas.update_one(
        {"_id": cita_object_id},
        {"$set": cambios}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    # Obtener cita actualizada
    cita_actualizada = await collection_citas.find_one({"_id": cita_object_id})
    normalize_cita_doc(cita_actualizada)
    
    return {"success": True, "cita": cita_actualizada}

# =============================================================
# 🔹 CANCELAR CITA
# =============================================================
@router.post("/{cita_id}/cancelar", response_model=dict)
async def cancelar_cita(cita_id: str, current_user: dict = Depends(get_current_user)):
    cita = await resolve_cita_by_id(cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    if current_user.get("rol") == "usuario":
        if cita.get("cliente_id") != current_user.get("user_id") and cita.get("cliente_id") != current_user.get("cliente_id"):
            raise HTTPException(status_code=403, detail="Solo puedes cancelar tus propias citas")

    await collection_citas.update_one({"_id": ObjectId(cita["_id"])}, {"$set": {
        "estado": "cancelada",
        "fecha_cancelacion": datetime.now(),
        "cancelada_por": current_user.get("email")
    }})

    # ═══════════════════════════════════════════════
    # ⭐ INTEGRACIÓN GIFTCARD - Liberar saldo reservado
    # ═══════════════════════════════════════════════
    codigo_giftcard = cita.get("codigo_giftcard")
    if codigo_giftcard:
        try:
            from app.database.mongo import collection_giftcards
            
            gc_doc = await collection_giftcards.find_one({"codigo": codigo_giftcard})
            if gc_doc:
                historial = gc_doc.get("historial", [])
                reserva = next(
                    (m for m in historial
                     if m.get("cita_id") == str(cita["_id"]) and m.get("tipo") == "reserva"),
                    None
                )
                if reserva:
                    monto_liberar = round(float(reserva.get("monto", 0)), 2)
                    nuevo_disponible = round(float(gc_doc.get("saldo_disponible", 0)) + monto_liberar, 2)
                    nuevo_reservado = max(0.0, round(float(gc_doc.get("saldo_reservado", 0)) - monto_liberar, 2))
                    
                    movimiento_liberacion = {
                        "tipo": "liberacion",
                        "cita_id": str(cita["_id"]),
                        "monto": monto_liberar,
                        "fecha": datetime.now(),
                        "registrado_por": current_user.get("email"),
                        "motivo": "cita_cancelada"
                    }
                    
                    await collection_giftcards.update_one(
                        {"codigo": codigo_giftcard},
                        {
                            "$set": {
                                "saldo_disponible": nuevo_disponible,
                                "saldo_reservado": nuevo_reservado,
                            },
                            "$push": {"historial": movimiento_liberacion}
                        }
                    )
                    print(f"🎁 Giftcard {codigo_giftcard}: liberados {monto_liberar}")
        except Exception as e:
            print(f"⚠️ Error liberando giftcard al cancelar: {e}")

    return {"success": True, "mensaje": "Cita cancelada", "cita_id": cita_id}

# =============================================================
# 🔹 CONFIRMAR CITA
# =============================================================
@router.post("/{cita_id}/confirmar", response_model=dict)
async def confirmar_cita(cita_id: str, current_user: dict = Depends(get_current_user)):
    cita = await resolve_cita_by_id(cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    await collection_citas.update_one({"_id": ObjectId(cita["_id"])}, {"$set": {
        "estado": "confirmada",
        "confirmada_por": current_user.get("email"),
        "fecha_confirmacion": datetime.now()
    }})

    return {"success": True, "mensaje": "Cita confirmada", "cita_id": cita_id}

SIMBOLOS_MONEDA = {
    "COP": "$",
    "USD": "USD ",
    "MXN": "MXN ",
}

def fmt(valor: float, moneda: str = "") -> str:
    """3800.0 → '3800', 38600.5 → '38600.5', con símbolo si se pasa moneda."""
    n = int(valor) if valor == int(valor) else valor
    simbolo = SIMBOLOS_MONEDA.get(moneda, "")
    return f"{simbolo}{n}"

def num(valor: float) -> int | float:
    """Devuelve int si es entero, float si tiene decimales reales."""
    return int(valor) if valor == int(valor) else valor

# =============================================================
# 🔹 ACTUALIZAR PAGO DE LA CITA
# =============================================================
@router.post("/citas/{cita_id}/pago")
async def registrar_pago(
    cita_id: str,
    data: PagoRequest,
    current_user: dict = Depends(get_current_user)
):
    cita = await collection_citas.find_one({"_id": ObjectId(cita_id)})
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    if cita.get("estado_factura") == "facturado":
        raise HTTPException(status_code=400, detail="La cita ya fue facturada")

    moneda = cita.get("moneda", "COP")

    # Fuente de verdad: saldo_pendiente
    saldo_pendiente_actual = round(float(cita.get("saldo_pendiente", 0)), 2)

    if saldo_pendiente_actual <= 0:
        raise HTTPException(status_code=400, detail="La cita no tiene saldo pendiente")

    monto_solicitado = round(float(data.monto), 2)
    if monto_solicitado <= 0:
        raise HTTPException(status_code=400, detail="Monto inválido")

    if monto_solicitado > saldo_pendiente_actual:
        raise HTTPException(
            status_code=400,
            detail=f"El monto ({fmt(monto_solicitado, moneda)}) excede el saldo pendiente ({fmt(saldo_pendiente_actual, moneda)})"
        )

    # ═══════════════════════════════════════════════════════════════
    # ⭐ INTEGRACIÓN GIFTCARD — va PRIMERO para saber el monto real
    # ═══════════════════════════════════════════════════════════════
    monto_real = monto_solicitado
    codigo_giftcard_usado = None

    if data.metodo_pago == "giftcard":
        if not data.codigo_giftcard:
            raise HTTPException(
                status_code=400,
                detail="Debe enviar codigo_giftcard cuando el método de pago es 'giftcard'"
            )

        from app.database.mongo import collection_giftcards
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
        nuevo_reservado_gc = round(float(gc_doc.get("saldo_reservado", 0)) + monto_real, 2)

        movimiento_gc = {
            "tipo": "reserva",
            "cita_id": cita_id,
            "concepto": "pago_adicional",
            "monto": num(monto_real),
            "fecha": datetime.now(),
            "registrado_por": current_user.get("email"),
            "saldo_disponible_antes": num(saldo_gc),
            "saldo_disponible_despues": num(nuevo_disponible_gc),
        }

        await collection_giftcards.update_one(
            {"codigo": codigo_gc},
            {
                "$set": {
                    "saldo_disponible": num(nuevo_disponible_gc),
                    "saldo_reservado": num(nuevo_reservado_gc),
                },
                "$push": {"historial": movimiento_gc}
            }
        )

        codigo_giftcard_usado = codigo_gc
        print(f"🎁 Giftcard {codigo_gc}: reservados {fmt(monto_real, moneda)}")
    # ══ fin giftcard ══

    nuevo_saldo_pendiente = round(saldo_pendiente_actual - monto_real, 2)
    nuevo_abono = round(float(cita.get("abono", 0) or 0) + monto_real, 2)
    estado_pago = "pagado" if nuevo_saldo_pendiente <= 0 else "abonado"

    nuevo_pago = {
        "fecha": datetime.now(),
        "monto": num(monto_real),
        "metodo": data.metodo_pago,
        "tipo": "pago_adicional",
        "registrado_por": current_user.get("email"),
        "saldo_despues": num(nuevo_saldo_pendiente),
        "notas": data.notas,
        **({"codigo_giftcard": codigo_giftcard_usado} if codigo_giftcard_usado else {})
    }

    update_set = {
        "abono": num(nuevo_abono),
        "saldo_pendiente": num(nuevo_saldo_pendiente),
        "estado_pago": estado_pago,
        "metodo_pago_actual": data.metodo_pago,
        "ultima_actualizacion": datetime.now()
    }
    if codigo_giftcard_usado and not cita.get("codigo_giftcard"):
        update_set["codigo_giftcard"] = codigo_giftcard_usado

    await collection_citas.update_one(
        {"_id": ObjectId(cita_id)},
        {"$set": update_set, "$push": {"historial_pagos": nuevo_pago}}
    )

    respuesta = {
        "success": True,
        "abono": num(nuevo_abono),
        "saldo_pendiente": num(nuevo_saldo_pendiente),
        "estado_pago": estado_pago,
        "metodo_pago_usado": data.metodo_pago,
        "moneda": moneda,
        "giftcard_reservada": bool(codigo_giftcard_usado),
        "mensaje": f"Pago de {fmt(monto_real, moneda)} registrado vía {data.metodo_pago}"
    }

    if codigo_giftcard_usado and monto_real < monto_solicitado:
        faltante = round(monto_solicitado - monto_real, 2)
        respuesta["giftcard_info"] = {
            "monto_cubierto": num(monto_real),
            "monto_pendiente": num(faltante),
            "aviso": f"La giftcard cubrió {fmt(monto_real, moneda)}. Quedan {fmt(faltante, moneda)} en saldo pendiente."
        }

    return respuesta

# =============================================================
# 🔹 MOSTRAR PAGO ACTUALIZADO
# =============================================================
@router.get("/citas/{cita_id}/pago")
async def obtener_estado_pago(cita_id: str):
    cita = await collection_citas.find_one(
        {"_id": ObjectId(cita_id)},
        {
            "abono": 1,
            "valor_total": 1,
            "saldo_pendiente": 1,
            "estado_pago": 1,
            "moneda": 1,
            "metodo_pago": 1 
        }
    )

    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    return {
        "abono": cita.get("abono", 0),
        "valor_total": cita["valor_total"],
        "saldo_pendiente": cita["saldo_pendiente"],
        "estado_pago": cita["estado_pago"],
        "moneda": cita.get("moneda", "USD"),
        "metodo_pago": cita.get("metodo_pago") 
    }

# =============================================================
# 🔹 MARCAR COMPLETADA (solo cuando se factura - ver routes_quotes)
# =============================================================
@router.post("/{cita_id}/completar", response_model=dict)
async def completar_cita(cita_id: str, current_user: dict = Depends(get_current_user)):
    """
    ⚠️ DEPRECADO: Usar el endpoint de facturación en routes_quotes.py
    Este endpoint se mantiene por compatibilidad pero no genera comisiones.
    """
    cita = await resolve_cita_by_id(cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    await collection_citas.update_one({"_id": ObjectId(cita["_id"])}, {"$set": {
        "estado": "completada",
        "completada_por": current_user.get("email"),
        "fecha_completada": datetime.now()
    }})

    return {"success": True, "mensaje": "Cita completada", "cita_id": cita_id}

# =============================================================
# 🔹 MARCAR NO ASISTIÓ
# =============================================================
@router.post("/{cita_id}/no-asistio", response_model=dict)
async def no_asistio(cita_id: str, current_user: dict = Depends(get_current_user)):
    cita = await resolve_cita_by_id(cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    await collection_citas.update_one({"_id": ObjectId(cita["_id"])}, {"$set": {
        "estado": "no_asistio",
        "marcada_no_asistio_por": current_user.get("email"),
        "fecha_no_asistio": datetime.now()
    }})

    return {"success": True, "mensaje": "Marcada como no asistió", "cita_id": cita_id}

# ... (resto de endpoints sin cambios: fichas, estilista, productos, etc.)
# Los mantengo igual porque no necesitan modificaciones para monedas


# =============================================================
# 🔹 OBTENER FICHAS POR CLIENTE (con filtros inteligentes)
# ⭐ ACTUALIZADO PARA SOPORTAR MÚLTIPLES SERVICIOS
# =============================================================
@router.get("/fichas", response_model=dict)
async def obtener_fichas_por_cliente(
    cliente_id: str = Query(...),
    cita_id: str = Query(None, description="Filtrar por cita específica (para facturación)"),
    fecha: str = Query(None, description="Filtrar por fecha (YYYY-MM-DD)"),
    solo_hoy: bool = Query(False, description="Solo fichas de hoy"),
    limit: int = Query(10, description="Límite de resultados"),
    current_user: dict = Depends(get_current_user)
):
    """
    Obtiene fichas técnicas de un cliente con filtros opcionales.
    
    Ejemplos de uso:
    - Facturación: ?cliente_id=CL-90411&cita_id=6941c18a...
    - Historial: ?cliente_id=CL-90411
    - Fichas de hoy: ?cliente_id=CL-90411&solo_hoy=true
    
    ⭐ PRIORIDAD DE FILTROS:
    1. cita_id (ignora fecha y solo_hoy)
    2. fecha específica
    3. solo_hoy
    4. cliente_id solo
    """
    
    # -----------------------------------------
    # 1. Validación de acceso
    # -----------------------------------------
    rol = current_user["rol"]
    if rol not in ["super_admin", "admin_franquicia", "admin_sede", "estilista"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    # -----------------------------------------
    # 2. Construir filtro dinámico
    # -----------------------------------------
    filtro = {"cliente_id": cliente_id}

    # 🔹 PRIORIDAD 1: Si pasan cita_id, buscar en datos_especificos.cita_id
    if cita_id:
        filtro["datos_especificos.cita_id"] = cita_id
        limit = 1  # Solo necesitamos una
        print(f"🔍 Buscando ficha con cita_id: {cita_id}")
    
    # 🔹 PRIORIDAD 2: Filtrar por fecha específica
    elif fecha:
        filtro["fecha_reserva"] = fecha
        print(f"🔍 Buscando fichas con fecha: {fecha}")
    
    # 🔹 PRIORIDAD 3: Filtrar por hoy
    elif solo_hoy:
        from datetime import datetime
        hoy = datetime.now().strftime("%Y-%m-%d")
        filtro["fecha_reserva"] = hoy
        print(f"🔍 Buscando fichas de hoy: {hoy}")
    
    else:
        print(f"🔍 Buscando todas las fichas del cliente: {cliente_id}")

    # -----------------------------------------
    # 3. Buscar fichas
    # -----------------------------------------
    print(f"📋 Filtro aplicado: {filtro}")
    
    fichas = (
        await collection_card
        .find(filtro)
        .sort("fecha_ficha", -1)
        .limit(limit)
        .to_list(None)
    )

    print(f"✅ Fichas encontradas: {len(fichas)}")

    if not fichas:
        return {"success": True, "total": 0, "fichas": []}

    resultado = []

    # -----------------------------------------
    # 4. Enriquecer cada ficha
    # -----------------------------------------
    for ficha in fichas:
        # Extraer cita_id desde datos_especificos si existe
        datos_especificos = ficha.get("datos_especificos", {})
        cita_id_ficha = datos_especificos.get("cita_id") if isinstance(datos_especificos, dict) else None
        
        # ⭐ NUEVA LÓGICA: Manejar múltiples servicios
        servicios_ficha = ficha.get("servicios", [])
        servicio_id_principal = ficha.get("servicio_id")  # Compatibilidad
        
        # Si tiene array de servicios (nuevo formato)
        if servicios_ficha and isinstance(servicios_ficha, list):
            # Enriquecer todos los servicios
            servicios_enriquecidos = []
            for serv in servicios_ficha:
                servicio_db = await collection_servicios.find_one(
                    {"servicio_id": serv.get("servicio_id")}
                )
                servicios_enriquecidos.append({
                    "servicio_id": serv.get("servicio_id"),
                    "nombre": serv.get("nombre") or (servicio_db.get("nombre") if servicio_db else "Desconocido"),
                    "precio": serv.get("precio", 0)
                })
        
        # Si solo tiene servicio_id único (formato antiguo)
        elif servicio_id_principal:
            servicio_db = await collection_servicios.find_one(
                {"servicio_id": servicio_id_principal}
            )
            servicios_enriquecidos = [{
                "servicio_id": servicio_id_principal,
                "nombre": servicio_db.get("nombre") if servicio_db else "Desconocido",
                "precio": ficha.get("precio", 0)
            }]
        
        else:
            servicios_enriquecidos = []
        
        # Construir objeto de respuesta
        ficha_norm = {
            "id": str(ficha.get("_id")),
            "cita_id": cita_id_ficha,
            "cliente_id": ficha.get("cliente_id"),
            "nombre": ficha.get("nombre"),
            "apellido": ficha.get("apellido"),
            "telefono": ficha.get("telefono"),
            "cedula": ficha.get("cedula"),
            
            # ⭐ CAMBIO: Ahora devuelve array de servicios
            "servicios": servicios_enriquecidos,
            
            # ⭐ COMPATIBILIDAD: Mantener campos antiguos
            "servicio_id": servicio_id_principal,
            "servicio_nombre": servicios_enriquecidos[0]["nombre"] if servicios_enriquecidos else None,
            
            "profesional_id": ficha.get("profesional_id"),
            "sede_id": ficha.get("sede_id"),
            "fecha_ficha": ficha.get("fecha_ficha"),
            "fecha_reserva": ficha.get("fecha_reserva"),
            "tipo_ficha": ficha.get("tipo_ficha"),
            "precio": ficha.get("precio"),
            "estado": ficha.get("estado"),
            "estado_pago": ficha.get("estado_pago"),
            "contenido": datos_especificos,
        }

        # Enriquecimiento de profesional y sede
        profesional = await collection_estilista.find_one(
            {"profesional_id": ficha.get("profesional_id")}
        )
        sede = await collection_locales.find_one(
            {"sede_id": ficha.get("sede_id")}
        )

        ficha_norm["profesional_nombre"] = profesional.get("nombre") if profesional else None
        ficha_norm["sede_nombre"] = sede.get("nombre") if sede else None

        resultado.append(ficha_norm)

    # -----------------------------------------
    # 5. Respuesta final
    # -----------------------------------------
    return {
        "success": True,
        "total": len(resultado),
        "fichas": resultado
    }

# ============================================================
# 📅 Obtener citas del estilista autenticado - VERSIÓN OPTIMIZADA
# ✅ Sin cambios en el frontend
# ✅ De N*3 queries → 3 queries totales
# ✅ Filtro de fecha automático (30 días atrás - 60 días adelante)
# ============================================================

@router.get("/citas/estilista", response_model=list)
async def get_citas_estilista(
    current_user: dict = Depends(get_current_user),
    fecha_desde: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    fecha_hasta: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
):
    if current_user["rol"] != "estilista":
        raise HTTPException(status_code=403, detail="Solo los estilistas pueden ver sus citas")

    estilista = await collection_estilista.find_one({"email": current_user["email"]})
    if not estilista:
        raise HTTPException(status_code=404, detail="No se encontró el profesional asociado a este usuario")

    profesional_id = estilista.get("profesional_id")

    hoy = datetime.utcnow()
    dt_desde = datetime.strptime(fecha_desde, "%Y-%m-%d") if fecha_desde else hoy - timedelta(days=30)
    dt_hasta = (datetime.strptime(fecha_hasta, "%Y-%m-%d") + timedelta(days=1)) if fecha_hasta else hoy + timedelta(days=60)

    str_desde = dt_desde.strftime("%Y-%m-%d")
    str_hasta = (dt_hasta - timedelta(days=1)).strftime("%Y-%m-%d")

    pipeline = [
        {
            "$match": {
                "$or": [
                    {"estilista_id": profesional_id},
                    {"profesional_id": profesional_id}
                ],
                "fecha": {"$gte": str_desde, "$lte": str_hasta}
            }
        },
        {"$sort": {"fecha": 1}},
        {
            "$lookup": {
                "from": collection_clients.name,
                "localField": "cliente_id",
                "foreignField": "cliente_id",
                "as": "_cliente_data"
            }
        },
        {
            "$lookup": {
                "from": collection_locales.name,
                "localField": "sede_id",
                "foreignField": "sede_id",
                "as": "_sede_data"
            }
        },
        {
            "$addFields": {
                "_cliente": {"$arrayElemAt": ["$_cliente_data", 0]},
                "_sede":    {"$arrayElemAt": ["$_sede_data", 0]}
            }
        },
        {"$project": {"_cliente_data": 0, "_sede_data": 0}}
    ]

    citas = await collection_citas.aggregate(pipeline).to_list(None)

    # Pre-cargar todos los servicios necesarios en una sola query
    todos_servicio_ids = set()
    for c in citas:
        for serv_item in c.get("servicios", []):
            if serv_item.get("servicio_id"):
                todos_servicio_ids.add(serv_item.get("servicio_id"))
        if c.get("servicio_id"):
            todos_servicio_ids.add(c.get("servicio_id"))

    servicios_db_map = {}
    if todos_servicio_ids:
        servicios_db_list = await collection_servicios.find({
            "$or": [
                {"servicio_id": {"$in": list(todos_servicio_ids)}},
                {"unique_id":   {"$in": list(todos_servicio_ids)}}
            ]
        }).to_list(None)
        for s in servicios_db_list:
            if s.get("servicio_id"): servicios_db_map[s["servicio_id"]] = s
            if s.get("unique_id"):   servicios_db_map[s["unique_id"]] = s

    def detectar_formato(c: dict) -> str:
        servicios_arr = c.get("servicios")
        if isinstance(servicios_arr, list) and len(servicios_arr) > 0:
            return "nuevo"
        if c.get("servicio_id") or c.get("servicio_nombre") or c.get("valor_total"):
            return "antiguo"
        return "vacio"

    def resolver_precio_item(serv_item: dict, servicio_db) -> tuple:
        val = serv_item.get("precio_personalizado")
        es_personalizado = False
        try:
            if val is not None and val is not False and float(val) > 0:
                es_personalizado = True
        except (TypeError, ValueError):
            pass

        if es_personalizado:
            return float(val), True

        precio_item = serv_item.get("precio")
        if precio_item not in (None, 0, "", False):
            try:
                return float(precio_item), False
            except (TypeError, ValueError):
                pass

        if servicio_db:
            precio_bd = servicio_db.get("precio")
            if precio_bd not in (None, 0):
                try:
                    return float(precio_bd), False
                except (TypeError, ValueError):
                    pass

        return 0.0, False

    respuesta = []

    for c in citas:
        formato = detectar_formato(c)

        # CLIENTE
        cliente_raw = c.get("_cliente") or {}
        nombre   = cliente_raw.get("nombre", "")
        apellido = cliente_raw.get("apellido", "")

        if not nombre:
            nombre_embebido = c.get("cliente_nombre", "").strip()
            if nombre_embebido:
                partes   = nombre_embebido.split(" ", 1)
                nombre   = partes[0]
                apellido = partes[1] if len(partes) > 1 else ""

        cliente_data = {
            "cliente_id": c.get("cliente_id", ""),
            "nombre":     nombre   or "Desconocido",
            "apellido":   apellido or "",
            "telefono":   cliente_raw.get("telefono") or c.get("cliente_telefono", ""),
            "email":      cliente_raw.get("email")    or c.get("cliente_email", ""),
        }

        # SERVICIOS Y PRECIO
        servicios_data = []
        precio_total   = 0.0

        if formato == "nuevo":
            for serv_item in c.get("servicios", []):
                servicio_id = serv_item.get("servicio_id")
                servicio_db = servicios_db_map.get(servicio_id) if servicio_id else None
                precio, es_personalizado = resolver_precio_item(serv_item, servicio_db)
                precio_total += precio

                nombre_serv = (
                    serv_item.get("nombre")
                    or (servicio_db.get("nombre") if servicio_db else None)
                    or "Servicio sin nombre"
                )
                servicios_data.append({
                    "servicio_id":          servicio_id or "",
                    "nombre":               nombre_serv,
                    "precio":               precio,
                    "precio_personalizado": es_personalizado
                })

        elif formato == "antiguo":
            servicio_id = c.get("servicio_id")
            servicio_db = servicios_db_map.get(servicio_id) if servicio_id else None

            precio_total = float(
                c.get("valor_total")
                or c.get("precio_total")
                or (servicio_db.get("precio") if servicio_db else 0)
                or 0
            )

            nombre_serv = (
                c.get("servicio_nombre")
                or (servicio_db.get("nombre") if servicio_db else None)
                or "Servicio sin nombre"
            )

            servicios_data.append({
                "servicio_id":          servicio_id or "",
                "nombre":               nombre_serv,
                "precio":               precio_total,
                "precio_personalizado": False
            })

        # SEDE
        sede_raw = c.get("_sede") or {}
        sede_data = {
            "sede_id": c.get("sede_id", ""),
            "nombre":  (
                sede_raw.get("nombre")
                or c.get("sede_nombre")
                or "Sede desconocida"
            )
        }

        respuesta.append({
            "cita_id":                    str(c.get("_id")),
            "cliente":                    cliente_data,
            "servicios":                  servicios_data,
            "sede":                       sede_data,
            "estilista_id":               profesional_id,
            "fecha":                      c.get("fecha"),
            "hora_inicio":                c.get("hora_inicio"),
            "hora_fin":                   c.get("hora_fin"),
            "estado":                     c.get("estado"),
            "estado_pago":                c.get("estado_pago"),
            "comentario":                 c.get("comentario", None),
            "precio_total":               precio_total,
            "cantidad_servicios":         len(servicios_data),
            "tiene_precio_personalizado": any(s["precio_personalizado"] for s in servicios_data)
        })

    return respuesta


def parse_ficha(data: str = Form(...)):
    try:
        parsed = json.loads(data)
        return FichaCreate(**parsed)
    except Exception as e:
        print("Error parseando JSON de ficha:", e)
        raise HTTPException(422, "Formato inválido en 'data'. Debe ser JSON válido.")   

# ============================================================
# 📌 Crear ficha 
# ============================================================
@router.post("/create-ficha", response_model=dict)
async def crear_ficha(
    data: FichaCreate = Depends(parse_ficha),
    fotos_antes: Optional[List[UploadFile]] = File(None),
    fotos_despues: Optional[List[UploadFile]] = File(None),
    current_user: dict = Depends(get_current_user)
):
    print("📝 Data recibida:", data.dict())

    # ------------------------------
    # ⭐ COMPATIBILIDAD: Determinar servicio(s)
    # ------------------------------
    servicios_lista = []
    servicio_id_principal = None
    
    # Caso 1: Viene servicios (array) - NUEVO FORMATO
    if data.servicios and len(data.servicios) > 0:
        servicios_lista = data.servicios
        servicio_id_principal = data.servicios[0].servicio_id
        print(f"✅ Usando servicios (array): {[s.servicio_id for s in servicios_lista]}")
    
    # Caso 2: Viene servicio_id único - FORMATO ANTIGUO
    elif data.servicio_id:
        servicios_lista = [ServicioEnFicha(servicio_id=data.servicio_id)]
        servicio_id_principal = data.servicio_id
        print(f"✅ Usando servicio_id único: {servicio_id_principal}")
    
    else:
        raise HTTPException(400, "Debe especificar al menos un servicio")

    # ------------------------------
    # VALIDAR
    # ------------------------------
    if current_user.get("rol") not in ["estilista", "admin_sede", "super_admin"]:
        raise HTTPException(403, "No autorizado")

    cliente = await collection_clients.find_one({"cliente_id": data.cliente_id})
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")

    # ⭐ VALIDAR TODOS LOS SERVICIOS
    servicios_validados = []
    precio_total = 0
    
    for servicio_item in servicios_lista:
        servicio = await collection_servicios.find_one({
            "$or": [
                {"servicio_id": servicio_item.servicio_id},
                {"unique_id": servicio_item.servicio_id}
            ]
        })
        if not servicio:
            raise HTTPException(404, f"Servicio {servicio_item.servicio_id} no encontrado")
        
        servicios_validados.append({
            "servicio_id": servicio_item.servicio_id,
            "nombre": servicio.get("nombre"),
            "precio": servicio_item.precio or servicio.get("precio", 0)
        })
        
        precio_total += servicio_item.precio or servicio.get("precio", 0)

    profesional = await collection_estilista.find_one({
        "profesional_id": data.profesional_id
    })
    if not profesional:
        raise HTTPException(404, "Profesional no encontrado")

    sede = await collection_locales.find_one({"sede_id": data.sede_id})
    if not sede:
        raise HTTPException(404, "Sede no encontrada")

    # ------------------------------
    # SUBIR FOTOS
    # ------------------------------
    urls_antes = []
    if fotos_antes:
        for foto in fotos_antes:
            url = upload_to_s3(
                foto,
                f"companies/{sede.get('company_id','default')}/clients/{data.cliente_id}/fichas/{data.tipo_ficha}/antes"
            )
            urls_antes.append(url)

    urls_despues = []
    if fotos_despues:
        for foto in fotos_despues:
            url = upload_to_s3(
                foto,
                f"companies/{sede.get('company_id','default')}/clients/{data.cliente_id}/fichas/{data.tipo_ficha}/despues"
            )
            urls_despues.append(url)

    # ------------------------------
    # FIX RESPUESTAS
    # ------------------------------
    respuestas_final = data.respuestas

    if "respuestas" in data.datos_especificos:
        respuestas_final = data.datos_especificos.get("respuestas", [])

    # ------------------------------
    # ⭐ OBJETO FINAL CON SERVICIOS
    # ------------------------------
    ficha = {
        "_id": ObjectId(),
        "cliente_id": data.cliente_id,
        "sede_id": data.sede_id,
        
        # ⭐ COMPATIBILIDAD: Guardar ambos formatos
        "servicio_id": servicio_id_principal,  # Para queries antiguas
        "servicios": servicios_validados,  # NUEVO: Lista completa
        
        "servicio_nombre": servicios_validados[0]["nombre"],  # Primer servicio
        "profesional_id": data.profesional_id,
        "profesional_nombre": data.profesional_nombre or profesional.get("nombre"),
        "sede_nombre": sede.get("nombre"),

        "fecha_ficha": data.fecha_ficha or datetime.now().isoformat(),
        "fecha_reserva": data.fecha_reserva,

        "correo": data.email or cliente.get("correo"),
        "nombre": data.nombre or cliente.get("nombre"),
        "apellido": data.apellido or cliente.get("apellido"),
        "cedula": data.cedula or cliente.get("cedula"),
        "telefono": data.telefono or cliente.get("telefono"),

        "precio": data.precio or precio_total,  # ⭐ Suma de todos los servicios
        "estado": data.estado,
        "estado_pago": data.estado_pago,

        "tipo_ficha": data.tipo_ficha,

        "datos_especificos": data.datos_especificos,
        "descripcion_servicio": data.descripcion_servicio,
        "respuestas": respuestas_final,

        "fotos": {
            "antes": urls_antes,
            "despues": urls_despues,
            "antes_urls": data.fotos_antes,
            "despues_urls": data.fotos_despues
        },

        "autorizacion_publicacion": data.autorizacion_publicacion,
        "comentario_interno": data.comentario_interno,

        "created_at": datetime.now(),
        "created_by": current_user.get("email"),
        "user_id": current_user.get("user_id"),

        "procesado_imagenes": bool(urls_antes or urls_despues),
        "origen": "manual"
    }

    await collection_card.insert_one(ficha)

    ficha["_id"] = str(ficha["_id"])

    return {
        "success": True,
        "message": "Ficha creada exitosamente",
        "ficha": ficha
    }

def fix_mongo_id(doc):
    doc["_id"] = str(doc["_id"])
    return doc

# ============================================================
# 📅 Obtener todas las citas de la sede del admin autenticado
# ============================================================
@router.get("/citas-sede", response_model=dict)
async def get_citas_sede(current_user: dict = Depends(get_current_user)):
    if current_user["rol"] not in ["admin_sede", "admin"]:
        raise HTTPException(
            status_code=403,
            detail="Solo los administradores de sede pueden ver esta información"
        )

    sede_id = current_user.get("sede_id")
    if not sede_id:
        raise HTTPException(
            status_code=400,
            detail="El administrador no tiene asignada una sede"
        )

    citas = await collection_citas.find({"sede_id": sede_id}).to_list(None)

    # 🔥 Convertir todos los ObjectId a string
    citas = [fix_mongo_id(c) for c in citas]

    return {
        "total": len(citas),
        "sede_id": sede_id,
        "citas": citas
    }


# ============================================================
# 📦 Agregar productos a una cita - CON COMISIÓN SEGÚN ROL
# ============================================================
@router.post("/cita/{cita_id}/agregar-productos", response_model=dict)
async def agregar_productos_a_cita(
    cita_id: str,
    productos: List[ProductoItem],
    current_user: dict = Depends(get_current_user)
):
    """
    Agrega productos a una cita usando el precio según la moneda de la sede.
    ⭐ Solo comisiona si lo agrega un ESTILISTA, no si es admin_sede.
    """
    # Solo admin sede, admin o estilista
    if current_user["rol"] not in ["admin_sede", "admin", "estilista"]:
        raise HTTPException(
            status_code=403,
            detail="No tienes permisos para agregar productos"
        )

    # Información del usuario que agrega
    rol_usuario = current_user["rol"]
    email_usuario = current_user.get("email")
    profesional_id = current_user.get("profesional_id")

    # Buscar cita
    cita = await collection_citas.find_one({"_id": ObjectId(cita_id)})
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    # Obtener moneda de la cita
    moneda_cita = cita.get("moneda")
    if not moneda_cita:
        raise HTTPException(
            status_code=400,
            detail="Esta cita no tiene moneda asignada. Contacta soporte."
        )

    # Obtener reglas de comisión de la sede
    sede = await collection_locales.find_one({"sede_id": cita["sede_id"]})
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    
    reglas_comision = sede.get("reglas_comision", {"tipo": "servicios"})
    tipo_comision = reglas_comision.get("tipo", "servicios")
    
    # Verificar si la sede permite comisión de productos
    permite_comision_productos = tipo_comision in ["productos", "mixto"]
    
    # ⭐ REGLA: Solo comisiona si es ESTILISTA
    aplica_comision = permite_comision_productos and rol_usuario == "estilista"

    # Productos actuales
    productos_actuales = cita.get("productos", [])

    # Procesar nuevos productos
    nuevos_productos = []
    total_productos = 0
    total_comision_productos = 0

    for p in productos:
        # Buscar producto en BD
        producto_db = await collection_products.find_one({"id": p.producto_id})
        
        if not producto_db:
            raise HTTPException(
                status_code=404,
                detail=f"Producto con ID '{p.producto_id}' no encontrado"
            )
        
        # Obtener precio en la moneda correcta
        precios_producto = producto_db.get("precios", {})
        
        if moneda_cita not in precios_producto:
            raise HTTPException(
                status_code=400,
                detail=f"El producto '{producto_db.get('nombre')}' no tiene precio configurado en {moneda_cita}"
            )
        
        precio_unitario = round(precios_producto[moneda_cita], 2)
        subtotal = round(p.cantidad * precio_unitario, 2)
        
        # Calcular comisión (solo si es estilista)
        comision_porcentaje = 0
        comision_producto = 0
        
        if aplica_comision:
            comision_porcentaje = producto_db.get("comision", 0)
            comision_producto = round((subtotal * comision_porcentaje) / 100, 2)
            total_comision_productos += comision_producto
        
        # Construir objeto producto
        nuevo_producto = {
            "producto_id": p.producto_id,
            "nombre": producto_db.get("nombre"),
            "cantidad": p.cantidad,
            "precio_unitario": precio_unitario,
            "subtotal": subtotal,
            "moneda": moneda_cita,
            "comision_porcentaje": comision_porcentaje,
            "comision_valor": comision_producto,
            "agregado_por_email": email_usuario,
            "agregado_por_rol": rol_usuario,
            "fecha_agregado": datetime.now(),
        }
        
        # Si es estilista, guardar su profesional_id para comisiones
        if rol_usuario == "estilista" and profesional_id:
            nuevo_producto["profesional_id"] = profesional_id
        
        nuevos_productos.append(nuevo_producto)
        total_productos += subtotal

    # Redondear totales
    total_productos = round(total_productos, 2)
    total_comision_productos = round(total_comision_productos, 2)

    # Agregar productos a la cita
    productos_final = productos_actuales + nuevos_productos

    # Recalcular totales
    nuevo_total = round(cita.get("valor_total", 0) + total_productos, 2)
    abono_actual = round(cita.get("abono", 0), 2)
    nuevo_saldo = round(nuevo_total - abono_actual, 2)

    # Recalcular estado de pago
    if nuevo_saldo <= 0:
        nuevo_estado_pago = "pagado"
    elif abono_actual > 0:
        nuevo_estado_pago = "abonado"
    else:
        nuevo_estado_pago = "pendiente"

    # Actualizar cita
    await collection_citas.update_one(
        {"_id": ObjectId(cita_id)},
        {
            "$set": {
                "productos": productos_final,
                "valor_total": nuevo_total,
                "saldo_pendiente": nuevo_saldo,
                "estado_pago": nuevo_estado_pago,
                "ultima_actualizacion": datetime.utcnow()
            }
        }
    )

    # Obtener cita actualizada
    cita_actualizada = await collection_citas.find_one({"_id": ObjectId(cita_id)})
    cita_actualizada["_id"] = str(cita_actualizada["_id"])

    return {
        "success": True,
        "message": "Productos agregados correctamente",
        "productos_agregados": len(nuevos_productos),
        "total_productos": total_productos,
        "total_comision_productos": total_comision_productos,
        "aplica_comision": aplica_comision,
        "agregado_por": {
            "email": email_usuario,
            "rol": rol_usuario
        },
        "moneda": moneda_cita,
        "cita": cita_actualizada
    }


# ============================================================
# 🗑️ Eliminar producto de una cita
# ============================================================
@router.delete("/cita/{cita_id}/productos/{producto_id}", response_model=dict)
async def eliminar_producto_de_cita(
    cita_id: str,
    producto_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Elimina un producto específico de una cita y recalcula totales.
    ⭐ Recalcula el total RESTANDO solo el producto eliminado.
    ⭐ Aplica redondeo para corregir errores de punto flotante.
    """
    # Solo admin sede, admin o estilista
    if current_user["rol"] not in ["admin_sede", "admin", "estilista"]:
        raise HTTPException(
            status_code=403,
            detail="No tienes permisos para eliminar productos"
        )

    # Buscar cita
    cita = await collection_citas.find_one({"_id": ObjectId(cita_id)})
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    # Verificar que la cita tenga productos
    productos_actuales = cita.get("productos", [])
    if not productos_actuales:
        raise HTTPException(
            status_code=400,
            detail="Esta cita no tiene productos agregados"
        )

    # Buscar y filtrar el producto a eliminar
    producto_encontrado = None
    productos_filtrados = []
    
    for producto in productos_actuales:
        if producto.get("producto_id") == producto_id:
            producto_encontrado = producto
        else:
            productos_filtrados.append(producto)

    # Validar que el producto existe en la cita
    if not producto_encontrado:
        raise HTTPException(
            status_code=404,
            detail=f"Producto con ID '{producto_id}' no encontrado en esta cita"
        )

    # Calcular totales después de eliminar
    total_productos_restante = round(sum(p.get("subtotal", 0) for p in productos_filtrados), 2)
    
    # Recalcular totales de la cita
    valor_servicios = round(cita.get("valor_total", 0) - sum(p.get("subtotal", 0) for p in productos_actuales), 2)
    nuevo_total = round(valor_servicios + total_productos_restante, 2)
    abono_actual = round(cita.get("abono", 0), 2)
    nuevo_saldo = round(nuevo_total - abono_actual, 2)

    # Recalcular estado de pago
    if nuevo_saldo <= 0:
        nuevo_estado_pago = "pagado"
    elif abono_actual > 0:
        nuevo_estado_pago = "abonado"
    else:
        nuevo_estado_pago = "pendiente"

    # Actualizar cita (sin historial)
    await collection_citas.update_one(
        {"_id": ObjectId(cita_id)},
        {
            "$set": {
                "productos": productos_filtrados,
                "valor_total": nuevo_total,
                "saldo_pendiente": nuevo_saldo,
                "estado_pago": nuevo_estado_pago,
                "ultima_actualizacion": datetime.now()
            }
        }
    )

    # Obtener cita actualizada
    cita_actualizada = await collection_citas.find_one({"_id": ObjectId(cita_id)})
    cita_actualizada["_id"] = str(cita_actualizada["_id"])

    return {
        "success": True,
        "message": "Producto eliminado correctamente",
        "productos_restantes": len(productos_filtrados),
        "nuevo_total_cita": nuevo_total,
        "nuevo_saldo": nuevo_saldo,
        "moneda": cita.get("moneda"),
        "cita": cita_actualizada
    }


# ============================================================
# 🗑️ Eliminar TODOS los productos de una cita
# ============================================================
@router.delete("/cita/{cita_id}/productos", response_model=dict)
async def eliminar_todos_productos_de_cita(
    cita_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Elimina TODOS los productos de una cita y recalcula totales.
    """
    # Solo admin sede, admin o estilista
    if current_user["rol"] not in ["admin_sede", "admin", "estilista"]:
        raise HTTPException(
            status_code=403,
            detail="No tienes permisos para eliminar productos"
        )

    # Buscar cita
    cita = await collection_citas.find_one({"_id": ObjectId(cita_id)})
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    # Verificar que la cita tenga productos
    productos_actuales = cita.get("productos", [])
    if not productos_actuales:
        raise HTTPException(
            status_code=400,
            detail="Esta cita no tiene productos agregados"
        )

    # Calcular totales eliminados
    total_productos_eliminados = round(sum(p.get("subtotal", 0) for p in productos_actuales), 2)
    cantidad_productos = len(productos_actuales)

    # Recalcular totales de la cita (solo servicios)
    valor_servicios = round(cita.get("valor_total", 0) - total_productos_eliminados, 2)
    nuevo_total = valor_servicios
    abono_actual = round(cita.get("abono", 0), 2)
    nuevo_saldo = round(nuevo_total - abono_actual, 2)

    # Recalcular estado de pago
    if nuevo_saldo <= 0:
        nuevo_estado_pago = "pagado"
    elif abono_actual > 0:
        nuevo_estado_pago = "abonado"
    else:
        nuevo_estado_pago = "pendiente"

    # Actualizar cita
    await collection_citas.update_one(
        {"_id": ObjectId(cita_id)},
        {
            "$set": {
                "productos": [],
                "valor_total": nuevo_total,
                "saldo_pendiente": nuevo_saldo,
                "estado_pago": nuevo_estado_pago,
                "ultima_actualizacion": datetime.now()
            }
        }
    )

    # Obtener cita actualizada
    cita_actualizada = await collection_citas.find_one({"_id": ObjectId(cita_id)})
    cita_actualizada["_id"] = str(cita_actualizada["_id"])

    return {
        "success": True,
        "message": f"Se eliminaron {cantidad_productos} productos correctamente",
        "productos_eliminados": cantidad_productos,
        "nuevo_total_cita": nuevo_total,
        "nuevo_saldo": nuevo_saldo,
        "moneda": cita.get("moneda"),
        "cita": cita_actualizada
    }
# ============================================
# ✅ Finalizar servicio con PDF
# ============================================
@router.put("/citas/{cita_id}/finalizar", response_model=dict)
async def finalizar_servicio_con_pdf(
    cita_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Finaliza un servicio, genera PDF y envía por correo.
    """
    # Verificar rol
    if current_user["rol"] not in ["admin_sede", "estilista"]:
        raise HTTPException(
            status_code=403,
            detail="No tienes permisos para finalizar servicios"
        )

    # Verificar que la cita exista
    cita = await collection_citas.find_one({"_id": ObjectId(cita_id)})
    if not cita:
        raise HTTPException(
            status_code=404,
            detail="La cita no existe"
        )

    # No permitir finalizar si ya está finalizado
    if cita.get("estado") == "finalizado":
        raise HTTPException(
            status_code=400,
            detail="Esta cita ya fue finalizada"
        )

    # Buscar la ficha asociada a la cita
    ficha = await collection_card.find_one({"datos_especificos.cita_id": cita_id})
    if not ficha:
        raise HTTPException(
            status_code=404,
            detail="No se encontró ficha técnica asociada a esta cita"
        )

    # Actualizar estado de la cita
    update_data = {
        "estado": "finalizado",
        "fecha_finalizacion": datetime.now(),
        "finalizado_por": current_user.get("email"),
    }

    await collection_citas.update_one(
        {"_id": ObjectId(cita_id)},
        {"$set": update_data}
    )

    # Obtener la cita actualizada con TODOS los datos
    cita_actualizada = await collection_citas.find_one({"_id": ObjectId(cita_id)})

    # Actualizar también el estado de la ficha
    await collection_card.update_one(
        {"_id": ficha["_id"]},
        {"$set": {"estado": "finalizado"}}
    )

    # Generar PDF con los datos de la ficha
    cliente_email = None  # Definir fuera del try para usarla en el return
    try:
        print(f"🔍 Generando PDF para cita {cita_id}...")
        print(f"📄 Datos financieros de la cita: valor_total={cita_actualizada.get('valor_total')}, abono={cita_actualizada.get('abono')}")
        print(f"📄 Método de pago: actual={cita_actualizada.get('metodo_pago_actual')}, inicial={cita_actualizada.get('metodo_pago_inicial')}")
        
        # Preparar datos de cita para el PDF
        cita_data_for_pdf = {
            "cita_id": cita_id,
            "estado": cita_actualizada.get("estado", "finalizado"),
            "fecha_finalizacion": cita_actualizada.get("fecha_finalizacion", datetime.now()),
            "finalizado_por": cita_actualizada.get("finalizado_por", current_user.get("email")),
            # Datos financieros COMPLETOS
            "valor_total": cita_actualizada.get("valor_total", 0),
            "abono": cita_actualizada.get("abono", 0),
            "saldo_pendiente": cita_actualizada.get("saldo_pendiente", 0),
            "estado_pago": cita_actualizada.get("estado_pago", "pendiente"),
            "metodo_pago_actual": cita_actualizada.get("metodo_pago_actual"),
            "metodo_pago_inicial": cita_actualizada.get("metodo_pago_inicial"),
            "moneda": cita_actualizada.get("moneda", "COP"),
            "hora_fin": cita_actualizada.get("hora_fin", "No especificado"),
        }
        
        pdf_bytes = await generar_pdf_ficha(ficha, cita_data_for_pdf)
        
        print(f"✅ PDF generado exitosamente ({len(pdf_bytes)} bytes)")
        
        # Preparar datos para el correo
        cliente_email = ficha.get("email")
        if not cliente_email:
            # Si no hay email en la ficha, buscar en el cliente
            print(f"🔍 Buscando correo del cliente con ID: {ficha.get('cliente_id')}")
            cliente = await collection_clients.find_one({"cliente_id": ficha.get("cliente_id")})
            if cliente and cliente.get("correo"):
                cliente_email = cliente.get("correo")
                print(f"📧 Email encontrado: {cliente_email}")
        
        if cliente_email:
            # Crear HTML del correo (SIN AWAIT - porque ahora es función normal)
            html_correo = crear_html_correo_ficha(
                cliente_nombre=ficha.get("nombre", "Cliente"),
                servicio_nombre=ficha.get("servicio_nombre", "Servicio"),
                fecha=datetime.now().strftime("%d/%m/%Y %H:%M")
            )
            
            # Crear nombre del archivo PDF
            ficha_id_str = str(ficha.get('_id', ''))
            nombre_archivo = f"comprobante_servicio_{ficha_id_str[-6:] if len(ficha_id_str) >= 6 else ficha_id_str}.pdf"
            
            print(f"📧 Enviando correo a {cliente_email}")
            
            # Enviar correo con PDF adjunto (ESTA SÍ lleva await porque es async)
            enviado = await enviar_correo_con_pdf(
                destinatario=cliente_email,
                asunto=f"✅ Comprobante de Servicio - {ficha.get('servicio_nombre', 'Servicio')}",
                mensaje_html=html_correo,
                pdf_bytes=pdf_bytes,
                nombre_archivo=nombre_archivo
            )
            
            if enviado:
                print(f"✅ PDF enviado a {cliente_email}")
            else:
                print(f"⚠️ PDF generado pero no enviado")
        else:
            print("⚠️ No se encontró email del cliente")
        
        # Guardar referencia del PDF generado
        await collection_citas.update_one(
            {"_id": ObjectId(cita_id)},
            {"$set": {
                "pdf_generado": True,
                "pdf_fecha_generacion": datetime.now(),
                "pdf_enviado": bool(cliente_email)
            }}
        )
        
    except Exception as e:
        print(f"❌ Error generando/enviando PDF: {e}")
        import traceback
        traceback.print_exc()

    return {
        "success": True,
        "message": "Servicio finalizado correctamente",
        "cita_id": cita_id,
        "estado": "finalizado",
        "pdf_generado": True,
        "pdf_enviado": bool(cliente_email) if cliente_email is not None else False,
        "cliente_email": cliente_email
    }
