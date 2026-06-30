/*********************************************************************
 * SGF ERP v3
 * SeguimientoService.js
 * -------------------------------------------------------------------
 * Servicio agregador de seguimiento.
 *
 * Regla:
 * - No introduce reglas de negocio nuevas.
 * - No recalcula KPIs ni riesgo.
 * - Agrega informacion de servicios de dominio existentes.
 *********************************************************************/

const SeguimientoService = {

  /*******************************************************************
   * BLOQUE 1 - API PUBLICA
   *******************************************************************/
  getAllSeguimientos() {
    return PersonaService
      .getAll()
      .map((persona) => this.buildSeguimientoFromPersona(persona))
      .filter((item) => !!item && !!item.persona);
  },


  getSeguimientoByPersona(personaId) {
    return this.getSeguimiento(personaId);
  },


  getSeguimiento(personaId) {
    const persona = PersonaService.getById(personaId);

    if (!persona) {
      return {
        persona: null,
        resumen: this.buildResumen(null),
        progreso: {},
        riesgo: {},
        timeline: [],
        checklist: {},
        grafana: {},
        documentacion: {},
        evaluaciones: {},
        indicadores: {},
        pendientes: {},
        alertas: []
      };
    }

    return this.buildSeguimientoFromPersona(persona);
  },


  getSeguimientosByTutor(tutor) {
    const needle = this.normalizeText(tutor);

    return this.getAllSeguimientos().filter((s) => {
      const value = (s.resumen && s.resumen.tutor) || (s.persona && s.persona.tutor) || "";
      return this.normalizeText(value) === needle;
    });
  },


  getSeguimientosByPrograma(programa) {
    const needle = this.normalizeText(programa);

    return this.getAllSeguimientos().filter((s) => {
      const value = (s.persona && s.persona.programa) || "";
      return this.normalizeText(value) === needle;
    });
  },


  getSeguimientosByDepartamento(departamento) {
    const needle = this.normalizeText(departamento);

    return this.getAllSeguimientos().filter((s) => {
      const value = (s.persona && s.persona.departamento) || "";
      return this.normalizeText(value) === needle;
    });
  },


  getSeguimientosByEstado(estado) {
    const needle = this.normalizeText(estado);

    return this.getAllSeguimientos().filter((s) => {
      const value = (s.resumen && s.resumen.estado) || (s.persona && s.persona.estado) || "";
      return this.normalizeText(value) === needle;
    });
  },


  getSeguimientosByRiesgo(riesgo) {
    const needle = this.normalizeText(riesgo);

    return this.getAllSeguimientos().filter((s) => {
      const value = (s.riesgo && s.riesgo.nivel) || "";
      return this.normalizeText(value) === needle;
    });
  },


  searchSeguimientos(texto) {
    const needle = this.normalizeText(texto);

    if (!needle) {
      return this.getAllSeguimientos();
    }

    return this.getAllSeguimientos().filter((s) => {
      const persona = s.persona || {};
      const resumen = s.resumen || {};

      const haystack = this.normalizeText([
        persona.nombre || "",
        persona.id || "",
        resumen.tutor || persona.tutor || "",
        persona.programa || "",
        persona.departamento || ""
      ].join(" "));

      return haystack.indexOf(needle) >= 0;
    });
  },


  updateCheck(personaId, checkId, valor) {
    const shouldComplete = valor === true || String(valor).toLowerCase() === "true";

    if (shouldComplete) {
      ChecklistService.complete(personaId, checkId, "", "");
    } else {
      ChecklistService.undo(personaId, checkId);
    }

    return this.getSeguimientoByPersona(personaId);
  },


  updateEstado(personaId, estado) {
    PersonaService.update(personaId, { estado: estado });
    return this.getSeguimientoByPersona(personaId);
  },


  updateFase(personaId, idFase) {
    PersonaService.update(personaId, { idFase: idFase });
    return this.getSeguimientoByPersona(personaId);
  },


  updateTutor(personaId, tutor) {
    PersonaService.update(personaId, { tutor: tutor });
    return this.getSeguimientoByPersona(personaId);
  },


  updatePdaFirma(personaId, firmado) {
    PersonaService.update(personaId, { pdaDocumento: firmado });
    return this.getSeguimientoByPersona(personaId);
  },


  buildSeguimientoFromPersona(persona) {
    if (!persona || !persona.id) {
      return {
        persona: null,
        resumen: this.buildResumen(null),
        progreso: {},
        riesgo: {},
        timeline: [],
        checklist: {},
        grafana: {},
        documentacion: {},
        evaluaciones: {},
        indicadores: {},
        pendientes: {},
        alertas: []
      };
    }

    const checklist = this.getChecklistData(persona.id);
    const grafana = this.getGrafanaData(persona.id);
    const documentacion = this.getDocumentacionData(persona.id);
    const evaluaciones = this.getEvaluacionesData(persona.id);

    const resumen = this.buildResumen(persona);
    const progreso = this.buildProgreso(persona, checklist, documentacion);
    const riesgo = this.buildRiesgo(persona);
    const timeline = this.buildTimeline(persona, checklist, grafana, documentacion, evaluaciones);
    const indicadores = this.buildIndicadores(persona, checklist, grafana, documentacion, evaluaciones);
    const pendientes = this.buildPendientes(persona, checklist, grafana, documentacion, evaluaciones);
    const alertas = this.buildAlertas(persona, checklist, grafana, documentacion, evaluaciones, pendientes);

    return {
      persona: persona,
      resumen: resumen,
      progreso: progreso,
      riesgo: riesgo,
      timeline: timeline,
      checklist: checklist,
      grafana: grafana,
      documentacion: documentacion,
      evaluaciones: evaluaciones,
      indicadores: indicadores,
      pendientes: pendientes,
      alertas: alertas
    };
  },


  getSeguimientoResumen(personaId) {
    return this.getSeguimiento(personaId).resumen;
  },


  getEstadoSeguimiento(personaId) {
    return this.getSeguimiento(personaId).resumen.estado || "";
  },


  getColorSeguimiento(personaId) {
    const riesgo = this.getSeguimiento(personaId).riesgo || {};
    return riesgo.color || (CONFIG.COLORS ? CONFIG.COLORS.INFO : "#0D6EFD");
  },


  getTimeline(personaId) {
    return this.getSeguimiento(personaId).timeline;
  },


  getIndicadores(personaId) {
    return this.getSeguimiento(personaId).indicadores;
  },


  getPendientes(personaId) {
    return this.getSeguimiento(personaId).pendientes;
  },


  getAlertas(personaId) {
    return this.getSeguimiento(personaId).alertas;
  },


  /*******************************************************************
   * BLOQUE 2 - CARGA DE SERVICIOS DE DOMINIO
   *******************************************************************/
  getChecklistData(personaId) {
    const progress = this.safeCall(
      ChecklistService,
      "getProgress",
      [personaId],
      PersonaService.getChecklistProgress(PersonaService.getById(personaId) || {})
    );

    const pending = this.safeCall(ChecklistService, "getPending", [personaId], []);
    const grouped = this.safeCall(ChecklistService, "getGrouped", [personaId], {});
    const nextAction = this.safeCall(ChecklistService, "getNextAction", [personaId], "");

    return {
      porcentaje: progress || 0,
      pendientes: pending || [],
      grouped: grouped || {},
      siguienteAccion: nextAction || "",
      totalPendientes: (pending || []).length
    };
  },


  getGrafanaData(personaId) {
    const resumen = this.safeCall(GrafanaService, "getResumenGrafanaByPersona", [personaId], {});
    const productividad = this.safeCall(GrafanaService, "getProductividadByPersona", [personaId], []);
    const errores = this.safeCall(GrafanaService, "getErroresByPersona", [personaId], []);
    const historico = this.safeCall(GrafanaService, "getHistoricoByPersona", [personaId], []);

    return {
      resumen: resumen || {},
      productividad: productividad || [],
      errores: errores || [],
      historico: historico || []
    };
  },


  getDocumentacionData(personaId) {
    const detalle = this.safeCall(DocumentService, "getDocumentacionByPersona", [personaId], {
      personaId: personaId,
      porcentaje: 0,
      estado: "PENDIENTE",
      color: CONFIG.COLORS ? CONFIG.COLORS.DANGER : "#DC3545",
      pendientes: 0,
      completados: 0,
      obligatorios: 0,
      opcionales: 0,
      items: []
    });

    const pendientes = this.safeCall(DocumentService, "getPendientes", [personaId], []);

    return {
      detalle: detalle,
      pendientes: pendientes || []
    };
  },


  getEvaluacionesData(personaId) {
    const resumen = this.safeCall(EvaluacionService, "getResumenEvaluaciones", [personaId], {
      personaId: personaId,
      media: 0,
      ultimaEvaluacion: null,
      proximaEvaluacion: null,
      estado: "SIN_EVALUAR",
      color: CONFIG.COLORS ? CONFIG.COLORS.INFO : "#0D6EFD",
      pendientes: 0,
      completadas: 0,
      evaluaciones: []
    });

    const pendientes = this.safeCall(EvaluacionService, "getPendientes", [personaId], []);
    const completadas = this.safeCall(EvaluacionService, "getCompletadas", [personaId], []);

    return {
      resumen: resumen,
      pendientes: pendientes || [],
      completadas: completadas || []
    };
  },


  /*******************************************************************
   * BLOQUE 3 - BUILDERS DE AGREGACION
   *******************************************************************/
  buildResumen(persona) {
    if (!persona) {
      return {
        diasSeguimiento: 0,
        diasRestantes: 0,
        porcentajeSeguimiento: 0,
        fase: "",
        estado: "",
        tutor: ""
      };
    }

    return {
      diasSeguimiento: PersonaService.getDiasSeguimiento(persona),
      diasRestantes: PersonaService.toNumber(persona.diasRestantes),
      porcentajeSeguimiento: PersonaService.getPorcentajeSeguimiento(persona),
      fase: persona.idFase || "",
      estado: persona.estado || "",
      tutor: persona.tutor || ""
    };
  },


  buildProgreso(persona, checklist, documentacion) {
    return {
      seguimiento: PersonaService.getPorcentajeSeguimiento(persona),
      checklist: checklist.porcentaje || 0,
      documentacion: (documentacion.detalle && documentacion.detalle.porcentaje) || 0
    };
  },


  buildRiesgo(persona) {
    return {
      nivel: PersonaService.getRiesgo(persona),
      color: PersonaService.getColorRiesgo(persona)
    };
  },


  buildIndicadores(persona, checklist, grafana, documentacion, evaluaciones) {
    return {
      productividad: (grafana.resumen && grafana.resumen.productividadMedia) || 0,
      error: (grafana.resumen && grafana.resumen.errorMedio) || 0,
      mediaEvaluaciones: (evaluaciones.resumen && evaluaciones.resumen.media) || 0,
      porcentajeChecklist: checklist.porcentaje || 0,
      porcentajeDocumentacion: (documentacion.detalle && documentacion.detalle.porcentaje) || 0,
      riesgo: PersonaService.getRiesgo(persona)
    };
  },


  buildPendientes(persona, checklist, grafana, documentacion, evaluaciones) {
    const alertasGrafana = (grafana.errores || []).filter((item) => {
      return PersonaService.toNumber(item.totalErrores) > 0;
    });

    return {
      checklist: checklist.pendientes || [],
      documentacion: documentacion.pendientes || [],
      evaluaciones: evaluaciones.pendientes || [],
      alertasGrafana: alertasGrafana,
      total: (checklist.totalPendientes || 0) +
             ((documentacion.pendientes || []).length) +
             ((evaluaciones.pendientes || []).length) +
             (alertasGrafana.length)
    };
  },


  buildAlertas(persona, checklist, grafana, documentacion, evaluaciones, pendientes) {
    const alertas = [];

    if ((pendientes.checklist || []).length) {
      alertas.push({
        origen: "ChecklistService",
        tipo: "CHECKLIST_PENDIENTE",
        mensaje: "Hay checks pendientes",
        total: pendientes.checklist.length
      });
    }

    if ((pendientes.documentacion || []).length) {
      alertas.push({
        origen: "DocumentService",
        tipo: "DOCUMENTACION_PENDIENTE",
        mensaje: "Hay documentacion pendiente",
        total: pendientes.documentacion.length
      });
    }

    if ((pendientes.evaluaciones || []).length) {
      alertas.push({
        origen: "EvaluacionService",
        tipo: "EVALUACIONES_PENDIENTES",
        mensaje: "Hay evaluaciones pendientes",
        total: pendientes.evaluaciones.length
      });
    }

    if ((pendientes.alertasGrafana || []).length) {
      alertas.push({
        origen: "GrafanaService",
        tipo: "ALERTAS_GRAFANA",
        mensaje: "Grafana reporta errores",
        total: pendientes.alertasGrafana.length
      });
    }

    alertas.push({
      origen: "PersonaService",
      tipo: "RIESGO",
      mensaje: "Riesgo actual",
      valor: PersonaService.getRiesgo(persona)
    });

    return alertas;
  },


  buildTimeline(persona, checklist, grafana, documentacion, evaluaciones) {
    const eventos = [];

    if (persona.fechaIncorporacion) {
      eventos.push({
        fecha: persona.fechaIncorporacion,
        tipo: "INCORPORACION",
        titulo: "Incorporacion",
        descripcion: "Inicio de seguimiento"
      });
    }

    const checklistEventos = (checklist.pendientes || []).map((item) => {
      return {
        fecha: "",
        tipo: "CHECKLIST",
        titulo: item.nombre || item.id || "Checklist",
        descripcion: "Pendiente"
      };
    });

    const evaluacionesEventos = ((evaluaciones.resumen && evaluaciones.resumen.evaluaciones) || []).map((item) => {
      return {
        fecha: item.fecha || "",
        tipo: "EVALUACION",
        titulo: item.competencia || "Evaluacion",
        descripcion: item.estado || ""
      };
    });

    const documentacionEventos = ((documentacion.detalle && documentacion.detalle.items) || []).map((item) => {
      return {
        fecha: item.fecha || "",
        tipo: "DOCUMENTACION",
        titulo: item.nombre || "Documento",
        descripcion: item.estado || ""
      };
    });

    const grafanaEventos = (grafana.historico || []).map((item) => {
      return {
        fecha: item.fecha || "",
        tipo: "GRAFANA",
        titulo: "Registro Grafana",
        descripcion: "Productividad y errores"
      };
    });

    const observacionesEventos = this.buildObservacionesTimeline(persona);

    this.mergeTimeline(eventos, checklistEventos);
    this.mergeTimeline(eventos, evaluacionesEventos);
    this.mergeTimeline(eventos, documentacionEventos);
    this.mergeTimeline(eventos, grafanaEventos);
    this.mergeTimeline(eventos, observacionesEventos);

    return this.sortTimeline(eventos);
  },


  mergeTimeline(base, incoming) {
    (incoming || []).forEach((item) => base.push(item));
    return base;
  },


  sortTimeline(eventos) {
    return (eventos || [])
      .slice()
      .sort((a, b) => {
        const ta = a.fecha ? new Date(a.fecha).getTime() : 0;
        const tb = b.fecha ? new Date(b.fecha).getTime() : 0;
        return tb - ta;
      });
  },


  buildObservacionesTimeline(persona) {
    const texto = String(persona.observaciones || "").trim();

    if (!texto) {
      return [];
    }

    return [{
      fecha: "",
      tipo: "OBSERVACION",
      titulo: "Observacion",
      descripcion: texto
    }];
  },


  /*******************************************************************
   * BLOQUE 4 - UTILIDADES
   *******************************************************************/
  normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  },


  safeCall(service, method, args, fallback) {
    if (typeof service === "undefined") {
      return fallback;
    }

    if (typeof service[method] !== "function") {
      return fallback;
    }

    try {
      return service[method].apply(service, args || []);
    } catch (error) {
      console.warn("SeguimientoService.safeCall:", method, error);
      return fallback;
    }
  }

};


