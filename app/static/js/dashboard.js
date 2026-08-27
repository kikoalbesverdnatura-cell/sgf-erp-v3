// ======================================================
// SGF ENTERPRISE · DASHBOARD V2
// ======================================================

let dashboardData = null;
let filtroIncorporacionesActivo = "hoy";
let chartNotasSacadoresInstance = null;
let alertasSeguimiento = [];

window.tutoresDisponibles = [];

async function loadTutoresDisponibles() {
    try {
        const res = await fetch("/api/usuarios");
        if (res.ok) {
            const list = await res.json();
            window.tutoresDisponibles = list.filter(u => u.activo === "Sí" || u.activo === "SÍ");
        }
    } catch (e) {
        console.error("Error cargando tutores:", e);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    setToday();
    await loadTutoresDisponibles();
    loadDashboard();
});

async function loadDashboard(refresh = false) {
    showLoadingDashboard();

    try {
        const url = refresh ? "/api/dashboard?refresh=true" : "/api/dashboard";
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Error HTTP " + response.status);
        }

        dashboardData = await response.json();

        renderDashboard(dashboardData);
        setToday();

    } catch (error) {
        console.error(error);
        alert("Error cargando Dashboard");
    }
}

function renderDashboard(data) {
    if (!data) return;

    renderKPIs(data.kpis || {});
    renderRetrasos(data.retrasos || []);
    renderIncorporaciones(data.incorporaciones || {});
    renderProximasEntradas(data.proximasEntradas || []);
    renderObservaciones(data.timeline || []);
    renderDepartamentos(data.departamentos || {});
    renderPendientesFormacion(data.personasPendientesFormacion || []);
    renderPersonasRevision21(data.personasRevision21 || []);
    renderProductividad(data.productividad || {});
    renderErrores(data.productividad || {});
    renderPersonasRiesgo(data.personasRiesgo || []);
    renderSeguimientoIndividual(data.personasSeguimiento || []);
    renderFormadores(data.formadores || []);
    renderAcciones(data.alertas || []);
    renderTimeline(data.timeline || []);

    // Nuevas integraciones del Dashboard Pro:
    alertasSeguimiento = data.alertasSeguimiento || [];
    renderFunnel(data.personasSeguimiento || []);
    calcularAlertasSheets(data.personasSeguimiento || []);
    renderMonitor(data.personasSeguimiento || []);
    loadOvertimeAlerts();
    loadTrainingStats();
    renderNotasSacadoresChart();
}


// ======================================================
// FECHA
// ======================================================

function setToday() {
    const hoy = new Date();

    setText("todayDate", hoy.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    }));

    setText("lastUpdate", hoy.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit"
    }));
}


// ======================================================
// KPIS
// ======================================================

function renderKPIs(kpis) {
    setText("kpiSeguimiento", kpis.enSeguimiento || 0);
    setText("kpiNuevas", kpis.nuevas || 0);
    setText("kpiMili", kpis.mili || 0);
    setText("kpiFormadores", kpis.formadores || 0);
    setText("kpiRiesgo", kpis.riesgoAlto || 0);
    setText("kpiNoAptos", kpis.noAptos || 0);
    setText("kpiWhatsappAdd", `+${kpis.whatsappPendiente || 0}`);
    setText("kpiWhatsappRemove", `-${kpis.whatsappQuitar || 0}`);
    setText("kpiSemaforoRojo", kpis.semaforoRojo || 0);
    setText("kpiSemaforoAmarillo", kpis.semaforoAmarillo || 0);
    setText("kpiSemaforoVerde", kpis.semaforoVerde || 0);
    setText("kpiContratoLimitado", kpis.contratoLimitado || 0);

    const entregadas = kpis.pdaEntregadas ?? 0;
    const total = kpis.enSeguimiento ?? 0;

    setText("kpiPDA", `${entregadas}/${total}`);
}


// ======================================================
// INCORPORACIONES
// ======================================================

function renderIncorporaciones(incorporaciones) {
    const panel = byId("panelHoy");
    if (!panel) return;

    const total = incorporaciones.total || 0;
    const personas = incorporaciones[filtroIncorporacionesActivo] || [];

    const hoyCount = (incorporaciones.hoy || []).length;
    const mananaCount = (incorporaciones.manana || []).length;
    const semanaCount = (incorporaciones.semana || []).length;
    const mesCount = (incorporaciones.mes || []).length;

    panel.innerHTML = `
        <div class="dashboardSectionHeader">
            <div>
                <strong>Incorporaciones</strong>
                <span>${total} registradas</span>
            </div>

            <div class="filterTabs">
                ${botonFiltro("hoy", `Hoy (${hoyCount})`)}
                ${botonFiltro("manana", `Mañana (${mananaCount})`)}
                ${botonFiltro("semana", `Semana (${semanaCount})`)}
                ${botonFiltro("mes", `Mes (${mesCount})`)}
            </div>
        </div>

        <div class="compactList">
            ${renderListaPersonasChecklist(personas)}
        </div>
    `;

    activarFiltros();
}

function botonFiltro(valor, texto) {
    const active = filtroIncorporacionesActivo === valor ? "active" : "";
    return `<button class="filterTab ${active}" data-filtro="${valor}">${texto}</button>`;
}

function activarFiltros() {
    document.querySelectorAll(".filterTab").forEach(btn => {
        btn.addEventListener("click", function () {
            filtroIncorporacionesActivo = this.dataset.filtro;
            renderIncorporaciones(dashboardData.incorporaciones || {});
        });
    });
}

function renderListaPersonasChecklist(personas) {
    if (!personas || !personas.length) {
        return `<p class="empty">No hay incorporaciones para este filtro.</p>`;
    }

    return personas.map(p => renderPersonaChecklistCard(p)).join("");
}

