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
 * - Endpoints backend
 *
 * No contiene lógica de negocio.
 *********************************************************************/


/*********************************************************************
 * ENTRADA PRINCIPAL
 *********************************************************************/
function doGet(e) {
  const page =
    e && e.parameter && e.parameter.page
      ? String(e.parameter.page)
      : "dashboard";

  return render(page, e);
}


/*********************************************************************
 * ROUTER
 *********************************************************************/
function render(page, e) {
  switch (String(page).toLowerCase()) {
    case "dashboard":
      return renderDashboard();

    case "personas":
      return renderPersonas();

    case "empleado":
    case "expediente":
      return renderEmpleado(e && e.parameter ? e.parameter.id : "");

    case "analytics":
      return renderAnalytics();

    case "configuracion":
    case "configuración":
      return renderConfiguracion();

    default:
      return renderNotFound();
  }
}


/*********************************************************************
 * DASHBOARD
 *********************************************************************/
function renderDashboard() {
  const html = HtmlService.createTemplateFromFile("Dashboard");
  html.activePage = "dashboard";

  return html
    .evaluate()
    .setTitle("SGF ERP")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/*********************************************************************
 * PERSONAS
 *********************************************************************/
function renderPersonas() {
  const template = HtmlService.createTemplateFromFile("Personas");
  const personas = PersonaService.getAll();

  template.activePage = "personas";
  template.personas = personas;
  template.resumen = DashboardService.getResumen(personas);
  template.tutores = PersonaService.getFormadores().map(function (t) {
    return t.nombre;
  });

  return template
    .evaluate()
    .setTitle("SGF ERP · Personas")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/*********************************************************************
 * EXPEDIENTE
 *********************************************************************/
function renderEmpleado(id) {
  const template = HtmlService.createTemplateFromFile("Expediente");
  template.activePage = "empleado";
  template.personaId = id || "";

  return template
    .evaluate()
    .setTitle("SGF ERP · Expediente")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/*********************************************************************
 * ANALYTICS
 *********************************************************************/
function renderAnalytics() {
  return HtmlService.createHtmlOutput("<h2>Analytics</h2>");
}


/*********************************************************************
 * CONFIGURACIÓN
 *********************************************************************/
function renderConfiguracion() {
  return HtmlService.createHtmlOutput("<h2>Configuración</h2>");
}


/*********************************************************************
 * PÁGINA NO ENCONTRADA
 *********************************************************************/
function renderNotFound() {
  return HtmlService.createHtmlOutput("<h2>Página no encontrada</h2>");
}


/*********************************************************************
 * INCLUDE HTML
 *********************************************************************/
function include(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}


/*********************************************************************
 * ENDPOINTS BACKEND
 *********************************************************************/
function getDashboard() {
  return DashboardService.getDashboard();
}


function loadPage(page) {
  switch (String(page || "").toLowerCase()) {
    case "dashboard":
      return HtmlService.createTemplateFromFile("Dashboard").evaluate().getContent();

    case "personas":
      return HtmlService.createTemplateFromFile("Personas").evaluate().getContent();

    case "empleado":
    case "expediente":
      return HtmlService.createTemplateFromFile("Expediente").evaluate().getContent();

    default:
      return renderNotFound().getContent();
  }
}


function getCentroSeguimiento() {
  if (typeof CentroSeguimientoService !== "undefined" &&
      typeof CentroSeguimientoService.getCentroSeguimiento === "function") {
    return CentroSeguimientoService.getCentroSeguimiento();
  }

  if (typeof DashboardService !== "undefined" &&
      typeof DashboardService.getCentroSeguimiento === "function") {
    return DashboardService.getCentroSeguimiento();
  }

  throw new Error("CentroSeguimientoService no está disponible");
}


function getExpediente(personaId) {
  return ExpedienteService.getExpediente(personaId);
}


function getDashboardAnalytics() {
  if (typeof DashboardAnalyticsService !== "undefined" &&
      typeof DashboardAnalyticsService.getDashboardAnalytics === "function") {
    return DashboardAnalyticsService.getDashboardAnalytics();
  }

  if (typeof DashboardService !== "undefined" &&
      typeof DashboardService.getDashboardAnalytics === "function") {
    return DashboardService.getDashboardAnalytics();
  }

  throw new Error("DashboardAnalyticsService no está disponible");
}


function updateCheck(personaId, key, valor) {
  return ExpedienteService.updateCheck(personaId, key, valor);
}


function updateEstado(personaId, estado) {
  return ExpedienteService.updateEstado(personaId, estado);
}


function updateTutor(personaId, tutor) {
  return ExpedienteService.updateTutor(personaId, tutor);
}


function updateFase(personaId, idFase) {
  return ExpedienteService.updateFase(personaId, idFase);
}


function updatePdaFirma(personaId, firmado) {
  return ExpedienteService.updatePdaFirma(personaId, firmado);
}


function updateExpedienteCheck(id, key, valor) {
  return ExpedienteService.updateCheck(id, key, valor);
}


function updateExpedienteEstado(id, estado) {
  return ExpedienteService.updateEstado(id, estado);
}


function updateExpedienteFase(id, fase) {
  return ExpedienteService.updateFase(id, fase);
}


function updateExpedienteTutor(id, tutor) {
  return ExpedienteService.updateTutor(id, tutor);
}


function updateExpedientePdaFirma(id, firmado) {
  return ExpedienteService.updatePdaFirma(id, firmado);
}
