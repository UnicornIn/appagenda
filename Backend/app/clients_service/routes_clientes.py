from fastapi import APIRouter, HTTPException, Depends, Query
from app.clients_service.models import Cliente, NotaCliente, ClientesPaginados
from app.database.mongo import (
    collection_clients, collection_citas, collection_card,
    collection_servicios, collection_locales, collection_estilista, collection_sales
)
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


async def _get_franquicia_id_de_sede(sede_id: str) -> Optional[str]:
    """Obtiene el franquicia_id de una sede. Utilidad reutilizable."""
    if not sede_id:
        return None
    sede = await collection_locales.find_one(
        {"sede_id": sede_id},
        {"franquicia_id": 1, "_id": 0}
    )
    return sede.get("franquicia_id") if sede else None


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

        sede_autenticada = current_user.get("sede_id")
        sede_objetivo = sede_autenticada or cliente.sede_id

        if not sede_objetivo:
            raise HTTPException(
                status_code=400,
                detail="Debes seleccionar una sede para crear el cliente"
            )

        # Consultar información de la sede
        sede_info = await collection_locales.find_one({"sede_id": sede_objetivo})
        if not sede_info:
            raise HTTPException(400, f"Sede no encontrada: {sede_objetivo}")

        # Obtener franquicia_id de la sede
        franquicia_id = sede_info.get("franquicia_id")

        # Generar ID del cliente
        cliente_id = await generar_id("cliente", sede_objetivo)

        data = cliente.dict(exclude_none=True)
        data["cliente_id"] = cliente_id
        data["fecha_creacion"] = datetime.now()
        data["creado_por"] = current_user.get("email", "unknown")
        data["sede_id"] = sede_objetivo
        data["franquicia_id"] = franquicia_id  # ⭐ Heredado de la sede
        data["pais"] = sede_info.get("pais", "")
        data["notas_historial"] = []

        # Limpiar campo obsoleto si venía en el payload
        data.pop("es_global", None)

        result = await collection_clients.insert_one(data)
        data["_id"] = str(result.inserted_id)

        return {"success": True, "cliente": data}

    except HTTPException:
        raise
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
        if rol not in ["admin_sede", "super_admin", "estilista"]:
            raise HTTPException(403, "No autorizado")

        query = {}

        if rol in ["admin_sede", "estilista"]:
            sede_id = current_user.get("sede_id")
            franquicia_id = await _get_franquicia_id_de_sede(sede_id)

            if franquicia_id:
                # ⭐ Filtrar por franquicia: muestra todos los clientes de la franquicia
                query["franquicia_id"] = franquicia_id
            else:
                # Fallback: solo clientes de la sede específica
                query["sede_id"] = sede_id

        if filtro:
            filtro_regex = {"$regex": filtro, "$options": "i"}
            filtro_condiciones = [
                {"nombre": filtro_regex},
                {"correo": filtro_regex},
                {"telefono": filtro_regex},
                {"cliente_id": filtro_regex},
            ]
            if query:
                query = {"$and": [query, {"$or": filtro_condiciones}]}
            else:
                query["$or"] = filtro_condiciones

        clientes = await collection_clients.find(query).limit(limite).to_list(None)
        return [cliente_to_dict(c) for c in clientes]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listando clientes: {e}", exc_info=True)
        raise HTTPException(500, "Error al listar clientes")


