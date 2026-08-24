let allSacadores = [];
let kpisCache = {};
let listasCache = {};
let calendar = null;
let formadoresListCache = null;
let currentEditingEvent = null;

document.addEventListener("DOMContentLoaded", () => {
    cargarDatos();
    inicializarFiltros();
    
    setTimeout(() => {
        iniciarCalendarioSacadores();
        cargarFormadoresAgenda();
    }, 50);
});

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttr(text) {
    return String(text || "").replace(/'/g, "\\'");
}

function esVerdadero(val) {
    if (!val) return false;
    const s = String(val).toLowerCase().trim();
    return s === "sí" || s === "si" || s === "true" || s === "1" || s === "hecho" || s === "completado";
}

async function cargarDatos() {
    try {
        const res = await fetch("/api/formacion-sacadores");
        if (!res.ok) throw new Error("Error HTTP " + res.status);
        const resData = await res.json();
        
        allSacadores = resData.sacadores || [];
        kpisCache = resData.kpis || {};
        listasCache = resData.listas || {};
        
        calcularKPIs();
        
        // Cargar los alumnos en el checklist (con lista de excluidos vacía al inicio)
        const excludedIds = [];
        if (currentEditingEvent && currentEditingEvent.integrantes) {
            currentEditingEvent.integrantes.forEach(i => excludedIds.push(String(i.id_trabajador).trim()));
        }
        rellenarListaAlumnosCheckboxes(excludedIds);
        
        cargarDraggablesAgenda();
    } catch (err) {
        console.error("Error al cargar datos de sacadores:", err);
    }
}

function calcularKPIs() {
    const totalFormadas = document.getElementById("kpi-total-formadas");
    const totalSacadoH = document.getElementById("kpi-total-sacado-h");
    const totalOtros = document.getElementById("kpi-total-otros");
    
    if (totalFormadas) totalFormadas.textContent = kpisCache.total_formadas || 0;
    if (totalSacadoH) totalSacadoH.textContent = kpisCache.total_sacado_h || 0;
    if (totalOtros) totalOtros.textContent = kpisCache.total_otros_depts || 0;
}

function inicializarFiltros() {
    const filterInput = document.getElementById("input-buscar-candidatos");
    if (filterInput) {
        filterInput.addEventListener("input", () => {
            cargarDraggablesAgenda();
        });
    }
}

// ======================================================
// MODALES KPI CLICKABLE
// ======================================================
function abrirModalKpi(tipo) {
    const modal = document.getElementById(`modal-kpi-${tipo}`);
    const body = document.getElementById(`modal-kpi-${tipo}-body`);
    if (!modal || !body) return;
    
    const ids = listasCache[tipo] || [];
    const filtered = allSacadores.filter(s => ids.includes(s.id));
    
    if (filtered.length === 0) {
        body.innerHTML = '<p style="text-align: center; color: #7f8c8d; font-style: italic;">No hay colaboradores en esta categoría.</p>';
    } else {
        body.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em; text-align: left;">
                <thead>
                    <tr style="border-bottom: 2px solid #edf2f7; color: #4a5568; font-weight: bold;">
                        <th style="padding: 10px 5px;">ID</th>
                        <th style="padding: 10px 5px;">Nombre</th>
                        <th style="padding: 10px 5px;">Grupo</th>
                        <th style="padding: 10px 5px; text-align: center;">Rend.</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(s => `
                        <tr style="border-bottom: 1px solid #edf2f7; color: #2d3748;">
                            <td style="padding: 8px 5px; font-weight: bold; color: #718096;">${s.id}</td>
                            <td style="padding: 8px 5px; font-weight: bold;"><a href="/expediente/${s.id}" style="color: #173D2D; text-decoration: none;">${escapeHtml(s.nombre)}</a></td>
                            <td style="padding: 8px 5px;">${s.dept_grupo}</td>
                            <td style="padding: 8px 5px; text-align: center; font-weight: bold;">${s.rendimiento || "-"}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }
    modal.style.display = "flex";
}

function cerrarModalKpi(tipo) {
    const modal = document.getElementById(`modal-kpi-${tipo}`);
    if (modal) {
        modal.style.display = "none";
    }
}

// ======================================================
// CALENDARIO DE AGENDAMIENTO
// ======================================================
async function cargarFormadoresAgenda() {
    const select = document.getElementById("form-agenda-formador");
    if (!select) return;
    if (select.children.length > 1) return;
    
    try {
        if (!formadoresListCache) {
            const res = await fetch("/api/formadores");
            formadoresListCache = await res.json();
        }
        
        select.innerHTML = '<option value="">Selecciona un formador...</option>';
        formadoresListCache.forEach(f => {
            const opt = document.createElement("option");
            opt.value = f.nombre;
            opt.textContent = `${f.nombre} (${f.codigo})`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error("Error cargando formadores:", err);
    }
}

function rellenarListaAlumnosCheckboxes(alumnosExcluidosIds = []) {
    const container = document.getElementById("form-agenda-nuevos-lista");
    if (!container) return;
    
    const filterInput = document.getElementById("form-agenda-buscar-nuevos");
    const filterText = filterInput ? filterInput.value.toLowerCase().trim() : "";
    
    const sorted = [...allSacadores].sort((a, b) => a.nombre.localeCompare(b.nombre));
    container.innerHTML = "";
    
    let count = 0;
    sorted.forEach(s => {
        const sId = String(s.id).trim();
        // Excluir alumnos que ya están en el evento
        if (alumnosExcluidosIds.includes(sId)) {
            return;
        }
        
        // Filtrar por texto si hay búsqueda
        if (filterText && !s.nombre.toLowerCase().includes(filterText) && !sId.includes(filterText)) {
            return;
        }
        
        count++;
        
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.gap = "8px";
        label.style.padding = "4px 8px";
        label.style.borderRadius = "4px";
        label.style.cursor = "pointer";
        label.style.fontSize = "0.9em";
        label.style.userSelect = "none";
        label.onmouseenter = () => label.style.background = "#edf2f7";
        label.onmouseleave = () => label.style.background = "transparent";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = `${s.id}|${s.nombre}`;
        checkbox.className = "form-agenda-alumno-chk";
        checkbox.style.cursor = "pointer";
        
        const textSpan = document.createElement("span");
        textSpan.style.color = "#2d3748";
        textSpan.textContent = `${s.nombre} (${s.id})`;
        
        label.appendChild(checkbox);
        label.appendChild(textSpan);
        container.appendChild(label);
    });
    
    if (count === 0) {
        container.innerHTML = '<span style="color:#718096; font-style:italic; font-size:0.85em; text-align:center; padding:10px 0; width:100%;">No se encontraron colaboradores pendientes.</span>';
    }
}

function filtrarNuevosAlumnosModal() {
    const excludedIds = [];
    if (currentEditingEvent && currentEditingEvent.integrantes) {
        currentEditingEvent.integrantes.forEach(i => {
            excludedIds.push(String(i.id_trabajador).trim());
        });
    }
    rellenarListaAlumnosCheckboxes(excludedIds);
}

function handleCandidateDragStart(event, id, nombre) {
    event.dataTransfer.setData("text/plain", JSON.stringify({ id: id, nombre: nombre }));
}

function cargarDraggablesAgenda() {
    const container = document.getElementById("agenda-lista-candidatos");
    if (!container) return;
    
    const filterInput = document.getElementById("input-buscar-candidatos");
    const filterText = filterInput ? filterInput.value.toLowerCase().trim() : "";
    
    let pendientes = allSacadores.filter(s => {
        return !esVerdadero(s.aula_s0) || !esVerdadero(s.aula_s1) || !esVerdadero(s.aula_s2) || s.camara === "Pendiente";
    });
    
    if (filterText) {
        pendientes = pendientes.filter(s => {
            return String(s.nombre).toLowerCase().includes(filterText) || String(s.id).includes(filterText);
        });
    }
    
    if (pendientes.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #718096; font-style: italic; font-size: 0.85em; padding: 20px;">No hay personas pendientes.</p>';
        return;
    }
    
    container.innerHTML = pendientes.map(s => {
        let mod = "";
        if (!esVerdadero(s.aula_s0)) mod = "Aula S. 0";
        else if (!esVerdadero(s.aula_s1)) mod = "Aula S. 1";
        else if (!esVerdadero(s.aula_s2)) mod = "Aula S. 2";
        else mod = "Cámara";
        
        return `
            <div class="candidato-draggable-item" 
                 draggable="true" 
                 data-id="${s.id}" 
                 data-nombre="${escapeAttr(s.nombre)}"
                 data-modulo="${mod}"
                 ondragstart="handleCandidateDragStart(event, '${s.id}', '${escapeAttr(s.nombre)}')">
                <div style="flex-grow: 1; min-width: 0; padding-right: 5px;">
                    <strong style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #2d3748;">${escapeHtml(s.nombre)}</strong>
                    <span style="font-size: 0.8em; color: #718096;">Siguiente: ${mod}</span>
                </div>
                <span style="background: #ebf8ff; color: #2b6cb0; font-size: 0.75em; font-weight: bold; padding: 2px 6px; border-radius: 4px; flex-shrink: 0;">${s.id}</span>
            </div>
        `;
    }).join("");
}

window.currentTutorFilter = "todos";

window.cambiarFiltroTutor = function(tutor, btn) {
    window.currentTutorFilter = tutor;
    
    // Actualizar estilos de los botones de pestañas
    document.querySelectorAll(".tab-button").forEach(b => {
        b.style.background = "#fff";
        b.style.color = "#2d3748";
        b.style.border = "1px solid #edf2f7";
    });
    btn.style.background = "#173D2D";
    btn.style.color = "white";
    btn.style.border = "none";
    
    if (calendar) {
        calendar.refetchEvents();
    }
};

function iniciarCalendarioSacadores() {
    const calendarEl = document.getElementById('agenda-calendario');
    if (!calendarEl) return;
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listMonth'
        },
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            list: 'Agenda'
        },
        editable: true,
        events: async function(info, successCallback, failureCallback) {
            try {
                const res = await fetch("/api/agenda-formacion/eventos");
                const eventos = await res.json();
                
                // Aplicar filtrado por formador si no está en "todos"
                let filteredEventos = eventos;
                if (window.currentTutorFilter && window.currentTutorFilter !== "todos") {
                    filteredEventos = eventos.filter(e => {
                        const formadorClean = String(e.formador || "").toUpperCase().trim();
                        const filterClean = window.currentTutorFilter.toUpperCase().trim();
                        return formadorClean.includes(filterClean);
                    });
                }
                
                const mapped = filteredEventos.map(e => {
                    const parts = e.fecha.split("/");
                    const year = parts[2];
                    const month = String(parseInt(parts[1]) - 1);
                    const day = parts[0];
                    
                    const hourParts = (e.hora || "08:00").split(":");
                    const start = new Date(year, month, day, hourParts[0], hourParts[1]);
                    
                    const hourFinParts = (e.hora_fin || "09:00").split(":");
                    const end = new Date(year, month, day, hourFinParts[0], hourFinParts[1]);
                    
                    let title = "";
                    let class_name = "";
                    
                    if (e.es_incorporacion) {
                        const nombreNovato = e.integrantes && e.integrantes.length > 0 ? e.integrantes[0].nombre : "Nuevo";
                        const deptoNovato = e.aula || "Planta";
                        title = `[INC] ${nombreNovato} (${deptoNovato})`;
                        class_name = "event-agenda-incorporacion";
                    } else if (e.es_revision) {
                        const nombreNovato = e.integrantes && e.integrantes.length > 0 ? e.integrantes[0].nombre : "Empleado";
                        const tipoRev = e.aula || "Revisión";
                        title = `[REV] ${nombreNovato} (${tipoRev})`;
                        class_name = "event-agenda-revision";
                    } else {
                        class_name = e.estado === "Finalizada" ? "event-agenda-finalizada" : "event-agenda-pendiente";
                        const numIntegrantes = e.integrantes ? e.integrantes.length : 0;
                        if (numIntegrantes > 0) {
                            const nombres = e.integrantes.map(i => i.nombre.split(" ")[0]).join(", ");
                            title = `[${e.aula || 'Aula 1'}] ${e.tipo_formacion || 'Formación'} (${nombres})`;
                        } else {
                            title = `[${e.aula || 'Aula 1'}] ${e.tipo_formacion || 'Formación'} (Sin alumnos)`;
                        }
                    }
                    
                    return {
                        id: e.id,
                        title: title,
                        start: start,
                        end: end,
                        className: class_name,
                        extendedProps: {
                            fecha: e.fecha,
                            hora: e.hora,
                            hora_fin: e.hora_fin || "09:00",
                            tipo_formacion: e.tipo_formacion,
                            formador: e.formador,
                            aula: e.aula,
                            estado: e.estado,
                            integrantes: e.integrantes || [],
                            es_incorporacion: e.es_incorporacion || false,
                            es_revision: e.es_revision || false
                        }
                    };
                });
                successCallback(mapped);
            } catch (err) {
                console.error("Error al cargar eventos de agenda:", err);
                failureCallback(err);
            }
        },
        eventClick: function(info) {
            const evProps = info.event.extendedProps;
            if (evProps.es_incorporacion || evProps.es_revision) {
                const novatoId = evProps.integrantes && evProps.integrantes.length > 0 ? evProps.integrantes[0].id_trabajador : null;
                if (novatoId) {
                    window.open("/expediente/" + novatoId, "_blank");
                }
                return;
            }
            abrirModalAgendaEditar({
                original_key: info.event.id,
                fecha: evProps.fecha,
                hora: evProps.hora,
                hora_fin: evProps.hora_fin,
                tipo_formacion: evProps.tipo_formacion,
                formador: evProps.formador,
                aula: evProps.aula,
                estado: evProps.estado,
                integrantes: evProps.integrantes
            });
        },
        eventDrop: async function(info) {
            const original_key = info.event.id;
            const newStart = info.event.start;
            const newEnd = info.event.end;
            
            const day = String(newStart.getDate()).padStart(2, '0');
            const month = String(newStart.getMonth() + 1).padStart(2, '0');
            const year = newStart.getFullYear();
            const fecha = `${day}/${month}/${year}`;
            
            const hoursStart = String(newStart.getHours()).padStart(2, '0');
            const minutesStart = String(newStart.getMinutes()).padStart(2, '0');
            const hora = `${hoursStart}:${minutesStart}`;
            
            let hora_fin = "";
            if (newEnd) {
                const hoursEnd = String(newEnd.getHours()).padStart(2, '0');
                const minutesEnd = String(newEnd.getMinutes()).padStart(2, '0');
                hora_fin = `${hoursEnd}:${minutesEnd}`;
            } else {
                const h = (newStart.getHours() + 1) % 24;
                hora_fin = `${String(h).padStart(2, '0')}:${minutesStart}`;
            }
            
            try {
                let res = await fetch("/api/agenda-formacion/actualizar-grupo", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ original_key: original_key, campo: "fecha", valor: fecha })
                });
                
                const partes = original_key.split("_");
                const temp_key_1 = `${fecha}_${partes[1]}_${partes[2]}_${partes[3]}_${partes[4]}`;
                
                res = await fetch("/api/agenda-formacion/actualizar-grupo", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ original_key: temp_key_1, campo: "hora", valor: hora })
                });
                
                const temp_key_2 = `${fecha}_${hora}_${partes[2]}_${partes[3]}_${partes[4]}`;
                
                res = await fetch("/api/agenda-formacion/actualizar-grupo", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ original_key: temp_key_2, campo: "hora_fin", valor: hora_fin })
                });
                
                calendar.refetchEvents();
                await cargarDatos();
                cargarDraggablesAgenda();
            } catch (err) {
                console.error(err);
                info.revert();
            }
        },
        dateClick: function(info) {
            abrirModalAgendaCrear({
                fecha: info.dateStr,
                hora: "09:00",
                hora_fin: "10:00"
            });
        },
        eventDidMount: function(info) {
            const el = info.el;
            
            el.addEventListener('dragover', function(e) {
                e.preventDefault();
                el.style.transform = 'scale(1.05)';
                el.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
                el.style.transition = 'all 0.15s ease';
            });
            
            el.addEventListener('dragleave', function(e) {
                el.style.transform = '';
                el.style.boxShadow = '';
            });
            
            el.addEventListener('drop', async function(e) {
                e.preventDefault();
                el.style.transform = '';
                el.style.boxShadow = '';
                
                try {
                    const dataStr = e.dataTransfer.getData("text/plain");
                    if (!dataStr) return;
                    const worker = JSON.parse(dataStr);
                    
                    const evProps = info.event.extendedProps;
                    const workerId = worker.id;
                    const workerNombre = worker.nombre;
                    
                    if (confirm(`¿Deseas añadir a ${workerNombre} al evento "${info.event.title.split("(")[0].trim()}"?`)) {
                        const partes = info.event.id.split("_");
                        const fecha = partes[0];
                        const hora = partes[1];
                        const tipo_formacion = partes[2];
                        const formador = partes[3];
                        const aula = partes[4];
                        
                        const res = await fetch("/api/agenda-formacion/agregar-integrante", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                id_trabajador: workerId,
                                nombre: workerNombre,
                                fecha: fecha,
                                hora: hora,
                                hora_fin: evProps.hora_fin || "10:00",
                                tipo_formacion: tipo_formacion,
                                formador: formador,
                                aula: aula,
                                estado: evProps.estado
                            })
                        });
                        const data = await res.json();
                        if (data.ok) {
                            alert(`${workerNombre} añadido al evento formativo.`);
                            calendar.refetchEvents();
                            await cargarDatos();
                            cargarDraggablesAgenda();
                        } else {
                            alert("Error al añadir: " + data.error);
                        }
                    }
                } catch (err) {
                    console.error("Error al arrastrar sobre evento:", err);
                }
            });
        }
    });
    
    calendar.render();
}

function abrirModalAgendaCrear(datos) {
    currentEditingEvent = null;
    
    document.getElementById("modal-agenda-titulo").textContent = "Programar Evento Formativo";
    document.getElementById("form-agenda-id").value = "";
    
    document.getElementById("form-agenda-integrantes-seccion").style.display = "none";
    
    document.getElementById("form-agenda-fecha").value = datos.fecha;
    document.getElementById("form-agenda-hora").value = datos.hora;
    document.getElementById("form-agenda-hora-fin").value = datos.hora_fin || "10:00";
    document.getElementById("form-agenda-tipo").value = "";
    document.getElementById("form-agenda-aula").value = "";
    document.getElementById("form-agenda-estado").value = "Pendiente";
    document.getElementById("form-agenda-formador").selectedIndex = 0;
    
    document.getElementById("form-agenda-buscar-nuevos").value = "";
    rellenarListaAlumnosCheckboxes([]);
    
    document.getElementById("modal-agenda-evento").style.display = "flex";
}

function abrirModalAgendaEditar(datos) {
    currentEditingEvent = datos;
    
    document.getElementById("modal-agenda-titulo").textContent = "Editar Evento Formativo";
    document.getElementById("form-agenda-id").value = datos.original_key;
    
    document.getElementById("form-agenda-integrantes-seccion").style.display = "flex";
    
    const parts = datos.fecha.split("/");
    const dateIso = `${parts[2]}-${parts[1]}-${parts[0]}`;
    
    document.getElementById("form-agenda-fecha").value = dateIso;
    document.getElementById("form-agenda-hora").value = datos.hora;
    document.getElementById("form-agenda-hora-fin").value = datos.hora_fin || "10:00";
    document.getElementById("form-agenda-tipo").value = datos.tipo_formacion || "";
    document.getElementById("form-agenda-aula").value = datos.aula || "";
    document.getElementById("form-agenda-formador").value = datos.formador;
    document.getElementById("form-agenda-estado").value = datos.estado;
    
    renderizarListaIntegrantesModal(datos.integrantes);
    
    document.getElementById("form-agenda-buscar-nuevos").value = "";
    const excludedIds = (datos.integrantes || []).map(i => String(i.id_trabajador).trim());
    rellenarListaAlumnosCheckboxes(excludedIds);
    
    document.getElementById("modal-agenda-evento").style.display = "flex";
}

function renderizarListaIntegrantesModal(integrantes) {
    const listEl = document.getElementById("form-agenda-integrantes-lista");
    if (!listEl) return;
    listEl.innerHTML = "";
    
    if (!integrantes || integrantes.length === 0) {
        listEl.innerHTML = '<span style="color:#718096; font-style:italic; font-size:0.85em; text-align:center; padding:10px 0; width:100%;">No hay alumnos inscritos. Activa las casillas de abajo o arrastra alumnos de la izquierda para inscribirlos.</span>';
        return;
    }
    
    integrantes.forEach(i => {
        const item = document.createElement("div");
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        item.style.background = "white";
        item.style.padding = "4px 8px";
        item.style.borderRadius = "4px";
        item.style.border = "1px solid #cbd5e0";
        item.style.fontSize = "0.85em";
        item.style.marginTop = "2px";
        
        const spanText = document.createElement("span");
        spanText.style.fontWeight = "bold";
        spanText.style.color = "#2d3748";
        spanText.textContent = `${i.nombre} (${i.id_trabajador})`;
        
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.textContent = "✖";
        deleteBtn.style.background = "transparent";
        deleteBtn.style.border = "none";
        deleteBtn.style.color = "#e53e3e";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.style.fontWeight = "bold";
        deleteBtn.onclick = (e) => {
            e.preventDefault();
            eliminarAlumnoDeEvento(i.fila, i.nombre);
        };
        
        item.appendChild(spanText);
        item.appendChild(deleteBtn);
        listEl.appendChild(item);
    });
}

async function eliminarAlumnoDeEvento(fila_num, nombre) {
    if (!confirm(`¿Deseas desapuntar a ${nombre} de esta formación?`)) {
        return;
    }
    
    try {
        const res = await fetch("/api/agenda-formacion/eliminar-integrante", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fila_idx: fila_num })
        });
        const data = await res.json();
        if (data.ok) {
            alert(`${nombre} eliminado de la formación.`);
            await recargarEventoModalActualizado();
        } else {
            alert("Error al eliminar: " + data.error);
        }
    } catch (err) {
        alert("Error de red: " + err.message);
    }
}

async function recargarEventoModalActualizado() {
    try {
        const res = await fetch("/api/agenda-formacion/eventos");
        const eventos = await res.json();
        
        const original_key = document.getElementById("form-agenda-id").value;
        
        const matching = eventos.find(e => {
            const p = e.id.split("_");
            const o = original_key.split("_");
            return p[0] === o[0] && p[1] === o[1] && p[3] === o[3] && p[4] === o[4];
        });
        
        if (matching) {
            document.getElementById("form-agenda-id").value = matching.id;
            currentEditingEvent.integrantes = matching.integrantes || [];
            renderizarListaIntegrantesModal(currentEditingEvent.integrantes);
            
            // Recargar los alumnos checkbox excluyendo a los inscritos actualizados
            const excludedIds = (matching.integrantes || []).map(i => String(i.id_trabajador).trim());
            document.getElementById("form-agenda-buscar-nuevos").value = "";
            rellenarListaAlumnosCheckboxes(excludedIds);
        } else {
            cerrarModalAgenda();
        }
        
        if (calendar) calendar.refetchEvents();
        await cargarDatos();
        cargarDraggablesAgenda();
    } catch (err) {
        console.error("Error recargando modal:", err);
    }
}

function cerrarModalAgenda() {
    document.getElementById("modal-agenda-evento").style.display = "none";
}

async function guardarAgendaEvento(event) {
    event.preventDefault();
    
    const id = document.getElementById("form-agenda-id").value;
    const fechaVal = document.getElementById("form-agenda-fecha").value;
    const hora = document.getElementById("form-agenda-hora").value;
    const hora_fin = document.getElementById("form-agenda-hora-fin").value;
    const tipo = document.getElementById("form-agenda-tipo").value.trim();
    const aula = document.getElementById("form-agenda-aula").value.trim();
    const formador = document.getElementById("form-agenda-formador").value;
    const estado = document.getElementById("form-agenda-estado").value;
    
    const parts = fechaVal.split("-");
    const fechaDmy = `${parts[2]}/${parts[1]}/${parts[0]}`;
    
    // Obtener todos los alumnos seleccionados en los checkboxes
    const checkedElements = document.querySelectorAll(".form-agenda-alumno-chk:checked");
    const checkedValues = Array.from(checkedElements).map(el => el.value);
    
    if (id) {
        try {
            // 1. Registrar alumnos seleccionados en paralelo primero
            if (checkedValues.length > 0) {
                const promesas = checkedValues.map(val => {
                    const [wId, wName] = val.split("|");
                    return fetch("/api/agenda-formacion/agregar-integrante", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            id_trabajador: wId,
                            nombre: wName,
                            fecha: fechaDmy,
                            hora: hora,
                            hora_fin: hora_fin,
                            tipo_formacion: tipo,
                            formador: formador,
                            aula: aula,
                            estado: estado
                        })
                    });
                });
                await Promise.all(promesas);
            }
            
            // 2. Actualizar campos del grupo
            let current_key = id;
            const campos = [
                { campo: "fecha", valor: fechaDmy },
                { campo: "hora", valor: hora },
                { campo: "hora_fin", valor: hora_fin },
                { campo: "tipo_formacion", valor: tipo },
                { campo: "aula", valor: aula },
                { campo: "formador", valor: formador },
                { campo: "estado", valor: estado }
            ];
            
            for (let item of campos) {
                const res = await fetch("/api/agenda-formacion/actualizar-grupo", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ original_key: current_key, campo: item.campo, valor: item.value || item.valor })
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error || "Error al actualizar");
                
                const cPartes = current_key.split("_");
                if (item.campo === "fecha") cPartes[0] = item.valor;
                else if (item.campo === "hora") cPartes[1] = item.valor;
                else if (item.campo === "tipo_formacion") cPartes[2] = item.valor;
                else if (item.campo === "formador") cPartes[3] = item.valor;
                else if (item.campo === "aula") cPartes[4] = item.valor;
                current_key = cPartes.join("_");
            }
            
            alert("Evento formativo grupal actualizado.");
            cerrarModalAgenda();
            if (calendar) calendar.refetchEvents();
            await cargarDatos();
            cargarDraggablesAgenda();
        } catch (err) {
            alert("Error al actualizar evento grupal: " + err.message);
        }
    } else {
        try {
            let res = null;
            if (checkedValues.length > 0) {
                // Crear el evento inicial con el primer alumno de la lista
                const [firstId, firstName] = checkedValues[0].split("|");
                res = await fetch("/api/agenda-formacion/agregar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        nombre: firstName,
                        id_trabajador: firstId,
                        fecha: fechaDmy,
                        hora: hora,
                        hora_fin: hora_fin,
                        tipo_formacion: tipo,
                        formador: formador,
                        estado: estado,
                        aula: aula
                    })
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
                
                // Agregar el resto de los alumnos seleccionados en paralelo
                if (checkedValues.length > 1) {
                    const promesas = checkedValues.slice(1).map(val => {
                        const [wId, wName] = val.split("|");
                        return fetch("/api/agenda-formacion/agregar-integrante", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                id_trabajador: wId,
                                nombre: wName,
                                fecha: fechaDmy,
                                hora: hora,
                                hora_fin: hora_fin,
                                tipo_formacion: tipo,
                                formador: formador,
                                aula: aula,
                                estado: estado
                            })
                        });
                    });
                    await Promise.all(promesas);
                }
            } else {
                // Crear evento grupal vacío por defecto
                res = await fetch("/api/agenda-formacion/agregar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        nombre: "SESION_GRUPAL",
                        id_trabajador: "0",
                        fecha: fechaDmy,
                        hora: hora,
                        hora_fin: hora_fin,
                        tipo_formacion: tipo,
                        formador: formador,
                        estado: estado,
                        aula: aula
                    })
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
            }
            
            alert("Evento programado correctamente.");
            cerrarModalAgenda();
            if (calendar) calendar.refetchEvents();
            await cargarDatos();
            cargarDraggablesAgenda();
        } catch (err) {
            alert("Error de conexión: " + err.message);
        }
    }
}
