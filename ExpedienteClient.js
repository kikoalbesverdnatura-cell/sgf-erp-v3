/*********************************************************************
 * SGF ERP v3
 * Expediente.js
 * PARTE 1
 *********************************************************************/

let expediente = null;

document.addEventListener("DOMContentLoaded", iniciarExpediente);

/*********************************************************************
 * INICIO
 *********************************************************************/

function iniciarExpediente() {

    const id = obtenerParametro("id");

    if (!id) {
        mostrarError("No se ha recibido el trabajador.");
        return;
    }

    cargarExpediente(id);

}


/*********************************************************************
 * CARGA
 *********************************************************************/

function cargarExpediente(id) {

    mostrarCargando();

    google.script.run

        .withSuccessHandler(function (data) {

            expediente = data;

            pintarExpediente();

        })

        .withFailureHandler(function (e) {

            mostrarError(e.message);

        })

        .getExpediente(id);

}


/*********************************************************************
 * REFRESCAR
 *********************************************************************/

function refrescarExpediente() {

    if (!expediente) return;

    cargarExpediente(expediente.persona.id);

}


/*********************************************************************
 * RENDER GENERAL
 *********************************************************************/

function pintarExpediente() {

    pintarCabecera();

    pintarChecklist();

    pintarKPIs();

    pintarProductividad();

    pintarErrores();

    pintarObservaciones();

    pintarEvaluaciones();

    pintarDocumentos();

    pintarTimeline();

}


/*********************************************************************
 * CABECERA
 *********************************************************************/

function pintarCabecera() {

    const p = expediente.persona;

    setText("expNombre", p.nombre);

    setText("expId", p.id);

    setText("expPrograma", p.programa);

    setText("expDepartamento", p.departamento);

    setText("expTutor", p.tutor || "Sin tutor");

    setText("expFecha", formatearFecha(p.fechaIncorporacion));

    setText("expHora", p.horaEntrada);

    setText("expEstado", p.estado);

    setText("expDias", p.diasSeguimiento);

    setText("expRiesgo", p.riesgo);

    setText("expPreparacion",

        expediente.checklist.porcentaje + "%"

    );

    setText(

        "expChecks",

        expediente.checklist.completados +

        "/" +

        expediente.checklist.total

    );

    document.getElementById("expAvatar").innerHTML =

        obtenerIniciales(p.nombre);

    actualizarBarra();

}


/*********************************************************************
 * BARRA DE PROGRESO
 *********************************************************************/

function actualizarBarra() {

    const porcentaje =

        expediente.checklist.porcentaje;

    document

        .getElementById("expProgressFill")

        .style.width = porcentaje + "%";

    document

        .getElementById("sideProgressFill")

        .style.width = porcentaje + "%";

}


/*********************************************************************
 * CHECKLIST
 *********************************************************************/

function pintarChecklist() {

    const contenedor =

        document.getElementById("expChecklist");

    let html = "";

    expediente.checklist.items.forEach(function (item) {

        html += `

<div class="checkCard ${item.completado ? "ok" : ""}">

<label>

<input

type="checkbox"

${item.completado ? "checked" : ""}

onchange="actualizarCheck('${item.key}',this.checked)"

>

<span>

${item.titulo}

</span>

</label>

</div>

`;

    });

    contenedor.innerHTML = html;

}


/*********************************************************************
 * ACTUALIZAR CHECK
 *********************************************************************/

function actualizarCheck(key, valor) {

    google.script.run

        .withSuccessHandler(function (data) {

            expediente = data;

            pintarCabecera();

            pintarChecklist();

        })

        .withFailureHandler(function (e) {

            mostrarError(e.message);

        })

        .updateExpedienteCheck(

            expediente.persona.id,

            key,

            valor

        );

}


/*********************************************************************
 * CAMBIAR ESTADO
 *********************************************************************/

function cambiarEstado() {

    const estado =

        document.getElementById("estadoSelect").value;

    google.script.run

        .withSuccessHandler(function (data) {

            expediente = data;

            pintarCabecera();

        })

        .updateExpedienteEstado(

            expediente.persona.id,

            estado

        );

}


/*********************************************************************
 * CAMBIAR FASE
 *********************************************************************/