# ============================================================
# LISTAR TODOS LOS CLIENTES - VERSIÓN OPTIMIZADA CON PAGINACIÓN
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
    Filtra por franquicia_id para admin_sede y estilista.
    """
    try:
        rol = current_user.get("rol")

        if rol not in ["super_admin", "admin_sede", "estilista"]:
            raise HTTPException(403, "No tienes permisos para ver clientes")

        # ============================================================
        # 🏢 FILTRO BASE POR FRANQUICIA (según rol)
        # ============================================================
        query = {}

        if rol in ["admin_sede", "estilista"]:
            sede_id = current_user.get("sede_id")

            if not sede_id:
                raise HTTPException(400, "Tu usuario no tiene sede asignada")

            # Obtener franquicia_id de la sede (con proyección mínima)
            sede_info = await collection_locales.find_one(
                {"sede_id": sede_id},
                {"franquicia_id": 1, "_id": 0}
            )

            franquicia_id = sede_info.get("franquicia_id") if sede_info else None

            if franquicia_id:
                # ⭐ Muestra todos los clientes de la franquicia
                query["franquicia_id"] = franquicia_id
            else:
                # Fallback: solo sede específica (sede sin franquicia asignada)
                query["sede_id"] = sede_id

        # ============================================================
        # 🔍 BÚSQUEDA INTELIGENTE
        # ============================================================
        if filtro:
            filtro_escapado = re.escape(filtro.strip())

            if not filtro_escapado:
                pass
            else:
                regex_inicio = {"$regex": f"^{filtro_escapado}", "$options": "i"}
                regex_contiene = {"$regex": filtro_escapado, "$options": "i"}

                if len(filtro_escapado) <= 2:
                    filtro_condiciones = [
                        {"nombre": regex_inicio},
                        {"cliente_id": regex_inicio},
                        {"telefono": regex_inicio},
                    ]
                else:
                    filtro_condiciones = [
                        {"nombre": regex_inicio},
                        {"cliente_id": regex_inicio},
                        {"telefono": regex_inicio},
                        {"nombre": regex_contiene},
                        {"correo": regex_contiene},
                    ]

                if query:
                    query = {"$and": [query, {"$or": filtro_condiciones}]}
                else:
                    query = {"$or": filtro_condiciones}

        # ============================================================
        # 📊 CONTEO OPTIMIZADO
        # ============================================================
        if not filtro and not query and rol == "super_admin":
            total_clientes = await collection_clients.estimated_document_count()
        else:
            total_clientes = await collection_clients.count_documents(query)

        # ============================================================
        # 📄 PROYECCIÓN MÍNIMA
        # ============================================================
        projection = {
            "_id": 1,
            "cliente_id": 1,
            "nombre": 1,
            "correo": 1,
            "telefono": 1,
            "sede_id": 1,
            "franquicia_id": 1,
            "fecha_registro": 1,
        }

        # ============================================================
        # 🎯 PAGINACIÓN
        # ============================================================
        skip = (pagina - 1) * limite
        total_paginas = (total_clientes + limite - 1) // limite if total_clientes > 0 else 1

        if pagina > total_paginas and total_paginas > 0:
            raise HTTPException(
                404,
                f"Página {pagina} no existe. Total de páginas: {total_paginas}"
            )

        cursor = collection_clients.find(query, projection)
        cursor = cursor.sort("nombre", 1).skip(skip).limit(limite)
        clientes = await cursor.to_list(limite)

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
        raise HTTPException(500, "Error al obtener clientes. Por favor intenta de nuevo.")


# ============================================================
# 🪶 FUNCIÓN AUXILIAR: Convertir a dict ligero
# ============================================================
def cliente_to_dict_ligero(cliente: dict) -> dict:
    return {
        "id": str(cliente.get("_id", "")),
        "cliente_id": cliente.get("cliente_id", ""),
        "nombre": cliente.get("nombre", ""),
        "correo": cliente.get("correo", ""),
        "telefono": cliente.get("telefono", ""),
        "sede_id": cliente.get("sede_id"),
        "franquicia_id": cliente.get("franquicia_id"),
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

        if rol not in ["super_admin", "admin_sede", "estilista"]:
            raise HTTPException(403, "No autorizado")

        if rol in ["admin_sede", "estilista"]:
            if id != current_user.get("sede_id"):
                raise HTTPException(403, "No tiene permisos para ver esos clientes")

        clientes = await collection_clients.find({"sede_id": id}).to_list(None)
        return [cliente_to_dict(c) for c in clientes]

    except HTTPException:
        raise
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

        if rol not in ["admin_sede", "super_admin", "estilista"]:
            raise HTTPException(status_code=403, detail="No autorizado")

        # Buscar cliente por cliente_id o _id
        cliente = await collection_clients.find_one({"cliente_id": id})
        if not cliente:
            try:
                cliente = await collection_clients.find_one({"_id": ObjectId(id)})
            except:
                pass

        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        # Validación de acceso para admin_sede y estilista
        if rol in ["admin_sede", "estilista"]:
            cliente_franquicia_id = cliente.get("franquicia_id")
            user_franquicia_id = await _get_franquicia_id_de_sede(user_sede_id)

            if cliente_franquicia_id and user_franquicia_id:
                # ⭐ Si comparten franquicia → acceso permitido
                if cliente_franquicia_id != user_franquicia_id:
                    raise HTTPException(status_code=403, detail="No autorizado")
            elif cliente.get("sede_id") and cliente.get("sede_id") != user_sede_id:
                # Fallback: verificar por sede directa
                raise HTTPException(status_code=403, detail="No autorizado")

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
        if rol not in ["admin_sede", "super_admin"]:
            raise HTTPException(403, "No autorizado")

        cliente = await collection_clients.find_one({"cliente_id": id})
        if not cliente:
            try:
                cliente = await collection_clients.find_one({"_id": ObjectId(id)})
            except:
                pass

        if not cliente:
            raise HTTPException(404, "Cliente no encontrado")

        # Validar acceso por franquicia
        if rol == "admin_sede":
            user_sede_id = current_user.get("sede_id")
            user_franquicia_id = await _get_franquicia_id_de_sede(user_sede_id)
            cliente_franquicia_id = cliente.get("franquicia_id")

            tiene_acceso = (
                (user_franquicia_id and user_franquicia_id == cliente_franquicia_id) or
                cliente.get("sede_id") == user_sede_id
            )

            if not tiene_acceso:
                raise HTTPException(403, "No autorizado")

        existing = await verificar_duplicado_cliente(
            correo=data_update.correo,
            telefono=data_update.telefono,
            exclude_id=str(cliente["_id"])
        )

        if existing:
            campo = "correo" if data_update.correo == existing.get("correo") else "teléfono"
            raise HTTPException(400, f"Ya existe otro cliente con este {campo}")

        update_data = data_update.dict(exclude_none=True)
        update_data["modificado_por"] = current_user.get("email")
        update_data["fecha_modificacion"] = datetime.now()
        update_data.pop("cliente_id", None)
        update_data.pop("es_global", None)  # Nunca permitir setear campo obsoleto

        await collection_clients.update_one(
            {"_id": cliente["_id"]},
            {"$set": update_data}
        )

        return {"success": True, "msg": "Cliente actualizado"}

    except HTTPException:
        raise
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

    except HTTPException:
        raise
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
        if rol not in ["admin_sede", "super_admin", "estilista"]:
            raise HTTPException(403, "No autorizado")

        citas = await collection_citas.find({"cliente_id": id}).sort("fecha", -1).to_list(None)
        return [cita_to_dict(c) for c in citas]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error historial cliente: {e}")
        raise HTTPException(500, "Error al obtener historial")


# ============================================================
# OBTENER FICHAS DEL CLIENTE
# ============================================================
@router.get("/fichas/{cliente_id}", response_model=List[dict])
async def obtener_fichas_cliente(
    cliente_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        rol = current_user.get("rol")

        if rol not in ["admin_sede", "super_admin", "estilista"]:
            raise HTTPException(403, "No autorizado")

        fichas = await collection_card.find(
            {"cliente_id": cliente_id}
        ).sort("fecha_ficha", -1).to_list(None)

        if not fichas:
            return []

        # Filtrar por sede para roles no super_admin
        if rol in ["admin_sede", "estilista"]:
            sede_usuario = current_user.get("sede_id")
            fichas = [f for f in fichas if f.get("sede_id") == sede_usuario]

        resultado_final = []

        for ficha in fichas:
            ficha["_id"] = str(ficha["_id"])

            for campo in ["fecha_ficha", "fecha_reserva"]:
                if isinstance(ficha.get(campo), datetime):
                    ficha[campo] = ficha[campo].strftime("%Y-%m-%d")

            servicio_nombre = None
            servicio = await collection_servicios.find_one({"servicio_id": ficha.get("servicio_id")})
            if servicio:
                servicio_nombre = servicio.get("nombre")

            sede_nombre = None
            sede = await collection_locales.find_one({"sede_id": ficha.get("sede_id")})
            if sede:
                sede_nombre = sede.get("nombre_sede") or sede.get("nombre") or sede.get("local")

            profesional_id = ficha.get("profesional_id")
            estilista_nombre = "Desconocido"
            sede_estilista_nombre = "Desconocida"

            if profesional_id:
                estilista = await collection_estilista.find_one({"profesional_id": profesional_id})
                if estilista:
                    estilista_nombre = estilista.get("nombre")
                    est_sede_id = estilista.get("sede_id")
                    if est_sede_id:
                        sede_est = await collection_locales.find_one({"sede_id": est_sede_id})
                        if sede_est:
                            sede_estilista_nombre = (
                                sede_est.get("nombre_sede") or
                                sede_est.get("nombre") or
                                sede_est.get("local")
                            )

            resultado_final.append({
                **ficha,
                "servicio": servicio_nombre,
                "sede": sede_nombre,
                "estilista": estilista_nombre,
                "sede_estilista": sede_estilista_nombre,
            })

        return resultado_final

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo fichas del cliente: {e}", exc_info=True)
        raise HTTPException(500, "Error al obtener fichas del cliente")


# ============================================================
# CLIENTES DE MI SEDE
# ============================================================
@router.get("/clientes/mi-sede", response_model=List[dict])
async def get_clientes_mi_sede(
    current_user: dict = Depends(get_current_user)
):
    sede_usuario = current_user.get("sede_id")
    if not sede_usuario:
        raise HTTPException(400, "El usuario autenticado no tiene una sede asignada")

    clientes_cursor = collection_clients.find({"sede_id": sede_usuario}, {"_id": 0})
    return await clientes_cursor.to_list(length=None)