from datetime import date, datetime, timedelta
from collections import defaultdict
import time
import threading

from app.services.google_service import abrir_documento


DOCUMENTO = "DB_FORMACION_VERDNATURA"
HOJA = "MAESTRO_PERSONAS"


DEPARTAMENTOS_SEGUIMIENTO = [
    "TALLER NATURAL",
    "SACADO H",
    "SACADO V",
]


CHECKLIST_INICIAL = [
    ("RRHH", "rrhh"),
    ("Almuerzo", "almuerzo"),
    ("Ropa", "uniforme"),
    ("Su puesto", "tour"),
]


# Caché global en memoria para los datos de Google Sheets
_cache_datos = None
_cache_timestamp = 0.0
_cache_lock = threading.Lock()
CACHE_TTL_SEGUNDOS = 300  # 5 minutos de tiempo de vida (TTL)

def invalidar_cache_dashboard():
    global _cache_datos, _cache_timestamp
    with _cache_lock:
        _cache_datos = None
        _cache_timestamp = 0.0

def obtener_alertas_seguimiento_activas_safe():
    try:
        from app.services.intervenciones_service import obtener_alertas_seguimiento_activas
        return obtener_alertas_seguimiento_activas()
    except Exception as e:
        logger.error(f"Error obteniendo alertas de seguimiento: {e}")
        return []


def obtener_dashboard(forzar_refresco=False):
    global _cache_datos, _cache_timestamp

    ahora = time.time()
    if not forzar_refresco:
        with _cache_lock:
            if _cache_datos is not None and (ahora - _cache_timestamp) < CACHE_TTL_SEGUNDOS:
                return _cache_datos

    # Disparar revisión automática de bajas diaria en segundo plano
    try:
        from app.services.persona_service import sincronizar_bajas_salix
        import threading
        threading.Thread(target=sincronizar_bajas_salix, args=(False,), daemon=True).start()
    except Exception:
        pass

    from app.services.persona_service import obtener_filas_maestro_personas, obtener_filas_simpl, auto_agregar_incorporacion_simpl, obtener_overrides, obtener_ultimas_observaciones_globales
    filas = obtener_filas_maestro_personas()
    overrides = obtener_overrides()

    personas = []
    todas_personas = []
    for f in filas:
        id_val = str(f.get("ID_Trabajador", "")).strip()
        nombre_val = str(f.get("NOMBRE_COMPLETO", "")).strip()
        if not id_val or id_val.startswith("#") or not nombre_val:
            continue
        p_norm = normalizar_persona(f, overrides)
        todas_personas.append(p_norm)
        
        # Filtrar por departamento (sólo SACADO H, SACADO V, TALLER NATURAL)
        dept_norm = normalizar_texto(p_norm.get("departamento"))
        import unicodedata
        dept_clean = "".join(c for c in unicodedata.normalize('NFD', dept_norm) if unicodedata.category(c) != 'Mn')
        dept_clean = " ".join(dept_clean.split())
        if dept_clean not in ("SACADO H", "SACADO V", "TALLER NATURAL"):
            continue
            
        # Filtrar por días (sólo hasta el día 31, permitiendo días <= 0 para incorporaciones futuras y de hoy)
        try:
            dias_val = int(p_norm.get("dias") or 0)
            if dias_val > 31:
                continue
        except (ValueError, TypeError):
            continue
            
        personas.append(p_norm)

    # Integración con la hoja SIMPL (FORMACIÓN SACADORES)
    simpl_rows = obtener_filas_simpl()
    simpl_ids = {str(r.get("ID", "")).strip() for r in simpl_rows if r.get("ID")}
    
    # Auto-agregar nuevas incorporaciones que estén en los departamentos objetivo
    for p in personas:
        p_id = str(p.get("id", "")).strip()
        if not p_id or not p_id.isdigit():
            continue
        if es_departamento_whatsapp_valido(p.get("departamento", "")):
            if es_persona_activa(p) or es_estado_induccion_whatsapp(p):
                if p_id not in simpl_ids:
                    auto_agregar_incorporacion_simpl(p)
                    nombre_partes = p.get("nombre", "").split()
                    codigo = "".join([part[0] for part in nombre_partes if part])[:3].upper()
                    simpl_rows.append({
                        "ID": int(p_id),
                        "Salix": f"Datos Empleado {p_id}",
                        "Código": codigo,
                        "Nombre y Apellido": p.get("nombre", ""),
                        "Fecha de alta": p.get("fecha_texto", ""),
                        "Experiencia": "",
                        "lineas/hora": "",
                        "Rendimiento": "",
                        "Dept. y grupo": p.get("departamento", ""),
                        "Cámara": "Pendiente",
                        "Aula S. 0": "FALSE",
                        "Aula S. 1": "FALSE",
                        "Aula S. 2": "FALSE",
                        "Próxima": "",
                        "Total form.": 0,
                        "Contr": 1,
                        "Teléfono": "",
                        "Whatsapp": "FALSE"
                    })
                    simpl_ids.add(p_id)

    # Construir listado de Whatsapp desde la hoja SIMPL
    personas_by_id = {str(p.get("id")).strip(): p for p in personas}
    personas_whatsapp_flow = []
    
    for s in simpl_rows:
        w_id = str(s.get("ID", "")).strip()
        if not w_id or not w_id.isdigit():
            continue
            
        p = personas_by_id.get(w_id)
        whatsapp_val = str(s.get("Whatsapp", "")).strip().upper()
        whatsapp_anadido = "SÍ" if whatsapp_val in ("TRUE", "SI", "SÍ") else "NO"
        
        nombre = s.get("Nombre y Apellido", "") or (p.get("nombre", "") if p else "")
        fecha = s.get("Fecha de alta", "") or (p.get("fecha_texto", "") if p else "")
        depto = s.get("Dept. y grupo", "") or (p.get("departamento", "") if p else "")
        
        telefono_raw = str(s.get("Teléfono", "")).strip()
        if telefono_raw.endswith(".0"):
            telefono_raw = telefono_raw[:-2]
        telefono = telefono_raw if telefono_raw else "Sin teléfono"
        
        p_whatsapp = {
            "id": w_id,
            "nombre": nombre,
            "fecha": fecha,
            "departamento": depto,
            "telefono": telefono,
            "whatsapp_anadido": whatsapp_anadido,
            "estado": p.get("estado", "Nueva") if p else "Nueva",
            "tutor": p.get("tutor", "") if p else ""
        }
        personas_whatsapp_flow.append(p_whatsapp)

    # Filtrar por departamento de Whatsapp válido
    personas_whatsapp_flow = [p for p in personas_whatsapp_flow if es_departamento_whatsapp_valido(p.get("departamento", ""))]

    personas_whatsapp_add = [p for p in personas_whatsapp_flow if p["whatsapp_anadido"] != "SÍ" and es_estado_induccion_whatsapp(p)]
    personas_whatsapp_add.sort(key=lambda x: x.get("fecha") or "")
    
    personas_whatsapp_remove = [p for p in personas_whatsapp_flow if p["whatsapp_anadido"] == "SÍ" and not es_estado_induccion_whatsapp(p)]
    personas_whatsapp_remove.sort(key=lambda x: x.get("fecha") or "")

    resultado = {
        "kpis": calcular_kpis(personas, todas_personas),
        "incorporaciones": {
            "total": contar_nuevas_incorporaciones(todas_personas),
            "hoy": obtener_incorporaciones_por_rango(todas_personas, "hoy", filtrar_departamento=False),
            "manana": obtener_incorporaciones_por_rango(todas_personas, "manana", filtrar_departamento=False),
            "semana": obtener_incorporaciones_por_rango(todas_personas, "semana", filtrar_departamento=False),
            "quincena": obtener_incorporaciones_por_rango(todas_personas, "quincena", filtrar_departamento=False),
            "mes": obtener_incorporaciones_por_rango(todas_personas, "mes", filtrar_departamento=False),
        },
        "proximasEntradas": obtener_proximas_entradas(todas_personas, filtrar_departamento=False),
        "personasSeguimiento": obtener_personas_seguimiento(personas),
        "estadoPrograma": obtener_estado_programa(personas),
        "departamentos": obtener_departamentos(personas),
        "personasPendientesFormacion": obtener_personas_pendientes_formacion(personas, simpl_rows),
        "checklistPendiente": obtener_checklist_pendiente(personas),
        "personasRiesgo": obtener_personas_riesgo(personas),
        "alertas": obtener_alertas(personas),
        "productividad": obtener_productividad_resumen(personas),
        "timeline": obtener_ultimas_observaciones_globales(limit=15),
        "formadores": obtener_formadores(personas),
        "retrasos": obtener_retrasos_trabajadores(personas),
        "erroresConsecutivos": obtener_errores_consecutivos(personas),
        "personasRevision21": obtener_personas_revision_21(personas),
        "personasWhatsapp": personas_whatsapp_add,
        "personasWhatsappQuitar": personas_whatsapp_remove,
        "alertasSeguimiento": (lambda: obtener_alertas_seguimiento_activas_safe())(),
    }

    # Calcular cantidades de semáforos (Rojo, Amarillo, Verde)
    rojos = 0
    amarillos = 0
    verdes = 0
    try:
        from app.services.persona_service import obtener_personas
        lista_personas = obtener_personas(excluir_equipo=True)
        for p in lista_personas:
            color = p.get("color_code")
            if color == "ROJO":
                rojos += 1
            elif color == "AMARILLO":
                amarillos += 1
            elif color == "VERDE":
                verdes += 1
    except Exception as e:
        pass

    # Sobrescribir los KPIs calculados con los reales basados en la hoja SIMPL
    resultado["kpis"]["whatsappPendiente"] = len(personas_whatsapp_add)
    resultado["kpis"]["whatsappQuitar"] = len(personas_whatsapp_remove)
    resultado["kpis"]["semaforoRojo"] = rojos
    resultado["kpis"]["semaforoAmarillo"] = amarillos
    resultado["kpis"]["semaforoVerde"] = verdes

    with _cache_lock:
        _cache_datos = resultado
        _cache_timestamp = ahora

    return resultado