function cambiarFase() {

    const fase =

        document.getElementById("faseSelect").value;

    google.script.run

        .withSuccessHandler(function (data) {

            expediente = data;

            pintarCabecera();

        })

        .updateExpedienteFase(

            expediente.persona.id,

            fase

        );

}


/*********************************************************************
 * KPIs
 * (se implementa en PARTE 2)
 *********************************************************************/

function pintarKPIs() {

}


/*********************************************************************
 * PRODUCTIVIDAD
 * (PARTE 2)
 *********************************************************************/

function pintarProductividad() {

}


/*********************************************************************
 * ERRORES
 * (PARTE 3)
 *********************************************************************/

function pintarErrores() {

}


/*********************************************************************
 * OBSERVACIONES
 * (PARTE 3)
 *********************************************************************/

function pintarObservaciones() {

}


/*********************************************************************
 * EVALUACIONES
 * (PARTE 3)
 *********************************************************************/

function pintarEvaluaciones() {

}


/*********************************************************************
 * DOCUMENTOS
 * (PARTE 3)
 *********************************************************************/

function pintarDocumentos() {

}


/*********************************************************************
 * TIMELINE
 * (PARTE 4)
 *********************************************************************/

function pintarTimeline() {

}/*********************************************************************
 * KPIs
 *********************************************************************/

function pintarKPIs() {

    const k = expediente.kpis;

    setText(
        "kpiProductividad",
        (k.productividadMedia || 0) + "%"
    );

    setText(
        "kpiLineasHora",
        (k.lineasHoraMedia || 0) + " l/h"
    );

    setText(
        "kpiError",
        (k.errorMedio || 0) + "%"
    );

    setText(
        "kpiEvaluacion",
        k.mediaEvaluaciones || "--"
    );

}


/*********************************************************************
 * PRODUCTIVIDAD
 *********************************************************************/

function pintarProductividad() {

    const datos =
        expediente.grafana.productividadTabla || [];

    cargarFiltroProductividad(datos);

    pintarGraficoLineasHora(datos);

    pintarTablaProductividad(datos);

}


/*********************************************************************
 * FILTRO PRODUCTIVIDAD
 *********************************************************************/

function cargarFiltroProductividad(datos){

    const select =
        document.getElementById("filtroProd");

    if(!select) return;

    const fechas = [];

    datos.forEach(function(item){

        if(
            item.fecha &&
            fechas.indexOf(item.fecha)==-1
        ){

            fechas.push(item.fecha);

        }

    });

    let html =
        '<option value="">Todas las fechas</option>';

    fechas.forEach(function(fecha){

        html +=

        '<option value="'+fecha+'">'+
        formatearFecha(fecha)+
        '</option>';

    });

    select.innerHTML = html;

}


/*********************************************************************
 * FILTRAR PRODUCTIVIDAD
 *********************************************************************/

function filtrarProductividad(){

    const fecha =

        document
        .getElementById("filtroProd")
        .value;

    let datos =

        expediente
        .grafana
        .productividadTabla;

    if(fecha){

        datos =

            datos.filter(function(item){

                return item.fecha==fecha;

            });

    }

    pintarGraficoLineasHora(datos);

    pintarTablaProductividad(datos);

}


/*********************************************************************
 * TABLA PRODUCTIVIDAD
 *********************************************************************/

function pintarTablaProductividad(datos){

    const tbody =

        document
        .getElementById("tablaProductividad");

    let html="";

    datos.forEach(function(item){

        html+=`

<tr>

<td>${formatearFecha(item.fecha)}</td>

<td>${numero(item.totalLineas)}</td>

<td>${numero(item.lineasEsperadas)}</td>

<td>${item.porcentajeTexto}</td>

<td>${numero(item.tiempoTotal)}</td>

<td>

<strong>

${numero(item.lineasHora)}

</strong>

</td>

<td>${numero(item.volumen)}</td>

</tr>

`;

    });

    tbody.innerHTML=html;

}


/*********************************************************************
 * GRAFICO SVG
 *********************************************************************/

