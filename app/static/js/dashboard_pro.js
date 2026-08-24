// ==========================================
// DASHBOARD PRO / IDEAL SCRIPT
// ==========================================

let todosLosTrabajadores = [];
let alertasSheets = [];
let alertasOvertime = [];

document.addEventListener("DOMContentLoaded", () => {
    loadDashboardPro();
});

async function loadDashboardPro() {
    try {
        const res = await fetch("/api/personas");
        todosLosTrabajadores = await res.json();
        
        renderKPIs(todosLosTrabajadores);
        renderFunnel(todosLosTrabajadores);
        
        // 1. Calcular y renderizar alertas del Google Sheets
        calcularAlertasSheets(todosLosTrabajadores);
        
        // 2. Renderizar Monitor de Planta
        renderMonitor(todosLosTrabajadores);
        
        // 3. Consultar y renderizar alertas de sobretiempo de fichajes
        await loadOvertimeAlerts();
        
        // 4. Consultar y renderizar agenda e impacto económico de formación
        await loadTrainingStats();
        
    } catch (e) {
        console.error("Error al cargar datos del Dashboard Pro:", e);
    }
}

// 1. KPIs SUPERIORES
function renderKPIs(personas) {
    const activos = personas.filter(p => p.estado === "Activo");
    document.getElementById("stat-operarios-activos").textContent = activos.length;
    
    // Horas de Formación (Suma del aula y camara)
    let totalMinutos = 0;
    activos.forEach(p => {
        const parseTiempo = (tiempoStr) => {
            if (!tiempoStr) return 0;
            const parts = String(tiempoStr).split(":");
            if (parts.length === 2) {
                return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
            }
            return 0;
        };
        totalMinutos += parseTiempo(p.formacion_aula);
        totalMinutos += parseTiempo(p.formacion_camara);
    });
    const totalHoras = Math.round((totalMinutos / 60) * 10) / 10;
    document.getElementById("stat-horas-formacion").textContent = totalHoras + "h";
    
    // Checklist Completados %
    let checksCompletados = 0;
    let checksTotales = 0;
    const checklistFields = ["rrhh", "almuerzo", "uniforme", "psicotecnico", "formacion", "tour", "pda"];
    
    activos.forEach(p => {
        checklistFields.forEach(field => {
            checksTotales++;
            const val = String(p[field] || "").toUpperCase().trim();
            if (val === "SÍ" || val === "SI" || val === "TRUE" || val === "1" || val === "OK") {
                checksCompletados++;
            }
        });
    });
    
    const checklistPct = checksTotales > 0 ? Math.round((checksCompletados / checksTotales) * 100) : 0;
    document.getElementById("stat-checklists-completados").textContent = checklistPct + "%";
}

// 2. EMBUDO / FUNNEL
function renderFunnel(personas) {
    const activos = personas.filter(p => p.estado === "Activo");
    
    const onboarding = activos.filter(p => (parseInt(p.dias) || 0) <= 5);
    const curva = activos.filter(p => (parseInt(p.dias) || 0) > 5 && (parseInt(p.dias) || 0) <= 17);
    const hito21 = activos.filter(p => (parseInt(p.dias) || 0) >= 18 && (parseInt(p.dias) || 0) <= 21);
    const final = activos.filter(p => (parseInt(p.dias) || 0) > 21);
    
    document.getElementById("count-onboarding").textContent = onboarding.length;
    document.getElementById("count-curva").textContent = curva.length;
    document.getElementById("count-hito21").textContent = hito21.length;
    document.getElementById("count-final").textContent = final.length;
}

