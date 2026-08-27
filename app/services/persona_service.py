from app.services.google_service import abrir_documento, abrir_documento_por_key
from gspread.utils import rowcol_to_a1

import threading
import time

DOCUMENTO = "DB_FORMACION_VERDNATURA"
HOJA = "MAESTRO_PERSONAS"

_grafana_perf_cache = None
_grafana_perf_timestamp = 0.0
_grafana_perf_lock = threading.Lock()

# Caché global en memoria para los datos de Google Sheets de personas
_personas_cache = None
_personas_cache_timestamp = 0.0
_personas_cache_lock = threading.Lock()
PERSONAS_CACHE_TTL = 300  # 5 minutos de tiempo de vida (TTL)

_mapped_personas_cache = {}
_mapped_personas_timestamp = 0.0
_mapped_personas_lock = threading.Lock()
MAPPED_PERSONAS_CACHE_TTL = 120  # 2 minutos

_simpl_cache = None
_simpl_cache_timestamp = 0.0
_simpl_cache_lock = threading.Lock()
SIMPL_CACHE_TTL = 300  # 5 minutos

_formadores_perf_cache = None
_formadores_perf_timestamp = 0.0
_formadores_perf_lock = threading.Lock()
FORMADORES_PERF_CACHE_TTL = 300  # 5 minutos

_errores_grafana_cache = None
_errores_grafana_timestamp = 0.0
_errores_grafana_lock = threading.Lock()
ERRORES_GRAFANA_CACHE_TTL = 300  # 5 minutos

def obtener_filas_maestro_personas(forzar_refresco=False):
    global _personas_cache, _personas_cache_timestamp
    ahora = time.time()
    if not forzar_refresco:
        with _personas_cache_lock:
            if _personas_cache is not None and (ahora - _personas_cache_timestamp) < PERSONAS_CACHE_TTL:
                return _personas_cache

    try:
        documento = abrir_documento(DOCUMENTO)
        hoja = documento.worksheet(HOJA)
        filas = hoja.get_all_records()
        
        with _personas_cache_lock:
            _personas_cache = filas
            _personas_cache_timestamp = ahora
        return filas
    except Exception as e:
        print(f"Error obteniendo filas de maestro personas: {e}")
        with _personas_cache_lock:
            if _personas_cache is not None:
                return _personas_cache
        raise e

def invalidar_cache_maestro_personas():
    global _personas_cache, _personas_cache_timestamp
    with _personas_cache_lock:
        _personas_cache = None
        _personas_cache_timestamp = 0.0

def invalidar_todas_las_caches():
    invalidar_cache_maestro_personas()
    
    global _simpl_cache, _simpl_cache_timestamp
    with _simpl_cache_lock:
        _simpl_cache = None
        _simpl_cache_timestamp = 0.0

    global _formadores_perf_cache, _formadores_perf_timestamp
    with _formadores_perf_lock:
        _formadores_perf_cache = None
        _formadores_perf_timestamp = 0.0

    global _errores_grafana_cache, _errores_grafana_timestamp
    with _errores_grafana_lock:
        _errores_grafana_cache = None
        _errores_grafana_timestamp = 0.0

    global _mapped_personas_cache, _mapped_personas_timestamp
    with _mapped_personas_lock:
        _mapped_personas_cache.clear()
        _mapped_personas_timestamp = 0.0
        
    try:
        from app.services import dashboard_service
        with dashboard_service._retrasos_lock:
            dashboard_service._retrasos_cache = None
            dashboard_service._retrasos_timestamp = 0.0
    except Exception:
        pass
        
    try:
        from app.services import dashboard_service
        with dashboard_service._cache_lock:
            dashboard_service._cache_datos = None
    except Exception:
        pass

def actualizar_overrides_en_cache(id_trabajador, campo, valor):
    global _overrides_cache
    with _overrides_lock:
        if _overrides_cache is not None:
            w_id = str(id_trabajador).strip()
            if w_id not in _overrides_cache:
                _overrides_cache[w_id] = {}
            _overrides_cache[w_id][campo] = valor

def actualizar_campo_en_cache_maestro_con_override(id_trabajador, campo, valor):
    global _personas_cache
    with _personas_cache_lock:
        if _personas_cache is not None:
            w_id = str(id_trabajador).strip()
            for r in _personas_cache:
                if str(r.get("ID_Trabajador", "")).strip() == w_id:
                    if campo == "departamento":
                        r["DEPARTAMENTO_ORIGEN"] = valor
                    elif campo == "observaciones":
                        r["Observaciones"] = valor
                    elif campo == "tutor":
                        r["TUTOR_ASIGNADO"] = valor
                    break

def actualizar_campo_en_cache_maestro(id_trabajador, columna, valor):
    global _personas_cache
    with _personas_cache_lock:
        if _personas_cache is not None:
            w_id = str(id_trabajador).strip()
            for r in _personas_cache:
                if str(r.get("ID_Trabajador", "")).strip() == w_id:
                    r[columna] = valor
                    if columna in ["RRHH", "ALMUERZO", "UNIFORME", "TOUR_EMPRESA"]:
                        completado = 0
                        for col in ["RRHH", "ALMUERZO", "UNIFORME", "TOUR_EMPRESA"]:
                            val_check = str(r.get(col, ""))
                            # En el caso de booleanos de Python
                            if val_check is True or str(val_check).upper().strip() in ("SÍ", "SI", "X", "TRUE", "OK", "VERDADERO", "1"):
                                completado += 1
                        r["CHECKLIST_COMPLETADO"] = completado
                        r["PORCENTAJE_PREPARACION"] = round((completado / 4) * 100)
                    break

def guardar_override_async(id_trabajador, campo, valor):
    actualizar_overrides_en_cache(id_trabajador, campo, valor)
    actualizar_campo_en_cache_maestro_con_override(id_trabajador, campo, valor)
    
    # Invalidar la caché de personas mapeadas para que los cambios se reflejen de inmediato
    global _mapped_personas_cache, _mapped_personas_timestamp
    with _mapped_personas_lock:
        _mapped_personas_cache.clear()
        _mapped_personas_timestamp = 0.0
        
    try:
        from app.services import dashboard_service
        with dashboard_service._cache_lock:
            dashboard_service._cache_datos = None
    except Exception:
        pass
    def task():
        try:
            guardar_override(id_trabajador, campo, valor)
        except Exception as e:
            print(f"Background override write failed: {e}")
    import threading
    threading.Thread(target=task, daemon=True).start()
    return True

