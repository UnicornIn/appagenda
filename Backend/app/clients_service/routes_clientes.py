from fastapi import APIRouter, HTTPException, Depends, Query
from app.clients_service.models import Cliente, NotaCliente, ClientesPaginados, CalificacionRequest, CalificacionValor
from app.database.mongo import (
    collection_clients, collection_citas, collection_card,
    collection_servicios, collection_locales, collection_estilista, collection_sales
)
from app.auth.routes import get_current_user
from app.id_generator.generator import generar_id
from pymongo.errors import DuplicateKeyError
from datetime import datetime
from typing import List, Optional
from bson import ObjectId
import logging
import re

from rapidfuzz import fuzz

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
# ✅ HELPERS DE BÚSQUEDA INTELIGENTE
# ============================================================
 
def _solo_digitos(texto: str) -> str:
    """Extrae solo los dígitos de un string. Útil para normalizar teléfonos y cédulas."""
    return re.sub(r"\D", "", texto)
 
 
def _tipo_busqueda(termino: str) -> str:
    """
    Clasifica el tipo de búsqueda según el contenido del término.
    Retorna: 'nombre' | 'telefono' | 'cedula_o_id' | 'mixto'
    """
    digitos = _solo_digitos(termino)
    tiene_letras = bool(re.search(r"[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]", termino))
    tiene_digitos = bool(digitos)
 
    if tiene_letras and not tiene_digitos:
        return "nombre"
    if not tiene_letras and tiene_digitos:
        # Si empieza con + o tiene 7+ dígitos → teléfono; si es corto → puede ser ID o cédula
        return "telefono_o_cedula"
    if tiene_letras and tiene_digitos:
        # Mezcla: puede ser cliente_id tipo "CLI-001" o nombre con número
        return "mixto"
    return "nombre"
 
 
def _normalizar_telefono(tel: str) -> str:
    """
    Normaliza teléfono: quita +, espacios, guiones, prefijos de país comunes.
    +573001234567 → 3001234567
    57 300 123 4567 → 3001234567
    """
    digitos = _solo_digitos(tel)
    # Quitar prefijos de país comunes (57=Colombia, 1=USA, 52=México, 34=España, 56=Chile)
    for prefijo in ["57", "1", "52", "34", "56", "51", "593", "591", "595", "598"]:
        if digitos.startswith(prefijo) and len(digitos) > len(prefijo) + 6:
            sin_prefijo = digitos[len(prefijo):]
            # Solo quitar el prefijo si lo que queda parece un número local válido (7-10 dígitos)
            if 7 <= len(sin_prefijo) <= 10:
                digitos = sin_prefijo
                break
    return digitos
 
 
def _score_nombre(termino: str, nombre: str) -> int:
    """
    Score en 3 capas:
    1. token_set_ratio  — robusto para nombres compuestos con palabras en el medio
    2. partial_ratio    — útil para términos cortos de una sola palabra
    3. prefix boost     — el último token puede estar incompleto mientras se escribe:
                          "luisa busta" → "busta" empieza "bustamante" → boost +20
                          Esto resuelve el desafase visual mientras el usuario escribe.
    """
    t = termino.lower().strip()
    n = nombre.lower().strip()
 
    score_set = fuzz.token_set_ratio(t, n)
    score_partial = fuzz.partial_ratio(t, n)
    base = max(score_set, score_partial)
 
    # Prefix boost para el último token (el usuario está escribiendo)
    tokens_termino = t.split()
    if tokens_termino:
        ultimo_token = tokens_termino[-1]
        if len(ultimo_token) >= 2:
            tokens_nombre = n.split()
            prefijo_match = any(p.startswith(ultimo_token) for p in tokens_nombre)
            if prefijo_match:
                # Si los tokens anteriores también están → más confianza → boost mayor
                tokens_previos = tokens_termino[:-1]
                contexto_ok = all(
                    any(fuzz.ratio(tp, tn) >= 70 for tn in tokens_nombre)
                    for tp in tokens_previos
                ) if tokens_previos else True
                boost = 22 if contexto_ok else 10
                base = min(100, base + boost)
 
    return base
 
 
