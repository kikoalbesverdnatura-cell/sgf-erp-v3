import os
import logging
import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

def emitir_alerta_salix(worker_id: str, message: str) -> dict:
    """
    Envía una alerta en vivo a la PDA/terminal del trabajador en Salix.
    """
    # Cargar variables de entorno en caliente desde el .env
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    load_dotenv(dotenv_path=os.path.join(base_dir, ".env"), override=True)
    
    token = os.getenv("SALIX_TOKEN")
    if not token:
        logger.warning("SALIX_TOKEN no configurado en .env.")
        return {"ok": False, "error": "Token de Salix no configurado en el archivo .env"}
        
    try:
        # Asegurarse de que el ID es un entero
        try:
            worker_fk = int(str(worker_id).strip())
        except ValueError:
            return {"ok": False, "error": f"El ID del trabajador '{worker_id}' no es válido para Salix"}
            
        url = f"https://salix.verdnatura.es/api/LiveAlerts/emitAlert?access_token={token}"
        payload = {
            "message": message,
            "userFk": [worker_fk]
        }
        
        logger.info(f"Enviando alerta Salix para ID {worker_fk}...")
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code in (200, 201, 204):
            logger.info("Alerta Salix emitida con éxito.")
            return {"ok": True}
        elif response.status_code == 401:
            logger.error("Error 401 al emitir alerta Salix: Token no autorizado o caducado.")
            return {"ok": False, "error": "Token de Salix no autorizado o caducado (401)"}
        elif response.status_code == 403:
            logger.error("Error 403 al emitir alerta Salix: Acceso prohibido con este token.")
            return {"ok": False, "error": "Token de Salix sin permisos suficientes (403)"}
        else:
            logger.error(f"Error al emitir alerta Salix (HTTP {response.status_code}): {response.text}")
            return {"ok": False, "error": f"Error del servidor Salix (HTTP {response.status_code})"}
            
    except Exception as e:
        logger.error(f"Excepción al emitir alerta Salix: {e}")
        return {"ok": False, "error": f"Error de conexión con Salix: {str(e)}"}
