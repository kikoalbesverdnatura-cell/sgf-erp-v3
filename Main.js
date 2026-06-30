/*********************************************************************
 * SGF ERP v3
 * Main.js
 * -------------------------------------------------------------------
 * Punto de entrada de la aplicación
 * Departamento de Formación - Verdnatura
 *
 * Responsabilidades:
 * - doGet()
 * - Router principal
 * - Renderizado de páginas
 * - Include de HTML
 *
 * No contiene lógica de negocio.
 *********************************************************************/


/*********************************************************************
 * ENTRADA PRINCIPAL
 *********************************************************************/
function doGet(e) {

  const page =
    (e &&
      e.parameter &&
      e.parameter.page)
        ? e.parameter.page
        : "dashboard";

  return render(page, e);

}


/*********************************************************************
 * ROUTER
 *********************************************************************/
function render(page, e) {

  page = normalizePage(page);

  switch (page) {

    case "dashboard":
      return renderDashboard();

    case "personas":
      return renderPersonas();

    case "empleado":
      return renderEmpleado(
        e && e.parameter ? e.parameter.id : ""
      );

    case "analytics":
      return renderAnalytics();

    case "configuracion":
      return renderConfiguracion();

    default:
      return renderNotFound();

  }

}


/*********************************************************************
 * DASHBOARD
 *********************************************************************/
function renderDashboard() {

  const html =
    HtmlService.createTemplateFromFile("Dashboard");

  html.activePage = "dashboard";

  return html
    .evaluate()
    .setTitle("SGF ERP")
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );

}


/*********************************************************************
 * PERSONAS
 *********************************************************************/
function renderPersonas() {

  const template =
    HtmlService.createTemplateFromFile("Personas");

  template.activePage = "personas";

  return template
      .evaluate()
      .setTitle("SGF ERP · Personas")
      .setXFrameOptionsMode(
        HtmlService.XFrameOptionsMode.ALLOWALL
      );

}


/*********************************************************************
 * EXPEDIENTE
 *********************************************************************/
function renderEmpleado(id) {

  const html =
    HtmlService.createTemplateFromFile("Expediente");

  html.activePage = "personas";
  html.personaId = id || "";

  return html
    .evaluate()
    .setTitle("SGF ERP · Expediente")
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );

}


/*********************************************************************
 * ANALYTICS
 *********************************************************************/
function renderAnalytics() {

  return HtmlService
    .createHtmlOutput("<h2>Analytics</h2>");

}


/*********************************************************************
 * CONFIGURACIÓN
 *********************************************************************/
function renderConfiguracion() {

  return HtmlService
    .createHtmlOutput("<h2>Configuración</h2>");

}


/*********************************************************************
 * PÁGINA NO ENCONTRADA
 *********************************************************************/
function renderNotFound() {

  return HtmlService
    .createHtmlOutput(
      "<h2>Página no encontrada</h2>"
    );

}


/*********************************************************************
 * INCLUDE HTML
 *********************************************************************/
function include(file) {

  return HtmlService
    .createHtmlOutputFromFile(file)
    .getContent();

}


/*********************************************************************
 * URL WEBAPP
 *********************************************************************/
function getAppUrl() {

  return ScriptApp
    .getService()
    .getUrl();

}


/*********************************************************************
 * CARGA DE PÁGINA PARA CLIENTES JS
 *********************************************************************/
function loadPage(page) {

  const normalized = normalizePage(page);

  const output = render(normalized, {
    parameter: {
      page: normalized
    }
  });

  return output.getContent();

}


/*********************************************************************
 * NORMALIZAR NOMBRE DE PÁGINA
 *********************************************************************/
function normalizePage(page) {

  const p = String(page || "")
    .trim()
    .toLowerCase();

  if (p === "") return "dashboard";

  if (p === "home") return "dashboard";
  if (p === "persona") return "personas";
  if (p === "empleados") return "personas";
  if (p === "employee") return "empleado";
  if (p === "expediente") return "empleado";
  if (p === "grafana") return "dashboard";

  return p;

}


/*********************************************************************
 * CENTRO DE SEGUIMIENTO - API PARA PERSONAS
 * -------------------------------------------------------------------
 * Consumir exclusivamente SeguimientoService.
 *********************************************************************/
function getCentroSeguimientoData() {

  const seguimientos = SeguimientoService.getAllSeguimientos();

  const items = seguimientos
    .filter(function(s) {
      return !!(s && s.persona);
    })
    .map(function(s) {
      return toCentroItem(s);
    });

  return {
    generatedAt: new Date().toISOString(),
    total: items.length,
    summary: buildCentroSummary(items),
    filters: buildCentroFilters(items),
    items: items
  };

}