def _umbral_dinamico(termino: str) -> int:
    """
    Ajusta el umbral según la longitud del término.
    Términos cortos necesitan umbral más bajo para no perder resultados válidos.
    """
    n = len(termino.strip())
    if n <= 3:
        return 55   # "Ana" → acepta "Ana María"
    if n <= 6:
        return 65   # "luisa" → acepta "Luisa Fernanda"
    if n <= 12:
        return 72   # "luisa bust" → más específico
    return 78       # términos largos: exigir mayor precisión
 
 
def _aplicar_fuzzy_nombres(clientes: List[dict], termino: str) -> List[dict]:
    """
    Filtra y ordena clientes por similitud de nombre con rapidfuzz.
    Umbral dinámico según longitud del término.
    """
    umbral = _umbral_dinamico(termino)
    scored = []
    for cliente in clientes:
        nombre = cliente.get("nombre") or ""
        score = _score_nombre(termino, nombre)
        if score >= umbral:
            scored.append((score, cliente))
    scored.sort(key=lambda x: (-x[0], (x[1].get("nombre") or "").lower()))
    return [c for _, c in scored]
 
 
def _aplicar_filtro_telefono(clientes: List[dict], termino: str) -> List[dict]:
    """
    Filtra clientes por teléfono normalizando ambos lados.
    Busca si el número normalizado del término está contenido en el teléfono normalizado
    o viceversa. Así '3001234567' encuentra '+57 300 123 4567'.
    """
    termino_norm = _normalizar_telefono(termino)
    if len(termino_norm) < 4:
        return []
 
    resultado = []
    for cliente in clientes:
        tel = cliente.get("telefono") or ""
        tel_norm = _normalizar_telefono(tel)
        # Match si uno contiene al otro (maneja prefijos y sufijos)
        if termino_norm in tel_norm or tel_norm in termino_norm:
            resultado.append(cliente)
    return resultado
 
 
def _aplicar_filtro_cedula(clientes: List[dict], termino: str) -> List[dict]:
    """Filtra clientes por cédula normalizando dígitos."""
    termino_norm = _solo_digitos(termino)
    if len(termino_norm) < 4:
        return []
    resultado = []
    for cliente in clientes:
        cedula = _solo_digitos(cliente.get("cedula") or "")
        if termino_norm in cedula or cedula in termino_norm:
            resultado.append(cliente)
    return resultado
 
 
async def _get_query_base(rol: str, current_user: dict) -> dict:
    """Construye el filtro base de franquicia/sede según el rol."""
    query_base = {}
    if rol in ["admin_sede", "estilista", "call_center", "recepcionista"]:
        sede_id = current_user.get("sede_id")
        if not sede_id:
            raise HTTPException(400, "Tu usuario no tiene sede asignada")
        franquicia_id = await _get_franquicia_id_de_sede(sede_id)
        if franquicia_id:
            query_base["franquicia_id"] = franquicia_id
        else:
            query_base["sede_id"] = sede_id
    return query_base
 
 
async def _buscar_candidatos(
    query_base: dict,
    termino: str,
    tipo: str,
    projection: dict,
    max_candidatos: int = 5000
) -> List[dict]:
    """
    Estrategia de pre-filtro en MongoDB según el tipo de búsqueda.
    Siempre garantiza que los candidatos relevantes estén incluidos.
    """
    if tipo == "nombre":
        # Pre-filtro: nombres que contengan AL MENOS UNO de los tokens
        tokens = [re.escape(t) for t in termino.split() if len(t) >= 2]
        if tokens:
            query = {
                **query_base,
                "$or": [
                    {"nombre": {"$regex": t, "$options": "i"}}
                    for t in tokens
                ]
            }
        else:
            query = query_base
 
    elif tipo == "telefono_o_cedula":
        # Buscar por teléfono Y por cédula simultáneamente
        digitos = _solo_digitos(termino)
        if not digitos:
            return []
        # Regex que busca los dígitos en cualquier posición del campo
        regex_digitos = {"$regex": digitos, "$options": "i"}
        query = {
            **query_base,
            "$or": [
                {"telefono": regex_digitos},
                {"cedula": regex_digitos},
                {"cliente_id": {"$regex": re.escape(termino), "$options": "i"}},
            ]
        }
 
    else:  # mixto (cliente_id tipo "CLI-001")
        query = {
            **query_base,
            "$or": [
                {"cliente_id": {"$regex": re.escape(termino), "$options": "i"}},
                {"nombre": {"$regex": re.escape(termino), "$options": "i"}},
            ]
        }
 
    candidatos = await (
        collection_clients
        .find(query, projection)
        .limit(max_candidatos)
        .to_list(max_candidatos)
    )
 
    # Fallback: si no hay resultados, ampliar sin restricción de campo
    if len(candidatos) < 3 and tipo == "nombre":
        candidatos = await (
            collection_clients
            .find(query_base, projection)
            .limit(max_candidatos)
            .to_list(max_candidatos)
        )
 
    return candidatos
 
 
