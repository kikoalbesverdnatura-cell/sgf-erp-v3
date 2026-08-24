import logging
import threading
from datetime import date, datetime, timedelta
from app.services.google_service import abrir_documento_por_key

logger = logging.getLogger(__name__)

DOCUMENTO_FORMADORES = "19V0hASsS5P34bf1kR893b_uE1bZ2RSePT-QZlO8z2-k"

# Caché global
_cache_datos = None
_cache_timestamp = None
_cache_lock = threading.Lock()
CACHE_DURATION_SECS = 30


def parse_date(val):
    if not val:
        return ""
    if isinstance(val, (datetime, date)):
        return val.strftime("%d/%m/%Y")
    # Convertir números seriales de Excel/Google Sheets
    try:
        val_str = str(val).replace(",", ".").strip()
        if val_str.replace(".", "", 1).isdigit():
            float_val = float(val_str)
            base_date = datetime(1899, 12, 30)
            actual_date = base_date + timedelta(days=float_val)
            return actual_date.strftime("%d/%m/%Y")
    except ValueError:
        pass
    return str(val).strip()


def duration_to_minutes(val):
    if not val:
        return 0
    val_str = str(val).replace(",", ".").strip()
    # Si es un número decimal (fracción de día en Sheets)
    try:
        if val_str.replace(".", "", 1).isdigit():
            return int(float(val_str) * 24 * 60)
    except ValueError:
        pass
    
    parts = val_str.split(":")
    try:
        if len(parts) >= 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 1:
            return int(float(parts[0]) * 60)
    except Exception:
        pass
    return 0


def minutes_to_duration(mins):
    hours = mins // 60
    minutes = mins % 60
    return f"{hours}:{minutes:02d}"


def format_duration(val):
    return minutes_to_duration(duration_to_minutes(val))


def get_all_records_safe(worksheet):
    rows = worksheet.get_all_values()
    if not rows:
        return []
    headers = rows[0]
    seen = {}
    new_headers = []
    for h in headers:
        h_clean = str(h).strip()
        if not h_clean:
            h_clean = "EMPTY_HEADER"
        if h_clean in seen:
            seen[h_clean] += 1
            new_headers.append(f"{h_clean}_{seen[h_clean]}")
        else:
            seen[h_clean] = 0
            new_headers.append(h_clean)
            
    records = []
    for r in rows[1:]:
        r_padded = r + [""] * (len(new_headers) - len(r))
        records.append(dict(zip(new_headers, r_padded)))
    return records


def _cargar_datos_completos():
    global _cache_datos, _cache_timestamp
    ahora = datetime.now()
    
    with _cache_lock:
        if _cache_datos and _cache_timestamp and (ahora - _cache_timestamp).total_seconds() < CACHE_DURATION_SECS:
            return _cache_datos

        logger.info("Cargando base de datos de formadores desde Google Sheets...")
        try:
            doc = abrir_documento_por_key(DOCUMENTO_FORMADORES)
            
            # 1. Cargar Formadores
            hoja_f = doc.worksheet("FORMADORES")
            raw_formadores = get_all_records_safe(hoja_f)
            formadores = []
            for f in raw_formadores:
                f_id = str(f.get("ID", "")).strip()
                if f_id and f_id.isdigit():
                    formadores.append({
                        "id": int(f_id),
                        "codigo": str(f.get("LETRA", "")).strip(),
                        "nombre": str(f.get("NOMBRE", "")).strip(),
                        "dias_camara": int(f.get("DIAS CÁMARA") or 0),
                        "dias_aula": int(f.get("DIAS AULA") or 0),
                        "horas_camara": format_duration(f.get("HORAS CÁMARA")),
                        "horas_aula": format_duration(f.get("HORAS AULA")),
                    })

            # 2. Cargar diario Cámara
            hoja_c = doc.worksheet("FORMACIÓN CÁMARA")
            raw_camara = get_all_records_safe(hoja_c)
            clases_camara = []
            for c in raw_camara:
                t_id = str(c.get("ID", "")).strip()
                if t_id:
                    # Trainee ID column has trailing space in Sheets
                    key_alumno = "ENSEÑA A " if "ENSEÑA A " in c else "ENSEÑA A"
                    alumno_id = str(c.get(key_alumno, "")).strip()
                    clases_camara.append({
                        "formador_id": t_id,
                        "formador_codigo": str(c.get("LETRAS", "")).strip(),
                        "formador_nombre": str(c.get("NOMBRE", "")).strip(),
                        "fecha": parse_date(c.get("DIA")),
                        "alumno_id": alumno_id,
                        "alumno_nombre": str(c.get("NOMBRE_1", c.get("NOMBRE", ""))).strip(),
                        "duracion_mins": duration_to_minutes(c.get("FORM. CÁMARA")),
                        "departamento": str(c.get("DEPARTAMENTO", "")).strip()
                    })

            # 3. Cargar diario Aula
            hoja_a = doc.worksheet("FORMACIÓN AULA")
            raw_aula = get_all_records_safe(hoja_a)
            clases_aula = []
            for a in raw_aula:
                t_id = str(a.get("ID", "")).strip()
                if t_id:
                    key_alumno = "ENSEÑA A " if "ENSEÑA A " in a else "ENSEÑA A"
                    alumno_id = str(a.get(key_alumno, "")).strip()
                    clases_aula.append({
                        "formador_id": t_id,
                        "formador_codigo": str(a.get("LETRAS", "")).strip(),
                        "formador_nombre": str(a.get("NOMBRE", "")).strip(),
                        "fecha": parse_date(a.get("DIA")),
                        "alumno_id": alumno_id,
                        "alumno_nombre": str(a.get("NOMBRE_1", a.get("NOMBRE", ""))).strip(),
                        "duracion_mins": duration_to_minutes(a.get("FORM. AULA")),
                        "departamento": str(a.get("DEPARTAMENTO", "")).strip()
                    })

            _cache_datos = {
                "formadores": formadores,
                "camara": clases_camara,
                "aula": clases_aula
            }
            _cache_timestamp = ahora
            logger.info("Carga de datos de formadores completada con éxito.")
            return _cache_datos
        except Exception as e:
            logger.error(f"Error cargando base de datos de formadores: {e}")
            if _cache_datos:
                return _cache_datos  # Fallback to expired cache if sheets fails
            raise e