def obtener_rendimiento_grafana_batch(active_ids, forzar_refresco=False):
    global _grafana_perf_cache, _grafana_perf_timestamp
    
    ahora = time.time()
    if not forzar_refresco:
        with _grafana_perf_lock:
            if _grafana_perf_cache is not None and (ahora - _grafana_perf_timestamp) < 300: # 5 minutos
                return _grafana_perf_cache

    resultado = {}
    if not active_ids:
        return resultado

    try:
        from app.services.grafana.client import GrafanaClient
        from app.services.grafana.config import GRAFANA_URL
        
        client = GrafanaClient(base_url=GRAFANA_URL)
        sql = f"""
        WITH timePrep AS (
            WITH collectionTimes AS (
                SELECT 
                    DATE(st.created) as dated,
                    tc.collectionFk,
                    st.workerFk,
                    MIN(CASE WHEN s.code IN ('PREPARED', 'PREVIOUS_PREPARATION') THEN st.created END) timeFrom,
                    IFNULL(MAX(CASE WHEN s.code IN ('PREPARED', 'OK PREVIOUS') THEN st.created END),
                      MIN(CASE WHEN s.code = 'ON_CHECKING' THEN st.created END)
                    ) timeTo,
                    SUM(NOT st.isScanned) manualScanLines
                  FROM saleTracking st FORCE INDEX (saleTracking_idx5)
                    JOIN state s ON s.id = st.stateFk
                    JOIN sale sa ON sa.id = st.saleFk
                    JOIN ticketCollection tc ON tc.ticketFk = sa.ticketFk
                  WHERE s.code IN ('PREPARED', 'ON_CHECKING')
                    AND st.created >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                    AND st.workerFk IN ({','.join(active_ids)})
                  GROUP BY DATE(st.created), tc.collectionFk, st.workerFk
                  HAVING timeTo
              ),
              collectionLines AS (
                WITH ticketLines AS (
                  SELECT s.ticketFk,
                      SUM(IF(sgd.saleFk IS NULL, 1, 0)) + COUNT(DISTINCT sgd.saleGroupFk) totalLines,
                      SUM(s.volume) volume
                    FROM ticket t FORCE INDEX (Fecha)
                      JOIN sale s ON s.ticketFk = t.id
                      JOIN saleTracking st ON st.saleFk = s.id
                        AND st.stateFk = (SELECT id FROM state WHERE code = 'PREPARED')
                      LEFT JOIN saleGroupDetail sgd ON sgd.saleFk = s.id
                    WHERE t.shipped >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                      AND s.quantity > 0
                    GROUP BY s.ticketFk
                )
                SELECT tc.collectionFk,
                    SUM(tl.totalLines) totalLines,
                    SUM(tl.volume) totalVolume
                  FROM ticketLines tl
                    JOIN ticketCollection tc ON tc.ticketFk = tl.ticketFk
                  GROUP BY tc.collectionFk
              ),
              restTimeInterval AS (
                WITH rankedTimes AS (
                  SELECT userFk,
                      timed,
                      ROW_NUMBER() OVER (PARTITION BY userFk ORDER BY timed) rn
                    FROM workerTimeControl
                    WHERE timed >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                      AND direction = 'middle'
                      AND userFk IN ({','.join(active_ids)})
                ),
                pairedTimes AS (
                  SELECT t1.userFk,
                      DATE(t1.timed) dated,
                      t1.timed startTime,
                      t2.timed endTime
                    FROM rankedTimes t1
                      JOIN rankedTimes t2 ON t1.userFk = t2.userFk
                        AND t1.rn = t2.rn - 1
                    WHERE t1.rn % 2 = 1
                )
                SELECT userFk,
                    dated,
                    startTime,
                    endTime,
                    TIME_TO_SEC(TIMEDIFF(endTime, startTime)) rest
                  FROM pairedTimes
              )
              SELECT 
                  ct.dated,
                  ct.workerFk,
                  ct.collectionFk,
                  (TIME_TO_SEC(TIMEDIFF(ct.timeTo, ct.timeFrom)) - IFNULL(rti.rest + 60, 0)) + (ct.manualScanLines * 240) totalTime,
                  cl.totalLines,
                  cl.totalVolume
                FROM collectionTimes ct
                  STRAIGHT_JOIN collectionLines cl ON cl.collectionFk = ct.collectionFk
                  LEFT JOIN restTimeInterval rti ON rti.userFk = ct.workerFk
                    AND rti.startTime BETWEEN ct.timeFrom AND ct.timeTo
                    AND rti.endTime BETWEEN ct.timeFrom AND ct.timeTo
                GROUP BY ct.dated, ct.workerFk, ct.collectionFk
          )
          SELECT 
              tp.workerFk AS id_trabajador,
              SUM(tp.totalLines) / ((SUM(tp.totalTime) / 3600) * 80) AS rendimiento,
              SUM(tp.totalLines) / (SUM(tp.totalTime) / 3600) AS lineas_hora,
              SUM(tp.totalLines) AS total_lineas,
              SUM(tp.totalVolume) / (SUM(tp.totalTime) / 3600) AS volumen_hora
          FROM timePrep tp
          GROUP BY tp.workerFk
        """

        sql_hv = f"""
        WITH collectionTimes AS (
            SELECT 
                tc.collectionFk,
                st.workerFk,
                MIN(CASE WHEN s.code IN ('PREPARED', 'PREVIOUS_PREPARATION') THEN st.created END) timeFrom,
                IFNULL(MAX(CASE WHEN s.code IN ('PREPARED', 'OK PREVIOUS') THEN st.created END),
                  MIN(CASE WHEN s.code = 'ON_CHECKING' THEN st.created END)
                ) timeTo,
                SUM(NOT st.isScanned) manualScanLines
              FROM saleTracking st FORCE INDEX (saleTracking_idx5)
                JOIN state s ON s.id = st.stateFk
                JOIN sale sa ON sa.id = st.saleFk
                JOIN ticketCollection tc ON tc.ticketFk = sa.ticketFk
              WHERE s.code IN ('PREPARED', 'ON_CHECKING')
                AND st.created >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                AND st.workerFk IN ({','.join(active_ids)})
              GROUP BY tc.collectionFk, st.workerFk
              HAVING timeTo
        ),
        restTimeInterval AS (
            WITH rankedTimes AS (
              SELECT userFk,
                  timed,
                  ROW_NUMBER() OVER (PARTITION BY userFk ORDER BY timed) rn
                FROM workerTimeControl
                WHERE timed >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                  AND direction = 'middle'
                  AND userFk IN ({','.join(active_ids)})
            ),
            pairedTimes AS (
              SELECT t1.userFk,
                  DATE(t1.timed) dated,
                  t1.timed startTime,
                  t2.timed endTime
                FROM rankedTimes t1
                  JOIN rankedTimes t2 ON t1.userFk = t2.userFk
                    AND t1.rn = t2.rn - 1
                WHERE t1.rn % 2 = 1
            )
            SELECT userFk,
                dated,
                startTime,
                endTime,
                TIME_TO_SEC(TIMEDIFF(endTime, startTime)) rest
              FROM pairedTimes
        )
        SELECT 
            ct.workerFk AS id_trabajador,
            c.itemPackingTypeFk AS ipt,
            SUM((TIME_TO_SEC(TIMEDIFF(ct.timeTo, ct.timeFrom)) - IFNULL(rti.rest + 60, 0)) + (ct.manualScanLines * 240)) / 3600 AS total_horas
        FROM collectionTimes ct
          JOIN collection c ON c.id = ct.collectionFk
          LEFT JOIN restTimeInterval rti ON rti.userFk = ct.workerFk
            AND rti.startTime BETWEEN ct.timeFrom AND ct.timeTo
            AND rti.endTime BETWEEN ct.timeFrom AND ct.timeTo
        WHERE c.itemPackingTypeFk IN ('H', 'V')
        GROUP BY ct.workerFk, c.itemPackingTypeFk
        """

        sql_encajadores = f"""
        WITH wTickets AS (
            SELECT t.id, t.volume, COUNT(DISTINCT s.id) totalLines
            FROM ticket t FORCE INDEX (Fecha)
            JOIN sale s ON s.ticketFk = t.id
            JOIN ticketCollection tc ON tc.ticketFk = t.id
            JOIN collection c ON c.id = tc.collectionFk
            WHERE c.itemPackingTypeFk = 'H'
              AND t.totalWithoutVat > 0
              AND s.quantity > 0
            GROUP BY t.id
        ), wData AS (
            SELECT tt.ticketFk,
                   tt.userFk,
                   TIMEDIFF(
                       MAX(CASE WHEN s.code = 'PACKED'  THEN tt.created END),
                       MIN(CASE WHEN s.code = 'PACKING' THEN tt.created END)
                   ) diff,
                   t.volume,
                   t.totalLines
            FROM ticketTracking tt
            JOIN state s ON s.id = tt.stateFk
            JOIN wTickets t ON t.id = tt.ticketFk
            WHERE s.code IN ('PACKING', 'PACKED')
              AND tt.userFk IN ({','.join(active_ids)})
              AND tt.created >= DATE_SUB(NOW(), INTERVAL 14 DAY)
            GROUP BY tt.ticketFk, tt.userFk
            HAVING TIME_TO_SEC(diff) < 3600
        )
        SELECT 
            userFk AS id_trabajador,
            SUM(totalLines) / ((SUM(TIME_TO_SEC(diff)) / 3600) * 120) AS rendimiento,
            SUM(totalLines) / (SUM(TIME_TO_SEC(diff)) / 3600) AS lineas_hora,
            SUM(totalLines) AS total_lineas,
            SUM(volume) / (SUM(TIME_TO_SEC(diff)) / 3600) AS volumen_hora
        FROM wData
        GROUP BY userFk
        """

        payload = [
            {
                "refId": "A",
                "datasource": {"uid": "000000003"},
                "rawSql": sql,
                "format": "table"
            },
            {
                "refId": "B",
                "datasource": {"uid": "000000003"},
                "rawSql": sql_hv,
                "format": "table"
            },
            {
                "refId": "C",
                "datasource": {"uid": "000000003"},
                "rawSql": sql_encajadores,
                "format": "table"
            }
        ]

        res = client.query_datasource(payload)
        
        # Procesar resultados A (Sacadores)
        frames_a = res.get("results", {}).get("A", {}).get("frames", [])
        if frames_a and len(frames_a[0].get("data", {}).get("values", [])) > 0:
            values = frames_a[0]["data"]["values"]
            for i in range(len(values[0])):
                w_id = str(values[0][i])
                rend = values[1][i]
                lh = values[2][i]
                tot_lines = values[3][i] if len(values) > 3 else 0
                vol_h = values[4][i] if len(values) > 4 else 0.0
                resultado[w_id] = {
                    "rendimiento": f"{rend * 100:.1f}%" if rend else "",
                    "lineas_hora": f"{lh:.1f}" if lh else "",
                    "total_lineas": int(tot_lines) if tot_lines else 0,
                    "volumen_hora": float(vol_h) if vol_h else 0.0,
                    "horas_h": 0.0,
                    "horas_v": 0.0
                }

        # Procesar resultados C (Encajadores H)
        frames_c = res.get("results", {}).get("C", {}).get("frames", [])
        if frames_c and len(frames_c[0].get("data", {}).get("values", [])) > 0:
            values_c = frames_c[0]["data"]["values"]
            for i in range(len(values_c[0])):
                w_id = str(values_c[0][i])
                rend = values_c[1][i]
                lh = values_c[2][i]
                tot_lines = values_c[3][i] if len(values_c) > 3 else 0
                vol_h = values_c[4][i] if len(values_c) > 4 else 0.0
                resultado[w_id] = {
                    "rendimiento": f"{rend * 100:.1f}%" if rend else "",
                    "lineas_hora": f"{lh:.1f}" if lh else "",
                    "total_lineas": int(tot_lines) if tot_lines else 0,
                    "volumen_hora": float(vol_h) if vol_h else 0.0,
                    "horas_h": 0.0,
                    "horas_v": 0.0
                }
                
        # Procesar resultados B
        frames_b = res.get("results", {}).get("B", {}).get("frames", [])
        if frames_b and len(frames_b[0].get("data", {}).get("values", [])) > 0:
            values_b = frames_b[0]["data"]["values"]
            for i in range(len(values_b[0])):
                w_id = str(values_b[0][i])
                ipt = str(values_b[1][i]).strip().upper()
                horas = float(values_b[2][i] or 0.0)
                if w_id not in resultado:
                    resultado[w_id] = {
                        "rendimiento": "",
                        "lineas_hora": "",
                        "total_lineas": 0,
                        "volumen_hora": 0.0,
                        "horas_h": 0.0,
                        "horas_v": 0.0
                    }
                if ipt == "H":
                    resultado[w_id]["horas_h"] = round(horas, 1)
                elif ipt == "V":
                    resultado[w_id]["horas_v"] = round(horas, 1)
    except Exception as e:
        print(f"Error querying Grafana batch: {e}")

    with _grafana_perf_lock:
        _grafana_perf_cache = resultado
        _grafana_perf_timestamp = ahora
    return resultado


MODELO_IDEAL = [
    {"day": 1, "prod": 30.0, "error": 3.5},
    {"day": 2, "prod": 35.0, "error": 3.2},
    {"day": 3, "prod": 40.0, "error": 3.0},
    {"day": 4, "prod": 45.0, "error": 2.8},
    {"day": 5, "prod": 50.0, "error": 2.5},
    {"day": 6, "prod": 55.0, "error": 2.2},
    {"day": 7, "prod": 60.0, "error": 2.0},
    {"day": 8, "prod": 65.0, "error": 1.8},
    {"day": 9, "prod": 70.0, "error": 1.7},
    {"day": 10, "prod": 73.0, "error": 1.6},
    {"day": 11, "prod": 76.0, "error": 1.5},
    {"day": 12, "prod": 79.0, "error": 1.4},
    {"day": 13, "prod": 82.0, "error": 1.3},
    {"day": 14, "prod": 85.0, "error": 1.2},
    {"day": 15, "prod": 87.5, "error": 1.15},
    {"day": 16, "prod": 90.0, "error": 1.1},
    {"day": 17, "prod": 92.5, "error": 1.05},
    {"day": 18, "prod": 95.0, "error": 1.0},
    {"day": 19, "prod": 97.0, "error": 0.95},
    {"day": 20, "prod": 98.5, "error": 0.9},
    {"day": 21, "prod": 100.0, "error": 0.85},
    {"day": 22, "prod": 101.0, "error": 0.8},
    {"day": 23, "prod": 102.0, "error": 0.75},
    {"day": 24, "prod": 103.0, "error": 0.7},
    {"day": 25, "prod": 104.0, "error": 0.65},
    {"day": 26, "prod": 105.0, "error": 0.6},
    {"day": 27, "prod": 106.0, "error": 0.55},
    {"day": 28, "prod": 107.0, "error": 0.5},
    {"day": 29, "prod": 108.0, "error": 0.45},
    {"day": 30, "prod": 109.0, "error": 0.4},
    {"day": 31, "prod": 110.0, "error": 0.35}
]

def obtener_ideal_para_dia(day):
    if not day or day <= 0:
        return {"prod": 30.0, "error": 3.5}
    idx = min(day, len(MODELO_IDEAL)) - 1
    return MODELO_IDEAL[idx]

def calcular_color_semaforo(persona, pct_val, err_val, total_lineas):
    # Si tiene un nivel de riesgo manual (ALTO, MEDIO, BAJO), lo respetamos
    riesgo = str(persona.get("riesgo") or "").upper().strip()
    if riesgo in ("ALTO", "ROJO"):
        return "ROJO"
    elif riesgo in ("MEDIO", "AMARILLO"):
        return "AMARILLO"
    elif riesgo in ("BAJO", "VERDE"):
        return "VERDE"

    # Intentar parsear el día transcurrido
    try:
        day = int(persona.get("dias") or 0)
    except (ValueError, TypeError):
        day = 1
    if day <= 0:
        day = 1
        
    ideal = obtener_ideal_para_dia(day)
    prod_ideal = ideal["prod"]
    error_ideal = ideal["error"]
    
    # Intentar parsear la productividad real
    actual_prod = 0.0
    if pct_val:
        try:
            actual_prod = float(str(pct_val).replace("%", "").strip())
        except ValueError:
            pass
            
    # Intentar parsear la cantidad de errores real
    actual_error_count = 0
    if err_val:
        try:
            actual_error_count = int(str(err_val).strip())
        except ValueError:
            pass
            
    # Si tenemos total_lineas en Grafana, calculamos error_pct exacto
    if total_lineas and total_lineas > 0:
        actual_error = (actual_error_count / total_lineas) * 100.0
    else:
        # Fallback si no tenemos total_lineas (e.g. estimar 80 líneas por hora * 7.5 horas = 600 líneas)
        actual_error = (actual_error_count / 600.0) * 100.0 if actual_error_count > 0 else 0.0
        
    # Calcular diferencias
    diff_prod = actual_prod - prod_ideal
    diff_error = actual_error - error_ideal
    
    # Si no tiene datos de productividad (por ejemplo, es "-" o 0.0)
    if not pct_val or actual_prod == 0.0:
        return "GRIS"
        
    if diff_prod < -15 or diff_error > 1.0:
        return "ROJO"
    elif diff_prod >= 0 and diff_error <= 0:
        return "VERDE"
    else:
        return "AMARILLO"