def normalizar_persona(p, overrides=None):
    from app.services.persona_service import obtener_overrides
    w_id = str(p.get("ID_Trabajador", "")).strip()
    if overrides is None:
        overrides = obtener_overrides()
    worker_overrides = overrides.get(w_id, {})
    
    dept = worker_overrides.get("departamento", str(p.get("DEPARTAMENTO_ORIGEN", "")).strip())

    hora_entrada = worker_overrides.get("hora_entrada", "08:00")

    # Calcular días desde incorporación dinámicamente
    dias_calc = ""
    val_fecha = p.get("FECHA_INCORPORACION", "")
    if val_fecha:
        from datetime import date, datetime
        fecha_inc = None
        if isinstance(val_fecha, (datetime, date)):
            fecha_inc = val_fecha if isinstance(val_fecha, date) else val_fecha.date()
        else:
            for formato in ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"]:
                try:
                    fecha_inc = datetime.strptime(str(val_fecha).strip(), formato).date()
                    break
                except Exception:
                    pass
        if fecha_inc:
            dias_calc = (date.today() - fecha_inc).days
            if dias_calc < 0:
                dias_calc = 0

    persona = {
        "id": p.get("ID_Trabajador", ""),
        "nombre": p.get("NOMBRE_COMPLETO", ""),
        "programa": p.get("TIPO_PROGRAMA", ""),
        "fecha": convertir_fecha(p.get("FECHA_INCORPORACION", "")),
        "fecha_texto": str(p.get("FECHA_INCORPORACION", "")).strip(),
        "departamento": dept,
        "hora": hora_entrada,
        "estado": str(p.get("ESTADO", "")).strip(),
        "dias": dias_calc,
        "dias_restantes": p.get("DIAS_RESTANTES", ""),
        "riesgo": str(p.get("RIESGO", "")).strip(),
        "riesgo_score": p.get("RIESGO_SCORE", ""),
        "tutor": str(p.get("TUTOR_ASIGNADO", "") or p.get("Formador", "")).strip(),

        "rrhh": p.get("RRHH", ""),
        "almuerzo": p.get("ALMUERZO", ""),
        "uniforme": p.get("UNIFORME", ""),
        "psicotecnico": p.get("PSICOTECNICO", ""),
        "formacion": p.get("FORMACION_BIENVENIDA", ""),
        "tour": p.get("TOUR_EMPRESA", ""),

        "pda": p.get("PDA_ENTREGADA", ""),
        "pda_documento": p.get("PDA_DOCUMENTO", ""),
        "pda_fecha": p.get("PDA_FECHA_FIRMA", ""),

        "productividad_media": p.get("PRODUCTIVIDAD_MEDIA", ""),
        "error_medio": p.get("ERROR_MEDIO", ""),
        "ultima_fecha_grafana": p.get("ULTIMA_FECHA_GRAFANA", ""),
        "observaciones": p.get("Observaciones", ""),
        "revision_enviada": str(p.get("REVISION_ENVIADA", "")).strip(),
        "whatsapp_anadido": str(p.get("WHATSAPP_ANADIDO", "")).strip(),
        "contrato_limitado": str(p.get("CONTRATO_LIMITADO", "") or "NO").strip().upper(),
        "activo": str(p.get("ACTIVO", "")).strip(),
        "finalizado": str(p.get("FINALIZADO", "")).strip(),
    }

    checklist = calcular_checklist(persona)

    persona["checklist_total"] = checklist["total"]
    persona["checklist_completado"] = checklist["completado"]
    persona["checklist_porcentaje"] = checklist["porcentaje"]
    persona["checklist_pendientes"] = checklist["pendientes"]

    return persona


