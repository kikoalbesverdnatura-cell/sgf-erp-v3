import logging
import time
import json
import threading
from typing import Dict, Any, Optional
from app.services.grafana.client import GrafanaClient
from app.services.grafana.dashboard import DashboardService
from app.services.grafana.cache import TTLCache
from app.services.grafana.config import DASHBOARDS, CACHE_TTL_SECONDS, GRAFANA_URL

# Obtener logger estructurado para SRE
logger = logging.getLogger("services.grafana.repository")

_shared_cache = None
_shared_cache_lock = threading.Lock()

class GrafanaRepository:
    """
    Repositorio que actúa como abstracción de datos para las consultas a Grafana.
    Gestiona la verificación de caché y escribe logs estructurados de rendimiento y depuración.
    """
    def __init__(self, cache_ttl: int = CACHE_TTL_SECONDS):
        global _shared_cache
        with _shared_cache_lock:
            if _shared_cache is None:
                _shared_cache = TTLCache(cache_ttl)
        self.cache = _shared_cache

    def get_panel_data(self, dashboard_key: str, panel_key: str, variables: Dict[str, str], user_headers: Dict[str, str]) -> Dict[str, Any]:
        """
        Obtiene los datos de un panel específico resolviendo el contrato del dashboard
        de forma dinámica en Grafana. Aplica la caché en memoria si está activa.
        """
        # 1. Validar y resolver claves de configuración
        if dashboard_key not in DASHBOARDS:
            raise KeyError(f"Dashboard '{dashboard_key}' no registrado en config.py.")
            
        dash_config = DASHBOARDS[dashboard_key]
        dashboard_uid = dash_config["uid"]
        
        if panel_key not in dash_config["panels"]:
            raise KeyError(f"Panel '{panel_key}' no registrado para el dashboard '{dashboard_key}'.")
            
        panel_config = dash_config["panels"][panel_key]
        panel_id = panel_config["id"]
        
        # 2. Verificar caché
        cache_key = f"{dashboard_key}:{panel_key}:{json.dumps(variables, sort_keys=True)}"
        cached_result = self.cache.get(cache_key)
        if cached_result is not None:
            logger.info(f"[GRAFANA_CACHE_HIT] Devuelto desde caché: {cache_key}")
            return cached_result
            
        # 3. Inicializar cliente y servicio bajo el contexto de seguridad del usuario
        client = GrafanaClient(base_url=GRAFANA_URL, headers=user_headers)
        dashboard_service = DashboardService(client)
        
        # 4. Consultar y registrar tiempos
        start_time = time.time()
        try:
            # Obtener targets del contrato del panel
            queries = dashboard_service.get_panel_queries(dashboard_uid, panel_id, variables)
            
            # Identificar el DataSource configurado en el primer target
            ds_uid = "N/A"
            if queries and "datasource" in queries[0]:
                ds_uid = queries[0]["datasource"].get("uid", "default")
                
            # Ejecutar consulta REST oficial
            result = client.query_datasource(queries)
            
            elapsed_time = time.time() - start_time
            num_records = 0
            
            # Extraer número de registros del formato oficial de Grafana
            if "results" in result:
                for _, res in result["results"].items():
                    for frame in res.get("frames", []):
                        data = frame.get("data", {})
                        values = data.get("values", [])
                        if values:
                            num_records += len(values[0])
            
            # Log estructurado SRE
            logger.info(
                f"[GRAFANA_SUCCESS] "
                f"Dashboard: {dashboard_key} ({dashboard_uid}) | "
                f"Panel: {panel_key} (ID: {panel_id}) | "
                f"Datasource: {ds_uid} | "
                f"HTTP Code: 200 | "
                f"Response Time: {elapsed_time:.3f}s | "
                f"Records: {num_records}"
            )
            
            # Guardar en caché y retornar
            self.cache.set(cache_key, result)
            return result
            
        except Exception as e:
            elapsed_time = time.time() - start_time
            logger.error(
                f"[GRAFANA_FAILURE] "
                f"Dashboard: {dashboard_key} ({dashboard_uid}) | "
                f"Panel: {panel_key} (ID: {panel_id}) | "
                f"Response Time: {elapsed_time:.3f}s | "
                f"Error: {str(e)}"
            )
            raise