function pintarGraficoLineasHora(datos){

    const contenedor =

        document
        .getElementById("chartLineasHora");

    if(!contenedor) return;

    if(!datos.length){

        contenedor.innerHTML=

        "<p>Sin datos.</p>";

        return;

    }

    const width = 760;

    const height = 240;

    const margen = 40;

    const objetivo = 80;

    let max = objetivo;

    datos.forEach(function(item){

        if(item.lineasHora>max){

            max=item.lineasHora;

        }

    });

    const paso =

        (width-(margen*2))

        /

        Math.max(

            datos.length-1,

            1

        );

    let puntos="";

    let circulos="";

    datos.forEach(function(item,index){

        const x=

            margen+

            (index*paso);

        const y=

            height-

            margen-

            (

                (item.lineasHora/max)

                *

                (height-(margen*2))

            );

        puntos+=

            x+","+y+" ";

        circulos+=`

<circle

cx="${x}"

cy="${y}"

r="4"

class="chartDot">

<title>

${formatearFecha(item.fecha)}

${item.lineasHora} l/h

</title>

</circle>

`;

    });

    const objetivoY=

        height-

        margen-

        (

            (objetivo/max)

            *

            (height-(margen*2))

        );

    contenedor.innerHTML=

`

<svg

viewBox="0 0 ${width} ${height}"

class="svgChart">

<line

x1="${margen}"

y1="${objetivoY}"

x2="${width-margen}"

y2="${objetivoY}"

class="chartTarget"

/>

<polyline

points="${puntos}"

class="chartLine"

/>

${circulos}

<text

x="${margen}"

y="22"

class="chartLabel">

Objetivo 80 líneas/hora

</text>

</svg>

`;

}


/*********************************************************************
 * GRAFICO PRODUCTIVIDAD
 *********************************************************************/

function pintarGraficoProductividad(){

    // Preparado para la versión 2

}/*********************************************************************
 * ERRORES
 *********************************************************************/

function pintarErrores() {

    const datos =
        expediente.grafana.erroresTabla || [];

    cargarFiltroErrores(datos);

    pintarGraficoErrores(datos);

    pintarTablaErrores(datos);

}


/*********************************************************************
 * FILTRO ERRORES
 *********************************************************************/

function cargarFiltroErrores(datos){

    const select =
        document.getElementById("filtroErrores");

    if(!select) return;

    let fechas=[];

    datos.forEach(function(item){

        if(
            item.fecha &&
            fechas.indexOf(item.fecha)==-1
        ){

            fechas.push(item.fecha);

        }

    });

    let html=
        '<option value="">Todas las fechas</option>';

    fechas.forEach(function(fecha){

        html+=

        '<option value="'+fecha+'">'+
        formatearFecha(fecha)+
        '</option>';

    });

    select.innerHTML=html;

}


/*********************************************************************
 * FILTRAR ERRORES
 *********************************************************************/

function filtrarErrores(){

    const fecha=

        document
        .getElementById("filtroErrores")
        .value;

    let datos=

        expediente
        .grafana
        .erroresTabla;

    if(fecha){

        datos=

            datos.filter(function(item){

                return item.fecha==fecha;

            });

    }

    pintarGraficoErrores(datos);

    pintarTablaErrores(datos);

}


/*********************************************************************
 * TABLA ERRORES
 *********************************************************************/

function pintarTablaErrores(datos){

    const tbody=

        document
        .getElementById("tablaErrores");

    let html="";

    datos.forEach(function(item){

html+=`

<tr>

<td>${formatearFecha(item.fecha)}</td>

<td>${numero(item.nivelIncorrecto)}</td>

<td>${numero(item.cantidadIncorrecta)}</td>

<td>${numero(item.seHaSaltado)}</td>

<td>${numero(item.productoEquivocado)}</td>

<td>${numero(item.desordenado)}</td>

<td>${numero(item.malEtiquetado)}</td>

<td>${numero(item.maltratado)}</td>

<td>${numero(item.noHaceCambio)}</td>

<td>

<strong>

${numero(item.totalErrores)}

</strong>

</td>

<td>${item.errorPctTexto}</td>

</tr>

`;

    });

    tbody.innerHTML=html;

}


/*********************************************************************
 * GRAFICO ERRORES
 *********************************************************************/

