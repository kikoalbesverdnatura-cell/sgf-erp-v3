/*********************************************************************
 * SGF ERP v3
 * DashboardService.js
 * -------------------------------------------------------------------
 * Servicio de orquestacion del dashboard.
 *
 * Regla de integracion:
 * - Solo consume SeguimientoService y AnalyticsService.
 *********************************************************************/

const DashboardService = {

  /*******************************************************************
   * DASHBOARD COMPLETO
   *******************************************************************/
  getDashboard() {
    const seguimientos = this.getSeguimientosDataset();
    const analytics = this.safeAnalytics("getDashboardAnalytics", [], {});

    return {
      resumen: this.composeResumen(seguimientos, analytics),
      kpis: this.composeKpis(seguimientos, analytics),
      entradas: this.getEntradas(seguimientos),
      incorporaciones: this.getIncorporaciones(seguimientos),
      formadores: this.getFormadores(seguimientos),
      checklistPendiente: this.getChecklistPendiente(seguimientos),
      documentosPendientes: this.getDocumentosPendientes(seguimientos),
      evaluacionesPendientes: this.getEvaluacionesPendientes(seguimientos),
      alertas: this.getAlertas(seguimientos),
      productividad: this.getProductividad(seguimientos, analytics),
      timeline: this.getTimeline(analytics)
    };
  },


  /*******************************************************************
   * COMPOSICION PARA UI
   *******************************************************************/
  composeResumen(seguimientos, analytics) {
    const indicators = (analytics && analytics.indicators) || {};

    return {
      total: seguimientos.length,
      activas: seguimientos.length,
      activos: seguimientos.length,
      enSeguimiento: seguimientos.length,
      nuevas: this.countByPrograma(seguimientos, CONFIG.PROGRAMAS.NUEVA),
      onboarding: this.countByPrograma(seguimientos, CONFIG.PROGRAMAS.NUEVA),
      mili: this.countByPrograma(seguimientos, CONFIG.PROGRAMAS.MILI),
      riesgo: this.countByRiesgo(seguimientos, CONFIG.RIESGO.ALTO),
      riesgoAlto: this.countByRiesgo(seguimientos, CONFIG.RIESGO.ALTO),
      riesgoMedio: this.countByRiesgo(seguimientos, CONFIG.RIESGO.MEDIO),
      riesgoBajo: this.countByRiesgo(seguimientos, CONFIG.RIESGO.BAJO),
      finalizados: this.countByEstado(seguimientos, CONFIG.ESTADOS.FINALIZADO),
      formadores: this.getFormadores(seguimientos).filter((f) => f.nombre !== "Sin tutor").length,
      sinTutor: seguimientos.filter((s) => !this.getTutor(s)).length,
      hoy: this.getEntradas(seguimientos).hoy.length,
      manana: this.getEntradas(seguimientos).manana.length,
      estaSemana: this.getEntradas(seguimientos).estaSemana.length,
      indicators: indicators
    };
  },


  composeKpis(seguimientos, analytics) {
    const indicators = (analytics && analytics.indicators) || {};

    return {
      total: seguimientos.length,
      activos: seguimientos.length,
      enSeguimiento: seguimientos.length,
      nuevas: this.countByPrograma(seguimientos, CONFIG.PROGRAMAS.NUEVA),
      onboarding: this.countByPrograma(seguimientos, CONFIG.PROGRAMAS.NUEVA),
      mili: this.countByPrograma(seguimientos, CONFIG.PROGRAMAS.MILI),
      riesgoAlto: this.countByRiesgo(seguimientos, CONFIG.RIESGO.ALTO),
      riesgoMedio: this.countByRiesgo(seguimientos, CONFIG.RIESGO.MEDIO),
      riesgoBajo: this.countByRiesgo(seguimientos, CONFIG.RIESGO.BAJO),
      formadores: this.getFormadores(seguimientos).filter((f) => f.nombre !== "Sin tutor").length,
      checklistMedio: this.average(seguimientos, (s) => this.getIndicador(s, "porcentajeChecklist")),
      productividadMedia: this.average(seguimientos, (s) => this.getIndicador(s, "productividad")),
      errorMedio: this.average(seguimientos, (s) => this.getIndicador(s, "error")),
      seguimientoMedio: this.average(seguimientos, (s) => this.getResumenField(s, "porcentajeSeguimiento")),
      indicators: indicators
    };
  },


  getEntradas(seguimientos) {
    const hoy = this.startOfDay(new Date());
    const manana = this.startOfDay(new Date());
    manana.setDate(manana.getDate() + 1);

    const semanaEnd = this.startOfDay(new Date());
    semanaEnd.setDate(semanaEnd.getDate() + 7);

    const base = seguimientos
      .map((s) => this.toPersonaCard(s))
      .filter((p) => !!p.fechaIncorporacion);

    return {
      hoy: base.filter((p) => this.sameDay(p.fechaIncorporacion, hoy)),
      manana: base.filter((p) => this.sameDay(p.fechaIncorporacion, manana)),
      estaSemana: base.filter((p) => {
        const f = this.startOfDay(new Date(p.fechaIncorporacion));
        return f >= hoy && f <= semanaEnd;
      }),
      finalizanEstaSemana: base.filter((p) => {
        const f = this.startOfDay(new Date(p.fechaIncorporacion));
        const diasTotales = this.toNumber((p.seguimiento || {}).diasTotales || 0);
        f.setDate(f.getDate() + diasTotales);
        return f >= hoy && f <= semanaEnd;
      })
    };
  },


  getIncorporaciones(seguimientos) {
    return seguimientos
      .map((s) => this.toPersonaCard(s))
      .filter((p) => !!p.fechaIncorporacion)
      .sort((a, b) => new Date(a.fechaIncorporacion) - new Date(b.fechaIncorporacion))
      .slice(0, 20);
  },


  getFormadores(seguimientos) {
    const mapa = {};

    seguimientos.forEach((s) => {
      const tutor = this.getTutor(s) || "Sin tutor";
      mapa[tutor] = (mapa[tutor] || 0) + 1;
    });

    return Object.keys(mapa)
      .map((nombre) => ({ nombre: nombre, personas: mapa[nombre] }))
      .sort((a, b) => b.personas - a.personas);
  },


  getChecklistPendiente(seguimientos) {
    return seguimientos
      .filter((s) => this.toNumber(this.getIndicador(s, "porcentajeChecklist")) < 100)
      .map((s) => ({
        personaId: this.getPersonaId(s),
        trabajador: this.getPersonaNombre(s),
        nombre: this.getPersonaNombre(s),
        programa: this.getPrograma(s),
        departamento: this.getDepartamento(s),
        tutor: this.getTutor(s),
        progreso: this.toNumber(this.getIndicador(s, "porcentajeChecklist")),
        siguienteAccion: (s.checklist && s.checklist.siguienteAccion) || "Checklist pendiente"
      }))
      .slice(0, 30);
  },


  getDocumentosPendientes(seguimientos) {
    return seguimientos
      .flatMap((s) => {
        const personaId = this.getPersonaId(s);
        const nombre = this.getPersonaNombre(s);
        const programa = this.getPrograma(s);
        const departamento = this.getDepartamento(s);
        const tutor = this.getTutor(s);

        const pendientes = (((s.documentacion || {}).pendientes) || [])
          .map((item) => ({
            personaId: personaId,
            trabajador: nombre,
            nombre: nombre,
            programa: programa,
            departamento: departamento,
            tutor: tutor,
            documento: item.nombre || item.id || "Documento",
            estado: item.estado || "Pendiente"
          }));

        return pendientes;
      })
      .slice(0, 30);
  },


  getEvaluacionesPendientes(seguimientos) {
    return seguimientos
      .flatMap((s) => {
        const nombre = this.getPersonaNombre(s);
        const personaId = this.getPersonaId(s);

        return (((s.evaluaciones || {}).pendientes) || []).map((item) => ({
          personaId: personaId,
          trabajador: nombre,
          NOMBRE_COMPLETO: nombre,
          TIPO_EVALUACION: item.competencia || "Evaluacion",
          tipo: item.competencia || "Evaluacion",
          estado: item.estado || "Pendiente"
        }));
      })
      .slice(0, 30);
  },


  getAlertas(seguimientos) {
    return seguimientos
      .flatMap((s) => {
        const personaId = this.getPersonaId(s);
        const trabajador = this.getPersonaNombre(s);

        return ((s.alertas || []).map((a) => ({
          tipo: a.tipo || "ALERTA",
          nivel: (String(a.tipo || "").includes("RIESGO") || a.origen === "PersonaService") ? "alto" : "medio",
          personaId: personaId,
          trabajador: trabajador,
          mensaje: a.mensaje || a.tipo || "Alerta",
          descripcion: a.origen || "Seguimiento"
        })));
      })
      .slice(0, 30);
  },


  getProductividad(seguimientos, analytics) {
    const media = this.average(seguimientos, (s) => this.getIndicador(s, "productividad"));
    const errorMedio = this.average(seguimientos, (s) => this.getIndicador(s, "error"));

    return {
      media: media,
      personas: seguimientos.length,
      errorMedio: errorMedio,
      mejor: null,
      peor: null,
      analytics: analytics || {}
    };
  },


  getTimeline(analytics) {
    return ((analytics || {}).timeline || {}).recientes || [];
  },


  /*******************************************************************
   * COMPATIBILIDAD
   *******************************************************************/
  getResumen() {
    return this.getDashboard().resumen;
  },


  getKPIs() {
    return this.getDashboard().kpis;
  },


  getFormadoresLegacy() {
    return this.getDashboard().formadores;
  },


  getChecklistPendientes(personas) {
    return this.getDashboard().checklistPendiente;
  },


  getDocumentos(personas) {
    return this.getDashboard().documentosPendientes;
  },


  getEvaluaciones() {
    return this.getDashboard().evaluacionesPendientes;
  },


  /*******************************************************************
   * UTILIDADES INTERNAS
   *******************************************************************/
  getSeguimientosDataset() {
    if (typeof SeguimientoService === "undefined") {
      return [];
    }

    const items = SeguimientoService.getAllSeguimientos();
    return (Array.isArray(items) ? items : [])
      .filter((item) => !!item && !!item.persona);
  },


  safeAnalytics(method, args, fallback) {
    if (typeof AnalyticsService === "undefined") return fallback;
    if (typeof AnalyticsService[method] !== "function") return fallback;

    try {
      return AnalyticsService[method].apply(AnalyticsService, args || []);
    } catch (error) {
      console.warn("DashboardService.safeAnalytics:", method, error);
      return fallback;
    }
  },


  toPersonaCard(s) {
    const persona = (s && s.persona) || {};

    return {
      id: persona.id || "",
      nombre: persona.nombre || "",
      programa: persona.programa || "",
      fechaIncorporacion: persona.fechaIncorporacion || "",
      departamento: persona.departamento || "",
      estado: (s && s.resumen && s.resumen.estado) || persona.estado || "",
      tutor: (s && s.resumen && s.resumen.tutor) || persona.tutor || "",
      seguimiento: (s && s.resumen) || {},
      checklist: this.toNumber(this.getIndicador(s, "porcentajeChecklist")),
      productividad: this.toNumber(this.getIndicador(s, "productividad")),
      error: this.toNumber(this.getIndicador(s, "error")),
      riesgo: (s && s.riesgo && s.riesgo.nivel) || ""
    };
  },


  getPersonaId(s) {
    return (s && s.persona && s.persona.id) || "";
  },


  getPersonaNombre(s) {
    return (s && s.persona && s.persona.nombre) || "";
  },


  getTutor(s) {
    return (s && s.resumen && s.resumen.tutor) || "";
  },


  getDepartamento(s) {
    return (s && s.persona && s.persona.departamento) || "";
  },


  getPrograma(s) {
    return (s && s.persona && s.persona.programa) || "";
  },


  getIndicador(s, key) {
    return (s && s.indicadores && s.indicadores[key]) || 0;
  },


  getResumenField(s, key) {
    return (s && s.resumen && s.resumen[key]) || 0;
  },


  countByPrograma(seguimientos, programa) {
    return (seguimientos || []).filter((s) => this.getPrograma(s) === programa).length;
  },


  countByRiesgo(seguimientos, riesgo) {
    return (seguimientos || []).filter((s) => ((s.riesgo || {}).nivel || "") === riesgo).length;
  },


  countByEstado(seguimientos, estado) {
    return (seguimientos || []).filter((s) => ((s.resumen || {}).estado || "") === estado).length;
  },


  average(list, selector) {
    const arr = list || [];
    if (!arr.length) return 0;

    const total = arr.reduce((acc, item) => acc + this.toNumber(selector(item)), 0);
    return Math.round((total / arr.length) * 100) / 100;
  },


  toNumber(value) {
    const n = Number(value || 0);
    return isNaN(n) ? 0 : n;
  },


  sameDay(a, b) {
    const da = this.startOfDay(new Date(a));
    const db = this.startOfDay(new Date(b));
    return da.getTime() === db.getTime();
  },


  startOfDay(date) {
    const d = new Date(date || new Date());
    d.setHours(0, 0, 0, 0);
    return d;
  }

};


/*********************************************************************
 * METODO GLOBAL
 *********************************************************************/

function getDashboard() {
  return DashboardService.getDashboard();
}
