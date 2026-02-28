from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from bson import ObjectId
from typing import List, Optional

from app.admin.models import Profesional
from app.auth.routes import get_current_user
from app.database.mongo import (
    collection_estilista,
    collection_locales,
    collection_servicios,
    collection_auth  # ⭐ Usar users_auth
)
from app.id_generator.generator import generar_id, validar_id  # ⭐ Generador de IDs
from app.auth.controllers import pwd_context

router = APIRouter(prefix="/admin/profesionales", tags=["Admin - Profesionales"])

# ===================================================
# Helper: convertir ObjectId a string
# ===================================================
def profesional_to_dict(p):
    """Convierte ObjectId a string para respuesta JSON"""
    if "_id" in p:
        p["_id"] = str(p["_id"])
    return p

# ===================================================
# Helper: Obtener servicios que SÍ presta
# ===================================================
async def obtener_servicios_presta(profesional: dict):
    """
    Calcula los servicios que SÍ presta el profesional:
    - Todos los servicios de la sede MENOS servicios_no_presta
    """
    try:
        sede_id = profesional.get("sede_id")
        if not sede_id:
            return []
        
        # Obtener todos los servicios activos de la sede
        todos_servicios = await collection_servicios.find({
            "sede_id": sede_id,
            "activo": True
        }).to_list(None)
        
        # Si especialidades es True, calcular diferencia
        if profesional.get("especialidades") is True:
            servicios_no_presta = set(profesional.get("servicios_no_presta", []))
            servicios_presta = []
            
            for servicio in todos_servicios:
                servicio_id = servicio.get("servicio_id")
                if servicio_id and servicio_id not in servicios_no_presta:
                    servicios_presta.append({
                        "id": servicio_id,
                        "nombre": servicio.get("nombre", "Desconocido"),
                        "categoria": servicio.get("categoria", ""),
                        "precio": servicio.get("precio", 0),
                        "duracion_minutos": servicio.get("duracion_minutos", 0)
                    })
            return servicios_presta
        
        # Si especialidades es False (caso antiguo), usar lista de especialidades
        elif isinstance(profesional.get("especialidades"), list):
            servicios_presta = []
            for servicio_id in profesional.get("especialidades", []):
                servicio = await collection_servicios.find_one({
                    "$or": [
                        {"servicio_id": servicio_id},
                        {"unique_id": servicio_id}
                    ]
                })
                if servicio:
                    servicios_presta.append({
                        "id": servicio.get("servicio_id") or servicio.get("unique_id"),
                        "nombre": servicio.get("nombre", "Desconocido"),
                        "categoria": servicio.get("categoria", ""),
                        "precio": servicio.get("precio", 0),
                        "duracion_minutos": servicio.get("duracion_minutos", 0)
                    })
            return servicios_presta
        
        return []
        
    except Exception as e:
        print(f"Error calculando servicios presta: {str(e)}")
        return []

