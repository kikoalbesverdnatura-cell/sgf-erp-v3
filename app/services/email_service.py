import os
import smtplib
import base64
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any, Optional, List

class SafeSMTP(smtplib.SMTP):
    """
    Subclase de SMTP defensiva que codifica la respuesta de autenticación en UTF-8 o Latin-1
    en lugar de ASCII si el usuario o contraseña contienen caracteres especiales.
    """
    def auth(self, mechanism, authobject, *, initial_response_ok=True):
        mechanism = mechanism.upper()
        initial_response = (authobject() if initial_response_ok else None)
        if initial_response is not None:
            try:
                encoded = initial_response.encode('utf-8')
            except UnicodeEncodeError:
                try:
                    encoded = initial_response.encode('latin-1')
                except UnicodeEncodeError:
                    encoded = initial_response.encode('ascii')
            response = smtplib.encode_base64(encoded, eol='')
            (code, resp) = self.docmd("AUTH", mechanism + " " + response)
            self._auth_challenge_count = 1
        else:
            (code, resp) = self.docmd("AUTH", mechanism)
            self._auth_challenge_count = 0
            
        while code == 334:
            self._auth_challenge_count += 1
            challenge = base64.decodebytes(resp)
            response_str = authobject(challenge)
            try:
                encoded = response_str.encode('utf-8')
            except UnicodeEncodeError:
                try:
                    encoded = response_str.encode('latin-1')
                except UnicodeEncodeError:
                    encoded = response_str.encode('ascii')
            response = smtplib.encode_base64(encoded, eol='')
            (code, resp) = self.docmd(response)
            if self._auth_challenge_count > smtplib._MAXCHALLENGE:
                raise smtplib.SMTPException(
                    "Server AUTH mechanism infinite loop. Last response: "
                    + repr((code, resp))
                )
        if code in (235, 503):
            return (code, resp)
        raise smtplib.SMTPAuthenticationError(code, resp)

logger = logging.getLogger("services.email_service")

# SMTP Configuration (from .env or defaults)
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
try:
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
except ValueError:
    SMTP_PORT = 587
