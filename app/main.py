import os
from dotenv import load_dotenv
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(dotenv_path=os.path.join(base_dir, ".env"))

# Autoreload triggered by configuration change - Kiko greeting update









from fastapi import FastAPI, Request, Body, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import requests
import os

from app.services.google_service import (
    abrir_documento,
    listar_documentos
)

from app.services.dashboard_service import obtener_dashboard

from app.services.persona_service import (
    obtener_personas,
    obtener_persona,
    guardar_checklist_persona,
    actualizar_campo_persona,
    obtener_observaciones,
    agregar_observacion,
    obtener_valoracion_actitudinal,
    actualizar_valoracion_actitudinal
)

# =====================================================
# IMPORTACIÓN DEL NUEVO SERVICIO DE PLANIFICACIÓN
# =====================================================
from app.services.planificacion_service import (
    obtener_datos_tablero,
    asignar_tutor
)

# =====================================================
# =====================================================
# IMPORTACIÓN DEL NUEVO SERVICIO DE MILI
# =====================================================
from app.services.mili_service import (
    obtener_mili_eventos,
    programar_mili_evento,
    actualizar_mili_evento
)

# =====================================================
# IMPORTACIÓN DEL SERVICIO DE SEGUIMIENTO E INTERVENCIONES
# =====================================================
from app.services.intervenciones_service import (
    obtener_intervenciones_trabajador,
    guardar_intervencion,
    actualizar_estado_intervencion,
    obtener_alertas_seguimiento_activas
)

# =====================================================
# IMPORTACIÓN DEL SERVICIO DE GRAFANA (SPRINT 2)
# =====================================================
import os
import logging
from app.services.grafana import GrafanaRepository, WorkerService

logger = logging.getLogger(__name__)

# Inicializar repositorio con caché de 60 segundos
grafana_repo = GrafanaRepository(cache_ttl=60)
worker_grafana_service = WorkerService(grafana_repo)

app = FastAPI(
    title="SGF Enterprise",
    version="1.0"
)

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

app.mount(
    "/static",
    StaticFiles(directory=os.path.join(base_dir, "app", "static")),
    name="static"
)

templates = Jinja2Templates(
    directory=os.path.join(base_dir, "app", "templates")
)

# =====================================================
# VISTAS PRINCIPALES
# =====================================================

def obtener_usuario_logueado(request: Request):
    username = request.cookies.get("sgf_session")
    if not username:
        return None
    try:
        from app.services.usuario_service import obtener_usuarios
        usuarios = obtener_usuarios()
        for u in usuarios:
            if u["usuario"].lower().strip() == username.lower().strip() and u["activo"] == "Sí":
                return u
    except Exception:
        pass
    return None


def validar_acceso_trabajador(request: Request, id_trabajador: str) -> bool:
    """
    Verifica si el usuario logueado tiene permiso para acceder a los datos de un trabajador.
    Retorna True si tiene permiso, False en caso contrario.
    """
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        return False
    if usuario["usuario"].lower().strip() == "norman":
        from app.services.persona_service import obtener_persona
        persona = obtener_persona(id_trabajador)
        if persona:
            dept = str(persona.get("departamento") or "").strip().upper()
            if not (dept.startswith("SACADO H") or dept.startswith("SACADO H-")):
                return False
        else:
            return False
    return True



@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    usuario = obtener_usuario_logueado(request)
    if usuario:
        from fastapi.responses import RedirectResponse
        if usuario["usuario"].lower().strip() == "norman":
            return RedirectResponse(url="/personas")
        return RedirectResponse(url="/")
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={"request": request}
    )


@app.get("/logout")
async def logout(request: Request):
    from fastapi.responses import RedirectResponse
    response = RedirectResponse(url="/login")
    response.delete_cookie("sgf_session")
    return response


@app.post("/api/login")
async def api_login(credentials: dict = Body(...)):
    username = str(credentials.get("username", "")).strip().lower()
    password = str(credentials.get("password", "")).strip()
    
    if not username or not password:
        return JSONResponse(status_code=400, content={"ok": False, "error": "Usuario y contraseña requeridos"})
        
    try:
        from app.services.usuario_service import obtener_usuarios
        usuarios = obtener_usuarios()
        for u in usuarios:
            if u["usuario"].lower().strip() == username and u["contrasena"] == password:
                if u["activo"] != "Sí":
                    return JSONResponse(status_code=400, content={"ok": False, "error": "Usuario inactivo"})
                
                res = JSONResponse({"ok": True, "rol": u["rol"], "nombre": u["nombre"]})
                res.set_cookie(key="sgf_session", value=u["usuario"], max_age=86400, httponly=True)
                return res
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
        
    return JSONResponse(status_code=400, content={"ok": False, "error": "Usuario o contraseña incorrectos"})


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    if usuario["usuario"].lower().strip() == "norman":
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/personas")
    return templates.TemplateResponse(
        request=request,
        name="dashboard.html",
        context={"request": request, "usuario": usuario}
    )


@app.get("/personas", response_class=HTMLResponse)
async def personas(request: Request):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(
        request=request,
        name="personas.html",
        context={"request": request, "usuario": usuario}
    )


@app.get("/expediente/{id}", response_class=HTMLResponse)
async def expediente(request: Request, id: str):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    if usuario["usuario"].lower().strip() == "norman":
        if not validar_acceso_trabajador(request, id):
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url="/personas")
    return templates.TemplateResponse(
        request=request,
        name="expediente.html",
        context={"request": request, "id": id, "usuario": usuario}
    )


