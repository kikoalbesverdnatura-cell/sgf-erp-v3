/*********************************************************************
 * SGF ERP v3
 * EvaluacionService.js
 * -------------------------------------------------------------------
 * Servicio de dominio para la gestion de evaluaciones del trabajador.
 *
 * Regla:
 * - Toda interpretacion de evaluaciones se centraliza aqui.
 * - Si existe hoja de evaluaciones, se usa DataService en este servicio.
 * - Si no existe hoja o no hay datos, se usa fallback desde PersonaService.
 *********************************************************************/

const EvaluacionService = {

  /*******************************************************************
   * BLOQUE 1 - API PUBLICA
   *******************************************************************/
  getEvaluacionesByPersona(personaId) {
    const fromSheet = this.getEvaluacionesFromSheet(personaId);

    if (fromSheet.length) {
      return fromSheet;
    }

    return this.getEvaluacionesFromPersona(personaId);
  },


  getUltimaEvaluacion(personaId) {
    const evaluaciones = this.getEvaluacionesByPersona(personaId);

    if (!evaluaciones.length) {
      return null;
    }

    const ordenadas = evaluaciones
      .slice()
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    return ordenadas[ordenadas.length - 1] || null;
  },


  getMediaEvaluaciones(personaId) {
    const evaluaciones = this.getCompletadas(personaId);

    if (!evaluaciones.length) {
      return 0;
    }

    const total = evaluaciones.reduce((acc, item) => {
      return acc + this.toNumber(item.nota);
    }, 0);

    return this.round(total / evaluaciones.length, 2);
  },


  getResumenEvaluaciones(personaId) {
    const evaluaciones = this.getEvaluacionesByPersona(personaId);
    return this.buildResumen(personaId, evaluaciones);
  },


  getPendientes(personaId) {
    return this.getEvaluacionesByPersona(personaId).filter((item) => {
      return item.estado === "PENDIENTE";
    });
  },


  getCompletadas(personaId) {
    return this.getEvaluacionesByPersona(personaId).filter((item) => {
      return item.estado === "COMPLETADA";
    });
  },


  getProximaEvaluacion(personaId) {
    const pendientes = this.getPendientes(personaId)
      .filter((item) => item.fecha)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    return pendientes[0] || null;
  },


  getEstadoEvaluacion(personaId) {
    return this.getResumenEvaluaciones(personaId).estado;
  },


  getColorEstado(personaId) {
    return this.getResumenEvaluaciones(personaId).color;
  },


  /*******************************************************************
   * BLOQUE 2 - ORIGEN DE DATOS
   *******************************************************************/
  getEvaluacionesFromSheet(personaId) {
    const sheetName = (typeof CONFIG !== "undefined" && CONFIG.SHEETS)
      ? CONFIG.SHEETS.EVALUACIONES
      : "";

    if (!sheetName) {
      return [];
    }

    const rows = this.safeGetAll(sheetName);

    if (!rows.length) {
      return [];
    }

    return rows
      .map((row) => this.normalize(row, personaId))
      .filter((item) => String(item.personaId) === String(personaId))
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  },


  getEvaluacionesFromPersona(personaId) {
    const persona = PersonaService.getById(personaId);

    if (!persona) {
      return [];
    }

    const base = this.buildEvaluacion({
      id: "EVAL_BASE",
      fecha: this.normalizarFecha(persona.ultimaEvaluacion),
      tutor: persona.tutor || "",
      competencia: "General",
      nota: this.toNumber(persona.mediaEvaluaciones),
      estado: this.toNumber(persona.mediaEvaluaciones) > 0 ? "COMPLETADA" : "PENDIENTE",
      comentarios: "",
      objetivos: "",
      personaId: persona.id
    });

    return base ? [base] : [];
  },


  /*******************************************************************
   * BLOQUE 3 - UTILIDADES PRIVADAS
   *******************************************************************/
  normalize(row, personaId) {
    const source = row || {};

    const id = this.pick(source, ["ID", "EVALUACION_ID"]);
    const fecha = this.normalizarFecha(this.pick(source, ["FECHA", "FECHA_EVALUACION"]));
    const tutor = this.pick(source, ["TUTOR", "NOMBRE_TUTOR", "EVALUADOR"]);
    const competencia = this.pick(source, ["COMPETENCIA", "AREA", "BLOQUE"]);
    const nota = this.toNumber(this.pick(source, ["NOTA", "RESULTADO", "VALORACION", "PUNTUACION"]));
    const comentarios = this.pick(source, ["COMENTARIOS", "OBSERVACIONES", "COMENTARIO"]);
    const objetivos = this.pick(source, ["OBJETIVOS", "OBJETIVO"]);

    const personaIdRow = this.pick(source, ["ID_TRABAJADOR", "ID Trabajador", "PERSONA_ID", "ID_PERSONA"]) || personaId;

    const estadoRaw = this.pick(source, ["ESTADO", "STATUS"]);
    const estado = this.normalizeEstado(estadoRaw, nota, fecha);

    return this.buildEvaluacion({
      id: id || this.buildSyntheticId(personaIdRow, fecha, competencia),
      fecha: fecha,
      tutor: tutor,
      competencia: competencia,
      nota: nota,
      estado: estado,
      comentarios: comentarios,
      objetivos: objetivos,
      personaId: personaIdRow
    });
  },


  buildEvaluacion(data) {
    const evaluacion = data || {};

    return {
      id: evaluacion.id || "",
      fecha: evaluacion.fecha || "",
      tutor: evaluacion.tutor || "",
      competencia: evaluacion.competencia || "",
      nota: this.toNumber(evaluacion.nota),
      estado: evaluacion.estado || "PENDIENTE",
      comentarios: evaluacion.comentarios || "",
      objetivos: evaluacion.objetivos || "",
      personaId: evaluacion.personaId || ""
    };
  },


  buildResumen(personaId, evaluaciones) {
    const lista = evaluaciones || [];

    const completadas = lista.filter((item) => item.estado === "COMPLETADA");
    const pendientes = lista.filter((item) => item.estado === "PENDIENTE");

    const ultima = this.getUltimaFromList(lista);
    const proxima = this.getProximaFromList(pendientes);
    const media = this.getMediaFromList(completadas);

    const estado = this.resolveEstado(pendientes.length, completadas.length, lista.length);

    return {
      personaId: personaId,
      media: media,
      ultimaEvaluacion: ultima,
      proximaEvaluacion: proxima,
      estado: estado,
      color: this.resolveColor(estado),
      pendientes: pendientes.length,
      completadas: completadas.length,
      evaluaciones: lista
    };
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


  normalizarFecha(valor) {
    if (!valor) {
      return "";
    }

    const d = new Date(valor);

    if (isNaN(d.getTime())) {
      return String(valor);
    }

    return d;
  },


  safeGetAll(sheetName) {
    if (!sheetName) {
      return [];
    }

    try {
      return DataService.getAll(sheetName);
    } catch (error) {
      console.warn("EvaluacionService.safeGetAll:", sheetName, error);
      return [];
    }
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


  normalizeEstado(estadoRaw, nota, fecha) {
    const e = String(estadoRaw || "").trim().toUpperCase();

    if (e === "COMPLETADA" || e === "COMPLETADO" || e === "OK") {
      return "COMPLETADA";
    }

    if (e === "PENDIENTE") {
      return "PENDIENTE";
    }

    if (this.toNumber(nota) > 0 || fecha) {
      return "COMPLETADA";
    }

    return "PENDIENTE";
  },


  getUltimaFromList(lista) {
    if (!lista || !lista.length) {
      return null;
    }

    const ordenadas = lista
      .slice()
      .filter((item) => item.fecha)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    return ordenadas.length ? ordenadas[ordenadas.length - 1] : lista[lista.length - 1];
  },


  getProximaFromList(pendientes) {
    if (!pendientes || !pendientes.length) {
      return null;
    }

    const conFecha = pendientes
      .slice()
      .filter((item) => item.fecha)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    return conFecha.length ? conFecha[0] : pendientes[0];
  },


  getMediaFromList(completadas) {
    if (!completadas || !completadas.length) {
      return 0;
    }

    const total = completadas.reduce((acc, item) => acc + this.toNumber(item.nota), 0);
    return this.round(total / completadas.length, 2);
  },


  resolveEstado(pendientes, completadas, total) {
    if (!total) {
      return "SIN_EVALUAR";
    }

    if (pendientes === 0 && completadas > 0) {
      return "AL_DIA";
    }

    if (completadas > 0 && pendientes > 0) {
      return "EN_CURSO";
    }

    return "PENDIENTE";
  },


  resolveColor(estado) {
    const colors = (typeof CONFIG !== "undefined" && CONFIG.COLORS)
      ? CONFIG.COLORS
      : {};

    if (estado === "AL_DIA") {
      return colors.SUCCESS || "#198754";
    }

    if (estado === "EN_CURSO") {
      return colors.WARNING || "#FFC107";
    }

    if (estado === "SIN_EVALUAR") {
      return colors.INFO || "#0D6EFD";
    }

    return colors.DANGER || "#DC3545";
  },


  buildSyntheticId(personaId, fecha, competencia) {
    const pid = String(personaId || "");
    const f = fecha instanceof Date
      ? fecha.toISOString().substring(0, 10)
      : String(fecha || "");

    return "EVAL_" + pid + "_" + f + "_" + String(competencia || "GEN");
  },


  round(valor, decimals) {
    const factor = Math.pow(10, decimals || 0);
    return Math.round((valor || 0) * factor) / factor;
  }

};


/*********************************************************************
 * WRAPPERS GLOBALES DE COMPATIBILIDAD
 *********************************************************************/

function getEvaluacionesByPersona(personaId) {
  return EvaluacionService.getEvaluacionesByPersona(personaId);
}


function getResumenEvaluaciones(personaId) {
  return EvaluacionService.getResumenEvaluaciones(personaId);
}


function getUltimaEvaluacion(personaId) {
  return EvaluacionService.getUltimaEvaluacion(personaId);
}
