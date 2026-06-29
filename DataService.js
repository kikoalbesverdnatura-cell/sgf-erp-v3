/*********************************************************************
 * SGF ERP v3
 * DataService.js
 * -------------------------------------------------------------------
 * Capa única de acceso a Google Sheets.
 *
 * Todos los servicios deberán utilizar este archivo.
 *
 * Departamento de Formación - Verdnatura
 *********************************************************************/


const DataService = {


  /*******************************************************************
   * SPREADSHEET
   *******************************************************************/
  getSpreadsheet() {

    return SpreadsheetApp.openById(
      CONFIG.SPREADSHEET.ID
    );

  },


  /*******************************************************************
   * HOJA
   *******************************************************************/
  getSheet(sheetName) {

    const sheet =
      this.getSpreadsheet()
          .getSheetByName(sheetName);

    if (!sheet) {

      throw new Error(
        "No existe la hoja: " + sheetName
      );

    }

    return sheet;

  },


  /*******************************************************************
   * CABECERAS
   *******************************************************************/
  getHeaders(sheetName) {

    const sheet =
      this.getSheet(sheetName);

    if (sheet.getLastRow() === 0) {

      return [];

    }

    return sheet

      .getRange(
        1,
        1,
        1,
        sheet.getLastColumn()
      )

      .getValues()[0]

      .map(function (h) {

        return String(h).trim();

      });

  },


  /*******************************************************************
   * OBTENER TODOS
   *******************************************************************/
  getAll(sheetName) {

    const sheet =
      this.getSheet(sheetName);

    if (sheet.getLastRow() < 2) {

      return [];

    }

    const values =
      sheet.getDataRange().getValues();

    const headers =
      values.shift();

    return values

      .filter(function (row) {

        return String(row[0]).trim() !== "";

      })

      .map(function (row) {

        const obj = {};

        headers.forEach(function (header, index) {

          obj[String(header).trim()] = row[index];

        });

        return obj;

      });

  },


  /*******************************************************************
   * BUSCAR POR ID
   *******************************************************************/
  getById(sheetName, idField, id) {

    const registros =
      this.getAll(sheetName);

    return registros.find(function (r) {

      return String(r[idField]) === String(id);

    }) || null;

  },


  /*******************************************************************
   * FILTRAR
   *******************************************************************/
  find(sheetName, callback) {

    return this
      .getAll(sheetName)
      .filter(callback);

  },


  /*******************************************************************
   * INSERTAR
   *******************************************************************/
  insert(sheetName, objeto) {

    const sheet =
      this.getSheet(sheetName);

    const headers =
      this.getHeaders(sheetName);

    const fila = headers.map(function (h) {

      return objeto[h] !== undefined
        ? objeto[h]
        : "";

    });

    sheet.appendRow(fila);

    SpreadsheetApp.flush();

  },


  /*******************************************************************
   * ACTUALIZAR
   *******************************************************************/
  update(sheetName, idField, id, objeto) {

    const sheet =
      this.getSheet(sheetName);

    const headers =
      this.getHeaders(sheetName);

    const idColumn =
      headers.indexOf(idField);

    if (idColumn < 0) {

      throw new Error(
        "No existe la columna " + idField
      );

    }

    const values =
      sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {

      if (
        String(values[i][idColumn]) ===
        String(id)
      ) {

        headers.forEach(function (header, col) {

          if (objeto.hasOwnProperty(header)) {

            sheet
              .getRange(i + 1, col + 1)
              .setValue(objeto[header]);

          }

        });

        SpreadsheetApp.flush();

        return true;

      }

    }

    return false;

  },


  /*******************************************************************
   * ELIMINAR
   *******************************************************************/
  remove(sheetName, idField, id) {

    const sheet =
      this.getSheet(sheetName);

    const headers =
      this.getHeaders(sheetName);

    const idColumn =
      headers.indexOf(idField);

    if (idColumn < 0) {

      return false;

    }

    const values =
      sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {

      if (
        String(values[i][idColumn]) ===
        String(id)
      ) {

        sheet.deleteRow(i + 1);

        return true;

      }

    }

    return false;

  },


  /*******************************************************************
   * EXISTE
   *******************************************************************/
  exists(sheetName, idField, id) {

    return (
      this.getById(
        sheetName,
        idField,
        id
      ) !== null
    );

  },


  /*******************************************************************
   * CONTAR
   *******************************************************************/
  count(sheetName) {

    return this.getAll(sheetName).length;

  }

};