@app.get("/formadores", response_class=HTMLResponse)
async def formadores(request: Request):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    if usuario["usuario"].lower().strip() == "norman":
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/personas")
    return templates.TemplateResponse(
        request=request,
        name="formadores.html",
        context={"request": request, "usuario": usuario}
    )


@app.get("/formador/{id}", response_class=HTMLResponse)
async def formador_detalle(request: Request, id: str):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    if usuario["usuario"].lower().strip() == "norman":
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/personas")
    return templates.TemplateResponse(
        request=request,
        name="formador_detalle.html",
        context={"request": request, "id": id, "usuario": usuario}
    )


@app.get("/operaciones", response_class=HTMLResponse)
async def operaciones(request: Request):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    if usuario["usuario"].lower().strip() == "norman":
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/personas")
    return templates.TemplateResponse(
        request=request,
        name="operaciones.html",
        context={"request": request, "usuario": usuario}
    )


@app.get("/planificacion", response_class=HTMLResponse)
async def planificacion(request: Request):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    if usuario["usuario"].lower().strip() == "norman":
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/personas")
    return templates.TemplateResponse(
        request=request,
        name="formacion_sacadores.html",
        context={"request": request, "usuario": usuario}
    )


@app.get("/analitica", response_class=HTMLResponse)
async def analitica(request: Request):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    if usuario["usuario"].lower().strip() == "norman":
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/personas")
    return templates.TemplateResponse(
        request=request,
        name="analitica.html",
        context={"request": request, "usuario": usuario}
    )


@app.get("/formacion", response_class=HTMLResponse)
async def formacion(request: Request):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    if usuario["usuario"].lower().strip() == "norman":
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/personas")
    return templates.TemplateResponse(
        request=request,
        name="formacion.html",
        context={"request": request, "usuario": usuario}
    )


@app.get("/calendario-mili", response_class=HTMLResponse)
async def calendario_mili(request: Request):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    if usuario["usuario"].lower().strip() == "norman":
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/personas")
    return templates.TemplateResponse(
        request=request,
        name="calendario_mili.html",
        context={"request": request, "usuario": usuario}
    )


@app.get("/administracion", response_class=HTMLResponse)
async def administracion(request: Request):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    if usuario["usuario"].lower().strip() == "norman":
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/personas")
    return templates.TemplateResponse(
        request=request,
        name="administracion.html",
        context={"request": request, "usuario": usuario}
    )


@app.get("/administracion/usuarios", response_class=HTMLResponse)
async def administracion_usuarios(request: Request):
    usuario = obtener_usuario_logueado(request)
    if not usuario:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login")
    if usuario["usuario"].lower().strip() == "norman":
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/personas")
    return templates.TemplateResponse(
        request=request,
        name="usuarios.html",
        context={"request": request, "usuario": usuario}
    )


@app.get("/api/usuarios")
async def api_obtener_usuarios():
    try:
        from app.services.usuario_service import obtener_usuarios
        usuarios = obtener_usuarios()
        return JSONResponse(usuarios)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/usuarios")
async def api_guardar_usuario(datos: dict = Body(...)):
    try:
        from app.services.usuario_service import guardar_usuario
        res = guardar_usuario(datos)
        if not res.get("ok"):
            return JSONResponse(res, status_code=400)
        return res
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.put("/api/usuarios/{fila_idx}")
async def api_actualizar_usuario(fila_idx: int, datos: dict = Body(...)):
    try:
        from app.services.usuario_service import actualizar_usuario
        res = actualizar_usuario(fila_idx, datos)
        if not res.get("ok"):
            return JSONResponse(res, status_code=400)
        return res
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.delete("/api/usuarios/{fila_idx}")
async def api_eliminar_usuario(fila_idx: int):
    try:
        from app.services.usuario_service import eliminar_usuario
        res = eliminar_usuario(fila_idx)
        if not res.get("ok"):
            return JSONResponse(res, status_code=400)
        return res
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/formacion-sacadores")
async def formacion_sacadores():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/planificacion")


@app.get("/api/formacion-sacadores")
async def api_formacion_sacadores():
    try:
        from app.services.sacadores_service import obtener_formacion_sacadores
        datos = obtener_formacion_sacadores()
        
        # Calcular KPIs y clasificar listas
        total_formadas = []
        total_sacado_h = []
        total_otros_depts = []
        
        for s in datos:
            has_training = False
            try:
                tf_val = float(str(s.get("total_form", "0")).replace(",", ".").strip() or 0)
                if tf_val > 0:
                    has_training = True
            except ValueError:
                pass
                
            if s.get("aula_s0") == "TRUE" or s.get("aula_s1") == "TRUE" or s.get("aula_s2") == "TRUE" or s.get("camara") not in ("", "Pendiente", "FALSE", "0:00"):
                has_training = True
                
            if has_training:
                total_formadas.append(s)
                
            dept = str(s.get("dept_grupo", "")).upper()
            if "SACADO H" in dept:
                total_sacado_h.append(s)
            else:
                total_otros_depts.append(s)
                
            if s.get("camara") in ("FALSE", "", "0:00"):
                s["camara"] = "Pendiente"
                
        response_data = {
            "sacadores": datos,
            "kpis": {
                "total_formadas": len(total_formadas),
                "total_sacado_h": len(total_sacado_h),
                "total_otros_depts": len(total_otros_depts)
            },
            "listas": {
                "formadas": [s["id"] for s in total_formadas],
                "sacado_h": [s["id"] for s in total_sacado_h],
                "otros_depts": [s["id"] for s in total_otros_depts]
            }
        }
        return JSONResponse(response_data)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/formacion-sacadores/actualizar")