function renderPersonaChecklistCard(persona) {
    const checklist = persona.checklist || {};
    const completado = checklist.completado || 0;
    const total = checklist.total || 4;
    const porcentaje = checklist.porcentaje || 0;
    const estado = calcularEstadoChecklist(checklist);

    const isChecked = (val) => val === "SÍ" || val === "SI" || val === "X" || val === "TRUE" || val === true;

    return `
        <div class="incorporacionCard" id="card-${persona.id}" onclick="abrirExpediente('${escapeAttr(persona.id)}')">

            <div class="incorporacionTop">
                <div>
                    <strong>${escapeHtml(persona.nombre || "Sin nombre")}</strong>
                    <span>
                        ${escapeHtml(persona.departamento || "-")}
                        ${persona.hora ? " · " + escapeHtml(persona.hora) : ""}
                    </span>
                </div>

                <em>${escapeHtml(persona.programa || "")}</em>
            </div>

            <div class="progressLine" style="margin-top: 4px; height: 4px;">
                <div class="progressFill" style="width:${porcentaje}%"></div>
            </div>

            <!-- Selector de Tutor -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px; font-size: 0.76em;" onclick="event.stopPropagation();">
                <span style="color: #718096; font-weight: 700;">Tutor:</span>
                <select class="tutor-select" onchange="asignarTutorDashboard('${escapeAttr(persona.id)}', this.value)" style="padding: 1px 4px; border-radius: 4px; border: 1px solid #cbd5e0; font-size: 0.95em; color: #2d3748; background: #fff; cursor: pointer; max-width: 160px; font-weight: 500;">
                    ${(() => {
                        let tutorOptions = `<option value="" ${!persona.tutor ? 'selected' : ''}>-- Sin Tutor --</option>`;
                        if (window.tutoresDisponibles && window.tutoresDisponibles.length > 0) {
                            window.tutoresDisponibles.forEach(t => {
                                const isSelected = persona.tutor && (
                                    persona.tutor.toUpperCase().trim() === t.nombre.toUpperCase().trim() || 
                                    (t.nombre.includes("FRANCISCO ALBERT") && (persona.tutor.includes("FRANCISCO ALBERT") || persona.tutor.includes("Kiko"))) ||
                                    (t.nombre.includes("VICENTE LLOPIS") && (persona.tutor.includes("VICENTE LLOPIS") || persona.tutor.includes("Vicente"))) ||
                                    (t.nombre.includes("EUGENIO COLOMER") && (persona.tutor.includes("EUGENIO COLOMER") || persona.tutor.includes("Eugenio")))
                                );
                                let label = t.nombre;
                                if (t.nombre.toUpperCase().includes("FRANCISCO ALBERT")) label = "Kiko";
                                else if (t.nombre.toUpperCase().includes("VICENTE LLOPIS")) label = "Vicente";
                                else if (t.nombre.toUpperCase().includes("EUGENIO COLOMER")) label = "Eugenio";
                                else {
                                    label = t.nombre.split(" ")[0]; // Primer nombre
                                }
                                tutorOptions += `<option value="${escapeAttr(t.nombre)}" ${isSelected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                            });
                        } else {
                            tutorOptions += `
                                <option value="FRANCISCO ALBERT ESCUDERO" ${persona.tutor && (persona.tutor.includes("FRANCISCO ALBERT") || persona.tutor.includes("Kiko")) ? 'selected' : ''}>Kiko</option>
                                <option value="VICENTE LLOPIS CORDOBA" ${persona.tutor && (persona.tutor.includes("VICENTE LLOPIS") || persona.tutor.includes("Vicente")) ? 'selected' : ''}>Vicente</option>
                                <option value="EUGENIO COLOMER GIRBÉS" ${persona.tutor && (persona.tutor.includes("EUGENIO COLOMER") || persona.tutor.includes("Eugenio")) ? 'selected' : ''}>Eugenio</option>
                            `;
                        }
                        return tutorOptions;
                    })()}
                </select>
            </div>

            <div class="incorporacionStatus" style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                <span style="font-size: 10px; font-weight: bold; color: #718178; min-width: 20px;">${completado}/${total}</span>

                <div class="dashChecklistLine" style="display: flex; gap: 5px; font-size: 0.72em; color: #444;" onclick="event.stopPropagation();">
                    <label style="display: flex; align-items: center; gap: 2px; cursor: pointer; font-weight: 600; font-family: inherit;">
                        <input type="checkbox" class="dash-check" data-campo="rrhh" style="cursor: pointer;" ${isChecked(persona.rrhh) ? 'checked' : ''} onchange="toggleDashboardCheck('${escapeAttr(persona.id)}', 'rrhh', this.checked)">
                        <span>RRHH</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 2px; cursor: pointer; font-weight: 600; font-family: inherit;">
                        <input type="checkbox" class="dash-check" data-campo="uniforme" style="cursor: pointer;" ${isChecked(persona.uniforme) ? 'checked' : ''} onchange="toggleDashboardCheck('${escapeAttr(persona.id)}', 'uniforme', this.checked)">
                        <span>Ropa</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 2px; cursor: pointer; font-weight: 600; font-family: inherit;">
                        <input type="checkbox" class="dash-check" data-campo="almuerzo" style="cursor: pointer;" ${isChecked(persona.almuerzo) ? 'checked' : ''} onchange="toggleDashboardCheck('${escapeAttr(persona.id)}', 'almuerzo', this.checked)">
                        <span>Almuerzo</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 2px; cursor: pointer; font-weight: 600; font-family: inherit;">
                        <input type="checkbox" class="dash-check" data-campo="tour" style="cursor: pointer;" ${isChecked(persona.tour) ? 'checked' : ''} onchange="toggleDashboardCheck('${escapeAttr(persona.id)}', 'tour', this.checked)">
                        <span>Su puesto</span>
                    </label>
                </div>

                <strong style="font-size: 10px; color: #167a49; min-width: 70px; text-align: right;">${escapeHtml(estado)}</strong>
            </div>

        </div>
    `;
}

function calcularEstadoChecklist(checklist) {
    const pendientes = checklist.pendientes || [];

    if (!pendientes.length) {
        return "Listo para producción";
    }

    return "Esperando " + pendientes[0];
}

async function toggleDashboardCheck(id, campo, checked) {
    // 1. Actualización optimista instantánea en el DOM
    const card = document.getElementById("card-" + id);
    if (card) {
        const rrhhCheck = card.querySelector('input[data-campo="rrhh"]');
        const ropaCheck = card.querySelector('input[data-campo="uniforme"]');
        const almuerzoCheck = card.querySelector('input[data-campo="almuerzo"]');
        const tourCheck = card.querySelector('input[data-campo="tour"]');

        let completado = 0;
        if (rrhhCheck && rrhhCheck.checked) completado++;
        if (ropaCheck && ropaCheck.checked) completado++;
        if (almuerzoCheck && almuerzoCheck.checked) completado++;
        if (tourCheck && tourCheck.checked) completado++;

        const porcentaje = Math.round((completado / 4) * 100);

        const progressFill = card.querySelector('.progressFill');
        if (progressFill) progressFill.style.width = porcentaje + "%";

        const fractionSpan = card.querySelector('.incorporacionStatus span');
        if (fractionSpan) fractionSpan.textContent = `${completado}/4`;

        const statusStrong = card.querySelector('.incorporacionStatus strong');
        if (statusStrong) {
            let newStatus = "Listo para producción";
            if (rrhhCheck && !rrhhCheck.checked) newStatus = "Esperando RRHH";
            else if (ropaCheck && !ropaCheck.checked) newStatus = "Esperando Ropa";
            else if (almuerzoCheck && !almuerzoCheck.checked) newStatus = "Esperando Almuerzo";
            else if (tourCheck && !tourCheck.checked) newStatus = "Esperando Su puesto";
            statusStrong.textContent = newStatus;
        }
    }

    // 2. Envío silencioso en segundo plano
    try {
        const res = await fetch("/api/persona/checklist", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Silent": "true"
            },
            body: JSON.stringify({
                id: id,
                campo: campo,
                valor: checked
            })
        });
        const data = await res.json();
        if (data && data.ok) {
            await loadDashboardSilent();
        } else {
            alert(data.error || "No se pudo actualizar el checklist");
            await loadDashboardSilent();
        }
    } catch (e) {
        console.error("Error al actualizar checklist:", e);
        alert("Error de conexión al actualizar");
        await loadDashboardSilent();
    }
}

async function asignarTutorDashboard(idNovato, tutor) {
    try {
        const res = await fetch("/api/planificacion/asignar", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                id_novato: idNovato,
                tutor: tutor
            })
        });
        const result = await res.json();
        if (res.ok && result.ok) {
            console.log("Tutor asignado con éxito");
            await loadDashboardSilent();
        } else {
            alert("Error al asignar tutor: " + (result.error || "Error desconocido"));
            await loadDashboardSilent();
        }
    } catch (err) {
        console.error("Error de conexión al asignar tutor:", err);
        alert("Error de conexión al asignar tutor");
        await loadDashboardSilent();
    }
}

async function loadDashboardSilent() {
    try {
        const url = "/api/dashboard";
        const response = await fetch(url, {
            headers: { "X-Silent": "true" }
        });
        if (response.ok) {
            dashboardData = await response.json();
            renderDashboard(dashboardData);
            setToday();
        }
    } catch (error) {
        console.error("Silent reload failed:", error);
    }
}


// ======================================================
// PRÓXIMAS ENTRADAS
// ======================================================

function renderProximasEntradas(entradas) {
    const panel = byId("panelProximas");
    if (!panel) return;

    if (!entradas.length) {
        panel.innerHTML = `<p class="empty">No hay próximas entradas.</p>`;
        return;
    }

    panel.innerHTML = entradas.map(dia => `
        <div class="dayCard">
            <div class="dayHeader">
                <strong>${escapeHtml(dia.fecha)}</strong>
                <span>${dia.total || 0} personas</span>
            </div>

            <div class="dayBody">
                ${(dia.personas || []).slice(0, 5).map(p => `
                    <div class="miniPersona" onclick="abrirExpediente('${escapeAttr(p.id)}')">
                        ${escapeHtml(p.nombre)}
                    </div>
                `).join("")}
            </div>
        </div>
    `).join("");
}


// ======================================================
// FASES Y DEPARTAMENTOS
// ======================================================

function renderObservaciones(items) {
    const panel = byId("panelObservaciones");
    if (!panel) return;

    if (!items || !items.length) {
        panel.innerHTML = `<p class="empty">Sin anotaciones recientes.</p>`;
        return;
    }

    const html = items.map(item => {
        let badgeColor = "#718096"; // gris
        let badgeBg = "#edf2f7";
        const tipo = String(item.tipo || "General").trim();
        const lowerTipo = tipo.toLowerCase();
        
        if (lowerTipo.includes("riesgo") || lowerTipo.includes("alerta") || lowerTipo.includes("error") || lowerTipo.includes("atención") || lowerTipo.includes("atencion")) {
            badgeColor = "#e53e3e"; // rojo
            badgeBg = "#fff5f5";
        } else if (lowerTipo.includes("progresión") || lowerTipo.includes("progresion") || lowerTipo.includes("mejora") || lowerTipo.includes("ok")) {
            badgeColor = "#3182ce"; // azul
            badgeBg = "#ebf8ff";
        } else if (lowerTipo.includes("felicitación") || lowerTipo.includes("felicitacion") || lowerTipo.includes("buena") || lowerTipo.includes("excelente")) {
            badgeColor = "#38a169"; // verde
            badgeBg = "#f0fff4";
        }

        const autor = item.autor_id ? `por ${escapeHtml(item.autor_id)}` : "";
        const fecha = escapeHtml(item.fecha_registro || "");
        
        return `
            <div class="listItem clickable" onclick="abrirExpediente('${escapeAttr(item.id_persona)}')" style="display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-bottom: 1px solid #edf2f7; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f7fafc'" onmouseout="this.style.background='transparent'">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85em;">
                    <strong style="color: #2b6cb0; font-weight: 700; text-transform: uppercase;">${escapeHtml(item.nombre_persona)}</strong>
                    <span style="color: #a0aec0; font-size: 0.9em;">${fecha}</span>
                </div>
                <div style="font-size: 0.9em; color: #2d3748; line-height: 1.4; text-align: justify; word-break: break-word;">
                    ${escapeHtml(item.comentario)}
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.76em; color: #718096; margin-top: 2px;">
                    <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 2px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase; font-size: 0.90em; letter-spacing: 0.5px;">${escapeHtml(tipo)}</span>
                    <span style="font-style: italic;">${autor}</span>
                </div>
            </div>
        `;
    }).join("");

    panel.innerHTML = html;
}

function renderDepartamentos(departamentos) {
    const panel = byId("panelDepartamentos");
    if (!panel) return;

    const entries = Object.entries(departamentos);
    if (!entries.length) {
        panel.innerHTML = `<p class="empty">Sin departamentos activos.</p>`;
        return;
    }

    // Ordenar de mayor a menor cantidad de personas
    entries.sort((a, b) => {
        const totalA = typeof a[1] === "object" ? a[1].total : a[1];
        const totalB = typeof b[1] === "object" ? b[1].total : b[1];
        return totalB - totalA;
    });

    // Colores premium para los sectores y la leyenda
    const colors = [
        '#173D2D', // Verde oscuro marca
        '#2fc46c', // Verde claro marca
        '#319795', // Teal
        '#3182ce', // Azul
        '#4c51bf', // Indigo
        '#805ad5', // Púrpura
        '#d53f8c', // Rosa
        '#e53e3e', // Rojo
        '#dd6b20', // Naranja
        '#d69e2e', // Amarillo
        '#4a5568', // Gris oscuro
        '#718096', // Gris claro
        '#a0aec0', // Gris plata
        '#cbd5e0'  // Gris blanco
    ];

    // Si Chart.js no está cargado por algún motivo, renderizar listado de barras horizontales como fallback
    if (typeof Chart === "undefined") {
        const maxTotal = Math.max(...entries.map(([_, data]) => typeof data === "object" ? data.total : data), 1);
        const html = entries.map(([nombre, data]) => {
            const total = typeof data === "object" ? data.total : data;
            const pct = (total / maxTotal) * 100;
            return `
                <div class="stateRow clickable" onclick="mostrarListado('${escapeAttr(nombre)}','departamento')" style="display: block; padding: 8px 0; border-bottom: 1px solid #edf2ee;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; color: #2d3748; margin-bottom: 5px;">
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">${escapeHtml(nombre)}</span>
                        <strong style="color: #173D2D; font-weight: 700;">${total || 0}</strong>
                    </div>
                    <div style="width: 100%; height: 8px; background: #edf2ee; border-radius: 4px; overflow: hidden;">
                        <div style="width: ${pct}%; height: 100%; background: #2fc46c; border-radius: 4px;"></div>
                    </div>
                </div>
            `;
        }).join("");
        panel.innerHTML = html;
        return;
    }

    // Destruir instancia previa de gráfico si ya existía para evitar solapamientos
    if (window.departamentosChart) {
        try {
            window.departamentosChart.destroy();
        } catch (e) {
            console.error("Error al destruir gráfico previo:", e);
        }
        window.departamentosChart = null;
    }

    // Insertar el contenedor del Canvas y la lista personalizada de leyenda interactiva
    panel.innerHTML = `
        <div class="dept-chart-wrapper" style="display: flex; flex-direction: column; gap: 15px; align-items: center; padding-top: 10px;">
            <div style="position: relative; width: 170px; height: 170px;">
                <canvas id="chartDepartamentos"></canvas>
            </div>
            <div class="dept-legend-list" style="width: 100%; max-height: 180px; overflow-y: auto; padding-right: 5px; display: flex; flex-direction: column; gap: 6px;">
                ${entries.map(([nombre, data], idx) => {
                    const total = typeof data === "object" ? data.total : data;
                    const color = colors[idx % colors.length];
                    return `
                        <div class="stateRow clickable" onclick="mostrarListado('${escapeAttr(nombre)}','departamento')" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid #edf2ee; font-size: 12px; border-radius: 4px; margin-bottom: 0;">
                            <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${color}; flex-shrink: 0;"></span>
                                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #2d3748; font-weight: 500;">${escapeHtml(nombre)}</span>
                            </div>
                            <strong style="color: #173D2D; font-weight: 700; flex-shrink: 0; padding-left: 10px;">${total}</strong>
                        </div>
                    `;
                }).join("")}
            </div>
        </div>
    `;

    // Inicializar el gráfico circular/doughnut con Chart.js
    const ctx = document.getElementById("chartDepartamentos").getContext("2d");
    const labels = entries.map(([nombre]) => nombre);
    const datasetData = entries.map(([_, data]) => typeof data === "object" ? data.total : data);
    const backgroundColors = entries.map((_, idx) => colors[idx % colors.length]);

    window.departamentosChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: datasetData,
                backgroundColor: backgroundColors,
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    display: false // Usamos nuestra leyenda interactiva y estilizada en su lugar
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${context.raw} personas`;
                        }
                    }
                }
            },
            onClick: (evt, activeElements) => {
                if (activeElements && activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const label = labels[index];
                    mostrarListado(label, 'departamento');
                }
            }
        }
    });
}


// ======================================================
// PDA Y CHECKLIST
// ======================================================

function renderPendientesFormacion(personas) {
    const panel = byId("panelPendientesFormacion");
    if (!panel) return;

    if (!personas || !personas.length) {
        panel.innerHTML = `<p class="empty">No hay personas pendientes de formación.</p>`;
        return;
    }

    panel.innerHTML = personas.map(p => `
        <div class="listItem clickable" onclick="event.stopPropagation(); abrirExpediente('${escapeAttr(p.id)}')" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; gap: 10px;">
            <div style="flex-grow: 1; min-width: 0; padding-right: 5px;">
                <strong style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.95em; color: #2d3748;">${escapeHtml(p.nombre)}</strong>
                <span style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8em; color: #718096; margin-top: 2px;">${escapeHtml(p.departamento || "Sin departamento")}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <span style="font-size: 0.7em; color: #4a5568; border: 1px dashed #cbd5e0; border-radius: 6px; padding: 3px 6px; background: #f7fafc; font-weight: 600; white-space: nowrap;">
                    📅 ${escapeHtml(p.fecha || "No disponible")}
                </span>
                <button onclick="event.stopPropagation(); abrirModalCompletarFormacion('${escapeAttr(p.id)}', '${escapeAttr(p.nombre)}')" style="background: #25D366; color: white; border: none; padding: 5px 10px; border-radius: 6px; font-size: 0.78em; font-weight: bold; cursor: pointer; display: flex; align-items: center; transition: all 0.2s;" onmouseenter="this.style.background='#128C7E'" onmouseleave="this.style.background='#25D366'">
                    ✓ Formar
                </button>
            </div>
        </div>
    `).join("");
}

function renderPersonasRevision21(personas) {
    const panel = byId("panelRevision21");
    if (!panel) return;

    if (!personas.length) {
        panel.innerHTML = `<p class="empty">No hay personas en revisión de 19-31 días.</p>`;
        return;
    }

    panel.innerHTML = personas.slice(0, 8).map(p => `
        <div class="listItem clickable" onclick="event.stopPropagation(); abrirExpediente('${escapeAttr(p.id)}')" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; gap: 10px;">
            <div style="flex-grow: 1; min-width: 0; padding-right: 5px;">
                <strong style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.95em; color: #2d3748;">${escapeHtml(p.nombre)}</strong>
                <span style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8em; color: #718096; margin-top: 2px;">${escapeHtml(p.departamento || "")}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <em class="badge" style="background: #e8f5ee; color: #173D2D; font-weight: 800; border-radius: 8px; padding: 4px 10px; font-size: 0.78em; font-style: normal; white-space: nowrap;">${p.dias || 21} días</em>
                <button onclick="event.stopPropagation(); enviarReporteRevision21('${escapeAttr(p.id)}', event)" style="background: #173D2D; color: white; border: none; padding: 5px 10px; border-radius: 6px; font-size: 0.78em; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;" onmouseenter="this.style.background='#255340'" onmouseleave="this.style.background='#173D2D'">
                    ✉️ Enviar
                </button>
            </div>
        </div>
    `).join("");
}


// ======================================================
// PRODUCTIVIDAD / ERRORES
// ======================================================