def obtener_personas(excluir_equipo=False, filtrar_dias=True):
    global _mapped_personas_cache, _mapped_personas_timestamp
    ahora = time.time()
    
    cache_key = (excluir_equipo, filtrar_dias)
    with _mapped_personas_lock:
        if (cache_key in _mapped_personas_cache) and (ahora - _mapped_personas_timestamp) < MAPPED_PERSONAS_CACHE_TTL:
            return _mapped_personas_cache[cache_key]

    from datetime import date, datetime
    
    personas = obtener_filas_maestro_personas()
    overrides = obtener_overrides()
    horas_formacion = obtener_horas_formacion_por_trabajador()
    
    # Obtener retrasos directamente para evitar importaciones circulares y bucles infinitos
    try:
        from app.services.dashboard_service import obtener_retrasos_trabajadores
        personas_normal = []
        for p in personas:
            id_val = str(p.get("ID_Trabajador", "")).strip()
            nombre_val = str(p.get("NOMBRE_COMPLETO", "")).strip()
            activo_val = str(p.get("ACTIVO", "")).strip().upper()
            if not id_val or id_val.startswith("#") or not nombre_val:
                continue
            if activo_val == "NO":
                continue
            personas_normal.append({
                "id": id_val,
                "nombre": nombre_val,
                "tutor": str(p.get("TUTOR_ASIGNADO", "") or p.get("Formador", "")).strip()
            })
        retrasos = obtener_retrasos_trabajadores(personas_normal)
        retrasos_ids = {str(r["id"]).strip() for r in retrasos}
    except Exception as e:
        retrasos_ids = set()
 
    # 1. Extraer los IDs de trabajadores activos para consultar Grafana por lotes
    active_ids = []
    for p in personas:
        id_val = str(p.get("ID_Trabajador", "")).strip()
        nombre_val = str(p.get("NOMBRE_COMPLETO", "")).strip()
        estado_val = str(p.get("ESTADO", "")).strip().upper()
        if not id_val or id_val.startswith("#") or not nombre_val:
            continue
        if estado_val not in ("FINALIZADO", "BAJA", "TERMINADO", "NO APTO"):
            active_ids.append(id_val)
 
    # 2. Obtener datos de rendimiento por lote desde Grafana (tiempo real)
    grafana_perf = {}
    if active_ids:
        grafana_perf = obtener_rendimiento_grafana_batch(active_ids)
 
    # 3. Obtener datos de rendimiento del excel de Formadores (secondary fallback)
    global _formadores_perf_cache, _formadores_perf_timestamp
    formadores_perf = {}
    with _formadores_perf_lock:
        usar_cache_form = _formadores_perf_cache is not None and (ahora - _formadores_perf_timestamp) < FORMADORES_PERF_CACHE_TTL
    
    if usar_cache_form:
        with _formadores_perf_lock:
            formadores_perf = _formadores_perf_cache
    else:
        try:
            doc_form = abrir_documento_por_key("19V0hASsS5P34bf1kR893b_uE1bZ2RSePT-QZlO8z2-k")
            hoja_form = doc_form.worksheet("DATOS RENDIMIENTO IMPORTADOS")
            rows_form = hoja_form.get_all_records()
            formadores_perf = {str(r["workerFk"]).strip(): r for r in rows_form if str(r.get("workerFk", "")).isdigit()}
            with _formadores_perf_lock:
                _formadores_perf_cache = formadores_perf
                _formadores_perf_timestamp = ahora
        except Exception:
            with _formadores_perf_lock:
                if _formadores_perf_cache is not None:
                    formadores_perf = _formadores_perf_cache
 
    # 4. Obtener conteo de errores desde Grafana (últimos 14 días)
    global _errores_grafana_cache, _errores_grafana_timestamp
    errores_grafana = {}
    with _errores_grafana_lock:
        usar_cache_err = _errores_grafana_cache is not None and (ahora - _errores_grafana_timestamp) < ERRORES_GRAFANA_CACHE_TTL
        
    if usar_cache_err:
        with _errores_grafana_lock:
            errores_grafana = _errores_grafana_cache
    else:
        if active_ids:
            try:
                from app.services.grafana.client import GrafanaClient
                from app.services.grafana.config import GRAFANA_URL
                client = GrafanaClient(base_url=GRAFANA_URL)
                sql = f"""
                SELECT 
                    st_inner.workerFk AS id_trabajador,
                    COUNT(*) AS cantidad_errores
                FROM saleMistake sm
                JOIN mistakeType mt ON mt.id = sm.typeFk
                JOIN sale s_inner ON s_inner.id = sm.saleFk
                JOIN saleTracking st_inner ON s_inner.id = st_inner.saleFk
                JOIN state sta_inner ON sta_inner.id = st_inner.stateFk
                WHERE sta_inner.code IN ('PREPARED', 'PREVIOUS_PREPARATION', 'OK PREVIOUS')
                  AND mt.description NOT IN ('Presentación Excelente')
                  AND sm.created >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                  AND st_inner.workerFk IN ({','.join(active_ids)})
                GROUP BY st_inner.workerFk
                """
                payload = [{
                    "refId": "A",
                    "datasource": {"uid": "000000003"},
                    "rawSql": sql,
                    "format": "table"
                }]
                res = client.query_datasource(payload)
                frames = res.get("results", {}).get("A", {}).get("frames", [])
                if frames and len(frames[0].get("data", {}).get("values", [])) > 0:
                    values = frames[0]["data"]["values"]
                    for i in range(len(values[0])):
                        w_id = str(values[0][i])
                        err_count = values[1][i]
                        errores_grafana[w_id] = err_count
                with _errores_grafana_lock:
                    _errores_grafana_cache = errores_grafana
                    _errores_grafana_timestamp = ahora
            except Exception:
                with _errores_grafana_lock:
                    if _errores_grafana_cache is not None:
                        errores_grafana = _errores_grafana_cache
 
    resultado = []
 
    for p in personas:
        id_val = str(p.get("ID_Trabajador", "")).strip()
        nombre_val = str(p.get("NOMBRE_COMPLETO", "")).strip()
        
        # Saltar filas vacías, de cabecera mal parseadas, o con errores de fórmula (#REF!, #N/A, etc.)
        if not id_val or id_val.startswith("#") or not nombre_val:
            continue
            
        if excluir_equipo:
            estado_val = str(p.get("ESTADO", "")).strip().upper()
            if estado_val in ("EQUIPO", "FINALIZADO", "TERMINADO", "NO APTO"):
                continue
            
        persona_mapeada = mapear_persona(p, overrides, horas_formacion)
        
        # Calcular alertas
        alertas = []
        if not persona_mapeada.get("tutor"):
            alertas.append("Sin tutor")
            
        # Calcular checklist incompleto
        checklist_campos = ["rrhh", "almuerzo", "uniforme", "psicotecnico", "formacion", "tour"]
        def es_check(valor):
            return str(valor or "").upper().strip() in ["TRUE", "SI", "SÍ", "1", "X", "OK", "HECHO", "COMPLETADO"]
        
        checklist_completado = sum(1 for c in checklist_campos if es_check(persona_mapeada.get(c)))
        if checklist_completado < len(checklist_campos):
            # Parsear fecha de incorporación
            fecha_inc = None
            val_fecha = p.get("FECHA_INCORPORACION", "")
            if val_fecha:
                if isinstance(val_fecha, datetime):
                    fecha_inc = val_fecha.date()
                elif isinstance(val_fecha, date):
                    fecha_inc = val_fecha
                else:
                    for formato in ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"]:
                        try:
                            fecha_inc = datetime.strptime(str(val_fecha).strip(), formato).date()
                            break
                        except Exception:
                            pass
            
            if fecha_inc == date.today():
                alertas.append("Checklist incompleto")
                
        if str(persona_mapeada["id"]).strip() in retrasos_ids:
            alertas.append("Impuntualidad")
            
        # Fallbacks de rendimiento y errores
        pct_val = persona_mapeada.get("productividad_ultimo_dia") or ""
        lh_val = persona_mapeada.get("productividad_media") or ""
        err_val = persona_mapeada.get("error_ultimo_dia") or ""
        
        # 1. Obtener desde lote en tiempo real de Grafana (primary)
        g_perf = grafana_perf.get(id_val, {})
        if g_perf:
            if not pct_val:
                pct_val = g_perf.get("rendimiento") or ""
            if not lh_val:
                lh_val = g_perf.get("lineas_hora") or ""
                
        # 2. Obtener desde excel Formadores (secondary fallback)
        f_perf = formadores_perf.get(id_val, {})
        if not pct_val and f_perf:
            raw_pct = f_perf.get("percentaje", 0)
            pct_val = f"{raw_pct / 10:.1f}%" if raw_pct else ""
        if not lh_val and f_perf:
            try:
                raw_lh = float(f_perf.get("linesHour", 0))
                if raw_lh >= 10000:
                    lh_val = f"{raw_lh / 1000.0:.1f}"
                elif raw_lh >= 1000:
                    lh_val = f"{raw_lh / 100.0:.1f}"
                elif raw_lh >= 100:
                    lh_val = f"{raw_lh / 10.0:.1f}"
                elif raw_lh > 0:
                    lh_val = f"{raw_lh:.1f}"
                else:
                    lh_val = ""
            except Exception:
                lh_val = ""
                
        if err_val in [None, "", "-"]:
            err_val = str(errores_grafana.get(id_val, 0))
            
        persona_mapeada["productividad_ultimo_dia"] = pct_val
        persona_mapeada["productividad_media"] = lh_val
        persona_mapeada["error_ultimo_dia"] = err_val
        
        # Calcular código de semáforo
        total_lineas = g_perf.get("total_lineas", 0) if g_perf else 0
        persona_mapeada["color_code"] = calcular_color_semaforo(persona_mapeada, pct_val, err_val, total_lineas)
 
        dept_norm = str(persona_mapeada.get("departamento") or "").upper().strip()
        import unicodedata
        dept_clean = "".join(c for c in unicodedata.normalize('NFD', dept_norm) if unicodedata.category(c) != 'Mn')
        dept_clean = " ".join(dept_clean.split())

        # Filtrar por departamento (sólo SACADO H, SACADO V, TALLER NATURAL, ENCAJADO H, ENCAJADO V) si filtrar_dias es True
        if filtrar_dias:
            if dept_clean not in ("SACADO H", "SACADO V", "TALLER NATURAL", "ENCAJADO H", "ENCAJADO V"):
                continue
            
        # Filtrar por días (del 0 al 31)
        if filtrar_dias:
            try:
                dias_val = int(persona_mapeada.get("dias") or 0)
                if dias_val < 0 or dias_val > 31:
                    continue
            except (ValueError, TypeError):
                continue
 
        # Calcular nota y horas H/V para sacadores/encajadores
        lh = g_perf.get("lineas_hora", 0.0) if g_perf else 0.0
        vol_h = g_perf.get("volumen_hora", 0.0) if g_perf else 0.0
        
        if "ENCAJADO" in dept_clean:
            nota_val = calcular_nota_encajador(lh, vol_h)
        else:
            nota_val = calcular_nota_sacador(lh, vol_h)
            
        persona_mapeada["nota"] = nota_val
        persona_mapeada["horas_h"] = g_perf.get("horas_h", 0.0) if g_perf else 0.0
        persona_mapeada["horas_v"] = g_perf.get("horas_v", 0.0) if g_perf else 0.0
 
        persona_mapeada["alertas"] = alertas
        resultado.append(persona_mapeada)
 
    with _mapped_personas_lock:
        _mapped_personas_cache[cache_key] = resultado
        _mapped_personas_timestamp = ahora
 
    return resultado


def calcular_nota_encajador(lineas_hora, volumen_hora):
    try:
        lh = float(lineas_hora or 0.0)
        vol = float(volumen_hora or 0.0)
        
        # Escala líneas/hora (objetivo 120): min 40, max 160
        if lh <= 40.0:
            nota_lh = 0.0
        elif lh >= 160.0:
            nota_lh = 1.0
        else:
            nota_lh = (lh - 40.0) / 120.0
            
        # Escala volumen/hora (objetivo 3.0): min 0.5, max 4.0
        if vol <= 0.5:
            nota_vol = 0.0
        elif vol >= 4.0:
            nota_vol = 1.0
        else:
            nota_vol = (vol - 0.5) / 3.5
            
        nota_final = 10.0 * (0.75 * nota_lh + 0.25 * nota_vol)
        return round(nota_final, 2)
    except Exception:
        return 0.0


