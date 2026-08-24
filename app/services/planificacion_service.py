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

def asignar_tutor(id_novato: str, tutor: str) -> dict:
    """
    Asigna o remueve un tutor de un trabajador en formación en el Maestro de Google Sheets.
    """
    try:
        logger.info(f"Asignando tutor '{tutor}' al trabajador ID '{id_novato}'...")
        documento = abrir_documento(DOCUMENTO)
        hoja = documento.worksheet(HOJA)

        # Buscar el índice de fila del trabajador por ID
        registros = hoja.get_all_records()
        fila_index = None
        for idx, r in enumerate(registros):
            if str(r.get("ID_Trabajador", "")).strip() == str(id_novato).strip():
                fila_index = idx + 2  # +2 por cabecera y base 1 de Sheets
                break

        if fila_index is None:
            logger.error(f"Trabajador ID {id_novato} no encontrado para asignacion.")
            return {"ok": False, "error": f"Trabajador con ID {id_novato} no encontrado."}

        # Localizar la columna TUTOR_ASIGNADO
        encabezados = hoja.row_values(1)
        try:
            col_idx = encabezados.index("TUTOR_ASIGNADO") + 1
        except ValueError:
            logger.error("Columna TUTOR_ASIGNADO no encontrada en la hoja.")
            return {"ok": False, "error": "Columna TUTOR_ASIGNADO no encontrada en el Maestro."}

        nuevo_valor = tutor.strip() if tutor else ""
        
        # Actualizar celda en Sheets
        hoja.update_cell(fila_index, col_idx, nuevo_valor)
        logger.info(f"Asignacion guardada con exito en Fila {fila_index}, Columna {col_idx}.")
        
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error asignando tutor: {e}")
        return {"ok": False, "error": str(e)}
