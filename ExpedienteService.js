/*********************************************************************
 * SGF ERP v3
 * ExpedienteService.js
 * -------------------------------------------------------------------
 * Servicio de orquestacion del expediente.
 *
 * Regla de integracion:
 * - Solo consume SeguimientoService.
 *********************************************************************/

const ExpedienteService = {

  /*******************************************************************
   * CARGA EXPEDIENTE
   *******************************************************************/
  getExpediente(id) {
    const seguimiento = SeguimientoService.getSeguimientoByPersona(id);

    if (!seguimiento || !seguimiento.persona) {
      throw new Error("No se ha encontrado la persona con ID: " + id);
    }

    return this.toExpedienteView(seguimiento);
  },


  toExpedienteView(s) {
    const persona = s.persona || {};
    const resumen = s.resumen || {};
    const checklist = s.checklist || {};
    const grafana = s.grafana || {};
    const evaluacionesResumen = s.evaluaciones || {};
    const documentacion = s.documentacion || {};

    const kpis = {
      preparacion: this.toNumber((checklist && checklist.porcentaje) || (s.indicadores || {}).porcentajeChecklist),
      checklistCompletados: this.toNumber((checklist && checklist.completados) || 0),
      checklistTotal: this.toNumber((checklist && checklist.total) || 0),
      productividadMedia: this.toNumber(((grafana.resumen || {}).productividadMedia)),
      lineasHoraMedia: this.toNumber(((grafana.resumen || {}).lineasHoraMedia)),
      errorMedio: this.toNumber(((grafana.resumen || {}).errorMedio)),
      totalLineas: this.toNumber(((grafana.resumen || {}).totalLineas)),
      totalErrores: this.toNumber(((grafana.resumen || {}).totalErrores)),
      diasConDatos: this.toNumber(((grafana.resumen || {}).diasConDatos)),
      riesgo: ((s.riesgo || {}).nivel) || "",
      ultimaEvaluacion: (evaluacionesResumen.resumen && evaluacionesResumen.resumen.ultimaEvaluacion)
        ? evaluacionesResumen.resumen.ultimaEvaluacion.fecha || persona.ultimaEvaluacion || ""
        : (persona.ultimaEvaluacion || ""),
      mediaEvaluaciones: this.toNumber((s.indicadores || {}).mediaEvaluaciones || persona.mediaEvaluaciones)
    };

    const estadoGeneral = {
      estado: resumen.estado || persona.estado || "--",
      nivel: this.toRiskLevel((s.riesgo || {}).nivel),
      porcentaje: this.toNumber((checklist && checklist.porcentaje) || 0),
      completados: this.toNumber((checklist && checklist.completados) || 0),
      total: this.toNumber((checklist && checklist.total) || 0)
    };

    return {
      persona: {
        id: persona.id || "",
        nombre: persona.nombre || "",
        programa: persona.programa || "",
        fechaIncorporacion: persona.fechaIncorporacion || "",
        departamento: persona.departamento || "",
        horaEntrada: persona.horaEntrada || "",
        observaciones: persona.observaciones || "",
        idPrograma: persona.idPrograma || "",
        idFase: resumen.fase || persona.idFase || "",
        estado: resumen.estado || persona.estado || "",
        diasSeguimiento: this.toNumber(resumen.diasSeguimiento),
        diasRestantes: this.toNumber(resumen.diasRestantes),
        tutor: resumen.tutor || persona.tutor || "",
        ultimaEvaluacion: kpis.ultimaEvaluacion,
        mediaEvaluaciones: kpis.mediaEvaluaciones,
        riesgo: (s.riesgo || {}).nivel || "",
        porcentajePreparacion: this.toNumber((checklist && checklist.porcentaje) || 0),
        productividad: kpis.productividadMedia,
        error: kpis.errorMedio,
        ultimaGrafana: (grafana.resumen || {}).ultimaFechaGrafana || ""
      },
      resumen: resumen,
      seguimiento: {
        diasSeguimiento: this.toNumber(resumen.diasSeguimiento),
        diasTotales: this.toNumber((s.progreso || {}).seguimiento),
        porcentaje: this.toNumber(resumen.porcentajeSeguimiento),
        estado: resumen.estado || ""
      },
      checklist: this.toChecklistView(checklist),
      grafana: this.toGrafanaView(grafana),
      evaluaciones: this.toEvaluacionesView(evaluacionesResumen),
      documentos: this.toDocumentosView(documentacion),
      riesgo: s.riesgo || {},
      timeline: Array.isArray(s.timeline) ? s.timeline : [],
      estadisticas: s.indicadores || {},

      // Compatibilidad UI actual
      kpis: kpis,
      observaciones: this.toObservacionesView(persona.observaciones),
      objetivos: [],
      estadoGeneral: estadoGeneral
    };
  },


  toChecklistView(checklist) {
    const grouped = checklist.grouped || {};
    const pending = checklist.pendientes || [];

    const items = [];

    Object.keys(grouped).forEach((groupName) => {
      (grouped[groupName] || []).forEach((item) => {
        items.push({
          key: item.id,
          campo: item.id,
          titulo: item.nombre || item.id,
          completado: item.realizado === true,
          valor: item.realizado === true
        });
      });
    });

    if (!items.length && pending.length) {
      pending.forEach((item) => {
        items.push({
          key: item.id,
          campo: item.id,
          titulo: item.nombre || item.id,
          completado: false,
          valor: false
        });
      });
    }

    const total = items.length;
    const completados = items.filter((item) => item.completado).length;

    return {
      total: total,
      completados: completados,
      pendientes: Math.max(0, total - completados),
      porcentaje: this.toNumber(checklist.porcentaje),
      items: items
    };
  },


  toGrafanaView(grafana) {
    const productividad = Array.isArray(grafana.productividad) ? grafana.productividad : [];
    const errores = Array.isArray(grafana.errores) ? grafana.errores : [];

    return {
      resumen: grafana.resumen || {},
      historico: Array.isArray(grafana.historico) ? grafana.historico : [],
      productividadTabla: productividad.map((item) => ({
        fecha: item.fecha,
        totalLineas: this.toNumber(item.totalLineas),
        lineasEsperadas: this.toNumber(item.lineasEsperadas),
        porcentaje: this.toNumber(item.porcentaje),
        porcentajeTexto: this.toPct(item.porcentaje),
        tiempoTotal: this.toNumber(item.tiempoTotal),
        lineasHora: this.toNumber(item.lineasHora),
        volumen: this.toNumber(item.volumen),
        equipo: item.equipo || ""
      })),
      erroresTabla: errores.map((item) => ({
        fecha: item.fecha,
        nivelIncorrecto: this.toNumber(item.nivelIncorrecto),
        cantidadIncorrecta: this.toNumber(item.cantidadIncorrecta),
        seHaSaltado: this.toNumber(item.seHaSaltado),
        productoEquivocado: this.toNumber(item.productoEquivocado),
        desordenado: this.toNumber(item.desordenado),
        malEtiquetado: this.toNumber(item.malEtiquetado),
        maltratado: this.toNumber(item.maltratado),
        noHaceCambio: this.toNumber(item.noHaceCambio),
        totalErrores: this.toNumber(item.totalErrores),
        errorPctTotal: this.toNumber(item.errorPctTotal),
        errorPctTexto: this.toPct(item.errorPctTotal)
      })),
      erroresResumen: [],
      chartLineasHora: [],
      chartProductividad: [],
      chartErrores: []
    };
  },


  toDocumentosView(documentacion) {
    const items = ((documentacion.detalle || {}).items) || [];

    return items.map((item) => ({
      key: item.id,
      titulo: item.nombre || item.id,
      completado: item.estado === "COMPLETADO",
      fecha: item.fecha || ""
    }));
  },


  toEvaluacionesView(evaluaciones) {
    const resumen = evaluaciones.resumen || {};
    return Array.isArray(resumen.evaluaciones) ? resumen.evaluaciones : [];
  },


  toObservacionesView(observaciones) {
    const texto = String(observaciones || "").trim();

    if (!texto) {
      return [];
    }

    return [{
      autor: "Sistema",
      fecha: "",
      texto: texto
    }];
  },


  toRiskLevel(riesgo) {
    const nivel = String(riesgo || "").toUpperCase();

    if (nivel === String(CONFIG.RIESGO.ALTO || "").toUpperCase()) {
      return "alto";
    }

    if (nivel === String(CONFIG.RIESGO.MEDIO || "").toUpperCase()) {
      return "medio";
    }

    return "bajo";
  },


  toPct(value) {
    const n = Number(value || 0);
    return Math.round(n * 10000) / 100 + "%";
  },


  toNumber(value) {
    const n = Number(value || 0);
    return isNaN(n) ? 0 : n;
  },


  /*******************************************************************
   * WRAPPERS DE COMPATIBILIDAD PUBLICA
   *******************************************************************/
  updateCheck(id, key, valor) {
    const updated = SeguimientoService.updateCheck(id, key, valor);
    return updated || this.getExpediente(id);
  },


  updateEstado(id, estado) {
    const updated = SeguimientoService.updateEstado(id, estado);
    return updated || this.getExpediente(id);
  },


  updateFase(id, idFase) {
    const updated = SeguimientoService.updateFase(id, idFase);
    return updated || this.getExpediente(id);
  },


  updateTutor(id, tutor) {
    const updated = SeguimientoService.updateTutor(id, tutor);
    return updated || this.getExpediente(id);
  },


  updatePdaFirma(id, firmado) {
    const updated = SeguimientoService.updatePdaFirma(id, firmado);
    return updated || this.getExpediente(id);
  }

};


/*********************************************************************
 * METODOS GLOBALES
 *********************************************************************/

function getExpediente(id) {
  return ExpedienteService.getExpediente(id);
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
