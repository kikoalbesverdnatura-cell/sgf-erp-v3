/*********************************************************************
 * SGF ERP v3
 * ChecklistService.js
 * -------------------------------------------------------------------
 * Gestión del checklist de onboarding
 *********************************************************************/

const ChecklistService = {

  /*******************************************************************
   * TODOS LOS REGISTROS
   *******************************************************************/
  getAll() {

    return DataService.getAll(
      CONFIG.SHEETS.CHECKLISTS
    );

  },


  /*******************************************************************
   * CHECKLIST DE UNA PERSONA
   *******************************************************************/
  getByPersona(idTrabajador) {

    return this.getAll()

      .filter(function(item){

        return String(item.ID_TRABAJADOR) === String(idTrabajador);

      });

  },


  /*******************************************************************
   * UN CHECK ESTÁ COMPLETADO
   *******************************************************************/
  isCompleted(idTrabajador,idCheck){

    return this.getByPersona(idTrabajador)

      .some(function(item){

        return item.CHECK_ID == idCheck &&
               item.ESTADO == "OK";

      });

  },


  /*******************************************************************
   * COMPLETAR CHECK
   *******************************************************************/
  complete(idTrabajador,idCheck,usuario,observaciones){

    usuario = usuario || "";

    observaciones = observaciones || "";

    DataService.insert(

      CONFIG.SHEETS.CHECKLISTS,

      {

        ID: Utilities.getUuid(),

        ID_TRABAJADOR: idTrabajador,

        CHECK_ID: idCheck,

        CHECK: this.getCheckName(idCheck),

        ESTADO: "OK",

        FECHA: new Date(),

        USUARIO: usuario,

        OBSERVACIONES: observaciones

      }

    );

    return true;

  },


  /*******************************************************************
   * DESHACER CHECK
   *******************************************************************/
  undo(idTrabajador,idCheck){

    const registros = this.getByPersona(idTrabajador);

    registros.forEach(function(item){

      if(item.CHECK_ID == idCheck){

        DataService.remove(

          CONFIG.SHEETS.CHECKLISTS,

          "ID",

          item.ID

        );

      }

    });

  },


  /*******************************************************************
   * Nº CHECKS COMPLETADOS
   *******************************************************************/
  countCompleted(idTrabajador){

    return this.getByPersona(idTrabajador)

      .filter(function(item){

        return item.ESTADO=="OK";

      })

      .length;

  },


  /*******************************************************************
   * %
   *******************************************************************/
  getProgress(idTrabajador){

    const total = CONFIG.CHECKS.length;

    const hechos = this.countCompleted(idTrabajador);

    return Math.round(

      (hechos / total) * 100

    );

  },


  /*******************************************************************
   * CHECKS PENDIENTES
   *******************************************************************/
  getPending(idTrabajador){

    const self = this;

    return CONFIG.CHECKS.filter(function(check){

      return !self.isCompleted(

        idTrabajador,

        check.id

      );

    });

  },


  /*******************************************************************
   * PRÓXIMA ACCIÓN
   *******************************************************************/
  getNextAction(idTrabajador){

    const pendientes =

      this.getPending(idTrabajador);

    if(!pendientes.length){

      return "Checklist completado";

    }

    return pendientes[0].nombre;

  },


  /*******************************************************************
   * OBTENER DEFINICIÓN DEL CHECK
   *******************************************************************/
  getCheck(idCheck){

    return CONFIG.CHECKS.find(function(check){

      return check.id == idCheck;

    }) || null;

  },


  /*******************************************************************
   * NOMBRE DEL CHECK
   *******************************************************************/
  getCheckName(idCheck){

    const check = this.getCheck(idCheck);

    return check

      ? check.nombre

      : idCheck;

  },


  /*******************************************************************
   * AGRUPAR POR GRUPO
   *******************************************************************/
  getGrouped(idTrabajador){

    const self = this;

    const grupos = {};

    CONFIG.CHECKS.forEach(function(check){

      if(!grupos[check.grupo]){

        grupos[check.grupo]=[];

      }

      grupos[check.grupo].push({

        id:check.id,

        nombre:check.nombre,

        obligatorio:check.obligatorio,

        realizado:self.isCompleted(

          idTrabajador,

          check.id

        )

      });

    });

    return grupos;

  },


  /*******************************************************************
   * CHECKLIST COMPLETO
   *******************************************************************/
  isComplete(idTrabajador){

    return this.getProgress(idTrabajador)==100;

  }

};



/*********************************************************************
 * MÉTODOS GLOBALES
 *********************************************************************/

function getChecklistPersona(id){

  return ChecklistService.getByPersona(id);

}

function getChecklistProgress(id){

  return ChecklistService.getProgress(id);

}