def calcular_nota_sacador(lineas_hora, volumen_hora):
    try:
        lh = float(lineas_hora or 0.0)
        vol = float(volumen_hora or 0.0)
        
        if lh <= 20.0:
            nota_lh = 0.0
        elif lh >= 100.0:
            nota_lh = 1.0
        else:
            nota_lh = (lh - 20.0) / 80.0
            
        if vol <= 0.20:
            nota_vol = 0.0
        elif vol >= 3.0:
            nota_vol = 1.0
        else:
            nota_vol = (vol - 0.20) / 2.8
            
        nota_final = 10.0 * (0.7 * nota_lh + 0.3 * nota_vol)
        return round(nota_final, 2)
    except Exception:
        return 0.0


def obtener_persona(id_trabajador, incluir_grafana=False):

    personas = obtener_filas_maestro_personas()

    for p in personas:
        id_val = str(p.get("ID_Trabajador", "")).strip()
        
        if not id_val or id_val.startswith("#"):
            continue

        if id_val == str(id_trabajador).strip():
            
            # 1. Mapeamos los datos base
            datos_persona = mapear_persona(p)
            
            # Inyectar Nota y Horas H/V
            perf_batch = obtener_rendimiento_grafana_batch([id_val])
            g_perf = perf_batch.get(id_val, {})
            if g_perf:
                lh = g_perf.get("lineas_hora", 0.0)
                vol_h = g_perf.get("volumen_hora", 0.0)
                
                dept_norm = str(datos_persona.get("departamento") or "").upper().strip()
                if "ENCAJADO" in dept_norm:
                    nota = calcular_nota_encajador(lh, vol_h)
                else:
                    nota = calcular_nota_sacador(lh, vol_h)
                    
                datos_persona["nota"] = nota
                datos_persona["horas_h"] = g_perf.get("horas_h", 0.0)
                datos_persona["horas_v"] = g_perf.get("horas_v", 0.0)
            else:
                datos_persona["nota"] = 0.0
                datos_persona["horas_h"] = 0.0
                datos_persona["horas_v"] = 0.0
            
            # 2. Le inyectamos el historial de Grafana solo si se solicita
            if incluir_grafana:
                datos_persona["grafana_historico"] = obtener_historial_grafana(id_trabajador)
            else:
                datos_persona["grafana_historico"] = []
            
            return datos_persona

    return {
        "error": "Trabajador no encontrado"
    }


def obtener_historial_sacador(worker_id):
    try:
        from app.services.grafana.client import GrafanaClient
        from app.services.grafana.config import GRAFANA_URL
        
        client = GrafanaClient(base_url=GRAFANA_URL)
        w_id = int(str(worker_id).strip())
        
        sql_history = f"""
        WITH collectionTimes AS (
            SELECT 
                tc.collectionFk,
                st.workerFk,
                MIN(CASE WHEN s.code IN ('PREPARED', 'PREVIOUS_PREPARATION') THEN st.created END) timeFrom,
                IFNULL(MAX(CASE WHEN s.code IN ('PREPARED', 'OK PREVIOUS') THEN st.created END),
                  MIN(CASE WHEN s.code = 'ON_CHECKING' THEN st.created END)
                ) timeTo,
                SUM(NOT st.isScanned) manualScanLines
              FROM saleTracking st FORCE INDEX (saleTracking_idx5)
                JOIN state s ON s.id = st.stateFk
                JOIN sale sa ON sa.id = st.saleFk
                JOIN ticketCollection tc ON tc.ticketFk = sa.ticketFk
              WHERE s.code IN ('PREPARED', 'ON_CHECKING', 'OK PREVIOUS', 'PREVIOUS_PREPARATION')
                AND st.created >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                AND st.workerFk = {w_id}
              GROUP BY tc.collectionFk, st.workerFk
              HAVING timeFrom AND timeTo
        ),
        collectionLines AS (
            WITH ticketLines AS (
              SELECT s.ticketFk,
                  SUM(IF(sgd.saleFk IS NULL, 1, 0)) + COUNT(DISTINCT sgd.saleGroupFk) totalLines,
                  SUM(IF(st.stateFk IN (SELECT id FROM state WHERE code IN ('PREVIOUS_PREPARATION', 'OK PREVIOUS') or isPreviousPreparable = 1), 1, 0)) totalLinesPrevia,
                  SUM(s.volume) volume
                FROM ticket t
                  JOIN sale s ON s.ticketFk = t.id
                  JOIN saleTracking st ON st.saleFk = s.id
                    AND st.stateFk IN (SELECT id FROM state WHERE code IN ('PREPARED', 'PREVIOUS_PREPARATION', 'OK PREVIOUS') or isPreviousPreparable = 1)
                  LEFT JOIN saleGroupDetail sgd ON sgd.saleFk = s.id
                WHERE t.shipped >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                  AND s.quantity > 0
                GROUP BY s.ticketFk
            )
            SELECT tc.collectionFk,
                SUM(tl.totalLines) totalLines,
                SUM(tl.totalLinesPrevia) totalLinesPrevia,
                SUM(tl.volume) totalVolume
              FROM ticketLines tl
                JOIN ticketCollection tc ON tc.ticketFk = tl.ticketFk
              GROUP BY tc.collectionFk
        ),
        restTimeInterval AS (
            WITH rankedTimes AS (
              SELECT userFk,
                  timed,
                  ROW_NUMBER() OVER (PARTITION BY userFk ORDER BY timed) rn
                FROM workerTimeControl
                WHERE timed >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                  AND direction = 'middle'
                  AND userFk = {w_id}
            ),
            pairedTimes AS (
              SELECT userFk,
                  DATE(timed) dated,
                  timed startTime,
                  endTime
                FROM (
                  SELECT t1.userFk,
                      t1.timed,
                      (SELECT t2.timed FROM rankedTimes t2 WHERE t2.userFk = t1.userFk AND t2.rn = t1.rn + 1) endTime
                  FROM rankedTimes t1
                  WHERE t1.rn % 2 = 1
                ) sub
                WHERE endTime IS NOT NULL
            )
            SELECT userFk,
                dated,
                startTime,
                endTime,
                TIME_TO_SEC(TIMEDIFF(endTime, startTime)) rest
              FROM pairedTimes
        )
        SELECT 
            ct.collectionFk AS coleccion,
            c.itemPackingTypeFk AS ipt,
            DATE_FORMAT(ct.timeFrom, '%H:%i') AS hora_inicio,
            tr.name AS tren,
            cl.totalLines AS lineas,
            cl.totalLinesPrevia AS lineas_previa,
            SEC_TO_TIME((TIME_TO_SEC(TIMEDIFF(ct.timeTo, ct.timeFrom)) - IFNULL(rti.rest + 60, 0)) + (ct.manualScanLines * 240)) AS tiempo,
            ROUND(cl.totalLines / (GREATEST(1, (TIME_TO_SEC(TIMEDIFF(ct.timeTo, ct.timeFrom)) - IFNULL(rti.rest + 60, 0)) + (ct.manualScanLines * 240)) / 3600)) AS lineas_hora,
            ROUND(cl.totalVolume, 2) AS volumen,
            DATE_FORMAT(ct.timeFrom, '%d/%m/%Y') AS fecha
        FROM collectionTimes ct
          JOIN collection c ON c.id = ct.collectionFk
          JOIN train tr ON tr.id = c.trainFk
          JOIN collectionLines cl ON cl.collectionFk = ct.collectionFk
          LEFT JOIN restTimeInterval rti ON rti.userFk = ct.workerFk
            AND rti.startTime BETWEEN ct.timeFrom AND ct.timeTo
            AND rti.endTime BETWEEN ct.timeFrom AND ct.timeTo
        ORDER BY ct.timeFrom DESC
        """
        
        payload = [{
            "refId": "A",
            "datasource": {"uid": "000000003"},
            "rawSql": sql_history,
            "format": "table"
        }]
        
        res = client.query_datasource(payload)
        frames = res.get("results", {}).get("A", {}).get("frames", [])
        resultado = []
        if frames and len(frames[0].get("data", {}).get("values", [])) > 0:
            values = frames[0]["data"]["values"]
            columns = [f["name"] for f in frames[0]["schema"]["fields"]]
            for i in range(len(values[0])):
                row = {}
                for col_idx, col in enumerate(columns):
                    val = values[col_idx][i]
                    if col == "tiempo" and isinstance(val, int):
                        # Convertir segundos a formato HH:MM:SS
                        h_val = val // 3600
                        m_val = (val % 3600) // 60
                        s_val = val % 60
                        row[col] = f"{h_val:02d}:{m_val:02d}:{s_val:02d}"
                    else:
                        row[col] = val
                resultado.append(row)
        return resultado
    except Exception as e:
        print(f"Error en obtener_historial_sacador: {e}")
        return []


import threading
import time
import logging

logger = logging.getLogger(__name__)

_overrides_cache = None
_overrides_timestamp = 0.0
_overrides_lock = threading.Lock()
OVERRIDES_CACHE_TTL = 300  # 5 minutos

def obtener_overrides(forzar_refresco=False):
    global _overrides_cache, _overrides_timestamp
    ahora = time.time()
    
    if not forzar_refresco:
        with _overrides_lock:
            if _overrides_cache is not None and (ahora - _overrides_timestamp) < OVERRIDES_CACHE_TTL:
                return _overrides_cache
                
    try:
        import gspread
        documento = abrir_documento(DOCUMENTO)
        try:
            hoja = documento.worksheet("EDICIONES_OVERRIDE")
        except gspread.exceptions.WorksheetNotFound:
            hoja = documento.add_worksheet(title="EDICIONES_OVERRIDE", rows="1000", cols="3")
            hoja.append_row(["ID_Trabajador", "Campo", "Valor"])
            
        registros = hoja.get_all_records()
        overrides = {}
        for r in registros:
            w_id = str(r.get("ID_Trabajador", "")).strip()
            campo = str(r.get("Campo", "")).strip()
            valor = str(r.get("Valor", ""))
            if w_id and campo:
                if w_id not in overrides:
                    overrides[w_id] = {}
                overrides[w_id][campo] = valor
                
        with _overrides_lock:
            _overrides_cache = overrides
            _overrides_timestamp = ahora
            
        return overrides
    except Exception as e:
        logger.error(f"Error obteniendo overrides de la hoja de cálculo: {e}")
        return {}


def guardar_override(id_trabajador, campo, valor):
    global _overrides_cache
    try:
        import gspread
        documento = abrir_documento(DOCUMENTO)
        try:
            hoja = documento.worksheet("EDICIONES_OVERRIDE")
        except gspread.exceptions.WorksheetNotFound:
            hoja = documento.add_worksheet(title="EDICIONES_OVERRIDE", rows="1000", cols="3")
            hoja.append_row(["ID_Trabajador", "Campo", "Valor"])
            
        registros = hoja.get_all_records()
        fila_idx = None
        for idx, r in enumerate(registros):
            w_id = str(r.get("ID_Trabajador", "")).strip()
            c = str(r.get("Campo", "")).strip()
            if w_id == str(id_trabajador).strip() and c == campo:
                fila_idx = idx + 2
                break
                
        if fila_idx:
            hoja.update_cell(fila_idx, 3, valor)
        else:
            hoja.append_row([str(id_trabajador).strip(), campo, valor])
            
        with _overrides_lock:
            _overrides_cache = None
            
        # Forzar invalidación del caché de dashboard_service
        try:
            from app.services import dashboard_service
            with dashboard_service._cache_lock:
                dashboard_service._cache_datos = None
        except Exception:
            pass
            
        return True
    except Exception as e:
        logger.error(f"Error al guardar override para {id_trabajador} (campo: {campo}, valor: {valor}): {e}")
        return False


