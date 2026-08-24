from app.services.google_service import abrir_documento_por_key

def sanitizar_registro_agenda(r: dict) -> dict:
    nuevo_r = {}
    for k, v in r.items():
        k_str = str(k).strip()
        if "Formaci" in k_str or "Formación" in k_str:
            nuevo_r["Tipo de Formación"] = v
        elif "ID" in k_str and "Trabajador" in k_str:
            nuevo_r["ID_Trabajador"] = v
        elif "Fin" in k_str or "Final" in k_str:
            nuevo_r["Hora Fin"] = v
        else:
            nuevo_r[k_str] = v
    return nuevo_r

def obtener_formacion_sacadores():
    """Recupera y normaliza los datos de la pestaña SIMPL del documento Formación Sacadores."""
    try:
        doc = abrir_documento_por_key("19V0hASsS5P34bf1kR893b_uE1bZ2RSePT-QZlO8z2-k")
        hoja = doc.get_worksheet(0)  # La pestaña SIMPL es la primera (index 0)
        filas = hoja.get_all_records()
        
        # Sincronización automática de nuevas incorporaciones de hoy del maestro
        try:
            from app.services.persona_service import obtener_filas_maestro_personas, auto_agregar_incorporacion_simpl
            # Forzamos refresco del maestro para tener los más recientes
            maestro_filas = obtener_filas_maestro_personas(forzar_refresco=True)
            
            ids_simpl = {str(f.get("ID", "")).strip() for f in filas if f.get("ID")}
            nombres_simpl = {str(f.get("Nombre y Apellido", "")).strip().upper() for f in filas}
            
            nuevos_anadidos = False
            for p in maestro_filas:
                m_id = str(p.get("ID_Trabajador", "")).strip()
                m_nombre = str(p.get("NOMBRE_COMPLETO", "")).strip()
                m_dept = str(p.get("DEPARTAMENTO_ORIGEN", "")).strip() or str(p.get("DEPARTAMENTO", "")).strip()
                m_activo = str(p.get("ACTIVO", "")).strip().upper()
                m_finalizado = str(p.get("FINALIZADO", "")).strip().upper()
                m_estado = str(p.get("ESTADO", "")).strip().upper()
                m_fecha_baja = str(p.get("FECHA_BAJA", "")).strip()
                
                if not m_nombre:
                    continue
                    
                # Un colaborador se considera activo/vigente si no está expresamente dado de baja o finalizado
                es_activo = (
                    m_activo in ("SÍ", "SI", "") and
                    m_finalizado not in ("SÍ", "SI", "TRUE") and
                    m_estado not in ("EQUIPO", "FINALIZADO", "TERMINADO", "NO APTO") and
                    not m_fecha_baja
                )
                
                if not es_activo:
                    continue
                    
                # Comprobar si ya existe en la hoja SIMPL (por ID o por Nombre Completo)
                in_simpl = False
                if m_id and m_id in ids_simpl:
                    in_simpl = True
                elif m_nombre.upper() in nombres_simpl:
                    in_simpl = True
                    
                if not in_simpl:
                    p_mapeada = {
                        "id": m_id,
                        "nombre": m_nombre,
                        "fecha_texto": str(p.get("FECHA_INCORPORACION", "")).strip(),
                        "departamento": m_dept
                    }
                    auto_agregar_incorporacion_simpl(p_mapeada)
                    nuevos_anadidos = True
                    
            if nuevos_anadidos:
                # Volver a cargar las filas de SIMPL para incluir a los nuevos incorporados
                filas = hoja.get_all_records()
        except Exception as err_sync:
            print(f"Error en auto-sync de nuevas incorporaciones: {err_sync}")
            
        # Obtener horas de la pestaña Formación
        from app.services.persona_service import obtener_horas_formacion_por_trabajador
        horas_formacion = obtener_horas_formacion_por_trabajador()
        
        datos = []
        for f in filas:
            id_val = str(f.get("ID", "")).strip()
            if not id_val and not str(f.get("Nombre y Apellido", "")):
                continue
                
            h_data = horas_formacion.get(id_val, {"camara": "0:00", "aula": "0:00"}) if id_val else {"camara": "0:00", "aula": "0:00"}
            
            camara_simpl = str(f.get("Cámara", "")).strip()
            camara_final = h_data["camara"]
            if camara_final == "0:00" and camara_simpl not in ("", "Pendiente", "FALSE"):
                camara_final = camara_simpl
                
            datos.append({
                "id": id_val,
                "salix": str(f.get("Salix", "")).strip(),
                "codigo": str(f.get("Código", "")).strip(),
                "nombre": str(f.get("Nombre y Apellido", "")).strip(),
                "fecha_alta": str(f.get("Fecha de alta", "")).strip(),
                "experiencia": str(f.get("Experiencia", "")).strip(),
                "lineas_hora": f.get("lineas/hora", ""),
                "rendimiento": str(f.get("Rendimiento", "")).strip(),
                "dept_grupo": str(f.get("Dept. y grupo", "")).strip(),
                "camara": camara_final,
                "aula_horas": h_data["aula"],
                "aula_s0": str(f.get("Aula S. 0", "")).strip(),
                "aula_s1": str(f.get("Aula S. 1", "")).strip(),
                "aula_s2": str(f.get("Aula S. 2", "")).strip(),
                "proxima": str(f.get("Próxima", "")).strip(),
                "total_form": f.get("Total form.", ""),
                "contr": f.get("Contr", ""),
                "telefono": str(f.get("Teléfono", "")).strip(),
                "whatsapp": str(f.get("Whatsapp", "")).strip()
            })
        return datos
    except Exception as e:
        print("Error en obtener_formacion_sacadores:", e)
        return []


