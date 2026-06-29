
/*********************************************************************
 * SGF ERP v3
 * ExpedienteService.js
 * -------------------------------------------------------------------
 * Núcleo del expediente del trabajador.
 *
 * Fuente principal:
 * - MAESTRO_PERSONAS
 *
 * Fuente de rendimiento:
 * - SEGUIMIENTO_GRAFANA_HISTORICO
 *
 * El expediente reúne:
 * - Persona
 * - Checklist simple desde columnas de MAESTRO_PERSONAS
 * - KPIs
 * - Grafana histórico
 * - Productividad
 * - Errores
 * - Documentos
 * - Observaciones
 * - Evaluaciones
 * - Timeline
 *********************************************************************/

const ExpedienteService = {

  /*******************************************************************
   * CONFIGURACIÓN
   *******************************************************************/
  CHECKS: [
    {
      key: "rrhh",
      campo: "RRHH",
      titulo: "RRHH"
    },
    {
      key: "almuerzo",
      campo: "ALMUERZO",
      titulo: "Almuerzo"
    },
    {
      key: "uniforme",
      campo: "UNIFORME",
      titulo: "Uniforme"
    },
    {
      key: "psicotecnico",
      campo: "PSICOTECNICO",
      titulo: "Psicotécnico"
    },
    {
      key: "formacionBienvenida",
      campo: "FORMACION_BIENVENIDA",
      titulo: "Formación bienvenida"
    },
    {
      key: "tourEmpresa",
      campo: "TOUR_EMPRESA",
      titulo: "Tour empresa"
    }
  ],

  CHECKS_PDA: [
    {
      key: "pdaEntregada",
      campo: "PDA_ENTREGADA",
      titulo: "PDA entregada"
    },
    {
      key: "pdaDocumento",
      campo: "PDA_DOCUMENTO",
      titulo: "Documento PDA firmado"
    }
  ],

  ERROR_FIELDS: [
    {
      key: "nivelIncorrecto",
      campo: "NIVEL_INCORRECTO",
      titulo: "Nivel incorrecto"
    },
    {
      key: "cantidadIncorrecta",
      campo: "CANTIDAD_INCORRECTA",
      titulo: "Cantidad incorrecta"
    },
    {
      key: "seHaSaltado",
      campo: "SE_HA_SALTADO",
      titulo: "Se ha saltado"
    },
    {
      key: "productoEquivocado",
      campo: "PRODUCTO_EQUIVOCADO",
      titulo: "Producto equivocado"
    },
    {
      key: "desordenado",
      campo: "DESORDENADO",
      titulo: "Desordenado"
    },
    {
      key: "malEtiquetado",
      campo: "MAL_ETIQUETADO",
      titulo: "Mal etiquetado"
    },
    {
      key: "maltratado",
      campo: "MALTRATADO",
      titulo: "Maltratado"
    },
    {
      key: "noHaceCambio",
      campo: "NO_HACE_CAMBIO",
      titulo: "No hace cambio"
    }
  ],

  OBJETIVO_LINEAS_HORA: 80,


  /*******************************************************************
   * EXPEDIENTE COMPLETO
   *******************************************************************/
  getExpediente(idTrabajador) {
    const persona = PersonaService.getById(idTrabajador);

    if (!persona) {
      throw new Error("No se ha encontrado la persona con ID: " + idTrabajador);
    }

    const checklist = this.getChecklist(persona);
    const grafanaHistorico = this.getGrafanaHistorico(idTrabajador);
    const grafanaResumen = this.getGrafanaResumen(grafanaHistorico);
    const erroresResumen = this.getErroresResumen(grafanaHistorico);
    const kpis = this.getKPIs(persona, checklist, grafanaResumen);

    return {
      persona: this.getPersonaResumen(persona),
      checklist: checklist,
      kpis: kpis,
      grafana: {
        resumen: grafanaResumen,
        historico: grafanaHistorico,
        productividadTabla: this.getProductividadTabla(grafanaHistorico),
        erroresTabla: this.getErroresTabla(grafanaHistorico),
        erroresResumen: erroresResumen,
        chartLineasHora: this.getChartLineasHora(grafanaHistorico),
        chartProductividad: this.getChartProductividad(grafanaHistorico),
        chartErrores: this.getChartErrores(grafanaHistorico)
      },
      documentos: this.getDocumentos(persona),
      observaciones: this.getObservaciones(idTrabajador),
      evaluaciones: this.getEvaluaciones(idTrabajador),
      timeline: this.getTimeline(idTrabajador, persona, checklist, grafanaHistorico),
      objetivos: this.getObjetivos(persona, checklist, grafanaResumen),
      estadoGeneral: this.getEstadoGeneral(persona, checklist, grafanaResumen)
    };
  },


  /*******************************************************************
   * PERSONA
   *******************************************************************/
  getPersonaResumen(persona) {
    return {
      id: persona.id,
      nombre: persona.nombre,
      programa: persona.programa,
      fechaIncorporacion: persona.fechaIncorporacion,
      departamento: persona.departamento,
      horaEntrada: persona.horaEntrada,
      observaciones: persona.observaciones,
      idPrograma: persona.idPrograma,
      idFase: persona.idFase,
      estado: persona.estado,
      diasSeguimiento: PersonaService.diasSeguimiento(persona),
      diasRestantes: persona.diasRestantes,
      tutor: persona.tutor,
      ultimaEvaluacion: persona.ultimaEvaluacion,
      mediaEvaluaciones: persona.mediaEvaluaciones,
      riesgo: PersonaService.getRiesgo(persona),
      porcentajePreparacion: persona.porcentajePreparacion,
      productividad: PersonaService.getProductividadMedia(persona),
      error: PersonaService.getErrorMedio(persona),
      ultimaGrafana: persona.ultimaGrafana || persona.ultimaFechaGrafana
    };
  },


  /*******************************************************************
   * CHECKLIST SIMPLE DESDE MAESTRO_PERSONAS
   *******************************************************************/
  getChecklist(persona) {
    const checks = this.CHECKS.concat(this.CHECKS_PDA);

    const items = checks.map(check => {
      const valor = persona[check.key];

      return {
        key: check.key,
        campo: check.campo,
        titulo: check.titulo,
        completado: PersonaService.isTrue(valor),
        valor: valor
      };
    });

    const completados = items.filter(item => item.completado).length;
    const total = items.length;
    const porcentaje = total ? Math.round((completados / total) * 100) : 0;

    return {
      total: total,
      completados: completados,
      pendientes: total - completados,
      porcentaje: porcentaje,
      items: items
    };
  },


  /*******************************************************************
   * KPIs PRINCIPALES DEL EXPEDIENTE
   *******************************************************************/
  getKPIs(persona, checklist, grafanaResumen) {
    return {
      preparacion: checklist.porcentaje,
      checklistCompletados: checklist.completados,
      checklistTotal: checklist.total,
      productividadMedia: grafanaResumen.productividadMedia,
      lineasHoraMedia: grafanaResumen.lineasHoraMedia,
      errorMedio: grafanaResumen.errorMedio,
      totalLineas: grafanaResumen.totalLineas,
      totalErrores: grafanaResumen.totalErrores,
      diasConDatos: grafanaResumen.diasConDatos,
      objetivoLineasHora: this.OBJETIVO_LINEAS_HORA,
      superaObjetivo: grafanaResumen.lineasHoraMedia >= this.OBJETIVO_LINEAS_HORA,
      riesgo: PersonaService.getRiesgo(persona),
      ultimaEvaluacion: persona.ultimaEvaluacion,
      mediaEvaluaciones: persona.mediaEvaluaciones
    };
  },


  /*******************************************************************
   * GRAFANA HISTÓRICO
   *******************************************************************/
  getGrafanaHistorico(idTrabajador) {
    const sheetName = this.getGrafanaSheetName();

    if (!sheetName) {
      return [];
    }

    let rows = [];

    try {
      rows = DataService.getAll(sheetName);
    } catch (error) {
      console.warn("No se pudo leer SEGUIMIENTO_GRAFANA_HISTORICO:", error);
      return [];
    }

    return rows
      .filter(row => {
        return String(row.ID_TRABAJADOR || row["ID Trabajador"] || "") === String(idTrabajador);
      })
      .map(row => this.normalizeGrafanaRow(row))
      .sort((a, b) => {
        return new Date(a.fecha) - new Date(b.fecha);
      });
  },


  getGrafanaSheetName() {
    if (CONFIG.SHEETS.SEGUIMIENTO_GRAFANA_HISTORICO) {
      return CONFIG.SHEETS.SEGUIMIENTO_GRAFANA_HISTORICO;
    }

    if (CONFIG.SHEETS.GRAFANA_HISTORICO) {
      return CONFIG.SHEETS.GRAFANA_HISTORICO;
    }

    if (CONFIG.SHEETS.PRODUCTIVIDAD_RAW) {
      return CONFIG.SHEETS.PRODUCTIVIDAD_RAW;
    }

    return "SEGUIMIENTO_GRAFANA_HISTORICO";
  },


  normalizeGrafanaRow(row) {
    row = row || {};

    return {
      fecha: this.pick(row, ["FECHA", "Fecha"]),
      idTrabajador: this.pick(row, ["ID_TRABAJADOR", "ID Trabajador"]),
      nombre: this.pick(row, ["NOMBRE", "NOMBRE_COMPLETO"]),
      tipoPrograma: this.pick(row, ["TIPO_PROGRAMA"]),
      fechaIncorporacion: this.pick(row, ["FECHA_INCORPORACION"]),
      departamento: this.pick(row, ["DEPARTAMENTO", "DEPARTAMENTO_ORIGEN"]),
      totalLineas: this.toNumber(this.pick(row, ["TOTAL_LINEAS"])),
      lineasEsperadas: this.toNumber(this.pick(row, ["LINEAS_ESPERADAS"])),
      porcentaje: this.toNumber(this.pick(row, ["PORCENTAJE"])),
      tiempoTotal: this.toNumber(this.pick(row, ["TIEMPO_TOTAL"])),
      lineasHora: this.toNumber(this.pick(row, ["LINEAS_HORA"])),
      volumen: this.toNumber(this.pick(row, ["VOLUMEN"])),
      equipo: this.pick(row, ["EQUIPO"]),

      nivelIncorrecto: this.toNumber(this.pick(row, ["NIVEL_INCORRECTO"])),
      cantidadIncorrecta: this.toNumber(this.pick(row, ["CANTIDAD_INCORRECTA"])),
      seHaSaltado: this.toNumber(this.pick(row, ["SE_HA_SALTADO"])),
      productoEquivocado: this.toNumber(this.pick(row, ["PRODUCTO_EQUIVOCADO"])),
      desordenado: this.toNumber(this.pick(row, ["DESORDENADO"])),
      malEtiquetado: this.toNumber(this.pick(row, ["MAL_ETIQUETADO"])),
      maltratado: this.toNumber(this.pick(row, ["MALTRATADO"])),
      noHaceCambio: this.toNumber(this.pick(row, ["NO_HACE_CAMBIO"])),
      totalErrores: this.toNumber(this.pick(row, ["TOTAL_ERRORES"])),
      errorPctTotal: this.toNumber(this.pick(row, ["ERROR_PCT_TOTAL"])),

      idRevisor: this.pick(row, ["ID_REVISOR"]),
      codigoRevisor: this.pick(row, ["CODIGO_REVISOR"]),
      nombreRevisor: this.pick(row, ["NOMBRE_REVISOR"]),
      tutor: this.pick(row, ["TUTOR"]),
      raw: row
    };
  },


  /*******************************************************************
   * TABLAS GRAFANA
   *******************************************************************/
  getProductividadTabla(historico) {
    return historico.map(item => {
      return {
        fecha: item.fecha,
        totalLineas: item.totalLineas,
        lineasEsperadas: item.lineasEsperadas,
        porcentaje: item.porcentaje,
        porcentajeTexto: this.formatPct(item.porcentaje),
        tiempoTotal: item.tiempoTotal,
        lineasHora: item.lineasHora,
        volumen: item.volumen,
        equipo: item.equipo
      };
    });
  },


  getErroresTabla(historico) {
    return historico.map(item => {
      return {
        fecha: item.fecha,
        nivelIncorrecto: item.nivelIncorrecto,
        cantidadIncorrecta: item.cantidadIncorrecta,
        seHaSaltado: item.seHaSaltado,
        productoEquivocado: item.productoEquivocado,
        desordenado: item.desordenado,
        malEtiquetado: item.malEtiquetado,
        maltratado: item.maltratado,
        noHaceCambio: item.noHaceCambio,
        totalErrores: item.totalErrores,
        errorPctTotal: item.errorPctTotal,
        errorPctTexto: this.formatPct(item.errorPctTotal)
      };
    });
  },


  /*******************************************************************
   * RESUMEN GRAFANA
   *******************************************************************/
  getGrafanaResumen(historico) {
    if (!historico || !historico.length) {
      return {
        diasConDatos: 0,
        productividadMedia: 0,
        lineasHoraMedia: 0,
        errorMedio: 0,
        totalLineas: 0,
        totalErrores: 0,
        mejorDia: null,
        peorDia: null,
        ultimaFecha: null,
        tendenciaLineasHora: 0,
        tendenciaProductividad: 0,
        tendenciaErrores: 0
      };
    }

    let totalProductividad = 0;
    let totalLineasHora = 0;
    let totalErrorPct = 0;
    let totalLineas = 0;
    let totalErrores = 0;

    historico.forEach(item => {
      totalProductividad += item.porcentaje;
      totalLineasHora += item.lineasHora;
      totalErrorPct += item.errorPctTotal;
      totalLineas += item.totalLineas;
      totalErrores += item.totalErrores;
    });

    const dias = historico.length;

    const ordenLineasHora = historico.slice().sort((a, b) => {
      return b.lineasHora - a.lineasHora;
    });

    const mejorDia = ordenLineasHora[0];
    const peorDia = ordenLineasHora[ordenLineasHora.length - 1];

    return {
      diasConDatos: dias,
      productividadMedia: this.round((totalProductividad / dias) * 100, 1),
      productividadMediaRaw: this.round(totalProductividad / dias, 3),
      lineasHoraMedia: this.round(totalLineasHora / dias, 1),
      errorMedio: this.round((totalErrorPct / dias) * 100, 2),
      errorMedioRaw: this.round(totalErrorPct / dias, 4),
      totalLineas: totalLineas,
      totalErrores: totalErrores,
      mejorDia: mejorDia,
      peorDia: peorDia,
      ultimaFecha: historico[historico.length - 1].fecha,
      tendenciaLineasHora: this.getTendencia(historico, "lineasHora"),
      tendenciaProductividad: this.getTendencia(historico, "porcentaje"),
      tendenciaErrores: this.getTendencia(historico, "errorPctTotal")
    };
  },


  getErroresResumen(historico) {
    const resumen = {};

    this.ERROR_FIELDS.forEach(field => {
      resumen[field.key] = {
        titulo: field.titulo,
        total: 0
      };
    });

    historico.forEach(item => {
      this.ERROR_FIELDS.forEach(field => {
        resumen[field.key].total += item[field.key] || 0;
      });
    });

    return Object.keys(resumen)
      .map(key => {
        return {
          key: key,
          titulo: resumen[key].titulo,
          total: resumen[key].total
        };
      })
      .sort((a, b) => b.total - a.total);
  },


  /*******************************************************************
   * CHART DATA
   *******************************************************************/
  getChartLineasHora(historico) {
    return historico.map(item => {
      return {
        fecha: this.formatFechaCorta(item.fecha),
        lineasHora: item.lineasHora,
        objetivo: this.OBJETIVO_LINEAS_HORA
      };
    });
  },


  getChartProductividad(historico) {
    return historico.map(item => {
      return {
        fecha: this.formatFechaCorta(item.fecha),
        productividad: this.round(item.porcentaje * 100, 1)
      };
    });
  },


  getChartErrores(historico) {
    return historico.map(item => {
      return {
        fecha: this.formatFechaCorta(item.fecha),
        error: this.round(item.errorPctTotal * 100, 2),
        totalErrores: item.totalErrores
      };
    });
  },


  /*******************************************************************
   * OBJETIVOS
   *******************************************************************/
  getObjetivos(persona, checklist, grafanaResumen) {
    const objetivos = [
      {
        key: "checklist",
        titulo: "Preparación 100%",
        valor: checklist.porcentaje,
        objetivo: 100,
        completado: checklist.porcentaje >= 100,
        texto: checklist.porcentaje + "%"
      },
      {
        key: "lineasHora",
        titulo: "Mínimo 80 l/h",
        valor: grafanaResumen.lineasHoraMedia,
        objetivo: this.OBJETIVO_LINEAS_HORA,
        completado: grafanaResumen.lineasHoraMedia >= this.OBJETIVO_LINEAS_HORA,
        texto: grafanaResumen.lineasHoraMedia + " l/h"
      },
      {
        key: "productividad",
        titulo: "Productividad positiva",
        valor: grafanaResumen.productividadMedia,
        objetivo: 80,
        completado: grafanaResumen.productividadMedia >= 80,
        texto: grafanaResumen.productividadMedia + "%"
      },
      {
        key: "errores",
        titulo: "Error controlado",
        valor: grafanaResumen.errorMedio,
        objetivo: 3,
        completado: grafanaResumen.errorMedio <= 3,
        texto: grafanaResumen.errorMedio + "%"
      }
    ];

    return objetivos;
  },


  getEstadoGeneral(persona, checklist, grafanaResumen) {
    const objetivos = this.getObjetivos(persona, checklist, grafanaResumen);
    const completados = objetivos.filter(o => o.completado).length;
    const total = objetivos.length;
    const porcentaje = Math.round((completados / total) * 100);

    let estado = "Necesita seguimiento";
    let nivel = "medio";

    if (porcentaje >= 100) {
      estado = "Preparado";
      nivel = "bajo";
    } else if (porcentaje < 50) {
      estado = "Requiere atención";
      nivel = "alto";
    }

    return {
      estado: estado,
      nivel: nivel,
      porcentaje: porcentaje,
      completados: completados,
      total: total
    };
  },


  /*******************************************************************
   * DOCUMENTOS
   *******************************************************************/
  getDocumentos(persona) {
    return [
      {
        key: "pdaDocumento",
        titulo: "Documento PDA firmado",
        completado: PersonaService.isTrue(persona.pdaDocumento),
        fecha: persona.pdaFechaFirma || ""
      }
    ];
  },


  /*******************************************************************
   * OBSERVACIONES / EVALUACIONES / TIMELINE
   *******************************************************************/
  getObservaciones(idTrabajador) {
    if (typeof ObservacionService === "undefined") {
      return [];
    }

    if (typeof ObservacionService.getByPersona !== "function") {
      return [];
    }

    return ObservacionService.getByPersona(idTrabajador);
  },


  getEvaluaciones(idTrabajador) {
    if (typeof EvaluacionService === "undefined") {
      return [];
    }

    if (typeof EvaluacionService.getByPersona !== "function") {
      return [];
    }

    return EvaluacionService.getByPersona(idTrabajador);
  },


  getTimeline(idTrabajador, persona, checklist, historico) {
    if (typeof TimelineService !== "undefined" &&
        typeof TimelineService.getByPersona === "function") {
      return TimelineService.getByPersona(idTrabajador);
    }

    const timeline = [];

    checklist.items.forEach(item => {
      if (item.completado) {
        timeline.push({
          fecha: "",
          tipo: "CHECKLIST",
          titulo: item.titulo,
          descripcion: item.titulo + " completado"
        });
      }
    });

    if (historico && historico.length) {
      historico.forEach(item => {
        timeline.push({
          fecha: item.fecha,
          tipo: "GRAFANA",
          titulo: "Registro Grafana",
          descripcion: item.lineasHora + " l/h · " + item.totalErrores + " errores"
        });
      });
    }

    return timeline.sort((a, b) => {
      return new Date(b.fecha || 0) - new Date(a.fecha || 0);
    });
  },


  /*******************************************************************
   * ACCIONES DESDE EL EXPEDIENTE
   *******************************************************************/
  updateCheck(idTrabajador, key, valor) {
    const check = this.getCheckDefinition(key);

    if (!check) {
      throw new Error("Check no permitido: " + key);
    }

    const persona = PersonaService.getById(idTrabajador);

    if (!persona) {
      throw new Error("Persona no encontrada: " + idTrabajador);
    }

    const data = {};
    data[check.key] = valor === true;

    const personaTemporal = Object.assign({}, persona, data);
    const checklist = this.getChecklist(personaTemporal);

    data.porcentajePreparacion = checklist.porcentaje;
    data.checklistCompletado = checklist.porcentaje >= 100;

    PersonaService.update(idTrabajador, data);

    return this.getExpediente(idTrabajador);
  },


  updateEstado(idTrabajador, estado) {
    PersonaService.update(idTrabajador, {
      estado: estado
    });

    return this.getExpediente(idTrabajador);
  },


  updateFase(idTrabajador, idFase) {
    PersonaService.update(idTrabajador, {
      idFase: idFase
    });

    return this.getExpediente(idTrabajador);
  },


  updateTutor(idTrabajador, tutor) {
    PersonaService.update(idTrabajador, {
      tutor: tutor
    });

    return this.getExpediente(idTrabajador);
  },


  updatePdaFirma(idTrabajador, firmado) {
    const data = {
      pdaDocumento: firmado === true
    };

    if (firmado === true) {
      data.pdaFechaFirma = new Date();
    } else {
      data.pdaFechaFirma = "";
    }

    PersonaService.update(idTrabajador, data);

    return this.getExpediente(idTrabajador);
  },


  getCheckDefinition(key) {
    const checks = this.CHECKS.concat(this.CHECKS_PDA);

    return checks.find(check => {
      return check.key === key || check.campo === key;
    }) || null;
  },


  /*******************************************************************
   * UTILIDADES
   *******************************************************************/
  pick(row, keys) {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      if (
        row[key] !== undefined &&
        row[key] !== null &&
        String(row[key]).trim() !== ""
      ) {
        return row[key];
      }
    }

    return "";
  },


  toNumber(valor) {
    if (valor === null || valor === undefined || valor === "") {
      return 0;
    }

    const n = Number(
      String(valor)
        .replace("%", "")
        .replace(",", ".")
        .trim()
    );

    return isNaN(n) ? 0 : n;
  },


  round(valor, decimals) {
    const factor = Math.pow(10, decimals || 0);
    return Math.round((valor || 0) * factor) / factor;
  },


  formatPct(valor) {
    return this.round(valor * 100, 1) + "%";
  },


  formatFechaCorta(fecha) {
    if (!fecha) return "";

    try {
      return Utilities.formatDate(
        new Date(fecha),
        CONFIG.APP.TIMEZONE,
        "dd/MM"
      );
    } catch (error) {
      return String(fecha);
    }
  },


  getTendencia(historico, key) {
    if (!historico || historico.length < 2) {
      return 0;
    }

    const primero = historico[0][key] || 0;
    const ultimo = historico[historico.length - 1][key] || 0;

    return this.round(ultimo - primero, 2);
  }

};


/*********************************************************************
 * MÉTODOS GLOBALES
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