async def api_actualizar_formacion_sacadores(datos: dict = Body(...)):
    id_trabajador = datos.get("id")
    columna = datos.get("columna")
    valor = datos.get("valor")
    
    if not id_trabajador or not columna:
        return JSONResponse({"ok": False, "error": "Faltan parámetros 'id' o 'columna'."}, status_code=400)
        
    try:
        from app.services.google_service import abrir_documento_por_key
        from app.services.persona_service import SPREADSHEET_SACADORES_ID, invalidar_todas_las_caches
        
        doc = abrir_documento_por_key(SPREADSHEET_SACADORES_ID)
        hoja = doc.worksheet("SIMPL")
        records = hoja.get_all_records()
        
        row_num = None
        for idx, r in enumerate(records):
            if str(r.get("ID", "")).strip() == str(id_trabajador).strip():
                row_num = idx + 2
                break
                
        if not row_num:
            return JSONResponse({"ok": False, "error": f"Trabajador con ID {id_trabajador} no encontrado en la hoja SIMPL."}, status_code=404)
            
        col_idx = None
        if columna == "aula_s0":
            col_idx = 11
        elif columna == "aula_s1":
            col_idx = 12
        elif columna == "aula_s2":
            col_idx = 13
        elif columna == "whatsapp":
            col_idx = 18
            
        if not col_idx:
            return JSONResponse({"ok": False, "error": f"Columna '{columna}' no soportada para actualización."}, status_code=400)
            
        val_str = "TRUE" if valor in (True, "TRUE", "SÍ", "SI") else "FALSE"
        hoja.update_cell(row_num, col_idx, val_str)
        
        invalidar_todas_las_caches()
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/api/agenda-formacion/eventos")
async def api_agenda_formacion_eventos():
    try:
        from app.services.sacadores_service import obtener_agenda_eventos
        from app.services.persona_service import obtener_filas_maestro_personas, obtener_overrides
        from app.services.dashboard_service import normalizar_persona, es_nueva_incorporacion, es_persona_activa
        
        # Obtener eventos de formación reales
        eventos = obtener_agenda_eventos()
        
        # Obtener y procesar todas las personas de forma similar al dashboard principal
        filas = obtener_filas_maestro_personas()
        overrides = obtener_overrides()
        
        for f in filas:
            id_val = str(f.get("ID_Trabajador", "")).strip()
            nombre_val = str(f.get("NOMBRE_COMPLETO", "")).strip()
            if not id_val or id_val.startswith("#") or not nombre_val:
                continue
                
            p = normalizar_persona(f, overrides)
            
            # Filtrar por nuevas incorporaciones (excluyendo bajas o no aptos)
            if es_nueva_incorporacion(p):
                estado_clean = str(p.get("estado", "")).upper().strip()
                if estado_clean in ("BAJA", "NO APTO"):
                    continue
                fecha_inc = p.get("fecha_texto")
                if fecha_inc:
                    tutor = p.get("tutor", "")
                    nombre = p.get("nombre", "")
                    depto = p.get("departamento", "")
                    hora = p.get("hora", "08:00")
                    
                    if ":" not in str(hora):
                        hora = "08:00"
                    
                    # Inyectar evento virtual de incorporación
                    eventos.append({
                        "id": f"inc-{p.get('id')}",
                        "fecha": fecha_inc,
                        "hora": hora,
                        "hora_fin": "12:00",
                        "tipo_formacion": "Incorporación",
                        "formador": tutor,
                        "aula": depto or "Planta",
                        "estado": "Finalizada" if p.get("estado") == "Libre" else "Pendiente",
                        "es_incorporacion": True,
                        "integrantes": [
                            {
                                "id_trabajador": p.get("id"),
                                "nombre": nombre,
                                "departamento": depto
                            }
                        ]
                    })
                    
        # Obtener rechequeos / revisiones activas de la hoja de intervenciones
        try:
            from app.services.intervenciones_service import obtener_hoja_intervenciones
            sheet_int = obtener_hoja_intervenciones()
            records_int = sheet_int.get_all_records()
            for r in records_int:
                estado = str(r.get("ESTADO", "Pendiente")).strip().upper()
                if estado in ("RESUELTO", "RESUELTA", "FINALIZADO", "FINALIZADA"):
                    continue
                
                fecha_seg = str(r.get("FECHA_SEGUIMIENTO", "")).strip()
                if not fecha_seg:
                    continue
                
                # Convertir a DD/MM/YYYY si viene en YYYY-MM-DD
                if "-" in fecha_seg:
                    try:
                        from datetime import datetime
                        fecha_seg = datetime.strptime(fecha_seg, "%Y-%m-%d").strftime("%d/%m/%Y")
                    except Exception:
                        pass
                
                autor = str(r.get("AUTOR", "")).strip()
                nombre = str(r.get("NOMBRE", "")).strip()
                tipo = str(r.get("TIPO", "")).strip()
                motivo = str(r.get("MOTIVO", "")).strip()
                desc = str(r.get("DESCRIPCION", "")).strip()
                
                eventos.append({
                    "id": f"rev-{r.get('ID_INTERVENCION')}",
                    "fecha": fecha_seg,
                    "hora": "09:00",
                    "hora_fin": "10:00",
                    "tipo_formacion": f"Revisión: {tipo}",
                    "formador": autor,
                    "aula": motivo or "Planta",
                    "estado": "Pendiente",
                    "es_revision": True,
                    "descripcion": desc,
                    "integrantes": [
                        {
                            "id_trabajador": r.get("ID_PERSONA"),
                            "nombre": nombre,
                            "departamento": motivo
                        }
                    ]
                })
        except Exception as ex_int:
            print("Error cargando intervenciones para agenda:", ex_int)
            
        return JSONResponse(eventos)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/agenda-formacion/agregar")
