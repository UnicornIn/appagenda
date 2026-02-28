from fastapi import APIRouter, HTTPException, Form, Depends, status
from datetime import datetime, timedelta
from fastapi import Cookie, Response
from jose import jwt, JWTError
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import Response
from app.auth.controllers import (
    create_access_token,
    pwd_context,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    SECRET_KEY,
    ALGORITHM,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_refresh_token
)
from app.auth.models import TokenResponse
from app.database.mongo import (
    collection_auth,
    collection_estilista,
    collection_admin_sede,
    collection_admin_franquicia
)

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


# ==============================================================
# ✅ Obtener usuario autenticado (con sede_id y franquicia_id)
# ==============================================================
async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        rol: str = payload.get("rol")

        if not email or not rol:
            raise credentials_exception

        # ✅ TODOS los usuarios están en collection_auth
        user = await collection_auth.find_one({"correo_electronico": email})
        if not user:
            raise credentials_exception

        # ✅ Devolver también la sede_id y franquicia_id
        return {
            "email": email,
            "rol": rol,
            "nombre": user.get("nombre"),
            "sede_id": user.get("sede_id"),    # ⭐ Para admin_sede
            "franquicia_id": user.get("franquicia_id"),  # ⭐ Para admin_franquicia
            "user_id": str(user.get("_id")),    # ⭐ Para validaciones
            "profesional_id": user.get("profesional_id"),
        }
    except JWTError:
        raise credentials_exception


# =========================================================
# 👤 CREATE NEW USER (only super_admin)
# =========================================================
@router.post("/register")
async def create_user(
    nombre: str = Form(...),
    correo_electronico: str = Form(...),
    password: str = Form(...),
    rol: str = Form(...),
    sede_id: str = Form(None),
    franquicia_id: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    # Solo super_admin y admin_sede pueden crear usuarios
    if current_user["rol"] not in ["super_admin", "admin_sede", "admin_franquicia"]:
        raise HTTPException(status_code=403, detail="No autorizado para crear usuarios")

    # Verificar rol válido
    valid_roles = ["super_admin", "admin_franquicia", "admin_sede", "estilista", "usuario"]
    if rol not in valid_roles:
        raise HTTPException(status_code=400, detail="Rol inválido")

    # 🔒 Forzar la sede según el creador
    if current_user["rol"] == "admin_sede":
        sede_id = current_user["sede_id"]  # 🚀 hereda automáticamente su sede
        franquicia_id = None
    elif current_user["rol"] == "admin_franquicia":
        franquicia_id = current_user["franquicia_id"]  # 🚀 hereda su franquicia
        sede_id = None
    elif current_user["rol"] == "super_admin":
        # super_admin puede especificar cualquier sede/franquicia o ninguna
        pass

    # ✅ TODOS los usuarios van a collection_auth
    collection = collection_auth

    # Validar duplicado
    existing_user = await collection.find_one({"correo_electronico": correo_electronico.lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="El usuario ya existe")

    # Encriptar contraseña
    hashed_password = pwd_context.hash(password)

    nuevo_usuario = {
        "nombre": nombre,
        "correo_electronico": correo_electronico.lower(),
        "hashed_password": hashed_password,
        "rol": rol,  # ⭐ ESTE ES EL ROL REAL que se usará en el login
        "sede_id": sede_id,
        "franquicia_id": franquicia_id,
        "fecha_creacion": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "activo": True,
        "creado_por": current_user["email"],
    }

    await collection.insert_one(nuevo_usuario)

    return {
        "msg": "✅ Usuario creado exitosamente",
        "rol": rol,
        "correo": correo_electronico,
        "sede_id": sede_id,
        "franquicia_id": franquicia_id,
        "creado_por": current_user["email"],
    }


# =========================================================
# 🔓 LOGIN AND TOKEN (LOGIN) - CORREGIDO PARA collection_auth
# =========================================================
@router.post("/token", response_model=TokenResponse)
async def login(
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
):
    # Normaliza el correo
    email = username.strip().lower()
    print("📧 Intentando login con:", email)

    # ✅ BUSCAR SOLO EN collection_auth (donde están TODOS los usuarios)
    user = await collection_auth.find_one({"correo_electronico": email})
    
    if not user:
        print("❌ Usuario no encontrado en collection_auth:", email)
        raise HTTPException(status_code=400, detail="Usuario no encontrado")

    # Verificar contraseña
    try:
        if not pwd_context.verify(password, user["hashed_password"]):
            print("❌ Contraseña incorrecta para:", email)
            raise HTTPException(status_code=400, detail="Contraseña incorrecta")
    except Exception as e:
        print(f"⚠️ Error al verificar contraseña: {e}")
        raise HTTPException(status_code=500, detail="Error verificando contraseña")

    # ✅ OBTENER EL ROL REAL DEL USUARIO desde la base de datos
    rol_real = user.get("rol")
    if not rol_real:
        print("❌ Usuario no tiene rol asignado:", email)
        raise HTTPException(status_code=500, detail="Usuario sin rol asignado")

    print(f"✅ Login correcto para {email} con rol {rol_real}")

    # Crear tokens con el rol REAL de la base de datos
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    try:
        access_token = create_access_token(
            data={"sub": user["correo_electronico"], "rol": rol_real},  # ⭐ ROL REAL
            expires_delta=access_token_expires,
        )
        refresh_token = create_refresh_token(
            data={"sub": user["correo_electronico"], "rol": rol_real},  # ⭐ ROL REAL
            expires_delta=refresh_token_expires,
        )
    except Exception as e:
        print("⚠️ Error creando tokens:", e)
        raise HTTPException(status_code=500, detail="Error generando tokens")

    # Guardar refresh token en cookie HttpOnly
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,  # ⚠️ True si usas HTTPS
        samesite="None",
        max_age=int(refresh_token_expires.total_seconds()),
        path="/",
    )

    print("✅ Tokens generados y cookie configurada")

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        rol=rol_real,  # ⭐ ROL REAL del usuario
        nombre=user.get("nombre"),
        email=user.get("correo_electronico"),
    )