def verificar_y_actualizar_cabeceras_agenda(sheet):
    try:
        headers = sheet.row_values(1)
        # Asegurar columna 8 (Aula) y columna 9 (Hora Fin)
        if len(headers) < 8 or "Aula" not in headers:
            sheet.update_cell(1, 8, "Aula")
        if len(headers) < 9 or "Hora Fin" not in headers:
            sheet.update_cell(1, 9, "Hora Fin")
    except Exception as e:
        print(f"Error al verificar cabeceras de Agenda: {e}")


def obtener_agenda_eventos() -> list:
    """Recupera la lista de sesiones planificadas en la pestaña Agenda Formación, agrupándolas."""
    try:
        from app.services.persona_service import SPREADSHEET_SACADORES_ID
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        sheet = doc.worksheet("Agenda Formación")
        
        verificar_y_actualizar_cabeceras_agenda(sheet)
        records = [sanitizar_registro_agenda(r) for r in sheet.get_all_records()]
        
        grupos = {}
        for idx, r in enumerate(records):
            fila_num = idx + 2
            nombre_val = str(r.get("Nombre", "")).strip()
            id_trabajador = str(r.get("ID_Trabajador", "")).strip()
            fecha = str(r.get("Fecha", "")).strip()
            hora = str(r.get("Hora", "")).strip()
            tipo_formacion = str(r.get("Tipo de Formación", "")).strip()
            formador = str(r.get("Formador", "")).strip()
            estado = str(r.get("Estado", "Pendiente")).strip() or "Pendiente"
            aula = str(r.get("Aula", "")).strip() or "Aula 1"
            
            hora_fin = str(r.get("Hora Fin", "")).strip()
            if not hora_fin and hora:
                try:
                    h, m = map(int, hora.split(":"))
                    hora_fin = f"{(h+1)%24:02d}:{m:02d}"
                except Exception:
                    hora_fin = "10:00"
            
            if not fecha:
                continue
                
            key = f"{fecha}_{hora}_{tipo_formacion}_{formador}_{aula}"
            
            if key not in grupos:
                grupos[key] = {
                    "id": key,
                    "fecha": fecha,
                    "hora": hora,
                    "hora_fin": hora_fin,
                    "tipo_formacion": tipo_formacion,
                    "formador": formador,
                    "aula": aula,
                    "estado": "Finalizada",
                    "integrantes": []
                }
                
            is_placeholder = (nombre_val == "SESION_GRUPAL" or not nombre_val) and (not id_trabajador or id_trabajador == "0" or id_trabajador == "")
            
            if not is_placeholder:
                grupos[key]["integrantes"].append({
                    "fila": fila_num,
                    "nombre": nombre_val,
                    "id_trabajador": id_trabajador,
                    "estado": estado
                })
                if estado != "Finalizada":
                    grupos[key]["estado"] = "Pendiente"
            else:
                grupos[key]["placeholder_fila"] = fila_num
                
        for key, g in grupos.items():
            if not g["integrantes"]:
                g["estado"] = "Pendiente"
                
        return list(grupos.values())
    except Exception as e:
        print(f"Error obteniendo eventos de agenda de sacadores: {e}")
        return []


