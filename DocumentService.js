/*********************************************************************
 * SGF ERP v3
 * DocumentService.js
 * -------------------------------------------------------------------
 * Servicio de dominio de documentacion del trabajador.
 *
 * Regla:
 * - Toda interpretacion documental se realiza aqui.
 * - Fuente principal: PersonaService.getById(personaId).
 *********************************************************************/

const DocumentService = {

  /*******************************************************************
   * BLOQUE 1 - API PUBLICA
   *******************************************************************/
  getDocumentacionByPersona(personaId) {
    const persona = PersonaService.getById(personaId);

    if (!persona) {
      return this.buildResumen({
        personaId: personaId,
        items: []
      });
    }

    const normalized = this.normalize(persona);
    const items = this.buildItems(normalized);

    return this.buildResumen({
      personaId: normalized.personaId,
      items: items
    });
  },


  getResumenDocumentacion(personaId) {
    const doc = this.getDocumentacionByPersona(personaId);

    return {
      personaId: doc.personaId,
      porcentaje: doc.porcentaje,
      estado: doc.estado,
      color: doc.color,
      pendientes: doc.pendientes,
      completados: doc.completados,
      obligatorios: doc.obligatorios,
      opcionales: doc.opcionales
    };
  },


  getPendientes(personaId) {
    return this.getDocumentacionByPersona(personaId).items.filter((item) => {
      return item.estado !== "COMPLETADO";
    });
  },


  getCompletados(personaId) {
    return this.getDocumentacionByPersona(personaId).items.filter((item) => {
      return item.estado === "COMPLETADO";
    });
  },


  getPorcentajeDocumentacion(personaId) {
    return this.getDocumentacionByPersona(personaId).porcentaje;
  },


  isCompleta(personaId) {
    return this.getDocumentacionByPersona(personaId).estado === "COMPLETA";
  },


  isPendiente(personaId) {
    const estado = this.getDocumentacionByPersona(personaId).estado;
    return estado === "PENDIENTE" || estado === "EN_CURSO";
  },


  getEstadoDocumentacion(personaId) {
    return this.getDocumentacionByPersona(personaId).estado;
  },


  getColorEstado(personaId) {
    return this.getDocumentacionByPersona(personaId).color;
  },


  /*******************************************************************
   * BLOQUE 2 - UTILIDADES PRIVADAS
   *******************************************************************/
  normalize(persona) {
    return {
      personaId: persona.id,
      rrhh: this.toBoolean(persona.rrhh),
      uniforme: this.toBoolean(persona.uniforme),
      almuerzo: this.toBoolean(persona.almuerzo),
      psicotecnico: this.toBoolean(persona.psicotecnico),
      formacionBienvenida: this.toBoolean(persona.formacionBienvenida),
      tourEmpresa: this.toBoolean(persona.tourEmpresa),
      pdaEntregada: this.toBoolean(persona.pdaEntregada),
      pdaDocumento: this.toBoolean(persona.pdaDocumento),
      pdaFirma: this.toBoolean(persona.pdaFechaFirma),
      pdaFechaFirma: persona.pdaFechaFirma || ""
    };
  },


  isCompleted(valor) {
    return this.toBoolean(valor) === true;
  },


  toBoolean(valor) {
    if (valor === true) return true;
    if (valor === false) return false;
    if (valor === 1) return true;
    if (valor === 0) return false;
    if (valor === null || valor === undefined) return false;

    const v = String(valor).trim().toUpperCase();

    if (!v) return false;

    if (v === "SI") return true;
    if (v === "SÍ") return true;
    if (v === "TRUE") return true;
    if (v === "1") return true;
    if (v === "X") return true;
    if (v === "CHECK") return true;
    if (v === "OK") return true;

    if (v === "NO") return false;
    if (v === "FALSE") return false;
    if (v === "0") return false;
    if (v === "NULL") return false;
    if (v === "VACIO") return false;

    return false;
  },


  buildItem(id, nombre, completado, fecha, obligatorio) {
    return {
      id: id,
      nombre: nombre,
      estado: completado ? "COMPLETADO" : "PENDIENTE",
      fecha: fecha || "",
      obligatorio: obligatorio === true
    };
  },


  buildResumen(payload) {
    const personaId = payload.personaId || "";
    const items = payload.items || [];

    const completadosItems = items.filter((item) => item.estado === "COMPLETADO");
    const pendientesItems = items.filter((item) => item.estado !== "COMPLETADO");

    const obligatoriosItems = items.filter((item) => item.obligatorio === true);
    const opcionalesItems = items.filter((item) => item.obligatorio !== true);

    const obligatoriosCompletados = obligatoriosItems.filter((item) => item.estado === "COMPLETADO").length;
    const obligatoriosTotal = obligatoriosItems.length;

    const porcentaje = obligatoriosTotal
      ? Math.round((obligatoriosCompletados / obligatoriosTotal) * 100)
      : 0;

    const estado = this.resolveEstado(porcentaje, obligatoriosCompletados, obligatoriosTotal);

    return {
      personaId: personaId,
      porcentaje: porcentaje,
      estado: estado,
      color: this.resolveColor(estado),
      pendientes: pendientesItems.length,
      completados: completadosItems.length,
      obligatorios: obligatoriosItems.length,
      opcionales: opcionalesItems.length,
      items: items
    };
  },


  /*******************************************************************
   * BLOQUE 3 - COMPOSICION INTERNA
   *******************************************************************/
  buildItems(doc) {
    return [
      this.buildItem("RRHH", "RRHH", this.isCompleted(doc.rrhh), "", true),
      this.buildItem("UNIFORME", "Uniforme", this.isCompleted(doc.uniforme), "", true),
      this.buildItem("ALMUERZO", "Almuerzo", this.isCompleted(doc.almuerzo), "", true),
      this.buildItem("PSICOTECNICO", "Psicotecnico", this.isCompleted(doc.psicotecnico), "", true),
      this.buildItem("FORMACION_BIENVENIDA", "Formacion Bienvenida", this.isCompleted(doc.formacionBienvenida), "", true),
      this.buildItem("TOUR_EMPRESA", "Tour Empresa", this.isCompleted(doc.tourEmpresa), "", true),
      this.buildItem("PDA_ENTREGADA", "PDA Entregada", this.isCompleted(doc.pdaEntregada), "", true),
      this.buildItem("PDA_DOCUMENTO", "Documento PDA", this.isCompleted(doc.pdaDocumento), "", true),
      this.buildItem("PDA_FIRMA", "Firma PDA", this.isCompleted(doc.pdaFirma), doc.pdaFechaFirma, false),
      this.buildItem("PDA_FECHA_FIRMA", "Fecha Firma PDA", this.isCompleted(doc.pdaFechaFirma), doc.pdaFechaFirma, false)
    ];
  },


  resolveEstado(porcentaje, obligatoriosCompletados, obligatoriosTotal) {
    if (!obligatoriosTotal) {
      return "PENDIENTE";
    }

    if (porcentaje >= 100) {
      return "COMPLETA";
    }

    if (obligatoriosCompletados <= 0) {
      return "PENDIENTE";
    }

    return "EN_CURSO";
  },


  resolveColor(estado) {
    const colors = (typeof CONFIG !== "undefined" && CONFIG.COLORS)
      ? CONFIG.COLORS
      : {};

    if (estado === "COMPLETA") {
      return colors.SUCCESS || "#198754";
    }

    if (estado === "EN_CURSO") {
      return colors.WARNING || "#FFC107";
    }

    return colors.DANGER || "#DC3545";
  }

};


/*********************************************************************
 * WRAPPERS GLOBALES
 *********************************************************************/

function getDocumentacionByPersona(personaId) {
  return DocumentService.getDocumentacionByPersona(personaId);
}


function getPendientesDocumentacion(personaId) {
  return DocumentService.getPendientes(personaId);
}


function getResumenDocumentacion(personaId) {
  return DocumentService.getResumenDocumentacion(personaId);
}
