import logging
import requests
import time
import threading
from typing import Dict, Any, Optional, List
from app.services.grafana.auth import GrafanaAuth
from app.services.grafana.errors import AuthenticationError

logger = logging.getLogger(__name__)

class GrafanaClient:
    """
    Único punto de acceso HTTP a la API REST oficial de Grafana usando requests.Session.
    Delegación de la autenticación a GrafanaAuth y gestión de reintentos sobre errores 401.
    """
    _dashboard_cache = {}
    _cache_lock = threading.Lock()
    CACHE_TTL_SEGUNDOS = 3600  # 1 hora de caché para esquemas de dashboard

    def __init__(self, base_url: str, cookies: Optional[Dict[str, str]] = None, headers: Optional[Dict[str, str]] = None):
        self.base_url = base_url.rstrip("/")
        self.auth = GrafanaAuth(self.base_url)
        
        # Cabeceras por defecto
        self.default_headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        # Propagación de cabeceras/cookies manuales (para compatibilidad con sesión del navegador)
        self.manual_headers = {}
        if headers:
            for k, v in headers.items():
                if k.lower() in ["authorization", "cookie", "x-grafana-org-id"]:
                    self.manual_headers[k] = v
                    
        if cookies:
            cookie_strs = [f"{k}={v}" for k, v in cookies.items()]
            cookie_header = "; ".join(cookie_strs)
            if "Cookie" in self.manual_headers:
                self.manual_headers["Cookie"] = self.manual_headers["Cookie"] + "; " + cookie_header
            else:
                self.manual_headers["Cookie"] = cookie_header

    def _get_request_session(self, force_refresh: bool = False) -> requests.Session:
        """
        Obtiene la sesión de requests desde GrafanaAuth.
        Configura cabeceras y cookies manuales si no hay credenciales de aplicación.
        Si hay credenciales, ignora la sesión del navegador para mantener la independencia.
        """
        session = self.auth.get_session(force_refresh=force_refresh)
        
        if not self.auth.username or not self.auth.password:
            # Sin credenciales: propagar headers/cookies del navegador
            session.headers.update(self.default_headers)
            if self.manual_headers:
                session.headers.update(self.manual_headers)
        else:
            # Con credenciales: usar sesión limpia e independiente de la aplicación
            session.headers.update(self.default_headers)
            # Limpiar cookies del navegador propagadas en headers de sesión si las hubiera
            if "Cookie" in session.headers:
                del session.headers["Cookie"]
                
        return session

    def get_dashboard(self, dashboard_uid: str) -> Dict[str, Any]:
        """
        GET /api/dashboards/uid/{dashboard_uid}
        """
        ahora = time.time()
        with self.__class__._cache_lock:
            if dashboard_uid in self.__class__._dashboard_cache:
                ts, dash_json = self.__class__._dashboard_cache[dashboard_uid]
                if ahora - ts < self.__class__.CACHE_TTL_SEGUNDOS:
                    logger.info(f"Devolviendo esquema del dashboard {dashboard_uid} desde caché de clase...")
                    return dash_json

        url = f"{self.base_url}/api/dashboards/uid/{dashboard_uid}"
        session = self._get_request_session()
        
        try:
            logger.info(f"Obteniendo dashboard {dashboard_uid} de Grafana...")
            response = session.get(
                url,
                timeout=self.auth.timeout,
                verify=self.auth.verify_ssl
            )
            
            # Si responde 401 y tenemos credenciales de aplicación configuradas, reautenticar una vez y reintentar
            if response.status_code == 401 and self.auth.username and self.auth.password:
                logger.warning("Petición GET dashboard falló con 401 (Unauthorized). Intentando reautenticar...")
                session = self._get_request_session(force_refresh=True)
                response = session.get(
                    url,
                    timeout=self.auth.timeout,
                    verify=self.auth.verify_ssl
                )
                
            if response.status_code != 200:
                self._handle_http_response_error(response)
                
            dash_json = response.json()
            with self.__class__._cache_lock:
                self.__class__._dashboard_cache[dashboard_uid] = (ahora, dash_json)
                
            return dash_json
            
        except requests.RequestException as e:
            logger.error(f"Error de conexión solicitando dashboard {dashboard_uid}: {e}")
            raise

    def query_datasource(self, queries: List[Dict[str, Any]], from_time: str = "now-45d", to_time: str = "now") -> Dict[str, Any]:
        """
        POST /api/ds/query
        """
        url = f"{self.base_url}/api/ds/query"
        payload = {
            "queries": queries,
            "from": from_time,
            "to": to_time
        }
        session = self._get_request_session()
        
        try:
            logger.info(f"Ejecutando consultas de datasource en Grafana (total: {len(queries)})...")
            response = session.post(
                url,
                json=payload,
                timeout=self.auth.timeout,
                verify=self.auth.verify_ssl
            )
            
            # Si responde 401 y tenemos credenciales de aplicación configuradas, reautenticar una vez y reintentar
            if response.status_code == 401 and self.auth.username and self.auth.password:
                logger.warning("Petición POST query_datasource falló con 401 (Unauthorized). Intentando reautenticar...")
                session = self._get_request_session(force_refresh=True)
                response = session.post(
                    url,
                    json=payload,
                    timeout=self.auth.timeout,
                    verify=self.auth.verify_ssl
                )
                
            if response.status_code != 200:
                self._handle_http_response_error(response)
                
            return response.json()
            
        except requests.RequestException as e:
            logger.error(f"Error de conexión en consulta de datasource: {e}")
            raise

    def _handle_http_response_error(self, response: requests.Response):
        """
        Propaga excepciones claras según los códigos de estado HTTP de Grafana.
        """
        status_code = response.status_code
        error_body = response.text
        
        if status_code == 401:
            raise PermissionError("Sesión de Grafana no autenticada o expirada. Por favor, inicia sesión.")
        elif status_code == 403:
            raise PermissionError("Acceso denegado: Tu cuenta no tiene permisos para ver este recurso en Grafana.")
        else:
            raise ValueError(f"Error de API Grafana ({status_code}): {error_body}")
