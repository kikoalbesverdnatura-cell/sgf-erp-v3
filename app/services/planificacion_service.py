import logging
from app.services.persona_service import obtener_personas, abrir_documento, DOCUMENTO, HOJA
from app.services.dashboard_service import es_departamento_seguimiento, es_persona_activa

logger = logging.getLogger(__name__)

def obtener_tutores_disponibles() -> list:
    """
    Obtiene la lista de tutores/formadores preconfigurados en el sistema:
    - Jefes de la hoja EQUIPO.
    - Formadores de la hoja 41_TUTORES (evaluaciones de feedback).
    """
    tutores = set()
    try:
        documento = abrir_documento(DOCUMENTO)
        
        # 1. Cargar Jefes de la hoja EQUIPO
        try:
            ws_equipo = documento.worksheet("EQUIPO")
            records = ws_equipo.get_all_records()
            for r in records:
                puesto = str(r.get("Puesto", "")).strip().lower()
                nombre = str(r.get("Nombre completo", "")).strip()
                if puesto == "jefe" and nombre:
                    tutores.add(nombre)
        except Exception as e:
            logger.error(f"Error leyendo jefes de EQUIPO: {e}")
            
        # 2. Cargar Formadores de la hoja 41_TUTORES
        try:
            ws_tutores = documento.worksheet("41_TUTORES")
            records = ws_tutores.get_all_records()
            for r in records:
                nombre = str(r.get("Indica el nombre del formador.", "")).strip()
                if nombre:
                    tutores.add(nombre)
        except Exception as e:
            logger.error(f"Error leyendo 41_TUTORES: {e}")
            
    except Exception as e:
        logger.error(f"Error general obteniendo tutores disponibles: {e}")
        
    return sorted(list(tutores))