function toCentroItem(s) {

  const persona = s.persona || {};
  const resumen = s.resumen || {};
  const riesgo = s.riesgo || {};
  const indicadores = s.indicadores || {};
  const checklist = s.checklist || {};
  const documentacion = s.documentacion || {};
  const evaluaciones = s.evaluaciones || {};
  const grafanaResumen = (s.grafana || {}).resumen || {};
  const timeline = Array.isArray(s.timeline) ? s.timeline : [];
  const pendientes = s.pendientes || {};

  const checklistPct = toSafeNumber(indicadores.porcentajeChecklist || checklist.porcentaje);
  const documentacionPct = toSafeNumber(indicadores.porcentajeDocumentacion || (documentacion.detalle || {}).porcentaje);
  const evaluacionesMedia = toSafeNumber(indicadores.mediaEvaluaciones || (evaluaciones.resumen || {}).media);
  const productividad = toSafeNumber(indicadores.productividad || grafanaResumen.productividadMedia);
  const error = toSafeNumber(indicadores.error || grafanaResumen.errorMedio);
  const lineasHora = toSafeNumber(grafanaResumen.lineasHoraMedia);

  const timelineTop = timeline.length ? timeline[0] : {};
  const ultimaActividad = {
    fecha: timelineTop.fecha || grafanaResumen.ultimaFechaGrafana || "",
    titulo: timelineTop.titulo || timelineTop.tipo || "Sin actividad reciente",
    descripcion: timelineTop.descripcion || ""
  };

  const alertas = [];
  if (String(riesgo.nivel || "").toLowerCase() === String(CONFIG.RIESGO.ALTO || "alto").toLowerCase()) {
    alertas.push("riesgo-alto");
  }
  if ((checklist.pendientes || []).length > 0 || checklistPct < Number(CONFIG.SYSTEM.CHECKLIST_COMPLETO || 100)) {
    alertas.push("checklist-pendiente");
  }
  if (((documentacion.detalle || {}).pendientes || 0) > 0 || (documentacion.pendientes || []).length > 0) {
    alertas.push("documentacion-pendiente");
  }
  if (((evaluaciones.resumen || {}).pendientes || 0) > 0 || (evaluaciones.pendientes || []).length > 0) {
    alertas.push("evaluaciones-pendientes");
  }
  if (productividad > 0 && productividad < Number(CONFIG.SYSTEM.PRODUCTIVIDAD_MINIMA || 70)) {
    alertas.push("productividad-baja");
  }
  if (error > Number(CONFIG.SYSTEM.ERROR_MAXIMO || 8)) {
    alertas.push("errores-altos");
  }
  if (!String(resumen.tutor || persona.tutor || "").trim()) {
    alertas.push("sin-tutor");
  }

  return {
    id: persona.id || "",
    nombre: persona.nombre || "Sin nombre",
    programa: persona.programa || "",
    estado: resumen.estado || persona.estado || "",
    fase: resumen.fase || persona.idFase || "",
    tutor: resumen.tutor || persona.tutor || "Sin tutor",
    departamento: persona.departamento || "Sin departamento",
    diasSeguimiento: toSafeNumber(resumen.diasSeguimiento),
    diasRestantes: toSafeNumber(resumen.diasRestantes),
    porcentajeSeguimiento: toSafeNumber(resumen.porcentajeSeguimiento),
    riesgo: riesgo.nivel || "",
    riesgoColor: riesgo.color || "#6c757d",
    checklist: {
      porcentaje: checklistPct,
      pendientes: toSafeNumber(checklist.totalPendientes || (checklist.pendientes || []).length)
    },
    documentacion: {
      porcentaje: documentacionPct,
      pendientes: toSafeNumber((documentacion.detalle || {}).pendientes || (documentacion.pendientes || []).length)
    },
    evaluaciones: {
      media: evaluacionesMedia,
      pendientes: toSafeNumber((evaluaciones.resumen || {}).pendientes || (evaluaciones.pendientes || []).length)
    },
    productividad: productividad,
    errores: error,
    lineasHora: lineasHora,
    ultimaActividad: ultimaActividad,
    proximaAccion: checklist.siguienteAccion || "Revisar seguimiento",
    alertas: alertas,
    timelineCount: timeline.length,
    pendientesTotal: toSafeNumber(pendientes.total)
  };

}


function buildCentroSummary(items) {

  const total = items.length;

  return {
    total: total,
    riesgoAlto: items.filter(function(i){ return i.alertas.indexOf("riesgo-alto") >= 0; }).length,
    checklistPendiente: items.filter(function(i){ return i.alertas.indexOf("checklist-pendiente") >= 0; }).length,
    documentacionPendiente: items.filter(function(i){ return i.alertas.indexOf("documentacion-pendiente") >= 0; }).length,
    evaluacionesPendientes: items.filter(function(i){ return i.alertas.indexOf("evaluaciones-pendientes") >= 0; }).length,
    productividadBaja: items.filter(function(i){ return i.alertas.indexOf("productividad-baja") >= 0; }).length,
    erroresAltos: items.filter(function(i){ return i.alertas.indexOf("errores-altos") >= 0; }).length,
    sinTutor: items.filter(function(i){ return i.alertas.indexOf("sin-tutor") >= 0; }).length
  };

}


function buildCentroFilters(items) {

  const unique = function(selector) {
    const map = {};
    items.forEach(function(i) {
      const value = String(selector(i) || "").trim();
      if (value) map[value] = true;
    });
    return Object.keys(map).sort();
  };

  return {
    tutores: unique(function(i){ return i.tutor; }),
    programas: unique(function(i){ return i.programa; }),
    departamentos: unique(function(i){ return i.departamento; }),
    estados: unique(function(i){ return i.estado; }),
    fases: unique(function(i){ return i.fase; }),
    riesgos: unique(function(i){ return i.riesgo; })
  };

}


function toSafeNumber(value) {
  const n = Number(value || 0);
  return isNaN(n) ? 0 : n;
}