// 3. CALCULAR ALERTAS DESDE GOOGLE SHEETS
function calcularAlertasSheets(personas) {
    const activos = personas.filter(p => p.estado === "Activo");
    alertasSheets = [];
    
    activos.forEach(p => {
        const prod = parseFloat(String(p.productividad_media || "0").replace("%", "")) || 0;
        const err = parseFloat(String(p.error_medio || "0").replace("%", "")) || 0;
        const dias = parseInt(p.dias) || 0;
        const prodUlt = parseFloat(String(p.productividad_ultimo_dia || "0").replace("%", "")) || 0;
        const errUlt = parseFloat(String(p.error_ultimo_dia || "0").replace("%", "")) || 0;
        
        // Alerta de Rendimiento (Desviación respecto a target 80 l/h)
        if (prod < 75 || prodUlt < 70) {
            alertasSheets.push({
                workerId: p.id,
                workerName: p.nombre,
                type: "performance",
                badgeText: "Desempeño",
                text: `Rendimiento bajo acumulado (${p.productividad_media || "0%"}) o en último día (${p.productividad_ultimo_dia || "0%"}).`
            });
        }
        
        // Alerta de Calidad (Tasa de error crítica)
        if (err > 1.2 || errUlt > 1.5) {
            alertasSheets.push({
                workerId: p.id,
                workerName: p.nombre,
                type: "quality",
                badgeText: "Calidad",
                text: `Tasa de errores por encima de la tolerancia (${p.error_medio || "0%"}) o en último día (${p.error_ultimo_dia || "0%"}).`
            });
        }
        
        // Alerta de Checklist Olvidado (Sólo los primeros 3 días de onboarding)
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

// 4. CARGAR ALERTAS DE SOBRETIEMPOS DESDE EL BACKEND
async function loadOvertimeAlerts() {
    try {
        const res = await fetch("/api/dashboard-pro/overtime-alerts");
        const alerts = await res.json();
        
        alertasOvertime = alerts.map(a => ({
            workerId: a.workerId,
            workerName: a.workerName,
            type: "arrival", // Reutiliza estilo de llegada (color azul) para horas extras
            badgeText: a.badgeText,
            text: a.text
        }));
        
        renderCombinedAlerts();
    } catch (e) {
        console.error("Error cargando alertas de exceso de horas:", e);
    }
}

// 5. RENDERIZAR TODAS LAS ALERTAS MEZCLADAS (FORMATO KANBAN POR CATEGORÍA)
function renderCombinedAlerts() {
    const container = document.getElementById("alerts-container");
    if (!container) return;
    
    const todasLasAlertas = [...alertasSheets, ...alertasOvertime];
    
    if (todasLasAlertas.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #27ae60; padding: 40px 10px; font-weight: bold; font-size: 0.95em;">
                ✅ ¡No hay alertas críticas hoy! Todo funciona según lo esperado.
            </div>
        `;
        document.getElementById("stat-alertas-criticas").textContent = "0";
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
                        <strong style="font-size: 0.88em; color: #173D2D; cursor: pointer; text-decoration: underline;" onclick="window.open('/expediente/${a.workerId}', '_blank')">
                            ${escapeHtml(a.workerName)}
                        </strong>
                        <span style="font-size: 0.68em; background: #ffeeb3; color: #856404; padding: 2px 6px; border-radius: 4px; font-weight: bold; white-space: nowrap;">
                            ${escapeHtml(a.badgeText)}
                        </span>
                    </div>
                    <p style="margin: 0; font-size: 0.78em; color: #4a5568; line-height: 1.4;">
                        ${escapeHtml(a.text)}
                    </p>
                    <button class="alert-action-btn" onclick="window.open('/expediente/${a.workerId}', '_blank')" style="align-self: flex-end; padding: 4px 8px; font-size: 0.75em; border-radius: 6px; background: #173D2D; color: #fff; border: none; cursor: pointer; font-weight: bold; transition: opacity 0.2s;">
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
    
    // Actualizar el KPI superior de Alertas Críticas
    document.getElementById("stat-alertas-criticas").textContent = todasLasAlertas.length;
}

// 6. MONITOR DE TRABAJADORES EN PLANTA
function renderMonitor(personas) {
    const container = document.getElementById("monitor-container");
    if (!container) return;
    
    const activos = personas.filter(p => p.estado === "Activo");
    
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
                <h4 style="cursor: pointer; text-decoration: underline;" onclick="window.open('/expediente/${p.id}', '_blank')">${p.nombre}</h4>
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

// 7. CARGAR ESTADÍSTICAS DE FORMACIÓN (HOJA DE AGENDA, FORMADORES E IMPACTO ECONÓMICO)
async function loadTrainingStats() {
    try {
        const res = await fetch("/api/dashboard-pro/stats");
        const data = await res.json();
        
        if (!data.ok) {
            console.error("Error al obtener estadísticas de formación:", data.error);
            return;
        }
        
        // 1. Poblar Impacto Económico
        document.getElementById("txt-dinero-perdido").textContent = data.impacto_economico.dinero_perdido || "0,00 €";
        document.getElementById("txt-horas-perdidas").textContent = (data.impacto_economico.horas_perdidas || "0:00") + " horas perdidas";
        
        // 2. Poblar Agenda de Clases
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
                // Ordenar por estado (Pendiente primero) y hora
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
        
        // 3. Poblar Ratios de los Formadores
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
                // Ordenar por horas de cámara (mayor a menor)
                formadoresContainer.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${formadores.map(f => {
                            return `
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
                            `;
                        }).join("")}
                    </div>
                `;
            }
        }
        
    } catch (e) {
        console.error("Error al cargar estadísticas de formación:", e);
    }
}

// 8. ACCIONES DE ALERTAS PDA (LIVEALERTS)
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
    if (modal) {
        modal.style.display = "none";
    }
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
            loadDashboardPro();
        } else {
            alert("Error al enviar alerta PDA: " + (result.error || "Ocurrió un error inesperado."));
        }
    } catch (e) {
        alert("Error de red al enviar la alerta: " + e.message);
    }
}

async function forzarSincronizacionBajas() {
    const btn = document.getElementById("btn-sync-bajas");
    const originalText = btn.innerHTML;
    
    if (!confirm("¿Deseas iniciar una revisión masiva y sincronizar las bajas de Salix con Google Sheets ahora?")) {
        return;
    }
    
    try {
        btn.disabled = true;
        btn.innerHTML = "⏳ Sincronizando...";
        btn.style.background = "#718096";
        
        const res = await fetch("/api/personas/sincronizar-bajas", { method: "POST" });
        const result = await res.json();
        
        if (res.ok && result.ok) {
            alert("Sincronización masiva de bajas con Salix realizada con éxito. Fila(s) actualizada(s): " + result.actualizados);
            loadDashboardPro();
        } else {
            alert("Error en la sincronización: " + (result.error || "Ocurrió un error inesperado."));
        }
    } catch (e) {
        alert("Error de red: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        btn.style.background = "#2b6cb0";
    }
}