# =========================================================
# 🔍 VALIDATE TOKEN
# =========================================================
@router.get("/validate_token")
async def validate_token(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"valid": True, "exp": payload.get("exp")}
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

# =========================================================
# 🛠 CREATE INITIAL SUPER ADMIN (WITHOUT AUTHENTICATION)
# =========================================================
@router.post("/create-superadmin")
async def create_initial_superadmin(
    nombre: str = Form(...),
    correo_electronico: str = Form(...),
    password: str = Form(...)
):
    """
    Crea el primer usuario super_admin sin requerir autenticación.
    Si ya existe un super_admin, bloquea la creación.
    """

    # Verificar si ya existe un super_admin
    existing_admin = await collection_auth.find_one({"rol": "super_admin"})
    if existing_admin:
        raise HTTPException(
            status_code=400,
            detail="Ya existe un super_admin registrado. Usa /auth/token para iniciar sesión."
        )

    # Encriptar la contraseña
    hashed_password = pwd_context.hash(password)

    # Crear documento
    super_admin = {
        "nombre": nombre,
        "correo_electronico": correo_electronico.lower(),
        "hashed_password": hashed_password,
        "rol": "super_admin",  # ⭐ ROL EXPLÍCITO
        "franquicia_id": None,
        "sede_id": None,
        "fecha_creacion": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "activo": True
    }

    # Insertar en la colección
    await collection_auth.insert_one(super_admin)

    return {
        "msg": "✅ Super admin creado exitosamente.",
        "correo": correo_electronico,
        "rol": "super_admin"
    }


# =========================================================
# 🔑 CHANGE PASSWORD DIRECTLY (without token)
# =========================================================
@router.post("/change-password")
async def change_password(
    email: str = Form(...),
    new_password: str = Form(...),
    confirm_password: str = Form(...)
):
    email = email.lower()

    # Validar contraseñas coincidan
    if new_password != confirm_password:
        raise HTTPException(status_code=400, detail="Las contraseñas no coinciden")

    # ✅ BUSCAR SOLO EN collection_auth
    user = await collection_auth.find_one({"correo_electronico": email})
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Actualizar la contraseña
    hashed_password = pwd_context.hash(new_password)
    await collection_auth.update_one(
        {"_id": user["_id"]},
        {"$set": {"hashed_password": hashed_password}}
    )

    return {
        "msg": f"Contraseña actualizada correctamente para {email}",
        "rol": user.get("rol")
    }


# =========================================================
# 🔄 REFRESH TOKEN (renueva access_token)
# =========================================================
@router.post("/refresh", response_model=TokenResponse)
async def refresh_token_endpoint(response: Response, refresh_token: str = Cookie(None)):
    print("Refresh token recibido:", refresh_token)  # Debugging

    if not refresh_token:
        print("Error: No se encontró refresh token")  # Debugging
        raise HTTPException(status_code=401, detail="No se encontró refresh token")

    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        print("Payload decodificado:", payload)  # Debugging

        email: str = payload.get("sub")
        rol: str = payload.get("rol")

        if not email or not rol:
            print("Error: Token inválido, falta email o rol")  # Debugging
            raise HTTPException(status_code=401, detail="Token inválido")

        # ✅ VERIFICAR EN collection_auth
        user = await collection_auth.find_one({"correo_electronico": email})
        print("Usuario encontrado:", user)  # Debugging

        if not user or not user.get("activo", True):
            print("Error: Usuario no autorizado o inactivo")  # Debugging
            raise HTTPException(status_code=401, detail="Usuario no autorizado o inactivo")

        # 🔄 Renovar access token
        new_access_token = create_access_token(
            data={"sub": email, "rol": rol},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        print("Nuevo access token generado")  # Debugging

        # (Opcional) rotar refresh token
        new_refresh_token = create_refresh_token(
            data={"sub": email, "rol": rol},
            expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        )
        print("Nuevo refresh token generado")  # Debugging

        response.set_cookie(
            key="refresh_token",
            value=new_refresh_token,
            httponly=True,
            secure=False,
            samesite="None",
            max_age=int(timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())
        )
        print("Refresh token actualizado en la cookie")  # Debugging

        return TokenResponse(
            access_token=new_access_token,
            token_type="bearer",
            rol=rol,
            email=email,
            nombre=user.get("nombre")
        )

    except JWTError as e:
        print("Error al decodificar el refresh token:", str(e))  # Debugging
        raise HTTPException(status_code=401, detail="Refresh token inválido o expirado")


# =========================================================
# 🚪 LOGOUT (borra refresh_token cookie)
# =========================================================
@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("refresh_token")
    return {"msg": "Sesión cerrada correctamente"}