def _puntuar_y_ordenar(candidatos: List[dict], termino: str, tipo: str) -> List[dict]:
    """
    Aplica el algoritmo de scoring adecuado según el tipo de búsqueda
    y retorna la lista ordenada por relevancia.
    """
    if tipo == "nombre":
        return _aplicar_fuzzy_nombres(candidatos, termino)
 
    elif tipo == "telefono_o_cedula":
        # Para teléfonos y cédulas: match exacto por contenido, sin fuzzy
        por_tel = _aplicar_filtro_telefono(candidatos, termino)
        por_ced = _aplicar_filtro_cedula(candidatos, termino)
        # Combinar sin duplicados, teléfono primero
        ids_vistos = set()
        resultado = []
        for c in por_tel + por_ced:
            cid = str(c.get("_id", ""))
            if cid not in ids_vistos:
                ids_vistos.add(cid)
                resultado.append(c)
        return resultado
 
    else:  # mixto
        # Para cliente_id u otros mixtos: devolver como vienen (ya filtrados por MongoDB)
        return candidatos


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
        if rol not in ["admin_sede", "admin_franquicia", "super_admin", "call_center", "recepcionista"]:
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

        for intento in range(5):
            try:
                result = await collection_clients.insert_one(data)
                break  # éxito
            except DuplicateKeyError:
                if intento == 4:
                    raise HTTPException(500, "No se pudo generar un ID único. Intenta de nuevo.")
                data.pop("_id", None)  # ← LÍNEA 1: limpiar _id que Motor inyectó
                data["cliente_id"] = await generar_id("cliente", sede_objetivo)

        data["_id"] = str(result.inserted_id)  # ← LÍNEA 2: convertir para el return
        return {"success": True, "cliente": data}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al crear cliente: {e}", exc_info=True)
        raise HTTPException(500, "Error al crear cliente")


# ============================================================
# LISTAR CLIENTES (endpoint simple — usado por el modal de reservas)
# ============================================================
@router.get("/", response_model=List[dict])
async def listar_clientes(
    filtro: Optional[str] = Query(None),
    limite: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user)
):
    try:
        rol = current_user.get("rol")
        if rol not in ["admin_sede", "super_admin", "estilista", "call_center", "recepcionista"]:
            raise HTTPException(403, "No autorizado")
 
        query_base = await _get_query_base(rol, current_user)
        filtro_limpio = filtro.strip() if filtro else None
 
        if not filtro_limpio:
            clientes = await collection_clients.find(query_base).limit(limite).to_list(None)
            return [cliente_to_dict(c) for c in clientes]
 
        tipo = _tipo_busqueda(filtro_limpio)
 
        candidatos = await _buscar_candidatos(
            query_base=query_base,
            termino=filtro_limpio,
            tipo=tipo,
            projection={},        # proyección completa para este endpoint
            max_candidatos=5000
        )
 
        resultado = _puntuar_y_ordenar(candidatos, filtro_limpio, tipo)
        return [cliente_to_dict(c) for c in resultado[:limite]]
 
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listando clientes: {e}", exc_info=True)
        raise HTTPException(500, "Error al listar clientes")
 
 