def normalizar_texto(valor):
    val = str(valor or "").upper().strip()
    val = " ".join(val.split())
    val = val.replace("TALLLER", "TALLER")
    return val


def convertir_fecha(valor):
    if not valor:
        return None

    if isinstance(valor, datetime):
        return valor.date()

    if isinstance(valor, date):
        return valor

    texto = str(valor).strip()

    for formato in ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"]:
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            pass

    return None


def convertir_numero(valor):
    if valor in [None, ""]:
        return None

    try:
        return float(str(valor).replace("%", "").replace(",", ".").strip())
    except Exception:
        return None


def es_check(valor):
    return normalizar_texto(valor) in [
        "TRUE",
        "SI",
        "SÍ",
        "1",
        "X",
        "OK",
        "HECHO",
        "COMPLETADO",
    ]


def es_departamento_seguimiento(departamento):
    dep = normalizar_texto(departamento)

    return any(normalizar_texto(d) in dep for d in DEPARTAMENTOS_SEGUIMIENTO)


def es_persona_activa(persona):
    estado_normalizado = normalizar_texto(persona.get("estado"))
    if estado_normalizado in ("TERMINADO", "FINALIZADO", "NO APTO", "BAJA", "EQUIPO"):
        return False
        
    # Excluir de formación a personas que ya superaron los 31 días del periodo de prueba
    try:
        dias = int(persona.get("dias") or 0)
        if dias > 31:
            return False
    except (ValueError, TypeError):
        pass
        
    return True



def es_nueva_incorporacion(persona):
    if not persona:
        return False
    finalizado = str(persona.get("finalizado") or "").strip().upper()
    activo = str(persona.get("activo") or "").strip().upper()
    estado = str(persona.get("estado") or "").strip().upper()
    if finalizado in ("SÍ", "SI", "TRUE") or activo == "NO" or estado in ("BAJA", "NO APTO"):
        return False
    return "NUEVA" in normalizar_texto(persona.get("programa"))


def es_mili(persona):
    return "MILI" in normalizar_texto(persona.get("programa"))


def es_departamento_whatsapp_valido(depto):
    dep = normalizar_texto(depto)
    import unicodedata
    dep_clean = "".join(c for c in unicodedata.normalize('NFD', dep) if unicodedata.category(c) != 'Mn')
    # Coincidencia exacta para evitar "SACADO H - HALCONES"
    return dep_clean in ("SACADO H", "SACADOR H", "TALLER NATURAL")


def es_estado_induccion_whatsapp(p):
    estado = normalizar_texto(p.get("estado", ""))
    import unicodedata
    est_clean = "".join(c for c in unicodedata.normalize('NFD', estado) if unicodedata.category(c) != 'Mn')
    
    # Estados de inducción: permanece en el grupo si es Nueva, En curso o Acompañamiento
    if est_clean in ("NUEVA", "EN CURSO", "ACOMPANAMIENTO"):
        return True
        
    # Si el estado está vacío, es inducción solo si es un ingreso reciente (<= 15 días)
    if est_clean == "":
        fecha = p.get("fecha")
        if isinstance(fecha, str):
            from app.services.dashboard_service import convertir_fecha
            fecha = convertir_fecha(fecha)
            
        if not fecha:
            fecha_val = p.get("fecha_texto") or p.get("FECHA_INCORPORACION")
            if fecha_val:
                from app.services.dashboard_service import convertir_fecha
                fecha = convertir_fecha(fecha_val)
            
        if fecha:
            from datetime import date as dt_date, datetime
            if isinstance(fecha, datetime):
                fecha = fecha.date()
            if isinstance(fecha, dt_date):
                if (dt_date.today() - fecha).days <= 15:
                    return True
                
    return False


def es_pendiente_whatsapp(p):
    w_id = str(p.get("id", "")).strip()
    if not w_id or w_id.startswith("#") or not w_id.isdigit():
        return False
        
    if not es_departamento_whatsapp_valido(p.get("departamento", "")):
        return False
        
    whatsapp_val = str(p.get("whatsapp_anadido", "")).strip().upper()
    if whatsapp_val in ("SÍ", "SI", "QUITADO"):
        return False
        
    # Para ser añadido debe estar en fase de inducción (Nueva, En curso, Acompañamiento o ingreso reciente)
    if not es_estado_induccion_whatsapp(p):
        return False
        
    return True


def es_retirable_whatsapp(p):
    w_id = str(p.get("id", "")).strip()
    if not w_id or w_id.startswith("#") or not w_id.isdigit():
        return False
        
    if not es_departamento_whatsapp_valido(p.get("departamento", "")):
        return False
        
    whatsapp_val = str(p.get("whatsapp_anadido", "")).strip().upper()
    if whatsapp_val not in ("SÍ", "SI"):
        return False
        
    # Sale del grupo si ya NO está en estado de inducción
    if not es_estado_induccion_whatsapp(p):
        return True
        
    return False


def calcular_kpis(personas, todas_personas=None):
    if todas_personas is None:
        todas_personas = personas

    nuevas = sum(1 for p in todas_personas if es_nueva_incorporacion(p))
    mili = 0
    seguimiento = 0
    riesgo = 0
    formadores = set()
    pda_entregadas = 0
    revision21 = 0
    no_aptos = 0
    whatsapp_pendiente = 0
    whatsapp_quitar = 0
    contrato_limitado = 0

    for p in todas_personas:
        estado_val = str(p.get("estado", "")).strip().upper()
        finalizado_val = str(p.get("finalizado", "")).strip().upper()
        is_active = estado_val not in ("FINALIZADO", "BAJA", "TERMINADO", "NO APTO") and finalizado_val not in ("SÍ", "SI", "TRUE")
        if is_active and str(p.get("contrato_limitado", "")).strip().upper() in ("SÍ", "SI", "X", "TRUE", "S"):
            contrato_limitado += 1

    for p in personas:
        if normalizar_texto(p.get("estado")) == "NO APTO":
            no_aptos += 1

        if es_mili(p):
            mili += 1

        if es_pendiente_whatsapp(p):
            whatsapp_pendiente += 1

        if es_retirable_whatsapp(p):
            whatsapp_quitar += 1

        if es_departamento_seguimiento(p["departamento"]) and es_persona_activa(p):
            seguimiento += 1

            if es_check(p.get("pda")):
                pda_entregadas += 1

            try:
                dias_val = int(p.get("dias") or 0)
            except (ValueError, TypeError):
                dias_val = 0
            if dias_val == 0 and p.get("fecha"):
                dias_val = (date.today() - p["fecha"]).days
                
            import os
            test_id = os.getenv("TEST_REVISION_WORKER_ID")
            if test_id and str(p.get("id")).strip() == test_id.strip():
                dias_val = 20
                
            if 18 <= dias_val <= 31 and str(p.get("revision_enviada") or "").strip().upper() not in ("SÍ", "SI", "S"):
                revision21 += 1

        if normalizar_texto(p["riesgo"]) == "ALTO" and es_persona_activa(p):
            riesgo += 1

        if p["tutor"]:
            formadores.add(p["tutor"])

    return {
        "enSeguimiento": seguimiento,
        "nuevas": nuevas,
        "mili": mili,
        "formadores": len(formadores),
        "riesgoAlto": riesgo,
        "pdaEntregadas": pda_entregadas,
        "revision21": revision21,
        "noAptos": no_aptos,
        "whatsappPendiente": whatsapp_pendiente,
        "whatsappQuitar": whatsapp_quitar,
        "contratoLimitado": contrato_limitado,
    }