# ===================================================
# ✅ Crear profesional — sede_id VIENE EN EL MODELO
# ===================================================
@router.post("/", response_model=dict)
async def create_profesional(
    profesional: Profesional,
    current_user: dict = Depends(get_current_user)
):
    print("\n========== CREAR PROFESIONAL ==========")
    print("📥 Datos recibidos:", profesional.dict())
    print("👤 Usuario actual:", current_user)

    # --- Permisos ---
    rol = current_user["rol"]
    print("🔐 Rol del creador:", rol)

    if rol not in ["super_admin", "admin_sede"]:
        print("❌ Usuario NO autorizado para crear profesionales")
        raise HTTPException(status_code=403, detail="No autorizado")

    # --- Sede viene en el modelo ---
    sede_id = profesional.sede_id
    print("🏢 Sede recibida:", sede_id)

    if not sede_id:
        print("❌ No se envió sede_id")
        raise HTTPException(status_code=400, detail="sede_id es obligatorio")

    sede = await collection_locales.find_one({"sede_id": sede_id})
    print("🔎 ¿Sede encontrada?:", sede)

    if not sede:
        print("❌ La sede NO existe:", sede_id)
        raise HTTPException(status_code=404, detail=f"Sede no encontrada: {sede_id}")

    # --- Validar email ---
    email = profesional.email.lower()
    print("📧 Email normalizado:", email)

    exists = await collection_estilista.find_one({"email": email})
    print("🔎 ¿Email ya existe en estilistas?:", exists)

    if exists:
        print("❌ Ya existe profesional con ese email")
        raise HTTPException(status_code=400, detail="Ya existe un profesional con ese email")

    # --- Generar ID ---
    print("⚙️ Generando ID profesional...")
    profesional_id = await generar_id(
        entidad="estilista",
        sede_id=sede_id,
        metadata={"email": email}
    )
    print("🆔 ID generado:", profesional_id)

    # ===================================================
    # 1️⃣ GUARDAR EN STYLIST (SIN CONTRASEÑA)
    # ===================================================
    data_estilista = profesional.dict()
    data_estilista.update({
        "email": email,
        "profesional_id": profesional_id,
        "rol": "estilista",
        "created_by": current_user["email"],
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "activo": True
    })

    data_estilista.pop("password", None)

    print("📤 Datos que se guardarán en collection_estilista:")
    print(data_estilista)

    result_estilista = await collection_estilista.insert_one(data_estilista)
    print("✅ Estilista insertado en MongoDB ID:", result_estilista.inserted_id)

    # ===================================================
    # 2️⃣ GUARDAR EN AUTH
    # ===================================================
    print("🔐 Hasheando contraseña...")
    hashed_password = pwd_context.hash(profesional.password)

    data_auth = {
        "profesional_id": profesional_id,
        "nombre": profesional.nombre,
        "correo_electronico": email,
        "hashed_password": hashed_password,
        "rol": "estilista",
        "sede_id": sede_id,
        "fecha_creacion": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "activo": True,
        "creado_por": current_user["email"],
        "user_type": "staff",
    }

    print("📤 Datos que se guardarán en collection_auth:")
    print(data_auth)

    result_auth = await collection_auth.insert_one(data_auth)
    print("✅ Usuario auth insertado en MongoDB ID:", result_auth.inserted_id)

    # ===================================================
    # RESPUESTA
    # ===================================================
    print("🎉 Profesional creado CORRECTAMENTE")
    print("====================================\n")

    return {
        "msg": "Profesional y usuario creados correctamente",
        "profesional_id": profesional_id,
        "estilista_mongo_id": str(result_estilista.inserted_id),
        "auth_mongo_id": str(result_auth.inserted_id),
        "sede_id": sede_id,
        "correo": email
    }

