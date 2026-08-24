import logging
from typing import List, Dict, Any
from app.services.google_service import abrir_documento_por_key
from app.services.persona_service import SPREADSHEET_SACADORES_ID

logger = logging.getLogger(__name__)

HOJA_USUARIOS = "USUARIOS"
CABECERAS = ["ID", "NOMBRE", "USUARIO", "CONTRASENA", "ROL", "ACTIVO"]

def obtener_hoja_usuarios():
    doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
    try:
        sheet = doc.worksheet(HOJA_USUARIOS)
    except Exception:
        logger.info(f"Creando pestaña {HOJA_USUARIOS}...")
        sheet = doc.add_worksheet(title=HOJA_USUARIOS, rows=1000, cols=len(CABECERAS))
        sheet.append_row(CABECERAS)
        
        # Agregar usuarios iniciales por defecto (los formadores principales)
        sheet.append_row(["42195", "VICENTE LLOPIS CORDOBA", "vicente.llopis", "12345", "Formador", "Sí"])
        sheet.append_row(["47999", "EUGENIO COLOMER GIRBÉS", "eugenio.colomer", "12345", "Formador", "Sí"])
        sheet.append_row(["5289", "FRANCISCO ALBERT ESCUDERO", "kiko.albert", "12345", "Administrador", "Sí"])
    return sheet

def obtener_usuarios() -> List[Dict[str, Any]]:
    try:
        sheet = obtener_hoja_usuarios()
        records = sheet.get_all_records()
        usuarios = []
        for idx, r in enumerate(records):
            usuarios.append({
                "fila_idx": idx + 2,
                "id": str(r.get("ID", "")),
                "nombre": str(r.get("NOMBRE", "")),
                "usuario": str(r.get("USUARIO", "")),
                "contrasena": str(r.get("CONTRASENA", "")),
                "rol": str(r.get("ROL", "Formador")),
                "activo": str(r.get("ACTIVO", "Sí"))
            })
        return usuarios
    except Exception as e:
        logger.error(f"Error al obtener usuarios: {e}")
        return []

def guardar_usuario(datos: Dict[str, Any]) -> Dict[str, Any]:
    try:
        sheet = obtener_hoja_usuarios()
        
        # Validar si el usuario ya existe
        usuario_id = str(datos.get("id", "")).strip()
        usuario_username = str(datos.get("usuario", "")).strip().lower()
        
        records = sheet.get_all_records()
        for r in records:
            if str(r.get("USUARIO", "")).strip().lower() == usuario_username:
                return {"ok": False, "error": f"El nombre de usuario '{usuario_username}' ya existe"}
                
        nueva_fila = [
            usuario_id,
            str(datos.get("nombre", "")).strip(),
            usuario_username,
            str(datos.get("contrasena", "12345")).strip(),
            str(datos.get("rol", "Formador")).strip(),
            str(datos.get("activo", "Sí")).strip()
        ]
        sheet.append_row(nueva_fila)
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error al guardar usuario: {e}")
        return {"ok": False, "error": str(e)}

def eliminar_usuario(fila_idx: int) -> Dict[str, Any]:
    try:
        sheet = obtener_hoja_usuarios()
        sheet.delete_rows(fila_idx)
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error al eliminar usuario: {e}")
        return {"ok": False, "error": str(e)}

def actualizar_usuario(fila_idx: int, datos: Dict[str, Any]) -> Dict[str, Any]:
    try:
        sheet = obtener_hoja_usuarios()
        
        # Columnas: ID(1), NOMBRE(2), USUARIO(3), CONTRASENA(4), ROL(5), ACTIVO(6)
        if "id" in datos:
            sheet.update_cell(fila_idx, 1, str(datos["id"]).strip())
        if "nombre" in datos:
            sheet.update_cell(fila_idx, 2, str(datos["nombre"]).strip())
        if "usuario" in datos:
            sheet.update_cell(fila_idx, 3, str(datos["usuario"]).strip().lower())
        if "contrasena" in datos:
            sheet.update_cell(fila_idx, 4, str(datos["contrasena"]).strip())
        if "rol" in datos:
            sheet.update_cell(fila_idx, 5, str(datos["rol"]).strip())
        if "activo" in datos:
            sheet.update_cell(fila_idx, 6, str(datos["activo"]).strip())
            
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error al actualizar usuario: {e}")
        return {"ok": False, "error": str(e)}