SMTP_USER = os.getenv("SMTP_USER", "formacion.verdnatura@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "formacion.verdnatura@gmail.com")
SMTP_TO = os.getenv("SMTP_TO", "alvaromt@verdnatura.es,jfrau@verdnatura.es,josefrau30@gmail.com") # Default recipients

def formatear_resumen_analitico_email(text: str, persona: Dict[str, Any], grafana_data: Optional[Dict[str, Any]] = None) -> str:
    if not text or text == "Todavía no generado.":
        return "<p style='color:#999; font-style:italic; font-size:0.92em; margin:0;'>Todavía no generado.</p>"
        
    lines = text.split("\n")
    
    html = ""
    conclusion_header = ""
    conclusion_paragraphs = []
    grupo1_lines = []
    grupo2_lines = []
    current_section = "general"
    
    for line in lines:
        trimmed = line.strip()
        if not trimmed:
            continue
            
        lower = trimmed.lower()
        if "estado general del periodo de prueba" in lower:
            current_section = "general"
            continue
        elif "grupo 1:" in lower or ("grupo 1" in lower and "rendimiento" in lower):
            current_section = "g1"
            continue
        elif "grupo 2:" in lower or ("grupo 2" in lower and "competencia" in lower):
            current_section = "g2"
            continue
            
        if current_section == "general":
            if "⚠️" in trimmed or "conclusión:" in lower or "conclusion:" in lower:
                conclusion_header = trimmed
            else:
                conclusion_paragraphs.append(trimmed)
        elif current_section == "g1":
            grupo1_lines.append(trimmed)
        elif current_section == "g2":
            grupo2_lines.append(trimmed)
            
    # 1. Cabecera principal
    html += '<h4 style="font-size: 1.1em; font-weight: 800; color: #2b6cb0; margin-top: 5px; margin-bottom: 8px; text-transform: uppercase; font-family: inherit;">ESTADO GENERAL DEL PERIODO DE PRUEBA</h4>'
    
    # 2. Recuadro de Conclusión y Nota
    if conclusion_header:
        color = "#b7791f"  # amarillo/naranja por defecto
        bg_color = "#fefcbf"
        border_color = "#fbd38d"
        
        lower_h = conclusion_header.lower()
        if "alto" in lower_h:
            color = "#c53030"  # rojo
            bg_color = "#fff5f5"
            border_color = "#feb2b2"
        elif "bajo" in lower_h:
            color = "#2f855a"  # verde
            bg_color = "#f0fff4"
            border_color = "#9ae6b4"
            
        import re
        nota_match = re.search(r'nota\s+global:\s*([\d.,]+)\s*\/\s*10', conclusion_header, re.IGNORECASE)
        nota_html = ""
        if nota_match and nota_match.group(1):
            nota = nota_match.group(1)
            badge_bg = "#edf2f7"
            badge_color = "#4a5568"
            try:
                nota_num = float(nota.replace(",", "."))
                if nota_num >= 8:
                    badge_bg = "#c6f6d5"
                    badge_color = "#22543d"
                elif nota_num >= 5:
                    badge_bg = "#feebc8"
                    badge_color = "#744210"
                else:
                    badge_bg = "#fed7d7"
                    badge_color = "#742a2a"
            except ValueError:
                pass
            nota_html = f'<span style="background: {badge_bg}; color: {badge_color}; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.85em; display: inline-block; vertical-align: middle;">Nota: {nota}/10</span>'
            
        clean_title = re.sub(r'\s*\|\s*nota\s+global:\s*[\d.,]+\s*\/\s*10', '', conclusion_header, flags=re.IGNORECASE).strip()
        clean_title = clean_title.replace("⚠️", "").replace("**", "").strip()
            
        html += f"""
        <div style="background: {bg_color}; border: 1px solid {border_color}; border-left: 5px solid {color}; padding: 14px 16px; border-radius: 8px; margin-top: 10px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); font-family: inherit;">
            <div style="display: flex; align-items: center; justify-content: flex-start; flex-wrap: wrap; gap: 12px; width: 100%; border-bottom: 1px solid {border_color}; padding-bottom: 6px; margin-bottom: 8px;">
                <h5 style="margin: 0; font-size: 1.05em; font-weight: 800; color: {color}; font-family: inherit; display: inline-block; vertical-align: middle;">
                    ⚠️ {clean_title}
                </h5>
                {nota_html}
            </div>
        """
        for line in conclusion_paragraphs:
            clean = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', line)
            html += f'<p style="margin: 0; font-size: 0.95em; color: #4a5568; line-height: 1.5; text-align: justify; font-family: inherit;">{clean}</p>'
        html += "</div>"
        
    # Helper to render lines
    def render_grupo_lines(sec_lines):
        import re
        s_html = ""
        for line in sec_lines:
            trimmed_line = line.strip()
            if trimmed_line.startswith("*") or trimmed_line.startswith("•") or trimmed_line.startswith("-"):
                clean = trimmed_line[1:].strip()
                clean = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', clean)
                
                if ":" in clean:
                    parts = clean.split(":", 1)
                    label = parts[0].strip()
                    desc = parts[1].strip()
                    clean = f"<strong>{label}:</strong> {desc}"
                    
                s_html += f"""
                <div style="margin-left: 5px; margin-bottom: 8px; font-size: 0.92em; color: #4a5568; line-height: 1.45; display: flex; align-items: flex-start; gap: 6px;">
                    <span style="color:#2b6cb0; font-size: 1.1em; line-height: 1.1;">•</span>
                    <span>{clean}</span>
                </div>
                """
            else:
                clean = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', trimmed_line)
                s_html += f'<p style="margin-top: 6px; margin-bottom: 10px; font-size: 0.92em; color: #4a5568; line-height: 1.45; text-align: justify; font-family: inherit;">{clean}</p>'
        return s_html

    # Grupo 1
    html += """
    <div style="margin-top: 15px; margin-bottom: 15px; border: 1px solid #edf2ee; border-radius: 8px; padding: 12px; background: #fafcfa;">
        <h4 style="font-size: 0.95em; font-weight: 800; color: #173D2D; margin-top: 0; margin-bottom: 10px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; text-transform: uppercase;">
            📊 Grupo 1: Rendimiento y Producción
        </h4>
    """
    if grupo1_lines:
        html += render_grupo_lines(grupo1_lines)
    else:
        html += '<p style="font-size:0.9em; color:#718096; font-style:italic; margin:0;">Sin datos de producción registrados.</p>'
    html += "</div>"
    
    # Grupo 2
    html += """
    <div style="margin-top: 15px; margin-bottom: 15px; border: 1px solid #edf2ee; border-radius: 8px; padding: 12px; background: #fafcfa;">
        <h4 style="font-size: 0.95em; font-weight: 800; color: #173D2D; margin-top: 0; margin-bottom: 10px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; text-transform: uppercase;">
            🛠️ Grupo 2: Competencias, Conducta y Seguimiento
        </h4>
    """
    if grupo2_lines:
        html += render_grupo_lines(grupo2_lines)
    else:
        html += '<p style="font-size:0.9em; color:#718096; font-style:italic; margin:0;">Sin registros de seguimiento.</p>'
    html += "</div>"
    
    return html

def enviar_correo_revision_18_21(
    persona: Dict[str, Any], 
    grafana: Optional[Dict[str, Any]] = None,
    fichajes: Optional[List[Dict[str, Any]]] = None,
    formacion: Optional[Dict[str, Any]] = None,
    observaciones_timeline: Optional[List[Dict[str, Any]]] = None
) -> bool:
    """
    Construye y envía un correo HTML con el informe analítico de 18-21 días del trabajador.
    """
    # Cargar variables de entorno en caliente desde el .env
    from dotenv import load_dotenv
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    load_dotenv(dotenv_path=os.path.join(base_dir, ".env"), override=True)
    
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    try:
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError:
        smtp_port = 587
    smtp_user = os.getenv("SMTP_USER", "formacion.verdnatura@gmail.com")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    smtp_from = os.getenv("SMTP_FROM", "formacion.verdnatura@gmail.com")
    smtp_to = os.getenv("SMTP_TO", "alvaromt@verdnatura.es,jfrau@verdnatura.es,josefrau30@gmail.com")

    nombre = persona.get("nombre", "Trabajador")
    p_id = persona.get("id", "N/A")
    dept = persona.get("departamento", "No asignado")
    programa = persona.get("programa", "No definido")
    fecha_inc = persona.get("fecha_incorporacion") or persona.get("fecha_texto") or "No disponible"
    dias = persona.get("dias", 21)
    tutor = persona.get("tutor", "Sin tutor")
    estado = persona.get("estado", "Activo")
    
    # KPIs de Grafana
    prod_media = persona.get("productividad_media") or "-"
    err_medio = persona.get("error_medio") or "-"
    
    if isinstance(grafana, dict) and grafana.get("has_data"):
        prod_media = grafana.get("productivity_pct") or prod_media
        err_medio = grafana.get("error_pct") or err_medio
        
    # Formatear Checklist
    def icon_check(val):
        # Valida si el check es "SÍ", True, o 1
        if str(val).upper().strip() in ("SÍ", "SI", "TRUE", "1", "OK"):
            return "🟢 Completado"
        return "🔴 Pendiente"
        
    checklist_html = f"""
    <ul style="list-style: none; padding-left: 0; margin: 0; line-height: 1.6;">
        <li><strong>RRHH:</strong> {icon_check(persona.get("rrhh"))}</li>
        <li><strong>Almuerzo:</strong> {icon_check(persona.get("almuerzo"))}</li>
        <li><strong>Uniforme:</strong> {icon_check(persona.get("uniforme"))}</li>
        <li><strong>Psicotécnico:</strong> {icon_check(persona.get("psicotecnico"))}</li>
        <li><strong>Formación Bienvenida:</strong> {icon_check(persona.get("formacion"))}</li>
        <li><strong>Tour Empresa:</strong> {icon_check(persona.get("tour"))}</li>
        <li><strong>PDA Entregada:</strong> {icon_check(persona.get("pda"))}</li>
    </ul>
    """
    
    # Formatear Actitud
    actitud_html = f"""
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <tr style="background-color: #f7fafc;">
            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #edf2f7; font-size: 0.9em;">Indicador</th>
            <th style="text-align: center; padding: 8px; border-bottom: 1px solid #edf2f7; font-size: 0.9em; width: 80px;">Puntuación</th>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold; color: #1a202c;">Bloque 1: Evaluación Actitudinal</td>
            <td style="text-align: center; padding: 8px; border-bottom: 1px solid #edf2f7;"></td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #edf2f7; padding-left: 20px;">Rigor y Calidad de Ejecución</td>
            <td style="text-align: center; padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">{persona.get("act_respeto") or "-"}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #edf2f7; padding-left: 20px;">Receptividad al Feedback</td>
            <td style="text-align: center; padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">{persona.get("act_receptividad") or "-"}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #edf2f7; padding-left: 20px;">Iniciativa y Ritmo Operativo</td>
            <td style="text-align: center; padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">{persona.get("act_proactividad") or "-"}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold; color: #1a202c;">Bloque 2: Evaluación Aptitudinal</td>
            <td style="text-align: center; padding: 8px; border-bottom: 1px solid #edf2f7;"></td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #edf2f7; padding-left: 20px;">Comprensión y Comunicación (Idioma y Lectura)</td>
            <td style="text-align: center; padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">{persona.get("act_disposicion") or "-"}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #edf2f7; padding-left: 20px;">Resolución y Agilidad Numérica (Cálculo)</td>
            <td style="text-align: center; padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">{persona.get("act_autonomia") or "-"}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #edf2f7; padding-left: 20px;">Manejo Técnico de Herramientas (PDA)</td>
            <td style="text-align: center; padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">{persona.get("act_uso_pda") or "-"}</td>
        </tr>
    </table>
    """
    
    # Formatear Observaciones
    observaciones = persona.get("observaciones", "").strip()
    obs_html = f"<p style='color: #4a5568; font-style: italic;'>{observaciones}</p>" if observaciones else "<p style='color: #a0aec0;'>Sin observaciones registradas.</p>"
    
    # Formatear Resumen IA
    resumen_ia = persona.get("resumen_analitico", "").strip()
    resumen_ia_html = formatear_resumen_analitico_email(resumen_ia, persona, grafana)

    # HTML Completo (diseño premium y responsivo)
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Informe de Evolución - {nombre}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7fafc; margin: 0; padding: 20px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden;">
            <!-- Cabecera -->
            <tr>
                <td style="background-color: #173D2D; padding: 24px; text-align: center; color: #ffffff;">
                    <h1 style="margin: 0; font-size: 1.4em; font-weight: 700; letter-spacing: 0.5px;">INFORME DE EVOLUCIÓN (DÍA {dias})</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 0.9em;">Revisión de período de prueba - SGF Enterprise</p>
                </td>
            </tr>
            <!-- Contenido -->
            <tr>
                <td style="padding: 24px;">
                    <!-- Bloque Info General -->
                    <table width="100%" style="margin-bottom: 20px; border-bottom: 1px solid #edf2f7; padding-bottom: 15px;">
                        <tr>
                            <td style="padding-bottom: 8px;"><strong>Colaborador:</strong> {nombre} (ID: {p_id})</td>
                        </tr>
                        <tr>
                            <td style="padding-bottom: 8px;"><strong>Departamento:</strong> {dept}</td>
                        </tr>
                        <tr>
                            <td style="padding-bottom: 8px;"><strong>Programa:</strong> {programa}</td>
                        </tr>
                        <tr>
                            <td style="padding-bottom: 8px;"><strong>Fecha Incorporación:</strong> {fecha_inc}</td>
                        </tr>
                        <tr>
                            <td style="padding-bottom: 8px;"><strong>Tutor/Formador:</strong> {tutor}</td>
                        </tr>
                        <tr>
                            <td style="padding-bottom: 8px; color: #e53e3e;"><strong>Días de Seguimiento:</strong> {dias} días (Quedan {30 - dias} días de período de prueba)</td>
                        </tr>
                    </table>

                    <!-- Sección Checklist Onboarding -->
                    <h2 style="font-size: 1.1em; color: #173D2D; margin-top: 20px; margin-bottom: 10px; border-bottom: 2px solid #edf2f7; padding-bottom: 4px;">📋 Progreso de Onboarding</h2>
                    {checklist_html}

                    <!-- Sección Rendimiento Grafana -->
                    <h2 style="font-size: 1.1em; color: #173D2D; margin-top: 25px; margin-bottom: 10px; border-bottom: 2px solid #edf2f7; padding-bottom: 4px;">📈 Rendimiento en Grafana</h2>
                    <table width="100%" style="margin-bottom: 20px;">
                        <tr>
                            <td style="width: 50%; padding: 10px; background-color: #f7fafc; border-radius: 6px; text-align: center; border: 1px solid #edf2f7;">
                                <div style="font-size: 0.85em; color: #718096;">Productividad Media</div>
                                <div style="font-size: 1.4em; font-weight: bold; color: #2d3748; margin-top: 4px;">{prod_media}</div>
                            </td>
                            <td style="width: 50%; padding: 10px; background-color: #f7fafc; border-radius: 6px; text-align: center; border: 1px solid #edf2f7; margin-left: 10px;">
                                <div style="font-size: 0.85em; color: #718096;">Error Medio</div>
                                <div style="font-size: 1.4em; font-weight: bold; color: #e53e3e; margin-top: 4px;">{err_medio}</div>
                            </td>
                        </tr>
                    </table>

                    <!-- Sección Valoración Actitudinal -->
                    <h2 style="font-size: 1.1em; color: #173D2D; margin-top: 25px; margin-bottom: 10px; border-bottom: 2px solid #edf2f7; padding-bottom: 4px;">🧠 Valoración Actitudinal</h2>
                    {actitud_html}

                    <!-- Sección Resumen IA -->
                    <h2 style="font-size: 1.1em; color: #173D2D; margin-top: 25px; margin-bottom: 10px; border-bottom: 2px solid #edf2f7; padding-bottom: 4px;">🤖 Resumen Analítico de IA</h2>
                    {resumen_ia_html}

                    <!-- Sección Observaciones -->
                    <h2 style="font-size: 1.1em; color: #173D2D; margin-top: 25px; margin-bottom: 10px; border-bottom: 2px solid #edf2f7; padding-bottom: 4px;">✍️ Observaciones de Formación</h2>
                    {obs_html}
                </td>
            </tr>
            <!-- Pie de página -->
            <tr>
                <td style="background-color: #edf2f7; padding: 15px; text-align: center; font-size: 0.78em; color: #718096; border-top: 1px solid #e2e8f0;">
                    Este correo contiene información confidencial de uso exclusivo de VerdNatura. Generado automáticamente por SGF Enterprise.
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    # Compilar el adjunto completo e interactivo a partir de expediente_imprimible.html
    # Los estilos del semáforo se resuelven más abajo una vez que se calculan los KPIs reales e ideales
    
    # 2. Curva ideal lookup
    MODELO_IDEAL = [
        {"day": 1, "prod": 64.3, "error": 1.4},
        {"day": 2, "prod": 72.5, "error": 1.5},
        {"day": 3, "prod": 90.0, "error": 1.3},
        {"day": 4, "prod": 87.7, "error": 1.8},
        {"day": 5, "prod": 97.4, "error": 0.8},
        {"day": 6, "prod": 99.9, "error": 1.2},
        {"day": 7, "prod": 103.5, "error": 1.7},
        {"day": 8, "prod": 105.5, "error": 1.5},
        {"day": 9, "prod": 107.5, "error": 1.4},
        {"day": 10, "prod": 109.5, "error": 1.3},
        {"day": 11, "prod": 111.2, "error": 1.2},
        {"day": 12, "prod": 112.8, "error": 1.1},
        {"day": 13, "prod": 114.2, "error": 1.0},
        {"day": 14, "prod": 115.5, "error": 0.9},
        {"day": 15, "prod": 116.6, "error": 0.8},
        {"day": 16, "prod": 117.5, "error": 0.7},
        {"day": 17, "prod": 118.2, "error": 0.6},
        {"day": 18, "prod": 118.8, "error": 0.5},
        {"day": 19, "prod": 119.3, "error": 0.5},
        {"day": 20, "prod": 119.6, "error": 0.5},
        {"day": 21, "prod": 119.8, "error": 0.5},
        {"day": 22, "prod": 119.9, "error": 0.5},
        {"day": 23, "prod": 120.0, "error": 0.5},
        {"day": 24, "prod": 120.0, "error": 0.5},
        {"day": 25, "prod": 120.0, "error": 0.5},
        {"day": 26, "prod": 120.0, "error": 0.5},
        {"day": 27, "prod": 120.0, "error": 0.5},
        {"day": 28, "prod": 120.0, "error": 0.5},
        {"day": 29, "prod": 120.0, "error": 0.5},
        {"day": 30, "prod": 120.0, "error": 0.5},
        {"day": 31, "prod": 120.0, "error": 0.5}
    ]
    
    def get_ideal_para_dia(day):
        if day <= 0:
            return {"prod": 64.3, "error": 1.4}
        idx = min(day, len(MODELO_IDEAL)) - 1
        return MODELO_IDEAL[idx]
        
    day_val = 21
    try:
        day_val = int(persona.get("dias") or 21)
    except Exception:
        pass
        
    ideal_vals = get_ideal_para_dia(day_val)
    
    # 3. KPIs del informe
    prod_real_pct = 0.0
    error_real_pct = 0.0
    volumen_lines = 0
    expected_lines = 0
    errores_totales = 0
    
    if isinstance(grafana, dict) and grafana.get("has_data"):
        prod_real_pct = grafana.get("productivity_pct") or 0.0
        error_real_pct = grafana.get("error_pct") or 0.0
        volumen_lines = grafana.get("volume") or 0
        expected_lines = grafana.get("expected_lines") or 0
        errores_totales = grafana.get("total_errors") or 0
    else:
        try:
            prod_real_pct = float(str(persona.get("productividad_media") or 0.0).replace("%", "").strip())
        except ValueError:
            pass
        try:
            error_real_pct = float(str(persona.get("error_medio") or 0.0).replace("%", "").strip())
        except ValueError:
            pass
            
    prod_diff = round(prod_real_pct - ideal_vals["prod"], 1)
    error_diff = round(error_real_pct - ideal_vals["error"], 2)
    
    from datetime import datetime
    last_updated_str = datetime.now().strftime("%d/%m/%Y %H:%M")
    
    kpis_dict = {
        "prod_real": prod_real_pct,
        "prod_ideal": ideal_vals["prod"],
        "prod_diff": prod_diff,
        "volumen": volumen_lines,
        "esperadas": int(expected_lines),
        "error_real": error_real_pct,
        "error_ideal": ideal_vals["error"],
        "error_diff": error_diff,
        "errores_totales": errores_totales,
        "last_updated": last_updated_str
    }
    
    # Determinar semáforo de alerta (idéntico a la lógica de expediente.js)
    riesgo_val = str(persona.get("riesgo") or "").upper().strip()
    
    diff_prod = prod_real_pct - ideal_vals["prod"]
    diff_error = error_real_pct - ideal_vals["error"]
    
    badge = ""
    if "ALTO" in riesgo_val:
        badge = "ROJO"
    elif "MEDIO" in riesgo_val:
        badge = "AMARILLO"
    elif "BAJO" in riesgo_val:
        badge = "VERDE"
    else:
        # Fallback al cálculo dinámico por diferencias
        if diff_prod < -15 or diff_error > 1.0:
            badge = "ROJO"
        elif diff_prod >= 0 and diff_error <= 0:
            badge = "VERDE"
        else:
            badge = "AMARILLO"

    # Configurar estilos por código de color
    if badge == "ROJO":
        alerta_bg = "#fdf2f2"
        alerta_border = "#f5c6cb"
        alerta_text = "#721c24"
        alerta_badge = "#c0392b"
        alerta_title = "CÓDIGO ROJO / Rendimiento Crítico"
        alerta_desc = "Rendimiento crítico. La productividad está significativamente por debajo del modelo ideal o la tasa de errores excede la tolerancia esperada."
    elif badge == "VERDE":
        alerta_bg = "#f0fff4"
        alerta_border = "#9ae6b4"
        alerta_text = "#2f855a"
        alerta_badge = "#2f855a"
        alerta_title = "CÓDIGO VERDE / Rendimiento Óptimo"
        alerta_desc = "Rendimiento óptimo. El colaborador iguala o supera los objetivos comparativos tanto en productividad como en calidad de operación."
    else:  # AMARILLO
        alerta_bg = "#fffaf0"
        alerta_border = "#fbd38d"
        alerta_text = "#c05621"
        alerta_badge = "#c05621"
        alerta_title = "CÓDIGO AMARILLO / Rendimiento Justo"
        alerta_desc = "Rendimiento justo. El desempeño se encuentra en el rango aceptable próximo al modelo ideal, pero requiere seguimiento de áreas específicas."
        
    alerta_dict = {
        "bg": alerta_bg,
        "border": alerta_border,
        "text": alerta_text,
        "badge": alerta_badge,
        "title": alerta_title,
        "desc": alerta_desc
    }
    
    # 4. Historial
    history_list = []
    if isinstance(grafana, dict) and grafana.get("history"):
        history_list = grafana.get("history")
        
    import json
    history_json_str = json.dumps(history_list)
    
    # 5. Renderizar
    html_attachment_content = html_body
    try:
        from jinja2 import Environment, FileSystemLoader
        base_dir_app = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        jinja_env = Environment(loader=FileSystemLoader(os.path.join(base_dir_app, "app", "templates")))
        template = jinja_env.get_template("expediente_imprimible.html")
        
        html_attachment_content = template.render(
            persona=persona,
            alerta=alerta_dict,
            resumen_ia_formatted=resumen_ia_html,
            kpis=kpis_dict,
            history=history_list,
            history_json=history_json_str,
            formacion=formacion or {"clases": [], "horas_camara": "0h 0m", "horas_aula": "0h 0m", "total_horas": "0h 0m"},
            observaciones_timeline=observaciones_timeline or [],
            fichajes=fichajes or []
        )
    except Exception as render_err:
        logger.error(f"Error rendering printable template: {render_err}")

    # Validar si tenemos credenciales SMTP configuradas
    if not smtp_user or not smtp_password:
        logger.warning("SMTP_USER o SMTP_PASSWORD no configurados en .env. Se realizará un simulacro de envío.")
        
        # Escribir el HTML generado en el directorio de logs/scratch para que se pueda comprobar visualmente
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        scratch_dir = os.path.join(base_dir, "scratch")
        if not os.path.exists(scratch_dir):
            os.makedirs(scratch_dir)
            
        test_file = os.path.join(scratch_dir, f"revision_enviada_{p_id}.html")
        try:
            with open(test_file, "w", encoding="utf-8") as f:
                f.write(html_attachment_content)
            logger.info(f"Informe de simulación guardado con éxito en: {test_file}")
            print(f"SIMULATION_MAIL_SAVED==={test_file}")
        except Exception as e:
            logger.error(f"Error escribiendo archivo de simulación: {e}")
            
        return True # Retorna True para que se marque en el Sheets y la UI funcione
        
    # Enviar correo real por SMTP
    try:
        logger.info(f"Iniciando envío de correo de revisión para {nombre} ({p_id})...")
        msg = MIMEMultipart("mixed")
        msg["Subject"] = nombre
        msg["From"] = smtp_from
        
        # Parsear destinatarios robustamente (comas o punto y coma)
        recipients = [r.strip() for r in smtp_to.replace(";", ",").split(",") if r.strip()]
        msg["To"] = ", ".join(recipients)
        
        # 1. Cuerpo del mensaje (corto y limpio)
        body_text = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
            <p>Buenos días,</p>
            <p>Adjuntamos el <strong>Informe de evolución</strong> del trabajador <strong>{nombre}</strong> (ID: {p_id}) correspondiente a la revisión del período de prueba.</p>
            <p>Un saludo,</p>
            <p>SGF Enterprise</p>
        </body>
        </html>
        """
        msg.attach(MIMEText(body_text, "html", "utf-8"))
        
        # 2. Adjuntar el informe HTML
        filename = f"Informe_Evolucion_{nombre.replace(' ', '_')}_{p_id}.html"
        attachment = MIMEText(html_attachment_content, "html", "utf-8")
        attachment.add_header('Content-Disposition', 'attachment', filename=filename)
        msg.attach(attachment)
        
        server = SafeSMTP(smtp_server, smtp_port, timeout=15)
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg, from_addr=smtp_from, to_addrs=recipients)
        server.quit()
        
        logger.info(f"Correo de revisión enviado con éxito para {nombre} ({p_id}).")
        return True
    except Exception as e:
        logger.error(f"Error de envío de correo SMTP: {e}")
        # En caso de error real de conexión con la clave del servidor, devolvemos la excepción
        raise RuntimeError(f"Error SMTP: {e}")
