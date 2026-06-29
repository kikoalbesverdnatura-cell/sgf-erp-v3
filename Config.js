```javascript
/*********************************************************************
 * SGF ERP v3
 * PersonaService.js
 * -------------------------------------------------------------------
 * Servicio central de personas.
 *
 * ÚNICO punto donde se conocen las columnas reales de MAESTRO_PERSONAS.
 * El resto del ERP debe trabajar SIEMPRE con modelo normalizado:
 *
 * persona.id
 * persona.nombre
 * persona.programa
 * persona.fechaIncorporacion
 * persona.departamento
 * persona.tutor
 * persona.estado
 * persona.productividad
 * persona.error
 * persona.riesgo
 *********************************************************************/

const PersonaService = {

  /*******************************************************************
   * MAPEO OFICIAL ERP -> GOOGLE SHEETS
   *******************************************************************/
  FIELDS: {
    id: "ID Trabajador",
    nombre: "NOMBRE_COMPLETO",
    programa: "TIPO_PROGRAMA",
    fechaIncorporacion: "FECHA_INCORPORACION",
    departamento: "DEPARTAMENTO_ORIGEN",
    horaEntrada: "HORA_ENTRADA",
    observaciones: "Observaciones",
    idPrograma: "ID_PROGRAMA",
    idFase: "ID_FASE",
    estado: "ESTADO",
    diasSeguimiento: "DIAS_EN_SEGUIMIENTO",
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
    riesgo: "RIESGO",
    porcentajePreparacion: "PORCENTAJE_PREPARACION",
    checklistCompletado: "CHECKLIST_COMPLETADO",
    ultimaGrafana: "ULTIMA_FECHA_GRAFANA",
    productividad: "PRODUCTIVIDAD_MEDIA",
    error: "ERROR_MEDIO",
    activo: "ACTIVO",
    finalizado: "FINALIZADO",
    motivoBaja: "MOTIVO_BAJA",
    fechaBaja: "FECHA_BAJA",
    creadoPor: "CREADO_POR",
    fechaCreacion: "FECHA_CREACION",
    modificadoPor: "MODIFICADO_POR",
    fechaModificacion: "FECHA_MODIFICACION"
  },


  /*******************************************************************
   * LECTURA
   *******************************************************************/
  getAll() {
    return DataService
      .getAll(CONFIG.SHEETS.PERSONAS)
      .map(row => this.normalize(row))
      .filter(persona => persona.id || persona.nombre);
  },


  getById(id) {
    if (!id) return null;

    return this.getAll().find(persona => {
      return String(persona.id) === String(id);
    }) || null;
  },


  search(texto) {
    const q = this.normalizar(texto);

    if (!q) {
      return this.getAll();
    }

    return this.getAll().filter(persona => {
      const textoPersona = [
        persona.id,
        persona.nombre,
        persona.programa,
        persona.departamento,
        persona.tutor,
        persona.estado,
        persona.riesgo
      ].join(" ");

      return this.normalizar(textoPersona).includes(q);
    });
  },


  buscar(texto) {
    return this.search(texto);
  },


  getByPrograma(programa) {
    return this.getAll().filter(persona => {
      return String(persona.programa) === String(programa);
    });
  },


  getByEstado(estado) {
    return this.getAll().filter(persona => {
      return String(persona.estado) === String(estado);
    });
  },


  getByTutor(tutor) {
    return this.getAll().filter(persona => {
      return String(persona.tutor || "") === String(tutor || "");
    });
  },


  getActivos() {
    return this.getAll().filter(persona => this.isTrue(persona.activo));
  },


  getFinalizados() {
    return this.getAll().filter(persona => this.isTrue(persona.finalizado));
  },


  getNuevasIncorporaciones() {
    return this.getByPrograma(CONFIG.PROGRAMAS.NUEVA);
  },


  getMili() {
    return this.getByPrograma(CONFIG.PROGRAMAS.MILI);
  },


  getEnSeguimiento() {
    return this.getAll().filter(persona => {
      return persona.estado !== CONFIG.ESTADOS.FINALIZADO &&
             persona.estado !== CONFIG.ESTADOS.BAJA &&
             !this.isTrue(persona.finalizado);
    });
  },


  getHoy() {
    return this.getByFechaIncorporacion(new Date());
  },


  getManana() {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    return this.getByFechaIncorporacion(manana);
  },


  getEstaSemana() {
    const hoy = this.startOfDay(new Date());
    const dentro7 = this.startOfDay(new Date());
    dentro7.setDate(dentro7.getDate() + 7);

    return this.getAll().filter(persona => {
      if (!persona.fechaIncorporacion) return false;

      const fecha = this.startOfDay(new Date(persona.fechaIncorporacion));

      return fecha >= hoy && fecha <= dentro7;
    });
  },


  getFinalizanEstaSemana() {
    const hoy = this.startOfDay(new Date());
    const dentro7 = this.startOfDay(new Date());
    dentro7.setDate(dentro7.getDate() + 7);

    return this.getAll().filter(persona => {
      if (!persona.raw || !persona.raw.FECHA_FIN_SEGUIMIENTO) return false;

      const fecha = this.startOfDay(new Date(persona.raw.FECHA_FIN_SEGUIMIENTO));

      return fecha >= hoy && fecha <= dentro7;
    });
  },


  getByFechaIncorporacion(fechaObjetivo) {
    const objetivo = Utilities.formatDate(
      new Date(fechaObjetivo),
      CONFIG.APP.TIMEZONE,
      "yyyyMMdd"
    );

    return this.getAll().filter(persona => {
      if (!persona.fechaIncorporacion) return false;

      const fecha = Utilities.formatDate(
        new Date(persona.fechaIncorporacion),
        CONFIG.APP.TIMEZONE,
        "yyyyMMdd"
      );

      return fecha === objetivo;
    });
  },


  getRiesgoAlto() {
    return this.getAll().filter(persona => {
      return this.getRiesgo(persona) === CONFIG.RIESGO.ALTO;
    });
  },


  /*******************************************************************
   * NORMALIZACIÓN
   *******************************************************************/
  normalize(row) {
    row = row || {};

    const persona = {
      id: this.pick(row, ["ID Trabajador", "ID_TRABAJADOR", "ID"]),
      nombre: this.pick(row, ["NOMBRE_COMPLETO", "NOMBRE", "Nombre"]),
      programa: this.pick(row, ["TIPO_PROGRAMA", "PROGRAMA"]),
      fechaIncorporacion: this.pick(row, ["FECHA_INCORPORACION", "Fecha incorporación"]),
      departamento: this.pick(row, ["DEPARTAMENTO_ORIGEN", "DEPARTAMENTO"]),
      horaEntrada: this.pick(row, ["HORA_ENTRADA"]),
      observaciones: this.pick(row, ["Observaciones", "OBSERVACIONES"]),

      idPrograma: this.pick(row, ["ID_PROGRAMA"]),
      idFase: this.pick(row, ["ID_FASE"]),

      estado: this.pick(row, ["ESTADO"]) || CONFIG.ESTADOS.EN_CURSO,

      diasSeguimiento: this.toNumber(this.pick(row, ["DIAS_EN_SEGUIMIENTO", "DIAS_EN_SEGUIMIENTO"])),
      diasRestantes: this.toNumber(this.pick(row, ["DIAS_RESTANTES"])),

      rrhh: this.pick(row, ["RRHH"]),
      almuerzo: this.pick(row, ["ALMUERZO"]),
      uniforme: this.pick(row, ["UNIFORME"]),
      psicotecnico: this.pick(row, ["PSICOTECNICO"]),
      formacionBienvenida: this.pick(row, ["FORMACION_BIENVENIDA"]),
      tourEmpresa: this.pick(row, ["TOUR_EMPRESA"]),
      pdaEntregada: this.pick(row, ["PDA_ENTREGADA"]),
      pdaDocumento: this.pick(row, ["PDA_DOCUMENTO"]),
      pdaFechaFirma: this.pick(row, ["PDA_FECHA_FIRMA"]),

      tutor: this.pick(row, ["TUTOR_ASIGNADO", "TUTOR"]),

      ultimaEvaluacion: this.pick(row, ["ULTIMA_EVALUACION"]),
      mediaEvaluaciones: this.toNumber(this.pick(row, ["MEDIA_EVALUACIONES"])),

      riesgo: this.pick(row, ["RIESGO"]),
      porcentajePreparacion: this.toNumber(this.pick(row, ["PORCENTAJE_PREPARACION"])),
      checklistCompletado: this.pick(row, ["CHECKLIST_COMPLETADO"]),

      ultimaGrafana: this.pick(row, ["ULTIMA_FECHA_GRAFANA"]),
      productividad: this.toNumber(this.pick(row, ["PRODUCTIVIDAD_MEDIA", "MEDIA_PRODUCTIVIDAD"])),
      error: this.toNumber(this.pick(row, ["ERROR_MEDIO", "ERROR_PCT_TOTAL"])),

      activo: this.pick(row, ["ACTIVO"]),
      finalizado: this.pick(row, ["FINALIZADO"]),

      motivoBaja: this.pick(row, ["MOTIVO_BAJA"]),
      fechaBaja: this.pick(row, ["FECHA_BAJA"]),

      creadoPor: this.pick(row, ["CREADO_POR"]),
      fechaCreacion: this.pick(row, ["FECHA_CREACION"]),
      modificadoPor: this.pick(row, ["MODIFICADO_POR"]),
      fechaModificacion: this.pick(row, ["FECHA_MODIFICACION"]),

      raw: row
    };

    persona.diasEnSeguimiento = persona.diasSeguimiento;
    persona.riesgoCalculado = this.calcularRiesgo(persona);
    persona.riesgoFinal = persona.riesgo || persona.riesgoCalculado;

    /*****************************************************************
     * COMPATIBILIDAD TEMPORAL
     * Mantiene funcionando Dashboard/Personas antiguos.
     *****************************************************************/
    persona.ID_TRABAJADOR = persona.id;
    persona["ID Trabajador"] = persona.id;
    persona.NOMBRE_COMPLETO = persona.nombre;
    persona.TIPO_PROGRAMA = persona.programa;
    persona.FECHA_INCORPORACION = persona.fechaIncorporacion;
    persona.DEPARTAMENTO_ORIGEN = persona.departamento;
    persona.HORA_ENTRADA = persona.horaEntrada;
    persona.ESTADO = persona.estado;
    persona.DIAS_EN_SEGUIMIENTO = persona.diasSeguimiento;
    persona.DIAS_RESTANTES = persona.diasRestantes;
    persona.TUTOR = persona.tutor;
    persona.TUTOR_ASIGNADO = persona.tutor;
    persona.ULTIMA_EVALUACION = persona.ultimaEvaluacion;
    persona.MEDIA_EVALUACIONES = persona.mediaEvaluaciones;
    persona.RIESGO = persona.riesgoFinal;
    persona.PORCENTAJE_PREPARACION = persona.porcentajePreparacion;
    persona.CHECKLIST_COMPLETADO = persona.checklistCompletado;
    persona.ULTIMA_FECHA_GRAFANA = persona.ultimaGrafana;
    persona.PRODUCTIVIDAD_MEDIA = persona.productividad;
    persona.MEDIA_PRODUCTIVIDAD = persona.productividad;
    persona.ERROR_MEDIO = persona.error;
    persona.ERROR_PCT_TOTAL = persona.error;
    persona.ACTIVO = persona.activo;
    persona.FINALIZADO = persona.finalizado;

    return persona;
  },


  denormalize(persona) {
    persona = persona || {};

    const row = {};

    Object.keys(this.FIELDS).forEach(key => {
      const columnName = this.FIELDS[key];

      if (persona[key] !== undefined) {
        row[columnName] = persona[key];
      }
    });

    row["ID Trabajador"] = persona.id || "";
    row["NOMBRE_COMPLETO"] = persona.nombre || "";
    row["TIPO_PROGRAMA"] = persona.programa || "";
    row["FECHA_INCORPORACION"] = persona.fechaIncorporacion || "";
    row["DEPARTAMENTO_ORIGEN"] = persona.departamento || "";
    row["HORA_ENTRADA"] = persona.horaEntrada || "";
    row["Observaciones"] = persona.observaciones || "";
    row["ESTADO"] = persona.estado || CONFIG.ESTADOS.EN_CURSO;
    row["DIAS_EN_SEGUIMIENTO"] = this.toNumber(persona.diasSeguimiento);
    row["DIAS_RESTANTES"] = this.toNumber(persona.diasRestantes);
    row["TUTOR_ASIGNADO"] = persona.tutor || "";
    row["RIESGO"] = persona.riesgo || "";
    row["PORCENTAJE_PREPARACION"] = this.toNumber(persona.porcentajePreparacion);
    row["PRODUCTIVIDAD_MEDIA"] = this.toNumber(persona.productividad);
    row["ERROR_MEDIO"] = this.toNumber(persona.error);
    row["ACTIVO"] = persona.activo;
    row["FINALIZADO"] = persona.finalizado;
    row["MOTIVO_BAJA"] = persona.motivoBaja || "";
    row["FECHA_BAJA"] = persona.fechaBaja || "";
    row["CREADO_POR"] = persona.creadoPor || "";
    row["FECHA_CREACION"] = persona.fechaCreacion || "";
    row["MODIFICADO_POR"] = persona.modificadoPor || "";
    row["FECHA_MODIFICACION"] = persona.fechaModificacion || "";

    return row;
  },


  /*******************************************************************
   * ESCRITURA
   * Requiere que DataService tenga create/update/delete.
   * Si no existen, no rompe: devuelve error claro.
   *******************************************************************/
  create(data) {
    if (!data) {
      throw new Error("PersonaService.create: faltan datos.");
    }

    const persona = Object.assign({}, data);

    if (!persona.id) {
      persona.id = this.generateId();
    }

    if (!persona.estado) {
      persona.estado = CONFIG.ESTADOS.EN_CURSO;
    }

    persona.activo = persona.activo === undefined ? true : persona.activo;
    persona.finalizado = persona.finalizado === undefined ? false : persona.finalizado;
    persona.fechaCreacion = persona.fechaCreacion || new Date();
    persona.fechaModificacion = new Date();

    const row = this.denormalize(persona);

    if (typeof DataService.create === "function") {
      DataService.create(CONFIG.SHEETS.PERSONAS, row);
      return this.getById(persona.id);
    }

    if (typeof DataService.append === "function") {
      DataService.append(CONFIG.SHEETS.PERSONAS, row);
      return this.getById(persona.id);
    }

    throw new Error("PersonaService.create: DataService no tiene create() ni append().");
  },


  update(id, data) {
    if (!id) {
      throw new Error("PersonaService.update: falta id.");
    }

    if (!data) {
      throw new Error("PersonaService.update: faltan datos.");
    }

    const actual = this.getById(id);

    if (!actual) {
      throw new Error("PersonaService.update: persona no encontrada: " + id);
    }

    const persona = Object.assign({}, actual, data);
    persona.id = actual.id;
    persona.fechaModificacion = new Date();

    const row = this.denormalize(persona);

    if (typeof DataService.updateById === "function") {
      DataService.updateById(CONFIG.SHEETS.PERSONAS, "ID Trabajador", id, row);
      return this.getById(id);
    }

    if (typeof DataService.update === "function") {
      DataService.update(CONFIG.SHEETS.PERSONAS, "ID Trabajador", id, row);
      return this.getById(id);
    }

    throw new Error("PersonaService.update: DataService no tiene updateById() ni update().");
  },


  delete(id) {
    if (!id) {
      throw new Error("PersonaService.delete: falta id.");
    }

    const actual = this.getById(id);

    if (!actual) {
      throw new Error("PersonaService.delete: persona no encontrada: " + id);
    }

    return this.update(id, {
      activo: false,
      finalizado: true,
      estado: CONFIG.ESTADOS.BAJA,
      motivoBaja: "Baja lógica",
      fechaBaja: new Date()
    });
  },


  /*******************************************************************
   * CÁLCULOS OPERATIVOS
   *******************************************************************/
  diasSeguimiento(persona) {
    if (!persona) return 0;

    if (persona.diasSeguimiento) {
      return this.toNumber(persona.diasSeguimiento);
    }

    if (!persona.fechaIncorporacion) {
      return 0;
    }

    const inicio = this.startOfDay(new Date(persona.fechaIncorporacion));
    const hoy = this.startOfDay(new Date());

    const dias = Math.floor((hoy.getTime() - inicio.getTime()) / 86400000);

    return dias > 0 ? dias : 0;
  },


  getDiasTotales(persona) {
    if (persona && persona.programa === CONFIG.PROGRAMAS.MILI) {
      return CONFIG.SYSTEM.DIAS_MILI;
    }

    return CONFIG.SYSTEM.DIAS_ONBOARDING;
  },


  getProgresoSeguimiento(persona) {
    const dias = this.diasSeguimiento(persona);
    const total = this.getDiasTotales(persona);

    if (!total) return 0;

    const pct = Math.round((dias / total) * 100);

    return Math.min(100, Math.max(0, pct));
  },


  getChecklistProgress(persona) {
    const id = this.getId(persona);

    if (!id || typeof ChecklistService === "undefined") {
      return this.toNumber(persona && persona.porcentajePreparacion || 0);
    }

    return ChecklistService.getProgress(id);
  },


  getChecklistCompleted(persona) {
    const id = this.getId(persona);

    if (!id || typeof ChecklistService === "undefined") {
      const pct = this.getChecklistProgress(persona);
      const totalChecks = CONFIG.CHECKS && CONFIG.CHECKS.length ? CONFIG.CHECKS.length : 0;
      return Math.round((pct / 100) * totalChecks);
    }

    return ChecklistService.countCompleted(id);
  },


  getNextAction(persona) {
    const id = this.getId(persona);

    if (!id || typeof ChecklistService === "undefined") {
      return "Revisar expediente";
    }

    return ChecklistService.getNextAction(id);
  },


  getProductividadMedia(persona) {
    return this.toNumber(
      persona.productividad ||
      persona.PRODUCTIVIDAD_MEDIA ||
      persona.MEDIA_PRODUCTIVIDAD ||
      0
    );
  },


  getErrorMedio(persona) {
    return this.toNumber(
      persona.error ||
      persona.ERROR_MEDIO ||
      persona.ERROR_PCT_TOTAL ||
      0
    );
  },


  calcularRiesgo(persona) {
    const productividad = this.getProductividadMedia(persona);
    const error = this.getErrorMedio(persona);
    const checklist = this.getChecklistProgress(persona);

    if (
      productividad > 0 &&
      productividad < CONFIG.SYSTEM.PRODUCTIVIDAD_MINIMA
    ) {
      return CONFIG.RIESGO.ALTO;
    }

    if (error > CONFIG.SYSTEM.ERROR_MAXIMO) {
      return CONFIG.RIESGO.ALTO;
    }

    if (checklist > 0 && checklist < 50) {
      return CONFIG.RIESGO.MEDIO;
    }

    return CONFIG.RIESGO.BAJO;
  },


  getRiesgo(persona) {
    if (!persona) return CONFIG.RIESGO.BAJO;

    if (persona.riesgo) return persona.riesgo;
    if (persona.riesgoFinal) return persona.riesgoFinal;
    if (persona.RIESGO) return persona.RIESGO;

    return this.calcularRiesgo(persona);
  },


  getFormadores() {
    const mapa = {};

    this.getEnSeguimiento().forEach(persona => {
      const tutor = persona.tutor || "Sin tutor";
      mapa[tutor] = (mapa[tutor] || 0) + 1;
    });

    return Object.keys(mapa)
      .map(nombre => {
        return {
          nombre: nombre,
          personas: mapa[nombre]
        };
      })
      .sort((a, b) => b.personas - a.personas);
  },


  getStats() {
    const personas = this.getAll();
    const enSeguimiento = personas.filter(persona => {
      return persona.estado !== CONFIG.ESTADOS.FINALIZADO &&
             persona.estado !== CONFIG.ESTADOS.BAJA &&
             !this.isTrue(persona.finalizado);
    });

    const nuevas = personas.filter(persona => {
      return persona.programa === CONFIG.PROGRAMAS.NUEVA;
    });

    const mili = personas.filter(persona => {
      return persona.programa === CONFIG.PROGRAMAS.MILI;
    });

    const riesgoAlto = personas.filter(persona => {
      return this.getRiesgo(persona) === CONFIG.RIESGO.ALTO;
    });

    const riesgoMedio = personas.filter(persona => {
      return this.getRiesgo(persona) === CONFIG.RIESGO.MEDIO;
    });

    const riesgoBajo = personas.filter(persona => {
      return this.getRiesgo(persona) === CONFIG.RIESGO.BAJO;
    });

    const activos = personas.filter(persona => this.isTrue(persona.activo));
    const finalizados = personas.filter(persona => this.isTrue(persona.finalizado));

    const formadores = this.getFormadores().filter(f => f.nombre !== "Sin tutor");

    return {
      total: personas.length,
      activos: activos.length,
      finalizados: finalizados.length,
      enSeguimiento: enSeguimiento.length,
      onboarding: nuevas.length,
      nuevas: nuevas.length,
      mili: mili.length,
      riesgoAlto: riesgoAlto.length,
      riesgoMedio: riesgoMedio.length,
      riesgoBajo: riesgoBajo.length,
      formadores: formadores.length,
      sinTutor: enSeguimiento.filter(p => !p.tutor).length,
      hoy: this.getHoy().length,
      manana: this.getManana().length,
      estaSemana: this.getEstaSemana().length
    };
  },


  getResumen(personas) {
    personas = personas || this.getAll();

    const total = personas.length;

    const nuevas = personas.filter(persona => {
      return persona.programa === CONFIG.PROGRAMAS.NUEVA;
    }).length;

    const mili = personas.filter(persona => {
      return persona.programa === CONFIG.PROGRAMAS.MILI;
    }).length;

    const riesgo = personas.filter(persona => {
      return this.getRiesgo(persona) === CONFIG.RIESGO.ALTO;
    }).length;

    const formadores =
      this.getFormadores().filter(f => f.nombre !== "Sin tutor").length;

    return {
      total: total,
      nuevas: nuevas,
      mili: mili,
      riesgo: riesgo,
      formadores: formadores,
      nuevasPct: this.pct(nuevas, total),
      miliPct: this.pct(mili, total)
    };
  },


  /*******************************************************************
   * UTILIDADES
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
    for (let i = 0; i < keys.length; i++) {
      if (
        row[keys[i]] !== undefined &&
        row[keys[i]] !== null &&
        String(row[keys[i]]).trim() !== ""
      ) {
        return row[keys[i]];
      }
    }

    return "";
  },


  normalizar(valor) {
    return String(valor || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  },


  toNumber(valor) {
    const n = Number(
      String(valor || "")
        .replace("%", "")
        .replace(",", ".")
        .trim()
    );

    return isNaN(n) ? 0 : n;
  },


  pct(valor, total) {
    if (!total) return 0;

    return Math.round((valor / total) * 100);
  },


  startOfDay(fecha) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    return d;
  },


  isTrue(valor) {
    if (valor === true) return true;
    if (valor === 1) return true;

    const v = this.normalizar(valor);

    return (
      v === "true" ||
      v === "si" ||
      v === "sí" ||
      v === "1" ||
      v === "x" ||
      v === "activo" ||
      v === "finalizado"
    );
  },


  generateId() {
    return "P" + new Date().getTime();
  }

};


/*********************************************************************
 * MÉTODOS GLOBALES DE COMPATIBILIDAD
 *********************************************************************/

function getPersonas() {
  return PersonaService.getAll();
}


function getPersona(id) {
  return PersonaService.getById(id);
}


function buscarPersonas(texto) {
  return PersonaService.search(texto);
}


function getPersonaStats() {
  return PersonaService.getStats();
}
```