def programar_agenda_evento(datos: dict) -> dict:
    """Inserta un nuevo evento programado en la pestaña Agenda Formación."""
    try:
        from app.services.persona_service import SPREADSHEET_SACADORES_ID, invalidar_todas_las_caches
        
        nombre = str(datos.get("nombre", "")).strip()
        id_trabajador = str(datos.get("id_trabajador", "")).strip()
        fecha = str(datos.get("fecha", "")).strip()
        hora = str(datos.get("hora", "")).strip()
        tipo_formacion = str(datos.get("tipo_formacion", "")).strip()
        formador = str(datos.get("formador", "")).strip()
        estado = str(datos.get("estado", "Pendiente")).strip()
        aula = str(datos.get("aula", "")).strip() or "Aula 1"
        
        hora_fin = str(datos.get("hora_fin", "")).strip()
        if not hora_fin and hora:
            try:
                h, m = map(int, hora.split(":"))
                hora_fin = f"{(h+1)%24:02d}:{m:02d}"
            except Exception:
                hora_fin = "10:00"
        
        if not fecha:
            return {"ok": False, "error": "La fecha es obligatoria."}
            
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        sheet = doc.worksheet("Agenda Formación")
        verificar_y_actualizar_cabeceras_agenda(sheet)
        
        if not nombre:
            nombre = "SESION_GRUPAL"
            id_trabajador = "0"
            
        nueva_fila = [nombre, id_trabajador, fecha, hora, tipo_formacion, formador, estado, aula, hora_fin]
        sheet.append_row(nueva_fila)
        
        invalidar_todas_las_caches()
        return {"ok": True}
    except Exception as e:
        print(f"Error programando evento: {e}")
        return {"ok": False, "error": str(e)}


def actualizar_agenda_evento(datos: dict) -> dict:
    """Actualiza un campo específico para un agendamiento de colaborador (fila individual)."""
    try:
        from app.services.persona_service import SPREADSHEET_SACADORES_ID, invalidar_todas_las_caches, registrar_formacion_trabajador
        
        id_val = datos.get("id") # Fila index (en el frontend, se pasa como id)
        campo = datos.get("campo")
        valor = datos.get("valor")
        
        if not id_val or not campo:
            return {"ok": False, "error": "Faltan parámetros clave para la actualización del evento."}
            
        fila_num = int(id_val)
        
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        sheet = doc.worksheet("Agenda Formación")
        
        nombre = sheet.cell(fila_num, 1).value
        id_trabajador = sheet.cell(fila_num, 2).value
        
        col_idx = None
        if campo == "fecha":
            col_idx = 3
        elif campo == "hora":
            col_idx = 4
        elif campo == "tipo_formacion":
            col_idx = 5
        elif campo == "formador":
            col_idx = 6
        elif campo == "estado":
            col_idx = 7
        elif campo == "aula":
            col_idx = 8
        elif campo == "hora_fin":
            col_idx = 9
            
        if not col_idx:
            return {"ok": False, "error": f"Campo '{campo}' no soportado para edición."}
            
        sheet.update_cell(fila_num, col_idx, str(valor).strip())
        
        if campo == "estado" and str(valor).upper().strip() == "FINALIZADA":
            tipo = sheet.cell(fila_num, 5).value or "Aula S. 0"
            formador_nombre = sheet.cell(fila_num, 6).value or "Sin Tutor"
            fecha_event = sheet.cell(fila_num, 3).value or ""
            
            if nombre != "SESION_GRUPAL" and id_trabajador and id_trabajador != "0" and id_trabajador != "":
                reg_payload = {
                    "id": str(id_trabajador).strip(),
                    "nombre": str(nombre).strip(),
                    "fecha": fecha_event,
                    "tipo_formacion": tipo,
                    "formador": formador_nombre,
                    "duracion": "1:00",
                    "observaciones": "Completado desde el Calendario de Agendamiento"
                }
                registrar_formacion_trabajador(reg_payload)
            
        invalidar_todas_las_caches()
        return {"ok": True}
    except Exception as e:
        print(f"Error al actualizar evento de agenda: {e}")
        return {"ok": False, "error": str(e)}