def guardar_overrides_batch(updates_list):
    """
    updates_list: lista de tuplas/listas/dicts con (id_trabajador, campo, valor)
    """
    global _overrides_cache
    if not updates_list:
        return True
    try:
        import gspread
        documento = abrir_documento(DOCUMENTO)
        try:
            hoja = documento.worksheet("EDICIONES_OVERRIDE")
        except gspread.exceptions.WorksheetNotFound:
            hoja = documento.add_worksheet(title="EDICIONES_OVERRIDE", rows="1000", cols="3")
            hoja.append_row(["ID_Trabajador", "Campo", "Valor"])
            
        values = hoja.get_all_values()
        if not values:
            values = [["ID_Trabajador", "Campo", "Valor"]]
            
        # Mapear filas existentes para búsqueda rápida: {(w_id, campo): indice_lista}
        row_map = {}
        for idx in range(1, len(values)):
            r = values[idx]
            if len(r) >= 2:
                w_id = str(r[0]).strip()
                c = str(r[1]).strip()
                row_map[(w_id, c)] = idx
                
        # Aplicar actualizaciones en memoria
        modificado = False
        for item in updates_list:
            if isinstance(item, dict):
                w_id = str(item.get("id") or item.get("ID_Trabajador")).strip()
                campo = str(item.get("campo") or item.get("Campo")).strip()
                valor = str(item.get("valor") or item.get("Valor", ""))
            else:
                w_id, campo, valor = item
                w_id = str(w_id).strip()
                campo = str(campo).strip()
                valor = str(valor)
                
            key = (w_id, campo)
            if key in row_map:
                idx = row_map[key]
                if len(values[idx]) < 3:
                    values[idx].append(valor)
                    modificado = True
                elif values[idx][2] != valor:
                    values[idx][2] = valor
                    modificado = True
            else:
                values.append([w_id, campo, valor])
                row_map[key] = len(values) - 1
                modificado = True
                
        if modificado:
            # Escribir de vuelta a la hoja
            range_name = f"A1:C{len(values)}"
            hoja.update(range_name, values)
        
        with _overrides_lock:
            _overrides_cache = None
            
        # Forzar invalidación del caché de dashboard_service
        try:
            from app.services import dashboard_service
            with dashboard_service._cache_lock:
                dashboard_service._cache_datos = None
        except Exception:
            pass
            
        return True
    except Exception as e:
        logger.error(f"Error al guardar overrides en batch: {e}")
        return False


def convertir_nota_actitudinal(valor):
    if valor in [None, ""]:
        return 0
    try:
        val = int(float(str(valor).replace(",", ".").strip()))
        return max(0, min(5, val))
    except Exception:
        return 0


def mapear_persona(p, overrides=None, horas_formacion=None):
    w_id = str(p.get("ID_Trabajador", "")).strip()
    if overrides is None:
        overrides = obtener_overrides()
    if horas_formacion is None:
        horas_formacion = obtener_horas_formacion_por_trabajador()
        
    h_data = horas_formacion.get(w_id, {"camara": "0:00", "aula": "0:00"})
    worker_overrides = overrides.get(w_id, {})
    
    dept = worker_overrides.get("departamento", p.get("DEPARTAMENTO_ORIGEN", ""))
    obs = worker_overrides.get("observaciones", p.get("Observaciones", ""))
    chaleco = worker_overrides.get("chaleco", "NO")
    hora_entrada = worker_overrides.get("hora_entrada", "08:00")
    resumen_validado = worker_overrides.get("resumen_validado", "NO")

    act_proactividad = convertir_nota_actitudinal(worker_overrides.get("act_proactividad", 0))
    act_autonomia = convertir_nota_actitudinal(worker_overrides.get("act_autonomia", 0))
    act_disposicion = convertir_nota_actitudinal(worker_overrides.get("act_disposicion", 0))
    act_respeto = convertir_nota_actitudinal(worker_overrides.get("act_respeto", 0))
    act_receptividad = convertir_nota_actitudinal(worker_overrides.get("act_receptividad", 0))
    act_uso_pda = convertir_nota_actitudinal(worker_overrides.get("act_uso_pda", 0))

    # Calcular días desde incorporación
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

    return {

        # =====================================================
        # IDENTIFICACIÓN
        # =====================================================

        "id": p.get("ID_Trabajador", ""),
        "nombre": p.get("NOMBRE_COMPLETO", ""),
        "programa": p.get("TIPO_PROGRAMA", ""),
        "chaleco": chaleco,
        "contrato_limitado": str(p.get("CONTRATO_LIMITADO", "") or "NO").strip().upper(),

        # =====================================================
        # INCORPORACIÓN
        # =====================================================

        "fecha_incorporacion": p.get("FECHA_INCORPORACION", ""),
        "departamento": dept,
        "hora_entrada": hora_entrada,

        # =====================================================
        # ESTADO
        # =====================================================

        "estado": p.get("ESTADO", ""),
        "dias": dias_calc if dias_calc != "" else p.get("DIAS_EN_SEGUIMIENTO", ""),
        "dias_restantes": p.get("DIAS_RESTANTES", ""),
        "riesgo": p.get("RIESGO", ""),
        "riesgo_score": p.get("RIESGO_SCORE", ""),

        # =====================================================
        # CHECKLIST
        # =====================================================

        "rrhh": p.get("RRHH", ""),
        "almuerzo": p.get("ALMUERZO", ""),
        "uniforme": p.get("UNIFORME", ""),
        "psicotecnico": p.get("PSICOTECNICO", ""),
        "formacion": p.get("FORMACION_BIENVENIDA", ""),
        "tour": p.get("TOUR_EMPRESA", ""),

        "pda": p.get("PDA_ENTREGADA", ""),
        "pda_documento": p.get("PDA_DOCUMENTO", ""),
        "pda_fecha": p.get("PDA_FECHA_FIRMA", ""),

        "checklist": p.get("CHECKLIST_COMPLETADO", ""),
        "porcentaje_preparacion": p.get("PORCENTAJE_PREPARACION", ""),

        # =====================================================
        # TUTOR
        # =====================================================

        "tutor": p.get("TUTOR_ASIGNADO", ""),

        # =====================================================
        # EVALUACIONES
        # =====================================================

        "ultima_evaluacion": p.get("ULTIMA_EVALUACION", ""),
        "media_evaluaciones": p.get("MEDIA_EVALUACIONES", ""),

        # =====================================================
        # PRODUCTIVIDAD
        # =====================================================

        "ultima_fecha_grafana": p.get("ULTIMA_FECHA_GRAFANA", ""),

        "productividad_media": p.get("PRODUCTIVIDAD_MEDIA", ""),
        "productividad_ultimo_dia": p.get("PRODUCTIVIDAD_ULTIMO_DIA", ""),
        "productividad_7_dias": p.get("PRODUCTIVIDAD_7_DIAS", ""),

        "error_medio": p.get("ERROR_MEDIO", ""),
        "error_ultimo_dia": p.get("ERROR_ULTIMO_DIA", ""),
        "error_7_dias": p.get("ERROR_7_DIAS", ""),

        "tendencia_productividad": p.get("TENDENCIA_PRODUCTIVIDAD", ""),
        "tendencia_errores": p.get("TENDENCIA_ERRORES", ""),
        "formacion_aula": h_data["aula"],
        "formacion_camara": h_data["camara"],

        # =====================================================
        # IA
        # =====================================================

        "resumen_analitico": p.get("RESUMEN_ANALITICO", ""),
        "revision_enviada": p.get("REVISION_ENVIADA", ""),
        "whatsapp_anadido": p.get("WHATSAPP_ANADIDO", ""),

        # =====================================================
        # OBSERVACIONES
        # =====================================================

        "observaciones": obs,

        # =====================================================
        # ESTADO GENERAL
        # =====================================================

        "activo": p.get("ACTIVO", ""),
        "finalizado": p.get("FINALIZADO", ""),
        "motivo_baja": p.get("MOTIVO_BAJA", ""),
        "fecha_baja": p.get("FECHA_BAJA", ""),

        # =====================================================
        # AUDITORÍA
        # =====================================================

        "creado_por": p.get("CREADO_POR", ""),
        "fecha_creacion": p.get("FECHA_CREACION", ""),
        "modificado_por": p.get("MODIFICADO_POR", ""),
        "fecha_modificacion": p.get("FECHA_MODIFICACION", ""),

        # =====================================================
        # VALORACIÓN ACTITUDINAL (NUEVO SPRINT)
        # =====================================================
        "act_proactividad": act_proactividad,
        "act_autonomia": act_autonomia,
        "act_disposicion": act_disposicion,
        "act_respeto": act_respeto,
        "act_receptividad": act_receptividad,
        "act_uso_pda": act_uso_pda,
        "resumen_validado": resumen_validado

    }


def invalidar_cache_personas():
    global _mapped_personas_cache, _mapped_personas_timestamp
    with _mapped_personas_lock:
        _mapped_personas_cache.clear()
        _mapped_personas_timestamp = 0.0
    
    # Forzar invalidación del caché serializado del dashboard
    try:
        from app.services import dashboard_service
        with dashboard_service._cache_lock:
            dashboard_service._cache_datos = None
    except Exception:
        pass


def guardar_checklist_persona(datos):
    try:
        id_trabajador = datos.get("id")
        campo = datos.get("campo")
        valor = datos.get("valor") if datos.get("valor") is not None else datos.get("value")

        if not id_trabajador or not campo:
            return {"ok": False, "error": "Faltan campos id o campo"}

        mapping = {
            "rrhh": "RRHH",
            "almuerzo": "ALMUERZO",
            "uniforme": "UNIFORME",
            "psicotecnico": "PSICOTECNICO",
            "formacion": "FORMACION_BIENVENIDA",
            "tour": "TOUR_EMPRESA",
            "pda": "PDA_ENTREGADA",
            "pda_documento": "PDA_DOCUMENTO"
        }

        columna = mapping.get(campo)
        if not columna:
            return {"ok": False, "error": f"Campo desconocido: {campo}"}

        bool_val = True if valor in (True, "True", "true", 1, "1") else False

        # 1. Actualización optimista e inmediata en caché de memoria
        actualizar_campo_en_cache_maestro(id_trabajador, columna, bool_val)

        # Forzar invalidación de los cachés mapeados
        invalidar_cache_personas()

        # 2. Ejecutar escritura en Google Sheets en segundo plano en un hilo independiente
        def task_checklist():
            try:
                documento_bg = abrir_documento(DOCUMENTO)
                hoja_bg = documento_bg.worksheet(HOJA)
                registros_bg = obtener_filas_maestro_personas(forzar_refresco=False) # Usar caché para resolver índices rápido
                fila_idx_bg = None
                for idx_bg, r_bg in enumerate(registros_bg):
                    if str(r_bg.get("ID_Trabajador", "")).strip() == str(id_trabajador).strip():
                        act_val = str(r_bg.get("ACTIVO", "")).strip().upper()
                        fin_val = str(r_bg.get("FINALIZADO", "")).strip().upper()
                        if act_val == "SÍ" or fin_val not in ("SÍ", "SI"):
                            fila_idx_bg = idx_bg + 2
                            break
                        if fila_idx_bg is None:
                            fila_idx_bg = idx_bg + 2
                if fila_idx_bg:
                    encabezados_bg = hoja_bg.row_values(1)
                    col_idx_bg = encabezados_bg.index(columna) + 1
                    
                    import gspread
                    from gspread.utils import rowcol_to_a1
                    a1 = rowcol_to_a1(fila_idx_bg, col_idx_bg)
                    body = {
                        "requests": [
                            {
                                "updateCells": {
                                    "range": {
                                        "sheetId": hoja_bg.id,
                                        "startRowIndex": fila_idx_bg - 1,
                                        "endRowIndex": fila_idx_bg,
                                        "startColumnIndex": col_idx_bg - 1,
                                        "endColumnIndex": col_idx_bg
                                    },
                                    "rows": [
                                        {"values": [{"userEnteredValue": {"boolValue": bool_val}}]}
                                    ],
                                    "fields": "userEnteredValue"
                                }
                            }
                        ]
                    }
                    hoja_bg.spreadsheet.batch_update(body)
                    
                    # Refrescar caché del maestro tras escribir y vaciar mapeados
                    obtener_filas_maestro_personas(forzar_refresco=True)
                    invalidar_cache_personas()
            except Exception as e:
                print(f"Background write checklist failed for {id_trabajador}: {e}")

        import threading
        threading.Thread(target=task_checklist, daemon=True).start()

        return {"ok": True}

    except Exception as e:
        return {"ok": False, "error": str(e)}


