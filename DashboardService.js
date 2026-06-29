```javascript
/*********************************************************************
 * SGF ERP v3
 * DashboardService.js
 * -------------------------------------------------------------------
 * Centro de Operaciones
 * Departamento de Formación
 *
 * REGLA:
 * DashboardService NO accede directamente a MAESTRO_PERSONAS.
 * Las personas siempre vienen normalizadas desde PersonaService.
 *********************************************************************/

const DashboardService = {

  /*******************************************************************
   * DASHBOARD COMPLETO
   *******************************************************************/
  getDashboard() {
    const personas = PersonaService.getAll();

    return {
      resumen: this.getResumen(personas),
      kpis: this.getKPIs(personas),
      entradas: this.getEntradas(),
      incorporaciones: this.getIncorporaciones(personas),
      formadores: this.getFormadores(),
      checklistPendiente: this.getChecklistPendiente(personas),
      documentosPendientes: this.getDocumentosPendientes(personas),
      evaluacionesPendientes: this.getEvaluacionesPendientes(),
      alertas: this.getAlertas(personas),
      productividad: this.getProductividad(personas),
      timeline: this.getTimeline()
    };
  },


  /*******************************************************************
   * KPIs PRINCIPALES
   *******************************************************************/
  getKPIs(personas) {
    personas = personas || PersonaService.getAll();

    const stats = PersonaService.getStats();

    const checklistPendiente = this.getChecklistPendiente(personas).length;
    const documentosPendientes = this.getDocumentosPendientes(personas).length;
    const evaluacionesPendientes = this.getEvaluacionesPendientes().length;

    return {
      total: stats.total || 0,
      activos: stats.activos || 0,
      enSeguimiento: stats.enSeguimiento || 0,
      nuevas: stats.nuevas || stats.onboarding || 0,
      mili: stats.mili || 0,
      riesgoAlto: stats.riesgoAlto || 0,
      formadores: stats.formadores || 0,
      checklistPendiente: checklistPendiente,
      documentosPendientes: documentosPendientes,
      evaluacionesPendientes: evaluacionesPendientes
    };
  },


  /*******************************************************************
   * RESUMEN
   *******************************************************************/
  getResumen(personas) {
    personas = personas || PersonaService.getAll();

    const stats = PersonaService.getStats();

    return {
      total: stats.total || personas.length,
      activas: stats.activos || 0,
      activos: stats.activos || 0,
      enSeguimiento: stats.enSeguimiento || 0,
      nuevas: stats.nuevas || stats.onboarding || 0,
      onboarding: stats.onboarding || stats.nuevas || 0,
      mili: stats.mili || 0,
      riesgo: stats.riesgoAlto || 0,
      riesgoAlto: stats.riesgoAlto || 0,
      riesgoMedio: stats.riesgoMedio || 0,
      riesgoBajo: stats.riesgoBajo || 0,
      finalizados: stats.finalizados || 0,
      formadores: stats.formadores || 0,
      sinTutor: stats.sinTutor || 0,
      hoy: stats.hoy || 0,
      manana: stats.manana || 0,
      estaSemana: stats.estaSemana || 0
    };
  },


  /*******************************************************************
   * ENTRADAS
   *******************************************************************/
  getEntradas() {
    return {
      hoy: PersonaService.getHoy(),
      manana: PersonaService.getManana(),
      estaSemana: PersonaService.getEstaSemana(),
      finalizanEstaSemana: PersonaService.getFinalizanEstaSemana()
    };
  },


  /*******************************************************************
   * INCORPORACIONES
   *******************************************************************/
  getIncorporaciones(personas) {
    personas = personas || PersonaService.getAll();

    return personas
      .filter(persona => persona.fechaIncorporacion)
      .sort((a, b) => {
        return new Date(a.fechaIncorporacion) - new Date(b.fechaIncorporacion);
      })
      .slice(0, 20)
      .map(persona => this.toPersonaCard(persona));
  },


  /*******************************************************************
   * FORMADORES
   *******************************************************************/
  getFormadores() {
    if (typeof PersonaService.getFormadores === "function") {
      return PersonaService.getFormadores();
    }

    const mapa = {};

    PersonaService.getEnSeguimiento().forEach(persona => {
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


  /*******************************************************************
   * CHECKLIST PENDIENTE
   *******************************************************************/
  getChecklistPendiente(personas) {
    personas = personas || PersonaService.getAll();

    if (typeof ChecklistService !== "undefined" &&
        typeof ChecklistService.getPending === "function") {
      try {
        return ChecklistService.getPending();
      } catch (error) {
        console.warn("DashboardService.getChecklistPendiente:", error);
      }
    }

    return personas
      .filter(persona => {
        const progreso = PersonaService.getChecklistProgress(persona);
        return progreso < 100;
      })
      .map(persona => {
        return {
          personaId: persona.id,
          trabajador: persona.nombre,
          nombre: persona.nombre,
          programa: persona.programa,
          departamento: persona.departamento,
          tutor: persona.tutor,
          progreso: PersonaService.getChecklistProgress(persona),
          siguienteAccion: PersonaService.getNextAction(persona)
        };
      });
  },


  /*******************************************************************
   * DOCUMENTOS PENDIENTES
   *******************************************************************/
  getDocumentosPendientes(personas) {
    personas = personas || PersonaService.getAll();

    if (typeof DocumentoService !== "undefined" &&
        typeof DocumentoService.getPending === "function") {
      try {
        return DocumentoService.getPending();
      } catch (error) {
        console.warn("DashboardService.getDocumentosPendientes:", error);
      }
    }

    return personas
      .filter(persona => {
        return !PersonaService.isTrue(persona.pdaDocumento) ||
               !PersonaService.isTrue(persona.pdaFechaFirma);
      })
      .map(persona => {
        return {
          personaId: persona.id,
          trabajador: persona.nombre,
          nombre: persona.nombre,
          programa: persona.programa,
          departamento: persona.departamento,
          tutor: persona.tutor,
          documento: "Documentación PDA",
          estado: "Pendiente"
        };
      });
  },


  /*******************************************************************
   * EVALUACIONES PENDIENTES
   *******************************************************************/
  getEvaluacionesPendientes() {
    if (typeof EvaluacionService !== "undefined" &&
        typeof EvaluacionService.getPending === "function") {
      try {
        return EvaluacionService.getPending();
      } catch (error) {
        console.warn("DashboardService.getEvaluacionesPendientes:", error);
      }
    }

    if (!CONFIG.SHEETS.EVALUACIONES) {
      return [];
    }

    try {
      return DataService
        .getAll(CONFIG.SHEETS.EVALUACIONES)
        .filter(evaluacion => {
          return !evaluacion.FECHA_REALIZADA;
        });
    } catch (error) {
      console.warn("No se pudieron cargar evaluaciones:", error);
      return [];
    }
  },


  /*******************************************************************
   * ALERTAS
   *******************************************************************/
  getAlertas(personas) {
    personas = personas || PersonaService.getAll();

    const alertas = [];

    personas.forEach(persona => {
      const riesgo = PersonaService.getRiesgo(persona);

      if (riesgo === CONFIG.RIESGO.ALTO) {
        alertas.push({
          tipo: "RIESGO",
          nivel: "alto",
          personaId: persona.id,
          trabajador: persona.nombre,
          mensaje: "Riesgo alto",
          descripcion: "Persona con riesgo alto en seguimiento."
        });
      }

      if (!persona.tutor &&
          persona.estado !== CONFIG.ESTADOS.FINALIZADO &&
          persona.estado !== CONFIG.ESTADOS.BAJA) {
        alertas.push({
          tipo: "TUTOR",
          nivel: "medio",
          personaId: persona.id,
          trabajador: persona.nombre,
          mensaje: "Sin tutor asignado",
          descripcion: "Persona activa sin tutor asignado."
        });
      }

      const checklist = PersonaService.getChecklistProgress(persona);

      if (checklist < 50 &&
          persona.estado !== CONFIG.ESTADOS.FINALIZADO &&
          persona.estado !== CONFIG.ESTADOS.BAJA) {
        alertas.push({
          tipo: "CHECKLIST",
          nivel: "medio",
          personaId: persona.id,
          trabajador: persona.nombre,
          mensaje: "Checklist incompleto",
          descripcion: "Checklist por debajo del 50%."
        });
      }

      const error = PersonaService.getErrorMedio(persona);

      if (error > CONFIG.SYSTEM.ERROR_MAXIMO) {
        alertas.push({
          tipo: "ERRORES",
          nivel: "alto",
          personaId: persona.id,
          trabajador: persona.nombre,
          mensaje: "Errores por encima del máximo",
          descripcion: "El porcentaje de error supera el umbral definido."
        });
      }

      const productividad = PersonaService.getProductividadMedia(persona);

      if (productividad > 0 &&
          productividad < CONFIG.SYSTEM.PRODUCTIVIDAD_MINIMA) {
        alertas.push({
          tipo: "PRODUCTIVIDAD",
          nivel: "alto",
          personaId: persona.id,
          trabajador: persona.nombre,
          mensaje: "Productividad baja",
          descripcion: "La productividad está por debajo del mínimo esperado."
        });
      }
    });

    return alertas.slice(0, 30);
  },


  /*******************************************************************
   * PRODUCTIVIDAD
   *******************************************************************/
  getProductividad(personas) {
    personas = personas || PersonaService.getAll();

    const personasConDatos = personas.filter(persona => {
      return PersonaService.getProductividadMedia(persona) > 0;
    });

    if (!personasConDatos.length) {
      return {
        media: 0,
        personas: 0,
        errorMedio: 0,
        mejor: null,
        peor: null
      };
    }

    let totalProductividad = 0;
    let totalError = 0;

    personasConDatos.forEach(persona => {
      totalProductividad += PersonaService.getProductividadMedia(persona);
      totalError += PersonaService.getErrorMedio(persona);
    });

    const ordenadas = personasConDatos.slice().sort((a, b) => {
      return PersonaService.getProductividadMedia(b) -
             PersonaService.getProductividadMedia(a);
    });

    return {
      media: Math.round(totalProductividad / personasConDatos.length),
      personas: personasConDatos.length,
      errorMedio: Math.round((totalError / personasConDatos.length) * 100) / 100,
      mejor: this.toPersonaCard(ordenadas[0]),
      peor: this.toPersonaCard(ordenadas[ordenadas.length - 1])
    };
  },


  /*******************************************************************
   * TIMELINE
   *******************************************************************/
  getTimeline() {
    if (typeof TimelineService !== "undefined" &&
        typeof TimelineService.getRecent === "function") {
      try {
        return TimelineService.getRecent(20);
      } catch (error) {
        console.warn("DashboardService.getTimeline:", error);
      }
    }

    if (!CONFIG.SHEETS.EVENTOS) {
      return [];
    }

    try {
      return DataService
        .getAll(CONFIG.SHEETS.EVENTOS)
        .sort((a, b) => {
          return new Date(b.FECHA) - new Date(a.FECHA);
        })
        .slice(0, 20);
    } catch (error) {
      console.warn("No se pudo cargar timeline:", error);
      return [];
    }
  },


  /*******************************************************************
   * CONVERSIÓN PARA TARJETAS / TABLAS
   *******************************************************************/
  toPersonaCard(persona) {
    if (!persona) return null;

    return {
      id: persona.id,
      nombre: persona.nombre,
      programa: persona.programa,
      fechaIncorporacion: persona.fechaIncorporacion,
      departamento: persona.departamento,
      estado: persona.estado,
      tutor: persona.tutor,
      diasSeguimiento: PersonaService.diasSeguimiento(persona),
      progresoSeguimiento: PersonaService.getProgresoSeguimiento(persona),
      checklist: PersonaService.getChecklistProgress(persona),
      productividad: PersonaService.getProductividadMedia(persona),
      error: PersonaService.getErrorMedio(persona),
      riesgo: PersonaService.getRiesgo(persona),
      siguienteAccion: PersonaService.getNextAction(persona)
    };
  },


  /*******************************************************************
   * COMPATIBILIDAD CON DASHBOARD ANTIGUO
   *******************************************************************/
  getChecklistPendientes(personas) {
    return this.getChecklistPendiente(personas);
  },


  getDocumentos(personas) {
    return this.getDocumentosPendientes(personas);
  },


  getEvaluaciones() {
    return this.getEvaluacionesPendientes();
  }

};


/*********************************************************************
 * MÉTODO GLOBAL
 *********************************************************************/

function getDashboard() {
  return DashboardService.getDashboard();
}
```