/*********************************************************************
 * WRAPPERS GLOBALES DE COMPATIBILIDAD
 *********************************************************************/

function getSeguimiento(personaId) {
  return SeguimientoService.getSeguimiento(personaId);
}


function getSeguimientoResumen(personaId) {
  return SeguimientoService.getSeguimientoResumen(personaId);
}


function getSeguimientoTimeline(personaId) {
  return SeguimientoService.getTimeline(personaId);
}


function getAllSeguimientos() {
  return SeguimientoService.getAllSeguimientos();
}


function getSeguimientoByPersona(personaId) {
  return SeguimientoService.getSeguimientoByPersona(personaId);
}


function getSeguimientosByTutor(tutor) {
  return SeguimientoService.getSeguimientosByTutor(tutor);
}


function getSeguimientosByPrograma(programa) {
  return SeguimientoService.getSeguimientosByPrograma(programa);
}


function getSeguimientosByDepartamento(departamento) {
  return SeguimientoService.getSeguimientosByDepartamento(departamento);
}


function getSeguimientosByEstado(estado) {
  return SeguimientoService.getSeguimientosByEstado(estado);
}


function getSeguimientosByRiesgo(riesgo) {
  return SeguimientoService.getSeguimientosByRiesgo(riesgo);
}


function searchSeguimientos(texto) {
  return SeguimientoService.searchSeguimientos(texto);
}