# ===================================================
# 📋 Listar profesionales (con nombres de servicios + sede_nombre)
# ===================================================
@router.get("/", response_model=list)
async def list_professionals(
    activo: bool = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Lista profesionales según permisos del usuario.
    Incluye nombres de servicios y nombre de la sede.
    """
    query = {"rol": "estilista"}

    # Filtrar por sede si es admin_sede
    if current_user["rol"] == "admin_sede":
        query["sede_id"] = current_user["sede_id"]
    
    # Filtrar por estado activo
    if activo is not None:
        query["activo"] = activo

    professionals = await collection_estilista.find(query).to_list(None)

    for p in professionals:

        # ===================================================
        # ⭐ Obtener nombre de la sede
        # ===================================================
        sede = await collection_locales.find_one({"sede_id": p.get("sede_id")})
        if sede:
            p["sede_nombre"] = sede.get("nombre", "Nombre no registrado")
        else:
            p["sede_nombre"] = "Sede desconocida"

        # ===================================================
        # ⭐ Agregar nombres de servicios
        # ===================================================
        if "especialidades" in p and isinstance(p["especialidades"], list):
            nombres_servicios = []
            for servicio_id in p["especialidades"]:
                servicio = await collection_servicios.find_one({
                    "$or": [
                        {"servicio_id": servicio_id},
                        {"unique_id": servicio_id}
                    ]
                })
                if servicio:
                    nombres_servicios.append({
                        "id": servicio.get("servicio_id") or servicio.get("unique_id"),
                        "nombre": servicio.get("nombre", "Desconocido")
                    })
            p["especialidades_detalle"] = nombres_servicios
        
        profesional_to_dict(p)

    return professionals

# ===================================================
# 🔍 Obtener profesional por ID (incluye sede_nombre)
# ===================================================
@router.get("/{profesional_id}", response_model=dict)
async def get_professional(
    profesional_id: str, 
    current_user: dict = Depends(get_current_user)
):
    """
    Obtiene un profesional por su profesional_id o ObjectId.
    Incluye nombres de servicios y nombre de la sede.
    """

    # ===================================================
    # 🔎 1. Buscar por profesional_id (TU MODELO REAL)
    # ===================================================
    professional = await collection_estilista.find_one({
        "profesional_id": profesional_id,
        "rol": "estilista"
    })

    # ===================================================
    # 🔎 2. Buscar por ObjectId si no existe
    # ===================================================
    if not professional:
        try:
            professional = await collection_estilista.find_one({
                "_id": ObjectId(profesional_id),
                "rol": "estilista"
            })
        except Exception:
            pass

    # ===================================================
    # 🔎 3. Compatibilidad antigua: unique_id
    # ===================================================
    if not professional:
        professional = await collection_estilista.find_one({
            "unique_id": profesional_id,
            "rol": "estilista"
        })

    # ===================================================
    # ❌ No existe
    # ===================================================
    if not professional:
        raise HTTPException(
            status_code=404,
            detail=f"Profesional no encontrado: {profesional_id}"
        )

    # ===================================================
    # ⭐ Añadir nombre de la sede
    # ===================================================
    sede = await collection_locales.find_one({
        "sede_id": professional.get("sede_id")
    })

    professional["sede_nombre"] = (
        sede.get("nombre") if sede else "Sede desconocida"
    )

    # ===================================================
    # ⭐ Añadir nombres de servicios que SÍ presta
    # ===================================================
    servicios_detalle = []

    # 👉 En tu modelo actual NO tienes lista de servicios, tienes *servicios_no_presta*
    # 👉 Por lo tanto: todos los servicios EXCEPTO esos
    servicios_no = professional.get("servicios_no_presta", [])

    cursor = collection_servicios.find({})
    servicios_all = await cursor.to_list(None)  # todos los servicios

    for srv in servicios_all:
        srv_id = srv.get("servicio_id") or srv.get("unique_id")
        if srv_id not in servicios_no:
            servicios_detalle.append({
                "id": srv_id,
                "nombre": srv.get("nombre", "Desconocido")
            })

    professional["servicios_presta"] = servicios_detalle

    # ===================================================
    # 🔄 Convertir a dict limpio antes de devolver
    # ===================================================
    return profesional_to_dict(professional)

# ===================================================
# ✏️ Actualizar profesional (CON NUEVA ESTRUCTURA)
# ===================================================
@router.put("/{profesional_id}", response_model=dict)
async def update_professional(
    profesional_id: str,
    data: Profesional,
    current_user: dict = Depends(get_current_user)
):
    """
    Actualiza los datos de un profesional con NUEVA ESTRUCTURA.
    
    Acepta profesional_id (ES-00247), ObjectId o unique_id.
    
    Permisos: super_admin, admin_sede
    """
    if current_user["rol"] not in ["super_admin", "admin_sede"]:
        raise HTTPException(
            status_code=403, 
            detail="No autorizado para editar profesionales"
        )

    # Preparar datos a actualizar
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    # No permitir cambiar profesional_id ni rol
    update_data.pop("profesional_id", None)
    update_data.pop("rol", None)
    
    # ⭐ Asegurar que especialidades es True (nueva lógica)
    update_data["especialidades"] = True
    
    update_data["updated_at"] = datetime.now()
    update_data["updated_by"] = current_user["email"]

    # ⭐ ACTUALIZAR POR profesional_id PRIMERO
    result = await collection_estilista.update_one(
        {"profesional_id": profesional_id, "rol": "estilista"},
        {"$set": update_data}
    )
    
    # Si no se encuentra, intentar con ObjectId
    if result.matched_count == 0:
        try:
            result = await collection_estilista.update_one(
                {"_id": ObjectId(profesional_id), "rol": "estilista"},
                {"$set": update_data}
            )
        except Exception:
            pass
    
    # Si no se encuentra, intentar con unique_id (compatibilidad)
    if result.matched_count == 0:
        result = await collection_estilista.update_one(
            {"unique_id": profesional_id, "rol": "estilista"},
            {"$set": update_data}
        )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404, 
            detail=f"Profesional no encontrado: {profesional_id}"
        )

    return {
        "msg": "✅ Profesional actualizado correctamente",
        "profesional_id": profesional_id,
        "especialidades": True,
        "servicios_no_presta_actualizados": len(update_data.get("servicios_no_presta", []))
    }

# ===================================================
# 🔄 Actualizar servicios de profesional
# ===================================================
@router.patch("/{profesional_id}/servicios", response_model=dict)
async def update_servicios_profesional(
    profesional_id: str,
    servicios_no_presta: List[str] = [],
    current_user: dict = Depends(get_current_user)
):
    """
    Actualiza SOLO los servicios que NO presta un profesional.
    
    Útil para interfaces específicas de gestión de servicios.
    """
    if current_user["rol"] not in ["super_admin", "admin_sede"]:
        raise HTTPException(
            status_code=403, 
            detail="No autorizado para editar servicios de profesionales"
        )

    update_data = {
        "servicios_no_presta": servicios_no_presta,
        "especialidades": True,  # ⭐ Siempre True
        "updated_at": datetime.now(),
        "updated_by": current_user["email"]
    }

    # Buscar y actualizar
    result = await collection_estilista.update_one(
        {"profesional_id": profesional_id, "rol": "estilista"},
        {"$set": update_data}
    )
    
    # Si no se encuentra, intentar con ObjectId
    if result.matched_count == 0:
        try:
            result = await collection_estilista.update_one(
                {"_id": ObjectId(profesional_id), "rol": "estilista"},
                {"$set": update_data}
            )
        except Exception:
            pass

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404, 
            detail=f"Profesional no encontrado: {profesional_id}"
        )

    return {
        "msg": "✅ Servicios actualizados correctamente",
        "profesional_id": profesional_id,
        "servicios_no_presta_actualizados": len(servicios_no_presta),
        "total_servicios_no_presta": len(servicios_no_presta)
    }

# ===================================================
# ❌ Eliminar profesional (SOFT DELETE)
# ===================================================
@router.delete("/{profesional_id}", response_model=dict)
async def delete_professional(
    profesional_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Desactiva un profesional (soft delete).
    
    Acepta profesional_id (ES-00247), ObjectId o unique_id.
    
    Solo super_admin puede eliminar profesionales.
    """
    if current_user["rol"] != "super_admin":
        raise HTTPException(
            status_code=403, 
            detail="Solo super_admin puede eliminar profesionales"
        )

    # ⭐ SOFT DELETE: marcar como inactivo
    update_data = {
        "activo": False,
        "deleted_at": datetime.now(),
        "deleted_by": current_user["email"]
    }

    # Intentar por profesional_id
    result = await collection_estilista.update_one(
        {"profesional_id": profesional_id, "rol": "estilista"},
        {"$set": update_data}
    )
    
    # Si no se encuentra, intentar con ObjectId
    if result.matched_count == 0:
        try:
            result = await collection_estilista.update_one(
                {"_id": ObjectId(profesional_id), "rol": "estilista"},
                {"$set": update_data}
            )
        except Exception:
            pass
    
    # Si no se encuentra, intentar con unique_id
    if result.matched_count == 0:
        result = await collection_estilista.update_one(
            {"unique_id": profesional_id, "rol": "estilista"},
            {"$set": update_data}
        )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404, 
            detail=f"Profesional no encontrado: {profesional_id}"
        )

    return {
        "msg": "🗑️ Profesional eliminado correctamente",
        "profesional_id": profesional_id
    }

