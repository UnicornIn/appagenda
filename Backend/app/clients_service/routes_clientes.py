from fastapi import APIRouter, HTTPException, Depends, Query
from app.clients_service.models import Cliente, NotaCliente,ClientesPaginados
from app.database.mongo import collection_clients, collection_citas, collection_card,collection_servicios, collection_locales,collection_estilista, collection_sales
from app.auth.routes import get_current_user
from app.id_generator.generator import generar_id
from datetime import datetime
from typing import List, Optional
from bson import ObjectId
import logging
import re

logger = logging.getLogger(__name__)

router = APIRouter()


def cliente_to_dict(c: dict) -> dict:
    c["_id"] = str(c["_id"])
    if "cliente_id" not in c or not c["cliente_id"]:
        c["cliente_id"] = str(c["_id"])
    return c


def cita_to_dict(c: dict) -> dict:
    c["_id"] = str(c["_id"])
    return c


async def verificar_duplicado_cliente(
    correo: Optional[str] = None,
    telefono: Optional[str] = None,
    exclude_id: Optional[str] = None
):
    if not correo and not telefono:
        return None

    query = {"$or": []}
    if correo:
        query["$or"].append({"correo": correo})
    if telefono:
        query["$or"].append({"telefono": telefono})

    if exclude_id:
        try:
            query["_id"] = {"$ne": ObjectId(exclude_id)}
        except:
            pass

    return await collection_clients.find_one(query)


# ============================================================
# CREAR CLIENTE
# ============================================================
@router.post("/", response_model=dict)
async def crear_cliente(
    cliente: Cliente,
    current_user: dict = Depends(get_current_user)
):
    try:
        rol = current_user.get("rol")
        if rol not in ["admin_sede", "admin_franquicia", "super_admin"]:
            raise HTTPException(403, "No autorizado")

        sede_autenticada = current_user.get("sede_id", "000")
        
        # ✅ Consultar información de la sede
        sede_info = await collection_locales.find_one({"sede_id": sede_autenticada})
        
        if not sede_info:
            raise HTTPException(400, "Sede no encontrada")
        
        # ✅ Verificar si la sede maneja clientes globales
        es_global = sede_info.get("es_global", False)
        
        # ✅ Generar ID del cliente
        cliente_id = await generar_id("cliente", sede_autenticada)

        data = cliente.dict(exclude_none=True)
        data["cliente_id"] = cliente_id
        data["fecha_creacion"] = datetime.now()
        data["creado_por"] = current_user.get("email", "unknown")
        
        # ⭐ Si es sede global, no asignar sede_id específica
        data["sede_id"] = None if es_global else sede_autenticada
        
        data["pais"] = sede_info.get("pais", "")
        data["notas_historial"] = []

        result = await collection_clients.insert_one(data)
        data["_id"] = str(result.inserted_id)

        return {"success": True, "cliente": data}

    except Exception as e:
        logger.error(f"Error al crear cliente: {e}", exc_info=True)
        raise HTTPException(500, "Error al crear cliente")


# ============================================================
# LISTAR CLIENTES (NORMAL)
# ============================================================

@router.get("/", response_model=List[dict])
async def listar_clientes(
    filtro: Optional[str] = Query(None),
    limite: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user)
):
    try:
        rol = current_user.get("rol")
        if rol not in ["admin_sede", "admin_franquicia", "super_admin", "estilista"]:
            raise HTTPException(403, "No autorizado")

        query = {}

        if rol in ["admin_sede", "estilista"]:
            query["sede_id"] = current_user.get("sede_id")

        if filtro:
            query["$or"] = [
                {"nombre": {"$regex": filtro, "$options": "i"}},
                {"correo": {"$regex": filtro, "$options": "i"}},
                {"telefono": {"$regex": filtro, "$options": "i"}},
                {"cliente_id": {"$regex": filtro, "$options": "i"}},
            ]

        clientes = await collection_clients.find(query).limit(limite).to_list(None)

        return [cliente_to_dict(c) for c in clientes]

    except Exception as e:
        logger.error(f"Error listando clientes: {e}", exc_info=True)
        raise HTTPException(500, "Error al listar clientes")


# ============================================================
# LISTAR TODOS LOS CLIENTES - VERSIÓN OPTIMIZADA
# ============================================================