function renderProductividad(productividad) {
    const panel = byId("panelProductividad");
    if (!panel) return;

    const config = getGrafanaConfig();
    const mediaVal = productividad.media !== undefined ? productividad.media : 0;
    const personasCount = productividad.personas || 0;

    let html = `
        <div style="padding: 12px; background: #f8fafc; border-bottom: 1px solid #edf2f7; display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0;">
            <div>
                <span style="font-size: 1.6em; font-weight: 800; color: #173D2D;">${mediaVal}%</span>
                <span style="font-size: 0.85em; color: #718096; margin-left: 8px;">Promedio (${personasCount} personas)</span>
            </div>
            <a href="${config.url}/d/${config.uid}" target="_blank" class="primaryButton btnSmall" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 0.8em; background: #173D2D; color: white; border-radius: 4px; font-weight: bold;">
                📊 Abrir Grafana
            </a>
        </div>
    `;

    if (!config.isConfigured) {
        panel.innerHTML = html + renderGrafanaPlaceholder("Productividad", "Productividad media");
        return;
    }

    panel.innerHTML = html + `
        <div class="grafanaIframeContainer" style="position: relative;">
            <iframe src="${config.url}/d-solo/${config.uid}?panelId=${config.panelProd}&theme=light&refresh=1m" width="100%" height="220" frameborder="0"></iframe>
            <div style="font-size: 0.78em; color: #a0aec0; text-align: center; margin-top: 5px; padding: 0 10px;">
                ⚠️ Si la gráfica no se muestra, haz clic en "Abrir Grafana" arriba para iniciar sesión en tu cuenta.
            </div>
        </div>
    `;
}

function renderErrores(productividad) {
    const panel = byId("panelErrores");
    if (!panel) return;

    const config = getGrafanaConfig();
    const errorVal = productividad.errorMedio !== undefined ? productividad.errorMedio : 0;
    const personasCount = productividad.personas || 0;

    let html = `
        <div style="padding: 12px; background: #f8fafc; border-bottom: 1px solid #edf2f7; display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0;">
            <div>
                <span style="font-size: 1.6em; font-weight: 800; color: #c0392b;">${errorVal}%</span>
                <span style="font-size: 0.85em; color: #718096; margin-left: 8px;">Tasa de error promedio</span>
            </div>
            <a href="${config.url}/d/${config.uid}" target="_blank" class="primaryButton btnSmall" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 0.8em; background: #173D2D; color: white; border-radius: 4px; font-weight: bold;">
                📊 Abrir Grafana
            </a>
        </div>
    `;

    if (!config.isConfigured) {
        panel.innerHTML = html + renderGrafanaPlaceholder("Errores", "Tasa de errores media");
        return;
    }

    panel.innerHTML = html + `
        <div class="grafanaIframeContainer" style="position: relative;">
            <iframe src="${config.url}/d-solo/${config.uid}?panelId=${config.panelError}&theme=light&refresh=1m" width="100%" height="220" frameborder="0"></iframe>
            <div style="font-size: 0.78em; color: #a0aec0; text-align: center; margin-top: 5px; padding: 0 10px;">
                ⚠️ Si la gráfica no se muestra, haz clic en "Abrir Grafana" arriba para iniciar sesión en tu cuenta.
            </div>
        </div>
    `;
}



// ======================================================
// RIESGO / SEGUIMIENTO / FORMADORES
// ======================================================

function renderPersonasRiesgo(personas) {
    const panel = byId("panelRiesgo");
    if (!panel) return;

    if (!personas.length) {
        panel.innerHTML = `<p class="empty">No hay personas en riesgo.</p>`;
        return;
    }

    panel.innerHTML = personas.slice(0, 8).map(p => `
        <div class="listItem clickable" onclick="abrirExpediente('${escapeAttr(p.id)}')">
            <div>
                <strong>${escapeHtml(p.nombre)}</strong>
                <span>${escapeHtml(p.departamento || "")}</span>
            </div>
            <em class="badge dangerBadge">${escapeHtml(p.riesgo || "Alto")}</em>
        </div>
    `).join("");
}

function renderSeguimientoIndividual(personas) {
    const panel = byId("panelSeguimientoIndividual");
    if (!panel) return;

    if (!personas.length) {
        panel.innerHTML = `<p class="empty">Sin personas activas.</p>`;
        return;
    }

    panel.innerHTML = personas.slice(0, 10).map(p => `
        <div class="listItem clickable" onclick="abrirExpediente('${escapeAttr(p.id)}')">
            <div>
                <strong>${escapeHtml(p.nombre)}</strong>
                <span>
                    ${escapeHtml(p.departamento || "")}
                    ${p.dias ? " · " + escapeHtml(p.dias) + " días" : ""}
                </span>
            </div>
            <em>${escapeHtml(p.estado || "")}</em>
        </div>
    `).join("");
}

function renderFormadores(formadores) {
    const panel = byId("panelFormadores");
    if (!panel) return;

    if (!formadores.length) {
        panel.innerHTML = `<p class="empty">Sin formadores asignados.</p>`;
        return;
    }

    panel.innerHTML = formadores.map(f => `
        <div class="stateRow">
            <span>${escapeHtml(f.nombre)}</span>
            <strong>${f.total || 0}</strong>
        </div>
    `).join("");
}


// ======================================================
// ACCIONES Y TIMELINE
// ======================================================

function renderAcciones(alertas) {
    const panel = byId("panelAcciones");
    if (!panel) return;

    if (!alertas.length) {
        panel.innerHTML = `<p class="empty">Sin próximas acciones.</p>`;
        return;
    }

    panel.innerHTML = alertas.slice(0, 8).map(a => `
        <div class="listItem clickable" onclick="abrirExpediente('${escapeAttr(a.persona?.id || "")}')">
            <div>
                <strong>${escapeHtml(a.tipo || "Acción")}</strong>
                <span>${escapeHtml(a.mensaje || "")}</span>
            </div>
        </div>
    `).join("");
}

function renderTimeline(items) {
    const panel = byId("panelTimeline");
    if (!panel) return;

    if (!items.length) {
        panel.innerHTML = `<p class="empty">Sin actividad reciente.</p>`;
        return;
    }

    panel.innerHTML = items.slice(0, 8).map(item => `
        <div class="listItem">
            <div>
                <strong>${escapeHtml(item.fecha || item.FECHA || "")}</strong>
                <span>${escapeHtml(item.descripcion || item.DESCRIPCION || item.mensaje || "")}</span>
            </div>
        </div>
    `).join("");
}


// ======================================================
// LISTADOS
// ======================================================