def obtener_personas_revision_21(personas):
    resultado = []
    for p in personas:
        if es_persona_activa(p) and es_departamento_seguimiento(p["departamento"]):
            try:
                dias_val = int(p.get("dias") or 0)
            except (ValueError, TypeError):
                dias_val = 0
                
            if dias_val == 0 and p.get("fecha"):
                dias_val = (date.today() - p["fecha"]).days
                
            import os
            test_id = os.getenv("TEST_REVISION_WORKER_ID")
            if test_id and str(p.get("id")).strip() == test_id.strip():
                dias_val = 20
                
            if 18 <= dias_val <= 31 and str(p.get("revision_enviada") or "").strip().upper() not in ("SÍ", "SI", "S"):
                p_copy = dict(p)
                p_copy["dias"] = dias_val
                resultado.append(serializar_persona_dashboard(p_copy))
                
    resultado.sort(key=lambda x: x.get("dias") or 0, reverse=True)
    return resultado


def obtener_personas_whatsapp(personas):
    filtradas = [p for p in personas if es_pendiente_whatsapp(p)]
    # Ordenar por fecha (los más antiguos/hoy primero)
    filtradas.sort(key=lambda x: x.get("fecha") or date.max)
    return [serializar_persona_dashboard(p) for p in filtradas]


def obtener_personas_whatsapp_quitar(personas):
    filtradas = [p for p in personas if es_retirable_whatsapp(p)]
    # Ordenar por fecha (los más antiguos/hoy primero)
    filtradas.sort(key=lambda x: x.get("fecha") or date.max)
    return [serializar_persona_dashboard(p) for p in filtradas]


def contar_nuevas_incorporaciones(personas):
    return len([p for p in personas if es_nueva_incorporacion(p)])


def obtener_incorporaciones_por_rango(personas, rango, filtrar_departamento=True):
    hoy = date.today()

    if rango == "hoy":
        inicio = hoy
        fin = hoy
    elif rango == "manana":
        inicio = hoy + timedelta(days=1)
        fin = inicio
    elif rango == "semana":
        inicio = hoy
        fin = hoy + timedelta(days=6)
    elif rango == "quincena":
        inicio = hoy
        fin = hoy + timedelta(days=14)
    elif rango == "mes":
        inicio = hoy
        fin = hoy + timedelta(days=30)
    else:
        inicio = None
        fin = None

    resultado = []

    for p in personas:
        if not es_nueva_incorporacion(p):
            continue

        if filtrar_departamento and not es_departamento_seguimiento(p["departamento"]):
            continue

        if inicio and fin:
            if not p["fecha"] or not (inicio <= p["fecha"] <= fin):
                continue

        resultado.append(serializar_persona_dashboard(p))

    return ordenar_por_fecha(resultado)


def obtener_proximas_entradas(personas, filtrar_departamento=True):
    hoy = date.today()
    fin = hoy + timedelta(days=14)
    grupos = defaultdict(list)

    for p in personas:
        if filtrar_departamento and not es_departamento_seguimiento(p["departamento"]):
            continue

        if not p["fecha"]:
            continue

        if not (hoy <= p["fecha"] <= fin):
            continue

        grupos[p["fecha"].strftime("%d/%m/%Y")].append(serializar_persona_dashboard(p))

    resultado = []

    for fecha_txt, items in grupos.items():
        resultado.append({
            "fecha": fecha_txt,
            "personas": ordenar_por_hora(items),
            "total": len(items),
        })

    return sorted(resultado, key=lambda x: convertir_fecha(x["fecha"]) or date.max)


def obtener_personas_seguimiento(personas):
    return [
        serializar_persona_dashboard(p)
        for p in personas
        if es_departamento_seguimiento(p["departamento"]) and es_persona_activa(p)
    ]


def obtener_estado_programa(personas):
    estados = {
        "Onboarding": {"total": 0, "personas": []},
        "Shadow": {"total": 0, "personas": []},
        "Libre": {"total": 0, "personas": []},
        "Equipo": {"total": 0, "personas": []},
    }

    mapa = {
        "ONBOARDING": "Onboarding",
        "ACOMPAÑAMIENTO": "Onboarding",
        "RONDA EQUIPOS": "Onboarding",
        
        "SHADOW": "Shadow",
        "SACADO H": "Shadow",
        
        "LIBRE": "Libre",
        "LIBRE FASE 1": "Libre",
        "LIBRE FASE 2": "Libre",
        
        "EQUIPO": "Equipo",
        "MENTOR": "Equipo",
    }

    for p in personas:
        if not es_departamento_seguimiento(p["departamento"]) or not es_persona_activa(p):
            continue

        clave = mapa.get(normalizar_texto(p["estado"]))

        if clave:
            estados[clave]["total"] += 1
            estados[clave]["personas"].append(serializar_persona_dashboard(p))

    return estados


def obtener_departamentos(personas):
    departamentos = {}

    for p in personas:
        if not es_departamento_seguimiento(p["departamento"]) or not es_persona_activa(p):
            continue

        dep = p["departamento"] or "Sin departamento"

        if dep not in departamentos:
            departamentos[dep] = {"total": 0, "personas": []}

        departamentos[dep]["total"] += 1
        departamentos[dep]["personas"].append(serializar_persona_dashboard(p))

    return departamentos


def obtener_personas_pendientes_formacion(personas, simpl_rows):
    personas_by_id = {str(p.get("id")).strip(): p for p in personas}
    pendientes = []
    
    for s in simpl_rows:
        w_id = str(s.get("ID", "")).strip()
        if not w_id or not w_id.isdigit():
            continue
            
        total_form_raw = str(s.get("Total form.", "")).strip()
        # Considerar pendiente si el total de formación es 0, 0.0, vacío o nulo
        if total_form_raw in ("0", "0.0", "", "None"):
            p = personas_by_id.get(w_id)
            nombre = s.get("Nombre y Apellido", "") or (p.get("nombre", "") if p else "")
            fecha_alta = s.get("Fecha de alta", "") or (p.get("fecha_texto", "") if p else "")
            depto = s.get("Dept. y grupo", "") or (p.get("departamento", "") if p else "")
            
            pendientes.append({
                "id": w_id,
                "nombre": nombre,
                "fecha": fecha_alta,
                "departamento": depto
            })
            
    # Ordenar alfabéticamente por nombre
    pendientes.sort(key=lambda x: x.get("nombre", "").lower())
    return pendientes


