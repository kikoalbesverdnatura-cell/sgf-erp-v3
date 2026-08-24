import logging
from typing import Dict, Any, List
from app.services.google_service import abrir_documento_por_key

logger = logging.getLogger(__name__)

SPREADSHEET_KEY = "19V0hASsS5P34bf1kR893b_uE1bZ2RSePT-QZlO8z2-k"

def obtener_datos_formacion_dashboard() -> Dict[str, Any]:
    """
    Lee las hojas de Agenda, Formadores y Estadísticas del Spreadsheet de Formación Sacadores
    y devuelve la información consolidada para el Dashboard Pro.
    """
    try:
        doc = abrir_documento_por_key(SPREADSHEET_KEY)
        
        # 1. Obtener estadísticas de impacto económico de la pestaña 'ESTADÍSTICA FORMACIÓN'
        horas_perdidas = "0:00"
        dinero_perdido = "0,00 €"
        try:
            ws_stats = doc.worksheet("ESTADÍSTICA FORMACIÓN")
            values_stats = ws_stats.get_all_values()
            if len(values_stats) > 0:
                row1 = values_stats[0]
                # Buscar las columnas específicas en la primera fila
                for idx, cell in enumerate(row1):
                    if "Horas perdidas" in cell and idx + 1 < len(row1):
                        horas_perdidas = row1[idx + 1]
                    if "Dinero perdido" in cell and idx + 1 < len(row1):
                        dinero_perdido = row1[idx + 1]
        except Exception as e:
            logger.error(f"Error al leer ESTADÍSTICA FORMACIÓN: {e}")

        # 2. Obtener la agenda de clases de la pestaña 'Agenda Formación'
        agenda_clases = []
        try:
            ws_agenda = doc.worksheet("Agenda Formación")
            values_agenda = ws_agenda.get_all_values()
            if len(values_agenda) > 1:
                headers = values_agenda[0]
                for row in values_agenda[1:]:
                    if len(row) >= len(headers):
                        record = dict(zip(headers, row))
                        # Solo incluir registros que tengan Nombre o ID_Trabajador
                        if record.get("Nombre") or record.get("ID_Trabajador"):
                            agenda_clases.append({
                                "nombre": record.get("Nombre"),
                                "id_trabajador": record.get("ID_Trabajador"),
                                "fecha": record.get("Fecha"),
                                "hora": record.get("Hora"),
                                "tipo_formacion": record.get("Tipo de Formación") or record.get("Tipo de Formacion"),
                                "formador": record.get("Formador"),
                                "estado": record.get("Estado") or "Pendiente",
                                "aula": record.get("Aula"),
                                "hora_fin": record.get("Hora Fin")
                            })
        except Exception as e:
            logger.error(f"Error al leer Agenda Formación: {e}")

        # 3. Obtener el ranking de formadores de la pestaña 'FORMADORES'
        ranking_formadores = []
        try:
            ws_formadores = doc.worksheet("FORMADORES")
            values_formadores = ws_formadores.get_all_values()
            if len(values_formadores) > 1:
                headers = [h.upper() for h in values_formadores[0]]
                for row in values_formadores[1:]:
                    if len(row) >= len(headers):
                        record = dict(zip(headers, row))
                        if record.get("NOMBRE"):
                            ranking_formadores.append({
                                "id": record.get("ID"),
                                "letra": record.get("LETRA"),
                                "nombre": record.get("NOMBRE"),
                                "dias_camara": record.get("DIAS CÁMARA") or record.get("DIAS CAMARA") or "0",
                                "dias_aula": record.get("DIAS AULA") or "0",
                                "horas_camara": record.get("HORAS CÁMARA") or record.get("HORAS CAMARA") or "0:00",
                                "horas_aula": record.get("HORAS AULA") or "0:00"
                            })
        except Exception as e:
            logger.error(f"Error al leer FORMADORES: {e}")

        return {
            "ok": True,
            "impacto_economico": {
                "horas_perdidas": horas_perdidas,
                "dinero_perdido": dinero_perdido
            },
            "agenda": agenda_clases,
            "formadores": ranking_formadores
        }
        
    except Exception as e:
        logger.error(f"Error general en obtener_datos_formacion_dashboard: {e}")
        return {
            "ok": False,
            "error": str(e),
            "impacto_economico": {"horas_perdidas": "0:00", "dinero_perdido": "0,00 €"},
            "agenda": [],
            "formadores": []
        }