async function mostrarListado(nombre, tipo) {
    const modal = document.getElementById("modal-semaforo");
    const modalTitle = document.getElementById("modal-semaforo-titulo");
    const modalBody = document.getElementById("modal-semaforo-body");
    
    if (!modal || !modalTitle || !modalBody) return;
    
    let modalTitleText = `👥 Personas - ${nombre}`;
    if (tipo === "incorporaciones") modalTitleText = "🟢 Personas - Incorporaciones";
    else if (tipo === "seguimiento") modalTitleText = "👥 Personas - En Seguimiento";
    else if (tipo === "no_aptos") modalTitleText = "🔴 Personas - No Aptas";
    else if (tipo === "contrato_limitado") modalTitleText = "⏳ Personas - Contrato Temporal";
    else if (tipo === "formadores") modalTitleText = "🎓 Personas - Formadores";
    else if (tipo === "fase") modalTitleText = `📋 Personas - Fase: ${nombre}`;
    else if (tipo === "departamento") modalTitleText = `🏭 Personas - Departamento: ${nombre}`;
    
    modalTitle.innerHTML = modalTitleText;
    modalBody.innerHTML = `<p class="empty" style="text-align: center; padding: 20px; font-weight: bold; color: #4a5568;">Cargando...</p>`;
    modal.style.display = "flex";
    
    try {
        const url = (tipo === "contrato_limitado") ? "/api/personas?historial=true" : "/api/personas";
        const res = await fetch(url);
        const personas = await res.json();
        
        let filtradas = [];
        let colorBorder = "#3182ce";
        let colorBadge = "#3182ce";
        let colorBadgeBg = "#ebf8ff";
        
        const normalizar = (txt) => String(txt || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        
        if (tipo === "incorporaciones") {
            colorBorder = "#48bb78";
            colorBadge = "#48bb78";
            colorBadgeBg = "#f0fff4";
            filtradas = personas.filter(p => normalizar(p.programa).includes("NUEVA"));
        } else if (tipo === "seguimiento") {
            colorBorder = "#3182ce";
            colorBadge = "#3182ce";
            colorBadgeBg = "#ebf8ff";
            filtradas = personas.filter(p => {
                const dep = normalizar(p.departamento);
                const est = normalizar(p.estado);
                const dias = parseInt(p.dias || 0);
                const esDep = ["TALLER NATURAL", "SACADO H", "SACADO V"].some(d => dep.includes(d));
                const esActiva = !["TERMINADO", "FINALIZADO", "NO APTO", "BAJA", "EQUIPO"].includes(est) && (isNaN(dias) || dias <= 31);
                return esDep && esActiva;
            });
        } else if (tipo === "no_aptos") {
            colorBorder = "#e53e3e";
            colorBadge = "#e53e3e";
            colorBadgeBg = "#fff5f5";
            filtradas = personas.filter(p => normalizar(p.estado) === "NO APTO");
        } else if (tipo === "contrato_limitado") {
            colorBorder = "#dd6b20";
            colorBadge = "#dd6b20";
            colorBadgeBg = "#fffaf0";
            filtradas = personas.filter(p => {
                const est = normalizar(p.estado);
                const fin = normalizar(p.finalizado);
                const isActive = !["TERMINADO", "FINALIZADO", "NO APTO", "BAJA", "EQUIPO"].includes(est) && fin !== "SI" && fin !== "SI";
                return isActive && ["SI", "X", "TRUE", "S"].includes(normalizar(p.contrato_limitado));
            });
        } else if (tipo === "fase") {
            colorBorder = "#4a5568";
            colorBadge = "#4a5568";
            colorBadgeBg = "#f7fafc";
            
            const mapaFases = {
                "ONBOARDING": "Onboarding",
                "ACOMPANAMIENTO": "Onboarding",
                "RONDA EQUIPOS": "Onboarding",
                "SHADOW": "Shadow",
                "SACADO H": "Shadow",
                "LIBRE": "Libre",
                "LIBRE FASE 1": "Libre",
                "LIBRE FASE 2": "Libre",
                "EQUIPO": "Equipo",
                "MENTOR": "Equipo"
            };
            
            filtradas = personas.filter(p => {
                const dep = normalizar(p.departamento);
                const est = normalizar(p.estado);
                const dias = parseInt(p.dias || 0);
                const esDep = ["TALLER NATURAL", "SACADO H", "SACADO V"].some(d => dep.includes(d));
                const esActiva = !["TERMINADO", "FINALIZADO", "NO APTO", "BAJA", "EQUIPO"].includes(est) && (isNaN(dias) || dias <= 31);
                return esDep && esActiva && mapaFases[est] === nombre;
            });
        } else if (tipo === "departamento") {
            colorBorder = "#319795";
            colorBadge = "#319795";
            colorBadgeBg = "#e6fffa";
            filtradas = personas.filter(p => {
                const dep = normalizar(p.departamento);
                const est = normalizar(p.estado);
                const dias = parseInt(p.dias || 0);
                const esDep = ["TALLER NATURAL", "SACADO H", "SACADO V"].some(d => dep.includes(d));
                const esActiva = !["TERMINADO", "FINALIZADO", "NO APTO", "BAJA", "EQUIPO"].includes(est) && (isNaN(dias) || dias <= 31);
                return esDep && esActiva && dep === normalizar(nombre);
            });
        } else if (tipo === "formadores") {
            colorBorder = "#805ad5";
            colorBadge = "#805ad5";
            colorBadgeBg = "#faf5ff";
            
            const tutoresMap = {};
            personas.forEach(p => {
                const tutor = String(p.tutor || "").trim();
                if (tutor) {
                    const est = normalizar(p.estado);
                    const isActivo = !["TERMINADO", "FINALIZADO", "NO APTO", "BAJA", "EQUIPO"].includes(est);
                    if (isActivo) {
                        if (!tutoresMap[tutor]) tutoresMap[tutor] = [];
                        tutoresMap[tutor].push(p);
                    }
                }
            });
            
            const tutoresList = Object.keys(tutoresMap).map(tName => ({
                nombre: tName,
                personas: tutoresMap[tName]
            })).sort((a, b) => b.personas.length - a.personas.length);
            
            if (tutoresList.length === 0) {
                modalBody.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: #718096;">
                        <p style="font-weight: bold;">No hay formadores con asignaciones activas actualmente.</p>
                    </div>
                `;
                return;
            }
            
            let html = "";
            tutoresList.forEach(t => {
                html += `
                    <div class="late-worker-card" style="border-left: 5px solid ${colorBorder}; margin-bottom: 15px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <div class="late-worker-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2f7; padding-bottom: 10px; margin-bottom: 10px;">
                            <span class="late-worker-name" style="font-size: 1.05em; font-weight: 700; color: #2d3748;">
                                👨‍🏫 Tutor: ${escapeHtml(t.nombre)}
                            </span>
                            <span style="background: ${colorBadgeBg}; color: ${colorBadge}; border: 1px solid ${colorBorder}; font-weight: 800; font-size: 0.78em; padding: 4px 10px; border-radius: 8px; letter-spacing: 0.5px;">${t.personas.length} asignados</span>
                        </div>
                        <div style="font-size: 0.88em; color: #4a5568; display: flex; flex-direction: column; gap: 8px;">
                            <div style="font-weight: bold; margin-bottom: 6px;">Colaboradores tutorizados:</div>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                ${t.personas.map(p => `
                                    <div class="late-worker-card" style="border-left: 3px solid #805ad5; padding: 12px; background: #fafbfc; border-radius: 6px; box-shadow: none; border: 1px solid #edf2f7; margin-bottom: 5px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2f7; padding-bottom: 6px; margin-bottom: 8px;">
                                            <span style="font-size: 0.95em; font-weight: 700; color: #2d3748;">
                                                👤 <a href="/expediente/${p.id}" target="_blank" style="color: #173D2D; text-decoration: underline; font-weight: bold;">${escapeHtml(p.nombre)}</a>
                                            </span>
                                            <span style="background: #faf5ff; color: #805ad5; font-weight: 700; font-size: 0.72em; padding: 2px 6px; border-radius: 6px; border: 1px solid #d6bcfa;">Día ${p.dias || "0"}</span>
                                        </div>
                                        <div style="font-size: 0.82em; color: #4a5568; display: flex; flex-direction: column; gap: 4px;">
                                            <div><strong>Departamento:</strong> ${escapeHtml(p.departamento || "No asignado")}</div>
                                            <div style="display: flex; gap: 12px; background: white; padding: 6px; border-radius: 4px; border: 1px solid #edf2f7; margin-top: 4px;">
                                                <div><strong>Rendimiento:</strong> <span style="font-weight: bold; color: #805ad5;">${p.productividad_ultimo_dia || "-"}</span></div>
                                                <div><strong>Líneas/Hora:</strong> <span>${p.productividad_media || "-"}</span></div>
                                                <div><strong>Errores hoy:</strong> <span style="font-weight: bold; color: ${parseInt(p.error_ultimo_dia) > 0 ? '#e53e3e' : '#4a5568'}">${p.error_ultimo_dia || "0"}</span></div>
                                            </div>
                                        </div>
                                    </div>
                                `).join("")}
                            </div>
                        </div>
                    </div>
                `;
            });
            modalBody.innerHTML = html;
            return;
        }
        
        if (filtradas.length === 0) {
            modalBody.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #718096;">
                    <p style="font-weight: bold;">No hay personas en este grupo actualmente.</p>
                </div>
            `;
            return;
        }
        
        let html = "";
        filtradas.forEach(p => {
            let colorCode = normalizar(p.color_code);
            let currentBorderColor = colorBorder;
            let currentBadgeColor = colorBadge;
            let currentBadgeBgColor = colorBadgeBg;
            let badgeText = nombre;
            
            if (tipo === "incorporaciones") badgeText = p.programa || "Nuevas";
            else if (tipo === "seguimiento") badgeText = p.estado || "En Seguimiento";
            else if (tipo === "no_aptos") badgeText = p.estado || "No Apto";
            else if (tipo === "contrato_limitado") badgeText = "Contrato Limitado";
            else if (tipo === "fase") badgeText = p.estado || "Fase";
            else if (tipo === "departamento") badgeText = p.estado || "Activo";
            
            if (colorCode) {
                if (colorCode === "ROJO") {
                    currentBorderColor = "#e53e3e";
                    currentBadgeColor = "#e53e3e";
                    currentBadgeBgColor = "#fff5f5";
                    badgeText += " (Rojo)";
                } else if (colorCode === "AMARILLO") {
                    currentBorderColor = "#dd6b20";
                    currentBadgeColor = "#dd6b20";
                    currentBadgeBgColor = "#fffaf0";
                    badgeText += " (Amarillo)";
                } else if (colorCode === "VERDE") {
                    currentBorderColor = "#38a169";
                    currentBadgeColor = "#38a169";
                    currentBadgeBgColor = "#f0fff4";
                    badgeText += " (Verde)";
                }
            }
            
            html += `
                <div class="late-worker-card" style="border-left: 5px solid ${currentBorderColor}; margin-bottom: 15px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div class="late-worker-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2f7; padding-bottom: 10px; margin-bottom: 10px;">
                        <span class="late-worker-name" style="font-size: 1.05em; font-weight: 700; color: #2d3748;">
                            👤 <a href="/expediente/${p.id}" target="_blank" style="color: #173D2D; text-decoration: underline; font-weight: bold;">${escapeHtml(p.nombre)}</a>
                        </span>
                        <span style="background: ${currentBadgeBgColor}; color: ${currentBadgeColor}; border: 1px solid ${currentBorderColor}; font-weight: 800; font-size: 0.78em; padding: 4px 10px; border-radius: 8px; letter-spacing: 0.5px;">${escapeHtml(badgeText)}</span>
                    </div>
                    <div style="font-size: 0.88em; color: #4a5568; display: flex; flex-direction: column; gap: 6px;">
                        <div><strong>Departamento:</strong> ${escapeHtml(p.departamento || "No asignado")}</div>
                        <div><strong>Estado actual:</strong> ${escapeHtml(p.estado || "No definido")}</div>
                        <div><strong>Días en seguimiento:</strong> ${p.dias || "0"} días</div>
                        ${p.tutor ? `<div><strong>Tutor:</strong> ${escapeHtml(p.tutor)}</div>` : ''}
                        <div style="margin-top: 5px; display: flex; gap: 15px; background: #f7fafc; padding: 8px; border-radius: 6px; border: 1px solid #edf2f7;">
                            <div><strong>Rendimiento:</strong> <span style="font-weight: bold; color: ${currentBadgeColor};">${p.productividad_ultimo_dia || "-"}</span></div>
                            <div><strong>Líneas/Hora:</strong> <span>${p.productividad_media || "-"}</span></div>
                            <div><strong>Errores hoy:</strong> <span style="font-weight: bold; color: ${parseInt(p.error_ultimo_dia) > 0 ? '#e53e3e' : '#4a5568'}">${p.error_ultimo_dia || "0"}</span></div>
                        </div>
                    </div>
                </div>
            `;
        });
        modalBody.innerHTML = html;
    } catch (err) {
        console.error(err);
        modalBody.innerHTML = `<p style="color: red; text-align: center; padding: 20px;">Error al cargar datos.</p>`;
    }
}


// ======================================================
// NAVEGACIÓN
// ======================================================

function abrirExpediente(id) {
    if (!id) return;
    window.open("/expediente/" + id, "_blank");
}


// ======================================================
// LOADING
// ======================================================

function showLoadingDashboard() {
    [
        "panelHoy",
        "panelProximas",
        "panelObservaciones",
        "panelDepartamentos",
        "panelPendientesFormacion",
        "panelRevision21",
        "panelProductividad",
        "panelErrores",
        "panelRiesgo",
        "panelSeguimientoIndividual",
        "panelFormadores",
        "panelAcciones",
        "panelTimeline"
    ].forEach(id => {
        const el = byId(id);
        if (el) el.innerHTML = `<p class="empty">Cargando...</p>`;
    });
}


// ======================================================
// UTILIDADES
// ======================================================

function byId(id){
    return document.getElementById(id);
}

function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
    return String(value || "")
        .replaceAll("'", "\\'")
        .replaceAll('"', "&quot;");
}

// ======================================================
// INTEGRACIÓN DE GRAFANA
// ======================================================

function getGrafanaConfig() {
    // Limpiar valores por defecto antiguos de pruebas
    if (localStorage.getItem("grafana_url") === "https://grafana.empresa.com") {
        localStorage.removeItem("grafana_url");
    }
    if (localStorage.getItem("grafana_uid") === "xxxxxxxx") {
        localStorage.removeItem("grafana_uid");
    }
    if (localStorage.getItem("grafana_panel_prod") === "12") {
        localStorage.removeItem("grafana_panel_prod");
    }
    if (localStorage.getItem("grafana_panel_error") === "15") {
        localStorage.removeItem("grafana_panel_error");
    }

    return {
        url: localStorage.getItem("grafana_url") || "https://grafana.verdnatura.es",
        uid: localStorage.getItem("grafana_uid") || "vigfp89",
        panelProd: localStorage.getItem("grafana_panel_prod") || "3",
        panelError: localStorage.getItem("grafana_panel_error") || "5",
        isConfigured: localStorage.getItem("grafana_configured") === "true"
    };
}

function renderGrafanaPlaceholder(panelId, targetPanelName) {
    const config = getGrafanaConfig();
    return `
        <div class="grafanaPlaceholder">
            <div class="placeholderIcon">📊</div>
            <h3>Conectar con Grafana</h3>
            <p>Se requiere inicio de sesión en Grafana para visualizar la <strong>${targetPanelName}</strong>.</p>
            <div class="placeholderActions">
                <button class="primaryButton btnSmall" onclick="loginToGrafana('${config.url}')">🔑 Iniciar Sesión</button>
                <button class="secondaryButton btnSmall" style="background:#edf4ef; color:#173D2D; border:none; padding:8px 12px; border-radius:10px; font-weight:800; cursor:pointer;" onclick="openGrafanaConfig()">⚙️ Configurar</button>
            </div>
        </div>
    `;
}

function loginToGrafana(url) {
    if (!url) {
        alert("Por favor, configura la URL de Grafana primero.");
        openGrafanaConfig();
        return;
    }
    window.open(url + "/login", "_blank");
}

function openGrafanaConfig() {
    const config = getGrafanaConfig();
    
    byId("grafanaUrl").value = localStorage.getItem("grafana_url") || config.url;
    byId("grafanaUid").value = localStorage.getItem("grafana_uid") || config.uid;
    byId("grafanaPanelProd").value = localStorage.getItem("grafana_panel_prod") || config.panelProd;
    byId("grafanaPanelError").value = localStorage.getItem("grafana_panel_error") || config.panelError;
    
    byId("grafanaModal").style.display = "flex";
}

function closeGrafanaConfig() {
    byId("grafanaModal").style.display = "none";
}

function saveGrafanaConfig() {
    const url = byId("grafanaUrl").value.trim().replace(/\/$/, "");
    const uid = byId("grafanaUid").value.trim();
    const panelProd = byId("grafanaPanelProd").value.trim();
    const panelError = byId("grafanaPanelError").value.trim();

    if (!url || !uid || !panelProd || !panelError) {
        alert("Todos los campos son obligatorios para conectar con Grafana.");
        return;
    }

    localStorage.setItem("grafana_url", url);
    localStorage.setItem("grafana_uid", uid);
    localStorage.setItem("grafana_panel_prod", panelProd);
    localStorage.setItem("grafana_panel_error", panelError);
    localStorage.setItem("grafana_configured", "true");

    closeGrafanaConfig();
    loadDashboard();
}


// ======================================================
// ALERTAS DE IMPUNTUALIDAD (RETRASOS) Y RIESGO
// ======================================================

window.currentRetrasosData = [];

function renderRetrasos(retrasos) {
    window.currentRetrasosData = retrasos;
    const bannerContainer = document.getElementById("contenedor-banner-retrasos");
    if (bannerContainer) {
        bannerContainer.style.display = "none";
    }

    alertasTardiness = (retrasos || []).map(r => ({
        workerId: r.id,
        workerName: r.nombre,
        type: "arrival",
        badgeText: "Impuntualidad",
        text: `Tiene ${r.retrasos_count} entradas con retraso en los últimos 14 días.`
    }));

    if (typeof renderCombinedAlerts === "function") {
        renderCombinedAlerts();
    }
}

function abrirModalRetrasos() {
    const modal = document.getElementById("modal-retrasos");
    const modalBody = document.getElementById("modal-retrasos-body");
    if (!modal || !modalBody) return;

    const retrasos = window.currentRetrasosData || [];
    if (retrasos.length === 0) return;

    let html = "";
    retrasos.forEach(r => {
        let diasHtml = "";
        r.dias.forEach(d => {
            diasHtml += `
                <div class="late-day-item">
                    <span>📅 <strong>${d.fecha}</strong></span>
                    <span>Hora entrada: <strong style="color:#c53030;">${d.hora_fichaje}</strong></span>
                    <span>Esperada: <strong>${d.hora_esperada}</strong></span>
                    <span style="background: #fff5f5; color: #c53030; padding: 2px 6px; border-radius: 4px; font-weight: bold;">+${d.minutos_retraso} min</span>
                </div>
            `;
        });

        html += `
            <div class="late-worker-card">
                <div class="late-worker-header">
                    <span class="late-worker-name">👤 <a href="/expediente/${r.id}" style="color: #173D2D; text-decoration: underline; font-weight: bold;">${escapeHtml(r.nombre)}</a> (${escapeHtml(r.departamento)})</span>
                    <span class="late-worker-badge">${r.retrasos_count} retrasos</span>
                </div>
                <div class="late-days-list">
                    ${diasHtml}
                </div>
            </div>
        `;
    });

    modalBody.innerHTML = html;
    modal.style.display = "flex";
}

function cerrarModalRetrasos() {
    const modal = document.getElementById("modal-retrasos");
    if (modal) {
        modal.style.display = "none";
    }
}

async function abrirModalRiesgo() {
    const modal = document.getElementById("modal-semaforo");
    const modalTitle = document.getElementById("modal-semaforo-titulo");
    const modalBody = document.getElementById("modal-semaforo-body");
    if (!modal || !modalTitle || !modalBody) return;

    modalTitle.innerHTML = `🚨 Personas - Riesgo Alto`;
    modalBody.innerHTML = `<p class="empty" style="text-align: center; padding: 20px; font-weight: bold; color: #4a5568;">Cargando...</p>`;
    modal.style.display = "flex";

    try {
        const res = await fetch("/api/personas");
        const personas = await res.json();
        
        const normalizar = (txt) => String(txt || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        
        const filtradas = personas.filter(p => {
            const est = normalizar(p.estado);
            const riesgoVal = normalizar(p.riesgo);
            const dias = parseInt(p.dias || 0);
            const esActiva = !["TERMINADO", "FINALIZADO", "NO APTO", "BAJA", "EQUIPO"].includes(est) && (isNaN(dias) || dias <= 31);
            return riesgoVal === "ALTO" && esActiva;
        });

        if (filtradas.length === 0) {
            modalBody.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #718096;">
                    <p style="font-weight: bold;">No hay ninguna persona en riesgo alto actualmente.</p>
                </div>
            `;
            return;
        }

        let html = "";
        filtradas.forEach(p => {
            let checklistPending = false;
            if (p.checklist && p.checklist.pendientes && p.checklist.pendientes.length > 0) {
                checklistPending = true;
            } else if (p.checklist && typeof p.checklist.porcentaje === 'number' && p.checklist.porcentaje < 100) {
                checklistPending = true;
            }

            let alertasHtml = "";
            if (checklistPending) {
                alertasHtml += `<span class="risk-worker-badge" style="background: #ebf8ff; color: #2b6cb0; border: 1px solid #bee3f8; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-right: 5px; font-weight: bold;">📋 Checklist incompleto</span>`;
            }
            if (!p.tutor) {
                alertasHtml += `<span class="risk-worker-badge" style="background: #fffaf0; color: #dd6b20; border: 1px solid #fbd38d; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-right: 5px; font-weight: bold;">👤 Sin tutor</span>`;
            }

            html += `
                <div class="late-worker-card" style="border-left: 5px solid #e53e3e; margin-bottom: 15px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div class="late-worker-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2f7; padding-bottom: 10px; margin-bottom: 10px;">
                        <span class="late-worker-name" style="font-size: 1.05em; font-weight: 700; color: #2d3748;">
                            👤 <a href="/expediente/${p.id}" target="_blank" style="color: #173D2D; text-decoration: underline; font-weight: bold;">${escapeHtml(p.nombre)}</a>
                        </span>
                        <span style="background: #fff5f5; color: #e53e3e; border: 1px solid #e53e3e; font-weight: 800; font-size: 0.78em; padding: 4px 10px; border-radius: 8px; letter-spacing: 0.5px;">Riesgo Alto</span>
                    </div>
                    <div style="font-size: 0.88em; color: #4a5568; display: flex; flex-direction: column; gap: 6px;">
                        <div><strong>Departamento:</strong> ${escapeHtml(p.departamento || "No asignado")}</div>
                        <div><strong>Estado actual:</strong> ${escapeHtml(p.estado || "No definido")}</div>
                        <div><strong>Días en seguimiento:</strong> ${p.dias || "0"} días</div>
                        ${p.tutor ? `<div><strong>Tutor:</strong> ${escapeHtml(p.tutor)}</div>` : ''}
                        ${alertasHtml ? `<div style="margin-top: 5px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap;"><strong>Alertas:</strong> ${alertasHtml}</div>` : ""}
                        <div style="margin-top: 5px; display: flex; gap: 15px; background: #f7fafc; padding: 8px; border-radius: 6px; border: 1px solid #edf2f7;">
                            <div><strong>Rendimiento:</strong> <span style="font-weight: bold; color: #e53e3e;">${p.productividad_ultimo_dia || "-"}</span></div>
                            <div><strong>Líneas/Hora:</strong> <span>${p.productividad_media || "-"}</span></div>
                            <div><strong>Errores hoy:</strong> <span style="font-weight: bold; color: ${parseInt(p.error_ultimo_dia) > 0 ? '#e53e3e' : '#4a5568'}">${p.error_ultimo_dia || "0"}</span></div>
                        </div>
                    </div>
                </div>
            `;
        });

        modalBody.innerHTML = html;
    } catch (err) {
        console.error(err);
        modalBody.innerHTML = `<p style="color: red; text-align: center; padding: 20px;">Error al cargar datos.</p>`;
    }
}

function cerrarModalRiesgo() {
    const modal = document.getElementById("modal-semaforo");
    if (modal) {
        modal.style.display = "none";
    }
}

function abrirModalRevision21() {
    const modal = document.getElementById("modal-revision21");
    const modalBody = document.getElementById("modal-revision21-body");
    if (!modal || !modalBody) return;

    const personasRevision21 = (dashboardData && dashboardData.personasRevision21) || [];
    if (personasRevision21.length === 0) {
        modalBody.innerHTML = `
            <div class="empty">
                <p style="margin-top: 15px; font-weight: bold;">No hay ninguna persona con 19-31 días en seguimiento actualmente.</p>
            </div>
        `;
        modal.style.display = "flex";
        return;
    }

    let html = "";
    personasRevision21.forEach(p => {
        html += `
            <div class="late-worker-card" style="border-left: 5px solid #319795;">
                <div class="late-worker-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2f7; padding-bottom: 10px; margin-bottom: 10px;">
                    <span class="late-worker-name" style="font-size: 1.05em; font-weight: 700; color: #2d3748;">
                        👤 <a href="/expediente/${p.id}" style="color: #173D2D; text-decoration: underline; font-weight: bold;">${escapeHtml(p.nombre)}</a>
                    </span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button onclick="enviarReporteRevision21('${escapeAttr(p.id)}')" style="background: #173D2D; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8em; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;" onmouseenter="this.style.background='#255340'" onmouseleave="this.style.background='#173D2D'">
                            ✉️ Enviar
                        </button>
                        <span class="late-worker-badge" style="background: #e6fffa; color: #234e52; border: 1px solid #b2f5ea; font-weight: 800; font-size: 0.78em; padding: 4px 10px; border-radius: 8px; letter-spacing: 0.5px;">${p.dias || 21} días</span>
                    </div>
                </div>
                <div style="font-size: 0.88em; color: #4a5568; display: flex; flex-direction: column; gap: 6px;">
                    <div><strong>Departamento:</strong> ${escapeHtml(p.departamento || "No asignado")}</div>
                    <div><strong>Estado actual:</strong> ${escapeHtml(p.estado || "No definido")}</div>
                    <div><strong>Fecha incorporación:</strong> ${escapeHtml(p.fecha || "No disponible")}</div>
                    <div><strong>Tutor/Formador:</strong> ${escapeHtml(p.tutor || "Sin tutor")}</div>
                </div>
            </div>
        `;
    });

    modalBody.innerHTML = html;
    modal.style.display = "flex";
}

function cerrarModalRevision21() {
    const modal = document.getElementById("modal-revision21");
    if (modal) {
        modal.style.display = "none";
    }
}

async function enviarReporteRevision21(id, event) {
    if (!confirm("¿Estás seguro de que deseas enviar el informe de revisión por correo y retirar al trabajador de la lista de 19-31 días?")) {
        return;
    }
    
    const btn = event ? event.target.closest("button") : null;
    const originalText = btn ? btn.innerHTML : "✉️ Enviar";
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "⏳ Enviando...";
        btn.style.background = "#718096";
    }
    
    try {
        const response = await fetch(`/api/trabajador/${id}/enviar_revision_18_21`, {
            method: "POST"
        });
        
        let result = {};
        try {
            result = await response.json();
        } catch (e) {
            result = { ok: false, error: `Error del servidor (HTTP ${response.status})` };
        }
        
        if (response.ok && result.ok) {
            alert("El informe ha sido enviado por correo exitosamente.");
            cerrarModalRevision21();
            await loadDashboard(); // Recargar datos del dashboard de forma asíncrona
        } else {
            alert("Error al enviar el correo: " + (result.error || "Ocurrió un error inesperado."));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
                btn.style.background = "#173D2D";
            }
        }
    } catch (err) {
        alert("Error de red: " + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.style.background = "#173D2D";
        }
    }
}

// ======================================================
// GESTIÓN DE WHATSAPP
// ======================================================

let editandoEnlaceWhatsapp = false;
let activeWhatsappTab = "añadir";

async function abrirModalWhatsapp() {
    const modal = document.getElementById("modal-whatsapp");
    if (!modal) return;
    
    // 1. Cargar el enlace del grupo
    try {
        const resConfig = await fetch("/api/whatsapp/config");
        const config = await resConfig.json();
        
        const textSpan = document.getElementById("whatsapp-group-link-text");
        const joinBtn = document.getElementById("whatsapp-join-btn");
        const linkInput = document.getElementById("whatsapp-group-link-input");
        
        if (textSpan) textSpan.innerText = config.url || "Sin enlace";
        if (joinBtn) joinBtn.href = config.url || "#";
        if (linkInput) linkInput.value = config.url || "";
    } catch (err) {
        console.error("Error cargando configuración de WhatsApp:", err);
    }
    
    // 2. Renderizar contenido
    renderizarContenidoWhatsapp();
    
    modal.style.display = "flex";
}

function cambiarTabWhatsapp(tabName) {
    activeWhatsappTab = tabName;
    renderizarContenidoWhatsapp();
}

function renderizarContenidoWhatsapp() {
    const modalBody = document.getElementById("modal-whatsapp-body");
    if (!modalBody) return;
    
    const personasAñadir = dashboardData.personasWhatsapp || [];
    const personasQuitar = dashboardData.personasWhatsappQuitar || [];
    
    const countAñadir = personasAñadir.length;
    const countQuitar = personasQuitar.length;
    
    let html = `
        <!-- Tabs -->
        <div class="whatsapp-tabs" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #edf2f7; padding-bottom: 12px;">
            <button onclick="cambiarTabWhatsapp('añadir')" style="flex: 1; padding: 10px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: all 0.2s; ${activeWhatsappTab === 'añadir' ? 'background: #e6fffa; color: #234e52; border-bottom: 3px solid #25D366; box-shadow: inset 0 -2px 0 #25d366;' : 'background: #f7fafc; color: #718096;'}">
                ➕ Añadir al Grupo (${countAñadir})
            </button>
            <button onclick="cambiarTabWhatsapp('quitar')" style="flex: 1; padding: 10px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; transition: all 0.2s; ${activeWhatsappTab === 'quitar' ? 'background: #fff5f5; color: #9b2c2c; border-bottom: 3px solid #e53e3e; box-shadow: inset 0 -2px 0 #e53e3e;' : 'background: #f7fafc; color: #718096;'}">
                ➖ Quitar del Grupo (${countQuitar})
            </button>
        </div>
    `;
    
    if (activeWhatsappTab === "añadir") {
        if (countAñadir === 0) {
            html += `
                <div style="text-align: center; padding: 30px; color: #718096; font-size: 0.95em; background: white; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                    🎉 Todos los colaboradores nuevos han sido agregados al grupo de WhatsApp.
                </div>
            `;
        } else {
            html += `
                <div style="margin-bottom: 10px; font-weight: bold; color: #4a5568; font-size: 0.9em; display: flex; justify-content: space-between;">
                    <span>Pendientes de Añadir (${countAñadir})</span>
                    <span style="font-size: 0.85em; color: #718096;">Ordenar por primer día</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; max-height: 45vh; overflow-y: auto; padding-right: 4px;">
            `;
            
            personasAñadir.forEach(p => {
                html += `
                    <div class="late-worker-card" style="border-left: 5px solid #25D366; background: white; padding: 15px; border-radius: 8px; border: 1px solid #edf2f7; box-shadow: 0 1px 3px rgba(0,0,0,0.02); display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                        <div style="flex-grow: 1; min-width: 0;">
                            <div style="font-weight: bold; color: #2d3748; font-size: 0.98em; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                👤 <a href="/expediente/${p.id}" style="color: #173D2D; text-decoration: underline; font-weight: bold;">${escapeHtml(p.nombre)}</a>
                            </div>
                            <div style="font-size: 0.8em; color: #718096; display: flex; flex-wrap: wrap; gap: 8px 12px;">
                                <span><strong>Día de Incorporación:</strong> ${escapeHtml(p.fecha || "No disponible")}</span>
                                <span><strong>Departamento:</strong> ${escapeHtml(p.departamento || "No asignado")}</span>
                                <span><strong>Tutor:</strong> ${escapeHtml(p.tutor || "Sin tutor")}</span>
                                <span><strong>Teléfono:</strong> <strong style="color: #2b6cb0; font-family: monospace; font-size: 1.05em;">${escapeHtml(p.telefono || "Sin número")}</strong></span>
                            </div>
                        </div>
                        <button onclick="marcarWhatsappAnadido('${escapeAttr(p.id)}')" style="background: #25D366; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-size: 0.85em; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s; flex-shrink: 0;" onmouseenter="this.style.background='#128C7E'" onmouseleave="this.style.background='#25D366'">
                            ✓ Añadido
                        </button>
                    </div>
                `;
            });
            
            html += `</div>`;
        }
    } else {
        if (countQuitar === 0) {
            html += `
                <div style="text-align: center; padding: 30px; color: #718096; font-size: 0.95em; background: white; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                    ✅ No hay colaboradores que deban ser retirados del grupo de WhatsApp en este momento.
                </div>
            `;
        } else {
            html += `
                <div style="margin-bottom: 10px; font-weight: bold; color: #9b2c2c; font-size: 0.9em;">
                    ⚠️ Deben salir del grupo (Tienen estado: Equipo, Libre o Finalizado) (${countQuitar})
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; max-height: 45vh; overflow-y: auto; padding-right: 4px;">
            `;
            
            personasQuitar.forEach(p => {
                html += `
                    <div class="late-worker-card" style="border-left: 5px solid #e53e3e; background: white; padding: 15px; border-radius: 8px; border: 1px solid #edf2f7; box-shadow: 0 1px 3px rgba(0,0,0,0.02); display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                        <div style="flex-grow: 1; min-width: 0;">
                            <div style="font-weight: bold; color: #2d3748; font-size: 0.98em; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                👤 <a href="/expediente/${p.id}" style="color: #173D2D; text-decoration: underline; font-weight: bold;">${escapeHtml(p.nombre)}</a>
                            </div>
                            <div style="font-size: 0.8em; color: #718096; display: flex; flex-wrap: wrap; gap: 8px 12px;">
                                <span><strong>Estado actual:</strong> <strong style="color: #c53030;">${escapeHtml(p.estado || "No definido")}</strong></span>
                                <span><strong>Departamento:</strong> ${escapeHtml(p.departamento || "No asignado")}</span>
                                <span><strong>Tutor:</strong> ${escapeHtml(p.tutor || "Sin tutor")}</span>
                                <span><strong>Teléfono:</strong> <strong style="color: #2b6cb0; font-family: monospace; font-size: 1.05em;">${escapeHtml(p.telefono || "Sin número")}</strong></span>
                            </div>
                        </div>
                        <button onclick="marcarWhatsappQuitado('${escapeAttr(p.id)}')" style="background: #e53e3e; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-size: 0.85em; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s; flex-shrink: 0;" onmouseenter="this.style.background='#c53030'" onmouseleave="this.style.background='#e53e3e'">
                            ✗ Quitado
                        </button>
                    </div>
                `;
            });
            
            html += `</div>`;
        }
    }
    
    modalBody.innerHTML = html;
}

function cerrarModalWhatsapp() {
    const modal = document.getElementById("modal-whatsapp");
    if (modal) {
        modal.style.display = "none";
        cancelarEdicionEnlaceWhatsapp();
    }
}

function toggleEditarEnlaceWhatsapp() {
    editandoEnlaceWhatsapp = !editandoEnlaceWhatsapp;
    
    const displayContainer = document.getElementById("link-display-container");
    const editContainer = document.getElementById("link-edit-container");
    const btnEditar = document.getElementById("btn-editar-link");
    
    if (editandoEnlaceWhatsapp) {
        if (displayContainer) displayContainer.style.display = "none";
        if (editContainer) editContainer.style.display = "flex";
        if (btnEditar) btnEditar.style.display = "none";
    } else {
        if (displayContainer) displayContainer.style.display = "flex";
        if (editContainer) editContainer.style.display = "none";
        if (btnEditar) btnEditar.style.display = "block";
    }
}

function cancelarEdicionEnlaceWhatsapp() {
    editandoEnlaceWhatsapp = false;
    const displayContainer = document.getElementById("link-display-container");
    const editContainer = document.getElementById("link-edit-container");
    const btnEditar = document.getElementById("btn-editar-link");
    
    if (displayContainer) displayContainer.style.display = "flex";
    if (editContainer) editContainer.style.display = "none";
    if (btnEditar) btnEditar.style.display = "block";
}

async function guardarEnlaceWhatsapp() {
    const input = document.getElementById("whatsapp-group-link-input");
    if (!input || !input.value.trim()) {
        alert("Por favor ingresa un enlace válido.");
        return;
    }
    
    const url = input.value.trim();
    try {
        const response = await fetch("/api/whatsapp/config", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ url: url })
        });
        
        const result = await response.json();
        if (response.ok && result.ok) {
            alert("Enlace del grupo guardado correctamente.");
            
            // Actualizar interfaz
            const textSpan = document.getElementById("whatsapp-group-link-text");
            const joinBtn = document.getElementById("whatsapp-join-btn");
            if (textSpan) textSpan.innerText = url;
            if (joinBtn) joinBtn.href = url;
            
            cancelarEdicionEnlaceWhatsapp();
        } else {
            alert("Error al guardar enlace: " + (result.error || "Error desconocido."));
        }
    } catch (err) {
        alert("Error de red: " + err.message);
    }
}

async function marcarWhatsappAnadido(id) {
    if (!confirm("¿Deseas marcar a este colaborador como añadido al grupo de WhatsApp y quitarlo de esta lista?")) {
        return;
    }
    
    try {
        const response = await fetch(`/api/trabajador/${id}/whatsapp_anadido`, {
            method: "POST"
        });
        
        const result = await response.json();
        
        if (response.ok && result.ok) {
            alert("Colaborador marcado como añadido exitosamente.");
            
            // Recargar datos y actualizar modal en vivo
            await loadDashboard(true);
            renderizarContenidoWhatsapp();
        } else {
            alert("Error al actualizar estado: " + (result.error || "Ocurrió un error inesperado."));
        }
    } catch (err) {
        alert("Error de red: " + err.message);
    }
}

async function marcarWhatsappQuitado(id) {
    if (!confirm("¿Deseas marcar a este colaborador como retirado/salido del grupo de WhatsApp y quitarlo de esta lista?")) {
        return;
    }
    
    try {
        const response = await fetch(`/api/trabajador/${id}/whatsapp_quitado`, {
            method: "POST"
        });
        
        const result = await response.json();
        
        if (response.ok && result.ok) {
            alert("Colaborador marcado como retirado del grupo exitosamente.");
            
            // Recargar datos y actualizar modal en vivo
            await loadDashboard(true);
            renderizarContenidoWhatsapp();
        } else {
            alert("Error al actualizar estado: " + (result.error || "Ocurrió un error inesperado."));
        }
    } catch (err) {
        alert("Error de red: " + err.message);
    }
}

async function abrirModalSemaforo(color) {
    const modal = document.getElementById("modal-semaforo");
    const modalTitle = document.getElementById("modal-semaforo-titulo");
    const modalBody = document.getElementById("modal-semaforo-body");
    
    if (!modal || !modalTitle || !modalBody) return;
    
    let colorTexto = "";
    let colorBorder = "";
    let colorBadge = "";
    let colorBadgeBg = "";
    let emoji = "";
    
    if (color === "ROJO") {
        colorTexto = "Código Rojo";
        colorBorder = "#e53e3e";
        colorBadge = "#e53e3e";
        colorBadgeBg = "#fff5f5";
        emoji = "🔴";
    } else if (color === "AMARILLO") {
        colorTexto = "Código Amarillo";
        colorBorder = "#dd6b20";
        colorBadge = "#dd6b20";
        colorBadgeBg = "#fffaf0";
        emoji = "🟡";
    } else if (color === "VERDE") {
        colorTexto = "Código Verde";
        colorBorder = "#38a169";
        colorBadge = "#38a169";
        colorBadgeBg = "#f0fff4";
        emoji = "🟢";
    }
    
    modalTitle.innerHTML = `${emoji} Personas - ${colorTexto}`;
    modalBody.innerHTML = `<p class="empty" style="text-align: center; padding: 20px; font-weight: bold; color: #4a5568;">Cargando...</p>`;
    modal.style.display = "flex";
    
    try {
        const res = await fetch("/api/personas");
        const personas = await res.json();
        
        // Filtrar personas activas y del color seleccionado
        const filtradas = personas.filter(p => {
            const estadoNorm = String(p.estado || "").toUpperCase().trim();
            const esActivo = !["EQUIPO", "FINALIZADO", "TERMINADO", "NO APTO"].includes(estadoNorm);
            return esActivo && String(p.color_code).toUpperCase() === color;
        });
        
        if (filtradas.length === 0) {
            modalBody.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #718096;">
                    <p style="font-weight: bold;">No hay personas en este grupo actualmente.</p>
                </div>
            `;
            return;
        }
        
        let html = "";
        filtradas.forEach(p => {
            html += `
                <div class="late-worker-card" style="border-left: 5px solid ${colorBorder}; margin-bottom: 15px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div class="late-worker-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2f7; padding-bottom: 10px; margin-bottom: 10px;">
                        <span class="late-worker-name" style="font-size: 1.05em; font-weight: 700; color: #2d3748;">
                            👤 <a href="/expediente/${p.id}" target="_blank" style="color: #173D2D; text-decoration: underline; font-weight: bold;">${escapeHtml(p.nombre)}</a>
                        </span>
                        <span style="background: ${colorBadgeBg}; color: ${colorBadge}; border: 1px solid ${colorBorder}; font-weight: 800; font-size: 0.78em; padding: 4px 10px; border-radius: 8px; letter-spacing: 0.5px;">${colorTexto}</span>
                    </div>
                    <div style="font-size: 0.88em; color: #4a5568; display: flex; flex-direction: column; gap: 6px;">
                        <div><strong>Departamento:</strong> ${escapeHtml(p.departamento || "No asignado")}</div>
                        <div><strong>Estado actual:</strong> ${escapeHtml(p.estado || "No definido")}</div>
                        <div><strong>Días en seguimiento:</strong> ${p.dias || "0"} días</div>
                        <div style="margin-top: 5px; display: flex; gap: 15px; background: #f7fafc; padding: 8px; border-radius: 6px; border: 1px solid #edf2f7;">
                            <div><strong>Rendimiento:</strong> <span style="font-weight: bold; color: ${colorBadge};">${p.productividad_ultimo_dia || "-"}</span></div>
                            <div><strong>Líneas/Hora:</strong> <span>${p.productividad_media || "-"}</span></div>
                            <div><strong>Errores hoy:</strong> <span style="font-weight: bold; color: ${parseInt(p.error_ultimo_dia) > 0 ? '#e53e3e' : '#4a5568'}">${p.error_ultimo_dia || "0"}</span></div>
                        </div>
                    </div>
                </div>
            `;
        });
        modalBody.innerHTML = html;
    } catch (err) {
        console.error(err);
        modalBody.innerHTML = `<p style="color: red; text-align: center; padding: 20px;">Error al cargar datos.</p>`;
    }
}

function cerrarModalSemaforo() {
    const modal = document.getElementById("modal-semaforo");
    if (modal) {
        modal.style.display = "none";
    }
}

// ======================================================
// REGISTRO DE FORMACIÓN INTERACTIVO
// ======================================================
let formadoresListCache = null;

async function abrirModalCompletarFormacion(id, nombre) {
    const modal = document.getElementById("modal-completar-formacion");
    if (!modal) return;
    
    // Rellenar ID y Nombre
    document.getElementById("form-formacion-id").value = id;
    document.getElementById("form-formacion-nombre").value = nombre;
    
    // Rellenar fecha actual (por defecto)
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    document.getElementById("form-formacion-fecha").value = `${yyyy}-${mm}-${dd}`;
    
    // Rellenar reset
    document.getElementById("form-formacion-tipo").selectedIndex = 0;
    document.getElementById("form-formacion-duracion").value = "1:00";
    document.getElementById("form-formacion-observaciones").value = "";
    
    // Cargar formadores en el dropdown
    const selectFormador = document.getElementById("form-formacion-formador");
    if (selectFormador) {
        selectFormador.innerHTML = '<option value="">Cargando formadores...</option>';
        try {
            if (!formadoresListCache) {
                const res = await fetch("/api/formadores");
                formadoresListCache = await res.json();
            }
            
            selectFormador.innerHTML = '<option value="">Selecciona un formador...</option>';
            formadoresListCache.forEach(f => {
                const opt = document.createElement("option");
                opt.value = f.nombre;
                opt.textContent = `${f.nombre} (${f.codigo})`;
                selectFormador.appendChild(opt);
            });
        } catch (err) {
            console.error("Error al cargar formadores:", err);
            selectFormador.innerHTML = '<option value="">Error al cargar formadores</option>';
        }
    }
    
    modal.style.display = "flex";
}

function cerrarModalCompletarFormacion() {
    const modal = document.getElementById("modal-completar-formacion");
    if (modal) {
        modal.style.display = "none";
    }
}

async function guardarRegistroFormacion(event) {
    event.preventDefault();
    
    const id = document.getElementById("form-formacion-id").value;
    const nombre = document.getElementById("form-formacion-nombre").value;
    const fechaVal = document.getElementById("form-formacion-fecha").value;
    const tipo = document.getElementById("form-formacion-tipo").value;
    const formador = document.getElementById("form-formacion-formador").value;
    const duracion = document.getElementById("form-formacion-duracion").value;
    const observaciones = document.getElementById("form-formacion-observaciones").value;
    
    if (!id || !nombre || !fechaVal || !tipo || !formador) {
        alert("Por favor rellena todos los campos obligatorios.");
        return;
    }
    
    // Formatear fecha de YYYY-MM-DD a DD/MM/YYYY
    const parts = fechaVal.split("-");
    const fechaDmy = `${parts[2]}/${parts[1]}/${parts[0]}`;
    
    const payload = {
        id: id,
        nombre: nombre,
        fecha: fechaDmy,
        tipo_formacion: tipo,
        formador: formador,
        duracion: duracion,
        observaciones: observaciones
    };
    
    const btnSubmit = event.target.querySelector('button[type="submit"]');
    const originalText = btnSubmit ? btnSubmit.textContent : "Guardar Registro";
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = "⏳ Registrando...";
    }
    
    try {
        const response = await fetch("/api/trabajador/registrar_formacion", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (response.ok && result.ok) {
            alert("Formación registrada correctamente en Google Sheets.");
            cerrarModalCompletarFormacion();
            await loadDashboard(true); // Forzar refresco
        } else {
            alert("Error al registrar formación: " + (result.error || "Error desconocido."));
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.textContent = originalText;
            }
        }
    } catch (err) {
        alert("Error de conexión: " + err.message);
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = originalText;
        }
    }
}