async def api_agenda_formacion_agregar(datos: dict = Body(...)):
    try:
        from app.services.sacadores_service import programar_agenda_evento
        res = programar_agenda_evento(datos)
        if not res.get("ok"):
            return JSONResponse(res, status_code=500)
        return res
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/api/agenda-formacion/actualizar")
async def api_agenda_formacion_actualizar(datos: dict = Body(...)):
    try:
        from app.services.sacadores_service import actualizar_agenda_evento
        res = actualizar_agenda_evento(datos)
        if not res.get("ok"):
            return JSONResponse(res, status_code=500)
        return res
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/api/agenda-formacion/actualizar-grupo")
async def api_agenda_formacion_actualizar_grupo(datos: dict = Body(...)):
    try:
        from app.services.sacadores_service import actualizar_agenda_evento_grupo
        res = actualizar_agenda_evento_grupo(datos)
        if not res.get("ok"):
            return JSONResponse(res, status_code=500)
        return res
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/api/agenda-formacion/agregar-integrante")
async def api_agenda_formacion_agregar_integrante(datos: dict = Body(...)):
    try:
        from app.services.sacadores_service import agregar_trabajador_a_evento
        res = agregar_trabajador_a_evento(datos)
        if not res.get("ok"):
            return JSONResponse(res, status_code=500)
        return res
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/api/agenda-formacion/eliminar-integrante")
async def api_agenda_formacion_eliminar_integrante(datos: dict = Body(...)):
    try:
        from app.services.sacadores_service import eliminar_trabajador_de_evento
        res = eliminar_trabajador_de_evento(datos.get("fila_idx"))
        if not res.get("ok"):
            return JSONResponse(res, status_code=500)
        return res
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)



# =====================================================
# API PERSONAS Y DASHBOARD
# =====================================================

@app.get("/api/dashboard")
async def api_dashboard(refresh: bool = False):
    return JSONResponse(obtener_dashboard(forzar_refresco=refresh))


@app.get("/api/dashboard-pro/stats")
async def api_dashboard_pro_stats():
    try:
        from app.services.formacion_service import obtener_datos_formacion_dashboard
        resultado = obtener_datos_formacion_dashboard()
        return JSONResponse(resultado)
    except Exception as e:
        return JSONResponse({
            "ok": False,
            "error": str(e),
            "impacto_economico": {"horas_perdidas": "0:00", "dinero_perdido": "0,00 €"},
            "agenda": [],
            "formadores": []
        }, status_code=500)


@app.get("/api/personas")
async def api_personas(request: Request, historial: bool = False):
    usuario = obtener_usuario_logueado(request)
    personas_res = obtener_personas(excluir_equipo=False, filtrar_dias=not historial)
    
    if usuario and usuario["usuario"].lower().strip() == "norman":
        filtradas = []
        for p in personas_res:
            dept = str(p.get("departamento") or "").strip().upper()
            if dept.startswith("SACADO H") or dept.startswith("SACADO H-"):
                filtradas.append(p)
        return JSONResponse(filtradas)
        
    return JSONResponse(personas_res)


@app.get("/api/persona/{id}")
async def api_persona(id: str, request: Request):
    if not validar_acceso_trabajador(request, id):
        return JSONResponse({"error": "Acceso denegado"}, status_code=403)
    persona = obtener_persona(id)
    if not persona or "error" in persona:
        return JSONResponse(persona, status_code=404)
    return JSONResponse(persona)


@app.get("/api/persona/{id}/historial-sacador")
async def api_persona_historial_sacador(id: str, request: Request):
    if not validar_acceso_trabajador(request, id):
        return JSONResponse({"error": "Acceso denegado"}, status_code=403)
    try:
        from app.services.persona_service import obtener_historial_sacador
        resultado = obtener_historial_sacador(id)
        return JSONResponse(resultado)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/formadores")
async def api_formadores(request: Request):
    usuario = obtener_usuario_logueado(request)
    if usuario and usuario["usuario"].lower().strip() == "norman":
        return JSONResponse({"error": "Acceso denegado"}, status_code=403)
    from app.services.formador_service import obtener_formadores
    try:
        res = obtener_formadores()
        return JSONResponse(res)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/formador/{id}/detalle")
async def api_formador_detalle(id: str, request: Request):
    usuario = obtener_usuario_logueado(request)
    if usuario and usuario["usuario"].lower().strip() == "norman":
        return JSONResponse({"error": "Acceso denegado"}, status_code=403)
    from app.services.formador_service import obtener_detalle_formador
    try:
        res = obtener_detalle_formador(id)
        if not res:
            return JSONResponse({"error": "Formador no encontrado"}, status_code=404)
        return JSONResponse(res)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/trabajador/{id}/formacion")
async def api_trabajador_formacion(id: str, request: Request):
    if not validar_acceso_trabajador(request, id):
        return JSONResponse({"error": "Acceso denegado"}, status_code=403)
    from app.services.formador_service import obtener_formacion_alumno
    try:
        res = obtener_formacion_alumno(id)
        return JSONResponse(res)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/persona/checklist")