def actualizar_agenda_evento_grupo(datos: dict) -> dict:
    """Actualiza un campo para todos los integrantes del evento de grupo especificado."""
    try:
        from app.services.persona_service import SPREADSHEET_SACADORES_ID, invalidar_todas_las_caches, registrar_formacion_trabajador
        
        original_key = datos.get("original_key")
        campo = datos.get("campo")
        valor = datos.get("valor")
        
        if not original_key or not campo:
            return {"ok": False, "error": "Faltan parámetros clave para la actualización del grupo."}
            
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        sheet = doc.worksheet("Agenda Formación")
        
        records = [sanitizar_registro_agenda(r) for r in sheet.get_all_records()]
        partes = original_key.split("_")
        orig_fecha, orig_hora, orig_tipo, orig_formador, orig_aula = partes[0], partes[1], partes[2], partes[3], partes[4]
        
        col_idx = None
        if campo == "fecha":
            col_idx = 3
        elif campo == "hora":
            col_idx = 4
        elif campo == "tipo_formacion":
            col_idx = 5
        elif campo == "formador":
            col_idx = 6
        elif campo == "estado":
            col_idx = 7
        elif campo == "aula":
            col_idx = 8
        elif campo == "hora_fin":
            col_idx = 9
            
        if not col_idx:
            return {"ok": False, "error": f"Campo '{campo}' no soportado para actualización."}
            
        filas_a_actualizar = []
        for idx, r in enumerate(records):
            fila_num = idx + 2
            r_fecha = str(r.get("Fecha", "")).strip()
            r_hora = str(r.get("Hora", "")).strip()
            r_tipo = str(r.get("Tipo de Formación", "")).strip()
            r_formador = str(r.get("Formador", "")).strip()
            r_aula = str(r.get("Aula", "")).strip() or "Aula 1"
            
            if r_fecha == orig_fecha and r_hora == orig_hora and r_tipo == orig_tipo and r_formador == orig_formador and r_aula == orig_aula:
                filas_a_actualizar.append(fila_num)
                
        if not filas_a_actualizar:
            return {"ok": False, "error": "No se encontraron filas que coincidan con el evento especificado."}
            
        for fila_num in filas_a_actualizar:
            sheet.update_cell(fila_num, col_idx, str(valor).strip())
            
            if campo == "estado" and str(valor).upper().strip() == "FINALIZADA":
                nombre = sheet.cell(fila_num, 1).value
                id_trabajador = sheet.cell(fila_num, 2).value
                tipo = sheet.cell(fila_num, 5).value or "Aula S. 0"
                formador_nombre = sheet.cell(fila_num, 6).value or "Sin Tutor"
                fecha_event = sheet.cell(fila_num, 3).value or ""
                
                if nombre == "SESION_GRUPAL" or not id_trabajador or id_trabajador == "0" or id_trabajador == "":
                    continue
                    
                reg_payload = {
                    "id": str(id_trabajador).strip(),
                    "nombre": str(nombre).strip(),
                    "fecha": fecha_event,
                    "tipo_formacion": tipo,
                    "formador": formador_nombre,
                    "duracion": "1:00",
                    "observaciones": "Completado desde el Calendario de Agendamiento Grupal"
                }
                registrar_formacion_trabajador(reg_payload)
                
        invalidar_todas_las_caches()
        return {"ok": True}
    except Exception as e:
        print(f"Error al actualizar evento grupal de agenda: {e}")
        return {"ok": False, "error": str(e)}