// ======================================================
// INTEGRACIONES DASHBOARD PRO
// ======================================================

let alertasSheets = [];
let alertasOvertime = [];
let alertasTardiness = [];

function renderFunnel(personas) {
    const onboarding = personas.filter(p => (parseInt(p.dias) || 0) <= 5);
    const curva = personas.filter(p => (parseInt(p.dias) || 0) > 5 && (parseInt(p.dias) || 0) <= 17);
    const hito21 = personas.filter(p => (parseInt(p.dias) || 0) >= 18 && (parseInt(p.dias) || 0) <= 21);
    const final = personas.filter(p => (parseInt(p.dias) || 0) > 21);
    
    const countOnboarding = document.getElementById("count-onboarding");
    if (countOnboarding) countOnboarding.textContent = onboarding.length;
    
    const countCurva = document.getElementById("count-curva");
    if (countCurva) countCurva.textContent = curva.length;
    
    const countHito21 = document.getElementById("count-hito21");
    if (countHito21) countHito21.textContent = hito21.length;
    
    const countFinal = document.getElementById("count-final");
    if (countFinal) countFinal.textContent = final.length;
}

function calcularAlertasSheets(personas) {
    alertasSheets = [];
    
    personas.forEach(p => {
        if ((parseInt(p.dias) || 0) > 31) return;
        const prod = parseFloat(String(p.productividad_media || "0").replace("%", "")) || 0;
        const err = parseFloat(String(p.error_medio || "0").replace("%", "")) || 0;
        const dias = parseInt(p.dias) || 0;
        const prodUlt = parseFloat(String(p.productividad_ultimo_dia || "0").replace("%", "")) || 0;
        const errUlt = parseFloat(String(p.error_ultimo_dia || "0").replace("%", "")) || 0;
        
        // Alerta de Rendimiento
        if (prod < 75 || prodUlt < 70) {
            alertasSheets.push({
                workerId: p.id,
                workerName: p.nombre,
                type: "performance",
                badgeText: "Desempeño",
                text: `Rendimiento bajo acumulado (${p.productividad_media || "0%"}) o en último día (${p.productividad_ultimo_dia || "0%"}).`
            });
        }
        
        // Alerta de Calidad
        if (err > 1.2 || errUlt > 1.5) {
            alertasSheets.push({
                workerId: p.id,
                workerName: p.nombre,
                type: "quality",
                badgeText: "Calidad",
                text: `Tasa de errores por encima de la tolerancia (${p.error_medio || "0%"}) o en último día (${p.error_ultimo_dia || "0%"}).`
            });
        }
        
        // Alerta de Checklist (Sólo los primeros 3 días de onboarding)
        if (dias <= 3 && dias > 0) {
            const pendingFields = [];
            const checklistFields = {
                "rrhh": "RRHH", 
                "almuerzo": "Almuerzo", 
                "uniforme": "Uniforme", 
                "psicotecnico": "Psicotécnico", 
                "formacion": "Bienvenida", 
                "tour": "Tour", 
                "pda": "PDA"
            };
            for (const [key, label] of Object.entries(checklistFields)) {
                const val = String(p[key] || "").toUpperCase().trim();
                if (val !== "SÍ" && val !== "SI" && val !== "TRUE" && val !== "1" && val !== "OK") {
                    pendingFields.push(label);
                }
            }
            if (pendingFields.length > 0) {
                alertasSheets.push({
                    workerId: p.id,
                    workerName: p.nombre,
                    type: "checklist",
                    badgeText: "Checklist",
                    text: `Pendiente completar: ${pendingFields.slice(0, 3).join(", ")}${pendingFields.length > 3 ? "..." : ""}.`
                });
            }
        }
    });
    
    renderCombinedAlerts();
}