def actualizar_campo_persona(datos):
    try:
        id_trabajador = datos.get("id")
        campo = datos.get("campo")
        valor = datos.get("valor")

        if not id_trabajador or not campo:
            return {"ok": False, "error": "Faltan campos id o campo"}

        # Si editamos departamento, observaciones, chaleco, hora_entrada o campos actitudinales,
        # guardamos la modificación en la hoja de overrides para no provocar errores en las fórmulas
        if campo in [
            "departamento", "observaciones", "chaleco", "hora_entrada",
            "act_proactividad", "act_autonomia", "act_disposicion",
            "act_respeto", "act_receptividad", "act_uso_pda",
            "resumen_validado"
        ]:
            ok = guardar_override_async(id_trabajador, campo, valor)
            if ok:
                return {"ok": True}
            else:
                return {"ok": False, "error": "No se pudo guardar la modificación (error en la hoja de cálculo)"}

        # Para otros campos como estado o riesgo, escribimos directamente en MAESTRO_PERSONAS
        mapping = {
            "estado": "ESTADO",
            "riesgo": "RIESGO",
            "resumen_analitico": "RESUMEN_ANALITICO",
            "revision_enviada": "REVISION_ENVIADA",
            "whatsapp_anadido": "WHATSAPP_ANADIDO",
            "finalizado": "FINALIZADO",
            "contrato_limitado": "CONTRATO_LIMITADO"
        }

        columna = mapping.get(campo)
        if not columna:
            return {"ok": False, "error": f"Campo no editable o desconocido: {campo}"}

        # 1. Actualización optimista e inmediata en la caché en memoria del maestro
        actualizar_campo_en_cache_maestro(id_trabajador, columna, valor)

        # Invalidar la caché de personas mapeadas para que los cambios se reflejen de inmediato
        invalidar_cache_personas()

        # 2. Ejecutar escritura en Google Sheets en segundo plano
        def task_maestro():
            try:
                documento_bg = abrir_documento(DOCUMENTO)
                hoja_bg = documento_bg.worksheet(HOJA)
                registros_bg = obtener_filas_maestro_personas(forzar_refresco=False) # Usar cache para resolver indices
                fila_idx_bg = None
                for idx_bg, r_bg in enumerate(registros_bg):
                    if str(r_bg.get("ID_Trabajador", "")).strip() == str(id_trabajador).strip():
                        act_val = str(r_bg.get("ACTIVO", "")).strip().upper()
                        fin_val = str(r_bg.get("FINALIZADO", "")).strip().upper()
                        if act_val == "SÍ" or fin_val not in ("SÍ", "SI"):
                            fila_idx_bg = idx_bg + 2
                            break
                        if fila_idx_bg is None:
                            fila_idx_bg = idx_bg + 2
                if fila_idx_bg:
                    encabezados_bg = hoja_bg.row_values(1)
                    try:
                        col_idx_bg = encabezados_bg.index(columna) + 1
                    except ValueError:
                        hoja_bg.add_cols(1)
                        col_idx_bg = len(encabezados_bg) + 1
                        hoja_bg.update_cell(1, col_idx_bg, columna)
                    
                    # 1. Escribir en Google Sheets
                    hoja_bg.update_cell(fila_idx_bg, col_idx_bg, valor)
                    
                    # 2. Forzar recarga del caché del maestro con los nuevos datos actualizados del Sheets
                    obtener_filas_maestro_personas(forzar_refresco=True)
                    
                    # 3. Invalidar la caché de personas mapeadas y del dashboard tras la escritura
                    global _mapped_personas_cache, _mapped_personas_timestamp
                    with _mapped_personas_lock:
                        _mapped_personas_cache.clear()
                        _mapped_personas_timestamp = 0.0
                        
                    try:
                        from app.services import dashboard_service
                        with dashboard_service._cache_lock:
                            dashboard_service._cache_datos = None
                    except Exception:
                        pass
            except Exception as e:
                print(f"Background write cell failed for {id_trabajador} ({campo}): {e}")

        import threading
        threading.Thread(target=task_maestro, daemon=True).start()

        return {"ok": True}

    except Exception as e:
        print(f"Error actualizando campo {campo} para trabajador {id_trabajador}: {e}")
        return {"ok": False, "error": str(e)}



# =====================================================
# HISTÓRICO DE GRAFANA (VERSIÓN FINAL CON TODAS LAS COLUMNAS)
# =====================================================

# =====================================================
# HISTÓRICO DE GRAFANA (CÁLCULO DE PRODUCTIVIDAD BASE 80)
# =====================================================

def obtener_historial_grafana(id_trabajador):
    try:
        documento = abrir_documento(DOCUMENTO)
        hoja = documento.worksheet("SEGUIMIENTO_GRAFANA_HISTORICO")
        
        datos = hoja.get_all_values()
        if not datos:
            return []
            
        headers = [str(h).strip() for h in datos[0]]
        registros = [dict(zip(headers, row)) for row in datos[1:]]

        id_buscado = str(id_trabajador).strip().split('.')[0]

        def limpiar_id(val):
            return str(val).strip().split('.')[0]

        def parse_float(val):
            if val in [None, "", "-"]:
                return 0.0
            try:
                return float(str(val).replace(",", ".").replace("%", "").strip())
            except ValueError:
                return 0.0

        def parse_int(val):
            if val in [None, "", "-"]:
                return 0
            try:
                return int(float(str(val).replace(",", ".").strip()))
            except ValueError:
                return 0

        historial = []
        for r in registros:
            id_registro = limpiar_id(r.get("ID_TRABAJADOR", r.get("Id_Trabajador", "")))

            if id_registro and id_buscado and id_registro == id_buscado:
                lineas_reales = parse_int(r.get("TOTAL_LINEAS", "0"))
                tiempo_horas = parse_float(r.get("TIEMPO_TOTAL", "0"))
                
                # CÁLCULO DE PRODUCTIVIDAD NUEVO: Base 80 líneas por hora
                if tiempo_horas > 0:
                    lineas_esperadas_80 = tiempo_horas * 80
                    prod_real = (lineas_reales / lineas_esperadas_80) * 100
                else:
                    prod_real = 0.0

                # Formateamos el % de Errores (ERROR_PCT_TOTAL)
                err_pct_raw = parse_float(r.get("ERROR_PCT_TOTAL", "0"))
                if err_pct_raw <= 1.0:
                    err_pct_str = f"{round(err_pct_raw * 100, 1)}%"
                else:
                    err_pct_str = f"{round(err_pct_raw, 1)}%"

                historial.append({
                    "fecha": r.get("FECHA", r.get("Fecha", "-")),
                    "lineas": lineas_reales,
                    "horas": round(tiempo_horas, 2),
                    "lineas_hora": round(parse_float(r.get("LINEAS_HORA", "0")), 1),
                    
                    # Enviamos el número flotante de productividad para que JS calcule el color
                    "productividad_num": round(prod_real, 1),
                    "productividad": f"{round(prod_real, 1)}%",
                    
                    "errores_num": parse_int(r.get("TOTAL_ERRORES", "0")),
                    "errores_pct": err_pct_str,
                    
                    "err_nivel": parse_int(r.get("NIVEL_INCORRECTO", "0")),
                    "err_cant": parse_int(r.get("CANTIDAD_INCORRECTA", "0")),
                    "err_salto": parse_int(r.get("SE_HA_SALTADO", "0")),
                    "err_prod": parse_int(r.get("PRODUCTO_EQUIVOCADO", "0")),
                    "err_desorden": parse_int(r.get("DESORDENADO", "0")),
                    "err_etiq": parse_int(r.get("MAL_ETIQUETADO", "0")),
                    "err_maltrato": parse_int(r.get("MALTRATADO", "0")),
                    "err_cambio": parse_int(r.get("NO_HACE_CAMBIO", "0"))
                })
        
        return historial
    
    except Exception as e:
        print(f"❌ Error crítico en historial grafana: {e}")
        return []


# =====================================================
# HISTÓRICO DE OBSERVACIONES (TIMELINE)
# =====================================================

def obtener_observaciones(id_trabajador):
    try:
        documento = abrir_documento(DOCUMENTO)
        hoja = documento.worksheet("OBSERVACIONES")
        
        datos = hoja.get_all_values()
        if not datos or len(datos) <= 1:
            return []
            
        headers = [str(h).strip() for h in datos[0]]
        registros = [dict(zip(headers, row)) for row in datos[1:]]
        
        id_buscado = str(id_trabajador).strip().split('.')[0]
        
        def limpiar_id(val):
            return str(val).strip().split('.')[0]
            
        observaciones = []
        for r in registros:
            id_persona = limpiar_id(r.get("ID_PERSONA", ""))
            if id_persona == id_buscado:
                observaciones.append({
                    "id_observacion": r.get("ID_OBSERVACION", ""),
                    "id_persona": id_persona,
                    "tipo": r.get("TIPO", "General"),
                    "visible_rrhh": r.get("VISIBLE_RRHH", "SÍ"),
                    "fecha_registro": r.get("FECHA_REGISTRO", ""),
                    "autor_id": r.get("AUTOR_ID", ""),
                    "comentario": r.get("COMENTARIO", ""),
                    "creado_por": r.get("CREADO_POR", ""),
                    "fecha_creacion": r.get("FECHA_CREACION", "")
                })
        
        # Ordenamos de más nueva a más vieja
        observaciones.reverse()
        return observaciones
    except Exception as e:
        print(f"❌ Error obteniendo observaciones para {id_trabajador}: {e}")
        return []


def agregar_observacion(id_trabajador, comentario, tipo="General", visible_rrhh="SÍ", autor_id="falbert"):
    try:
        documento = abrir_documento(DOCUMENTO)
        hoja = documento.worksheet("OBSERVACIONES")
        
        # Generar un ID incremental o timestamp
        import time
        obs_id = f"OBS{int(time.time())}"
        
        from datetime import datetime
        now = datetime.now()
        fecha_registro = now.strftime("%d/%m/%Y")
        fecha_creacion = now.strftime("%Y-%m-%d %H:%M:%S")
        
        # Fila a añadir matching headers:
        # ['ID_OBSERVACION', 'ID_PERSONA', 'TIPO', 'VISIBLE_RRHH', 'FECHA_REGISTRO', 'AUTOR_ID', 'COMENTARIO', 'FECHA_CREACION', 'CREADO_POR', 'FECHA_MODIFICACION', 'MODIFICADO_POR']
        nueva_fila = [
            obs_id,
            str(id_trabajador).strip(),
            tipo,
            visible_rrhh,
            fecha_registro,
            autor_id,
            comentario,
            fecha_creacion,
            autor_id,
            "",
            ""
        ]
        
        hoja.append_row(nueva_fila)
        return {"ok": True, "id_observacion": obs_id}
    except Exception as e:
        print(f"❌ Error agregando observación para {id_trabajador}: {e}")
        return {"ok": False, "error": str(e)}


SPREADSHEET_VALORACION_ID = "1-Gnh_9aAoK2-cFspaGqV8gHedcazcoffuBd0pKb1NPU"

