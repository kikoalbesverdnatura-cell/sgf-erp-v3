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

  const personas =
    PersonaService.getAll();

  template.activePage = "personas";

  template.personas = personas;

  template.resumen = DashboardService.getResumen(personas);

  template.tutores =
    PersonaService
      .getFormadores()
      .map(function(t){
        return t.nombre;
      });

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

  return HtmlService
    .createHtmlOutput(
      "<h2>Expediente</h2><p>ID: " + id + "</p>"
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