async function loadOvertimeAlerts() {
    try {
        const res = await fetch("/api/dashboard-pro/overtime-alerts");
        const alerts = await res.json();
        
        alertasOvertime = alerts.map(a => ({
            workerId: a.workerId,
            workerName: a.workerName,
            type: "arrival",
            badgeText: a.badgeText,
            text: a.text
        }));
        
        renderCombinedAlerts();
    } catch (e) {
        console.error("Error cargando alertas de exceso de horas:", e);
    }
}

function renderCombinedAlerts() {
    const container = document.getElementById("alerts-container");
    if (!container) return;

    const mappedSeguimiento = (alertasSeguimiento || []).map(a => {
        let alertType = "arrival";
        if (a.motivo === "Rendimiento" || a.motivo === "Calidad") {
            alertType = "performance";
        }
        return {
            workerId: a.id_persona,
            workerName: a.nombre,
            type: alertType,
            badgeText: "Seguimiento",
            text: `Revisión: ${a.descripcion} (Plan: ${a.tipo}. Han pasado ${a.dias_transcurridos} días de su rechequeo).`
        };
    });
    
    const todasLasAlertas = [...alertasSheets, ...alertasOvertime, ...alertasTardiness, ...mappedSeguimiento];
    
    if (todasLasAlertas.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #27ae60; padding: 40px 10px; font-weight: bold; font-size: 0.95em;">
                ✅ ¡No hay alertas críticas hoy! Todo funciona según lo esperado.
            </div>
        `;
        return;
    }
    
    const escapeHtml = (val) => String(val || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // Agrupar alertas por categorías
    const catQuality = todasLasAlertas.filter(a => a.type === "quality" || a.type === "performance");
    const catChecklist = todasLasAlertas.filter(a => a.type === "checklist");
    const catArrival = todasLasAlertas.filter(a => a.type === "arrival");
    const catOther = todasLasAlertas.filter(a => a.type !== "quality" && a.type !== "performance" && a.type !== "checklist" && a.type !== "arrival");
    
    function renderColumn(title, list, bgColor, borderColor, icon) {
        const count = list.length;
        const countBadge = count > 0 
            ? `<span class="badge" style="background: #ffe8e5; color: #d84b3f; padding: 2px 8px; border-radius: 999px; font-size: 0.8em; font-weight: bold;">${count}</span>` 
            : `<span class="badge" style="background: #edf4ef; color: #27ae60; padding: 2px 8px; border-radius: 999px; font-size: 0.8em; font-weight: bold;">0</span>`;
        
        let itemsHtml = "";
        if (count === 0) {
            itemsHtml = `<div style="text-align: center; color: #a0aec0; font-size: 0.78em; padding: 30px 10px; font-style: italic;">Sin alertas</div>`;
        } else {
            itemsHtml = list.map(a => `
                <div class="alert-card" style="background: #ffffff; border: 1px solid #eef3f0; border-radius: 10px; padding: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <strong style="font-size: 0.88em; color: #173D2D; cursor: pointer; text-decoration: underline;" onclick="abrirExpediente('${a.workerId}')">
                            ${escapeHtml(a.workerName)}
                        </strong>
                        <span style="font-size: 0.68em; background: #ffeeb3; color: #856404; padding: 2px 6px; border-radius: 4px; font-weight: bold; white-space: nowrap;">
                            ${escapeHtml(a.badgeText)}
                        </span>
                    </div>
                    <p style="margin: 0; font-size: 0.78em; color: #4a5568; line-height: 1.4;">
                        ${escapeHtml(a.text)}
                    </p>
                    <button class="alert-action-btn" onclick="abrirExpediente('${a.workerId}')" style="align-self: flex-end; padding: 4px 8px; font-size: 0.75em; border-radius: 6px; background: #173D2D; color: #fff; border: none; cursor: pointer; font-weight: bold; transition: opacity 0.2s;">
                        🔍 Ver Ficha
                    </button>
                </div>
            `).join("");
        }
        
        return `
            <div class="kanban-alert-column" style="background: ${bgColor}; border: 1.5px solid ${borderColor}; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; min-height: 180px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${borderColor}; padding-bottom: 8px; margin-bottom: 4px;">
                    <strong style="color: #173D2D; font-size: 0.88em; display: flex; align-items: center; gap: 6px;">${icon} ${title}</strong>
                    ${countBadge}
                </div>
                <div class="kanban-alert-list" style="flex: 1; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; max-height: 380px; padding-right: 4px;">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }

    let boardHtml = `
        <div class="alerts-kanban-board" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; width: 100%;">
            ${renderColumn("Rendimiento y Calidad", catQuality, "#fbfdfc", "#edf4ef", "📈")}
            ${renderColumn("Onboarding y Checklist", catChecklist, "#fffcf8", "#f7edd0", "📋")}
            ${renderColumn("Horarios y Fichajes", [...catArrival, ...catOther], "#f6faff", "#d0e2f0", "⏱️")}
        </div>
    `;
    
    container.innerHTML = boardHtml;
}