def obtener_formadores():
    datos = _cargar_datos_completos()
    
    # Calculate unique alumnos overall
    todas_alumnos = set()
    for c in datos["camara"]:
        if c.get("alumno_id"):
            todas_alumnos.add(str(c["alumno_id"]).strip())
    for a in datos["aula"]:
        if a.get("alumno_id"):
            todas_alumnos.add(str(a["alumno_id"]).strip())
            
    # Calculate unique alumnos for each formador
    for f in datos["formadores"]:
        f_id_str = str(f["id"]).strip()
        f_alumnos = set()
        for c in datos["camara"]:
            if str(c["formador_id"]).strip() == f_id_str and c.get("alumno_id"):
                f_alumnos.add(str(c["alumno_id"]).strip())
        for a in datos["aula"]:
            if str(a["formador_id"]).strip() == f_id_str and a.get("alumno_id"):
                f_alumnos.add(str(a["alumno_id"]).strip())
        f["alumnos_unicos"] = len(f_alumnos)

    return {
        "formadores": datos["formadores"],
        "total_alumnos": len(todas_alumnos)
    }


def obtener_detalle_formador(formador_id):
    datos = _cargar_datos_completos()
    f_id_str = str(formador_id).strip()
    
    # Buscar formador
    formador = next((f for f in datos["formadores"] if str(f["id"]) == f_id_str), None)
    if not formador:
        return None
        
    # Filtrar clases impartidas
    clases_camara = [c for c in datos["camara"] if str(c["formador_id"]) == f_id_str]
    clases_aula = [a for a in datos["aula"] if str(a["formador_id"]) == f_id_str]
    
    # Unificar clases en un timeline cronológico
    timeline = []
    total_mins_camara = 0
    total_mins_aula = 0
    
    # Cargar base de datos de personas para cruzar nombres reales si es posible
    from app.services.persona_service import obtener_personas
    try:
        personas_db = {str(p["id"]).strip(): p for p in obtener_personas()}
    except Exception:
        personas_db = {}

    alumnos_unicos = {}
    
    for c in clases_camara:
        a_id = str(c["alumno_id"]).strip()
        nombre_alumno = c["alumno_nombre"]
        if a_id in personas_db:
            nombre_alumno = personas_db[a_id]["nombre"]
            
        duracion = minutes_to_duration(c["duracion_mins"])
        total_mins_camara += c["duracion_mins"]
        
        timeline.append({
            "fecha": c["fecha"],
            "alumno_id": a_id,
            "alumno_nombre": nombre_alumno,
            "tipo": "Cámara",
            "duracion": duracion,
            "duracion_mins": c["duracion_mins"],
            "departamento": c["departamento"]
        })
        
        # Registrar alumno
        if a_id and a_id.isdigit():
            if a_id not in alumnos_unicos:
                alumnos_unicos[a_id] = {
                    "id": int(a_id),
                    "nombre": nombre_alumno,
                    "departamento": c["departamento"],
                    "horas_camara_mins": 0,
                    "horas_aula_mins": 0,
                    "ultimo_contacto": c["fecha"]
                }
            alumnos_unicos[a_id]["horas_camara_mins"] += c["duracion_mins"]

    for a in clases_aula:
        a_id = str(a["alumno_id"]).strip()
        nombre_alumno = a["alumno_nombre"]
        if a_id in personas_db:
            nombre_alumno = personas_db[a_id]["nombre"]
            
        duracion = minutes_to_duration(a["duracion_mins"])
        total_mins_aula += a["duracion_mins"]
        
        timeline.append({
            "fecha": a["fecha"],
            "alumno_id": a_id,
            "alumno_nombre": nombre_alumno,
            "tipo": "Aula",
            "duracion": duracion,
            "duracion_mins": a["duracion_mins"],
            "departamento": a["departamento"]
        })
        
        # Registrar alumno
        if a_id and a_id.isdigit():
            if a_id not in alumnos_unicos:
                alumnos_unicos[a_id] = {
                    "id": int(a_id),
                    "nombre": nombre_alumno,
                    "departamento": a["departamento"],
                    "horas_camara_mins": 0,
                    "horas_aula_mins": 0,
                    "ultimo_contacto": a["fecha"]
                }
            alumnos_unicos[a_id]["horas_aula_mins"] += a["duracion_mins"]

    # Ordenar timeline por fecha desc
    def parse_dt(f_str):
        try:
            return datetime.strptime(f_str, "%d/%m/%Y")
        except Exception:
            return datetime.min
            
    timeline.sort(key=lambda x: parse_dt(x["fecha"]), reverse=True)
    
    # Formatear horas agregadas de alumnos
    alumnos_list = []
    for a_data in alumnos_unicos.values():
        a_data["horas_camara"] = minutes_to_duration(a_data["horas_camara_mins"])
        a_data["horas_aula"] = minutes_to_duration(a_data["horas_aula_mins"])
        a_data["total_horas"] = minutes_to_duration(a_data["horas_camara_mins"] + a_data["horas_aula_mins"])
        # Cruzar si sigue activo
        if str(a_data["id"]) in personas_db:
            p_estado = personas_db[str(a_data["id"])].get("estado", "")
            a_data["activo"] = p_estado not in ["Finalizado", "Baja", "Terminado", "No apto"]
        else:
            a_data["activo"] = False
        alumnos_list.append(a_data)
        
    # Ordenar alumnos por su última fecha
    alumnos_list.sort(key=lambda x: parse_dt(x["ultimo_contacto"]), reverse=True)

    return {
        "formador": formador,
        "horas_camara_calc": minutes_to_duration(total_mins_camara),
        "horas_aula_calc": minutes_to_duration(total_mins_aula),
        "total_horas_calc": minutes_to_duration(total_mins_camara + total_mins_aula),
        "alumnos": alumnos_list,
        "timeline": timeline
    }