async def api_guardar_checklist(request: Request, datos: dict = Body(...)):
    if not validar_acceso_trabajador(request, datos.get("id")):
        return JSONResponse({"ok": False, "error": "Acceso denegado"}, status_code=403)
    resultado = guardar_checklist_persona(datos)
    return JSONResponse(resultado)


@app.post("/api/persona/actualizar")
async def api_actualizar_campo(request: Request, datos: dict = Body(...)):
    if not validar_acceso_trabajador(request, datos.get("id")):
        return JSONResponse({"ok": False, "error": "Acceso denegado"}, status_code=403)
    resultado = actualizar_campo_persona(datos)
    return JSONResponse(resultado)


@app.post("/api/personas/sincronizar-departamentos")
async def api_sincronizar_departamentos():
    from app.scripts.sync_departments import ejecutar_sincronizacion
    exito = ejecutar_sincronizacion()
    if exito:
        from app.services.persona_service import invalidar_todas_las_caches
        invalidar_todas_las_caches()
        return {"ok": True, "message": "Sincronización masiva de departamentos completada con éxito."}
    else:
        return JSONResponse({"ok": False, "error": "Error al ejecutar la sincronización de departamentos."}, status_code=500)


@app.post("/api/personas/sincronizar-bajas")
async def api_sincronizar_bajas():
    try:
        from app.services.persona_service import sincronizar_bajas_salix, invalidar_todas_las_caches
        resultado = sincronizar_bajas_salix(forzar_refresco=True)
        if resultado.get("ok"):
            invalidar_todas_las_caches()
            resultado["actualizados"] = len(resultado.get("bajas", []))
            return JSONResponse(resultado)
        else:
            return JSONResponse(resultado, status_code=500)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/api/trabajador/{id}/observaciones")
async def api_obtener_observaciones(id: str):
    obs = obtener_observaciones(id)
    return JSONResponse(obs)


@app.get("/api/trabajador/{id}/fichajes")
async def api_trabajador_fichajes(id: str, request: Request):
    from app.services.dashboard_service import obtener_fichajes_individuales
    
    grafana_session = (
        request.headers.get("x-grafana-session") or
        request.headers.get("X-Grafana-Session") or
        request.cookies.get("grafana_session") or
        request.headers.get("Authorization") or
        request.headers.get("Cookie")
    )
    cookies = {}
    if grafana_session:
        cookies["grafana_session"] = grafana_session

    resultado = obtener_fichajes_individuales(id, cookies)
    if not resultado.get("ok"):
        return JSONResponse(resultado, status_code=500)
    return JSONResponse(resultado)


@app.post("/api/trabajador/{id}/enviar_revision_18_21")
async def api_enviar_revision_18_21(id: str, request: Request):
    from app.services.persona_service import obtener_persona, actualizar_campo_persona
    from app.services.email_service import enviar_correo_revision_18_21
    
    # 1. Obtener la persona
    persona = obtener_persona(id)
    if not persona or "error" in persona:
        return JSONResponse({"ok": False, "error": "Trabajador no encontrado"}, status_code=404)
        
    # 2. Intentar cargar sus datos de Grafana para adjuntar
    grafana_session = (
        request.headers.get("x-grafana-session") or
        request.headers.get("X-Grafana-Session") or
        request.cookies.get("grafana_session")
    )
    cookies = {"grafana_session": grafana_session} if grafana_session else {}
    
    try:
        from app.services.grafana.repository import GrafanaRepository
        from app.services.grafana.worker import WorkerService
        repo = GrafanaRepository()
        worker_service = WorkerService(repository=repo)
        
        # Intentar obtener cookies de sesión global si no se proveyeron
        if not cookies:
            from app.services.grafana.auth import GrafanaAuth
            from app.services.grafana.config import GRAFANA_URL
            auth = GrafanaAuth(base_url=GRAFANA_URL)
            sess = auth.get_session()
            cookies = sess.cookies.get_dict() if sess else {}
            
        grafana_data = worker_service.get_worker_metrics(id, cookies)
    except Exception:
        grafana_data = None
        
    # 3. Enviar correo
    try:
        exito = enviar_correo_revision_18_21(persona, grafana_data)
        if not exito:
            return JSONResponse({"ok": False, "error": "No se pudo enviar el correo de revisión"}, status_code=500)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
        
    # 4. Actualizar estado en Google Sheets y registrar comentario en el historial
    res_update = actualizar_campo_persona({
        "id": id,
        "campo": "revision_enviada",
        "valor": "SÍ"
    })
    if not res_update.get("ok"):
        return JSONResponse({"ok": False, "error": res_update.get("error", "Error al actualizar estado en Google Sheets")}, status_code=500)
        
    try:
        from app.services.persona_service import agregar_observacion
        from datetime import datetime
        smtp_to = os.getenv("SMTP_TO", "alvaromt@verdnatura.es,jfrau@verdnatura.es,josefrau30@gmail.com")
        now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
        comentario = f"Expediente enviado a {smtp_to} el {now_str}"
        agregar_observacion(id, comentario, tipo="General", visible_rrhh="SÍ", autor_id="falbert")
    except Exception as obs_err:
        print(f"Error registrando comentario de revisión: {obs_err}")
        
    return {"ok": True}


@app.post("/api/trabajador/{id}/whatsapp_anadido")
async def api_whatsapp_anadido(id: str):
    from app.services.persona_service import actualizar_whatsapp_simpl, invalidar_todas_las_caches
    
    res_update = actualizar_whatsapp_simpl(id, "TRUE")
    if not res_update.get("ok"):
        return JSONResponse({"ok": False, "error": res_update.get("error", "Error al actualizar estado en la hoja SIMPL")}, status_code=500)
        
    invalidar_todas_las_caches()
    return {"ok": True}


