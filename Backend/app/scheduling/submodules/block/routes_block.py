from fastapi import APIRouter, HTTPException, Depends, status
from app.scheduling.models import Bloqueo
from app.database.mongo import collection_block
from app.auth.routes import get_current_user
from datetime import datetime, time, date
from typing import List
from bson import ObjectId

router = APIRouter()


# =========================================================
# 🧩 Helper para convertir ObjectId a string
# =========================================================
def bloqueo_to_dict(b):
    b["_id"] = str(b["_id"])
    return b

def date_to_datetime(d: date) -> datetime:
    return datetime.combine(d, time.min)


# =========================================================
# 🔹 Crear bloqueo (admin_sede, admin_franquicia, super_admin, estilista)
# =========================================================
@router.post("/", response_model=dict)
async def crear_bloqueo(
    bloqueo: Bloqueo,
    current_user: dict = Depends(get_current_user)
):
    rol = current_user["rol"]
    if rol not in ["admin_sede", "admin_franquicia", "super_admin", "estilista"]:
        raise HTTPException(status_code=403, detail="No autorizado")

    # 🔎 Buscar bloqueos del mismo profesional
    bloqueos = await collection_block.find({
        "profesional_id": bloqueo.profesional_id
    }).to_list(None)

    for b in bloqueos:
        # 1️⃣ Coinciden días de la semana
        dias_comunes = set(b["repeat"]["days_of_week"]) & set(bloqueo.repeat.days_of_week)
        if not dias_comunes:
            continue

        # 2️⃣ Coinciden horas
        if not (
            bloqueo.end_time <= b["start_time"] or
            bloqueo.start_time >= b["end_time"]
        ):
            raise HTTPException(
                status_code=400,
                detail="Solapamiento con otro bloqueo recurrente"
            )

    data = bloqueo.dict()

    # 🔁 fechas principales
    data["start_date"] = date_to_datetime(bloqueo.start_date)

    #    🔁 repeat.until
    if bloqueo.repeat.until:
        data["repeat"]["until"] = date_to_datetime(bloqueo.repeat.until)

    # 🔁 listas de fechas
    data["repeat"]["exclude_dates"] = [
        date_to_datetime(d) for d in bloqueo.repeat.exclude_dates
]

    data["repeat"]["include_dates"] = [
        date_to_datetime(d) for d in bloqueo.repeat.include_dates
]

    data["creado_por"] = current_user["email"]
    data["fecha_creacion"] = datetime.now()

    result = await collection_block.insert_one(data)
    data["_id"] = str(result.inserted_id)

    return {"msg": "Bloqueo creado correctamente", "bloqueo": data}



# =========================================================
# 🔹 Listar bloqueos de un profesional
# =========================================================
@router.get("/{profesional_id}", response_model=List[dict])
async def listar_bloqueos_profesional(
    profesional_id: str,
    current_user: dict = Depends(get_current_user)
):
    rol = current_user["rol"]

    if rol == "estilista" and current_user["profesional_id"] != profesional_id:
        raise HTTPException(status_code=403, detail="No autorizado")

    bloqueos = await collection_block.find({
        "profesional_id": profesional_id
    }).to_list(None)

    return [bloqueo_to_dict(b) for b in bloqueos]

# =========================================================
# 🔹 Eliminar un día específico de un bloqueo recurrente
# =========================================================

@router.patch("/{bloqueo_id}/exclude-day", response_model=dict)
async def excluir_dia_bloqueo(
    bloqueo_id: str,
    fecha: date,
    current_user: dict = Depends(get_current_user)
):
    result = await collection_block.update_one(
        {"_id": ObjectId(bloqueo_id)},
        {"$addToSet": {"repeat.exclude_dates": date_to_datetime(fecha)}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bloqueo no encontrado")

    return {"msg": "Día excluido del bloqueo"}

# =========================================================
# 🔹 Eliminar bloqueo
# =========================================================
@router.delete("/{bloqueo_id}", response_model=dict)
async def eliminar_bloqueo(
    bloqueo_id: str,
    current_user: dict = Depends(get_current_user)
):
    rol = current_user["rol"]

    # 🔎 Buscar el bloqueo primero
    bloqueo = await collection_block.find_one({"_id": ObjectId(bloqueo_id)})

    if not bloqueo:
        raise HTTPException(status_code=404, detail="Bloqueo no encontrado")

    # =====================================================
    # 🔐 1. SUPER ADMIN → puede eliminar cualquier bloqueo
    # =====================================================
    if rol == "super_admin":
        pass  # permitido

    # =====================================================
    # 🔐 2. ADMIN SEDE → solo bloqueos de su misma sede
    # =====================================================
    elif rol == "admin_sede":
        if bloqueo.get("sede_id") != current_user.get("sede_id"):
            raise HTTPException(status_code=403, detail="No autorizado para eliminar este bloqueo")

    # =====================================================
    # 🔐 3. ESTILISTA → solo sus propios bloqueos
    # =====================================================
    elif rol == "estilista":
        if bloqueo.get("profesional_id") != current_user.get("profesional_id"):
            raise HTTPException(status_code=403, detail="No autorizado para eliminar este bloqueo")

    # =====================================================
    # ❌ Otros roles no permitidos
    # =====================================================
    else:
        raise HTTPException(status_code=403, detail="No autorizado para eliminar bloqueos")

    # =====================================================
    # 🗑️  Eliminar bloqueo
    # =====================================================
    result = await collection_block.delete_one({"_id": ObjectId(bloqueo_id)})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bloqueo no encontrado")

    return {"msg": "Bloqueo eliminado correctamente"}

