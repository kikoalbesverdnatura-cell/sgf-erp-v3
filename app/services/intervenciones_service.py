import logging
import time
from datetime import datetime
from typing import Dict, Any, List
import gspread

from app.services.google_service import abrir_documento_por_key
from app.services.persona_service import SPREADSHEET_SACADORES_ID, obtener_persona

logger = logging.getLogger(__name__)

HOJA_INTERVENCIONES = "INTERVENCIONES"
CABECERAS = [
    "ID_INTERVENCION", "ID_PERSONA", "NOMBRE", "FECHA_CREACION", 
    "TIPO", "MOTIVO", "DESCRIPCION", "FECHA_SEGUIMIENTO", 
    "ESTADO", "OBSERVACIONES_CIERRE", "FECHA_MODIFICACION", "AUTOR"
]

def obtener_hoja_intervenciones():
    doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
    try:
        sheet = doc.worksheet(HOJA_INTERVENCIONES)
    except gspread.WorksheetNotFound:
        logger.info(f"Creando pestaña {HOJA_INTERVENCIONES} en Google Sheets...")
        sheet = doc.add_worksheet(title=HOJA_INTERVENCIONES, rows=1000, cols=len(CABECERAS))
        sheet.append_row(CABECERAS)
    return sheet

def obtener_intervenciones_trabajador(worker_id: str) -> List[Dict[str, Any]]:
    try:
        sheet = obtener_hoja_intervenciones()
        records = sheet.get_all_records()
        
        id_buscado = str(worker_id).strip().split('.')[0]
        def limpiar_id(val):
            return str(val).strip().split('.')[0]
            
        intervenciones = []
        for idx, r in enumerate(records):
            id_persona = limpiar_id(r.get("ID_PERSONA", ""))
            if id_persona == id_buscado:
                intervenciones.append({
                    "fila_idx": idx + 2,  # Base 1 + cabecera
                    "id_intervencion": str(r.get("ID_INTERVENCION", "")),
                    "id_persona": id_persona,
                    "nombre": str(r.get("NOMBRE", "")),
                    "fecha_creacion": str(r.get("FECHA_CREACION", "")),
                    "tipo": str(r.get("TIPO", "")),
                    "motivo": str(r.get("MOTIVO", "")),
                    "descripcion": str(r.get("DESCRIPCION", "")),
                    "fecha_seguimiento": str(r.get("FECHA_SEGUIMIENTO", "")),
                    "estado": str(r.get("ESTADO", "Pendiente")),
                    "observaciones_cierre": str(r.get("OBSERVACIONES_CIERRE", "")),
                    "fecha_modificacion": str(r.get("FECHA_MODIFICACION", "")),
                    "autor": str(r.get("AUTOR", ""))
                })
        return intervenciones
    except Exception as e:
        logger.error(f"Error al obtener intervenciones para trabajador {worker_id}: {e}")
        return []

def guardar_intervencion(datos: Dict[str, Any]) -> Dict[str, Any]:
    try:
        worker_id = str(datos.get("id_persona", "")).strip()
        persona = obtener_persona(worker_id)
        if not persona or "error" in persona:
            return {"ok": False, "error": "Trabajador no encontrado"}
            
        nombre = persona.get("nombre", "")
        
        now = datetime.now()
        id_intervencion = f"INT{int(time.time())}"
        fecha_creacion = now.strftime("%d/%m/%Y")
        
        tipo = datos.get("tipo", "General")
        motivo = datos.get("motivo", "Otros")
        descripcion = datos.get("descripcion", "")
        fecha_seguimiento = datos.get("fecha_seguimiento", "")  # Esperado DD/MM/YYYY o YYYY-MM-DD
        
        # Sanitizar formato de fecha de seguimiento a DD/MM/YYYY si viene en YYYY-MM-DD
        if fecha_seguimiento and "-" in fecha_seguimiento:
            try:
                dt_seg = datetime.strptime(fecha_seguimiento, "%Y-%m-%d")
                fecha_seguimiento = dt_seg.strftime("%d/%m/%Y")
            except ValueError:
                pass
                
        estado = datos.get("estado", "Pendiente")
        autor = datos.get("autor", "falbert")
        
        nueva_fila = [
            id_intervencion,
            worker_id,
            nombre,
            fecha_creacion,
            tipo,
            motivo,
            descripcion,
            fecha_seguimiento,
            estado,
            "",  # OBSERVACIONES_CIERRE
            now.strftime("%Y-%m-%d %H:%M:%S"),  # FECHA_MODIFICACION
            autor
        ]
        
        sheet = obtener_hoja_intervenciones()
        sheet.append_row(nueva_fila)
        
        return {"ok": True, "id_intervencion": id_intervencion}
    except Exception as e:
        logger.error(f"Error al guardar intervención: {e}")
        return {"ok": False, "error": str(e)}

