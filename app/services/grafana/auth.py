import os
import time
import logging
import threading
import requests
from typing import Optional
from app.services.grafana.errors import AuthenticationError

logger = logging.getLogger(__name__)

class GrafanaAuth:
    """
    Clase dedicada a gestionar la autenticación frente a Grafana.
    Mantiene una única sesión persistente y coordina logins seguros usando un thread lock.
    """
    _session: Optional[requests.Session] = None
    _last_auth_time: float = 0.0
    _lock = threading.Lock()

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.username = os.getenv("GRAFANA_USER")
        self.password = os.getenv("GRAFANA_PASSWORD")
        
        # SSL Verification: default to True unless explicitly set to 'false' or '0'
        verify_ssl_env = os.getenv("GRAFANA_VERIFY_SSL", "true").lower()
        self.verify_ssl = verify_ssl_env not in ("false", "0")
        
        # Timeout: default to 10 seconds
        try:
            self.timeout = float(os.getenv("GRAFANA_TIMEOUT", "10.0"))
        except ValueError:
            self.timeout = 10.0

    def get_session(self, force_refresh: bool = False) -> requests.Session:
        """
        Devuelve la sesión HTTP persistente y autenticada de requests.
        Si force_refresh es True, o si no hay sesión inicializada, inicia sesión en Grafana.
        Usa un Lock para evitar que peticiones simultáneas refresquen la sesión al mismo tiempo.
        """
        if not self.username or not self.password:
            # Si no hay credenciales en el entorno, devolvemos una sesión básica (para retrocompatibilidad)
            with GrafanaAuth._lock:
                if GrafanaAuth._session is None:
                    GrafanaAuth._session = requests.Session()
                return GrafanaAuth._session

        # Lock para autenticación concurrente
        with GrafanaAuth._lock:
            now = time.time()
            # Si se solicita force_refresh, solo realizar el login si ha pasado más de 5 segundos
            # desde la última autenticación (evita redundancia ante peticiones concurrentes con 401).
            should_login = (
                GrafanaAuth._session is None or 
                (force_refresh and (now - GrafanaAuth._last_auth_time > 5.0))
            )
            
            if should_login:
                logger.info("Iniciando sesión en Grafana con credenciales...")
                session = requests.Session()
                url = f"{self.base_url}/login"
                payload = {
                    "user": self.username,
                    "password": self.password
                }
                
                try:
                    response = session.post(
                        url,
                        json=payload,
                        timeout=self.timeout,
                        verify=self.verify_ssl
                    )
                    
                    if response.status_code != 200:
                        raise AuthenticationError(
                            f"HTTP {response.status_code}: Respuesta de login fallida."
                        )
                        
                    # Validar explícitamente la presencia de la cookie grafana_session en la sesión
                    if "grafana_session" not in session.cookies:
                        raise AuthenticationError(
                            "La sesión de Grafana no contiene la cookie de autenticación 'grafana_session'."
                        )
                        
                    logger.info("Sesión de Grafana autenticada exitosamente.")
                    GrafanaAuth._session = session
                    GrafanaAuth._last_auth_time = now
                    
                except requests.RequestException as e:
                    logger.error(f"Error de red/conexión durante el login de Grafana: {e}")
                    raise AuthenticationError(f"Error de conexión en login: {e}")
                except AuthenticationError:
                    raise
                except Exception as e:
                    logger.error(f"Error inesperado durante el login de Grafana: {e}")
                    raise AuthenticationError(f"Error inesperado en login: {e}")
                    
            return GrafanaAuth._session