@app.post("/api/trabajador/{id}/whatsapp_quitado")
async def api_whatsapp_quitado(id: str):
    from app.services.persona_service import actualizar_whatsapp_simpl, invalidar_todas_las_caches
    
    res_update = actualizar_whatsapp_simpl(id, "FALSE")
    if not res_update.get("ok"):
        return JSONResponse({"ok": False, "error": res_update.get("error", "Error al actualizar estado en la hoja SIMPL")}, status_code=500)
        
    invalidar_todas_las_caches()
    return {"ok": True}


@app.post("/api/trabajador/{id}/iniciar_formacion")
async def api_iniciar_formacion(id: str):
    from app.services.persona_service import iniciar_formacion_simpl, invalidar_todas_las_caches
    
    res_update = iniciar_formacion_simpl(id)
    if not res_update.get("ok"):
        return JSONResponse({"ok": False, "error": res_update.get("error", "Error al iniciar formación en la hoja SIMPL")}, status_code=500)
        
    invalidar_todas_las_caches()
    return {"ok": True}


@app.post("/api/trabajador/registrar_formacion")
async def api_registrar_formacion(datos: dict = Body(...)):
    from app.services.persona_service import registrar_formacion_trabajador
    res = registrar_formacion_trabajador(datos)
    if not res.get("ok"):
        return JSONResponse({"ok": False, "error": res.get("error", "Error al registrar la formación")}, status_code=500)
    return {"ok": True}


@app.post("/api/trabajador/registrar_clase")
async def api_registrar_clase(datos: dict = Body(...)):
    try:
        from app.services.formador_service import registrar_clase_formacion
        res = registrar_clase_formacion(datos)
        if not res.get("ok"):
            return JSONResponse(res, status_code=400)
        return res
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/api/whatsapp/config")
async def api_get_whatsapp_config():
    import json
    config_dir = os.path.join(base_dir, "config")
    config_file = os.path.join(config_dir, "whatsapp_config.json")
    
    url = "https://chat.whatsapp.com/KUHmir7Gv625ogJMjYJ6Jo"
    try:
        if os.path.exists(config_file):
            with open(config_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                url = data.get("url", url)
    except Exception:
        pass
        
    return {"url": url}


@app.post("/api/whatsapp/config")
async def api_post_whatsapp_config(datos: dict = Body(...)):
    import json
    url = datos.get("url")
    if not url or not url.strip():
        return JSONResponse({"ok": False, "error": "El enlace es requerido"}, status_code=400)
        
    config_dir = os.path.join(base_dir, "config")
    config_file = os.path.join(config_dir, "whatsapp_config.json")
    
    try:
        if not os.path.exists(config_dir):
            os.makedirs(config_dir)
        with open(config_file, "w", encoding="utf-8") as f:
            json.dump({"url": url}, f, ensure_ascii=False, indent=4)
        
        # Invalidar la caché de los datos
        from app.services.persona_service import invalidar_todas_las_caches
        invalidar_todas_las_caches()
        
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/api/trabajador/{id}/observaciones")
async def api_agregar_observacion(id: str, datos: dict = Body(...)):
    comentario = datos.get("comentario")
    if not comentario or not comentario.strip():
        return JSONResponse({"ok": False, "error": "El comentario es requerido"}, status_code=400)
    tipo = datos.get("tipo", "General")
    visible_rrhh = datos.get("visible_rrhh", "SÍ")
    autor_id = datos.get("autor_id", "falbert")
    enviar_salix = datos.get("enviar_salix", False)
    
    comentario_pda = comentario
    if enviar_salix:
        comentario = f"📲 {comentario}"
        
    resultado = agregar_observacion(id, comentario, tipo, visible_rrhh, autor_id)
    
    if enviar_salix and resultado.get("ok"):
        from app.services.salix_service import emitir_alerta_salix
        res_salix = emitir_alerta_salix(id, comentario_pda)
        if not res_salix.get("ok"):
            resultado["warning"] = f"Observación guardada, pero la alerta en Salix falló: {res_salix.get('error')}"
            
    return JSONResponse(resultado)


@app.get("/api/trabajador/{id}/intervenciones")
async def api_obtener_intervenciones(id: str):
    try:
        resultado = obtener_intervenciones_trabajador(id)
        return JSONResponse(resultado)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/trabajador/{id}/intervenciones")
async def api_crear_intervencion(id: str, datos: dict = Body(...)):
    try:
        datos["id_persona"] = id
        enviar_salix = datos.get("enviar_salix", False)
        comentario = datos.get("descripcion", "")
        
        resultado = guardar_intervencion(datos)
        
        if enviar_salix and resultado.get("ok") and comentario:
            from app.services.salix_service import emitir_alerta_salix
            res_salix = emitir_alerta_salix(id, comentario)
            if not res_salix.get("ok"):
                resultado["warning"] = f"Intervención guardada, pero la alerta en Salix falló: {res_salix.get('error')}"
                
        return JSONResponse(resultado)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/api/intervenciones/{id}/actualizar")
async def api_actualizar_intervencion(id: str, datos: dict = Body(...)):
    try:
        nuevo_estado = datos.get("estado", "Pendiente")
        observaciones_cierre = datos.get("observaciones_cierre", "")
        resultado = actualizar_estado_intervencion(id, nuevo_estado, observaciones_cierre)
        if not resultado.get("ok"):
            return JSONResponse(resultado, status_code=500)
        return JSONResponse(resultado)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.get("/api/intervenciones/vencidas")
async def api_intervenciones_vencidas():
    try:
        resultado = obtener_alertas_seguimiento_activas()
        return JSONResponse(resultado)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/trabajador/{id}/actitud")
async def api_obtener_actitud(id: str):
    resultado = obtener_valoracion_actitudinal(id)
    return JSONResponse(resultado)


@app.post("/api/trabajador/{id}/actitud")
async def api_actualizar_actitud(id: str, datos: dict = Body(...)):
    actitud = datos.get("actitud")
    valor = datos.get("valor")
    nombre = datos.get("nombre")
    depto = datos.get("departamento")
    
    if not actitud or valor is None:
        return JSONResponse({"ok": False, "error": "Faltan campos actitud o valor"}, status_code=400)
        
    resultado = actualizar_valoracion_actitudinal(id, actitud, valor, nombre, depto)
    return JSONResponse(resultado)


@app.post("/api/trabajador/{id}/generar_resumen_ia")
async def api_generar_resumen_ia(id: str, request: Request):
    # Intentamos leer la cookie 'grafana_session' para inyectar datos reales
    grafana_session = (
        request.headers.get("x-grafana-session") or
        request.headers.get("X-Grafana-Session") or
        request.cookies.get("grafana_session") or
        os.getenv("GRAFANA_SESSION")
    )
    
    if grafana_session and "grafana_session=" in grafana_session:
        parts = grafana_session.split(";")
        for p in parts:
            if p.strip().startswith("grafana_session="):
                grafana_session = p.split("=")[1].strip()
                break
                
    cookies = {}
    if grafana_session:
        cookies["grafana_session"] = grafana_session
        
    try:
        from app.services.ia_service import generar_resumen_trabajador
        summary = generar_resumen_trabajador(id, cookies)
        return JSONResponse({"ok": True, "resumen": summary})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)