# ===================================================
# 🔍 VALIDAR profesional_id
# ===================================================
@router.get("/validar/{profesional_id}", response_model=dict)
async def validar_profesional_id(
    profesional_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Valida que un profesional_id sea válido y exista.
    Útil antes de crear relaciones (asignar a citas, etc.)
    """
    # Validar formato
    es_valido_formato = await validar_id(profesional_id, entidad="estilista")
    
    if not es_valido_formato:
        raise HTTPException(
            status_code=400, 
            detail=f"Formato de ID inválido. Debe ser: ES-[números]"
        )
    
    # Validar que existe y está activo
    profesional = await collection_estilista.find_one({
        "profesional_id": profesional_id,
        "rol": "estilista",
        "activo": True
    })

    if not profesional:
        raise HTTPException(
            status_code=404, 
            detail=f"No existe profesional activo con ID: {profesional_id}"
        )

    # ⭐ Calcular servicios que SÍ presta para respuesta
    servicios_presta = await obtener_servicios_presta(profesional)

    return {
        "valido": True,
        "profesional_id": profesional_id,
        "nombre": profesional.get("nombre"),
        "email": profesional.get("email"),
        "especialidades": profesional.get("especialidades", True),
        "servicios_no_presta": profesional.get("servicios_no_presta", []),
        "servicios_presta_count": len(servicios_presta),
        "comision": profesional.get("comision", 0)
    }

# ===================================================
# 📊 Estadísticas de profesionales
# ===================================================
@router.get("/{profesional_id}/estadisticas", response_model=dict)
async def get_estadisticas_profesional(
    profesional_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Obtiene estadísticas detalladas de un profesional.
    Incluye conteo de servicios, etc.
    """
    professional = await collection_estilista.find_one({
        "profesional_id": profesional_id, 
        "rol": "estilista"
    })
    
    if not professional:
        raise HTTPException(
            status_code=404, 
            detail=f"Profesional no encontrado: {profesional_id}"
        )

    # Calcular estadísticas
    servicios_presta = await obtener_servicios_presta(professional)
    todos_servicios_sede = await collection_servicios.count_documents({
        "sede_id": professional.get("sede_id"),
        "activo": True
    })

    return {
        "profesional_id": profesional_id,
        "nombre": professional.get("nombre"),
        "estadisticas_servicios": {
            "total_servicios_sede": todos_servicios_sede,
            "servicios_que_presta": len(servicios_presta),
            "servicios_no_presta": len(professional.get("servicios_no_presta", [])),
            "porcentaje_cobertura": (len(servicios_presta) / todos_servicios_sede * 100) if todos_servicios_sede > 0 else 0
        },
        "especialidades": professional.get("especialidades", True),
        "activo": professional.get("activo", True)
    }