function renderMonitor(personas) {
    const container = document.getElementById("monitor-container");
    if (!container) return;
    
    const activos = personas.filter(p => (parseInt(p.dias) || 0) <= 31);
    
    if (activos.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #718096; padding-top: 50px; font-style: italic;">
                No hay operarios activos registrados hoy.
            </div>
        `;
        return;
    }
    
    container.innerHTML = activos.map(p => `
        <div class="monitor-item">
            <div class="monitor-worker-info">
                <h4 style="cursor: pointer; text-decoration: underline;" onclick="abrirExpediente('${p.id}')">${p.nombre}</h4>
                <span>Dep: <strong>${p.departamento || "-"}</strong> | Día: <strong>${p.dias || "0"}</strong></span>
            </div>
            
            <div class="monitor-stats">
                <div class="monitor-stat-box">
                    <div class="monitor-stat-label">Prod</div>
                    <div class="monitor-stat-val" style="color: ${parseFloat(String(p.productividad_media).replace("%", "")) < 80 ? '#c0392b' : '#27ae60'};">
                        ${p.productividad_media || "-"}
                    </div>
                </div>
                <div class="monitor-stat-box">
                    <div class="monitor-stat-label">Error</div>
                    <div class="monitor-stat-val" style="color: ${parseFloat(String(p.error_medio).replace("%", "")) > 1.2 ? '#c0392b' : '#2d3748'};">
                        ${p.error_medio || "-"}
                    </div>
                </div>
            </div>
            
            <div class="monitor-actions">
                <button class="btn-live-pda" onclick="abrirModalAlertaPda('${p.id}', '${p.nombre.replace("'", "\\'")}')">⚡ Alerta PDA</button>
            </div>
        </div>
    `).join("");
}

async function loadTrainingStats() {
    try {
        const res = await fetch("/api/dashboard-pro/stats");
        const data = await res.json();
        
        if (!data.ok) return;
        
        const dineroPerdido = document.getElementById("txt-dinero-perdido");
        if (dineroPerdido) dineroPerdido.textContent = data.impacto_economico.dinero_perdido || "0,00 €";
        
        const horasPerdidas = document.getElementById("txt-horas-perdidas");
        if (horasPerdidas) horasPerdidas.textContent = (data.impacto_economico.horas_perdidas || "0:00") + " horas perdidas";
        
        const agendaContainer = document.getElementById("agenda-container");
        if (agendaContainer) {
            const clases = data.agenda || [];
            if (clases.length === 0) {
                agendaContainer.innerHTML = `
                    <div style="text-align: center; color: #718096; padding-top: 50px; font-style: italic;">
                        📅 No hay clases de formación programadas en la agenda.
                    </div>
                `;
            } else {
                clases.sort((a, b) => a.estado.localeCompare(b.estado) || a.hora.localeCompare(b.hora));
                agendaContainer.innerHTML = `
                    <table style="width:100%; border-collapse: collapse; font-size: 0.88em; text-align: left;">
                        <thead>
                            <tr style="border-bottom: 2px solid #edf2f7; color: #718096; font-weight: bold; background: #fafbfc;">
                                <th style="padding: 10px;">Alumno</th>
                                <th style="padding: 10px;">Fecha / Hora</th>
                                <th style="padding: 10px;">Tipo Clase</th>
                                <th style="padding: 10px;">Formador</th>
                                <th style="padding: 10px;">Aula</th>
                                <th style="padding: 10px; text-align: center;">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${clases.map(c => {
                                const isPend = String(c.estado).toLowerCase().includes("pend");
                                const badgeColor = isPend ? "#fff3cd" : "#d4edda";
                                const badgeTextColor = isPend ? "#856404" : "#155724";
                                return `
                                    <tr style="border-bottom: 1px solid #edf2f7; hover: background: #fafbfc;">
                                        <td style="padding: 10px; font-weight: bold; color: #173D2D;">
                                            ${c.nombre || "Sin nombre"}
                                            <span style="font-size: 0.75em; color: #718096; display: block; font-weight: normal;">ID: ${c.id_trabajador || "-"}</span>
                                        </td>
                                        <td style="padding: 10px;">${c.fecha || "-"} <strong style="color: #2b6cb0;">${c.hora || "-"}</strong></td>
                                        <td style="padding: 10px;">${c.tipo_formacion || "-"}</td>
                                        <td style="padding: 10px; font-weight: 500;">👤 ${c.formador || "-"}</td>
                                        <td style="padding: 10px;">${c.aula || "-"}</td>
                                        <td style="padding: 10px; text-align: center;">
                                            <span style="background: ${badgeColor}; color: ${badgeTextColor}; padding: 4px 8px; border-radius: 20px; font-size: 0.8em; font-weight: bold; text-transform: uppercase;">
                                                ${c.estado}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join("")}
                        </tbody>
                    </table>
                `;
            }
        }
        
        const formadoresContainer = document.getElementById("formadores-container");
        if (formadoresContainer) {
            const formadores = data.formadores || [];
            if (formadores.length === 0) {
                formadoresContainer.innerHTML = `
                    <div style="text-align: center; color: #718096; padding-top: 20px; font-style: italic;">
                        No hay formadores registrados.
                    </div>
                `;
            } else {
                formadoresContainer.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${formadores.map(f => `
                            <div style="background: #fafbfc; border: 1px solid #edf2f7; border-radius: 10px; padding: 12px; display: flex; align-items: center; justify-content: space-between;">
                                <div>
                                    <h4 style="margin: 0; font-size: 0.92em; font-weight: bold; color: #2d3748;">👤 ${f.nombre}</h4>
                                    <span style="font-size: 0.75em; color: #718096; display: block; margin-top: 2px;">
                                        Código formador: <strong>${f.letra || "-"}</strong>
                                    </span>
                                </div>
                                <div style="display: flex; gap: 15px; text-align: right;">
                                    <div>
                                        <div style="font-size: 0.65em; color: #a0aec0; text-transform: uppercase;">Hrs Cámara</div>
                                        <div style="font-size: 0.88em; font-weight: bold; color: #173D2D;">${f.horas_camara}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 0.65em; color: #a0aec0; text-transform: uppercase;">Hrs Aula</div>
                                        <div style="font-size: 0.88em; font-weight: bold; color: #2b6cb0;">${f.horas_aula}</div>
                                    </div>
                                </div>
                            </div>
                        `).join("")}
                    </div>
                `;
            }
        }
    } catch (e) {
        console.error("Error al cargar estadísticas de formación:", e);
    }
}

function abrirModalAlertaPda(id, name) {
    const modal = document.getElementById("modal-alerta-pda");
    if (!modal) return;
    document.getElementById("pda-worker-id").value = id;
    document.getElementById("pda-worker-name").value = name;
    document.getElementById("pda-alert-message").value = "";
    modal.style.display = "flex";
}

function cerrarModalAlertaPda() {
    const modal = document.getElementById("modal-alerta-pda");
    if (modal) modal.style.display = "none";
}

async function enviarAlertaPdaAccion() {
    const id = document.getElementById("pda-worker-id").value;
    const message = document.getElementById("pda-alert-message").value;
    if (!message || !message.trim()) {
        alert("Por favor, introduce el mensaje para enviar a la PDA.");
        return;
    }
    try {
        const res = await fetch(`/api/trabajador/${id}/observaciones`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                comentario: message,
                tipo: "Urgente",
                visible_rrhh: "SÍ",
                autor_id: "falbert",
                enviar_salix: true
            })
        });
        const result = await res.json();
        if (res.ok && result.ok) {
            alert("¡Alerta PDA enviada correctamente!");
            cerrarModalAlertaPda();
            loadDashboard(true);
        } else {
            alert("Error al enviar alerta PDA: " + (result.error || "Ocurrió un error inesperado."));
        }
    } catch (e) {
        alert("Error de red al enviar la alerta: " + e.message);
    }
}

async function forzarSincronizacionCompleta() {
    const btn = document.getElementById("btn-sync-bajas");
    const originalText = btn ? btn.innerHTML : "🔄 Sincronizar Salix y Deptos";
    if (!confirm("¿Deseas sincronizar los departamentos y las bajas de Salix con Google Sheets ahora?")) {
        return;
    }
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "⏳ Sincronizando Departamentos...";
            btn.style.background = "#718096";
            btn.style.color = "#ffffff";
        }
        
        let depMsg = "Sincronización de departamentos: ";
        try {
            const resDep = await fetch("/api/personas/sincronizar-departamentos", { method: "POST" });
            const resDepJson = await resDep.json();
            if (resDep.ok && resDepJson.ok) {
                depMsg += "✅ Éxito.";
            } else {
                depMsg += "❌ Error: " + (resDepJson.error || "Desconocido");
            }
        } catch (e) {
            depMsg += "❌ Error de red: " + e.message;
        }

        if (btn) {
            btn.innerHTML = "⏳ Sincronizando Bajas Salix...";
        }
        
        let bajasMsg = "Sincronización de bajas: ";
        try {
            const resBajas = await fetch("/api/personas/sincronizar-bajas", { method: "POST" });
            const resBajasJson = await resBajas.json();
            if (resBajas.ok && resBajasJson.ok) {
                bajasMsg += "✅ Éxito. Filas actualizadas: " + resBajasJson.actualizados;
            } else {
                bajasMsg += "❌ Error: " + (resBajasJson.error || "Desconocido");
            }
        } catch (e) {
            bajasMsg += "❌ Error de red: " + e.message;
        }

        alert(`${depMsg}\n\n${bajasMsg}`);
        loadDashboard(true);
    } catch (e) {
        alert("Ocurrió un error inesperado: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.style.background = "#ebf8ff";
            btn.style.color = "#2b6cb0";
        }
    }
}


async function abrirModalFase(fase) {
    const modal = document.getElementById("modal-semaforo");
    const modalTitle = document.getElementById("modal-semaforo-titulo");
    const modalBody = document.getElementById("modal-semaforo-body");
    
    if (!modal || !modalTitle || !modalBody) return;
    
    let faseTitle = "";
    let faseColor = "";
    let filterFn = null;
    
    if (fase === 1) {
        faseTitle = "Fase 1: Onboarding (D1-D5)";
        faseColor = "#3182ce";
        filterFn = p => (parseInt(p.dias) || 0) <= 5;
    } else if (fase === 2) {
        faseTitle = "Fase 2: Curva (D6-D17)";
        faseColor = "#dd6b20";
        filterFn = p => (parseInt(p.dias) || 0) > 5 && (parseInt(p.dias) || 0) <= 17;
    } else if (fase === 3) {
        faseTitle = "Fase 3: Hito 21d (D18-D21)";
        faseColor = "#e53e3e";
        filterFn = p => (parseInt(p.dias) || 0) >= 18 && (parseInt(p.dias) || 0) <= 21;
    } else if (fase === 4) {
        faseTitle = "Fase 4: Final (D22-D31)";
        faseColor = "#2f855a";
        filterFn = p => (parseInt(p.dias) || 0) > 21;
    }
    
    modalTitle.innerHTML = `📋 ${faseTitle}`;
    modalBody.innerHTML = `<p class="empty" style="text-align: center; padding: 20px; font-weight: bold; color: #4a5568;">Cargando...</p>`;
    modal.style.display = "flex";
    
    try {
        const res = await fetch("/api/personas");
        const personas = await res.json();
        
        // Filtrar personas activas que cumplan la condición de la fase
        const filtradas = personas.filter(p => {
            const estadoNorm = String(p.estado || "").toUpperCase().trim();
            const esActivo = !["EQUIPO", "FINALIZADO", "TERMINADO", "NO APTO"].includes(estadoNorm);
            return esActivo && filterFn(p);
        });
        
        if (filtradas.length === 0) {
            modalBody.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #718096;">
                    <p style="font-weight: bold;">No hay personas en esta fase del embudo actualmente.</p>
                </div>
            `;
            return;
        }
        
        let html = "";
        filtradas.forEach(p => {
            html += `
                <div class="late-worker-card" style="border-left: 5px solid ${faseColor}; margin-bottom: 15px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div class="late-worker-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2f7; padding-bottom: 10px; margin-bottom: 10px;">
                        <span class="late-worker-name" style="font-size: 1.05em; font-weight: 700; color: #2d3748;">
                            👤 <a href="/expediente/${p.id}" target="_blank" style="color: #173D2D; text-decoration: underline; font-weight: bold;">${escapeHtml(p.nombre)}</a>
                        </span>
                        <span style="background: #fafbfc; color: ${faseColor}; border: 1px solid ${faseColor}; font-weight: 800; font-size: 0.78em; padding: 4px 10px; border-radius: 8px; letter-spacing: 0.5px;">Día ${p.dias || "0"}</span>
                    </div>
                    <div style="font-size: 0.88em; color: #4a5568; display: flex; flex-direction: column; gap: 6px;">
                        <div><strong>Departamento:</strong> ${escapeHtml(p.departamento || "No asignado")}</div>
                        <div><strong>Tutor:</strong> ${escapeHtml(p.tutor || "Sin tutor")}</div>
                        <div style="margin-top: 5px; display: flex; gap: 15px; background: #f7fafc; padding: 8px; border-radius: 6px; border: 1px solid #edf2f7;">
                            <div><strong>Rendimiento:</strong> <span style="font-weight: bold; color: #173D2D;">${p.productividad_media || "-"}</span></div>
                            <div><strong>Último día:</strong> <span>${p.productividad_ultimo_dia || "-"}</span></div>
                            <div><strong>Error Medio:</strong> <span style="font-weight: bold; color: ${parseFloat(String(p.error_medio).replace("%","")) > 1.2 ? '#e53e3e' : '#4a5568'}">${p.error_medio || "0%"}</span></div>
                        </div>
                    </div>
                </div>
            `;
        });
        modalBody.innerHTML = html;
    } catch (err) {
        console.error("Error al abrir modal de fase:", err);
        modalBody.innerHTML = `<p style="text-align: center; color: #e53e3e; padding: 20px; font-weight: bold;">Error al cargar datos.</p>`;
    }
}


async function renderNotasSacadoresChart() {
    const canvas = document.getElementById("chartNotasSacadores");
    const noDataMsg = document.getElementById("chart-no-data-msg");
    if (!canvas) return;
    
    try {
        const res = await fetch("/api/personas");
        const personas = await res.json();
        
        // Filtrar personas con nota válida en departamentos de sacadores o taller natural
        const sacadores = personas.filter(p => {
            const depto = String(p.departamento || "").toUpperCase().trim();
            return (depto.includes("SACADO") || depto.includes("TALLER NATURAL")) && p.nota !== undefined && p.nota !== null && p.nota > 0;
        });
        
        // Ordenar de mayor a menor nota
        sacadores.sort((a, b) => b.nota - a.nota);
        
        if (sacadores.length === 0) {
            canvas.style.display = "none";
            if (noDataMsg) noDataMsg.style.display = "block";
            return;
        }
        
        canvas.style.display = "block";
        if (noDataMsg) noDataMsg.style.display = "none";
        
        const labels = sacadores.map(p => p.nombre.split(" ").slice(0, 2).join(" ")); // Solo primer nombre y apellido
        const dataValues = sacadores.map(p => parseFloat(p.nota.toFixed(2)));
        
        // Generar colores basados en la nota
        const backgroundColors = sacadores.map(p => {
            const n = p.nota;
            if (n >= 7.0) return "rgba(39, 174, 96, 0.75)"; // Verde
            if (n >= 5.0) return "rgba(214, 161, 0, 0.75)"; // Amarillo / Ámbar
            return "rgba(229, 62, 62, 0.75)"; // Rojo
        });
        
        const borderColors = sacadores.map(p => {
            const n = p.nota;
            if (n >= 7.0) return "#27ae60";
            if (n >= 5.0) return "#d6a100";
            return "#e53e3e";
        });
        
        if (chartNotasSacadoresInstance) {
            chartNotasSacadoresInstance.destroy();
        }
        
        const ctx = canvas.getContext("2d");
        chartNotasSacadoresInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Nota de Sacador (0 - 10)',
                    data: dataValues,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1.5,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Nota: ${context.parsed.y} / 10`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        min: 0,
                        max: 10,
                        ticks: {
                            stepSize: 1,
                            font: {
                                weight: 'bold'
                            }
                        },
                        grid: {
                            color: "rgba(0, 0, 0, 0.05)"
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: {
                                size: 10,
                                weight: 'bold'
                            }
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error("Error al renderizar gráfico de notas de sacadores:", err);
        if (noDataMsg) {
            noDataMsg.textContent = "Error al cargar datos del gráfico.";
            noDataMsg.style.display = "block";
        }
        if (canvas) canvas.style.display = "none";
    }
}


function switchTab(evt, tabId) {
    // Ocultar todos los contenidos de pestañas
    document.querySelectorAll(".tab-content").forEach(el => {
        el.style.display = "none";
    });
    // Mostrar el contenido de la pestaña seleccionada
    const tabEl = document.getElementById(tabId);
    if (tabEl) {
        tabEl.style.display = "block";
    }

    // Actualizar estilos activos de los botones
    document.querySelectorAll(".tab-btn").forEach(el => {
        el.classList.remove("active");
        el.style.color = "#718096";
        el.style.borderBottom = "none";
    });
    
    const targetBtn = evt ? evt.currentTarget : null;
    if (targetBtn) {
        targetBtn.classList.add("active");
        targetBtn.style.color = "#173D2D";
    }
}