def obtener_formacion_alumno(alumno_id):
    datos = _cargar_datos_completos()
    a_id_str = str(alumno_id).strip()
    
    clases = []
    total_mins_camara = 0
    total_mins_aula = 0
    
    # Buscar en clases de cámara
    for c in datos["camara"]:
        if str(c["alumno_id"]).strip() == a_id_str:
            clases.append({
                "fecha": c["fecha"],
                "formador_id": c["formador_id"],
                "formador_nombre": c["formador_nombre"],
                "tipo": "Cámara",
                "duracion": minutes_to_duration(c["duracion_mins"]),
                "duracion_mins": c["duracion_mins"]
            })
            total_mins_camara += c["duracion_mins"]
            
    # Buscar en clases de aula
    for a in datos["aula"]:
        if str(a["alumno_id"]).strip() == a_id_str:
            clases.append({
                "fecha": a["fecha"],
                "formador_id": a["formador_id"],
                "formador_nombre": a["formador_nombre"],
                "tipo": "Aula",
                "duracion": minutes_to_duration(a["duracion_mins"]),
                "duracion_mins": a["duracion_mins"]
            })
            total_mins_aula += a["duracion_mins"]

    # Ordenar por fecha desc
    def parse_dt(f_str):
        try:
            return datetime.strptime(f_str, "%d/%m/%Y")
        except Exception:
            return datetime.min
            
    clases.sort(key=lambda x: parse_dt(x["fecha"]), reverse=True)
    
    return {
        "clases": clases,
        "horas_camara": minutes_to_duration(total_mins_camara),
        "horas_aula": minutes_to_duration(total_mins_aula),
        "total_horas": minutes_to_duration(total_mins_camara + total_mins_aula),
        "horas_camara_mins": total_mins_camara,
        "horas_aula_mins": total_mins_aula
    }
