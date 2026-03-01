from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from datetime import datetime


# =========================================================
# 🔐 MODELOS DE USUARIO
# =========================================================

class UserBase(BaseModel):
    nombre: str
    correo_electronico: EmailStr
    rol: str
    sede_id: Optional[str] = None
    activo: bool = True


class UserCreate(UserBase):
    password: str


class UserInDB(UserBase):
    hashed_password: str
    fecha_creacion: Optional[str] = None
    ultimo_acceso: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    nombre: str
    correo_electronico: str
    rol: str
    sede_id: Optional[str] = None
    franquicia_id: Optional[str] = None
    activo: bool
    fecha_creacion: Optional[str] = None
    creado_por: Optional[str] = None

# =========================================================
# 🔑 TOKEN Y RESPUESTA DE LOGIN
# =========================================================

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    rol: str
    nombre: str
    email: str
    sede_id: Optional[str] = None


class TokenData(BaseModel):
    sub: str
    rol: str

# =========================================================
# ✏️ UPDATE USER - todos los campos son opcionales (PATCH)
# =========================================================

class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")  # rechaza campos desconocidos

    nombre: Optional[str] = None
    correo_electronico: Optional[EmailStr] = None
    rol: Optional[str] = None
    sede_id: Optional[str] = None
    franquicia_id: Optional[str] = None
    activo: Optional[bool] = None
    password: Optional[str] = None


class UserUpdateResponse(BaseModel):
    id: str
    nombre: str
    correo_electronico: str
    rol: str
    sede_id: Optional[str] = None
    franquicia_id: Optional[str] = None
    activo: bool
    modificado_por: str
    fecha_modificacion: str
