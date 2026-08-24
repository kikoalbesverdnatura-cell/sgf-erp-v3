import logging
import gspread
from app.services.google_service import abrir_documento

logger = logging.getLogger(__name__)

DOCUMENTO = "DB_FORMACION_VERDNATURA"
HOJA_MILI = "Resumen_mili"

def obtener_mili_eventos() -> list:
    """
    Obtiene todos los eventos de formación de la hoja Resumen_mili, filtrando filas vacías o rotas.
    """
    try:
        doc = abrir_documento(DOCUMENTO)
        sheet = doc.worksheet(HOJA_MILI)
        records = sheet.get_all_records()
        
        eventos = []
        for idx, r in enumerate(records):
            nombre_val = str(r.get("Nombre", "")).strip()
            if not nombre_val or nombre_val == "#REF!":
                continue
            eventos.append({
                "id": idx + 2,  # Fila en Google Sheets (base 1, +1 por cabecera)
                "nombre": nombre_val,
                "departamento": str(r.get("Departamento", "")).strip(),
                "fecha": str(r.get("Fecha", "")).strip(),
                "hora": str(r.get("Hora", "")).strip(),
                "formador": str(r.get("Formador", "")).strip(),
                "estado": str(r.get("Estado", "Pendiente")).strip() or "Pendiente"
            })
        return eventos
    except Exception as e:
        logger.error(f"Error obteniendo eventos de mili: {e}")
        return []

def programar_mili_evento(datos: dict) -> dict:
    """
    Programa un nuevo registro de formación escribiendo en la hoja de origen (Mili 3.0).
    """
    try:
        nombre = str(datos.get("nombre", "")).strip()
        departamento = str(datos.get("departamento", "Sacado H 🌼")).strip()
        fecha = str(datos.get("fecha", "")).strip()
        hora = str(datos.get("hora", "")).strip()
        formador = str(datos.get("formador", "")).strip()
        estado = str(datos.get("estado", "Pendiente")).strip()
        
        if not nombre or not fecha:
            return {"ok": False, "error": "El nombre y la fecha son obligatorios"}

        # 1. Conectar al documento de origen (Mili 3.0)
        MILI_SRC_ID = "1tzVYbTeKm_K9fYj43cHtE3VaGt3L9DAOjYgClHEsSSs"
        from app.services.google_service import client
        doc_src = client.open_by_key(MILI_SRC_ID)
        sheet_src = doc_src.worksheet("Nuevo Formato y Formaciones")
        
        # Buscar al trabajador en la columna 1
        nombres = sheet_src.col_values(1)
        row_idx = None
        for i, n in enumerate(nombres):
            if n.strip() == nombre:
                row_idx = i + 1
                break

        # Si el trabajador no existe, lo agregamos en una nueva fila en el origen
        if not row_idx:
            new_row = [nombre, "FALSE", "Sacado H 🌼", "FALSE", "", "", "", "Sacado V 🌱", "FALSE", "", "", "", "Sacado A 🔮", "FALSE", "", "", "", "Sacado C 🌹", "FALSE", "", "", ""]
            sheet_src.append_row(new_row)
            row_idx = len(nombres) + 1

        # 2. Determinar el grupo de columnas según el departamento
        col_base_idx = None
        dept_clean = departamento.upper()
        if "SACADO H" in dept_clean:
            col_base_idx = 3
        elif "SACADO V" in dept_clean:
            col_base_idx = 8
        elif "SACADO A" in dept_clean:
            col_base_idx = 13
        elif "SACADO C" in dept_clean:
            col_base_idx = 18
            
        if not col_base_idx:
            return {"ok": False, "error": f"Departamento '{departamento}' no reconocido para mapeo"}

        # 3. Guardar los datos en la hoja de origen
        state_val = "TRUE" if estado.upper().strip() in ("FINALIZADA", "TRUE", "SI", "SÍ") else "FALSE"
        
        sheet_src.update_cell(row_idx, col_base_idx + 2, fecha)
        sheet_src.update_cell(row_idx, col_base_idx + 3, formador)
        sheet_src.update_cell(row_idx, col_base_idx + 4, hora)
        sheet_src.update_cell(row_idx, col_base_idx + 1, state_val)
        
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error programando evento de mili en origen: {e}")
        return {"ok": False, "error": str(e)}

def actualizar_mili_evento(datos: dict) -> dict:
    """
    Actualiza el estado, formador, fecha o cualquier campo de un evento en Resumen_mili 
    escribiendo directamente en el origen de datos (Mili 3.0).
    """
    try:
        fila_idx = datos.get("id")
        campo = datos.get("campo")
        valor = datos.get("valor")
        
        if not fila_idx or not campo:
            return {"ok": False, "error": "Faltan datos de actualización"}

        # 1. Leer el registro actual del sheet local para obtener nombre y departamento original
        doc_local = abrir_documento(DOCUMENTO)
        sheet_local = doc_local.worksheet(HOJA_MILI)
        
        nombre_original = str(sheet_local.cell(int(fila_idx), 1).value).strip()
        dept_original = str(sheet_local.cell(int(fila_idx), 2).value).strip()
        
        if not nombre_original or nombre_original in ("None", "") or nombre_original == "#REF!":
            return {"ok": False, "error": f"No se pudo identificar la sesión original en la fila {fila_idx}"}

        # 2. Conectar al documento de origen (Mili 3.0)
        MILI_SRC_ID = "1tzVYbTeKm_K9fYj43cHtE3VaGt3L9DAOjYgClHEsSSs"
        from app.services.google_service import client
        doc_src = client.open_by_key(MILI_SRC_ID)
        sheet_src = doc_src.worksheet("Nuevo Formato y Formaciones")
        
        # Buscar al trabajador en la columna 1 para buscar al trabajador
        nombres = sheet_src.col_values(1)
        row_idx = None
        for i, n in enumerate(nombres):
            if n.strip() == nombre_original:
                row_idx = i + 1
                break
                
        if not row_idx:
            return {"ok": False, "error": f"Trabajador '{nombre_original}' no encontrado en la hoja de origen"}

        # 3. Determinar el grupo de columnas según el departamento original
        col_base_idx = None
        dept_clean = dept_original.upper()
        if "SACADO H" in dept_clean:
            col_base_idx = 3
        elif "SACADO V" in dept_clean:
            col_base_idx = 8
        elif "SACADO A" in dept_clean:
            col_base_idx = 13
        elif "SACADO C" in dept_clean:
            col_base_idx = 18
            
        if not col_base_idx:
            return {"ok": False, "error": f"Departamento '{dept_original}' no reconocido para mapeo"}

        # 4. Determinar la columna específica a modificar
        target_col = None
        target_val = valor
        
        if campo == "fecha":
            target_col = col_base_idx + 2
        elif campo == "formador":
            target_col = col_base_idx + 3
        elif campo == "hora":
            target_col = col_base_idx + 4
        elif campo == "estado":
            target_col = col_base_idx + 1  # Columna de Check/Estado
            target_val = "TRUE" if str(valor).upper().strip() in ("FINALIZADA", "TRUE", "SI", "SÍ") else "FALSE"
        elif campo == "nombre":
            target_col = 1
        elif campo == "departamento":
            target_col = col_base_idx
            
        if not target_col:
            return {"ok": False, "error": f"Campo '{campo}' no mapeado para edición"}

        # 5. Escribir el cambio en la hoja de origen
        sheet_src.update_cell(row_idx, target_col, target_val)
        
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error actualizando evento de mili en origen: {e}")
        return {"ok": False, "error": str(e)}