function pintarGraficoErrores(datos){

    const div=

        document
        .getElementById("chartErrores");

    if(!datos.length){

        div.innerHTML="<p>Sin datos.</p>";

        return;

    }

    const width=760;
    const height=240;
    const margen=40;

    let max=0.03;

    datos.forEach(function(item){

        if(item.errorPctTotal>max){

            max=item.errorPctTotal;

        }

    });

    const paso=

        (width-(margen*2))

        /

        Math.max(

            datos.length-1,

            1

        );

    let puntos="";
    let circles="";

    datos.forEach(function(item,index){

        const x=

            margen+

            (index*paso);

        const y=

            height-

            margen-

            (

                (item.errorPctTotal/max)

                *

                (height-(margen*2))

            );

        puntos+=

            x+","+y+" ";

        circles+=`

<circle

cx="${x}"

cy="${y}"

r="4"

class="chartDotError">

<title>

${formatearFecha(item.fecha)}

${item.errorPctTexto}

</title>

</circle>

`;

    });

    const objetivoY=

        height-

        margen-

        (

            (0.03/max)

            *

            (height-(margen*2))

        );

div.innerHTML=

`

<svg

viewBox="0 0 ${width} ${height}"

class="svgChart">

<line

x1="${margen}"

y1="${objetivoY}"

x2="${width-margen}"

y2="${objetivoY}"

class="chartTarget"

/>

<polyline

points="${puntos}"

class="chartLineError"

/>

${circles}

<text

x="${margen}"

y="20"

class="chartLabel">

Objetivo Error <3%

</text>

</svg>

`;

}


/*********************************************************************
 * OBSERVACIONES
 *********************************************************************/

function pintarObservaciones(){

    const div=

        document
        .getElementById("expObservaciones");

    let html="";

    expediente.observaciones.forEach(function(item){

html+=`

<div class="obsCard">

<strong>

${item.autor||item.TUTOR||"Tutor"}

</strong>

<small>

${formatearFecha(item.fecha||item.FECHA)}

</small>

<p>

${item.texto||

item.OBSERVACION||

item.COMENTARIO||

""}

</p>

</div>

`;

    });

    div.innerHTML=

        html ||

        "<p>Sin observaciones.</p>";

}


/*********************************************************************
 * EVALUACIONES
 *********************************************************************/

function pintarEvaluaciones(){

    const tbody=

        document
        .getElementById("tablaEvaluaciones");

    let html="";

    expediente.evaluaciones.forEach(function(item){

html+=`

<tr>

<td>

${formatearFecha(item.fecha)}

</td>

<td>

${item.tutor||""}

</td>

<td>

<strong>

${item.resultado||""}

</strong>

</td>

<td>

${item.comentarios||""}

</td>

</tr>

`;

    });

    tbody.innerHTML=

        html ||

        '<tr><td colspan="4">Sin evaluaciones</td></tr>';

}


/*********************************************************************
 * DOCUMENTOS
 *********************************************************************/

function pintarDocumentos(){

    const div=

        document
        .getElementById("expDocumentos");

    let html="";

    expediente.documentos.forEach(function(item){

html+=`

<div class="documentCard">

<div>

<strong>

${item.titulo}

</strong>

<br>

<small>

${item.fecha||""}

</small>

</div>

<div>

${

item.completado

?

'✅'

:

'⏳'

}

</div>

</div>

`;

    });

    div.innerHTML=

        html ||

        "<p>Sin documentos.</p>";

}/*********************************************************************
 * TIMELINE
 *********************************************************************/

function pintarTimeline() {

    const div =
        document.getElementById("expTimeline");

    if (!div) return;

    const datos = expediente.timeline || [];

    if (!datos.length) {

        div.innerHTML =
            "<p class='empty'>Sin actividad.</p>";

        return;

    }

    let html = "";

    datos.forEach(function (item) {

        html += `

<div class="timelineItem">

    <div class="timelineDot"></div>

    <div class="timelineContent">

        <strong>

            ${item.titulo || item.tipo || "Evento"}

        </strong>

        <small>

            ${formatearFecha(item.fecha)}

        </small>

        <p>

            ${item.descripcion || ""}

        </p>

    </div>

</div>

`;

    });

    div.innerHTML = html;

}


