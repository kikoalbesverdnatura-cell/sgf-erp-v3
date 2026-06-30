/*********************************************************************
 * SGF ERP v3
 * GrafanaService.js
 * -------------------------------------------------------------------
 * Servicio de dominio para Grafana:
 * - productividad
 * - errores
 * - historico
 *********************************************************************/

const GrafanaService = {

  /*******************************************************************
   * BLOQUE 1 - LECTURA Y NORMALIZACION DE PRODUCTIVIDAD
   *******************************************************************/
  getProductividadByPersona(personaId) {
    const rows = this.safeGetAll(CONFIG.SHEETS.PRODUCTIVIDAD_RAW)
      .map((row) => this.normalizeProductividad(row));

    return this
      .filtrarPorPersona(rows, personaId)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  },


  normalizeProductividad(row) {
    const source = row || {};

    return {
      fecha: this.normalizarFecha(this.pick(source, ["FECHA", "Fecha"])),
      idTrabajador: this.pick(source, ["ID_TRABAJADOR", "ID Trabajador", "ID"]),
      nombre: this.pick(source, ["NOMBRE", "NOMBRE_COMPLETO", "Nombre"]),
      departamento: this.pick(source, ["DEPARTAMENTO", "DEPARTAMENTO_ORIGEN"]),
      totalLineas: this.toNumber(this.pick(source, ["TOTAL_LINEAS", "Total lineas"])),
      lineasEsperadas: this.toNumber(this.pick(source, ["LINEAS_ESPERADAS", "Lineas esperadas"])),
      porcentaje: this.toNumber(this.pick(source, ["PORCENTAJE", "%", "PRODUCTIVIDAD_MEDIA"])),
      tiempoTotal: this.toNumber(this.pick(source, ["TIEMPO_TOTAL", "Tiempo total"])),
      lineasHora: this.toNumber(this.pick(source, ["LINEAS_HORA", "Lineas hora"])),
      volumen: this.toNumber(this.pick(source, ["VOLUMEN", "Volumen"])),
      equipo: this.pick(source, ["EQUIPO", "Equipo"]),
      raw: source
    };
  },


  /*******************************************************************
   * BLOQUE 2 - LECTURA Y NORMALIZACION DE ERRORES
   *******************************************************************/
  getErroresByPersona(personaId) {
    const rows = this.safeGetAll(CONFIG.SHEETS.ERRORES_RAW)
      .map((row) => this.normalizeErrores(row));

    return this
      .filtrarPorPersona(rows, personaId)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  },


  normalizeErrores(row) {
    const source = row || {};

    const nivelIncorrecto = this.toNumber(this.pick(source, ["NIVEL_INCORRECTO"]));
    const cantidadIncorrecta = this.toNumber(this.pick(source, ["CANTIDAD_INCORRECTA"]));
    const seHaSaltado = this.toNumber(this.pick(source, ["SE_HA_SALTADO"]));
    const productoEquivocado = this.toNumber(this.pick(source, ["PRODUCTO_EQUIVOCADO"]));
    const desordenado = this.toNumber(this.pick(source, ["DESORDENADO"]));
    const malEtiquetado = this.toNumber(this.pick(source, ["MAL_ETIQUETADO"]));
    const maltratado = this.toNumber(this.pick(source, ["MALTRATADO"]));
    const noHaceCambio = this.toNumber(this.pick(source, ["NO_HACE_CAMBIO"]));

    const totalErroresRaw = this.toNumber(this.pick(source, ["TOTAL_ERRORES"]));

    return {
      fecha: this.normalizarFecha(this.pick(source, ["FECHA", "Fecha"])),
      idTrabajador: this.pick(source, ["ID_TRABAJADOR", "ID Trabajador", "ID"]),
      nombre: this.pick(source, ["NOMBRE", "NOMBRE_COMPLETO", "Nombre"]),
      departamento: this.pick(source, ["DEPARTAMENTO", "DEPARTAMENTO_ORIGEN"]),
      nivelIncorrecto: nivelIncorrecto,
      cantidadIncorrecta: cantidadIncorrecta,
      seHaSaltado: seHaSaltado,
      productoEquivocado: productoEquivocado,
      desordenado: desordenado,
      malEtiquetado: malEtiquetado,
      maltratado: maltratado,
      noHaceCambio: noHaceCambio,
      totalErrores: totalErroresRaw > 0
        ? totalErroresRaw
        : (nivelIncorrecto + cantidadIncorrecta + seHaSaltado + productoEquivocado + desordenado + malEtiquetado + maltratado + noHaceCambio),
      errorPctTotal: this.toNumber(this.pick(source, ["ERROR_PCT_TOTAL", "ERROR_MEDIO", "ERROR_PCT"])),
      revisor: this.pick(source, ["NOMBRE_REVISOR", "REVISOR", "TUTOR"]),
      raw: source
    };
  },


  /*******************************************************************
   * BLOQUE 3 - HISTORICO Y RESUMEN
   *******************************************************************/
  getHistoricoByPersona(personaId) {
    const sheetHistorico = CONFIG.SHEETS.HISTORICO;

    if (sheetHistorico) {
      const historicoRows = this.safeGetAll(sheetHistorico);

      if (historicoRows.length) {
        return this
          .filtrarPorPersona(historicoRows, personaId)
          .map((row) => {
            const p = this.normalizeProductividad(row);
            const e = this.normalizeErrores(row);

            return {
              fecha: p.fecha || e.fecha,
              idTrabajador: p.idTrabajador || e.idTrabajador,
              nombre: p.nombre || e.nombre,
              departamento: p.departamento || e.departamento,
              totalLineas: p.totalLineas,
              lineasEsperadas: p.lineasEsperadas,
              porcentaje: p.porcentaje,
              tiempoTotal: p.tiempoTotal,
              lineasHora: p.lineasHora,
              volumen: p.volumen,
              equipo: p.equipo,
              nivelIncorrecto: e.nivelIncorrecto,
              cantidadIncorrecta: e.cantidadIncorrecta,
              seHaSaltado: e.seHaSaltado,
              productoEquivocado: e.productoEquivocado,
              desordenado: e.desordenado,
              malEtiquetado: e.malEtiquetado,
              maltratado: e.maltratado,
              noHaceCambio: e.noHaceCambio,
              totalErrores: e.totalErrores,
              errorPctTotal: e.errorPctTotal,
              revisor: e.revisor,
              raw: row
            };
          })
          .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      }
    }

    return this.buildHistoricoFromRaw(personaId);
  },


  getResumenGrafanaByPersona(personaId) {
    const historico = this.getHistoricoByPersona(personaId);

    if (!historico.length) {
      return {
        personaId: personaId,
        diasConDatos: 0,
        productividadMedia: 0,
        lineasHoraMedia: 0,
        errorMedio: 0,
        totalErrores: 0,
        ultimaFechaGrafana: ""
      };
    }

    const acc = historico.reduce((memo, item) => {
      memo.productividad += this.toNumber(item.porcentaje);
      memo.lineasHora += this.toNumber(item.lineasHora);
      memo.error += this.toNumber(item.errorPctTotal);
      memo.totalErrores += this.toNumber(item.totalErrores);
      return memo;
    }, {
      productividad: 0,
      lineasHora: 0,
      error: 0,
      totalErrores: 0
    });

    const diasConDatos = historico.length;

    return {
      personaId: personaId,
      diasConDatos: diasConDatos,
      productividadMedia: this.round(acc.productividad / diasConDatos, 2),
      lineasHoraMedia: this.round(acc.lineasHora / diasConDatos, 2),
      errorMedio: this.round(acc.error / diasConDatos, 4),
      totalErrores: acc.totalErrores,
      ultimaFechaGrafana: historico[diasConDatos - 1].fecha || ""
    };
  },


  getProductividadMedia(personaId) {
    return this.getResumenGrafanaByPersona(personaId).productividadMedia;
  },


  getLineasHoraMedia(personaId) {
    return this.getResumenGrafanaByPersona(personaId).lineasHoraMedia;
  },


  getErrorMedio(personaId) {
    return this.getResumenGrafanaByPersona(personaId).errorMedio;
  },


  getTotalErrores(personaId) {
    return this.getResumenGrafanaByPersona(personaId).totalErrores;
  },


  getUltimaFechaGrafana(personaId) {
    return this.getResumenGrafanaByPersona(personaId).ultimaFechaGrafana;
  },


  /*******************************************************************
   * BLOQUE 4 - UTILIDADES INTERNAS
   *******************************************************************/
  filtrarPorPersona(rows, personaId) {
    const id = String(personaId || "").trim();

    if (!id) {
      return [];
    }

    return (rows || []).filter((row) => {
      const rowId = String(row.idTrabajador || row.ID_TRABAJADOR || row["ID Trabajador"] || row.ID || "").trim();
      return rowId === id;
    });
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
      console.warn("GrafanaService.safeGetAll:", sheetName, error);
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


  round(valor, decimals) {
    const factor = Math.pow(10, decimals || 0);
    return Math.round((valor || 0) * factor) / factor;
  },


  buildHistoricoFromRaw(personaId) {
    const productividad = this.getProductividadByPersona(personaId);
    const errores = this.getErroresByPersona(personaId);

    if (!productividad.length && !errores.length) {
      return [];
    }

    const map = {};

    productividad.forEach((item) => {
      const key = this.getHistoricoKey(item.fecha, item.idTrabajador);

      map[key] = Object.assign({}, map[key] || {}, {
        fecha: item.fecha,
        idTrabajador: item.idTrabajador,
        nombre: item.nombre,
        departamento: item.departamento,
        totalLineas: item.totalLineas,
        lineasEsperadas: item.lineasEsperadas,
        porcentaje: item.porcentaje,
        tiempoTotal: item.tiempoTotal,
        lineasHora: item.lineasHora,
        volumen: item.volumen,
        equipo: item.equipo,
        nivelIncorrecto: 0,
        cantidadIncorrecta: 0,
        seHaSaltado: 0,
        productoEquivocado: 0,
        desordenado: 0,
        malEtiquetado: 0,
        maltratado: 0,
        noHaceCambio: 0,
        totalErrores: 0,
        errorPctTotal: 0,
        revisor: ""
      });
    });

    errores.forEach((item) => {
      const key = this.getHistoricoKey(item.fecha, item.idTrabajador);

      map[key] = Object.assign({}, map[key] || {}, {
        fecha: item.fecha,
        idTrabajador: item.idTrabajador,
        nombre: item.nombre,
        departamento: item.departamento,
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
        revisor: item.revisor,
        totalLineas: this.toNumber((map[key] || {}).totalLineas),
        lineasEsperadas: this.toNumber((map[key] || {}).lineasEsperadas),
        porcentaje: this.toNumber((map[key] || {}).porcentaje),
        tiempoTotal: this.toNumber((map[key] || {}).tiempoTotal),
        lineasHora: this.toNumber((map[key] || {}).lineasHora),
        volumen: this.toNumber((map[key] || {}).volumen),
        equipo: (map[key] || {}).equipo || ""
      });
    });

    return Object.keys(map)
      .map((key) => map[key])
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  },


  getHistoricoKey(fecha, idTrabajador) {
    const f = fecha instanceof Date
      ? fecha.toISOString().substring(0, 10)
      : String(fecha || "");

    return String(idTrabajador || "") + "|" + f;
  }

};


/*********************************************************************
 * WRAPPERS GLOBALES DE COMPATIBILIDAD
 *********************************************************************/

function getGrafanaByPersona(personaId) {
  return GrafanaService.getResumenGrafanaByPersona(personaId);
}


function getProductividadByPersona(personaId) {
  return GrafanaService.getProductividadByPersona(personaId);
}


function getErroresByPersona(personaId) {
  return GrafanaService.getErroresByPersona(personaId);
}