def calcular_checklist(persona):
    total = len(CHECKLIST_INICIAL)
    completado = 0
    pendientes = []

    for nombre, campo in CHECKLIST_INICIAL:
        if es_check(persona.get(campo)):
            completado += 1
        else:
            pendientes.append(nombre)

    porcentaje = round((completado / total) * 100) if total else 0

    return {
        "total": total,
        "completado": completado,
        "pendientes": pendientes,
        "porcentaje": porcentaje,
    }


def obtener_checklist_pendiente(personas):
    resumen = {
        "RRHH": 0,
        "Almuerzo": 0,
        "Ropa": 0,
        "Su puesto": 0,
    }

    personas_pendientes = []

    for p in personas:
        if not es_departamento_seguimiento(p["departamento"]) or not es_persona_activa(p):
            continue

        pendientes = p.get("checklist_pendientes", [])

        if pendientes:
            personas_pendientes.append(serializar_persona_dashboard(p))

            for item in pendientes:
                if item in resumen:
                    resumen[item] += 1

    return {
        "resumen": resumen,
        "personas": personas_pendientes,
    }


def obtener_personas_riesgo(personas):
    return [
        serializar_persona_dashboard(p)
        for p in personas
        if es_departamento_seguimiento(p["departamento"])
        and es_persona_activa(p)
        and normalizar_texto(p["riesgo"]) == "ALTO"
    ]


def obtener_alertas(personas):
    alertas = []

    for p in personas:
        if not es_departamento_seguimiento(p["departamento"]) or not es_persona_activa(p):
            continue

        if not p["tutor"]:
            alertas.append({
                "tipo": "Sin tutor",
                "mensaje": f"{p['nombre']} no tiene tutor asignado.",
                "persona": serializar_persona_dashboard(p),
            })

        if p["checklist_porcentaje"] < 100 and p["fecha"] == date.today():
            alertas.append({
                "tipo": "Checklist incompleto",
                "mensaje": f"{p['nombre']} entra hoy y tiene checklist incompleto.",
                "persona": serializar_persona_dashboard(p),
            })

    return alertas


def obtener_productividad_resumen(personas):
    productividades = []
    errores = []

    # Intentar obtener el rendimiento en tiempo real por lotes desde Grafana para los KPIs
    try:
        from app.services.persona_service import obtener_rendimiento_grafana_batch
        active_workers = [p for p in personas if es_departamento_seguimiento(p["departamento"]) and es_persona_activa(p)]
        active_ids = [str(p["id"]).strip() for p in active_workers if str(p.get("id", "")).isdigit()]
        grafana_perf = obtener_rendimiento_grafana_batch(active_ids) if active_ids else {}
    except Exception:
        active_workers = personas
        grafana_perf = {}

    for p in active_workers:
        if not es_departamento_seguimiento(p["departamento"]) or not es_persona_activa(p):
            continue

        # Usar lineas_hora de Grafana en tiempo real como prioridad
        g_p = grafana_perf.get(str(p["id"]).strip(), {})
        prod_val = g_p.get("lineas_hora") if g_p else None
        
        # Fallback al valor guardado en Sheets si Grafana no tiene datos
        if prod_val is None or prod_val == "":
            prod_val = p.get("productividad_media")

        prod = convertir_numero(prod_val)
        err = convertir_numero(p.get("error_medio"))

        if prod is not None and prod > 0:
            productividades.append(prod)

        if err is not None:
            errores.append(err)

    return {
        "media": round(sum(productividades) / len(productividades), 2) if productividades else 0,
        "personas": len(productividades),
        "errorMedio": round(sum(errores) / len(errores), 2) if errores else 0,
    }


def obtener_formadores(personas):
    formadores = {}

    for p in personas:
        tutor = p.get("tutor", "").strip()

        if not tutor:
            continue

        if tutor not in formadores:
            formadores[tutor] = {"nombre": tutor, "total": 0, "personas": []}

        formadores[tutor]["total"] += 1
        formadores[tutor]["personas"].append(serializar_persona_dashboard(p))

    return list(formadores.values())


def serializar_persona_dashboard(p):
    return {
        "id": p.get("id"),
        "nombre": p.get("nombre"),
        "programa": p.get("programa"),
        "departamento": p.get("departamento"),
        "hora": p.get("hora"),
        "fecha": p["fecha"].strftime("%d/%m/%Y") if p.get("fecha") else "",
        "estado": p.get("estado"),
        "dias": p.get("dias"),
        "diasRestantes": p.get("dias_restantes"),
        "riesgo": p.get("riesgo"),
        "tutor": p.get("tutor"),
        "rrhh": p.get("rrhh"),
        "uniforme": p.get("uniforme"),
        "almuerzo": p.get("almuerzo"),
        "tour": p.get("tour"),
        "checklist": {
            "total": p.get("checklist_total"),
            "completado": p.get("checklist_completado"),
            "porcentaje": p.get("checklist_porcentaje"),
            "pendientes": p.get("checklist_pendientes"),
        },
        "url": f"/expediente/{p.get('id')}",
    }


def ordenar_por_fecha(items):
    return sorted(items, key=lambda x: convertir_fecha(x.get("fecha")) or date.max)


def ordenar_por_hora(items):
    return sorted(items, key=lambda x: str(x.get("hora") or ""))


import threading
import time as time_module

_retrasos_cache = None
_retrasos_timestamp = 0.0
_retrasos_lock = threading.Lock()