# ============================================================
# LISTAR TODOS — CON PAGINACIÓN Y BÚSQUEDA INTELIGENTE
# ============================================================
@router.get("/todos", response_model=ClientesPaginados)
async def listar_todos(
    filtro: Optional[str] = Query(None, description="Búsqueda por nombre, teléfono, cédula o ID"),
    limite: int = Query(30, ge=1, le=100),
    pagina: int = Query(1, ge=1),
    current_user: dict = Depends(get_current_user)
):
    """
    Búsqueda inteligente de clientes con lazy loading.
    - Nombres: fuzzy con token_set_ratio + partial_ratio, umbral dinámico
    - Teléfonos: normaliza prefijos de país (+57, 57, etc.)
    - Cédulas: normaliza dígitos, búsqueda por contención
    - IDs: regex exacto
    """
    try:
        rol = current_user.get("rol")
        if rol not in ["super_admin", "admin_sede", "estilista", "call_center", "recepcionista"]:
            raise HTTPException(403, "No tienes permisos para ver clientes")
 
        query_base = await _get_query_base(rol, current_user)
        filtro_limpio = filtro.strip() if filtro else None
 
        projection = {
            "_id": 1, "cliente_id": 1, "nombre": 1, "correo": 1,
            "telefono": 1, "cedula": 1, "sede_id": 1, "franquicia_id": 1,
            "fecha_registro": 1,
        }
 
        # ── SIN FILTRO: comportamiento original con paginación ──────────────
        if not filtro_limpio:
            if rol == "super_admin" and not query_base:
                total_clientes = await collection_clients.estimated_document_count()
            else:
                total_clientes = await collection_clients.count_documents(query_base)
 
            skip = (pagina - 1) * limite
            total_paginas = max(1, (total_clientes + limite - 1) // limite)
 
            if pagina > total_paginas and total_paginas > 0:
                raise HTTPException(404, f"Página {pagina} no existe. Total: {total_paginas}")
 
            clientes = await (
                collection_clients.find(query_base, projection)
                .sort("nombre", 1).skip(skip).limit(limite)
                .to_list(limite)
            )
            return {
                "clientes": [cliente_to_dict_ligero(c) for c in clientes],
                "metadata": {
                    "total": total_clientes, "pagina": pagina, "limite": limite,
                    "total_paginas": total_paginas,
                    "tiene_siguiente": pagina < total_paginas,
                    "tiene_anterior": pagina > 1,
                    "rango_inicio": skip + 1 if clientes else 0,
                    "rango_fin": skip + len(clientes),
                }
            }
 
        # ── CON FILTRO: búsqueda inteligente ────────────────────────────────
        tipo = _tipo_busqueda(filtro_limpio)
        logger.info(f"[BUSQUEDA] filtro='{filtro_limpio}' tipo='{tipo}'")
 
        candidatos = await _buscar_candidatos(
            query_base=query_base,
            termino=filtro_limpio,
            tipo=tipo,
            projection=projection,
            max_candidatos=5000
        )
        logger.info(f"[BUSQUEDA] candidatos MongoDB: {len(candidatos)}")
 
        resultado = _puntuar_y_ordenar(candidatos, filtro_limpio, tipo)
        logger.info(f"[BUSQUEDA] resultado final: {len(resultado)} — top3: {[c.get('nombre') for c in resultado[:3]]}")
 
        # Paginación sobre resultado en memoria
        total_clientes = len(resultado)
        total_paginas = max(1, (total_clientes + limite - 1) // limite)
 
        if pagina > total_paginas and total_paginas > 0:
            raise HTTPException(404, f"Página {pagina} no existe. Total: {total_paginas}")
 
        skip = (pagina - 1) * limite
        clientes_pagina = resultado[skip: skip + limite]
 
        return {
            "clientes": [cliente_to_dict_ligero(c) for c in clientes_pagina],
            "metadata": {
                "total": total_clientes, "pagina": pagina, "limite": limite,
                "total_paginas": total_paginas,
                "tiene_siguiente": pagina < total_paginas,
                "tiene_anterior": pagina > 1,
                "rango_inicio": skip + 1 if clientes_pagina else 0,
                "rango_fin": skip + len(clientes_pagina),
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

        if rol not in ["super_admin", "admin_sede", "estilista", "call_center", "recepcionista"]:
            raise HTTPException(403, "No autorizado")

        if rol in ["admin_sede", "estilista", "call_center", "recepcionista"]:
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

        if rol not in ["admin_sede", "super_admin", "estilista", "call_center", "recepcionista"]:
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
        if rol in ["admin_sede", "estilista", "call_center", "recepcionista"]:
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
        if rol not in ["admin_sede", "super_admin", "call_center", "recepcionista"]:
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
        if rol not in ["admin_sede", "super_admin", "estilista", "call_center", "recepcionista"]:
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

        if rol not in ["admin_sede", "super_admin", "estilista", "call_center", "recepcionista"]:
            raise HTTPException(403, "No autorizado")

        fichas = await collection_card.find(
            {"cliente_id": cliente_id}
        ).sort("fecha_ficha", -1).to_list(None)

        if not fichas:
            return []

        # Filtrar por sede para roles no super_admin
        if rol in ["admin_sede", "estilista", "call_center", "recepcionista"]:
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

# ─── ENDPOINT PUT ────────────────────────────────────────────────
@router.put("/{cliente_id}/calificacion", response_model=dict)
async def actualizar_calificacion_cliente(
    cliente_id: str,
    body: CalificacionRequest,
    current_user: dict = Depends(get_current_user)
):
    # Solo roles con acceso a gestión de clientes
    ROLES_PERMITIDOS = {"admin_sede", "super_admin", "recepcionista", "estilista", "call_center"}
    if current_user["rol"] not in ROLES_PERMITIDOS:
        raise HTTPException(status_code=403, detail="No tienes permisos para calificar clientes")

    cliente = await collection_clients.find_one({"cliente_id": cliente_id})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    ahora = datetime.now()
    email_usuario = current_user.get("email")

    # Entrada para el historial
    entrada_historial = {
        "valor": body.calificacion,
        "fecha": ahora,
        "registrado_por": email_usuario,
        "cita_id": body.cita_id or None,
        "nota": body.nota or "",
    }

    await collection_clients.update_one(
        {"cliente_id": cliente_id},
        {
            "$set": {
                "calificacion": body.calificacion,
                "calificacion_actualizada_en": ahora,
                "calificacion_actualizada_por": email_usuario,
            },
            "$push": {
                "calificacion_historial": entrada_historial
            }
        }
    )

    nombre_cliente = f"{cliente.get('nombre', '')} {cliente.get('apellido', '')}".strip()
    print(f"⭐ Calificación '{body.calificacion}' asignada a {nombre_cliente} por {email_usuario}")

    return {
        "success": True,
        "message": f"Calificación actualizada correctamente",
        "data": {
            "cliente_id": cliente_id,
            "nombre": nombre_cliente,
            "calificacion_anterior": cliente.get("calificacion"),  # null si no tenía
            "calificacion_nueva": body.calificacion,
            "actualizado_por": email_usuario,
            "fecha": ahora.isoformat(),
        }
    }


# ─── ENDPOINT GET (para que el frontend cargue la calificación actual) ──
@router.get("/{cliente_id}/calificacion", response_model=dict)
async def obtener_calificacion_cliente(
    cliente_id: str,
    current_user: dict = Depends(get_current_user)
):
    cliente = await collection_clients.find_one(
        {"cliente_id": cliente_id},
        {"calificacion": 1, "calificacion_actualizada_en": 1,
         "calificacion_actualizada_por": 1, "nombre": 1, "apellido": 1}
    )
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    return {
        "cliente_id": cliente_id,
        "calificacion": cliente.get("calificacion"),          # None si nunca fue calificado
        "actualizada_en": cliente.get("calificacion_actualizada_en"),
        "actualizada_por": cliente.get("calificacion_actualizada_por"),
    }