import logging
from datetime import datetime
from typing import Dict, Any, List

from app.services.grafana.repository import GrafanaRepository
from app.services.persona_service import obtener_persona
from app.services.grafana.client import GrafanaClient

logger = logging.getLogger(__name__)

class WorkerService:
    """
    Servicio de negocio para la consulta e integración de las métricas del trabajador en Grafana.
    """
    def __init__(self, repository: GrafanaRepository):
        self.repository = repository

    def obtener_datos_grafana(self, worker_id: str, cookies: Dict[str, str]) -> Dict[str, Any]:
        """
        [Método de Sprint 2 - API Simple] Obtiene métricas básicas de productividad y errores.
        """
        metrics = self.get_worker_metrics(worker_id, cookies)
        return {
            "workerId": metrics["workerId"],
            "productividad": {
                "lineasHora": metrics["lines_hour"],
                "lineasEsperadas": metrics["expected_lines"],
                "porcentaje": metrics["productivity_pct"]
            },
            "errores": {
                "total": metrics["total_errors"],
                "porcentaje": metrics["error_pct"]
            },
            "ultimaActualizacion": metrics["last_updated"]
        }

    def get_worker_metrics(self, worker_id: str, cookies: Dict[str, str]) -> Dict[str, Any]:
        """
        Obtiene las métricas unificadas y el histórico integrado desde la API de Grafana.
        """
        # 1. Validar existencia del trabajador localmente (Sheets)
        persona = obtener_persona(worker_id)
        if not persona or "error" in persona:
            logger.warning(f"Intento de consulta para trabajador inexistente ID: {worker_id}")
            raise ValueError("Trabajador inexistente")

        worker_dept = " ".join(str(persona.get("departamento", "")).split())
        worker_name = persona.get("nombre", "")

        # Formatear cookies de autenticación
        user_headers = {}
        if cookies and "grafana_session" in cookies:
            user_headers["Cookie"] = f"grafana_session={cookies['grafana_session']}"

        # 2. Resolver workerFk de Grafana dinámicamente a partir del nombre/ID de Sheets
        resolved_worker_fk = self._resolve_worker_fk(worker_id, worker_name, cookies)
        logger.info(f"Worker ID {worker_id} ({worker_name}) mapeado a workerFk de Grafana: {resolved_worker_fk}")

        is_encajador = "ENCAJADO" in worker_dept.upper()
        
        if is_encajador:
            sql_productivity = f"""
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
                       DATE(tt.created) as workDate,
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
                  AND tt.userFk = {resolved_worker_fk}
                  AND tt.created >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY tt.ticketFk, tt.userFk, DATE(tt.created)
                HAVING TIME_TO_SEC(diff) < 3600
            ), dailySum AS (
                SELECT 
                    workDate,
                    SUM(totalLines) as totalLines,
                    SUM(TIME_TO_SEC(diff)) as totalSeconds,
                    SUM(volume) as totalVolume,
                    COUNT(DISTINCT ticketFk) as totalTickets
                FROM wData
                GROUP BY workDate
            ), dailyTimeControl AS (
                SELECT 
                    DATE(wj.dated) workDate, 
                    SUM(wj.total) dailyHoursWorked
                FROM workerJourney wj
                WHERE wj.userFk = {resolved_worker_fk}
                  AND wj.dated >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY DATE(wj.dated)
            )
            SELECT 
                UNIX_TIMESTAMP(ds.workDate) * 1000 AS workDate,
                {resolved_worker_fk} AS workerFk,
                '' AS worker,
                (ds.totalSeconds / 3600) AS totalHoursAction,
                IFNULL(dtc.dailyHoursWorked, 0) AS totalHoursJourney,
                ds.totalLines AS totalLines,
                ((ds.totalSeconds / 3600) * 120) AS expectedLines,
                (ds.totalLines / NULLIF(((ds.totalSeconds / 3600) * 120), 0)) AS percentaje,
                IF(IFNULL(dtc.dailyHoursWorked, 0) > 0, ds.totalLines / dtc.dailyHoursWorked, 0) AS linesPerHourJourney,
                IF(IFNULL(dtc.dailyHoursWorked, 0) > 0, ds.totalVolume / dtc.dailyHoursWorked, 0) AS volumePerHourJourney,
                IF(ds.totalSeconds > 0, ds.totalVolume / (ds.totalSeconds / 3600), 0) AS volumePerHourAction,
                IF(ds.totalSeconds > 0, ds.totalLines / (ds.totalSeconds / 3600), 0) AS linesHour,
                ds.totalVolume AS totalVolume,
                0 AS totalPositive,
                0 AS totalNegative,
                0 AS Ratio
            FROM dailySum ds
            LEFT JOIN dailyTimeControl dtc ON dtc.workDate = ds.workDate
            ORDER BY ds.workDate DESC
            """
        else:
            sql_productivity = f"""
WITH timePrep AS (
  WITH collectionTimes AS (
    SELECT tc.collectionFk,
        c.workerFk,
        DATE(st.created) workDate,
        MIN(st.created) timeFrom,
        MAX(st.created) timeTo,
        SUM(mt.code = 'excellentPresentation') totalPositive,
        SUM(mt.code <> 'excellentPresentation') totalNegative,
        SUM(IF(mt.code = 'damaged', 360, 0)) penalizationTime
      FROM saleTracking st FORCE INDEX (saleTracking_idx5)
        JOIN state s ON s.id = st.stateFk
        JOIN sale sa ON sa.id = st.saleFk
        JOIN ticketCollection tc ON tc.ticketFk = sa.ticketFk
        JOIN collection c ON c.id = tc.collectionFk
          AND c.workerFk = st.workerFk
        LEFT JOIN saleMistake sm ON sm.saleFk = sa.id
        LEFT JOIN mistakeType mt ON mt.id = sm.typeFk
      WHERE s.code IN ('PREPARED')
        AND st.created >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND st.workerFk = {resolved_worker_fk}
      GROUP BY tc.collectionFk, c.workerFk, DATE(st.created)
      HAVING timeTo
  ), collectionLines AS (
    WITH ticketLines AS (
      SELECT s.ticketFk,
          COUNT(DISTINCT CASE WHEN sgd.saleFk IS NULL THEN s.id END)
            + COUNT(DISTINCT sgd.saleGroupFk) totalLines,
          SUM(s.volume) volume
        FROM ticket t FORCE INDEX (Fecha)
          JOIN sale s ON s.ticketFk = t.id
          JOIN saleTracking st ON st.saleFk = s.id
            AND st.stateFk = (SELECT id FROM state WHERE code = 'PREPARED')
          LEFT JOIN saleGroupDetail sgd ON sgd.saleFk = s.id
        WHERE t.shipped >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          AND s.quantity > 0
        GROUP BY s.ticketFk
    )
    SELECT tc.collectionFk,
        SUM(tl.totalLines) totalLines,
        SUM(tl.volume) totalVolume
      FROM ticketLines tl
        JOIN ticketCollection tc ON tc.ticketFk = tl.ticketFk
        JOIN collection c ON c.id = tc.collectionFk
      WHERE (
        'All' = 'All'
      )
      GROUP BY tc.collectionFk
  ), collectionSaleGroup AS (
    WITH wDistinctSales AS (
      SELECT st.saleFk,
          sa.volume,
          scsg.sectorCollectionFk,
          sg.userFk,
          MAX(st.created) created
        FROM saleTracking st
          JOIN state s ON s.id = st.stateFk
          STRAIGHT_JOIN sale sa ON sa.id = st.saleFk
          STRAIGHT_JOIN saleGroupDetail sgd ON sgd.saleGroupFk = sa.id
          JOIN saleGroup sg ON sg.id = sgd.saleGroupFk
          JOIN sectorCollectionSaleGroup scsg ON scsg.saleGroupFk = sgd.saleGroupFk
          JOIN ticket t2 ON t2.id = sg.ticketFk
          LEFT JOIN ticketCollection tc ON tc.ticketFk = t2.id
          LEFT JOIN collection c ON c.id = tc.collectionFk
        WHERE s.code IN ('PREVIOUS_PREPARATION')
          AND st.created >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          AND sg.userFk <> c.workerFk
          AND sg.userFk = {resolved_worker_fk}
        GROUP BY st.saleFk
    )
    SELECT sectorCollectionFk,
        userFk workerFk,
        DATE(created) workDate,
        MIN(created) timeFrom,
        MAX(created) timeTo,
        COUNT(DISTINCT saleFk) totalLines,
        SUM(volume) totalVolume
      FROM wDistinctSales
      GROUP BY sectorCollectionFk, DATE(created)
      HAVING timeTo
  ), rawIntervals AS (
    SELECT ct.workerFk,
        ct.workDate,
        ct.timeFrom,
        ct.timeTo,
        cl.totalLines,
        cl.totalVolume,
        ct.totalPositive,
        ct.totalNegative,
        ct.penalizationTime
      FROM collectionTimes ct
        STRAIGHT_JOIN collectionLines cl ON cl.collectionFk = ct.collectionFk
    UNION ALL
    SELECT ct.workerFk,
        ct.workDate,
        ct.timeFrom,
        ct.timeTo,
        ct.totalLines,
        ct.totalVolume,
        NULL,
        NULL,
        NULL
      FROM collectionSaleGroup ct
      WHERE NOT false
  )
  SELECT workerFk,
      workDate,
      SUM(TIME_TO_SEC(TIMEDIFF(timeTo, timeFrom))) + SUM(IFNULL(penalizationTime, 0)) totalTime,
      SUM(totalLines) totalLines,
      SUM(totalVolume) totalVolume,
      MAX(timeTo) lastSeen,
      SUM(totalPositive) totalPositive,
      SUM(totalNegative) totalNegative
    FROM rawIntervals
    GROUP BY workerFk, workDate
), dailyTimeControl AS (
  SELECT wj.userFk, 
      DATE(wj.dated) workDate, 
      SUM(wj.total) dailyHoursWorked
    FROM workerJourney wj
    WHERE wj.dated >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      AND wj.userFk = {resolved_worker_fk}
    GROUP BY wj.userFk, DATE(wj.dated)
), workerMode AS (
  SELECT 
      tp.workDate,
      tp.workerFk,
      CONCAT_WS(' ', w.firstName, w.lastName) worker,
      (tp.totalTime / 3600) totalHoursAction,
      dtc.dailyHoursWorked totalHoursJourney,
      tp.totalLines,
      ((tp.totalTime / 3600) * 80) expectedLines,
      (tp.totalLines / NULLIF(((tp.totalTime / 3600) * 80), 0)) percentaje,
      IF(IFNULL(dtc.dailyHoursWorked, 0) > 0, ROUND(tp.totalLines / dtc.dailyHoursWorked, 1), 0) linesPerHourJourney,
      IF(IFNULL(dtc.dailyHoursWorked, 0) > 0, ROUND(tp.totalVolume / dtc.dailyHoursWorked, 2), 0) volumePerHourJourney,
      IF(tp.totalTime > 0, ROUND(tp.totalVolume / (tp.totalTime / 3600), 2), 0) volumePerHourAction,
      IF(tp.totalTime > 0, ROUND(tp.totalLines / (tp.totalTime / 3600), 1), 0) linesHour,
      tp.totalVolume,
      tp.totalPositive,
      tp.totalNegative,
      totalNegative/totalLines Ratio,
      CASE
        WHEN d.name NOT REGEXP '^SACADO [A-Z] - .+'
        THEN 'EQUIPO REFUERZO'
        ELSE REGEXP_REPLACE(REGEXP_REPLACE(d.name, '^SACADO [A-Z] - ', ''), '[[:space:]][0-9]+$', '')
      END name,
      MAX(eu.email) email
    FROM timePrep tp
      JOIN worker w ON w.id = tp.workerFk
      LEFT JOIN account.emailUser eu ON eu.userFk = tp.workerFk
      LEFT JOIN dailyTimeControl dtc ON dtc.userFk = tp.workerFk AND dtc.workDate = tp.workDate
      LEFT JOIN workerDepartment wd ON wd.workerFk = w.id
      LEFT JOIN department d ON d.id = wd.departmentFk
    WHERE w.id IN({resolved_worker_fk})
    GROUP BY tp.workDate, tp.workerFk, w.firstName, w.lastName, d.name
    HAVING totalHoursAction > 0
)
SELECT *
  FROM workerMode
  ORDER BY workDate DESC, totalLines DESC
"""

        try:
            from concurrent.futures import ThreadPoolExecutor

            def get_productivity():
                client = GrafanaClient(
                    base_url="https://grafana.verdnatura.es",
                    headers=user_headers
                )
                payload = [
                    {
                        "refId": "A",
                        "datasource": {"uid": "000000003"},
                        "rawSql": sql_productivity,
                        "format": "table"
                    }
                ]
                return client.query_datasource(payload)

            def get_mistakes():
                client = GrafanaClient(
                    base_url="https://grafana.verdnatura.es",
                    headers=user_headers
                )
                sql_mistakes = f"""
                    SELECT 
                        DATE(sm.created) AS fecha,
                        SUM(CASE WHEN mt.description = 'Nivel Incorrecto' THEN 1 ELSE 0 END) AS err_nivel,
                        SUM(CASE WHEN mt.description = 'Cantidad incorrecta' THEN 1 ELSE 0 END) AS err_cant,
                        SUM(CASE WHEN mt.description = 'Se ha saltado la linea' THEN 1 ELSE 0 END) AS err_salto,
                        SUM(CASE WHEN mt.description = 'Producto equivocado' THEN 1 ELSE 0 END) AS err_prod,
                        SUM(CASE WHEN mt.description = 'Desordenado' THEN 1 ELSE 0 END) AS err_desorden,
                        SUM(CASE WHEN mt.description = 'Mal etiquetado' THEN 1 ELSE 0 END) AS err_etiq,
                        SUM(CASE WHEN mt.description = 'Maltratado' THEN 1 ELSE 0 END) AS err_maltrato,
                        SUM(CASE WHEN mt.description = 'No hace cambio' THEN 1 ELSE 0 END) AS err_cambio
                    FROM saleMistake sm
                    JOIN mistakeType mt ON mt.id = sm.typeFk
                    JOIN sale s ON s.id = sm.saleFk
                    JOIN saleTracking st ON s.id = st.saleFk
                    JOIN state sta ON sta.id = st.stateFk
                    WHERE st.workerFk = {resolved_worker_fk}
                      AND sta.code IN ('PREPARED', 'PREVIOUS_PREPARATION', 'OK PREVIOUS')
                      AND st.created >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                    GROUP BY DATE(sm.created)
                """
                payload = [
                    {
                        "refId": "A",
                        "datasource": {"uid": "000000003"},
                        "rawSql": sql_mistakes,
                        "format": "table"
                    }
                ]
                return client.query_datasource(payload)

            with ThreadPoolExecutor(max_workers=2) as executor:
                future_prod = executor.submit(get_productivity)
                future_mistakes = executor.submit(get_mistakes)

                res_prod = future_prod.result()
                res_mistakes = {"results": {}}
                try:
                    res_mistakes = future_mistakes.result()
                except Exception as ex:
                    logger.error(f"Error consultando desglose de errores para worker ID {worker_id}: {ex}")

        except PermissionError as e:
            logger.error(f"Error de permisos o autenticación en Grafana para worker ID {worker_id}: {e}")
            raise PermissionError(f"Error de autenticación en Grafana: {e}")
        except Exception as e:
            error_str = str(e)
            logger.error(f"Error consultando paneles de Grafana para worker ID {worker_id}: {error_str}")
            if "status code: 401" in error_str or "unauthorized" in error_str.lower() or "autenticada" in error_str.lower() or "expirada" in error_str.lower():
                raise PermissionError(f"Error de autenticación en Grafana: {error_str}")
            elif "timeout" in error_str.lower() or "timed out" in error_str.lower():
                raise TimeoutError("Timeout en la conexión a Grafana")
            else:
                raise RuntimeError(f"Error del datasource o conexión a Grafana: {error_str}")

        # Parsear dataframes de respuesta
        prod_records = self._parse_grafana_response(res_prod)
        mistake_records = self._parse_grafana_response(res_mistakes)

        # Si el trabajador no tiene ningún registro histórico en Grafana
        if not prod_records:
            return {
                "workerId": str(worker_id),
                "has_data": False,
                "lines_hour": 0.0,
                "expected_lines": 0.0,
                "productivity_pct": 0.0,
                "volume": 0,
                "effective_time": 0.0,
                "total_errors": 0,
                "error_pct": 0.0,
                "total_hours_journey": 0.0,
                "total_volume_m3": 0.0,
                "history": [],
                "last_updated": datetime.now().isoformat()
            }

        # Extraer métricas resumen agregando los registros
        total_lines = sum(int(r.get("totalLines") or 0) for r in prod_records)
        effective_time = sum(float(r.get("totalHoursAction") or 0.0) for r in prod_records)
        total_hours_journey = sum(float(r.get("totalHoursJourney") or 0.0) for r in prod_records)
        expected_lines = sum(float(r.get("expectedLines") or 0.0) for r in prod_records)
        total_volume_m3 = sum(float(r.get("totalVolume") or 0.0) for r in prod_records)
        total_errors = sum(int(r.get("totalNegative") or 0) for r in prod_records)

        lines_hour = total_lines / effective_time if effective_time > 0 else 0.0
        productivity_pct = (total_lines / expected_lines) * 100.0 if expected_lines > 0 else 0.0
        error_pct = (total_errors / total_lines) * 100.0 if total_lines > 0 else 0.0

        # Crear mapeo de desgloses de errores
        mistakes_map = {}
        for m in mistake_records:
            raw_fecha = m.get("fecha")
            if raw_fecha:
                if "T" in str(raw_fecha):
                    raw_fecha = str(raw_fecha).split("T")[0]
                try:
                    dt = datetime.strptime(str(raw_fecha).strip(), "%Y-%m-%d")
                    fecha_key = dt.strftime("%d/%m/%Y")
                    mistakes_map[fecha_key] = m
                except Exception:
                    pass

        # Generar histórico unificado
        unified_history = []
        for r in prod_records:
            raw_wdate = r.get("workDate")
            if not raw_wdate:
                continue
            
            try:
                dt = datetime.fromtimestamp(float(raw_wdate) / 1000.0)
                fecha_str = dt.strftime("%d/%m/%Y")
            except Exception:
                fecha_str = str(raw_wdate)
            
            pct_val = float(r.get("percentaje") or 0.0)
            ratio_val = float(r.get("Ratio") or 0.0)
            
            history_row = {
                "fecha": fecha_str,
                "workDate": r.get("workDate"),
                "departamento": r.get("name") or "EQUIPO REFUERZO",
                "lineas": int(r.get("totalLines") or 0),
                "horas": round(float(r.get("totalHoursAction") or 0.0), 2),
                "horas_jornada": round(float(r.get("totalHoursJourney") or 0.0), 2),
                "lineas_hora": round(float(r.get("linesHour") or 0.0), 1),
                "productividad_num": round(pct_val * 100.0, 1),
                "productividad": f"{round(pct_val * 100.0, 1)}%",
                "volumen": round(float(r.get("totalVolume") or 0.0), 2),
                "volumen_hora": round(float(r.get("volumePerHourAction") or 0.0), 2),
                "lines_jornada_hora": round(float(r.get("linesPerHourJourney") or 0.0), 1),
                "volumen_jornada_hora": round(float(r.get("volumePerHourJourney") or 0.0), 2),
                "errores_num": int(r.get("totalNegative") or 0),
                "errores_pct_num": round(ratio_val * 100.0, 2),
                "errores_pct": f"{round(ratio_val * 100.0, 2)}%",
                
                # Desgloses por defecto
                "err_nivel": 0, "err_cant": 0, "err_salto": 0, "err_prod": 0,
                "err_desorden": 0, "err_etiq": 0, "err_maltrato": 0, "err_cambio": 0
            }

            # Cruzar con desglose de errores
            if fecha_str in mistakes_map:
                m = mistakes_map[fecha_str]
                history_row["err_nivel"] = int(m.get("err_nivel") or 0)
                history_row["err_cant"] = int(m.get("err_cant") or 0)
                history_row["err_salto"] = int(m.get("err_salto") or 0)
                history_row["err_prod"] = int(m.get("err_prod") or 0)
                history_row["err_desorden"] = int(m.get("err_desorden") or 0)
                history_row["err_etiq"] = int(m.get("err_etiq") or 0)
                history_row["err_maltrato"] = int(m.get("err_maltrato") or 0)
                history_row["err_cambio"] = int(m.get("err_cambio") or 0)

            unified_history.append(history_row)

        return {
            "workerId": str(worker_id),
            "has_data": True,
            "lines_hour": round(lines_hour, 1),
            "expected_lines": round(expected_lines, 0),
            "productivity_pct": round(productivity_pct, 1),
            "volume": total_lines,
            "effective_time": round(effective_time, 2),
            "total_errors": total_errors,
            "error_pct": round(error_pct, 2),
            "total_hours_journey": round(total_hours_journey, 2),
            "total_volume_m3": round(total_volume_m3, 2),
            "history": unified_history,
            "last_updated": datetime.now().isoformat()
        }

    def _resolve_worker_fk(self, worker_id: str, worker_name: str, cookies: Dict[str, str]) -> str:
        """
        Resuelve dinámicamente el workerFk (ID de Grafana) a partir del ID_Trabajador o Nombre de Sheets.
        Utiliza la query de la variable templating 'workerFk' del Dashboard.
        """
        cache_key = "worker_mapping_dict"
        mapping = self.repository.cache.get(cache_key)
        
        if not mapping:
            mapping = {}
            try:
                user_headers = {}
                if cookies and "grafana_session" in cookies:
                    user_headers["Cookie"] = f"grafana_session={cookies['grafana_session']}"
                
                # Descargar Dashboard JSON
                client = GrafanaClient(base_url=self.repository.cache.get("GRAFANA_URL") or "https://grafana.verdnatura.es", headers=user_headers)
                dash_data = client.get_dashboard("ec278d81-119f-4e08-8efe-f97efacdb211")
                dashboard_json = dash_data.get("dashboard", {})
                
                # Extraer variable workerFk
                templating = dashboard_json.get("templating", {})
                variables_list = templating.get("list", [])
                
                worker_var = None
                for var in variables_list:
                    if var.get("name") == "workerFk":
                        worker_var = var
                        break
                        
                if worker_var:
                    query_sql = worker_var.get("query")
                    ds = worker_var.get("datasource")
                    ds_uid = ds.get("uid") if isinstance(ds, dict) else "000000003"
                    
                    if isinstance(query_sql, str) and "select" in query_sql.lower():
                        # Ejecutar query contra el datasource
                        payload = [
                            {
                                "refId": "A",
                                "datasource": {"uid": ds_uid},
                                "rawSql": query_sql,
                                "format": "table"
                            }
                        ]
                        res = client.query_datasource(payload)
                        records = self._parse_grafana_response(res)
                        
                        # Mapear nombres a valores
                        for r in records:
                            val = None
                            txt = None
                            for k, v in r.items():
                                if "__value" in k or k.lower() in ("id", "worker_id", "value", "workerfk"):
                                    val = str(v)
                                if "__text" in k or k.lower() in ("name", "nombre", "text", "worker", "nombre_completo"):
                                    txt = str(v).upper().strip()
                                    
                            if not val and len(r) >= 2:
                                keys = list(r.keys())
                                val = str(r[keys[0]])
                                txt = str(r[keys[1]]).upper().strip()
                                
                            if val and txt:
                                mapping[txt] = val
                                
                        # Guardar en caché por 1 hora (3600 segundos)
                        self.repository.cache.set(cache_key, mapping)
            except Exception as e:
                logger.error(f"Error resolviendo mapeo de trabajadores desde Grafana: {e}")
                
        # 1. Búsqueda exacta por ID (valor en el mapping)
        target_id_str = str(worker_id).strip()
        if target_id_str:
            for txt, val in mapping.items():
                if str(val).strip() == target_id_str:
                    return val

        # 2. Búsqueda exacta por nombre
        name_upper = worker_name.upper().strip()
        if name_upper in mapping:
            return mapping[name_upper]
            
        # 3. Búsqueda parcial (difusa) por nombre
        for txt, val in mapping.items():
            if name_upper in txt or txt in name_upper:
                return val
                
        # Fallback por defecto: devolver el ID_Trabajador directamente
        return str(worker_id)

    def _parse_grafana_response(self, response_json: dict) -> list:
        records = []
        results = response_json.get("results", {})
        for ref_id, res in results.items():
            if "error" in res:
                raise RuntimeError(res.get("error"))
                
            frames = res.get("frames", [])
            for frame in frames:
                schema = frame.get("schema", {})
                fields = schema.get("fields", [])
                
                meta = schema.get("meta", {})
                if meta and "error" in meta:
                    raise RuntimeError(meta.get("error"))
                    
                data = frame.get("data", {})
                values = data.get("values", [])
                
                if not fields or not values:
                    continue
                    
                num_rows = len(values[0]) if values else 0
                for i in range(num_rows):
                    row = {}
                    for col_idx, field in enumerate(fields):
                        col_name = field.get("name")
                        if col_idx < len(values):
                            row[col_name] = values[col_idx][i]
                    records.append(row)
        return records

    def _find_float(self, record: dict, patterns: list, default: float = 0.0) -> float:
        for pattern in patterns:
            for k, v in record.items():
                if pattern.lower() in k.lower():
                    if v is None:
                        return default
                    try:
                        if isinstance(v, str):
                            v = v.replace("%", "").strip()
                        return float(v)
                    except ValueError:
                        continue
        return default

    def _extract_errors(self, records: list) -> dict:
        if not records:
            return {"total": 0, "porcentaje": 0.0}
            
        if len(records) == 1:
            row = records[0]
            total = self._find_float(row, ["totalErrors", "total_errors", "errores", "errors", "errorQty", "error_qty", "errorCount"], 0.0)
            pct = self._find_float(row, ["errorPercentage", "error_pct", "percentage", "porcentaje", "pct"], 0.0)
            return {
                "total": int(total),
                "porcentaje": round(pct, 2)
            }
            
        # Agregación para múltiples registros
        total_errors = 0.0
        total_lines = 0.0
        for r in records:
            total_errors += self._find_float(r, ["totalErrors", "total_errors", "errores", "errors", "errorQty", "error_qty", "errorCount"], 0.0)
            total_lines += self._find_float(r, ["totalLines", "total_lines", "lineas", "lines"], 0.0)
            
        pct = (total_errors / total_lines * 100) if total_lines > 0 else 0.0
        return {
            "total": int(total_errors),
            "porcentaje": round(pct, 2)
        }

    def _merge_history(self, prod_records: list, err_records: list, mistake_records: list = None) -> list:
        history_map = {}
        
        # Helper to parse dates/timestamps safely
        def parse_date(fecha):
            if not fecha:
                return None
            fecha_str = str(fecha)
            if fecha_str.isdigit():
                try:
                    val = float(fecha_str)
                    if val > 1e11: # Milliseconds timestamp
                        val /= 1000.0
                    dt = datetime.fromtimestamp(val)
                    return dt.strftime("%d/%m/%Y")
                except Exception:
                    pass
            if "T" in fecha_str:
                fecha_str = fecha_str.split("T")[0]
            
            # Intenta parsear como YYYY-MM-DD
            try:
                dt = datetime.strptime(fecha_str, "%Y-%m-%d")
                return dt.strftime("%d/%m/%Y")
            except ValueError:
                pass
                
            return fecha_str

        # 1. Procesar registros de productividad (Panel 4)
        for r in prod_records:
            fecha = r.get("fecha") or r.get("Fecha") or r.get("time") or r.get("time_bucket")
            fecha_str = parse_date(fecha)
            if not fecha_str:
                continue
            
            lineas = float(r.get("totalLines") or r.get("lineas") or r.get("lines") or 0)
            horas = float(r.get("hoursWorked") or r.get("tiempo_total") or r.get("horas") or r.get("hours") or r.get("tiempo") or 0)
            lineas_hora = float(r.get("linesHour") or r.get("lineas_hora") or r.get("lines_hour") or 0)
            if horas > 0 and lineas_hora == 0:
                lineas_hora = lineas / horas
            prod_pct = float(r.get("daily_percentage") or r.get("percentaje") or r.get("productividad") or r.get("porcentaje") or 0)
            if 0.0 < prod_pct <= 2.0:
                prod_pct *= 100.0
            
            history_map[fecha_str] = {
                "fecha": fecha_str,
                "lineas": int(lineas),
                "horas": round(horas, 2),
                "lineas_hora": round(lineas_hora, 1),
                "productividad_num": round(prod_pct, 1),
                "productividad": f"{round(prod_pct, 1)}%",
                "errores_num": 0,
                "errores_pct": "0.0%",
                
                "err_nivel": 0, "err_cant": 0, "err_salto": 0, "err_prod": 0,
                "err_desorden": 0, "err_etiq": 0, "err_maltrato": 0, "err_cambio": 0
            }
            
        # 2. Procesar y cruzar registros de errores (Panel 5)
        for r in err_records:
            fecha = r.get("fecha") or r.get("Fecha") or r.get("time") or r.get("time_bucket")
            fecha_str = parse_date(fecha)
            if not fecha_str:
                continue
            
            errores = float(r.get("total_errores_dia") or r.get("totalErrors") or r.get("errores") or r.get("errors") or r.get("errorQty") or 0)
            total_lines_dia = float(r.get("total_lineas_dia") or r.get("totalLines") or r.get("lineas") or r.get("lines") or 0)
            err_pct = float(r.get("errorPercentage") or r.get("error_pct") or r.get("percentage") or r.get("porcentaje") or 0)
            if err_pct == 0 and total_lines_dia > 0 and errores > 0:
                err_pct = (errores / total_lines_dia) * 100.0
            
            err_nivel = int(r.get("NIVEL_INCORRECTO", r.get("err_nivel", 0)))
            err_cant = int(r.get("CANTIDAD_INCORRECTA", r.get("err_cant", 0)))
            err_salto = int(r.get("SE_HA_SALTADO", r.get("err_salto", 0)))
            err_prod = int(r.get("PRODUCTO_EQUIVOCADO", r.get("err_prod", 0)))
            err_desorden = int(r.get("DESORDENADO", r.get("err_desorden", 0)))
            err_etiq = int(r.get("MAL_ETIQUETADO", r.get("err_etiq", 0)))
            err_maltrato = int(r.get("MALTRATADO", r.get("err_maltrato", 0)))
            err_cambio = int(r.get("NO_HACE_CAMBIO", r.get("err_cambio", 0)))
            
            if fecha_str in history_map:
                history_map[fecha_str]["errores_num"] = int(errores)
                history_map[fecha_str]["errores_pct"] = f"{round(err_pct, 1)}%"
                history_map[fecha_str]["err_nivel"] = err_nivel
                history_map[fecha_str]["err_cant"] = err_cant
                history_map[fecha_str]["err_salto"] = err_salto
                history_map[fecha_str]["err_prod"] = err_prod
                history_map[fecha_str]["err_desorden"] = err_desorden
                history_map[fecha_str]["err_etiq"] = err_etiq
                history_map[fecha_str]["err_maltrato"] = err_maltrato
                history_map[fecha_str]["err_cambio"] = err_cambio
            else:
                history_map[fecha_str] = {
                    "fecha": fecha_str,
                    "lineas": 0,
                    "horas": 0.0,
                    "lineas_hora": 0.0,
                    "productividad_num": 0.0,
                    "productividad": "0.0%",
                    "errores_num": int(errores),
                    "errores_pct": f"{round(err_pct, 1)}%",
                    
                    "err_nivel": err_nivel, "err_cant": err_cant, "err_salto": err_salto, "err_prod": err_prod,
                    "err_desorden": err_desorden, "err_etiq": err_etiq, "err_maltrato": err_maltrato, "err_cambio": err_cambio
                }

        # 3. Procesar y cruzar desgloses de errores detallados (res_mistakes)
        if mistake_records:
            for r in mistake_records:
                fecha = r.get("fecha") or r.get("Fecha") or r.get("time") or r.get("time_bucket")
                fecha_str = parse_date(fecha)
                if not fecha_str:
                    continue
                
                err_nivel = int(r.get("err_nivel") or r.get("Nivel") or 0)
                err_cant = int(r.get("err_cant") or r.get("Cant.") or 0)
                err_salto = int(r.get("err_salto") or r.get("Salto") or 0)
                err_prod = int(r.get("err_prod") or r.get("Prod.Eq.") or 0)
                err_desorden = int(r.get("err_desorden") or r.get("Desord.") or 0)
                err_etiq = int(r.get("err_etiq") or r.get("M.Etiq.") or 0)
                err_maltrato = int(r.get("err_maltrato") or r.get("Maltrato") or 0)
                err_cambio = int(r.get("err_cambio") or r.get("Cambio") or 0)
                
                if fecha_str in history_map:
                    history_map[fecha_str]["err_nivel"] = err_nivel
                    history_map[fecha_str]["err_cant"] = err_cant
                    history_map[fecha_str]["err_salto"] = err_salto
                    history_map[fecha_str]["err_prod"] = err_prod
                    history_map[fecha_str]["err_desorden"] = err_desorden
                    history_map[fecha_str]["err_etiq"] = err_etiq
                    history_map[fecha_str]["err_maltrato"] = err_maltrato
                    history_map[fecha_str]["err_cambio"] = err_cambio
                else:
                    history_map[fecha_str] = {
                        "fecha": fecha_str,
                        "lineas": 0,
                        "horas": 0.0,
                        "lineas_hora": 0.0,
                        "productividad_num": 0.0,
                        "productividad": "0.0%",
                        "errores_num": err_nivel + err_cant + err_salto + err_prod + err_desorden + err_etiq + err_maltrato + err_cambio,
                        "errores_pct": "0.0%",
                        
                        "err_nivel": err_nivel, "err_cant": err_cant, "err_salto": err_salto, "err_prod": err_prod,
                        "err_desorden": err_desorden, "err_etiq": err_etiq, "err_maltrato": err_maltrato, "err_cambio": err_cambio
                    }

        # 4. Asegurar que el día de hoy aparezca en el historial (si no hay registros aún hoy)
        today_str = datetime.now().strftime("%d/%m/%Y")
        if today_str not in history_map:
            history_map[today_str] = {
                "fecha": today_str,
                "lineas": 0,
                "horas": 0.0,
                "lineas_hora": 0.0,
                "productividad_num": 0.0,
                "productividad": "0.0%",
                "errores_num": 0,
                "errores_pct": "0.0%",
                
                "err_nivel": 0, "err_cant": 0, "err_salto": 0, "err_prod": 0,
                "err_desorden": 0, "err_etiq": 0, "err_maltrato": 0, "err_cambio": 0
            }
                
        return sorted(list(history_map.values()), key=lambda x: datetime.strptime(x["fecha"], "%d/%m/%Y") if "/" in x["fecha"] else datetime.min, reverse=True)