def obtener_valoracion_actitudinal(id_trabajador):
    default_valores = {
        "Proactividad": 0,
        "Autonomía": 0,
        "Disposición": 0,
        "Respeto normativo": 0,
        "Receptividad": 0,
        "Uso PDA": 0
    }
    
    try:
        import gspread
        doc = abrir_documento_por_key(SPREADSHEET_VALORACION_ID)
        
        try:
            w = doc.worksheet(str(id_trabajador).strip())
        except gspread.exceptions.WorksheetNotFound:
            # Pestaña no encontrada, se devuelven los valores por defecto
            return {"ok": True, "valores": default_valores, "error_acceso": False, "creado": False}
            
        values = w.get_all_values()
        
        # Buscar "VALORACIÓN ACTITUDINAL"
        header_row = -1
        header_col = -1
        for r_idx, row in enumerate(values):
            for c_idx, cell in enumerate(row):
                if "VALORACIÓN ACTITUDINAL" in str(cell).upper():
                    header_row = r_idx
                    header_col = c_idx
                    break
            if header_row != -1:
                break
                
        # Si no se encuentra el título, usamos las coordenadas por defecto H22 (fila 22, col H)
        if header_row == -1:
            header_row = 21
            header_col = 7
            
        actitudes = default_valores.copy()
        
        # Leemos las 6 celdas bajo el título
        for i in range(2, 8):
            row_idx = header_row + i
            if row_idx < len(values):
                row = values[row_idx]
                if header_col < len(row):
                    name = str(row[header_col]).strip()
                    val_str = ""
                    if header_col + 1 < len(row):
                        val_str = str(row[header_col + 1]).strip()
                        
                    # Mapeamos a las actitudes conocidas
                    for k in actitudes.keys():
                        if k.lower() == name.lower() or name.lower() in k.lower() or k.lower() in name.lower():
                            try:
                                val_num = int(val_str) if val_str else 0
                                actitudes[k] = val_num
                            except ValueError:
                                actitudes[k] = 0
                            break
                            
        return {"ok": True, "valores": actitudes, "error_acceso": False}
        
    except Exception as e:
        logger.error(f"Error al obtener valoración actitudinal para {id_trabajador}: {e}")
        err_msg = str(e) if str(e) else "Error de permisos. Comparta la hoja de cálculo con sgf-enterprise@my-project-81923-501308.iam.gserviceaccount.com como Editor."
        return {"ok": False, "valores": default_valores, "error_acceso": True, "error": err_msg}


def actualizar_valoracion_actitudinal(id_trabajador, actitud, valor, nombre_trabajador=None, depto_trabajador=None):
    try:
        import gspread
        doc = abrir_documento_por_key(SPREADSHEET_VALORACION_ID)
        
        try:
            w = doc.worksheet(str(id_trabajador).strip())
            creada = False
        except gspread.exceptions.WorksheetNotFound:
            # Crear la pestaña si no existe
            w = doc.add_worksheet(title=str(id_trabajador).strip(), rows="100", cols="20")
            creada = True
            
        if creada:
            # Escribir los datos del encabezado de la ficha
            # A1: ID, B1: Nombre, E1: Depto, F1: ID
            w.update_cell(1, 1, str(id_trabajador).strip())
            if nombre_trabajador:
                w.update_cell(1, 2, str(nombre_trabajador).strip())
            if depto_trabajador:
                w.update_cell(1, 5, str(depto_trabajador).strip())
            w.update_cell(1, 6, str(id_trabajador).strip())
            w.update_cell(1, 7, "5") # Días activo por defecto
            
            # Escribir la estructura base de valoración actitudinal en H22 (col 8, fila 22)
            w.update_cell(22, 8, "VALORACIÓN ACTITUDINAL")
            w.update_cell(24, 8, "Proactividad")
            w.update_cell(25, 8, "Autonomía")
            w.update_cell(26, 8, "Disposición")
            w.update_cell(27, 8, "Respeto normativo")
            w.update_cell(28, 8, "Receptividad")
            w.update_cell(29, 8, "Uso PDA")
            
            # Escribir ceros por defecto para los que no se están editando
            for r_idx in range(24, 30):
                w.update_cell(r_idx, 9, "0")
                
        # Buscar la fila de la actitud a actualizar
        values = w.get_all_values()
        header_row = -1
        header_col = -1
        for r_idx, row in enumerate(values):
            for c_idx, cell in enumerate(row):
                if "VALORACIÓN ACTITUDINAL" in str(cell).upper():
                    header_row = r_idx
                    header_col = c_idx
                    break
            if header_row != -1:
                break
                
        if header_row == -1:
            header_row = 21
            header_col = 7
            
        fila_actualizada = False
        for i in range(2, 8):
            row_idx = header_row + i
            if row_idx < len(values):
                row = values[row_idx]
                if header_col < len(row):
                    name = str(row[header_col]).strip()
                    if name.lower() == actitud.lower() or actitud.lower() in name.lower() or name.lower() in actitud.lower():
                        w.update_cell(row_idx + 1, header_col + 2, str(valor))
                        fila_actualizada = True
                        break
                        
        if not fila_actualizada:
            # Si por algún motivo no encontramos la celda de la actitud, la escribimos al final de la lista
            default_map = {
                "proactividad": 24,
                "autonomía": 25,
                "autonomia": 25,
                "disposición": 26,
                "disposicion": 26,
                "respeto normativo": 27,
                "respeto": 27,
                "receptividad": 28,
                "uso pda": 29
            }
            target_row = 24
            for k, r in default_map.items():
                if k in actitud.lower():
                    target_row = r
                    break
            w.update_cell(target_row, 8, actitud)
            w.update_cell(target_row, 9, str(valor))
            
        return {"ok": True}
        
    except Exception as e:
        logger.error(f"Error al guardar valoración actitudinal para {id_trabajador} ({actitud}={valor}): {e}")
        err_msg = str(e) if str(e) else "Error de permisos. Comparta la hoja de cálculo con sgf-enterprise@my-project-81923-501308.iam.gserviceaccount.com como Editor."
        return {"ok": False, "error": err_msg}


# =====================================================
# INTEGRACIÓN HOJA SIMPL (FORMACIÓN SACADORES)
# =====================================================

SPREADSHEET_SACADORES_ID = "19V0hASsS5P34bf1kR893b_uE1bZ2RSePT-QZlO8z2-k"

def obtener_filas_simpl(forzar_refresco=False):
    global _simpl_cache, _simpl_cache_timestamp
    ahora = time.time()
    if not forzar_refresco:
        with _simpl_cache_lock:
            if _simpl_cache is not None and (ahora - _simpl_cache_timestamp) < SIMPL_CACHE_TTL:
                return _simpl_cache

    try:
        from app.services.google_service import abrir_documento_por_key
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        hoja = doc.worksheet("SIMPL")
        filas = hoja.get_all_records()
        with _simpl_cache_lock:
            _simpl_cache = filas
            _simpl_cache_timestamp = ahora
        return filas
    except Exception as e:
        logger.error(f"Error al obtener filas de la hoja SIMPL: {e}")
        with _simpl_cache_lock:
            if _simpl_cache is not None:
                return _simpl_cache
        return []

def actualizar_whatsapp_simpl(id_trabajador, valor_whatsapp):
    """
    valor_whatsapp: "TRUE" o "FALSE"
    """
    try:
        from app.services.google_service import abrir_documento_por_key
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        hoja = doc.worksheet("SIMPL")
        records = hoja.get_all_records()
        
        row_num = None
        for idx, r in enumerate(records):
            if str(r.get("ID", "")).strip() == str(id_trabajador).strip():
                row_num = idx + 2 # row 1 is header
                break
                
        if row_num:
            # Whatsapp column is column 18 in SIMPL
            hoja.update_cell(row_num, 18, valor_whatsapp)
            return {"ok": True}
        else:
            return {"ok": False, "error": f"Trabajador con ID {id_trabajador} no encontrado en la hoja SIMPL."}
    except Exception as e:
        logger.error(f"Error al actualizar Whatsapp en SIMPL para {id_trabajador}: {e}")
        return {"ok": False, "error": str(e)}

def auto_agregar_incorporacion_simpl(p):
    """
    p: dict representing a normalized worker from MAESTRO_PERSONAS
    """
    try:
        from app.services.google_service import abrir_documento_por_key
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        hoja = doc.worksheet("SIMPL")
        
        # Generar código con iniciales del nombre
        nombre_partes = p.get("nombre", "").split()
        codigo = "".join([part[0] for part in nombre_partes if part])[:3].upper()
        
        # Construir fila
        nueva_fila = [
            int(p["id"]) if str(p["id"]).isdigit() else p["id"],                  # ID (col 1)
            f"Datos Empleado {p['id']}",                                         # Salix (col 2)
            codigo,                                                             # Código (col 3)
            p.get("nombre", ""),                                                # Nombre y Apellido (col 4)
            p.get("fecha_texto", ""),                                           # Fecha de alta (col 5)
            "",                                                                 # Experiencia (col 6)
            "",                                                                 # lineas/hora (col 7)
            "",                                                                 # Rendimiento (col 8)
            p.get("departamento", ""),                                          # Dept. y grupo (col 9)
            "Pendiente",                                                        # Cámara (col 10)
            "FALSE",                                                            # Aula S. 0 (col 11)
            "FALSE",                                                            # Aula S. 1 (col 12)
            "FALSE",                                                            # Aula S. 2 (col 13)
            "",                                                                 # Próxima (col 14)
            0,                                                                  # Total form. (col 15)
            1,                                                                  # Contr (col 16)
            "",                                                                 # Teléfono (col 17)
            "FALSE"                                                             # Whatsapp (col 18)
        ]
        
        hoja.append_row(nueva_fila)
        logger.info(f"Auto-agregado trabajador {p.get('nombre')} (ID: {p.get('id')}) a la hoja SIMPL.")
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error al auto-agregar trabajador {p.get('id')} a SIMPL: {e}")
        return {"ok": False, "error": str(e)}


def iniciar_formacion_simpl(id_trabajador):
    try:
        from app.services.google_service import abrir_documento_por_key
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        hoja = doc.worksheet("SIMPL")
        records = hoja.get_all_records()
        
        row_num = None
        for idx, r in enumerate(records):
            if str(r.get("ID", "")).strip() == str(id_trabajador).strip():
                row_num = idx + 2 # row 1 is header
                break
                
        if row_num:
            # Aula S. 0 is column 11 (K) in SIMPL
            hoja.update_cell(row_num, 11, "TRUE")
            logger.info(f"Marcado Aula S. 0 como TRUE para trabajador ID: {id_trabajador}")
            return {"ok": True}
        else:
            return {"ok": False, "error": f"Trabajador con ID {id_trabajador} no encontrado en la hoja SIMPL."}
    except Exception as e:
        logger.error(f"Error al iniciar formación en SIMPL para {id_trabajador}: {e}")
        return {"ok": False, "error": str(e)}


def registrar_formacion_trabajador(datos: dict):
    try:
        from app.services.google_service import abrir_documento_por_key
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        
        # 1. Escribir en la pestaña "Formación"
        try:
            hoja_formacion = doc.worksheet("Formación")
        except Exception:
            hoja_formacion = doc.add_worksheet(title="Formación", rows=1000, cols=20)
            hoja_formacion.append_row(["ID_Trabajador", "Nombre", "Fecha", "Tipo de Formación", "Formador/Tutor", "Duración", "Observaciones"])
            
        id_trabajador = str(datos.get("id", "")).strip()
        nombre = str(datos.get("nombre", "")).strip()
        fecha = str(datos.get("fecha", "")).strip()
        tipo_formacion = str(datos.get("tipo_formacion", "")).strip()
        formador = str(datos.get("formador", "")).strip()
        duracion = str(datos.get("duracion", "")).strip()
        observaciones = str(datos.get("observaciones", "")).strip()
        
        nueva_fila = [id_trabajador, nombre, fecha, tipo_formacion, formador, duracion, observaciones]
        hoja_formacion.append_row(nueva_fila)
        logger.info(f"Registrada fila de formación para {nombre} (ID: {id_trabajador}) en la hoja Formación.")
        
        # 2. Actualizar en "SIMPL"
        hoja_simpl = doc.worksheet("SIMPL")
        records = hoja_simpl.get_all_records()
        
        row_num = None
        for idx, r in enumerate(records):
            if str(r.get("ID", "")).strip() == id_trabajador:
                row_num = idx + 2
                break
                
        if row_num:
            col_idx = None
            val_str = "TRUE"
            
            tipo_norm = tipo_formacion.upper().replace(".", "").replace(" ", "")
            if "AULAS0" in tipo_norm:
                col_idx = 11
            elif "AULAS1" in tipo_norm:
                col_idx = 12
            elif "AULAS2" in tipo_norm:
                col_idx = 13
            elif "CÁMARA" in tipo_norm or "CAMARA" in tipo_norm:
                col_idx = 10
                val_str = "Completado"
                
            if col_idx:
                hoja_simpl.update_cell(row_num, col_idx, val_str)
                logger.info(f"Sincronizado estado {tipo_formacion} como {val_str} en SIMPL fila {row_num}")
                
        invalidar_todas_las_caches()
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error al registrar formación para {datos.get('id')}: {e}")
        return {"ok": False, "error": str(e)}


