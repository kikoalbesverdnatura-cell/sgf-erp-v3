/*********************************************************************
 * SGF ERP v3
 * AnalyticsService.js
 * -------------------------------------------------------------------
 * Servicio de orquestacion analitica.
 *
 * Regla de arquitectura:
 * - Solo consume SeguimientoService.
 * - No contiene logica de negocio de dominio.
 * - Entrega datos agregados listos para UI analitica.
 *********************************************************************/

const AnalyticsService = {

  /*******************************************************************
   * BLOQUE 1 - API PUBLICA
   *******************************************************************/
  getDashboardAnalytics() {
    const seguimientos = this.getSeguimientosDataset();

    return {
      total: seguimientos.length,
      indicators: this.buildIndicators(seguimientos),
      series: {
        tutor: this.buildSeries(this.countBy(seguimientos, (s) => this.getTutor(s))),
        departamento: this.buildSeries(this.countBy(seguimientos, (s) => this.getDepartamento(s))),
        programa: this.buildSeries(this.countBy(seguimientos, (s) => this.getPrograma(s))),
        estado: this.buildSeries(this.countBy(seguimientos, (s) => this.getEstado(s))),
        riesgo: this.buildSeries(this.countBy(seguimientos, (s) => this.getRiesgo(s))),
        documentacion: this.buildSeries(this.countBy(seguimientos, (s) => this.getDocumentacionEstado(s))),
        evaluaciones: this.buildSeries(this.countBy(seguimientos, (s) => this.getEvaluacionesEstado(s)))
      },
      timeline: this.getTimelineAnalytics()
    };
  },


  getTutorAnalytics(tutor) {
    const seguimientos = SeguimientoService.getSeguimientosByTutor(tutor);

    return {
      tutor: tutor || "",
      total: seguimientos.length,
      indicators: this.buildIndicators(seguimientos),
      series: {
        estado: this.buildSeries(this.countBy(seguimientos, (s) => this.getEstado(s))),
        riesgo: this.buildSeries(this.countBy(seguimientos, (s) => this.getRiesgo(s)))
      }
    };
  },


  getDepartamentoAnalytics(departamento) {
    const seguimientos = SeguimientoService.getSeguimientosByDepartamento(departamento);

    return {
      departamento: departamento || "",
      total: seguimientos.length,
      indicators: this.buildIndicators(seguimientos),
      series: {
        programa: this.buildSeries(this.countBy(seguimientos, (s) => this.getPrograma(s))),
        estado: this.buildSeries(this.countBy(seguimientos, (s) => this.getEstado(s))),
        riesgo: this.buildSeries(this.countBy(seguimientos, (s) => this.getRiesgo(s)))
      }
    };
  },


  getProgramaAnalytics(programa) {
    const seguimientos = SeguimientoService.getSeguimientosByPrograma(programa);

    return {
      programa: programa || "",
      total: seguimientos.length,
      indicators: this.buildIndicators(seguimientos),
      series: {
        estado: this.buildSeries(this.countBy(seguimientos, (s) => this.getEstado(s))),
        tutor: this.buildSeries(this.countBy(seguimientos, (s) => this.getTutor(s))),
        riesgo: this.buildSeries(this.countBy(seguimientos, (s) => this.getRiesgo(s)))
      }
    };
  },


  getRiesgoAnalytics() {
    const seguimientos = this.getSeguimientosDataset();

    return {
      total: seguimientos.length,
      byRiesgo: this.buildSeries(this.countBy(seguimientos, (s) => this.getRiesgo(s))),
      byEstado: this.buildSeries(this.countBy(seguimientos, (s) => this.getEstado(s)))
    };
  },


  getProductividadAnalytics() {
    const seguimientos = this.getSeguimientosDataset();

    return {
      total: seguimientos.length,
      mediaProductividad: this.average(seguimientos, (s) => this.toNumber(this.getIndicador(s, "productividad"))),
      mediaError: this.average(seguimientos, (s) => this.toNumber(this.getIndicador(s, "error"))),
      mediaLineasHora: this.average(seguimientos, (s) => this.toNumber(this.getLineasHora(s))),
      series: {
        estado: this.buildSeries(this.countBy(seguimientos, (s) => this.getEstado(s))),
        programa: this.buildSeries(this.countBy(seguimientos, (s) => this.getPrograma(s)))
      }
    };
  },


  getChecklistAnalytics() {
    const seguimientos = this.getSeguimientosDataset();

    return {
      total: seguimientos.length,
      mediaChecklist: this.average(seguimientos, (s) => this.toNumber(this.getIndicador(s, "porcentajeChecklist"))),
      pendientesTotales: this.aggregate(seguimientos, (acc, s) => {
        return acc + this.toNumber(this.getPendingTotal(s, "checklist"));
      }, 0),
      series: {
        estadoSeguimiento: this.buildSeries(this.countBy(seguimientos, (s) => this.getEstado(s))),
        tramoChecklist: this.buildSeries(this.countBy(seguimientos, (s) => this.getRangeBucket(this.getIndicador(s, "porcentajeChecklist"))))
      }
    };
  },


  getDocumentacionAnalytics() {
    const seguimientos = this.getSeguimientosDataset();

    return {
      total: seguimientos.length,
      mediaDocumentacion: this.average(seguimientos, (s) => this.toNumber(this.getIndicador(s, "porcentajeDocumentacion"))),
      pendientesTotales: this.aggregate(seguimientos, (acc, s) => {
        return acc + this.toNumber(this.getPendingTotal(s, "documentacion"));
      }, 0),
      series: {
        estadoDocumentacion: this.buildSeries(this.countBy(seguimientos, (s) => this.getDocumentacionEstado(s))),
        tramoDocumentacion: this.buildSeries(this.countBy(seguimientos, (s) => this.getRangeBucket(this.getIndicador(s, "porcentajeDocumentacion"))))
      }
    };
  },


  getEvaluacionesAnalytics() {
    const seguimientos = this.getSeguimientosDataset();

    return {
      total: seguimientos.length,
      mediaEvaluaciones: this.average(seguimientos, (s) => this.toNumber(this.getIndicador(s, "mediaEvaluaciones"))),
      pendientesTotales: this.aggregate(seguimientos, (acc, s) => {
        return acc + this.toNumber(this.getPendingTotal(s, "evaluaciones"));
      }, 0),
      series: {
        estadoEvaluaciones: this.buildSeries(this.countBy(seguimientos, (s) => this.getEvaluacionesEstado(s))),
        estadoSeguimiento: this.buildSeries(this.countBy(seguimientos, (s) => this.getEstado(s)))
      }
    };
  },


  getTimelineAnalytics() {
    const seguimientos = this.getSeguimientosDataset();

    const eventos = this.aggregate(seguimientos, (acc, s) => {
      const timeline = Array.isArray(s.timeline) ? s.timeline : [];

      timeline.forEach((item) => {
        acc.push({
          fecha: item.fecha || "",
          tipo: item.tipo || "GENERAL",
          titulo: item.titulo || "",
          descripcion: item.descripcion || "",
          personaId: this.getPersonaId(s),
          personaNombre: this.getPersonaNombre(s)
        });
      });

      return acc;
    }, []);

    const series = this.buildSeries(this.countBy(eventos, (e) => e.tipo || "GENERAL"));

    return {
      totalEventos: eventos.length,
      series: series,
      recientes: this.sortBy(eventos, (e) => this.getTimestamp(e.fecha), "desc").slice(0, 50)
    };
  },


  /*******************************************************************
   * BLOQUE 2 - UTILIDADES PRIVADAS DE AGREGACION
   *******************************************************************/
  aggregate(list, reducer, initialValue) {
    return (list || []).reduce(reducer, initialValue);
  },


  groupBy(list, keySelector) {
    return this.aggregate(list || [], (acc, item) => {
      const key = this.safeLabel(keySelector(item));

      if (!acc[key]) {
        acc[key] = [];
      }

      acc[key].push(item);
      return acc;
    }, {});
  },


  countBy(list, keySelector) {
    const grouped = this.groupBy(list || [], keySelector);
    const result = {};

    Object.keys(grouped).forEach((key) => {
      result[key] = grouped[key].length;
    });

    return result;
  },


  average(list, valueSelector) {
    const arr = list || [];

    if (!arr.length) {
      return 0;
    }

    const total = this.aggregate(arr, (acc, item) => {
      return acc + this.toNumber(valueSelector(item));
    }, 0);

    return this.round(total / arr.length, 2);
  },


  sortBy(list, valueSelector, direction) {
    const dir = direction === "desc" ? -1 : 1;

    return (list || []).slice().sort((a, b) => {
      const va = valueSelector(a);
      const vb = valueSelector(b);

      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  },


  buildSeries(mapObj) {
    const arr = Object.keys(mapObj || {}).map((key) => {
      return {
        key: key,
        value: mapObj[key]
      };
    });

    return this.sortBy(arr, (item) => item.value, "desc");
  },


  buildIndicators(seguimientos) {
    const list = seguimientos || [];

    return {
      personasActivas: list.length,
      onboarding: this.countBy(list, (s) => this.getPrograma(s))[CONFIG.PROGRAMAS.NUEVA] || 0,
      mili: this.countBy(list, (s) => this.getPrograma(s))[CONFIG.PROGRAMAS.MILI] || 0,
      estadoSeguimiento: this.countBy(list, (s) => this.getEstado(s)),
      riesgo: this.countBy(list, (s) => this.getRiesgo(s)),
      checklist: {
        media: this.average(list, (s) => this.getIndicador(s, "porcentajeChecklist"))
      },
      documentacion: {
        media: this.average(list, (s) => this.getIndicador(s, "porcentajeDocumentacion"))
      },
      evaluaciones: {
        media: this.average(list, (s) => this.getIndicador(s, "mediaEvaluaciones"))
      },
      productividad: {
        media: this.average(list, (s) => this.getIndicador(s, "productividad"))
      },
      errores: {
        media: this.average(list, (s) => this.getIndicador(s, "error"))
      },
      lineasHora: {
        media: this.average(list, (s) => this.getLineasHora(s))
      },
      diasSeguimiento: {
        media: this.average(list, (s) => this.getResumenField(s, "diasSeguimiento"))
      },
      porcentajeSeguimiento: {
        media: this.average(list, (s) => this.getResumenField(s, "porcentajeSeguimiento"))
      }
    };
  },


  /*******************************************************************
   * BLOQUE 3 - EXTRACCION DE CAMPOS DE SEGUIMIENTO
   *******************************************************************/
  getSeguimientosDataset() {
    const seguimientos = SeguimientoService.getAllSeguimientos();

    return (Array.isArray(seguimientos) ? seguimientos : [])
      .filter((item) => !!item && !!item.persona);
  },


  getPersonaId(s) {
    return (s && s.persona && s.persona.id) || "";
  },


  getPersonaNombre(s) {
    return (s && s.persona && s.persona.nombre) || "";
  },


  getTutor(s) {
    return (s && s.resumen && s.resumen.tutor) || "Sin tutor";
  },


  getDepartamento(s) {
    return (s && s.persona && s.persona.departamento) || "Sin departamento";
  },


  getPrograma(s) {
    return (s && s.persona && s.persona.programa) || "Sin programa";
  },


  getEstado(s) {
    return (s && s.resumen && s.resumen.estado) || "Sin estado";
  },


  getRiesgo(s) {
    return (s && s.riesgo && s.riesgo.nivel) || "Sin riesgo";
  },


  getIndicador(s, key) {
    return (s && s.indicadores && s.indicadores[key]) || 0;
  },


  getResumenField(s, key) {
    return (s && s.resumen && s.resumen[key]) || 0;
  },


  getLineasHora(s) {
    return (s && s.grafana && s.grafana.resumen && s.grafana.resumen.lineasHoraMedia) || 0;
  },


  getDocumentacionEstado(s) {
    return (s && s.documentacion && s.documentacion.detalle && s.documentacion.detalle.estado) || "Sin estado";
  },


  getEvaluacionesEstado(s) {
    return (s && s.evaluaciones && s.evaluaciones.resumen && s.evaluaciones.resumen.estado) || "Sin estado";
  },


  getPendingTotal(s, section) {
    if (!s || !s.pendientes) return 0;

    const list = s.pendientes[section];
    return Array.isArray(list) ? list.length : 0;
  },


  getRangeBucket(value) {
    const v = this.toNumber(value);

    if (v < 25) return "0-24";
    if (v < 50) return "25-49";
    if (v < 75) return "50-74";
    return "75-100";
  },


  getTimestamp(value) {
    if (!value) return 0;

    const d = new Date(value);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  },


  safeLabel(value) {
    const v = String(value || "").trim();
    return v || "Sin dato";
  },


  normalizeKey(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  },


  toNumber(value) {
    const n = Number(value || 0);
    return isNaN(n) ? 0 : n;
  },


  round(value, decimals) {
    const factor = Math.pow(10, decimals || 0);
    return Math.round((value || 0) * factor) / factor;
  }

};


/*********************************************************************
 * WRAPPERS GLOBALES DE COMPATIBILIDAD
 *********************************************************************/

function getDashboardAnalytics() {
  return AnalyticsService.getDashboardAnalytics();
}


function getTutorAnalytics(tutor) {
  return AnalyticsService.getTutorAnalytics(tutor);
}


function getDepartamentoAnalytics(departamento) {
  return AnalyticsService.getDepartamentoAnalytics(departamento);
}
