/*********************************************************************
 * SGF ERP v3
 * PersonaService.js
 * -------------------------------------------------------------------
 * Gestión de personas
 *
 * Este servicio normaliza los datos reales de MAESTRO_PERSONAS.
 * El resto del ERP debe trabajar con:
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

  getAll() {
    return DataService
      .getAll(CONFIG.SHEETS.PERSONAS)
      .map(function(row) {
        return PersonaService.normalize(row);
      });
  },


  getById(id) {
    return this.getAll().find(function(persona) {
      return String(persona.id) === String(id);
    }) || null;
  },


  normalize(row) {
    row = row || {};

    const persona = {
      id: this.pick(row, ["ID_TRABAJADOR", "ID Trabajador", "ID"]),
      nombre: this.pick(row, ["NOMBRE_COMPLETO", "NOMBRE", "Nombre"]),
      programa: this.pick(row, ["TIPO_PROGRAMA", "PROGRAMA"]),
      fechaIncorporacion: this.pick(row, ["FECHA_INCORPORACION", "Fecha incorporación"]),
      departamento: this.pick(row, ["DEPARTAMENTO_ORIGEN", "DEPARTAMENTO"]),
      horaEntrada: this.pick(row, ["HORA_ENTRADA"]),
      observaciones: this.pick(row, ["Observaciones", "OBSERVACIONES"]),
      idPrograma: this.pick(row, ["ID_PROGRAMA"]),
      idFase: this.pick(row, ["ID_FASE"]),
      estado: this.pick(row, ["ESTADO"]) || CONFIG.ESTADOS.EN_CURSO,
      diasEnSeguimiento: this.toNumber(this.pick(row, ["DIAS_EN_SEGUIMIENTO"])),
      diasRestantes: this.toNumber(this.pick(row, ["DIAS_RESTANTES"])),
      tutor: this.pick(row, ["TUTOR_ASIGNADO", "TUTOR"]),
      ultimaEvaluacion: this.pick(row, ["ULTIMA_EVALUACION"]),
      mediaEvaluaciones: this.toNumber(this.pick(row, ["MEDIA_EVALUACIONES"])),
      riesgoOriginal: this.pick(row, ["RIESGO"]),
      porcentajePreparacion: this.toNumber(this.pick(row, ["PORCENTAJE_PREPARACION"])),
      checklistCompletado: this.pick(row, ["CHECKLIST_COMPLETADO"]),
      ultimaFechaGrafana: this.pick(row, ["ULTIMA_FECHA_GRAFANA"]),
      productividad: this.toNumber(this.pick(row, ["PRODUCTIVIDAD_MEDIA", "MEDIA_PRODUCTIVIDAD"])),
      error: this.toNumber(this.pick(row, ["ERROR_MEDIO", "ERROR_PCT_TOTAL"])),
      activo: this.pick(row, ["ACTIVO"]),
      finalizado: this.pick(row, ["FINALIZADO"]),
      motivoBaja: this.pick(row, ["MOTIVO_BAJA"]),
      fechaBaja: this.pick(row, ["FECHA_BAJA"]),
      raw: row
    };

    persona.ID_TRABAJADOR = persona.id;
    persona["ID Trabajador"] = persona.id;
    persona.NOMBRE_COMPLETO = persona.nombre;
    persona.TIPO_PROGRAMA = persona.programa;
    persona.FECHA_INCORPORACION = persona.fechaIncorporacion;
    persona.DEPARTAMENTO_ORIGEN = persona.departamento;
    persona.HORA_ENTRADA = persona.horaEntrada;
    persona.ESTADO = persona.estado;
    persona.DIAS_EN_SEGUIMIENTO = persona.diasEnSeguimiento;
    persona.DIAS_RESTANTES = persona.diasRestantes;
    persona.TUTOR = persona.tutor;
    persona.TUTOR_ASIGNADO = persona.tutor;
    persona.ULTIMA_EVALUACION = persona.ultimaEvaluacion;
    persona.MEDIA_EVALUACIONES = persona.mediaEvaluaciones;
    persona.RIESGO = persona.riesgoOriginal;
    persona.PORCENTAJE_PREPARACION = persona.porcentajePreparacion;
    persona.CHECKLIST_COMPLETADO = persona.checklistCompletado;
    persona.ULTIMA_FECHA_GRAFANA = persona.ultimaFechaGrafana;
    persona.PRODUCTIVIDAD_MEDIA = persona.productividad;
    persona.MEDIA_PRODUCTIVIDAD = persona.productividad;
    persona.ERROR_MEDIO = persona.error;
    persona.ERROR_PCT_TOTAL = persona.error;
    persona.ACTIVO = persona.activo;
    persona.FINALIZADO = persona.finalizado;

    return persona;
  },


  buscar(texto) {
    const q = this.normalizar(texto);

    if (!q) {
      return this.getAll();
    }

    return this.getAll().filter(function(persona) {
      return PersonaService
        .normalizar(JSON.stringify(persona))
        .includes(q);
    });
  },


  getNuevasIncorporaciones() {
    return this.getAll().filter(function(persona) {
      return persona.programa === CONFIG.PROGRAMAS.NUEVA;
    });
  },


  getMili() {
    return this.getAll().filter(function(persona) {
      return persona.programa === CONFIG.PROGRAMAS.MILI;
    });
  },


  getEnSeguimiento() {
    return this.getAll().filter(function(persona) {
      return persona.estado !== CONFIG.ESTADOS.FINALIZADO &&
             persona.estado !== CONFIG.ESTADOS.BAJA;
    });
  },


  getByTutor(tutor) {
    return this.getAll().filter(function(persona) {
      return String(persona.tutor || "") === String(tutor);
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

    return this.getAll().filter(function(persona) {
      if (!persona.fechaIncorporacion) return false;

      const fecha = PersonaService.startOfDay(
        new Date(persona.fechaIncorporacion)
      );

      return fecha >= hoy && fecha <= dentro7;
    });
  },


  getFinalizanEstaSemana() {
    const hoy = this.startOfDay(new Date());
    const dentro7 = this.startOfDay(new Date());
    dentro7.setDate(dentro7.getDate() + 7);

    return this.getAll().filter(function(persona) {
      if (!persona.raw.FECHA_FIN_SEGUIMIENTO) return false;

      const fecha = PersonaService.startOfDay(
        new Date(persona.raw.FECHA_FIN_SEGUIMIENTO)
      );

      return fecha >= hoy && fecha <= dentro7;
    });
  },


  getRiesgoAlto() {
    return this.getAll().filter(function(persona) {
      return PersonaService.getRiesgo(persona) === CONFIG.RIESGO.ALTO;
    });
  },


  getByFechaIncorporacion(fechaObjetivo) {
    const objetivo = Utilities.formatDate(
      new Date(fechaObjetivo),
      CONFIG.APP.TIMEZONE,
      "yyyyMMdd"
    );

    return this.getAll().filter(function(persona) {
      if (!persona.fechaIncorporacion) return false;

      const fecha = Utilities.formatDate(
        new Date(persona.fechaIncorporacion),
        CONFIG.APP.TIMEZONE,
        "yyyyMMdd"
      );

      return fecha === objetivo;
    });
  },


  diasSeguimiento(persona) {
    if (!persona) return 0;

    if (persona.diasEnSeguimiento) {
      return this.toNumber(persona.diasEnSeguimiento);
    }

    if (!persona.fechaIncorporacion) {
      return 0;
    }

    const inicio = this.startOfDay(
      new Date(persona.fechaIncorporacion)
    );

    const hoy = this.startOfDay(new Date());

    const dias = Math.floor(
      (hoy.getTime() - inicio.getTime()) / 86400000
    );

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
      return this.toNumber(persona.porcentajePreparacion || 0);
    }

    return ChecklistService.getProgress(id);
  },


  getChecklistCompleted(persona) {
    const id = this.getId(persona);

    if (!id || typeof ChecklistService === "undefined") {
      const pct = this.getChecklistProgress(persona);
      return Math.round((pct / 100) * CONFIG.CHECKS.length);
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


  getRiesgo(persona) {
    const riesgoManual =
      persona.riesgoOriginal ||
      persona.RIESGO ||
      "";

    if (riesgoManual) {
      return riesgoManual;
    }

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


  getFormadores() {
    const mapa = {};

    this.getEnSeguimiento().forEach(function(persona) {
      const tutor = persona.tutor || "Sin tutor";
      mapa[tutor] = (mapa[tutor] || 0) + 1;
    });

    return Object.keys(mapa)
      .map(function(nombre) {
        return {
          nombre: nombre,
          personas: mapa[nombre]
        };
      })
      .sort(function(a, b) {
        return b.personas - a.personas;
      });
  },


  getResumen(personas) {
    personas = personas || this.getAll();

    const total = personas.length;

    const nuevas = personas.filter(function(persona) {
      return persona.programa === CONFIG.PROGRAMAS.NUEVA;
    }).length;

    const mili = personas.filter(function(persona) {
      return persona.programa === CONFIG.PROGRAMAS.MILI;
    }).length;

    const riesgo = personas.filter(function(persona) {
      return PersonaService.getRiesgo(persona) === CONFIG.RIESGO.ALTO;
    }).length;

    const formadores =
      this.getFormadores().filter(function(f) {
        return f.nombre !== "Sin tutor";
      }).length;

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
  return PersonaService.buscar(texto);
}