import os

# Configuración del servidor de Grafana
GRAFANA_URL = os.getenv("GRAFANA_URL", "https://grafana.verdnatura.es").rstrip("/")

# Tiempo de vida de la caché (en segundos)
CACHE_TTL_SECONDS = int(os.getenv("GRAFANA_CACHE_TTL", "300"))

# Configuración estructurada de Dashboards y Paneles Reales de la API de Grafana
DASHBOARDS = {
    "CONTROL_RENDIMIENTO": {
        "uid": "ec278d81-119f-4e08-8efe-f97efacdb211",
        "panels": {
            "PRODUCTIVIDAD_RESUMEN": {
                "id": 3,
                "var_name": "workerFk"
            },
            "EFICIENCIA_HISTORICA": {
                "id": 4,
                "var_name": "workerFk"
            },
            "LINEAS_Y_ERRORES_DIARIOS": {
                "id": 5,
                "var_name": "workerFk"
            }
        }
    }
}
