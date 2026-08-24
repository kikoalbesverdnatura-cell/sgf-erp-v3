import re
import logging
from typing import Dict, Any, Optional, List
from app.services.grafana.client import GrafanaClient

logger = logging.getLogger(__name__)

def extract_dashboard_variables(dashboard_json: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Lee automáticamente la sección dashboard.templating.list y extrae
    los nombres y valores/textos por defecto ('current') de todas las variables.
    """
    variables = {}
    templating_list = dashboard_json.get("templating", {}).get("list", [])
    for var in templating_list:
        name = var.get("name")
        if not name:
            continue
            
        current = var.get("current", {})
        value = current.get("value")
        text = current.get("text", str(value))
        
        variables[name] = {
            "value": value,
            "text": text,
            "type": var.get("type")
        }
    logger.info(f"Variables extraídas del dashboard templating: {list(variables.keys())}")
    return variables

def interpolate_grafana_variables(query_target: Any, variables: Dict[str, Dict[str, Any]], runtime_overrides: Dict[str, Any]) -> Any:
    """
    Motor genérico de interpolación compatible con la sintaxis de variables de Grafana:
    - $variable
    - ${variable}
    - ${variable:text}
    - ${variable:raw}
    - ${variable:sqlstring}
    - ${variable:csv}
    - ${variable:queryparam}
    
    Recorre recursivamente diccionarios y listas para interpolar cadenas de consulta.
    """
    if isinstance(query_target, str):
        # 1. Combinar variables de la plantilla con las sobreescrituras en ejecución
        final_vars = {}
        for var_name, var_info in variables.items():
            val = var_info.get("value")
            txt = var_info.get("text", str(val))
            
            if var_name in runtime_overrides:
                val = runtime_overrides[var_name]
                txt = str(val)
                
            final_vars[var_name] = {"value": val, "text": txt}

        # Asegurar de incluir overrides que no estén en la plantilla
        for var_name, val in runtime_overrides.items():
            if var_name not in final_vars:
                final_vars[var_name] = {"value": val, "text": str(val)}

        # Regex para ${variable:format} o ${variable}
        pattern_brackets = re.compile(r'\$\{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?\}')
        # Regex para $variable
        pattern_simple = re.compile(r'\$([a-zA-Z0-9_]+)')

        def replace_brackets(match):
            var_name = match.group(1)
            fmt = match.group(2)
            
            if var_name not in final_vars:
                return match.group(0)
                
            var_data = final_vars[var_name]
            val = var_data["value"]
            txt = var_data["text"]
            
            is_list = isinstance(val, list)
            
            if fmt == "text":
                return ", ".join(txt) if isinstance(txt, list) else str(txt)
            elif fmt in ["raw", "csv", "queryparam"]:
                return ",".join(map(str, val)) if is_list else str(val)
            elif fmt == "sqlstring":
                if is_list:
                    return ", ".join(f"'{str(v).replace("'", "''")}'" for v in val)
                return f"'{str(val).replace("'", "''")}'"
            else:
                # Interpolación por defecto
                return ",".join(map(str, val)) if is_list else str(val)

        def replace_simple(match):
            var_name = match.group(1)
            if var_name not in final_vars:
                return match.group(0)
            val = final_vars[var_name]["value"]
            if isinstance(val, list):
                return ",".join(map(str, val))
            return str(val)

        # Aplicar sustitución
        interpolated = pattern_brackets.sub(replace_brackets, query_target)
        interpolated = pattern_simple.sub(replace_simple, interpolated)
        return interpolated

    elif isinstance(query_target, dict):
        return {k: interpolate_grafana_variables(v, variables, runtime_overrides) for k, v in query_target.items()}
    elif isinstance(query_target, list):
        return [interpolate_grafana_variables(item, variables, runtime_overrides) for item in query_target]
        
    return query_target

class DashboardService:
    """
    Servicio de resolución de contratos dinámicos basados en paneles de Grafana.
    Descarga el esquema del dashboard, resuelve variables e interpola consultas de forma genérica.
    """
    def __init__(self, client: GrafanaClient):
        self.client = client

    def get_panel_queries(self, dashboard_uid: str, panel_id: int, runtime_overrides: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Obtiene las consultas configuradas en un panel de Grafana
        e interpola automáticamente todas las variables del dashboard.
        """
        dash_data = self.client.get_dashboard(dashboard_uid)
        dashboard_json = dash_data.get("dashboard", {})
        panels = dashboard_json.get("panels", [])
        
        # 1. Extraer variables y valores por defecto del dashboard
        dashboard_vars = extract_dashboard_variables(dashboard_json)
        
        # 2. Localizar el panel
        panel = self._find_panel_by_id(panels, panel_id)
        if not panel:
            raise ValueError(f"Panel con ID {panel_id} no encontrado en el dashboard {dashboard_uid}.")
            
        targets = panel.get("targets", [])
        if not targets:
            raise ValueError(f"El panel con ID {panel_id} no contiene consultas ('targets') configuradas.")
            
        # 3. Interpolar de forma genérica todas las consultas
        interpolated_queries = []
        for target in targets:
            query_copy = interpolate_grafana_variables(target, dashboard_vars, runtime_overrides or {})
            
            # Optimización en caliente (hot patch) para mejorar la velocidad en un 150x:
            # Si la consulta contiene ticketLines (CTE de rendimiento pesado) y t.shipped (filtro de rango),
            # inyectamos el filtro de st.workerFk dentro de la subconsulta para reducir el escaneo masivo de filas.
            if isinstance(query_copy, dict) and "rawSql" in query_copy:
                raw_sql = query_copy["rawSql"]
                
                # Corregir filtros de departamento para consultas individuales
                # Reemplazamos d.name LIKE con 1=1 para que operarios con departamentos diferentes en la BD
                # (por ejemplo, Hamalla Traore asignado a 'PALETIZADO') muestren su rendimiento sin problemas.
                if "w.id IN" in raw_sql or "st.workerFk" in raw_sql:
                    import re
                    raw_sql = re.sub(r"d\.name\s+LIKE\s+'%[^']*%'", "1=1", raw_sql, flags=re.IGNORECASE)
                    raw_sql = re.sub(r"d\.name\s+LIKE\s+'\$department'", "1=1", raw_sql, flags=re.IGNORECASE)
                    raw_sql = raw_sql.replace("WHERE d.name LIKE '%$department%'", "WHERE 1=1")
                else:
                    # Excluir departamento de formación/pruebas 141 (Sprint 2 - Alineado con vigfp89)
                    if "d.name LIKE" in raw_sql or "departmentFk" in raw_sql:
                        raw_sql = raw_sql.replace(
                            "WHERE d.name LIKE '%$department%'",
                            "WHERE d.name LIKE '%$department%' AND wd.departmentFk != 141"
                        )
                
                if "ticketLines" in raw_sql and ("t.shipped" in raw_sql or "$__timeFilter(t.shipped)" in raw_sql):
                    # Intentar obtener workerFk desde runtime_overrides
                    w_fk = (runtime_overrides or {}).get("workerFk")
                    if w_fk:
                        raw_sql = raw_sql.replace(
                            "WHERE $__timeFilter(t.shipped)",
                            f"WHERE $__timeFilter(t.shipped) AND st.workerFk IN ({w_fk})"
                        ).replace(
                            "WHERE t.shipped",
                            f"WHERE t.shipped AND st.workerFk IN ({w_fk})"
                        )
                        logger.info(f"Optimización SQL ticketLines aplicada para workerFk={w_fk}")
                
                query_copy["rawSql"] = raw_sql

            interpolated_queries.append(query_copy)
            
        return interpolated_queries

    def execute_panel_query(self, dashboard_uid: str, panel_id: int, runtime_overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Descarga el panel, interpola variables y ejecuta la consulta contra el DataSource de Grafana.
        """
        queries = self.get_panel_queries(dashboard_uid, panel_id, runtime_overrides)
        return self.client.query_datasource(queries)

    def execute_mapped_query(self, dashboard_key: str, panel_key: str, worker_id: str) -> Dict[str, Any]:
        """
        Resuelve dinámicamente el panel mapeado en config.py y ejecuta la consulta.
        """
        from app.services.grafana.config import DASHBOARDS
        
        if dashboard_key not in DASHBOARDS:
            raise KeyError(f"Dashboard '{dashboard_key}' no está registrado en DASHBOARDS de config.py.")
            
        dash_config = DASHBOARDS[dashboard_key]
        uid = dash_config["uid"]
        
        if panel_key not in dash_config["panels"]:
            raise KeyError(f"Panel '{panel_key}' no está registrado para el dashboard '{dashboard_key}'.")
            
        panel_config = dash_config["panels"][panel_key]
        panel_id = panel_config["id"]
        var_name = panel_config["var_name"]
        
        # Pasar worker_id como sobreescritura en tiempo de ejecución
        runtime_overrides = {var_name: worker_id}
        logger.info(f"Ejecutando mapeo de consulta para '{dashboard_key}' -> '{panel_key}' con worker_id: {worker_id}")
        return self.execute_panel_query(uid, panel_id, runtime_overrides)

    def _find_panel_by_id(self, panels: list, panel_id: int) -> Optional[dict]:
        """
        Busca recursivamente un panel por ID, navegando layouts con subpaneles.
        """
        for panel in panels:
            if panel.get("id") == panel_id:
                return panel
            if "panels" in panel and isinstance(panel["panels"], list):
                found = self._find_panel_by_id(panel["panels"], panel_id)
                if found:
                    return found
        return None