@router.get("/todos", response_model=ClientesPaginados)
async def listar_todos(
    filtro: Optional[str] = Query(None, description="Búsqueda por nombre, ID o teléfono"),
    limite: int = Query(30, ge=1, le=100),
    pagina: int = Query(1, ge=1),
    current_user: dict = Depends(get_current_user)
):
    """
    Endpoint optimizado para listar clientes con lazy loading.
    
    🚀 OPTIMIZACIONES APLICADAS:
    - Proyección mínima (solo campos necesarios)
    - Count optimizado (estimated cuando es posible)
    - Lazy loading: solo carga la página solicitada
    - Compatible con 43K+ registros
    
    PARÁMETROS:
    - filtro: Texto para buscar (nombre, cedula, teléfono)
    - limite: Items por página (default: 30, max: 100)
    - pagina: Página actual (empieza en 1)
    
    RETORNA:
    - clientes: Lista de clientes de la página actual
    - metadata: Info completa de paginación (total, páginas, etc.)
    """
    try:
        rol = current_user.get("rol")
        
        # ============================================================
        # 🔐 VALIDACIÓN DE PERMISOS
        # ============================================================
        if rol not in ["super_admin", "admin_sede", "estilista"]:
            raise HTTPException(
                status_code=403,
                detail="No tienes permisos para ver clientes"
            )

        # ============================================================
        # 🏢 FILTRO BASE POR SEDE (según rol)
        # ============================================================
        query = {}
        
        if rol in ["admin_sede", "estilista"]:
            sede_id = current_user.get("sede_id")
            
            if not sede_id:
                raise HTTPException(
                    status_code=400,
                    detail="Tu usuario no tiene sede asignada"
                )
            
            # Consultar si la sede es global (optimizado con proyección)
            sede_info = await collection_locales.find_one(
                {"sede_id": sede_id},
                {"es_global": 1, "_id": 0}
            )
            
            
            # Aplicar filtro de sede
            if sede_info and sede_info.get("es_global") == True:
                query["sede_id"] = None  # Sede universal
            else:
                query["sede_id"] = sede_id  # Sede específica

        # ============================================================
        # 🔍 BÚSQUEDA INTELIGENTE (SIN $text search)
        # ============================================================
        if filtro:
            filtro = re.escape(filtro.strip())
            regex_inicio = {"$regex": f"^{filtro}", "$options": "i"}
            regex_contiene = {"$regex": filtro, "$options": "i"}
            
            if not filtro:
                # Filtro vacío después de strip -> ignorar
                pass
            else:
                # ============================================================
                # ESTRATEGIA DE BÚSQUEDA OPTIMIZADA:
                # ============================================================
                # 1. Búsquedas cortas (1-2 chars): Solo inicio (^)
                # 2. Búsquedas largas (3+ chars): Inicio y contiene
                # 3. Usa índices normales (más rápido que $text)
                # ============================================================
                
                if len(filtro) <= 2:
                    # Búsqueda corta: solo inicio de palabra (muy rápido)
                    filtro_condiciones = [
                        {"nombre": regex_inicio},
                        {"cliente_id": regex_inicio},
                        {"telefono": regex_inicio},
                    ]
                else:
                    # Búsqueda larga: inicio + contiene (balance velocidad/resultados)
                    filtro_condiciones = [
                        # Prioridad 1: Empieza con el filtro (usa índice)
                        {"nombre": regex_inicio},
                        {"cliente_id": regex_inicio},
                        {"telefono": regex_inicio},
                        # Prioridad 2: Contiene el filtro (backup)
                        {"nombre": regex_contiene},
                        {"correo": regex_contiene},
                    ]
                
                # Combinar con filtro de sede (si existe)
                if query:
                    query = {
                        "$and": [
                            query,  # Filtro de sede
                            {"$or": filtro_condiciones}  # Búsqueda
                        ]
                    }
                else:
                    query = {"$or": filtro_condiciones}

        # ============================================================
        # 📊 CONTEO OPTIMIZADO
        # ============================================================
        # ESTRATEGIA: Usar estimated_document_count cuando sea posible
        # (es 100x más rápido que count_documents)
        
        if not filtro and not query and rol == "super_admin":
            # Super admin SIN filtros: usar estimación (ultra rápido)
            total_clientes = await collection_clients.estimated_document_count()
        else:
            # Con filtros: usar count normal (usa índices)
            total_clientes = await collection_clients.count_documents(query)

        # ============================================================
        # 📄 PROYECCIÓN: Solo campos necesarios (reduce payload 70%)
        # ============================================================
        projection = {
            "_id": 1,
            "cliente_id": 1,
            "nombre": 1,
            "correo": 1,
            "telefono": 1,
            "sede_id": 1,
            "fecha_registro": 1,
            # ❌ EXCLUIDOS: historial_citas, preferencias, notas, etc.
        }

        # ============================================================
        # 🎯 PAGINACIÓN CALCULADA
        # ============================================================
        skip = (pagina - 1) * limite
        total_paginas = (total_clientes + limite - 1) // limite
        
        # Validar que la página solicitada existe
        if pagina > total_paginas and total_paginas > 0:
            raise HTTPException(
                status_code=404,
                detail=f"Página {pagina} no existe. Total de páginas: {total_paginas}"
            )

        # ============================================================
        # 🚀 QUERY FINAL OPTIMIZADO
        # ============================================================
        cursor = collection_clients.find(query, projection)
        
        # Ordenar alfabéticamente (usa índice de nombre)
        cursor = cursor.sort("nombre", 1)
        
        # Aplicar paginación (lazy loading: solo la página actual)
        cursor = cursor.skip(skip).limit(limite)
        
        # Ejecutar query
        clientes = await cursor.to_list(limite)

        # ============================================================
        # 📦 RESPUESTA CON METADATA COMPLETA
        # ============================================================
        return {
            "clientes": [cliente_to_dict_ligero(c) for c in clientes],
            "metadata": {
                "total": total_clientes,
                "pagina": pagina,
                "limite": limite,
                "total_paginas": total_paginas,
                "tiene_siguiente": pagina < total_paginas,
                "tiene_anterior": pagina > 1,
                "rango_inicio": skip + 1 if clientes else 0,
                "rango_fin": skip + len(clientes)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al obtener clientes: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error al obtener clientes. Por favor intenta de nuevo."
        )


# ============================================================
# 🪶 FUNCIÓN AUXILIAR: Convertir a dict ligero
# ============================================================

def cliente_to_dict_ligero(cliente: dict) -> dict:
    """
    Convierte documento MongoDB a dict ligero para API.
    Solo incluye campos esenciales (reduce payload).
    """
    return {
        "id": str(cliente.get("_id", "")),
        "cliente_id": cliente.get("cliente_id", ""),
        "nombre": cliente.get("nombre", ""),
        "correo": cliente.get("correo", ""),
        "telefono": cliente.get("telefono", ""),
        "sede_id": cliente.get("sede_id"),
        "fecha_registro": cliente.get("fecha_registro")
    }

# ============================================================
# LISTAR CLIENTES POR ID DE SEDE
# ============================================================

@router.get("/filtrar/{id}", response_model=List[dict])
async def listar_por_id(
    id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        rol = current_user.get("rol")

        if rol not in ["super_admin", "admin_franquicia", "admin_sede", "estilista"]:
            raise HTTPException(403, "No autorizado")

        if rol in ["admin_sede", "estilista"]:
            if id != current_user.get("sede_id"):
                raise HTTPException(403, "No tiene permisos para ver esos clientes")

        clientes = await collection_clients.find({"sede_id": id}).to_list(None)
        return [cliente_to_dict(c) for c in clientes]

    except Exception as e:
        logger.error(f"Error filtrando clientes: {e}", exc_info=True)
        raise HTTPException(500, "Error al filtrar clientes")


# ============================================================
# OBTENER CLIENTE
# ============================================================

@router.get("/{id}", response_model=dict)
async def obtener_cliente(
    id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        rol = current_user.get("rol")
        user_sede_id = current_user.get("sede_id")

        if rol not in ["admin_sede", "admin_franquicia", "super_admin", "estilista"]:
            raise HTTPException(status_code=403, detail="No autorizado")

        # 1️⃣ Buscar cliente por cliente_id o _id
        cliente = await collection_clients.find_one({"cliente_id": id})

        if not cliente:
            try:
                cliente = await collection_clients.find_one({"_id": ObjectId(id)})
            except:
                pass

        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        # 2️⃣ Reglas de acceso SOLO para admin_sede / estilista
        if rol in ["admin_sede", "estilista"]:
            cliente_sede_id = cliente.get("sede_id")

            # ✅ Cliente sin sede → permitido
            if cliente_sede_id is None:
                return cliente_to_dict(cliente)

            # 3️⃣ Validar sede del cliente
            sede_cliente = await collection_locales.find_one(
                {"sede_id": cliente_sede_id},
                {"es_global": 1}
            )

            # ✅ Si la sede del cliente es global → permitido
            if sede_cliente and sede_cliente.get("es_global") is True:
                return cliente_to_dict(cliente)

            # ❌ Sede internacional: debe coincidir con la del usuario
            if cliente_sede_id != user_sede_id:
                raise HTTPException(status_code=403, detail="No autorizado")

        # 4️⃣ Roles altos pasan directo
        return cliente_to_dict(cliente)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo cliente {id}: {e}")
        raise HTTPException(status_code=500, detail="Error al obtener cliente")



# ============================================================
# EDITAR CLIENTE
# ============================================================

@router.put("/{id}", response_model=dict)
async def editar_cliente(
    id: str,
    data_update: Cliente,
    current_user: dict = Depends(get_current_user)
):
    try:
        rol = current_user.get("rol")
        if rol not in ["admin_sede", "admin_franquicia", "super_admin"]:
            raise HTTPException(403, "No autorizado")

        cliente = await collection_clients.find_one({"cliente_id": id})

        if not cliente:
            try:
                cliente = await collection_clients.find_one({"_id": ObjectId(id)})
            except:
                pass

        if not cliente:
            raise HTTPException(404, "Cliente no encontrado")

        if rol == "admin_sede" and cliente["sede_id"] != current_user.get("sede_id"):
            raise HTTPException(403, "No autorizado")

        existing = await verificar_duplicado_cliente(
            correo=data_update.correo,
            telefono=data_update.telefono,
            exclude_id=str(cliente["_id"])
        )

        if existing:
            campo = (
                "correo" if data_update.correo == existing.get("correo") else "teléfono"
            )
            raise HTTPException(400, f"Ya existe otro cliente con este {campo}")

        update_data = data_update.dict(exclude_none=True)
        update_data["modificado_por"] = current_user.get("email")
        update_data["fecha_modificacion"] = datetime.now()
        update_data.pop("cliente_id", None)

        await collection_clients.update_one(
            {"_id": cliente["_id"]},
            {"$set": update_data}
        )

        return {"success": True, "msg": "Cliente actualizado"}

    except Exception as e:
        logger.error(f"Error editando cliente: {e}", exc_info=True)
        raise HTTPException(500, "Error al editar cliente")


# ============================================================
# AGREGAR NOTA
# ============================================================

@router.post("/{id}/notas", response_model=dict)
async def agregar_nota(
    id: str,
    nota: NotaCliente,
    current_user: dict = Depends(get_current_user)
):
    try:
        cliente = await collection_clients.find_one({"cliente_id": id})

        if not cliente:
            try:
                cliente = await collection_clients.find_one({"_id": ObjectId(id)})
            except:
                pass

        if not cliente:
            raise HTTPException(404, "Cliente no encontrado")

        nota_obj = nota.dict()
        nota_obj["fecha"] = datetime.now()
        nota_obj["autor"] = current_user.get("email")

        await collection_clients.update_one(
            {"_id": cliente["_id"]},
            {"$push": {"notas_historial": nota_obj}}
        )

        return {"success": True, "msg": "Nota agregada"}

    except Exception as e:
        logger.error(f"Error agregando nota: {e}")
        raise HTTPException(500, "Error al agregar nota")


# ============================================================
# HISTORIAL DEL CLIENTE
# ============================================================

@router.get("/{id}/historial", response_model=List[dict])
async def historial_cliente(
    id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        rol = current_user.get("rol")
        if rol not in ["admin_sede", "admin_franquicia", "super_admin", "estilista"]:
            raise HTTPException(403, "No autorizado")

        citas = await collection_citas.find({"cliente_id": id}).sort("fecha", -1).to_list(None)
        return [cita_to_dict(c) for c in citas]

    except Exception as e:
        logger.error(f"Error historial cliente: {e}")
        raise HTTPException(500, "Error al obtener historial")

# ============================================================
# OBTENER FICHAS DEL CLIENTE (servicio, sede, estilista y sede del estilista)
# ============================================================
@router.get("/fichas/{cliente_id}", response_model=List[dict])
async def obtener_fichas_cliente(
    cliente_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        rol = current_user.get("rol")

        # ---- Permisos ----
        if rol not in ["admin_sede", "admin_franquicia", "super_admin", "estilista"]:
            raise HTTPException(403, "No autorizado")

        # ---- Obtener fichas ----
        fichas = await collection_card.find(
            {"cliente_id": cliente_id}
        ).sort("fecha_ficha", -1).to_list(None)

        if not fichas:
            return []

        # ---- Filtrar por sede ----
        if rol in ["admin_sede", "estilista"]:
            sede_usuario = current_user.get("sede_id")
            fichas = [f for f in fichas if f.get("sede_id") == sede_usuario]

        resultado_final = []

        for ficha in fichas:
            ficha["_id"] = str(ficha["_id"])

            # Normalizar fechas
            for campo in ["fecha_ficha", "fecha_reserva"]:
                if isinstance(ficha.get(campo), datetime):
                    ficha[campo] = ficha[campo].strftime("%Y-%m-%d")

            # ======================================================
            # 1️⃣ Obtener servicio
            # ======================================================
            servicio_nombre = None
            servicio = await collection_servicios.find_one(
                {"servicio_id": ficha.get("servicio_id")}
            )
            if servicio:
                servicio_nombre = servicio.get("nombre")

            # ======================================================
            # 2️⃣ Obtener sede
            # ======================================================
            sede_nombre = None
            sede = await collection_locales.find_one(
                {"sede_id": ficha.get("sede_id")}
            )
            if sede:
                sede_nombre = (
                    sede.get("nombre_sede")
                    or sede.get("nombre")
                    or sede.get("local")
                )

            # ======================================================
            # 3️⃣ Obtener estilista por profesional_id
            # ======================================================
            profesional_id = ficha.get("profesional_id")  # <── AQUÍ!

            estilista_nombre = "Desconocido"
            sede_estilista_nombre = "Desconocida"

            if profesional_id:
                estilista = await collection_estilista.find_one(
                    {"profesional_id": profesional_id}  # <── AQUÍ FUNCIONA
                )

                if estilista:
                    estilista_nombre = estilista.get("nombre")

                    # buscar sede del estilista
                    est_sede_id = estilista.get("sede_id")
                    if est_sede_id:
                        sede_est = await collection_locales.find_one(
                            {"sede_id": est_sede_id}
                        )
                        if sede_est:
                            sede_estilista_nombre = (
                                sede_est.get("nombre_sede")
                                or sede_est.get("nombre")
                                or sede_est.get("local")
                            )

            # ======================================================
            # 4️⃣ Construir respuesta final
            # ======================================================
            resultado_final.append({
                **ficha,
                "servicio": servicio_nombre,
                "sede": sede_nombre,
                "estilista": estilista_nombre,
                "sede_estilista": sede_estilista_nombre,
            })

        return resultado_final

    except Exception as e:
        logger.error(f"Error obteniendo fichas del cliente: {e}", exc_info=True)
        raise HTTPException(500, "Error al obtener fichas del cliente")

# ============================================================
# 📅 Obtener todos los clientes de la sede del usuario autenticado
# ============================================================
@router.get("/clientes/mi-sede", response_model=List[dict])
async def get_clientes_mi_sede(
    current_user: dict = Depends(get_current_user)
):
    # 1️⃣ Verifica que el usuario tenga sede
    sede_usuario = current_user.get("sede_id")
    if not sede_usuario:
        raise HTTPException(
            status_code=400,
            detail="El usuario autenticado no tiene una sede asignada"
        )

    # 2️⃣ Obtener clientes de la sede
    clientes_cursor = collection_clients.find(
        {"sede_id": sede_usuario},
        {"_id": 0}  # opcional
    )

    # Motor necesita to_list()
    clientes = await clientes_cursor.to_list(length=None)

    return clientes  # Devuelve directamente el array