def obtener_horas_formacion_por_trabajador():
    try:
        from app.services.google_service import abrir_documento_por_key
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        
        # 1. Leer datos de SIMPL (contiene la lista histórica de trabajadores)
        try:
            hoja_simpl = doc.worksheet("SIMPL")
            filas_simpl = hoja_simpl.get_all_records()
        except Exception as e:
            logger.warning(f"No se pudo cargar la hoja SIMPL para horas de formación: {e}")
            filas_simpl = []
            
        # 2. Leer datos de Formación (Log de nuevas clases de la app)
        try:
            hoja_form = doc.worksheet("Formación")
            filas_form = hoja_form.get_all_records()
        except Exception as e:
            logger.warning(f"No se pudo cargar la hoja Formación para horas de formación: {e}")
            filas_form = []
            
        horas_simpl = {}
        for f in filas_simpl:
            w_id = str(f.get("ID", "")).strip()
            if not w_id:
                continue
                
            # Cámara (Col 10 / "Cámara")
            camara_val = str(f.get("Cámara", "")).strip().upper()
            camara_mins = 0
            if camara_val and camara_val not in ("PENDIENTE", "NO", "FALSE", ""):
                try:
                    if ":" in camara_val:
                        parts = camara_val.split(":")
                        camara_mins = int(parts[0]) * 60 + int(parts[1])
                    else:
                        camara_mins = int(float(camara_val) * 60)
                except Exception:
                    # Fallback si pone "Completado" u otro texto no numérico
                    camara_mins = 60
                    
            # Aula (S.0, S.1, S.2) -> 60 mins cada una si están marcadas como completadas
            aula_mins = 0
            for col in ["Aula S. 0", "Aula S. 1", "Aula S. 2"]:
                val = str(f.get(col, "")).strip().upper()
                if val in ("TRUE", "SÍ", "SI", "1", "OK", "HECHO", "COMPLETADO"):
                    aula_mins += 60
                    
            horas_simpl[w_id] = {"aula": aula_mins, "camara": camara_mins}
            
        horas_form = {}
        for f in filas_form:
            w_id = str(f.get("ID_Trabajador", "")).strip()
            if not w_id:
                continue
                
            tipo = str(f.get("Tipo de Formación", "")).upper()
            duracion_str = str(f.get("Duración", "0:00")).strip()
            
            mins = 0
            try:
                if ":" in duracion_str:
                    parts = duracion_str.split(":")
                    mins = int(parts[0]) * 60 + int(parts[1])
                else:
                    mins = int(float(duracion_str) * 60)
            except Exception:
                pass
                
            if w_id not in horas_form:
                horas_form[w_id] = {"aula": 0, "camara": 0}
                
            if "CÁMARA" in tipo or "CAMARA" in tipo:
                horas_form[w_id]["camara"] += mins
            else:
                horas_form[w_id]["aula"] += mins
                
        # Combinar usando el valor máximo para evitar duplicaciones
        res = {}
        all_ids = set(horas_simpl.keys()) | set(horas_form.keys())
        for w_id in all_ids:
            s_data = horas_simpl.get(w_id, {"aula": 0, "camara": 0})
            f_data = horas_form.get(w_id, {"aula": 0, "camara": 0})
            
            a_m = max(s_data["aula"], f_data["aula"])
            c_m = max(s_data["camara"], f_data["camara"])
            
            res[w_id] = {
                "aula": f"{a_m // 60}:{a_m % 60:02d}",
                "camara": f"{c_m // 60}:{c_m % 60:02d}"
            }
        return res
    except Exception as e:
        logger.error(f"Error en obtener_horas_formacion_por_trabajador: {e}")
        return {}


# =====================================================
# SINCRONIZACIÓN DE BAJAS DE SALIX
# =====================================================

_last_salix_sync_time = 0.0
_salix_sync_lock = threading.Lock()

def sincronizar_bajas_salix(forzar_refresco=False):
    global _last_salix_sync_time
    ahora = time.time()
    
    # Solo ejecutar una vez cada 24 horas (86400 segundos) a menos que se fuerce
    if not forzar_refresco and (ahora - _last_salix_sync_time) < 86400:
        logger.info("Sync de bajas no requerido (ejecutado en las últimas 24h)")
        return {"ok": True, "msg": "Sync no requerido (ejecutado en las últimas 24h)"}
        
    with _salix_sync_lock:
        # Volver a verificar después de adquirir el lock
        if not forzar_refresco and (ahora - _last_salix_sync_time) < 86400:
            return {"ok": True, "msg": "Sync no requerido"}
            
        try:
            logger.info("Iniciando revisión diaria de bajas en Salix...")
            
            filas = obtener_filas_maestro_personas(forzar_refresco=True)
            active_workers = []
            
            for f in filas:
                id_val = str(f.get("ID_Trabajador", "")).strip()
                nombre_val = str(f.get("NOMBRE_COMPLETO", "")).strip()
                estado_val = str(f.get("ESTADO", "")).strip().upper()
                finalizado_val = str(f.get("FINALIZADO", "")).strip().upper()
                
                if not id_val or id_val.startswith("#") or not nombre_val:
                    continue
                    
                # Nos interesan personas que no estén expresamente dadas de baja en el ERP
                if estado_val not in ("FINALIZADO", "BAJA", "TERMINADO", "NO APTO") and finalizado_val not in ("SÍ", "SI", "TRUE"):
                    active_workers.append(id_val)
                    
            if not active_workers:
                _last_salix_sync_time = ahora
                logger.info("Sincronizador Salix: no hay trabajadores activos que comprobar.")
                return {"ok": True, "msg": "No hay trabajadores activos que comprobar."}
                
            from app.services.grafana.client import GrafanaClient
            from app.services.grafana.config import GRAFANA_URL
            
            client = GrafanaClient(base_url=GRAFANA_URL)
            sql = f"""
                SELECT 
                    w.id AS id_trabajador,
                    d.name AS departamento_salix
                FROM worker w
                LEFT JOIN business b ON b.workerFk = w.id 
                    AND b.started <= NOW() 
                    AND (b.ended IS NULL OR b.ended >= NOW())
                LEFT JOIN department d ON d.id = b.departmentFk
                WHERE w.id IN ({','.join(active_workers)})
            """
            
            payload = [{
                "refId": "A",
                "datasource": {"uid": "000000003"},
                "rawSql": sql,
                "format": "table"
            }]
            
            res = client.query_datasource(payload)
            frames = res.get("results", {}).get("A", {}).get("frames", [])
            
            salix_active = {}
            if frames:
                data = frames[0].get("data", {})
                values = data.get("values", [])
                if values and len(values) >= 2:
                    ids = values[0]
                    depts = values[1]
                    for i in range(len(ids)):
                        w_id = str(ids[i])
                        dept = depts[i]
                        salix_active[w_id] = dept
            
            if not salix_active:
                logger.warning("Sincronizador Salix: la consulta de departamentos en Salix no devolvió resultados. Abortando sincronización para evitar falsos positivos.")
                return {"ok": False, "error": "La consulta de Salix no devolvió datos de trabajadores activos. Abortando sync."}
            
            # Detectar quiénes han salido o no tienen departamento activo
            bajas_detectadas = []
            for w_id in active_workers:
                dept = salix_active.get(w_id)
                es_baja = (w_id not in salix_active) or (dept is None) or (str(dept).strip() == "") or ("baja" in str(dept).lower())
                
                if es_baja:
                    bajas_detectadas.append(w_id)
                    logger.info(f"Sincronizador Salix: detectada BAJA de trabajador ID {w_id} (Dpt Salix: {dept})")
                    
                    # Actualizar a FINALIZADO=SÍ y ESTADO=Terminado en Google Sheets
                    actualizar_campo_persona({"id": w_id, "campo": "finalizado", "valor": "SÍ"})
                    actualizar_campo_persona({"id": w_id, "campo": "estado", "valor": "Terminado"})
                    actualizar_campo_persona({"id": w_id, "campo": "riesgo", "valor": "-"})
                else:
                    # Sincronizar departamento si ha cambiado en Salix
                    f_row = next((row for row in filas if str(row.get("ID_Trabajador", "")).strip() == w_id), None)
                    if f_row:
                        dept_mae = str(f_row.get("DEPARTAMENTO_ORIGEN", "")).strip()
                        dept_salix = str(dept).strip()
                        if dept_salix and dept_salix != dept_mae:
                            logger.info(f"Sincronizador Salix: detectado cambio de departamento para ID {w_id}: {dept_mae} -> {dept_salix}")
                            actualizar_campo_persona({"id": w_id, "campo": "departamento", "valor": dept_salix})
            
            _last_salix_sync_time = ahora
            return {
                "ok": True, 
                "msg": f"Sincronización completada. Procesados {len(active_workers)} trabajadores. Bajas detectadas y procesadas: {len(bajas_detectadas)}.",
                "bajas": bajas_detectadas
            }
            
        except Exception as e:
            logger.error(f"Error durante la sincronización de bajas de Salix: {e}")
            return {"ok": False, "error": str(e)}


def obtener_ultimas_observaciones_globales(limit=15):
    """
    Obtiene las últimas observaciones registradas globalmente en el sistema para todos los trabajadores.
    """
    try:
        documento = abrir_documento(DOCUMENTO)
        hoja = documento.worksheet("OBSERVACIONES")
        
        datos = hoja.get_all_values()
        if not datos or len(datos) <= 1:
            return []
            
        headers = [str(h).strip() for h in datos[0]]
        registros = [dict(zip(headers, row)) for row in datos[1:]]
        
        # Mapear ID de trabajador a Nombre Completo
        try:
            from app.services.persona_service import obtener_filas_maestro_personas
            filas_personas = obtener_filas_maestro_personas()
            nombres_map = {
                str(p.get("ID_Trabajador", "")).strip().split('.')[0]: str(p.get("NOMBRE_COMPLETO", "")).strip() 
                for p in filas_personas if p.get("ID_Trabajador")
            }
        except Exception:
            nombres_map = {}
            
        def limpiar_id(val):
            return str(val).strip().split('.')[0]
            
        observaciones = []
        for r in registros:
            id_persona = limpiar_id(r.get("ID_PERSONA", ""))
            comentario = r.get("COMENTARIO", "").strip()
            if not comentario or not id_persona:
                continue
                
            observaciones.append({
                "id_observacion": r.get("ID_OBSERVACION", ""),
                "id_persona": id_persona,
                "nombre_persona": nombres_map.get(id_persona, f"Empleado {id_persona}"),
                "tipo": r.get("TIPO", "General"),
                "fecha_registro": r.get("FECHA_REGISTRO", ""),
                "autor_id": r.get("AUTOR_ID", ""),
                "comentario": comentario,
                "creado_por": r.get("CREADO_POR", ""),
                "fecha_creacion": r.get("FECHA_CREACION", "")
            })
            
        # Ordenar por más recientes (las últimas filas en Sheets son las más recientes)
        observaciones.reverse()
        return observaciones[:limit]
    except Exception as e:
        logger.error(f"Error obteniendo observaciones globales para dashboard: {e}")
        return []