# =====================================================
# NUEVA API PLANIFICACIÓN (DRAG & DROP)
# =====================================================

@app.get("/api/planificacion")
async def api_cargar_planificacion():
    datos = obtener_datos_tablero()
    return JSONResponse(datos)


@app.post("/api/planificacion/asignar")
async def api_asignar_tutor(datos: dict = Body(...)):
    id_novato = datos.get("id_novato")
    tutor = datos.get("tutor")
    
    if not id_novato or tutor is None:
        return JSONResponse({"ok": False, "error": "Faltan datos para la asignación"})
        
    resultado = asignar_tutor(
        id_novato,
        tutor,
        rrhh=datos.get("rrhh"),
        uniforme=datos.get("uniforme"),
        almuerzo=datos.get("almuerzo"),
        tour=datos.get("tour")
    )
    return JSONResponse(resultado)


@app.post("/api/planificacion/actualizar_estado")
async def api_actualizar_estado_novato(datos: dict = Body(...)):
    id_novato = datos.get("id_novato")
    nuevo_estado = datos.get("estado")
    
    if not id_novato or not nuevo_estado:
        return JSONResponse({"ok": False, "error": "Faltan datos (id_novato o estado)"})
        
    resultado = actualizar_campo_persona({"id": id_novato, "campo": "estado", "valor": nuevo_estado})
    return JSONResponse(resultado)


# =====================================================
# API FORMACIÓN INTERNA (MILI)
# =====================================================

@app.get("/api/mili")
async def api_cargar_mili():
    return JSONResponse(obtener_mili_eventos())


@app.post("/api/mili/programar")
async def api_programar_mili(datos: dict = Body(...)):
    resultado = programar_mili_evento(datos)
    return JSONResponse(resultado)


@app.post("/api/mili/actualizar")
async def api_actualizar_mili(datos: dict = Body(...)):
    resultado = actualizar_mili_evento(datos)
    return JSONResponse(resultado)



# =====================================================
# API INTEGRACIÓN GRAFANA (SPRINT 2)
# =====================================================

@app.get("/api/trabajador/{id}/grafana")
async def api_trabajador_grafana(id: str, request: Request):
    # 1. Intentamos leer la cookie 'grafana_session' del request del navegador
    grafana_session = (
        request.headers.get("x-grafana-session") or
        request.headers.get("X-Grafana-Session") or
        request.cookies.get("grafana_session") or
        os.getenv("GRAFANA_SESSION")
    )
        
    # Limpieza del formato si viene con prefijo 'grafana_session='
    if grafana_session and "grafana_session=" in grafana_session:
        parts = grafana_session.split(";")
        for p in parts:
            if p.strip().startswith("grafana_session="):
                grafana_session = p.split("=")[1].strip()
                break
                
    cookies = {}
    if grafana_session:
        cookies["grafana_session"] = grafana_session
        
    try:
        resultado = worker_grafana_service.obtener_datos_grafana(id, cookies)
        return JSONResponse(resultado)
    except ValueError as e:
        return JSONResponse(status_code=404, content={"ok": False, "error": "Trabajador inexistente"})
    except PermissionError as e:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Sesión de Grafana caducada o inválida. Inicie sesión nuevamente."})
    except TimeoutError as e:
        return JSONResponse(status_code=504, content={"ok": False, "error": "Timeout en la conexión a Grafana."})
    except Exception as e:
        return JSONResponse(status_code=502, content={"ok": False, "error": f"Error del DataSource o API de Grafana: {str(e)}"})


