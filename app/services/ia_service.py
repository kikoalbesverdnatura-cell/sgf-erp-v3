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
        "Rigor y Calidad de Ejecución": valores_reales.get("Rigor y Calidad de Ejecución") if valores_reales.get("Rigor y Calidad de Ejecución") is not None else persona.get("act_respeto", 0),
        "Receptividad al Feedback": valores_reales.get("Receptividad al Feedback") if valores_reales.get("Receptividad al Feedback") is not None else persona.get("act_receptividad", 0),
        "Iniciativa y Ritmo Operativo": valores_reales.get("Iniciativa y Ritmo Operativo") if valores_reales.get("Iniciativa y Ritmo Operativo") is not None else persona.get("act_proactividad", 0),
        "Comprensión y Comunicación (Idioma y Lectura)": valores_reales.get("Comprensión y Comunicación (Idioma y Lectura)") if valores_reales.get("Comprensión y Comunicación (Idioma y Lectura)") is not None else persona.get("act_disposicion", 0),
        "Resolución y Agilidad Numérica (Cálculo Operativo)": valores_reales.get("Resolución y Agilidad Numérica (Cálculo Operativo)") if valores_reales.get("Resolución y Agilidad Numérica (Cálculo Operativo)") is not None else persona.get("act_autonomia", 0),
        "Manejo Técnico de Herramientas (Terminal PDA)": valores_reales.get("Manejo Técnico de Herramientas (Terminal PDA)") if valores_reales.get("Manejo Técnico de Herramientas (Terminal PDA)") is not None else persona.get("act_uso_pda", 0)
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
Eres un Analista de Rendimiento Operativo Senior especializado en People Analytics y analítica de rendimientos industriales. Tu función es recibir e interpretar gráficos, tablas y métricas de desempeño del personal para generar informes analíticos exhaustivos, objetivos y accionables. Tu objetivo principal es proveer al equipo de Recursos Humanos y Dirección la evidencia basada en datos necesaria para tomar decisiones estratégicas. Habla claro, sé directo y profesional.

Tus informes van dirigidos a Gerentes de Recursos Humanos, Líderes de Operaciones y Directores.

# ESTÁNDARES Y BENCHMARKS DE REFERENCIA (Verdnatura)
Para emitir valoraciones y conclusiones, debes contrastar los datos con estas reglas de negocio:
- Productividad Objetivo (Fase 3 - Día 21 en adelante): El rendimiento ideal es alcanzar y sostener 80 líneas/hora (o superior).
- Calidad / Fiabilidad: La tolerancia máxima de errores es de 1.2% de media. Tasas superiores a 1.2% se consideran críticas.

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

Valoración Actitudinal (Calificaciones de 1 a 3 del tutor):
- Rigor y Calidad de Ejecución: {val_act['Rigor y Calidad de Ejecución']}
- Receptividad al Feedback: {val_act['Receptividad al Feedback']}
- Iniciativa y Ritmo Operativo: {val_act['Iniciativa y Ritmo Operativo']}
- Comprensión y Comunicación (Idioma y Lectura): {val_act['Comprensión y Comunicación (Idioma y Lectura)']}
- Resolución y Agilidad Numérica (Cálculo Operativo): {val_act['Resolución y Agilidad Numérica (Cálculo Operativo)']}
- Manejo Técnico de Herramientas (Terminal PDA): {val_act['Manejo Técnico de Herramientas (Terminal PDA)']}

Observaciones Históricas en el Expediente:
{obs_str if obs_str.strip() else "- No hay observaciones en el expediente."}

# INSTRUCCIONES DE ESTRUCTURA Y FORMATO EXACTO
Debes redactar el informe estructurado EXACTAMENTE de la siguiente forma (sin agregar títulos extras, ni usar marcadores Markdown de encabezados grandes como #, ##, ###. Usa sólo las negritas que se especifican a continuación):

ESTADO GENERAL DEL PERIODO DE PRUEBA
⚠️ Conclusión: Riesgo [Bajo/Medio/Alto] | Nota Global: [Nota]/10 (breve frase descriptiva de 4-7 palabras)
[Párrafo único de 4-6 líneas: Resumen ejecutivo del estado del trabajador. Menciona SIEMPRE de forma explícita el nombre completo del trabajador ({persona.get('nombre', 'Desconocido')}) y su ID ({persona.get('id', '')}) al inicio del párrafo (ej: "El trabajador {persona.get('nombre', 'Desconocido')} (ID: {persona.get('id', '')}) presenta..."). Analiza su desempeño general de forma objetiva, evaluando la velocidad, la precisión, los fichajes y su actitud. Justifica la nota asignada sobre 10 de manera realista: si tiene buena velocidad, pocos errores y buena actitud, una nota alta (8-10); si tiene fallos graves, impuntualidad o mala actitud, una nota baja (1-4).]

GRUPO 1: RENDIMIENTO Y PRODUCCIÓN
• Velocidad de Sacado: [Describir la velocidad media acumulada actual y su aprovechamiento frente al objetivo de 80 l/h. Indicar la tendencia general diaria y si ha superado el estándar en turnos específicos.]
• Calidad y Tasa de Errores: [Detallar la tasa de error medio actual, la cantidad de incidencias cometidas y si supera o se mantiene dentro del límite de calidad del 1.2%.]
• Productividad y Volumen: [Mencionar el volumen total de líneas procesadas y horas efectivas reportadas en el periodo.]

GRUPO 2: COMPETENCIAS, CONDUCTA Y SEGUIMIENTO
• Conducta y Competencias (Evaluación 360): [Analizar las notas actitudinales del tutor. Destacar fortalezas (aquellas puntuadas con 2 o 3, como Rigor, Receptividad, etc.) y áreas de mejora (aquellas puntuadas con 1).]
• Puntualidad y Fichajes: [Mencionar si hay impuntualidad, retrasos o desviaciones en la entrada/salida a partir del historial de fichajes proporcionado.]
• Formación y Seguimiento: [Resumir la formación teórica/práctica recibida, comentarios/observaciones en el expediente e intervenciones registradas.]

# REGLAS CRÍTICAS
- Utiliza únicamente los datos proporcionados.
- Menciona SIEMPRE el nombre del trabajador ({persona.get('nombre', 'Desconocido')}) en el informe.
- Respeta de forma exacta los títulos de sección en mayúsculas, saltos de línea, viñetas de puntos (•) y emojis especificados.
- No uses negrita para las viñetas ni texto extra. Sigue el estilo del ejemplo al pie de la letra.
"""
    
    # Generar contenido con Gemini
    model = genai.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content(prompt)
    summary = response.text.strip()
    
    # Guardar en Google Sheets
    actualizar_campo_persona({
        "id": persona_id,
        "campo": "resumen_analitico",
        "valor": summary
    })
    
    return summary