def actualizar_estado_intervencion(id_intervencion: str, nuevo_estado: str, observaciones_cierre: str) -> Dict[str, Any]:
    try:
        sheet = obtener_hoja_intervenciones()
        records = sheet.get_all_records()
        
        fila_num = None
        for idx, r in enumerate(records):
            if str(r.get("ID_INTERVENCION", "")).strip() == str(id_intervencion).strip():
                fila_num = idx + 2  # Base 1 + cabecera
                break
                
        if not fila_num:
            return {"ok": False, "error": f"Intervención con ID {id_intervencion} no encontrada"}
            
        now = datetime.now()
        
        # ESTADO es columna 9
        # OBSERVACIONES_CIERRE es columna 10
        # FECHA_MODIFICACION es columna 11
        sheet.update_cell(fila_num, 9, nuevo_estado)
        sheet.update_cell(fila_num, 10, observaciones_cierre)
        sheet.update_cell(fila_num, 11, now.strftime("%Y-%m-%d %H:%M:%S"))
        
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error al actualizar estado de intervención {id_intervencion}: {e}")
        return {"ok": False, "error": str(e)}

def obtener_alertas_seguimiento_activas() -> List[Dict[str, Any]]:
    try:
        sheet = obtener_hoja_intervenciones()
        records = sheet.get_all_records()
        
        alertas_vencidas = []
        hoy = datetime.now().date()
        
        for idx, r in enumerate(records):
            estado = str(r.get("ESTADO", "Pendiente")).strip().upper()
            if estado in ("RESUELTO", "RESUELTA", "FINALIZADO", "FINALIZADA"):
                continue
                
            fecha_seg_str = str(r.get("FECHA_SEGUIMIENTO", "")).strip()
            if not fecha_seg_str:
                continue
                
            try:
                fecha_seg = datetime.strptime(fecha_seg_str, "%d/%m/%Y").date()
            except ValueError:
                try:
                    fecha_seg = datetime.strptime(fecha_seg_str, "%Y-%m-%d").date()
                except ValueError:
                    logger.warning(f"Formato de fecha inválido en intervención: {fecha_seg_str}")
                    continue
                    
            if fecha_seg <= hoy:
                alertas_vencidas.append({
                    "id_intervencion": str(r.get("ID_INTERVENCION", "")),
                    "id_persona": str(r.get("ID_PERSONA", "")).strip(),
                    "nombre": str(r.get("NOMBRE", "")),
                    "tipo": str(r.get("TIPO", "")),
                    "motivo": str(r.get("MOTIVO", "")),
                    "descripcion": str(r.get("DESCRIPCION", "")),
                    "fecha_seguimiento": fecha_seg_str,
                    "estado": str(r.get("ESTADO", "Pendiente")),
                    "autor": str(r.get("AUTOR", "")),
                    "dias_transcurridos": (hoy - fecha_seg).days
                })
        return alertas_vencidas
    except Exception as e:
        logger.error(f"Error al obtener alertas de seguimiento activas: {e}")
        return []
