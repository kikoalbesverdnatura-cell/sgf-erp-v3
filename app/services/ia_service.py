import os
import google.generativeai as genai
from google.oauth2 import service_account
from app.services.persona_service import obtener_persona, actualizar_campo_persona

# Deprecation warning bypass
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)

def configurar_gemini():
    """Configura Gemini usando API Key de .env o Service Account Credentials."""
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
        return
        
    # Si no hay API Key, intentamos con el archivo de credenciales de Google
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    credentials_path = os.path.join(base_dir, "credentials", "google.json")
    if os.path.exists(credentials_path):
        try:
            creds = service_account.Credentials.from_service_account_file(
                credentials_path,
                scopes=["https://www.googleapis.com/auth/generative-language.tuning",
                        "https://www.googleapis.com/auth/cloud-platform"]
            )
            genai.configure(credentials=creds)
        except Exception as e:
            raise RuntimeError(f"Error al configurar Gemini con service account: {e}")
    else:
        raise RuntimeError("No se encontró GEMINI_API_KEY en las variables de entorno ni el archivo credentials/google.json.")

def generar_resumen_trabajador(persona_id: str, cookies: dict = None) -> str:
    """Generar un informe analítico sobre el trabajador usando Gemini y lo guarda en Google Sheets."""
    configurar_gemini()
    
    # Obtener los datos del trabajador
    persona = obtener_persona(persona_id)
    if not persona or "error" in persona:
        raise ValueError(f"No se encontró el trabajador con ID {persona_id}")
        
    try:
        dias_transcurridos = int(persona.get("dias") or 0)
    except Exception:
        dias_transcurridos = 0
    dias_restantes = max(0, 30 - dias_transcurridos)

    # Formatear las valoraciones actitudinales
    try:
        from app.services.persona_service import obtener_valoracion_actitudinal
        res_act = obtener_valoracion_actitudinal(persona_id)
        valores_reales = res_act.get("valores", {}) if res_act.get("ok") else {}
    except Exception:
        valores_reales = {}

    val_act = {
        "Proactividad": valores_reales.get("Proactividad") if valores_reales.get("Proactividad") is not None else persona.get("act_proactividad", 0),
        "Autonomía": valores_reales.get("Autonomía") if valores_reales.get("Autonomía") is not None else persona.get("act_autonomia", 0),
        "Disposición": valores_reales.get("Disposición") if valores_reales.get("Disposición") is not None else persona.get("act_disposicion", 0),
        "Respeto Normativo": valores_reales.get("Respeto normativo") if valores_reales.get("Respeto normativo") is not None else persona.get("act_respeto", 0),
        "Receptividad": valores_reales.get("Receptividad") if valores_reales.get("Receptividad") is not None else persona.get("act_receptividad", 0),
        "Uso PDA": valores_reales.get("Uso PDA") if valores_reales.get("Uso PDA") is not None else persona.get("act_uso_pda", 0)
    }
    
    # Formatear observaciones
    obs_list = persona.get("observaciones", [])
    if isinstance(obs_list, list):
        obs_str = "\n".join([f"- [{o.get('tipo', 'General')}] {o.get('comentario', '')} (por {o.get('autor_id', 'Admin')} el {o.get('fecha', '')})" for o in obs_list])
    else:
        obs_str = str(obs_list)
        
    # 1. Obtener métricas detalladas de Grafana
    grafana_summary = ""
    try:
        from app.services.grafana import GrafanaRepository, WorkerService
        repo = GrafanaRepository()
        service = WorkerService(repo)
        g_data = service.get_worker_metrics(persona_id, cookies or {})
        if g_data and g_data.get("has_data"):
            grafana_summary = f"""
Rendimiento y Productividad Detallada (de Grafana):
- Productividad Real (Prod %): {g_data.get('productivity_pct')}%
- Productividad Ideal (Día 7): {g_data.get('expected_lines')} líneas
- Calidad de Operación (Tasa Error Real): {g_data.get('error_pct')}%
- Volumen Total Producido: {g_data.get('volume')} líneas
- Errores Totales en el Período: {g_data.get('total_errors')}
- Tiempo Efectivo de Trabajo: {g_data.get('effective_time')} horas

Historial Reciente de Turnos (Día a Día):
"""
            history_lines = []
            for turn in g_data.get("history", [])[:10]:
                history_lines.append(
                    f"  * {turn.get('fecha')}: Volumen: {turn.get('lineas')} líneas, Horas: {turn.get('horas')}h, Velocidad: {turn.get('lineas_hora')} l/h, Prod %: {turn.get('productividad')}, Error %: {turn.get('errores_pct')} (Errores: {turn.get('errores_num')})"
                )
            grafana_summary += "\n".join(history_lines) + "\n"
    except Exception as e:
        pass
        
    # 2. Obtener historial de Fichajes y Desviación
    fichajes_summary = ""
    try:
        from app.services.dashboard_service import obtener_fichajes_individuales
        f_data = obtener_fichajes_individuales(persona_id, cookies or {})
        if f_data and f_data.get("ok") and f_data.get("fichajes"):
            fichajes_summary = "\nHistorial Reciente de Fichajes y Desviaciones/Retrasos:\n"
            fichajes_lines = []
            for f in f_data.get("fichajes", [])[:10]:
                desv = f.get('desviacion', '0 min')
                fichajes_lines.append(
                    f"  * {f.get('fecha')}: Entrada: {f.get('entrada') or '-'}, Salida: {f.get('salida') or '-'}, Desviación: {desv}"
                )
            fichajes_summary += "\n".join(fichajes_lines) + "\n"
    except Exception as e:
        pass

    prompt = f"""
Eres un Analista de Rendimiento Operativo Senior especializado en People Analytics y analítica de rendimientos industriales. Tu función es recibir e interpretar gráficos, tablas y métricas de desempeño del personal para generar informes analíticos exhaustivos, objetivos y accionables. Tu objetivo principal es proveer al equipo de Recursos Humanos y Dirección la evidencia basada en datos necesaria para tomar decisiones estratégicas (promociones, capacitaciones, reasignaciones o planes de mejora). Habla claro, sé directo y profesional.

Tus informes van dirigidos a Gerentes de Recursos Humanos, Líderes de Operaciones y Directores.

# ESTÁNDARES Y BENCHMARKS DE REFERENCIA (Verdnatura)
Para emitir valoraciones de APTO o NO APTO, debes contrastar los datos con estas reglas de negocio:
- Productividad Objetivo (Fase 3 - Día 21 en adelante): El rendimiento ideal es alcanzar y sostener 80 líneas/hora (o superior).
- Calidad / Fiabilidad: La tolerancia máxima de errores es de 1.2% de media. Tasas superiores a 1.2% se consideran críticas.
- Progresión: Se espera una curva ascendente. Si el trabajador ha retrocedido de fase (ej. de Libre a Shadow) o está estancado en días avanzados (Días >15 en Shadow o Días >4 en Onboarding), es una alerta crítica.

# DATOS DEL TRABAJADOR A ANALIZAR:
- Nombre del Trabajador: {persona.get('nombre', 'Desconocido')} (ID: {persona.get('id', '')})
- Departamento: {persona.get('departamento', 'No asignado')}
- Programa de formación: {persona.get('programa', 'No asignado')}
- Fecha de Incorporación: {persona.get('fecha_incorporacion', '')}
- Estado del Programa: {persona.get('estado', '')} (Días transcurridos: {dias_transcurridos}, Días restantes: {dias_restantes})
- Nivel de Riesgo: {persona.get('riesgo', '')} (Score de riesgo: {persona.get('riesgo_score', '')})
- Tutor Asignado: {persona.get('tutor', 'Ninguno')}

Métricas de Rendimiento y Productividad:
- Productividad Media: {persona.get('productividad_media', '-')} líneas/hora
- Tasa de error medio: {persona.get('error_medio', '-')}
{grafana_summary}
{fichajes_summary}

Valoración Actitudinal (Calificaciones de 1 a 5 del tutor):
- Proactividad: {val_act['Proactividad']}
- Autonomía: {val_act['Autonomía']}
- Disposición: {val_act['Disposición']}
- Respeto Normativo: {val_act['Respeto Normativo']}
- Receptividad: {val_act['Receptividad']}
- Uso PDA: {val_act['Uso PDA']}

Observaciones Históricas en el Expediente:
{obs_str if obs_str.strip() else "- No hay observaciones en el expediente."}

# INSTRUCCIONES DE REDACCIÓN Y FORMATO
Debes redactar el informe estructurado EXACTAMENTE en las siguientes secciones (utiliza negritas para los títulos en lugar de encabezados grandes):

**1. Resumen Ejecutivo**
- Síntesis de 2-3 oraciones con el hallazgo clave de productividad/error y la recomendación principal.

**2. Conclusiones y Diagnóstico Operativo**
- Explicación cuantitativa y fundamentada en datos de los patrones observados (porcentajes de desviación de meta, evolución de la curva de aprendizaje, estabilidad de errores, comportamiento por ausencias si aplica).

**3. Veredicto de Idoneidad**
Indica de manera rotunda, directa y sin rodeos el veredicto en una sola línea al final:
- VEREDICTO: [APTO / NO APTO] para realizar las funciones de SACADOR de forma autónoma.

# REGLAS Y TONO
- Objetividad absoluta: Evalúa estrictamente los datos. No presupongas actitud, esfuerzo o intención que no esté respaldada por números.
- Rigor analítico: Utiliza siempre porcentajes, variaciones y números reales presentes en los datos.
- Respeto al veredicto: Indica de forma muy directa y sin ambigüedad el veredicto final.
"""
    
    # Generar contenido con Gemini
    model = genai.GenerativeModel("gemini-3.5-flash")
    response = model.generate_content(prompt)
    summary = response.text.strip()
    
    # Guardar en Google Sheets
    actualizar_campo_persona({
        "id": persona_id,
        "campo": "resumen_analitico",
        "valor": summary
    })
    
    return summary