@app.get("/api/trabajador/{id}/grafana_completo")
async def api_trabajador_grafana_completo(id: str, request: Request):
    grafana_session = (
        request.headers.get("x-grafana-session") or
        request.headers.get("X-Grafana-Session") or
        request.cookies.get("grafana_session") or
        os.getenv("GRAFANA_SESSION")
    )
    if grafana_session and "grafana_session=" in grafana_session:
        parts = grafana_session.split(";")
        for p in parts:
            if p.strip().startswith("grafana_session="):
                grafana_session = p.split("=")[1].strip()
                break
    cookies = {}
    if grafana_session:
        cookies["grafana_session"] = grafana_session

    try:
        metrics = worker_grafana_service.get_worker_metrics(id, cookies)
        return JSONResponse(metrics)
    except ValueError:
        return JSONResponse(status_code=404, content={"ok": False, "error": "Trabajador inexistente"})
    except PermissionError as e:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Sesión de Grafana caducada o inválida."})
    except TimeoutError as e:
        return JSONResponse(status_code=504, content={"ok": False, "error": "Timeout en la conexión a Grafana."})
    except Exception as e:
        return JSONResponse(status_code=502, content={"ok": False, "error": str(e)})


DEFAULT_AVATAR_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#a0aec0"><rect width="100%" height="100%" fill="#edf2f7"/><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>"""

@app.get("/api/trabajador/{id}/foto")
async def api_trabajador_foto(id: str):
    # Definir ruta de la caché local para el trabajador
    cache_dir = os.path.join(base_dir, "app", "static", "img", "cached_workers")
    cache_path = os.path.join(cache_dir, f"{id}.png")
    
    # 1. Intentar servir desde la caché local si existe
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "rb") as f:
                img_data = f.read()
            return Response(content=img_data, media_type="image/png")
        except Exception:
            pass

    # 2. Si no está en caché, intentar descargar desde Salix
    salix_token_multimedia = os.getenv("SALIX_TOKEN_MULTIMEDIA")
    if not salix_token_multimedia:
        return Response(content=DEFAULT_AVATAR_SVG, media_type="image/svg+xml")
        
    url = f"https://salix.verdnatura.es/api/Images/user/160x160/{id}/download?access_token={salix_token_multimedia}"
    try:
        res = requests.get(url, timeout=5)
        if res.status_code == 200:
            content_type = res.headers.get("Content-Type", "image/png")
            # Guardar en la caché local
            try:
                os.makedirs(cache_dir, exist_ok=True)
                with open(cache_path, "wb") as f:
                    f.write(res.content)
            except Exception:
                pass
            return Response(content=res.content, media_type=content_type)
        else:
            return Response(content=DEFAULT_AVATAR_SVG, media_type="image/svg+xml")
    except Exception as e:
        return Response(content=DEFAULT_AVATAR_SVG, media_type="image/svg+xml")


@app.post("/api/grafana/login")
async def api_grafana_login(credentials: dict = Body(...)):
    username = credentials.get("username")
    password = credentials.get("password")
    if not username or not password:
        return JSONResponse(status_code=400, content={"ok": False, "error": "Usuario y contraseña son requeridos"})
        
    import requests
    base_url = "https://grafana.verdnatura.es"
    
    session = requests.Session()
    url = f"{base_url}/login"
    payload = {
        "user": username,
        "password": password
    }
    
    try:
        response = session.post(
            url,
            json=payload,
            timeout=10.0,
            verify=True
        )
        
        if response.status_code != 200:
            return JSONResponse(status_code=401, content={"ok": False, "error": f"Error de autenticación en Grafana (HTTP {response.status_code})"})
            
        grafana_session = session.cookies.get("grafana_session")
        if not grafana_session:
            return JSONResponse(status_code=401, content={"ok": False, "error": "No se obtuvo la cookie grafana_session"})
            
        return {"ok": True, "grafana_session": grafana_session}
        
    except Exception as e:
        return JSONResponse(status_code=502, content={"ok": False, "error": f"Error de conexión con Grafana: {str(e)}"})


# =====================================================
# GOOGLE SHEETS & DEBUG
# =====================================================

@app.get("/test-google")
async def test_google():
    documento = abrir_documento("DB_FORMACION_VERDNATURA")
    return {
        "conexion": "OK",
        "documento": documento.title
    }


@app.get("/documentos")
async def documentos():
    return listar_documentos()


@app.get("/api/debug-columnas")
async def debug_columnas():
    documento = abrir_documento("DB_FORMACION_VERDNATURA")
    hoja = documento.worksheet("MAESTRO_PERSONAS")
    personas = hoja.get_all_records()
    return list(personas[0].keys())


@app.get("/api/debug-ids")
async def debug_ids():
    personas = obtener_personas()
    return [p["id"] for p in personas[:50]]


@app.get("/api/jefes_equipo")
async def api_get_jefes_equipo():
    try:
        from app.services.google_service import abrir_documento
        from app.services.persona_service import DOCUMENTO
        doc = abrir_documento(DOCUMENTO)
        sheet = doc.worksheet("EQUIPO")
        records = sheet.get_all_records()
        jefes = set()
        for r in records:
            puesto = str(r.get("Puesto", "")).strip().upper()
            nombre = str(r.get("Nombre completo", "")).strip()
            if "JEFE" in puesto and nombre:
                jefes.add(nombre)
        
        # Agregar jefes adicionales
        jefes.add("Daniel Zapata")
        jefes.add("Andres Caballero (Piri)")
        
        return JSONResponse(sorted(list(jefes)))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)