/*********************************************************************
 * SGF ERP v3
 * Config.js
 * -------------------------------------------------------------------
 * Configuración global del Sistema de Gestión de Formación
 * Verdnatura
 *********************************************************************/

const CONFIG = {

  /*******************************************************************
   * APLICACIÓN
   *******************************************************************/
  APP: {
    NAME: "SGF ERP",
    VERSION: "3.0.0",
    COMPANY: "Verdnatura",
    DEPARTMENT: "Formación",
    AUTHOR: "Kiko Albert",
    TIMEZONE: "Europe/Madrid",
    LANGUAGE: "es",
    DATE_FORMAT: "dd/MM/yyyy",
    DATETIME_FORMAT: "dd/MM/yyyy HH:mm:ss"
  },

  /*******************************************************************
   * SPREADSHEET
   *******************************************************************/
  SPREADSHEET: {
    ID: "1ZxV5mJb5QdVg7IasmzFIDnMnkYXZXU45sZ-HvyJ9nJ8"
  },

  /*******************************************************************
   * HOJAS
   *******************************************************************/
  SHEETS: {

    PERSONAS: "MAESTRO_PERSONAS",

    PRODUCTIVIDAD_RAW: "GRAFANA_PRODUCTIVIDAD_RAW",

    ERRORES_RAW: "GRAFANA_ERRORES_RAW",

    HISTORICO: "SEGUIMIENTO_GRAFANA_HISTORICO",

    OBSERVACIONES: "OBSERVACIONES",

    EVALUACIONES: "11_EVALUACIONES",

    EVENTOS: "EVENTOS",

    DOCUMENTOS: "DOCUMENTOS",

    CHECKLISTS: "CHECKLISTS_EJECUCION",

    CONFIG: "CONFIG",

    AUDITORIA: "AUDITORIA"

  },

  /*******************************************************************
   * PROGRAMAS
   *******************************************************************/
  PROGRAMAS: {

    NUEVA: "Nueva incorporación",

    MILI: "Mili 3.0"

  },

  /*******************************************************************
   * ESTADOS
   *******************************************************************/
  ESTADOS: {

    PENDIENTE: "Pendiente",

    EN_CURSO: "En curso",

    FINALIZADO: "Finalizado",

    BAJA: "Baja"

  },

  /*******************************************************************
   * RIESGO
   *******************************************************************/
  RIESGO: {

    BAJO: "Bajo",

    MEDIO: "Medio",

    ALTO: "Alto"

  },

  /*******************************************************************
   * PARÁMETROS
   *******************************************************************/
  SYSTEM: {

    DIAS_ONBOARDING: 30,

    DIAS_MILI: 10,

    PRODUCTIVIDAD_MINIMA: 70,

    ERROR_MAXIMO: 8,

    CHECKLIST_COMPLETO: 100,

    MAX_OBSERVACIONES_DASHBOARD: 5,

    MAX_EVENTOS_TIMELINE: 20

  },

  /*******************************************************************
   * CHECKLIST
   *******************************************************************/
  CHECKS: [

    {
      id: "RRHH",
      nombre: "Recepción RRHH",
      grupo: "Bienvenida",
      obligatorio: true,
      orden: 10
    },

    {
      id: "UNIFORME",
      nombre: "Entrega uniforme",
      grupo: "Bienvenida",
      obligatorio: true,
      orden: 20
    },

    {
      id: "ALMUERZO",
      nombre: "Explicación almuerzo",
      grupo: "Bienvenida",
      obligatorio: true,
      orden: 30
    },

    {
      id: "PSICOTECNICO",
      nombre: "Psicotécnico",
      grupo: "RRHH",
      obligatorio: true,
      orden: 40
    },

    {
      id: "FORMACION_BIENVENIDA",
      nombre: "Formación bienvenida",
      grupo: "Formación",
      obligatorio: true,
      orden: 50
    },

    {
      id: "TOUR_EMPRESA",
      nombre: "Tour empresa",
      grupo: "Formación",
      obligatorio: true,
      orden: 60
    },

    {
      id: "PDA_ENTREGADA",
      nombre: "Entrega PDA",
      grupo: "Material",
      obligatorio: true,
      orden: 70
    },

    {
      id: "PDA_FIRMADA",
      nombre: "Documento PDA firmado",
      grupo: "Documentación",
      obligatorio: true,
      orden: 80
    }

  ],

  /*******************************************************************
   * COLORES
   *******************************************************************/
  COLORS: {

    PRIMARY: "#0F5132",

    SUCCESS: "#198754",

    WARNING: "#FFC107",

    DANGER: "#DC3545",

    INFO: "#0D6EFD",

    LIGHT: "#F8F9FA",

    DARK: "#212529"

  }

};


/*********************************************************************
 * SPREADSHEET
 *********************************************************************/
function getSpreadsheet() {

  return SpreadsheetApp.openById(
    CONFIG.SPREADSHEET.ID
  );

}


/*********************************************************************
 * OBTENER HOJA
 *********************************************************************/
function getSheet(nombre) {

  return getSpreadsheet()
    .getSheetByName(nombre);

}


/*********************************************************************
 * FORMATEAR FECHA
 *********************************************************************/
function formatDate(fecha) {

  if (!fecha) return "";

  return Utilities.formatDate(
    new Date(fecha),
    CONFIG.APP.TIMEZONE,
    CONFIG.APP.DATE_FORMAT
  );

}