def obtener_retrasos_trabajadores(personas):
    global _retrasos_cache, _retrasos_timestamp
    ahora = time_module.time()
    if _retrasos_cache is not None and (ahora - _retrasos_timestamp) < 300:
        return _retrasos_cache
        
    try:
        from app.services.grafana.client import GrafanaClient
        from app.services.grafana.dashboard import DashboardService
        from app.services.grafana.config import GRAFANA_URL
        import os
        from datetime import time, datetime
        
        # 1. Inicializar cliente
        client = GrafanaClient(base_url=GRAFANA_URL)
        service = DashboardService(client)
        
        # 2. Consultar Fichajes diarios / Teléfonos (98ef54c2-0ab6-473e-bff7-8d3682eab132), Panel ID 1
        dashboard_uid = "98ef54c2-0ab6-473e-bff7-8d3682eab132"
        panel_id = 1
        
        queries = service.get_panel_queries(dashboard_uid, panel_id)
        result = client.query_datasource(queries, from_time="now-14d", to_time="now")
        
        rows = []
        if "results" in result:
            for ref_id, res in result["results"].items():
                for frame in res.get("frames", []):
                    schema = frame.get("schema", {})
                    fields = schema.get("fields", [])
                    names = [f.get("name") for f in fields]
                    data = frame.get("data", {})
                    values = data.get("values", [])
                    if values:
                        rows = [dict(zip(names, row)) for row in zip(*values)]
                        
        # 3. Obtener mapeo de Grafana para evitar colisiones e impuntualidades erróneas
        from app.services.grafana.repository import GrafanaRepository
        from app.services.grafana.worker import WorkerService
        from app.services.grafana.auth import GrafanaAuth
        
        repo = GrafanaRepository()
        worker_service = WorkerService(repository=repo)
        
        auth = GrafanaAuth(base_url=GRAFANA_URL)
        sess = auth.get_session()
        g_cookies = sess.cookies.get_dict() if sess else {}
        
        # Crear un mapa: resolved_grafana_id -> persona
        persona_by_grafana_id = {}
        for p in personas:
            p_id = str(p.get("id")).strip()
            if p_id:
                resolved_g_id = str(worker_service._resolve_worker_fk(p_id, p.get("nombre"), g_cookies)).strip()
                persona_by_grafana_id[resolved_g_id] = p

        # 4. Procesar fichajes (Entrada)
        persona_by_name = {}
        for p in personas:
            name_norm = " ".join(str(p.get("nombre") or "").upper().split())
            if name_norm:
                persona_by_name[name_norm] = p

        clockins_by_worker_id = {}
        for r in rows:
            if r.get("Fichaje") != "Entrada":
                continue
            
            # Buscar persona por ID de Grafana (userfk) o por nombre en fallback
            row_userfk = str(r.get("userfk") or "").strip()
            matched_person = None
            if row_userfk and row_userfk in persona_by_grafana_id:
                matched_person = persona_by_grafana_id[row_userfk]
            else:
                w_name = str(r.get("trabajador") or "").upper().strip()
                w_name = " ".join(w_name.split())
                matched_person = persona_by_name.get(w_name)
                
            if not matched_person:
                continue
                
            p_id = str(matched_person.get("id")).strip()
            fecha = r.get("fecha")
            hora = r.get("hora")
            if not p_id or not fecha or not hora:
                continue
                
            if p_id not in clockins_by_worker_id:
                clockins_by_worker_id[p_id] = {}
            # Mantener el primer fichaje de entrada del día
            if fecha not in clockins_by_worker_id[p_id]:
                clockins_by_worker_id[p_id][fecha] = hora
            elif hora < clockins_by_worker_id[p_id][fecha]:
                clockins_by_worker_id[p_id][fecha] = hora
                
        # 5. Mapear y calcular impuntualidad
        def parse_time(t_str):
            try:
                parts = list(map(int, t_str.split(":")))
                if len(parts) >= 2:
                    return time(parts[0], parts[1])
            except Exception:
                pass
            return None
            
        retrasos_report = []
        persona_by_id = {str(p.get("id")).strip(): p for p in personas if p.get("id")}
        
        for p_id, dates in clockins_by_worker_id.items():
            p = persona_by_id.get(p_id)
            if not p:
                continue
                
            expected_str = p.get("hora") or "08:00"
            expected_t = parse_time(expected_str)
            if not expected_t:
                expected_t = time(8, 0)
                
            late_days = []
            for fecha, hora in dates.items():
                actual_t = parse_time(hora)
                if not actual_t:
                    continue
                min_diff = (actual_t.hour * 60 + actual_t.minute) - (expected_t.hour * 60 + expected_t.minute)
                if 1 <= min_diff <= 120:
                    late_days.append({
                        "fecha": fecha,
                        "hora_fichaje": hora,
                        "hora_esperada": expected_str,
                        "minutos_retraso": min_diff
                    })
            
            # Ordenar días de retraso cronológicamente (más recientes primero)
            def parse_date_sort(d_str):
                try:
                    return datetime.strptime(d_str, "%d/%m/%Y")
                except Exception:
                    return datetime.min
            late_days.sort(key=lambda x: parse_date_sort(x["fecha"]), reverse=True)
            
            if len(late_days) >= 3:
                retrasos_report.append({
                    "id": p["id"],
                    "nombre": p["nombre"],
                    "departamento": p.get("departamento", ""),
                    "retrasos_count": len(late_days),
                    "dias": late_days
                })
                
        retrasos_report.sort(key=lambda x: x["retrasos_count"], reverse=True)
        
        with _retrasos_lock:
            _retrasos_cache = retrasos_report
            _retrasos_timestamp = ahora
            
        return retrasos_report
        
    except Exception as e:
        print(f"Error en obtener_retrasos_trabajadores: {e}")
        return []