def obtener_datos_tablero() -> dict:
    """
    Obtiene las personas en formación activas y las organiza para el tablero de planificación:
    - novatos: personal activo en departamentos de seguimiento sin tutor asignado.
    - equipos: tutores/formadores con la lista de personas asignadas a cada uno.
    Enriquece cada registro con la nota, checklist, hitos de formación y alertas.
    """
    personas = obtener_personas()
    
    # 1. Cargar datos complementarios por lotes en memoria para optimizar rendimiento
    obs_by_id = {}
    try:
        documento = abrir_documento(DOCUMENTO)
        ws_obs = documento.worksheet("OBSERVACIONES")
        records_obs = ws_obs.get_all_records()
        for r in records_obs:
            pid = str(r.get("ID_PERSONA", "")).strip().split('.')[0]
            if pid:
                if pid not in obs_by_id:
                    obs_by_id[pid] = []
                obs_by_id[pid].append(r)
    except Exception as e:
        logger.error(f"Error cargando observaciones por lotes: {e}")

    mili_by_name = {}
    try:
        from app.services.mili_service import obtener_mili_eventos
        mili_evs = obtener_mili_eventos()
        for ev in mili_evs:
            name = str(ev.get("nombre", "")).strip().upper()
            if name:
                if name not in mili_by_name:
                    mili_by_name[name] = []
                mili_by_name[name].append(ev)
    except Exception as e:
        logger.error(f"Error cargando eventos mili por lotes: {e}")

    agenda_by_id = {}
    try:
        from app.services.formacion_service import obtener_datos_formacion_dashboard
        agenda_data = obtener_datos_formacion_dashboard()
        agenda_list = agenda_data.get("agenda", [])
        for cl in agenda_list:
            pid = str(cl.get("id_trabajador", "")).strip().split('.')[0]
            if pid:
                if pid not in agenda_by_id:
                    agenda_by_id[pid] = []
                agenda_by_id[pid].append(cl)
    except Exception as e:
        logger.error(f"Error cargando agenda de formación por lotes: {e}")

    # Obtener tutores preconfigurados del sistema
    tutores_disponibles = obtener_tutores_disponibles()
    tutores_set = set(tutores_disponibles)
    
    # Filtrar solo personas activas en departamentos de seguimiento
    personas_activas = []
    
    for p in personas:
        dep = p.get("departamento", "")
        if es_departamento_seguimiento(dep) and es_persona_activa(p):
            personas_activas.append(p)
            
            # Si tiene tutor asignado actualmente, asegurar que aparezca
            tutor_name = str(p.get("tutor", "")).strip()
            if tutor_name and tutor_name not in ["", "-", "SIN TUTOR", "None"]:
                tutores_set.add(tutor_name)
                
    novatos = []
    equipos_map = {tutor: [] for tutor in tutores_set}
    
    for p in personas_activas:
        tutor_name = str(p.get("tutor", "")).strip()
        pid = str(p.get("id", "")).strip().split('.')[0]
        name_upper = str(p.get("nombre", "")).strip().upper()
        
        # Calcular porcentaje de checklist
        checklist_campos = ["rrhh", "almuerzo", "uniforme", "psicotecnico", "formacion", "tour"]
        def es_check(valor):
            return str(valor or "").upper().strip() in ["TRUE", "SI", "SÍ", "1", "X", "OK", "HECHO", "COMPLETADO"]
        completados = sum(1 for campo in checklist_campos if es_check(p.get(campo)))
        checklist_pct = int((completados / len(checklist_campos)) * 100)
        
        # Formacion hitos
        clases_agenda = agenda_by_id.get(pid, [])
        clases_mili = mili_by_name.get(name_upper, [])
        
        aula_finalizada = any(str(cl.get("estado", "")).upper().strip() in ["FINALIZADA", "HECHO", "TRUE", "SÍ", "SI"] for cl in clases_agenda)
        aula_pendiente = any(str(cl.get("estado", "")).upper().strip() == "PENDIENTE" for cl in clases_agenda)
        
        practica_finalizada = any(str(ev.get("estado", "")).upper().strip() in ["FINALIZADA", "HECHO", "TRUE", "SÍ", "SI"] for ev in clases_mili)
        practica_pendiente = any(str(ev.get("estado", "")).upper().strip() == "PENDIENTE" for ev in clases_mili)
        
        # Detectar alertas y retrocesos
        obs_list = obs_by_id.get(pid, [])
        retrocedido = any("RETROCESO" in str(o.get("COMENTARIO", "")).upper() for o in obs_list)
        
        p_data = {
            "id": p.get("id"),
            "nombre": p.get("nombre"),
            "programa": p.get("programa"),
            "departamento": p.get("departamento"),
            "estado": p.get("estado"),
            "dias": p.get("dias"),
            
            # Enriquecimientos de Sprint 3:
            "nota": p.get("nota", 0.0),
            "color_code": p.get("color_code", "GRIS"),
            "productividad_media": p.get("productividad_media", ""),
            "checklist_porcentaje": checklist_pct,
            "hitos": {
                "aula_finalizada": aula_finalizada,
                "aula_pendiente": aula_pendiente,
                "practica_finalizada": practica_finalizada,
                "practica_pendiente": practica_pendiente
            },
            "retrocedido": retrocedido
        }
        
        if not tutor_name or tutor_name in ["", "-", "SIN TUTOR", "None"]:
            novatos.append(p_data)
        else:
            if tutor_name in equipos_map:
                equipos_map[tutor_name].append(p_data)
            else:
                equipos_map[tutor_name] = [p_data]

    # Convertir mapa de equipos en una lista para el JSON response
    equipos = []
    for tutor, lista in equipos_map.items():
        equipos.append({
            "tutor": tutor,
            "novatos": lista
        })
        
    # Ordenar equipos alfabéticamente por el tutor
    equipos.sort(key=lambda x: x["tutor"])
    
    return {
        "novatos": novatos,
        "equipos": equipos
    }

