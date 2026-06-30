/*********************************************************************
 * SGF ERP v3
 * PersonaService.js
 * -------------------------------------------------------------------
 * Servicio maestro del dominio Personas.
 *
 * Arquitectura de dominio:
 * - Fuente de verdad: Google Sheets / MAESTRO_PERSONAS
 * - Regla: toda la logica de negocio de Personas vive aqui.
 *********************************************************************/

const PersonaService = {

  /*******************************************************************
   * BLOQUE 1 - OBTENCION DE DATOS
   *******************************************************************/
  getAll() {
    return DataService
      .getAll(CONFIG.SHEETS.PERSONAS)
      .map((row) => this.normalize(row))
      .filter((persona) => persona.id || persona.nombre);
  },


  getById(id) {
    if (id === undefined || id === null || id === "") {
      return null;
    }

    return this.getAll().find((persona) => {
      return String(persona.id) === String(id);
    }) || null;
  },


  buscar(texto) {
    const q = this.normalizar(texto);

    if (!q) {
      return this.getAll();
    }

    return this.getAll().filter((persona) => {
      const base = [
        persona.id,
        persona.nombre,
        persona.programa,
        persona.departamento,
        persona.tutor,
        persona.estado,
        this.getRiesgo(persona)
      ].join(" ");

      return this.normalizar(base).includes(q);
    });
  },


  normalize(row) {
    const source = row || {};

    const persona = {
      id: this.pick(source, ["ID_TRABAJADOR", "ID Trabajador", "ID"]),
      nombre: this.pick(source, ["NOMBRE_COMPLETO", "NOMBRE", "Nombre"]),
      programa: this.pick(source, ["TIPO_PROGRAMA", "PROGRAMA"]),
      fechaIncorporacion: this.pick(source, ["FECHA_INCORPORACION", "Fecha incorporación"]),
      departamento: this.pick(source, ["DEPARTAMENTO_ORIGEN", "DEPARTAMENTO"]),
      horaEntrada: this.pick(source, ["HORA_ENTRADA"]),
      observaciones: this.pick(source, ["OBSERVACIONES", "Observaciones"]),

      idPrograma: this.pick(source, ["ID_PROGRAMA"]),
      idFase: this.pick(source, ["ID_FASE"]),

      estado: this.pick(source, ["ESTADO"]) || CONFIG.ESTADOS.EN_CURSO,
      diasEnSeguimiento: this.toNumber(this.pick(source, ["DIAS_EN_SEGUIMIENTO"])),
      diasRestantes: this.toNumber(this.pick(source, ["DIAS_RESTANTES"])),

      rrhh: this.pick(source, ["RRHH"]),
      almuerzo: this.pick(source, ["ALMUERZO"]),
      uniforme: this.pick(source, ["UNIFORME"]),
      psicotecnico: this.pick(source, ["PSICOTECNICO"]),
      formacionBienvenida: this.pick(source, ["FORMACION_BIENVENIDA"]),
      tourEmpresa: this.pick(source, ["TOUR_EMPRESA"]),
      pdaEntregada: this.pick(source, ["PDA_ENTREGADA"]),
      pdaDocumento: this.pick(source, ["PDA_DOCUMENTO", "PDA_FIRMADA"]),
      pdaFechaFirma: this.pick(source, ["PDA_FECHA_FIRMA"]),

      tutor: this.pick(source, ["TUTOR_ASIGNADO", "TUTOR"]),

      ultimaEvaluacion: this.pick(source, ["ULTIMA_EVALUACION"]),
      mediaEvaluaciones: this.toNumber(this.pick(source, ["MEDIA_EVALUACIONES"])),

      riesgoOriginal: this.pick(source, ["RIESGO"]),
      porcentajePreparacion: this.toNumber(this.pick(source, ["PORCENTAJE_PREPARACION"])),
      checklistCompletado: this.pick(source, ["CHECKLIST_COMPLETADO"]),

      ultimaFechaGrafana: this.pick(source, ["ULTIMA_FECHA_GRAFANA"]),
      productividad: this.toNumber(this.pick(source, ["PRODUCTIVIDAD_MEDIA", "MEDIA_PRODUCTIVIDAD"])),
      error: this.toNumber(this.pick(source, ["ERROR_MEDIO", "ERROR_PCT_TOTAL"])),

      activo: this.pick(source, ["ACTIVO"]),
      finalizado: this.pick(source, ["FINALIZADO"]),

      motivoBaja: this.pick(source, ["MOTIVO_BAJA"]),
      fechaBaja: this.pick(source, ["FECHA_BAJA"]),

      raw: source
    };

    persona.riesgo = this.getRiesgo(persona);

    return persona;
  },


  /*******************************************************************
   * BLOQUE EXTRA - OPERACIONES DE ESCRITURA DEL DOMINIO
   *******************************************************************/
  update(id, data) {
    if (id === undefined || id === null || id === "") {
      throw new Error("ID de persona obligatorio para update().");
    }

    const actual = this.getById(id);

    if (!actual) {
      throw new Error("Persona no encontrada: " + id);
    }

    const patch = data || {};
    const siguiente = this.normalize(Object.assign({}, actual.raw || {}, patch));

    const map = {
      nombre: "NOMBRE_COMPLETO",
      programa: "TIPO_PROGRAMA",
      fechaIncorporacion: "FECHA_INCORPORACION",
      departamento: "DEPARTAMENTO_ORIGEN",
      horaEntrada: "HORA_ENTRADA",
      observaciones: "OBSERVACIONES",
      idPrograma: "ID_PROGRAMA",
      idFase: "ID_FASE",
      estado: "ESTADO",
      diasEnSeguimiento: "DIAS_EN_SEGUIMIENTO",
      diasRestantes: "DIAS_RESTANTES",
      rrhh: "RRHH",
      almuerzo: "ALMUERZO",
      uniforme: "UNIFORME",
      psicotecnico: "PSICOTECNICO",
      formacionBienvenida: "FORMACION_BIENVENIDA",
      tourEmpresa: "TOUR_EMPRESA",
      pdaEntregada: "PDA_ENTREGADA",
      pdaDocumento: "PDA_DOCUMENTO",
      pdaFechaFirma: "PDA_FECHA_FIRMA",
      tutor: "TUTOR_ASIGNADO",
      ultimaEvaluacion: "ULTIMA_EVALUACION",
      mediaEvaluaciones: "MEDIA_EVALUACIONES",
      porcentajePreparacion: "PORCENTAJE_PREPARACION",
      checklistCompletado: "CHECKLIST_COMPLETADO",
      ultimaFechaGrafana: "ULTIMA_FECHA_GRAFANA",
      productividad: "PRODUCTIVIDAD_MEDIA",
      error: "ERROR_MEDIO",
      activo: "ACTIVO",
      finalizado: "FINALIZADO",
      motivoBaja: "MOTIVO_BAJA",
      fechaBaja: "FECHA_BAJA"
    };

    const payload = {};

    Object.keys(map).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        payload[map[key]] = patch[key];
      }
    });

    if (Object.prototype.hasOwnProperty.call(patch, "tutor")) {
      payload.TUTOR = patch.tutor;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "pdaDocumento")) {
      payload.PDA_FIRMADA = patch.pdaDocumento;
    }

    // RIESGO se persiste coherente con el estado final tras el patch.
    payload.RIESGO = Object.prototype.hasOwnProperty.call(patch, "riesgoOriginal")
      ? patch.riesgoOriginal
      : this.getRiesgo(siguiente);

    return DataService.update(
      CONFIG.SHEETS.PERSONAS,
      "ID_TRABAJADOR",
      this.getId(actual),
      payload
    );
  },


  /*******************************************************************
   * BLOQUE 2 - CONSULTAS
   *******************************************************************/
  getEnSeguimiento() {
    return this.getAll().filter((persona) => {
      return persona.estado !== CONFIG.ESTADOS.FINALIZADO &&
             persona.estado !== CONFIG.ESTADOS.BAJA;
    });
  },


  getFinalizados() {
    return this.getAll().filter((persona) => {
      return persona.estado === CONFIG.ESTADOS.FINALIZADO;
    });
  },


  getHoy() {
    const hoy = this.startOfDay(new Date());

    return this.getEnSeguimiento().filter((persona) => {
      if (!persona.fechaIncorporacion) return false;

      const fecha = this.startOfDay(new Date(persona.fechaIncorporacion));
      return fecha.getTime() === hoy.getTime();
    });
  },


  getManana() {
    const manana = this.startOfDay(new Date());
    manana.setDate(manana.getDate() + 1);

    return this.getEnSeguimiento().filter((persona) => {
      if (!persona.fechaIncorporacion) return false;

      const fecha = this.startOfDay(new Date(persona.fechaIncorporacion));
      return fecha.getTime() === manana.getTime();
    });
  },


  getEstaSemana() {
    const hoy = this.startOfDay(new Date());
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + 7);

    return this.getEnSeguimiento().filter((persona) => {
      if (!persona.fechaIncorporacion) return false;

      const fecha = this.startOfDay(new Date(persona.fechaIncorporacion));
      return fecha >= hoy && fecha <= limite;
    });
  },


  getFinalizanEstaSemana() {
    const hoy = this.startOfDay(new Date());
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + 7);

    return this.getEnSeguimiento().filter((persona) => {
      if (!persona.fechaIncorporacion) return false;

      const fin = this.startOfDay(new Date(persona.fechaIncorporacion));
      fin.setDate(fin.getDate() + this.getDiasTotales(persona));

      return fin >= hoy && fin <= limite;
    });
  },


  getFormadores() {
    const mapa = {};

    this.getEnSeguimiento().forEach((persona) => {
      const tutor = persona.tutor || "Sin tutor";
      mapa[tutor] = (mapa[tutor] || 0) + 1;
    });

    return Object.keys(mapa)
      .map((nombre) => {
        return {
          nombre: nombre,
          personas: mapa[nombre]
        };
      })
      .sort((a, b) => b.personas - a.personas);
  },


  /*******************************************************************
   * BLOQUE 3 - KPIs
   *******************************************************************/
  getResumen(personas) {
    const base = personas || this.getAll();

    const total = base.length;
    const nuevas = base.filter((persona) => {
      return persona.programa === CONFIG.PROGRAMAS.NUEVA;
    }).length;

    const mili = base.filter((persona) => {
      return persona.programa === CONFIG.PROGRAMAS.MILI;
    }).length;

    const riesgoAlto = base.filter((persona) => {
      return this.getRiesgo(persona) === CONFIG.RIESGO.ALTO;
    }).length;

    const formadores = this.getFormadores().filter((f) => {
      return f.nombre !== "Sin tutor";
    }).length;

    return {
      total: total,
      nuevas: nuevas,
      mili: mili,
      riesgo: riesgoAlto,
      formadores: formadores,
      nuevasPct: this.pct(nuevas, total),
      miliPct: this.pct(mili, total)
    };
  },


  getStats() {
    const resumen = this.getResumen();
    const enSeguimiento = this.getEnSeguimiento();

    const riesgoAlto = enSeguimiento.filter((persona) => {
      return this.getRiesgo(persona) === CONFIG.RIESGO.ALTO;
    }).length;

    const riesgoMedio = enSeguimiento.filter((persona) => {
      return this.getRiesgo(persona) === CONFIG.RIESGO.MEDIO;
    }).length;

    const riesgoBajo = enSeguimiento.filter((persona) => {
      return this.getRiesgo(persona) === CONFIG.RIESGO.BAJO;
    }).length;

    return {
      total: resumen.total,
      activos: enSeguimiento.length,
      enSeguimiento: enSeguimiento.length,
      nuevas: resumen.nuevas,
      onboarding: resumen.nuevas,
      mili: resumen.mili,
      riesgoAlto: riesgoAlto,
      riesgoMedio: riesgoMedio,
      riesgoBajo: riesgoBajo,
      finalizados: this.getFinalizados().length,
      formadores: resumen.formadores,
      sinTutor: enSeguimiento.filter((persona) => !persona.tutor).length,
      hoy: this.getHoy().length,
      manana: this.getManana().length,
      estaSemana: this.getEstaSemana().length,
      finalizanEstaSemana: this.getFinalizanEstaSemana().length
    };
  },


  getKPIs() {
    const personas = this.getEnSeguimiento();

    if (!personas.length) {
      return {
        personas: 0,
        checklistMedio: 0,
        productividadMedia: 0,
        errorMedio: 0,
        seguimientoMedio: 0,
        riesgoAlto: 0,
        riesgoMedio: 0,
        riesgoBajo: 0
      };
    }

    const acc = personas.reduce((memo, persona) => {
      memo.checklist += this.getChecklistProgress(persona);
      memo.productividad += this.getProductividadMedia(persona);
      memo.error += this.getErrorMedio(persona);
      memo.seguimiento += this.getPorcentajeSeguimiento(persona);
      return memo;
    }, {
      checklist: 0,
      productividad: 0,
      error: 0,
      seguimiento: 0
    });

    const stats = this.getStats();

    return {
      personas: personas.length,
      checklistMedio: Math.round(acc.checklist / personas.length),
      productividadMedia: Math.round(acc.productividad / personas.length),
      errorMedio: Math.round((acc.error / personas.length) * 100) / 100,
      seguimientoMedio: Math.round(acc.seguimiento / personas.length),
      riesgoAlto: stats.riesgoAlto,
      riesgoMedio: stats.riesgoMedio,
      riesgoBajo: stats.riesgoBajo
    };
  },


  /*******************************************************************
   * BLOQUE 4 - INDICADORES
   *******************************************************************/
  getChecklistProgress(persona) {
    const p = persona || {};

    if (this.toNumber(p.porcentajePreparacion) > 0) {
      return this.toNumber(p.porcentajePreparacion);
    }

    if (this.isTrue(p.checklistCompletado)) {
      return 100;
    }

    const checks = [
      p.rrhh,
      p.almuerzo,
      p.uniforme,
      p.psicotecnico,
      p.formacionBienvenida,
      p.tourEmpresa,
      p.pdaEntregada,
      p.pdaDocumento
    ];

    const total = checks.length;
    const completados = checks.filter((valor) => this.isTrue(valor)).length;

    return total ? Math.round((completados / total) * 100) : 0;
  },


  getProductividadMedia(persona) {
    return this.toNumber(persona && persona.productividad);
  },


  getErrorMedio(persona) {
    return this.toNumber(persona && persona.error);
  },


  getDiasSeguimiento(persona) {
    if (!persona || !persona.fechaIncorporacion) {
      return 0;
    }

    const inicio = this.startOfDay(new Date(persona.fechaIncorporacion));
    const hoy = this.startOfDay(new Date());

    return Math.max(
      0,
      Math.floor((hoy.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24))
    );
  },


  getDiasTotales(persona) {
    if (persona && this.toNumber(persona.diasEnSeguimiento) > 0) {
      return this.toNumber(persona.diasEnSeguimiento);
    }

    if (persona && persona.programa === CONFIG.PROGRAMAS.MILI) {
      return CONFIG.SYSTEM.DIAS_MILI;
    }

    return CONFIG.SYSTEM.DIAS_ONBOARDING;
  },


  getPorcentajeSeguimiento(persona) {
    const total = this.getDiasTotales(persona);

    if (!total) {
      return 0;
    }

    const dias = this.getDiasSeguimiento(persona);
    return Math.min(100, Math.round((dias / total) * 100));
  },


  // Alias operativo para consumidores ya existentes.
  diasSeguimiento(persona) {
    return this.getDiasSeguimiento(persona);
  },


  // Alias operativo para consumidores ya existentes.
  getProgresoSeguimiento(persona) {
    return this.getPorcentajeSeguimiento(persona);
  },


  getNextAction(persona) {
    if (!persona) {
      return "Sin datos";
    }

    if (persona.estado === CONFIG.ESTADOS.FINALIZADO ||
        persona.estado === CONFIG.ESTADOS.BAJA) {
      return "Seguimiento completado";
    }

    if (this.getChecklistProgress(persona) < 100) {
      return "Completar checklist";
    }

    if (!persona.tutor) {
      return "Asignar tutor";
    }

    if (this.getProductividadMedia(persona) > 0 &&
        this.getProductividadMedia(persona) < CONFIG.SYSTEM.PRODUCTIVIDAD_MINIMA) {
      return "Revisar productividad";
    }

    if (this.getErrorMedio(persona) > CONFIG.SYSTEM.ERROR_MAXIMO) {
      return "Reducir errores";
    }

    return "Seguimiento normal";
  },


  /*******************************************************************
   * BLOQUE 5 - RIESGO
   *******************************************************************/
  getRiesgo(persona) {
    const p = persona || {};

    const riesgoManual = this.normalizar(p.riesgoOriginal);

    if (riesgoManual === "alto") {
      return CONFIG.RIESGO.ALTO;
    }

    if (riesgoManual === "medio") {
      return CONFIG.RIESGO.MEDIO;
    }

    if (riesgoManual === "bajo") {
      return CONFIG.RIESGO.BAJO;
    }

    const productividad = this.getProductividadMedia(p);
    const error = this.getErrorMedio(p);
    const checklist = this.getChecklistProgress(p);

    if (productividad < 70 || error > 10 || checklist < 40) {
      return CONFIG.RIESGO.ALTO;
    }

    if (productividad < 85 || error > 5 || checklist < 70) {
      return CONFIG.RIESGO.MEDIO;
    }

    return CONFIG.RIESGO.BAJO;
  },


  getColorRiesgo(persona) {
    const riesgo = this.getRiesgo(persona);

    if (riesgo === CONFIG.RIESGO.ALTO) {
      return CONFIG.COLORS.DANGER;
    }

    if (riesgo === CONFIG.RIESGO.MEDIO) {
      return CONFIG.COLORS.WARNING;
    }

    return CONFIG.COLORS.SUCCESS;
  },


  /*******************************************************************
   * BLOQUE 6 - UTILIDADES
   *******************************************************************/
  getId(persona) {
    if (!persona) return "";

    return (
      persona.id ||
      persona.ID_TRABAJADOR ||
      persona["ID Trabajador"] ||
      persona.ID ||
      ""
    );
  },


  pick(row, keys) {
    const source = row || {};
    const list = keys || [];

    for (let i = 0; i < list.length; i++) {
      const key = list[i];

      if (source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== "") {
        return source[key];
      }
    }

    return "";
  },


  normalizar(texto) {
    return String(texto || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  },


  toNumber(valor) {
    if (valor === null || valor === undefined || valor === "") {
      return 0;
    }

    if (typeof valor === "number") {
      return isNaN(valor) ? 0 : valor;
    }

    const raw = String(valor)
      .trim()
      .replace(/\s+/g, "")
      .replace("%", "");

    let str = raw;

    if (raw.includes(",") && raw.includes(".")) {
      // Si hay ambos separadores, se asume que el ultimo es decimal.
      if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
        str = raw.replace(/\./g, "").replace(",", ".");
      } else {
        str = raw.replace(/,/g, "");
      }
    } else if (raw.includes(",")) {
      str = raw.replace(",", ".");
    }

    const n = Number(str);
    return isNaN(n) ? 0 : n;
  },


  pct(valor, total) {
    if (!total) {
      return 0;
    }

    return Math.round((valor / total) * 100);
  },


  isTrue(valor) {
    if (valor === true) {
      return true;
    }

    const v = String(valor || "").trim().toUpperCase();

    return v === "SI" ||
           v === "SÍ" ||
           v === "TRUE" ||
           v === "1" ||
           v === "X" ||
           v === "OK";
  },


  startOfDay(fecha) {
    const d = new Date(fecha || new Date());
    d.setHours(0, 0, 0, 0);
    return d;
  }

};


/*********************************************************************
 * WRAPPERS PARA GOOGLE APPS SCRIPT
 *********************************************************************/

function getPersonas() {
  return PersonaService.getAll();
}


function getPersonaById(id) {
  return PersonaService.getById(id);
}


function buscarPersonas(texto) {
  return PersonaService.buscar(texto);
}


function getPersonasHoy() {
  return PersonaService.getHoy();
}


function getPersonasManana() {
  return PersonaService.getManana();
}


function getPersonasSemana() {
  return PersonaService.getEstaSemana();
}


function getPersonasSeguimiento() {
  return PersonaService.getEnSeguimiento();
}


function getPersonasFinalizadas() {
  return PersonaService.getFinalizados();
}


function getPersonasResumen() {
  return PersonaService.getResumen();
}


function getPersonasStats() {
  return PersonaService.getStats();
}


function getFormadores() {
  return PersonaService.getFormadores();
}