def obtener_fichajes_individuales(id_trabajador, cookies=None):
    from app.services.persona_service import obtener_persona
    from app.services.grafana.client import GrafanaClient
    from app.services.grafana.dashboard import DashboardService
    from app.services.grafana.config import GRAFANA_URL
    from datetime import datetime, time
    
    try:
        persona = obtener_persona(id_trabajador)
        if not persona or "error" in persona:
            return {"ok": False, "error": "Trabajador no encontrado"}
            
        nombre_norm = " ".join(str(persona.get("nombre") or "").upper().split())
        if not nombre_norm:
            return {"ok": True, "fichajes": []}
            
        expected_str = persona.get("hora_entrada") or persona.get("hora") or "08:00"
        try:
            parts = list(map(int, expected_str.split(":")))
            expected_t = time(parts[0], parts[1])
        except Exception:
            expected_t = time(8, 0)
            
        client = GrafanaClient(base_url=GRAFANA_URL, cookies=cookies)
        service = DashboardService(client)
        
        dashboard_uid = "98ef54c2-0ab6-473e-bff7-8d3682eab132"
        panel_id = 1
        
        queries = service.get_panel_queries(dashboard_uid, panel_id)
        result = client.query_datasource(queries, from_time="now-30d", to_time="now")
        
        rows = []
        if "results" in result:
            for ref_id, res in result["results"].items():
                for frame in res.get("frames", []):
                    schema = frame.get("schema", {})
                    fields = schema.get("fields", [])
                    names = [f.get("name") for f in fields]
                    data = frame.get("data", {})
                    values = data.get("values", [])
                    if values:
                        rows = [dict(zip(names, row)) for row in zip(*values)]
                        
        # Resolve the worker's Grafana ID for robust comparison
        from app.services.grafana.repository import GrafanaRepository
        from app.services.grafana.worker import WorkerService
        
        repo = GrafanaRepository()
        worker_service = WorkerService(repository=repo)
        resolved_grafana_id = str(worker_service._resolve_worker_fk(id_trabajador, persona.get("nombre"), cookies)).strip()

        # Procesar los fichajes para este trabajador
        fichajes_por_dia = {}
        for r in rows:
            # 1. Emparejamiento por ID (userfk)
            row_userfk = str(r.get("userfk") or "").strip()
            if row_userfk:
                if row_userfk != resolved_grafana_id:
                    continue
            else:
                # Fallback por nombre
                w_name = str(r.get("trabajador") or "").upper().strip()
                w_name = " ".join(w_name.split())
                if w_name != nombre_norm:
                    continue
                
            fecha = r.get("fecha")
            hora = r.get("hora")
            tipo = r.get("Fichaje") # "Entrada" o "Salida"
            
            if not fecha or not hora or not tipo:
                continue
                
            if fecha not in fichajes_por_dia:
                fichajes_por_dia[fecha] = {"entrada": None, "salida": None}
                
            if tipo == "Entrada":
                if not fichajes_por_dia[fecha]["entrada"] or hora < fichajes_por_dia[fecha]["entrada"]:
                    fichajes_por_dia[fecha]["entrada"] = hora
            elif tipo == "Salida":
                if not fichajes_por_dia[fecha]["salida"] or hora > fichajes_por_dia[fecha]["salida"]:
                    fichajes_por_dia[fecha]["salida"] = hora
                    
        # Formatear el listado
        listado = []
        for fecha, datos in fichajes_por_dia.items():
            entrada = datos["entrada"]
            salida = datos["salida"]
            
            desviacion_str = "-"
            es_retraso = False
            minutos = 0
            
            if entrada:
                try:
                    parts = list(map(int, entrada.split(":")))
                    actual_t = time(parts[0], parts[1])
                    diff_mins = (actual_t.hour * 60 + actual_t.minute) - (expected_t.hour * 60 + expected_t.minute)
                    if diff_mins >= 1:
                        desviacion_str = f"+{diff_mins} min"
                        minutos = diff_mins
                        es_retraso = True
                    else:
                        desviacion_str = "0 min"
                        minutos = 0
                except Exception:
                    pass
                    
            listado.append({
                "fecha": fecha,
                "entrada": entrada or "-",
                "salida": salida or "-",
                "esperada": expected_str,
                "desviacion": desviacion_str,
                "minutos": minutos,
                "es_retraso": es_retraso
            })
            
        # Ordenar por fecha cronológicamente descendente
        def parse_date_sort(d_str):
            try:
                return datetime.strptime(d_str, "%d/%m/%Y")
            except Exception:
                return datetime.min
        listado.sort(key=lambda x: parse_date_sort(x["fecha"]), reverse=True)
        
        return {"ok": True, "fichajes": listado}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def obtener_errores_consecutivos(personas):
    try:
        from app.services.grafana.client import GrafanaClient
        from app.services.grafana.config import GRAFANA_URL
        from datetime import datetime
        from collections import defaultdict
        import logging
        
        logger = logging.getLogger("services.dashboard.errores_consecutivos")
        
        # 1. Obtener IDs de trabajadores activos
        worker_ids = [str(p["id"]) for p in personas if str(p.get("id", "")).isdigit()]
        if not worker_ids:
            return []
            
        sql = f"""
        SELECT 
            w.id AS worker_id,
            CONCAT_WS(' ', w.firstName, w.lastName) AS worker_name,
            DATE(st.created) AS fecha,
            IFNULL(errores_data.cantidad_errores, 0) AS total_errores_dia
        FROM saleTracking st
        JOIN sale s ON s.id = st.saleFk
        JOIN state sta ON sta.id = st.stateFk
        JOIN worker w ON w.id = st.workerFk
        LEFT JOIN (
            SELECT 
                DATE(sm.created) AS fecha_err,
                COUNT(*) AS cantidad_errores,
                st_inner.workerFk
            FROM saleMistake sm
            JOIN mistakeType mt ON mt.id = sm.typeFk
            JOIN sale s_inner ON s_inner.id = sm.saleFk
            JOIN saleTracking st_inner ON s_inner.id = st_inner.saleFk
            JOIN state sta_inner ON sta_inner.id = st_inner.stateFk
            WHERE sta_inner.code IN ('PREPARED', 'PREVIOUS_PREPARATION', 'OK PREVIOUS')
              AND mt.description NOT IN ('Presentación Excelente')
            GROUP BY fecha_err, st_inner.workerFk
        ) errores_data ON errores_data.fecha_err = DATE(st.created) AND errores_data.workerFk = w.id
        WHERE sta.code = 'PREPARED'
          AND st.created >= DATE_SUB(NOW(), INTERVAL 14 DAY)
          AND s.quantity > 0
          AND w.id IN ({','.join(worker_ids)})
        GROUP BY w.id, DATE(st.created)
        ORDER BY w.id, fecha ASC
        """
        
        client = GrafanaClient(base_url=GRAFANA_URL)
        payload = [
            {
                "refId": "A",
                "datasource": {"uid": "000000003"},
                "rawSql": sql,
                "format": "table"
            }
        ]
        result = client.query_datasource(payload)
        
        rows = []
        if "results" in result:
            for ref_id, res in result["results"].items():
                for frame in res.get("frames", []):
                    schema = frame.get("schema", {})
                    fields = schema.get("fields", [])
                    names = [f.get("name") for f in fields]
                    data = frame.get("data", {})
                    values = data.get("values", [])
                    if values:
                        rows = [dict(zip(names, row)) for row in zip(*values)]
                        
        worker_history = defaultdict(list)
        for r in rows:
            worker_history[str(r["worker_id"])].append(r)
            
        detected = []
        for w_id, history in worker_history.items():
            consec_days = []
            has_alert = False
            max_consec = []
            
            for h in history:
                err = int(h["total_errores_dia"])
                if err > 5:
                    consec_days.append(h)
                    if len(consec_days) >= 3:
                        has_alert = True
                        max_consec = list(consec_days)
                else:
                    consec_days = []
            
            if has_alert:
                p_sheet = next((p for p in personas if str(p["id"]) == w_id), {})
                days_formatted = []
                for d in max_consec[-3:]:
                    try:
                        if isinstance(d["fecha"], (int, float)):
                            dt_str = datetime.fromtimestamp(d["fecha"]/1000).strftime("%d/%m")
                        else:
                            dt_str = str(d["fecha"])
                    except Exception:
                        dt_str = str(d["fecha"])
                    days_formatted.append(f"{dt_str} ({int(d['total_errores_dia'])} err)")
                
                detected.append({
                    "id": w_id,
                    "nombre": p_sheet.get("nombre") or max_consec[0]["worker_name"],
                    "departamento": p_sheet.get("departamento") or "Varios",
                    "tutor": p_sheet.get("tutor") or "Sin tutor",
                    "dias_detalles": ", ".join(days_formatted),
                    "url": f"/expediente/{w_id}"
                })
        return detected
    except Exception as e:
        logger.error(f"Error en obtener_errores_consecutivos: {e}")
        return []