def asignar_tutor(id_novato: str, tutor: str, rrhh: bool = None, uniforme: bool = None, almuerzo: bool = None, tour: bool = None) -> dict:
    """
    Asigna o remueve un tutor de un trabajador en formación en el Maestro de Google Sheets,
    y opcionalmente actualiza los checks del checklist en lote.
    """
    try:
        logger.info(f"Asignando tutor '{tutor}' y checklist al trabajador ID '{id_novato}'...")
        documento = abrir_documento(DOCUMENTO)
        hoja = documento.worksheet(HOJA)

        # Buscar el índice de fila del trabajador por ID
        registros = hoja.get_all_records()
        fila_index = None
        for idx, r in enumerate(registros):
            if str(r.get("ID_Trabajador", "")).strip() == str(id_novato).strip():
                act_val = str(r.get("ACTIVO", "")).strip().upper()
                fin_val = str(r.get("FINALIZADO", "")).strip().upper()
                if act_val == "SÍ" or fin_val not in ("SÍ", "SI"):
                    fila_index = idx + 2
                    break
                if fila_index is None:
                    fila_index = idx + 2

        if fila_index is None:
            logger.error(f"Trabajador ID {id_novato} no encontrado para asignacion.")
            return {"ok": False, "error": f"Trabajador con ID {id_novato} no encontrado."}

        encabezados = hoja.row_values(1)
        
        updates = []
        
        # 1. Tutor
        try:
            col_tutor = encabezados.index("TUTOR_ASIGNADO") + 1
            nuevo_valor = tutor.strip() if tutor else ""
            updates.append({"col": col_tutor, "val": nuevo_valor, "header": "TUTOR_ASIGNADO"})
        except ValueError:
            logger.error("Columna TUTOR_ASIGNADO no encontrada en la hoja.")
            return {"ok": False, "error": "Columna TUTOR_ASIGNADO no encontrada en el Maestro."}
            
        # 2. RRHH
        if rrhh is not None:
            try:
                col_rrhh = encabezados.index("RRHH") + 1
                updates.append({"col": col_rrhh, "val": rrhh, "header": "RRHH", "is_bool": True})
            except ValueError:
                pass
                
        # 3. Uniforme
        if uniforme is not None:
            try:
                col_uniforme = encabezados.index("UNIFORME") + 1
                updates.append({"col": col_uniforme, "val": uniforme, "header": "UNIFORME", "is_bool": True})
            except ValueError:
                pass
                
        # 4. Almuerzo
        if almuerzo is not None:
            try:
                col_almuerzo = encabezados.index("ALMUERZO") + 1
                updates.append({"col": col_almuerzo, "val": almuerzo, "header": "ALMUERZO", "is_bool": True})
            except ValueError:
                pass
                
        # 5. Tour
        if tour is not None:
            try:
                col_tour = encabezados.index("TOUR_EMPRESA") + 1
                updates.append({"col": col_tour, "val": tour, "header": "TOUR_EMPRESA", "is_bool": True})
            except ValueError:
                pass

        # Generar las peticiones del batch update
        requests = []
        for u in updates:
            col_idx = u["col"]
            val = u["val"]
            if u.get("is_bool"):
                requests.append({
                    "updateCells": {
                        "range": {
                            "sheetId": hoja.id,
                            "startRowIndex": fila_index - 1,
                            "endRowIndex": fila_index,
                            "startColumnIndex": col_idx - 1,
                            "endColumnIndex": col_idx
                        },
                        "rows": [
                            {"values": [{"userEnteredValue": {"boolValue": val}}]}
                        ],
                        "fields": "userEnteredValue"
                    }
                })
            else:
                requests.append({
                    "updateCells": {
                        "range": {
                            "sheetId": hoja.id,
                            "startRowIndex": fila_index - 1,
                            "endRowIndex": fila_index,
                            "startColumnIndex": col_idx - 1,
                            "endColumnIndex": col_idx
                        },
                        "rows": [
                            {"values": [{"userEnteredValue": {"stringValue": val}}]}
                        ],
                        "fields": "userEnteredValue"
                    }
                })

        # Ejecutar escritura en lote en Sheets
        hoja.spreadsheet.batch_update({"requests": requests})
        logger.info(f"Asignacion y checklist guardados con exito en Fila {fila_index}.")
        
        # Actualizar caché en memoria de forma reactiva
        try:
            from app.services.persona_service import actualizar_campo_en_cache_maestro, invalidar_cache_personas
            for u in updates:
                actualizar_campo_en_cache_maestro(id_novato, u["header"], u["val"])
            invalidar_cache_personas()
        except Exception as cache_err:
            logger.error(f"Error actualizando cache de tutor y checklist: {cache_err}")
            
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error asignando tutor y checklist: {e}")
        return {"ok": False, "error": str(e)}