def agregar_trabajador_a_evento(datos: dict) -> dict:
    """Añade un colaborador a un evento de grupo existente."""
    try:
        from app.services.persona_service import SPREADSHEET_SACADORES_ID, invalidar_todas_las_caches
        
        id_trabajador = str(datos.get("id_trabajador", "")).strip()
        nombre = str(datos.get("nombre", "")).strip()
        fecha = str(datos.get("fecha", "")).strip()
        hora = str(datos.get("hora", "")).strip()
        tipo_formacion = str(datos.get("tipo_formacion", "")).strip()
        formador = str(datos.get("formador", "")).strip()
        aula = str(datos.get("aula", "")).strip() or "Aula 1"
        estado = str(datos.get("estado", "Pendiente")).strip()
        
        hora_fin = str(datos.get("hora_fin", "")).strip()
        if not hora_fin and hora:
            try:
                h, m = map(int, hora.split(":"))
                hora_fin = f"{(h+1)%24:02d}:{m:02d}"
            except Exception:
                hora_fin = "10:00"
        
        if not nombre or not fecha:
            return {"ok": False, "error": "Nombre y Fecha son obligatorios."}
            
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        sheet = doc.worksheet("Agenda Formación")
        verificar_y_actualizar_cabeceras_agenda(sheet)
        
        records = [sanitizar_registro_agenda(r) for r in sheet.get_all_records()]
        placeholder_fila = None
        for idx, r in enumerate(records):
            r_nombre = str(r.get("Nombre", "")).strip()
            r_id = str(r.get("ID_Trabajador", "")).strip()
            r_fecha = str(r.get("Fecha", "")).strip()
            r_hora = str(r.get("Hora", "")).strip()
            r_tipo = str(r.get("Tipo de Formación", "")).strip()
            r_formador = str(r.get("Formador", "")).strip()
            r_aula = str(r.get("Aula", "")).strip() or "Aula 1"
            
            if (r_fecha == fecha and r_hora == hora and r_tipo == tipo_formacion and 
                r_formador == formador and r_aula == aula and 
                (r_nombre == "SESION_GRUPAL" or not r_nombre) and (not r_id or r_id == "0" or r_id == "")):
                placeholder_fila = idx + 2
                break
                
        if placeholder_fila:
            # Reemplazar la fila del placeholder
            sheet.update([[nombre, id_trabajador, fecha, hora, tipo_formacion, formador, estado, aula, hora_fin]], f"A{placeholder_fila}:I{placeholder_fila}")
        else:
            duplicado = False
            for r in records:
                r_id = str(r.get("ID_Trabajador", "")).strip()
                r_fecha = str(r.get("Fecha", "")).strip()
                r_hora = str(r.get("Hora", "")).strip()
                r_tipo = str(r.get("Tipo de Formación", "")).strip()
                r_aula = str(r.get("Aula", "")).strip() or "Aula 1"
                if r_id == id_trabajador and r_fecha == fecha and r_hora == hora and r_tipo == tipo_formacion and r_aula == aula:
                    duplicado = True
                    break
                    
            if duplicado:
                return {"ok": True, "info": "El colaborador ya está asignado a esta sesión."}
                
            nueva_fila = [nombre, id_trabajador, fecha, hora, tipo_formacion, formador, estado, aula, hora_fin]
            sheet.append_row(nueva_fila)
            
        invalidar_todas_las_caches()
        return {"ok": True}
    except Exception as e:
        print(f"Error añadiendo trabajador a evento: {e}")
        return {"ok": False, "error": str(e)}


def eliminar_trabajador_de_evento(fila_idx: int) -> dict:
    """Elimina un colaborador de un evento de grupo (borrando su fila en Sheets)."""
    try:
        from app.services.persona_service import SPREADSHEET_SACADORES_ID, invalidar_todas_las_caches
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        sheet = doc.worksheet("Agenda Formación")
        
        sheet.delete_rows(int(fila_idx))
        
        invalidar_todas_las_caches()
        return {"ok": True}
    except Exception as e:
        print(f"Error al eliminar fila {fila_idx} de Agenda Formación: {e}")
        return {"ok": False, "error": str(e)}
