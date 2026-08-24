import time
from typing import Dict, Any, Tuple, Optional
import threading

class TTLCache:
    """
    Caché en memoria con tiempo de vida (TTL) configurable y thread-safe
    para almacenar los resultados de las consultas de Grafana.
    """
    def __init__(self, ttl_seconds: int):
        self.ttl = ttl_seconds
        self.cache: Dict[str, Tuple[float, Any]] = {}
        self.lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self.lock:
            if key not in self.cache:
                return None
            timestamp, value = self.cache[key]
            # Verificar si ha expirado
            if time.time() - timestamp > self.ttl:
                del self.cache[key]
                return None
            return value

    def set(self, key: str, value: Any):
        with self.lock:
            self.cache[key] = (time.time(), value)

    def clear(self):
        with self.lock:
            self.cache.clear()