/*********************************************************************
 * REFRESCAR PANTALLA
 *********************************************************************/

function refrescarPantalla(){

    pintarCabecera();

    pintarChecklist();

    pintarKPIs();

    pintarProductividad();

    pintarErrores();

    pintarObservaciones();

    pintarEvaluaciones();

    pintarDocumentos();

    pintarTimeline();

}


/*********************************************************************
 * DESCARGAR INFORME
 *********************************************************************/

function descargarInforme(){

    google.script.run

        .withSuccessHandler(function(url){

            if(url){

                window.open(url,"_blank");

            }

        })

        .generarInformeExpediente(

            expediente.persona.id

        );

}


/*********************************************************************
 * EDITAR DATOS
 *********************************************************************/

function editarDatos(){

    alert(

        "Pendiente de implementar"

    );

}


/*********************************************************************
 * VOLVER
 *********************************************************************/

function volverPersonas(){

    google.script.host.close();

}


/*********************************************************************
 * LOADING
 *********************************************************************/

function mostrarCargando(){

    document.body.classList.add(

        "loading"

    );

}


function ocultarCargando(){

    document.body.classList.remove(

        "loading"

    );

}


/*********************************************************************
 * ERROR
 *********************************************************************/

function mostrarError(mensaje){

    ocultarCargando();

    alert(mensaje);

}


/*********************************************************************
 * UTILIDADES HTML
 *********************************************************************/

function setText(id,valor){

    const el=

        document.getElementById(id);

    if(!el) return;

    el.textContent=

        valor ?? "";

}


function setHTML(id,html){

    const el=

        document.getElementById(id);

    if(!el) return;

    el.innerHTML=html;

}


function numero(valor){

    if(

        valor===null ||

        valor===undefined ||

        valor===""

    ){

        return "0";

    }

    return Number(valor)

        .toLocaleString(

            "es-ES",

            {

                maximumFractionDigits:2

            }

        );

}


function porcentaje(valor){

    return

        numero(

            valor

        )+"%";

}


function formatearFecha(fecha){

    if(!fecha) return "";

    try{

        return new Date(fecha)

            .toLocaleDateString(

                "es-ES"

            );

    }

    catch(e){

        return fecha;

    }

}


function obtenerIniciales(nombre){

    if(!nombre) return "--";

    return nombre

        .split(" ")

        .filter(Boolean)

        .map(function(p){

            return p.charAt(0);

        })

        .join("")

        .substring(0,2)

        .toUpperCase();

}


/*********************************************************************
 * URL PARAMS
 *********************************************************************/

function obtenerParametro(nombre){

    const params=

        new URLSearchParams(

            window.location.search

        );

    return params.get(nombre);

}


/*********************************************************************
 * EXPORTAR TABLAS
 *********************************************************************/

function exportarCSV(tablaId,nombre){

    const tabla=

        document.getElementById(tablaId);

    if(!tabla) return;

    let csv=[];

    tabla

        .querySelectorAll("tr")

        .forEach(function(row){

            let fila=[];

            row

                .querySelectorAll("th,td")

                .forEach(function(col){

                    fila.push(

                        '"'+

                        col.innerText+

                        '"'

                    );

                });

            csv.push(

                fila.join(";")

            );

        });

    const blob=

        new Blob(

            [

                csv.join("\n")

            ],

            {

                type:

                "text/csv"

            }

        );

    const enlace=

        document.createElement("a");

    enlace.href=

        URL.createObjectURL(blob);

    enlace.download=

        nombre+".csv";

    enlace.click();

}


/*********************************************************************
 * BUSCAR EN TABLAS
 *********************************************************************/

function filtrarTabla(tablaId,texto){

    texto=

        texto.toLowerCase();

    document

        .querySelectorAll(

            "#"+tablaId+" tbody tr"

        )

        .forEach(function(row){

            row.style.display=

                row.innerText

                .toLowerCase()

                .includes(texto)

                ?

                ""

                :

                "none";

        });

}


/*********************************************************************
 * AUTO REFRESH
 *********************************************************************/

setInterval(function(){

    if(expediente){

        refrescarExpediente();

    }

},300000);


/*********************************************************************
 * FIN Expediente.js
 *********************************************************************/