def obtener_alertas_exceso_horas(cookies=None) -> list:
    """
    Analiza los fichajes de los últimos 7 días para todos los trabajadores activos
    y genera alertas de exceso de horas (diarias > 9h o semanales > 40h).
    """
    from app.services.persona_service import obtener_personas
    from app.services.grafana.client import GrafanaClient
    from app.services.grafana.dashboard import DashboardService
    from app.services.grafana.config import GRAFANA_URL
    from datetime import datetime, timedelta
    
    try:
        # 1. Obtener operarios activos
        personas = obtener_personas()
        activos = [p for p in personas if p.get("estado") == "Activo" and int(p.get("dias") or 0) <= 31]
        if not activos:
            return []
            
        activos_dict = {str(p["id"]): p for p in activos}
        
        # 2. Consultar todos los fichajes de los últimos 7 días
        client = GrafanaClient(base_url=GRAFANA_URL, cookies=cookies)
        service = DashboardService(client)
        
        dashboard_uid = "98ef54c2-0ab6-473e-bff7-8d3682eab132"
        panel_id = 1
        
        queries = service.get_panel_queries(dashboard_uid, panel_id)
        result = client.query_datasource(queries, from_time="now-7d", to_time="now")
        
        rows = []
        if "results" in result:
            for ref_id, res in result["results"].items():
                for frame in res.get("frames", []):
                    schema = frame.get("schema", {})
                    fields = schema.get("fields", [])
                    names = [f.get("name") for f in fields]
                    data = frame.get("data", {})
                    values = data.get("values", [])
                    if values:
                        rows = [dict(zip(names, row)) for row in zip(*values)]
                        
        # 3. Mapear trabajadores de Grafana a Sheets
        from app.services.grafana.repository import GrafanaRepository
        from app.services.grafana.worker import WorkerService
        
        repo = GrafanaRepository()
        worker_service = WorkerService(repository=repo)
        
        # Obtener mapeo de Grafana
        cache_key = "worker_mapping_dict"
        mapping = repo.cache.get(cache_key) or {}
        
        # Invertir el mapeo para ir de ID de Grafana (userfk) a Nombre normalizado
        # y asociarlo al ID del Sheets
        grafana_to_sheets_id = {}
        for p in activos:
            p_id = str(p["id"])
            resolved_fk = str(worker_service._resolve_worker_fk(p_id, p.get("nombre"), cookies)).strip()
            if resolved_fk:
                grafana_to_sheets_id[resolved_fk] = p_id
                
        # 4. Agrupar fichajes por trabajador e ID
        fichajes_por_trabajador = {} # sheets_id -> fecha -> {"entrada": None, "salida": None}
        
        from datetime import time
        for r in rows:
            userfk = str(r.get("userfk") or "").strip()
            sheets_id = None
            if userfk in grafana_to_sheets_id:
                sheets_id = grafana_to_sheets_id[userfk]
            else:
                # Fallback por nombre
                w_name = " ".join(str(r.get("trabajador") or "").upper().split())
                for p in activos:
                    p_name_norm = " ".join(str(p.get("nombre") or "").upper().split())
                    if w_name == p_name_norm:
                        sheets_id = str(p["id"])
                        break
            
            if not sheets_id:
                continue
                
            fecha = r.get("fecha")
            hora = r.get("hora")
            tipo = r.get("Fichaje") # "Entrada" o "Salida"
            
            if not fecha or not hora or not tipo:
                continue
                
            if sheets_id not in fichajes_por_trabajador:
                fichajes_por_trabajador[sheets_id] = {}
                
            if fecha not in fichajes_por_trabajador[sheets_id]:
                fichajes_por_trabajador[sheets_id][fecha] = {"entrada": None, "salida": None}
                
            if tipo == "Entrada":
                if not fichajes_por_trabajador[sheets_id][fecha]["entrada"] or hora < fichajes_por_trabajador[sheets_id][fecha]["entrada"]:
                    fichajes_por_trabajador[sheets_id][fecha]["entrada"] = hora
            elif tipo == "Salida":
                if not fichajes_por_trabajador[sheets_id][fecha]["salida"] or hora > fichajes_por_trabajador[sheets_id][fecha]["salida"]:
                    fichajes_por_trabajador[sheets_id][fecha]["salida"] = hora
                    
        # 5. Calcular excesos de horas
        alertas = []
        
        for sheets_id, fechas in fichajes_por_trabajador.items():
            worker_data = activos_dict.get(sheets_id)
            if not worker_data:
                continue
                
            worker_name = worker_data.get("nombre")
            weekly_minutos = 0.0
            
            for fecha, datos in fechas.items():
                entrada = datos["entrada"]
                salida = datos["salida"]
                
                if entrada and salida:
                    try:
                        e_parts = list(map(int, entrada.split(":")))
                        s_parts = list(map(int, salida.split(":")))
                        duracion_mins = (s_parts[0]*60 + s_parts[1]) - (e_parts[0]*60 + e_parts[1])
                        
                        if duracion_mins > 0:
                            weekly_minutos += duracion_mins
                            
                        # Alerta diaria si supera 9.0 horas (540 minutos)
                        if duracion_mins > 540:
                            horas_dec = round(duracion_mins / 60.0, 1)
                            exceso_mins = duracion_mins - 480 # Exceso sobre 8h estándar
                            exceso_horas_str = f"{exceso_mins // 60}h {exceso_mins % 60}m" if exceso_mins >= 60 else f"{exceso_mins} min"
                            
                            alertas.append({
                                "workerId": sheets_id,
                                "workerName": worker_name,
                                "type": "arrival",
                                "badgeText": "Jornada",
                                "text": f"Exceso de jornada diaria el {fecha}: trabajó {horas_dec}h (exceso de {exceso_horas_str} sobre 8h)."
                            })
                    except Exception:
                        pass
                        
            # Alerta semanal si supera 40 horas (2400 minutos)
            if weekly_minutos > 2400:
                horas_semanales = round(weekly_minutos / 60.0, 1)
                exceso_semanal = round((weekly_minutos - 2400) / 60.0, 1)
                alertas.append({
                    "workerId": sheets_id,
                    "workerName": worker_name,
                    "type": "arrival",
                    "badgeText": "Horas Sem.",
                    "text": f"Exceso acumulado semanal: {horas_semanales}h trabajadas en los últimos 7 días (exceso de {exceso_semanal}h)."
                })
                
        return alertas
    except Exception as e:
        logger.error(f"Error calculando alertas de exceso de horas: {e}")
        return []
