const id = window.location.pathname.split("/").pop();
let miGraficoGrafana = null;
let radarChartActitudinal = null;
let tipoGrafico = "general";

// Modelo ideal basado en el rendimiento de David Santiago Ballesteros Romero (ID: 52534)
// proyectado a 31 días con estabilidad sobre el 120% y errores <= 3%.
const MODELO_IDEAL = [
    { day: 1, prod: 64.3, error: 1.4 },
    { day: 2, prod: 72.5, error: 1.5 },
    { day: 3, prod: 90.0, error: 1.3 },
    { day: 4, prod: 87.7, error: 1.8 },
    { day: 5, prod: 97.4, error: 0.8 },
    { day: 6, prod: 99.9, error: 1.2 },
    { day: 7, prod: 103.5, error: 1.7 },
    { day: 8, prod: 105.5, error: 1.5 },
    { day: 9, prod: 107.5, error: 1.4 },
    { day: 10, prod: 109.5, error: 1.3 },
    { day: 11, prod: 111.2, error: 1.2 },
    { day: 12, prod: 112.8, error: 1.1 },
    { day: 13, prod: 114.2, error: 1.0 },
    { day: 14, prod: 115.5, error: 0.9 },
    { day: 15, prod: 116.6, error: 0.8 },
    { day: 16, prod: 117.5, error: 0.7 },
    { day: 17, prod: 118.2, error: 0.6 },
    { day: 18, prod: 118.8, error: 0.5 },
    { day: 19, prod: 119.3, error: 0.5 },
    { day: 20, prod: 119.6, error: 0.5 },
    { day: 21, prod: 119.8, error: 0.5 },
    { day: 22, prod: 119.9, error: 0.5 },
    { day: 23, prod: 120.0, error: 0.5 },
    { day: 24, prod: 120.0, error: 0.5 },
    { day: 25, prod: 120.0, error: 0.5 },
    { day: 26, prod: 120.0, error: 0.5 },
    { day: 27, prod: 120.0, error: 0.5 },
    { day: 28, prod: 120.0, error: 0.5 },
    { day: 29, prod: 120.0, error: 0.5 },
    { day: 30, prod: 120.0, error: 0.5 },
    { day: 31, prod: 120.0, error: 0.5 }
];

function getModeloIdealParaDia(day) {
    if (day <= 0) return { prod: 64.3, error: 1.4 };
    const idx = Math.min(day, MODELO_IDEAL.length) - 1;
    return MODELO_IDEAL[idx];
}

function recalcularFondoFicha(riesgo, chaleco) {
    const contentEl = document.querySelector(".content");
    if (!contentEl) return;
    
    const esRiesgoAlto = (riesgo || "").trim().toUpperCase() === "ALTO";
    const esChaleco = (chaleco || "").trim().toUpperCase() === "SÍ" || (chaleco || "").trim().toUpperCase() === "SI";
    const isDark = document.body.classList.contains("dark-mode");
    
    if (isDark) {
        if (esRiesgoAlto && esChaleco) {
            contentEl.style.background = "linear-gradient(135deg, #2e1065 0%, #451a1a 100%)";
        } else if (esRiesgoAlto) {
            contentEl.style.background = "#451a1a";
        } else if (esChaleco) {
            contentEl.style.background = "#2e1065";
        } else {
            contentEl.style.background = "#0b0f19";
        }
    } else {
        if (esRiesgoAlto && esChaleco) {
            contentEl.style.background = "linear-gradient(135deg, #f5f3ff 0%, #ffeef0 100%)";
        } else if (esRiesgoAlto) {
            contentEl.style.background = "#ffeef0";
        } else if (esChaleco) {
            contentEl.style.background = "#f5f3ff";
        } else {
            contentEl.style.background = "";
        }
    }
}

window.recalcularFondoFicha = recalcularFondoFicha;

async function cargarExpediente() {
    const contenedorGrafana = document.getElementById("timeline-container");
    if (contenedorGrafana) {
        contenedorGrafana.innerHTML = `
            <div class="panel" style="text-align: center; padding: 40px; background: #fff; border: 1px solid #edf2ee; border-radius: 14px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px;">
                <div class="loading-spinner" style="border: 4px solid #f3f3f3; border-top: 4px solid #173D2D; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;"></div>
                <p style="font-size: 0.9em; color: #666; margin: 0;">Cargando datos de rendimiento en tiempo real...</p>
            </div>
        `;
        if (!document.getElementById("spinner-style")) {
            const style = document.createElement("style");
            style.id = "spinner-style";
            style.innerHTML = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    const respuesta = await fetch("/api/persona/" + id);
    const persona = await respuesta.json();

    if (persona.error) {
        document.querySelector(".expediente").innerHTML = `
            <div class="panel">
                <h2>${persona.error}</h2>
            </div>
        `;
        return;
    }

    // Configurar e inyectar el checkbox de Chaleco
    const lblChaleco = document.getElementById("label-chaleco");
    const chkChaleco = document.getElementById("check-chaleco");
    if (lblChaleco && chkChaleco) {
        lblChaleco.style.display = "inline-flex";
        const esChaleco = (persona.chaleco || "").trim().toUpperCase() === "SÍ" || (persona.chaleco || "").trim().toUpperCase() === "SI";
        chkChaleco.checked = esChaleco;
        
        lblChaleco.dataset.riesgo = persona.riesgo || "BAJO";
        lblChaleco.dataset.chaleco = persona.chaleco || "NO";
        
        recalcularFondoFicha(persona.riesgo, persona.chaleco);

        chkChaleco.onchange = async function() {
            const valorCheck = chkChaleco.checked ? "SÍ" : "NO";
            lblChaleco.dataset.chaleco = valorCheck;
            
            recalcularFondoFicha(lblChaleco.dataset.riesgo, valorCheck);
            
            try {
                const res = await fetch("/api/persona/actualizar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: persona.id, campo: "chaleco", valor: valorCheck })
                });
                const data = await res.json();
                if (!data || !data.ok) {
                    alert(data.error || "No se pudo actualizar el estado del chaleco");
                    chkChaleco.checked = !chkChaleco.checked;
                    lblChaleco.dataset.chaleco = chkChaleco.checked ? "SÍ" : "NO";
                    recalcularFondoFicha(lblChaleco.dataset.riesgo, lblChaleco.dataset.chaleco);
                }
            } catch (err) {
                alert("Error de conexión al actualizar el chaleco");
                chkChaleco.checked = !chkChaleco.checked;
                lblChaleco.dataset.chaleco = chkChaleco.checked ? "SÍ" : "NO";
                recalcularFondoFicha(lblChaleco.dataset.riesgo, lblChaleco.dataset.chaleco);
            }
        };
    }

    //==================================================
    // CABECERA Y TARJETITAS
    //==================================================
    document.getElementById("nombrePersona").textContent = persona.nombre || "-";
    document.getElementById("id").textContent = persona.id || "-";
    document.getElementById("programa").textContent = persona.programa || "-";

    // Configurar enlaces externos en la cabecera
    const btnGrafana = document.getElementById("link-grafana");
    const btnSalix = document.getElementById("link-salix");
    
    if (btnGrafana) {
        let dashboardUid = "ec278d81-119f-4e08-8efe-f97efacdb211";
        let dashboardSlug = "control-rendimiento";
        const dept = (persona.departamento || "").toUpperCase();
        if (dept.includes("ENCAJADO")) {
            dashboardUid = "dc00c1f0-e799-448c-8462-29a8606a4158";
            dashboardSlug = "rendimiento-encajadores";
        }
        btnGrafana.href = `https://grafana.verdnatura.es/d/${dashboardUid}/${dashboardSlug}?var-workerFk=${persona.id}`;
        btnGrafana.style.display = "inline-flex";
    }
    
    if (btnSalix) {
        btnSalix.href = `https://salix.verdnatura.es/#/worker/${persona.id}/summary`;
        btnSalix.style.display = "inline-flex";
    }

    // Cargar la foto del trabajador desde Salix (Odoo) usando nuestro proxy backend
    const imgElement = document.querySelector(".foto img");
    if (imgElement && persona.id) {
        imgElement.src = `/api/trabajador/${persona.id}/foto`;
        imgElement.onerror = function() {
            this.src = "/static/img/avatar.png";
            this.onerror = null; // Evitar llamadas recurrentes en caso de fallo consecutivo
        };
    }

    const infoCabecera = document.getElementById("departamento"); 
    if (infoCabecera) {
        infoCabecera.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; align-items: center;">
                <span class="badge gris editable-badge" id="badge-departamento" data-campo="departamento" style="cursor: pointer;" title="Haga clic para cambiar el departamento">🏢 ${persona.departamento || "-"} ✏️</span>
                <span class="badge azul">📅 Entrada: ${persona.fecha_incorporacion || "-"}</span>
                <span class="badge azul">⏰ Hora: ${persona.hora_entrada || "-"}</span>
                <span class="badge naranja">⏳ Días seg.: ${persona.dias || "0"}</span>
                <span class="badge rojo editable-badge" id="badge-riesgo" data-campo="riesgo" style="cursor: pointer;" title="Haga clic para cambiar el nivel de riesgo">⚠️ Riesgo: ${persona.riesgo || "BAJO"} (${persona.riesgo_score || "0"}) ✏️</span>
                <span class="badge editable-badge" id="estadoBadge" data-campo="estado" style="font-weight:bold; cursor: pointer;" title="Haga clic para cambiar el estado">📋 Estado: ${persona.estado || "-"} ✏️</span>
                <span class="badge" style="font-weight: 800; font-size: 0.92em; padding: 5px 12px; background-color: #652e2e; color: #fff; cursor: default; border-radius: 8px;" title="Líneas límite configuradas en Salix">📋 Líneas Límite: ${persona.lines_limit !== undefined ? persona.lines_limit : "0"}</span>
                <span class="badge" style="font-weight: 800; font-size: 0.92em; padding: 5px 12px; background-color: #2e5965; color: #fff; cursor: default; border-radius: 8px;" title="Volumen límite configurado en Salix">📦 Vol. Límite: ${persona.volume_limit !== undefined ? persona.volume_limit : "0.0"}</span>
            </div>
        `;
        
        const estBadge = document.getElementById("estadoBadge");
        const estVal = (persona.estado || "").trim().toLowerCase();
        if (estVal === "onboarding" || estVal === "ronda equipos" || estVal === "acompañamiento") {
            estBadge.style.backgroundColor = "#173D2D";
        } else if (estVal === "shadow" || estVal === "sacado h") {
            estBadge.style.backgroundColor = "#d6a100";
        } else if (estVal === "libre" || estVal === "libre fase 1" || estVal === "libre fase 2") {
            estBadge.style.backgroundColor = "#1a5a96";
        } else if (estVal === "equipo" || estVal === "mentor") {
            estBadge.style.backgroundColor = "#7b1a96";
        } else if (estVal === "finalizado" || estVal === "terminado") {
            estBadge.style.backgroundColor = "#2ecc71";
        } else if (estVal === "no apto") {
            estBadge.style.backgroundColor = "#e74c3c";
        } else {
            estBadge.style.backgroundColor = "#95a5a6";
        }
        estBadge.style.color = "#fff";
    }

    //==================================================
    // CHECKLIST
    //==================================================
    const checks = [
        ["RRHH", "rrhh"],
        ["Almuerzo", "almuerzo"],
        ["Uniforme", "uniforme"],
        ["Psicotécnico", "psicotecnico"],
        ["Formación bienvenida", "formacion"],
        ["Tour empresa", "tour"],
        ["PDA entregada", "pda"],
        ["Documento PDA", "pda_documento"]
    ];

    let htmlChecklist = `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    checks.forEach(([texto, campo]) => {
        htmlChecklist += `
            <div style="display: flex; align-items: center; justify-content: space-between; background: #f8f9fa; padding: 10px 12px; border-radius: 6px; border: 1px solid #eef0f2;">
                <span style="font-size: 0.9em; color: #333;">${texto}</span>
                <input 
                    type="checkbox" 
                    class="checkChecklist" 
                    style="transform: scale(1.2); cursor: pointer;"
                    data-id="${persona.id}" 
                    data-campo="${campo}" 
                    ${persona[campo] ? "checked" : ""}
                >
            </div>
        `;
    });
    htmlChecklist += `</div>`;
    document.getElementById("checklist").innerHTML = htmlChecklist;

    //==================================================
    // OBSERVACIONES E INTELIGENCIA ARTIFICIAL
    //==================================================
    window.currentObservaciones = persona.observaciones || "";
    window.currentPersonaId = persona.id;
    window.currentPersona = persona;
    await cargarObservacionesTimeline(persona);
    inicializarFormularioObservaciones();
    await inicializarIntervenciones(persona);
    inicializarColapsoChecklist();
    window.rawResumenAnalitico = persona.resumen_analitico || "Todavía no generado.";
    document.getElementById("ia-container").innerHTML = formatearResumenAnalitico(window.rawResumenAnalitico, persona);
    inicializarResumenIA(persona);

    // 3. Cargar datos de Grafana en segundo plano de forma asíncrona
    cargarFichajes();
    cargarValoracionActitudinal(persona);
    cargarFormacionTrabajador(persona);
    cargarHistorialSacador();

    fetch("/api/trabajador/" + id + "/grafana_completo")
        .then(res => res.json())
        .then(metrics => {
            renderizarDatosGrafana(metrics);
        })
        .catch(err => {
            console.error("Error al cargar Grafana:", err);
            mostrarSemaforoIndeterminado("Error de Carga", "No se pudo conectar con el servidor de Grafana.");
            if (contenedorGrafana) {
                contenedorGrafana.innerHTML = `
                    <div class="panel" style="text-align: center; padding: 40px; background: #fff; border: 1px solid #fceef1; border-radius: 14px;">
                        <div style="font-size: 2.5em; margin-bottom: 10px;">⚠️</div>
                        <strong style="color: #c0392b; font-size: 1.1em; display: block; margin-bottom: 8px;">Error al cargar datos de rendimiento</strong>
                        <p style="font-size: 0.88em; color: #555;">No se pudo conectar con el servidor de Grafana para recuperar la información histórica.</p>
                    </div>
                `;
            }
        });
}

function renderizarDatosGrafana(metrics) {
    const contenedorGrafana = document.getElementById("timeline-container");
    if (!contenedorGrafana) return;
    
    // Ajustar contenedor para una disposición limpia de paneles
    contenedorGrafana.style.background = "transparent";
    contenedorGrafana.style.boxShadow = "none";
    contenedorGrafana.style.padding = "0";
    contenedorGrafana.style.border = "none";
    
    let htmlGrafanaCompleto = "";
    let lastUpdatedStr = "--";
    
    const formatTimestampToDay = (ts) => {
        if (!ts) return "-";
        const dateObj = new Date(ts);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        const ddd = diasSemana[dateObj.getDay()];
        return `${day}-${month}-${year} ${ddd}`;
    };
    
    // 1. Validar errores de conexión o autenticación del backend
    if (metrics.error) {
        const errorMsg = metrics.error;
        const isAuthError = errorMsg.includes("autentic") || errorMsg.includes("expira") || errorMsg.includes("401") || errorMsg.includes("unauthorized") || errorMsg.includes("expired") || errorMsg.includes("permission");
        mostrarSemaforoIndeterminado("Error de Conexión", isAuthError ? "La sesión de Grafana ha expirado o es inválida." : "No se pudo recuperar la información de Grafana.");
        
        htmlGrafanaCompleto = `
            <div class="panel" style="text-align: center; padding: 40px; background: #fff; border: 1px solid #fceef1; border-radius: 14px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
                <div style="font-size: 2.5em; margin-bottom: 10px;">🔒</div>
                <strong style="color: #c0392b; font-size: 1.1em; display: block; margin-bottom: 8px;">Error de Conexión con Grafana</strong>
                <p style="font-size: 0.88em; color: #555; max-width: 500px; margin: 0 auto 20px auto;">
                    ${isAuthError 
                        ? "Su sesión web de Grafana ha caducado o es inválida. Es necesario iniciar sesión para visualizar los datos en tiempo real." 
                        : `No se pudo conectar con el servidor de Grafana: ${escapeHtml(errorMsg)}`}
                </p>
                ${isAuthError ? `
                    <a href="https://grafana.verdnatura.es" target="_blank" class="primaryButton" style="text-decoration: none; display: inline-block;">
                        🔑 Iniciar Sesión en Grafana
                    </a>
                ` : ""}
            </div>
        `;
        contenedorGrafana.innerHTML = htmlGrafanaCompleto;
        return;
    }

    metrics = metrics || {};
    
    if (metrics.has_data && metrics.history && metrics.history.length > 0) {
        // Formatear fecha
        lastUpdatedStr = "--";
        if (metrics.last_updated) {
            try {
                const parts = metrics.last_updated.split("T");
                const dateParts = parts[0].split("-");
                const timeParts = parts[1].split(".")[0].split(":");
                lastUpdatedStr = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} ${timeParts[0]}:${timeParts[1]}`;
            } catch(e) {
                lastUpdatedStr = metrics.last_updated;
            }
        }



        const dept = window.currentPersona && window.currentPersona.departamento 
            ? window.currentPersona.departamento.toUpperCase().trim() 
            : "";
        const isEncajador = dept && dept.includes("ENCAJADO");

        if (isEncajador) {
            // Métricas promedio e industriales
            const avgLH = metrics.lines_hour || 0;
            const avgVH = metrics.volumen_jornada_hora || metrics.volumen_hora || 0;
            const totalL = metrics.volume || 0;
            const totalVol = metrics.total_volume_m3 || 0;
            
            let totalTickets = 0;
            metrics.history.forEach(h => {
                totalTickets += parseInt(h.tickets || 0);
            });

            htmlGrafanaCompleto = `
                <div class="grafana-dashboard" style="display: flex; flex-direction: column; gap: 20px; width: 100%;">
                    
                    <!-- 1. TARJETAS RESUMEN DE EMBALAJE (ENCAJADOR) -->
                    <div class="summary-cards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; width: 100%;">
                        
                        <!-- Tarjeta Líneas/Hora -->
                        <div class="panel" style="margin: 0; background: #fff; border: 1px solid #edf2ee; border-radius: 14px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 15px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 700; color: #173D2D; font-size: 1.05em;">📦 Líneas / Hora Promedio</span>
                                <span style="font-size: 1.4em; font-weight: 800; color: #2b6cb0; background: #ebf3f9; padding: 4px 10px; border-radius: 8px;">${avgLH}</span>
                            </div>
                            <div style="font-size: 0.85em; color: #4a5568;">
                                Promedio de líneas embaladas por hora de trabajo efectivo durante el período.
                            </div>
                            <div style="font-size: 0.8em; color: #6b7a72; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #edf2ee; padding-top: 10px;">
                                <span>Líneas Totales: <strong>${totalL}</strong></span>
                                <span>Última Act.: <strong>${lastUpdatedStr}</strong></span>
                            </div>
                        </div>

                        <!-- Tarjeta Volumen/Hora -->
                        <div class="panel" style="margin: 0; background: #fff; border: 1px solid #edf2ee; border-radius: 14px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 15px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 700; color: #173D2D; font-size: 1.05em;">📊 Volumen / Hora Promedio</span>
                                <span style="font-size: 1.4em; font-weight: 800; color: #2ecc71; background: #f0fbf4; padding: 4px 10px; border-radius: 8px;">${parseFloat(avgVH).toFixed(2)} m³</span>
                            </div>
                            <div style="font-size: 0.85em; color: #4a5568;">
                                Promedio de volumen (m³) embalado por hora de trabajo efectivo durante el período.
                            </div>
                            <div style="font-size: 0.8em; color: #6b7a72; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #edf2ee; padding-top: 10px;">
                                <span>Volumen Total: <strong>${totalVol.toFixed(2)} m³</strong></span>
                                <span>Total Tickets: <strong>${totalTickets}</strong></span>
                            </div>
                        </div>
                    </div>

                    <!-- 2. EVOLUCIÓN HISTÓRICA (GRÁFICO) -->
                    <div class="panel" style="margin: 0; background: #fff; border: 1px solid #edf2ee; border-radius: 14px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2ee; padding-bottom: 8px; margin-bottom: 15px;">
                            <strong style="font-size: 1.4em; color: #173D2D; margin: 0;">📈 Evolución Histórica</strong>
                        </div>
                        <div id="contenedor-canvas-grafico" style="position: relative; height: 350px; width: 100%;">
                            <canvas id="graficoEvolucionGrafana"></canvas>
                        </div>
                    </div>

                    <!-- 3. TABLA DE TURNOS DETALLADA -->
                    <div class="panel" style="margin: 0; background: #fff; border: 1px solid #edf2ee; border-radius: 14px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
                        <strong style="font-size: 1.1em; color: #173D2D; display: block; margin-bottom: 12px; border-bottom: 1px solid #edf2ee; padding-bottom: 8px;">📋 Historial de Turnos (Encajador)</strong>
                        <div id="turnos-wrapper" style="overflow-x: auto; max-height: 280px; overflow-y: auto; border: 1px solid #edf2ee; border-radius: 8px;">
                            <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.82em; white-space: nowrap; text-align: center; overflow: visible !important;">
                                <thead style="position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">
                                    <tr style="background-color: #f0f2f5;">
                                        <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; text-align: center; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Día</th>
                                        <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Líneas/Hora</th>
                                        <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Volumen/Hora</th>
                                        <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Líneas</th>
                                        <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Volumen</th>
                                        <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Tickets</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${metrics.history.map(row => {
                                        const dateStr = formatTimestampToDay(row.workDate);
                                        const lh = row.lineas_hora !== undefined ? row.lineas_hora : "-";
                                        const vh = row.volumen_hora !== undefined ? `${parseFloat(row.volumen_hora).toFixed(2)} m³` : "-";
                                        const lin = row.lineas !== undefined ? row.lineas : "-";
                                        const vol = row.volumen !== undefined ? `${parseFloat(row.volumen).toFixed(2)} m³` : "-";
                                        const tks = row.tickets !== undefined ? row.tickets : "-";
                                        return `
                                            <tr style="border-bottom: 1px solid #edf2ee; background: #fff; transition: background 0.15s;">
                                                <td style="padding: 10px; border-bottom: 1px solid #edf2ee; font-weight: 600;">${dateStr}</td>
                                                <td style="padding: 10px; border-bottom: 1px solid #edf2ee; font-weight: 700; color: #1a202c;">${lh}</td>
                                                <td style="padding: 10px; border-bottom: 1px solid #edf2ee; color: #4a5568;">${vh}</td>
                                                <td style="padding: 10px; border-bottom: 1px solid #edf2ee; font-weight: 600; color: #2d3748;">${lin}</td>
                                                <td style="padding: 10px; border-bottom: 1px solid #edf2ee; color: #4a5568;">${vol}</td>
                                                <td style="padding: 10px; border-bottom: 1px solid #edf2ee; font-weight: 600; color: #2b6cb0;">${tks}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            contenedorGrafana.innerHTML = htmlGrafanaCompleto;
            
            // Ocultar semáforo
            const alertContainer = document.getElementById("alerta-codigo-container");
            if (alertContainer) alertContainer.style.display = "none";

            setTimeout(() => {
                inicializarGraficoEvolucion(metrics.history);
            }, 50);
            return;
        }

        // Escala de color de productividad
        const pNum = parseFloat(metrics.productivity_pct || 0);
        let colorProd = "#c0392b"; // Rojo
        let colorBgProd = "#fdf2f2";
        let statusProd = "Muy Baja";
        
        if (pNum >= 100) {
            colorProd = "#27ae60"; // Verde
            colorBgProd = "#ebf7ee";
            statusProd = "Sobresaliente";
        } else if (pNum >= 85) {
            colorProd = "#2ecc71"; // Verde claro
            colorBgProd = "#f1fbf4";
            statusProd = "Objetivo Logrado";
        } else if (pNum >= 70) {
            colorProd = "#d35400"; // Naranja
            colorBgProd = "#fef5eb";
            statusProd = "Aceptable";
        } else if (pNum >= 50) {
            colorProd = "#e67e22"; // Naranja claro
            colorBgProd = "#fdf5eb";
            statusProd = "Revisar";
        }

        // Escala de calidad/errores
        const errNum = parseFloat(metrics.error_pct || 0);
        let colorErr = "#27ae60"; // Verde
        let colorBgErr = "#ebf7ee";
        let statusErr = "Excelente";
        
        if (errNum >= 4.0) {
            colorErr = "#c0392b"; // Rojo
            colorBgErr = "#fdf2f2";
            statusErr = "Peligro Crítico";
        } else if (errNum >= 2.5) {
            colorErr = "#e67e22"; // Naranja
            colorBgErr = "#fdf5eb";
            statusErr = "Revisión";
        } else if (errNum >= 1.0) {
            colorErr = "#f39c12"; // Ámbar
            colorBgErr = "#fefbf3";
            statusErr = "Aceptable";
        }

        // Formatear fecha
        lastUpdatedStr = "--";
        if (metrics.last_updated) {
            try {
                const parts = metrics.last_updated.split("T");
                const dateParts = parts[0].split("-");
                const timeParts = parts[1].split(".")[0].split(":");
                lastUpdatedStr = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} ${timeParts[0]}:${timeParts[1]}`;
            } catch(e) {
                lastUpdatedStr = metrics.last_updated;
            }
        }
        // NUEVO: Calcular la proyección ideal basada en el modelo ideal de 31 días
        const totalDays = metrics.history ? metrics.history.length : 0;
        const day = totalDays;
        
        const ideal = getModeloIdealParaDia(day);
        const prod_ideal = ideal.prod;
        const error_ideal = ideal.error;
        
        const actual_prod = parseFloat(metrics.productivity_pct || 0);
        const actual_error = parseFloat(metrics.error_pct || 0);
        
        const diff_prod = actual_prod - prod_ideal;
        const diff_error = actual_error - error_ideal;
        
        let compProdHTML = "";
        if (diff_prod >= 0) {
            compProdHTML = `<strong style="color: #27ae60;">📈 +${diff_prod.toFixed(1)}%</strong> (Por encima del modelo ideal en Día ${day})`;
        } else {
            compProdHTML = `<strong style="color: #c0392b;">📉 ${diff_prod.toFixed(1)}%</strong> (Por debajo del modelo ideal en Día ${day})`;
        }
        
        let compErrHTML = "";
        if (diff_error <= 0) {
            compErrHTML = `<strong style="color: #27ae60;">🟢 ${diff_error.toFixed(2)}%</strong> (Mejor que el modelo ideal en Día ${day})`;
        } else {
            compErrHTML = `<strong style="color: #c0392b;">⚠️ +${diff_error.toFixed(2)}%</strong> (Peor que el modelo ideal en Día ${day})`;
        }

        actualizarCabeceraSemaforo(actual_prod, prod_ideal, actual_error, error_ideal);

        // Color for Ratio (error percentage) based on Grafana thresholds: Green < 0.7%, Yellow 0.7%-1.0%, Red >= 1.0%
        let colorRatioBg = "#27ae60"; // green
        const ratioVal = parseFloat(metrics.error_pct || 0);
        if (ratioVal >= 1.0) {
            colorRatioBg = "#c0392b"; // red
        } else if (ratioVal >= 0.7) {
            colorRatioBg = "#EAB839"; // yellow
        }



        htmlGrafanaCompleto = `
            <div class="grafana-dashboard" style="display: flex; flex-direction: column; gap: 20px; width: 100%;">
                
                <!-- 1. TARJETAS DE PRODUCTIVIDAD Y CALIDAD -->
                <div class="summary-cards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; width: 100%;">
                    
                    <!-- Tarjeta Productividad -->
                    <div class="panel" style="margin: 0; background: #fff; border: 1px solid #edf2ee; border-radius: 14px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 700; color: #173D2D; font-size: 1.05em;">🚀 Productividad Real</span>
                            <span style="font-size: 1.4em; font-weight: 800; color: ${colorProd}; background: ${colorBgProd}; padding: 4px 10px; border-radius: 8px;">${metrics.productivity_pct}%</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div style="background: #fbfdfc; padding: 12px; border-radius: 10px; border: 1px solid #edf4ef; text-align: center;">
                                <div style="font-size: 0.75em; color: #82928a; margin-bottom: 2px;">Real (Prod %)</div>
                                <div style="font-size: 1.25em; font-weight: 700; color: #173D2D;">${metrics.productivity_pct}%</div>
                            </div>
                            <div style="background: #fbfdfc; padding: 12px; border-radius: 10px; border: 1px solid #edf4ef; text-align: center;">
                                <div style="font-size: 0.75em; color: #82928a; margin-bottom: 2px;">Ideal (Día ${day})</div>
                                <div style="font-size: 1.25em; font-weight: 700; color: #173D2D;">${prod_ideal.toFixed(1)}%</div>
                            </div>
                        </div>
                        <div style="background: ${diff_prod >= 0 ? '#ebf7ee' : '#fdf2f2'}; border: 1px solid ${diff_prod >= 0 ? '#c3e6cb' : '#f5c6cb'}; border-radius: 8px; padding: 8px 12px; font-size: 0.82em; color: #333; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            ${compProdHTML}
                        </div>
                        <div style="font-size: 0.8em; color: #6b7a72; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #edf2ee; padding-top: 10px;">
                            <span>Volumen Total: <strong>${metrics.volume} líneas</strong></span>
                            <span>Esperadas (Base 80): <strong>${metrics.expected_lines}</strong></span>
                        </div>
                    </div>

                    <!-- Tarjeta Calidad/Errores -->
                    <div class="panel" style="margin: 0; background: #fff; border: 1px solid #edf2ee; border-radius: 14px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 700; color: #173D2D; font-size: 1.05em;">🎯 Calidad de Operación</span>
                            <span style="font-size: 1.4em; font-weight: 800; color: ${colorErr}; background: ${colorBgErr}; padding: 4px 10px; border-radius: 8px;">${metrics.error_pct}%</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div style="background: #fdfafb; padding: 12px; border-radius: 10px; border: 1px solid #fceef1; text-align: center;">
                                <div style="font-size: 0.75em; color: #928285; margin-bottom: 2px;">Tasa Error Real</div>
                                <div style="font-size: 1.25em; font-weight: 700; color: #c0392b;">${metrics.error_pct}%</div>
                            </div>
                            <div style="background: #fbfdfc; padding: 12px; border-radius: 10px; border: 1px solid #edf4ef; text-align: center;">
                                <div style="font-size: 0.75em; color: #82928a; margin-bottom: 2px;">Proyección (Día ${day})</div>
                                <div style="font-size: 1.25em; font-weight: 700; color: #173D2D;">${error_ideal.toFixed(2)}%</div>
                            </div>
                        </div>
                        <div style="background: ${diff_error <= 0 ? '#ebf7ee' : '#fdf2f2'}; border: 1px solid ${diff_error <= 0 ? '#c3e6cb' : '#f5c6cb'}; border-radius: 8px; padding: 8px 12px; font-size: 0.82em; color: #333; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            ${compErrHTML}
                        </div>
                        <div style="font-size: 0.8em; color: #6b7a72; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #edf2ee; padding-top: 10px;">
                            <span>Errores Totales: <strong>${metrics.total_errors}</strong></span>
                            <span>Última Act.: <strong>${lastUpdatedStr}</strong></span>
                        </div>
                    </div>
                </div>

                <!-- 2. EVOLUCIÓN HISTÓRICA (GRÁFICO) -->
                <div class="panel" style="margin: 0; background: #fff; border: 1px solid #edf2ee; border-radius: 14px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2ee; padding-bottom: 8px; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                        <strong style="font-size: 1.4em; color: #173D2D; margin: 0;">📈 Evolución Histórica</strong>
                        <div class="grafico-tabs" style="display: flex; background: #f1f3f5; padding: 4px; border-radius: 8px; gap: 4px;">
                            <button id="tab-rendimiento-general" style="border: none; background: ${tipoGrafico === 'general' ? '#173D2D' : 'transparent'}; color: ${tipoGrafico === 'general' ? 'white' : '#495057'}; padding: 6px 12px; border-radius: 6px; font-size: 0.8em; font-weight: 600; cursor: pointer; transition: all 0.2s;" type="button">General</button>
                            <button id="tab-curva-aprendizaje" style="border: none; background: ${tipoGrafico === 'curva' ? '#173D2D' : 'transparent'}; color: ${tipoGrafico === 'curva' ? 'white' : '#495057'}; padding: 6px 12px; border-radius: 6px; font-size: 0.8em; font-weight: 600; cursor: pointer; transition: all 0.2s;" type="button">Proyección Ideal (31 días)</button>
                        </div>
                    </div>
                    <div id="contenedor-canvas-grafico" style="position: relative; height: 350px; width: 100%;">
                        <canvas id="graficoEvolucionGrafana"></canvas>
                    </div>
                </div>

                <!-- 3. TABLA DE TURNOS DETALLADA -->
                <div class="panel" style="margin: 0; background: #fff; border: 1px solid #edf2ee; border-radius: 14px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
                    <strong style="font-size: 1.1em; color: #173D2D; display: block; margin-bottom: 12px; border-bottom: 1px solid #edf2ee; padding-bottom: 8px;">📋 Historial de Turnos</strong>
                    <div id="turnos-wrapper" style="overflow-x: auto; max-height: 280px; overflow-y: auto; border: 1px solid #edf2ee; border-radius: 8px;">
                        <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.82em; white-space: nowrap; text-align: center; overflow: visible !important;">
                            <thead style="position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">
                                <tr style="background-color: #f0f2f5;">
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; text-align: center; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Día</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Departamento / Equipo</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Porcentaje</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Lin. sacadas</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Lin. esperadas</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">H. sacando</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Lin./hora</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Volumen</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Vol./H</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">H. Jornada</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">L/H Jornada</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">V/H Jornada</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">❌</th>
                                    <th style="padding: 8px 10px; border-bottom: 2px solid #ddd; color: #333; font-weight: bold; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;">Ratio</th>
                                    
                                    <!-- Error Breakdown Columns -->
                                    <th style="padding: 8px 6px; border-bottom: 2px solid #ddd; color: #555; font-weight: normal; border-left: 2px solid #ddd; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;" title="Nivel Incorrecto">Nivel</th>
                                    <th style="padding: 8px 6px; border-bottom: 2px solid #ddd; color: #555; font-weight: normal; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;" title="Cantidad Incorrecta">Cant.</th>
                                    <th style="padding: 8px 6px; border-bottom: 2px solid #ddd; color: #555; font-weight: normal; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;" title="Se ha saltado">Salto</th>
                                    <th style="padding: 8px 6px; border-bottom: 2px solid #ddd; color: #555; font-weight: normal; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;" title="Producto Equivocado">Prod.Eq.</th>
                                    <th style="padding: 8px 6px; border-bottom: 2px solid #ddd; color: #555; font-weight: normal; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;" title="Desordenado">Desord.</th>
                                    <th style="padding: 8px 6px; border-bottom: 2px solid #ddd; color: #555; font-weight: normal; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;" title="Mal Etiquetado">M.Etiq.</th>
                                    <th style="padding: 8px 6px; border-bottom: 2px solid #ddd; color: #555; font-weight: normal; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;" title="Maltratado">Maltrato</th>
                                    <th style="padding: 8px 6px; border-bottom: 2px solid #ddd; color: #555; font-weight: normal; position: sticky; top: 0; z-index: 10; background-color: #f0f2f5;" title="No hace cambio">Cambio</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        metrics.history.forEach(registro => {
            const formatErr = (val) => {
                const num = parseInt(val || 0);
                return num > 0 
                    ? `<span style="color:#c0392b; font-weight:bold;">${num}</span>` 
                    : `<span style="color:#ccc;">-</span>`;
            };

            const pRow = parseFloat(registro.productividad_num || 0);
            let colorFondoProd = "#fff";
            let colorTextoProd = "#333";

            if (pRow >= 100) { colorFondoProd = "#d4edda"; colorTextoProd = "#155724"; }
            else if (pRow >= 85) { colorFondoProd = "#e2f0d9"; colorTextoProd = "#274e13"; }
            else if (pRow >= 70) { colorFondoProd = "#fff3cd"; colorTextoProd = "#856404"; }
            else if (pRow >= 50) { colorFondoProd = "#f8d7da"; colorTextoProd = "#721c24"; }
            else if (pRow > 0) { colorFondoProd = "#f5c6cb"; colorTextoProd = "#721c24"; }

            const rRow = parseFloat(registro.errores_pct_num || 0);
            let colorRatioText = "#27ae60"; // green
            if (rRow >= 1.0) colorRatioText = "#c0392b"; // red
            else if (rRow >= 0.7) colorRatioText = "#EAB839"; // yellow

            const dateStr = formatTimestampToDay(registro.workDate) || registro.fecha || "-";

            htmlGrafanaCompleto += `
                <tr style="background: #fff; border-bottom: 1px solid #eee;">
                    <td style="padding: 8px 10px; color: #444; font-weight: 500;">${escapeHtml(dateStr)}</td>
                    <td style="padding: 8px 10px; color: #555;">${escapeHtml(registro.departamento || "EQUIPO REFUERZO")}</td>
                    <td style="padding: 8px 10px; font-weight: bold; background-color: ${colorFondoProd}; color: ${colorTextoProd};">${escapeHtml(registro.productividad || "0.0%")}</td>
                    <td style="padding: 8px 10px; color: #444; font-weight: bold;">${escapeHtml(registro.lineas !== undefined ? registro.lineas : "-")}</td>
                    <td style="padding: 8px 10px; color: #666;">${escapeHtml(registro.expectedLines || Math.round(registro.horas * 80) || "-")}</td>
                    <td style="padding: 8px 10px; color: #444;">${escapeHtml(registro.horas !== undefined ? registro.horas.toFixed(1) : "-")}</td>
                    <td style="padding: 8px 10px; color: #444;">${escapeHtml(registro.lineas_hora !== undefined ? registro.lineas_hora : "-")}</td>
                    <td style="padding: 8px 10px; color: #444;">${escapeHtml(registro.volumen !== undefined ? registro.volumen.toFixed(2) + " m³" : "-")}</td>
                    <td style="padding: 8px 10px; color: #444;">${escapeHtml(registro.volumen_hora !== undefined ? registro.volumen_hora.toFixed(2) : "-")}</td>
                    <td style="padding: 8px 10px; color: #555;">${registro.horas_jornada > 0 ? registro.horas_jornada.toFixed(2) : "-"}</td>
                    <td style="padding: 8px 10px; color: #555;">${registro.lines_jornada_hora > 0 ? registro.lines_jornada_hora : "-"}</td>
                    <td style="padding: 8px 10px; color: #555;">${registro.volumen_jornada_hora > 0 ? registro.volumen_jornada_hora.toFixed(2) : "-"}</td>
                    <td style="padding: 8px 10px; color: #c0392b; font-weight: bold;">${escapeHtml(registro.errores_num !== undefined ? registro.errores_num : "-")}</td>
                    <td style="padding: 8px 10px; color: ${colorRatioText}; font-weight: bold;">${escapeHtml(registro.errores_pct || "0.00%")}</td>
                    
                    <!-- Error breakdown columns -->
                    <td style="padding: 8px 6px; border-left: 2px solid #ddd;">${formatErr(registro.err_nivel)}</td>
                    <td style="padding: 8px 6px;">${formatErr(registro.err_cant)}</td>
                    <td style="padding: 8px 6px;">${formatErr(registro.err_salto)}</td>
                    <td style="padding: 8px 6px;">${formatErr(registro.err_prod)}</td>
                    <td style="padding: 8px 6px;">${formatErr(registro.err_desorden)}</td>
                    <td style="padding: 8px 6px;">${formatErr(registro.err_etiq)}</td>
                    <td style="padding: 8px 6px;">${formatErr(registro.err_maltrato)}</td>
                    <td style="padding: 8px 6px;">${formatErr(registro.err_cambio)}</td>
                </tr>
            `;
        });

        htmlGrafanaCompleto += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } else {
        mostrarSemaforoIndeterminado("Sin Registros", "Este trabajador no tiene registros históricos en Grafana.");
        htmlGrafanaCompleto = `
            <div class="panel" style="text-align: center; padding: 40px; background: #fff; border: 1px solid #edf2ee; border-radius: 14px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
                <div style="font-size: 2.5em; margin-bottom: 10px;">⚠️</div>
                <strong style="color: #6b7a72; font-size: 1.1em; display: block; margin-bottom: 6px;">Sin datos de Grafana</strong>
                <p style="font-size: 0.85em; color: #8a9b91; margin: 0;">
                    Este trabajador no tiene registros de productividad o errores históricos registrados en Grafana.
                </p>
            </div>
        `;
    }

    contenedorGrafana.innerHTML = htmlGrafanaCompleto;

    // Registrar listeners para conmutar pestañas de la gráfica e inicializar
    if (metrics.has_data && metrics.history && metrics.history.length > 0) {
        const tabGeneral = document.getElementById("tab-rendimiento-general");
        const tabCurva = document.getElementById("tab-curva-aprendizaje");
        
        if (tabGeneral && tabCurva) {
            tabGeneral.addEventListener("click", () => {
                tipoGrafico = "general";
                tabGeneral.style.background = "#173D2D";
                tabGeneral.style.color = "white";
                tabCurva.style.background = "transparent";
                tabCurva.style.color = "#495057";
                inicializarGraficoEvolucion(metrics.history);
            });
            
            tabCurva.addEventListener("click", () => {
                tipoGrafico = "curva";
                tabCurva.style.background = "#173D2D";
                tabCurva.style.color = "white";
                tabGeneral.style.background = "transparent";
                tabGeneral.style.color = "#495057";
                inicializarGraficoEvolucion(metrics.history);
            });
        }
        inicializarGraficoEvolucion(metrics.history);
    }

    // Almacenar métricas cargadas y re-renderizar resumen si no está en modo edición
    window.currentMetrics = metrics;
    const containerResumen = document.getElementById("ia-container");
    if (containerResumen && window.rawResumenAnalitico) {
        const textarea = document.getElementById("edit-resumen-textarea");
        if (!textarea) {
            containerResumen.innerHTML = formatearResumenAnalitico(window.rawResumenAnalitico, window.currentPersona);
        }
    }
}

//==================================================
// CHART INTERACTIVO (CON LÍNEA DE OBJETIVO 100%)
//==================================================
function inicializarGraficoEvolucion(datos) {
    const ctx = document.getElementById('graficoEvolucionGrafana');
    if (!ctx) return;

    // Ordenar cronológicamente
    const datosOrdenados = [...datos].reverse();
    
    // Extraer etiquetas (fechas)
    const labels = datosOrdenados.map(d => d.fecha || "");
    
    if (miGraficoGrafana) miGraficoGrafana.destroy();

    const dept = window.currentPersona && window.currentPersona.departamento 
        ? window.currentPersona.departamento.toUpperCase().trim() 
        : "";
    const isEncajador = dept && dept.includes("ENCAJADO");

    if (isEncajador) {
        // --- VISTA ENCAJADORES (SIN COMPARATIVA DE LÍNEAS HORA) ---
        const datasetLineasHora = datosOrdenados.map(d => parseFloat(d.lineas_hora) || 0);
        const datasetVolumenHora = datosOrdenados.map(d => parseFloat(d.volumen_hora) || 0);
        const datasetTickets = datosOrdenados.map(d => parseInt(d.tickets) || 0);

        miGraficoGrafana = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Líneas/Hora',
                        data: datasetLineasHora,
                        borderColor: '#2e7d32',
                        backgroundColor: 'rgba(46, 125, 50, 0.05)',
                        borderWidth: 2.5,
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: 'Volumen/Hora (m³)',
                        data: datasetVolumenHora,
                        borderColor: '#1565c0',
                        backgroundColor: 'rgba(21, 101, 192, 0.05)',
                        borderWidth: 2.5,
                        tension: 0.3,
                        yAxisID: 'y1'
                    },
                    {
                        type: 'bar',
                        label: 'Tickets',
                        data: datasetTickets,
                        backgroundColor: 'rgba(230, 126, 34, 0.15)',
                        borderColor: 'rgba(230, 126, 34, 0.5)',
                        borderWidth: 1.5,
                        yAxisID: 'y2',
                        barPercentage: 0.6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { boxWidth: 12, font: { size: 10 } }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { 
                            minRotation: 90, 
                            maxRotation: 90, 
                            font: { size: 11, weight: 'bold' } 
                        }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: 'Líneas / Hora', color: '#2e7d32', font: { size: 12, weight: 'bold' } },
                        ticks: { color: '#2e7d32' },
                        suggestedMin: 0
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: 'Volumen / Hora (m³)', color: '#1565c0', font: { size: 12, weight: 'bold' } },
                        ticks: { color: '#1565c0' },
                        suggestedMin: 0,
                        grid: { drawOnChartArea: false }
                    },
                    y2: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: 'Tickets', color: '#d35400', font: { size: 12, weight: 'bold' } },
                        ticks: { color: '#d35400' },
                        suggestedMin: 0,
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
        return;
    }

    if (tipoGrafico === "curva") {
        // --- VISTA CURVA DE APRENDIZAJE ---
        const datasetProdReal = datosOrdenados.map(d => parseFloat(d.productividad_num || strClean(d.productividad)) || 0);
        const datasetErroresReal = datosOrdenados.map(d => parseFloat(strClean(d.errores_pct)) || 0);
        
        const datasetProdIdeal = datosOrdenados.map((d, idx) => {
            const day = idx + 1;
            const ideal = getModeloIdealParaDia(day);
            return ideal.prod;
        });
        
        const datasetErroresIdeal = datosOrdenados.map((d, idx) => {
            const day = idx + 1;
            const ideal = getModeloIdealParaDia(day);
            return ideal.error;
        });

        miGraficoGrafana = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Prod % Real',
                        data: datasetProdReal,
                        borderColor: '#1f4e3d',
                        backgroundColor: 'rgba(31, 78, 61, 0.05)',
                        borderWidth: 2.5,
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Proyección Ideal (Prod %)',
                        data: datasetProdIdeal,
                        borderColor: '#2ecc71',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Error % Real',
                        data: datasetErroresReal,
                        borderColor: '#c0392b',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        tension: 0.3,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Error % Ideal',
                        data: datasetErroresIdeal,
                        borderColor: '#e74c3c',
                        borderWidth: 1.5,
                        borderDash: [3, 3],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { boxWidth: 12, font: { size: 10 } }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { 
                            minRotation: 90, 
                            maxRotation: 90, 
                            font: { size: 11, weight: 'bold' } 
                        }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: 'Productividad %', font: { size: 13, weight: 'bold' } },
                        suggestedMin: 0,
                        suggestedMax: 120,
                        ticks: { callback: v => v + '%', font: { size: 11 } }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: 'Tasa de Error', font: { size: 13, weight: 'bold' } },
                        suggestedMin: 0,
                        suggestedMax: 5.0,
                        grid: { drawOnChartArea: false },
                        ticks: { callback: v => v + '%', font: { size: 11 } }
                    }
                }
            }
        });
        
    } else {
        // --- VISTA RENDIMIENTO GENERAL (PORCENTAJES) ---
        const datasetProductividad = datosOrdenados.map(d => parseFloat(d.productividad_num || strClean(d.productividad)) || 0);
        const datasetErrores = datosOrdenados.map(d => parseFloat(strClean(d.errores_pct)) || 0);
        const datasetObjetivo = datosOrdenados.map(() => 100.0);

        miGraficoGrafana = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Prod %',
                        data: datasetProductividad,
                        borderColor: '#1f4e3d',
                        backgroundColor: 'rgba(31, 78, 61, 0.05)',
                        borderWidth: 2.5,
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Objetivo (100%)',
                        data: datasetObjetivo,
                        borderColor: '#2ecc71',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Error %',
                        data: datasetErrores,
                        borderColor: '#c0392b',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderDash: [2, 2],
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { boxWidth: 12, font: { size: 10 } }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { 
                            minRotation: 90, 
                            maxRotation: 90, 
                            font: { size: 11, weight: 'bold' } 
                        }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: 'Productividad', font: { size: 13, weight: 'bold' } },
                        suggestedMin: 0,
                        ticks: { callback: v => v + '%', font: { size: 11 } }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: 'Errores', font: { size: 13, weight: 'bold' } },
                        suggestedMin: 0,
                        grid: { drawOnChartArea: false },
                        ticks: { callback: v => v + '%', font: { size: 11 } }
                    }
                }
            }
        });
    }
}

//==================================================
// UTILIDADES Y LISTENERS
//==================================================
function valor(v){
    if(v===undefined || v===null || v==="") return "--";
    return v;
}

function strClean(val) {
    return String(val || "0").replace("%", "").replace(",", ".").strip();
}

if (!String.prototype.strip) {
    String.prototype.strip = function() { return this.trim(); };
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

cargarExpediente();

document.addEventListener("change", async function(e){
    if(!e.target.classList.contains("checkChecklist")) return;

    const idTrabajador = e.target.dataset.id;
    const campo = e.target.dataset.campo;
    const valorCheck = e.target.checked;

    try{
        const res = await fetch("/api/persona/checklist",{
            method:"POST",
            headers: { "Content-Type":"application/json" },
            body:JSON.stringify({ id:idTrabajador, campo:campo, valor:valorCheck })
        });
        const data = await res.json();
        if(!data || data.ok===false){
            alert(data && data.error ? data.error : "No se pudo guardar");
            e.target.checked = !valorCheck;
        }
    }catch(err){
        alert("No se pudo guardar");
        e.target.checked = !valorCheck;
    }
});

document.addEventListener("click", function(e) {
    const badge = e.target.closest(".editable-badge");
    if (!badge || badge.dataset.editing === "true") return;

    const campo = badge.dataset.campo;
    const valorActual = badge.textContent
        .replace(/[🏢⚠️📋📦✏️]/g, "")
        .replace("Riesgo:", "")
        .replace("Estado:", "")
        .replace("Líneas Límite:", "")
        .replace("Vol. Límite:", "")
        .trim()
        .split("(")[0]
        .trim();
    const idTrabajador = id; 

    badge.dataset.editing = "true";
    const originalHTML = badge.innerHTML;

    let inputEl;
    const esNumerico = (campo === "lines_limit" || campo === "volume_limit");

    if (esNumerico) {
        inputEl = document.createElement("input");
        inputEl.type = "number";
        if (campo === "volume_limit") {
            inputEl.step = "0.1";
        }
        inputEl.style.padding = "4px 8px";
        inputEl.style.borderRadius = "6px";
        inputEl.style.border = "1px solid #ccc";
        inputEl.style.fontSize = "0.9em";
        inputEl.style.width = "75px";
        inputEl.value = valorActual;
    } else {
        inputEl = document.createElement("select");
        inputEl.style.padding = "4px 8px";
        inputEl.style.borderRadius = "6px";
        inputEl.style.border = "1px solid #ccc";
        inputEl.style.fontSize = "0.9em";
        inputEl.style.cursor = "pointer";

        let opciones = [];
        if (campo === "departamento") {
            opciones = [
                "TALLER NATURAL",
                "SACADO H",
                "SACADO V",
                "SACADO PREVIA",
                "PRODUCCION",
                "PRODUCCIÓN",
                "ENCAJADO",
                "ENCAJADO H",
                "ENCAJADO V"
            ];
        } else if (campo === "estado") {
            opciones = [
                "Onboarding",
                "Shadow",
                "Libre",
                "Equipo",
                "Finalizado",
                "No apto"
            ];
        } else if (campo === "riesgo") {
            opciones = ["BAJO", "MEDIO", "ALTO"];
        }

        const valActualUpper = valorActual.toUpperCase();
        const opcionesUpper = opciones.map(o => o.toUpperCase());
        if (valorActual && !opcionesUpper.includes(valActualUpper)) {
            opciones.unshift(valorActual);
        }

        opciones.forEach(optVal => {
            const opt = document.createElement("option");
            opt.value = optVal;
            opt.textContent = optVal;
            if (optVal.toUpperCase() === valActualUpper) {
                opt.selected = true;
            }
            inputEl.appendChild(opt);
        });
    }

    badge.innerHTML = "";
    badge.appendChild(inputEl);
    inputEl.focus();

    const guardarCambio = async () => {
        const nuevoValor = inputEl.value;
        if (nuevoValor === valorActual) {
            badge.innerHTML = originalHTML;
            delete badge.dataset.editing;
            return;
        }

        try {
            badge.style.opacity = "0.5";
            const res = await fetch("/api/persona/actualizar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: idTrabajador, campo: campo, valor: nuevoValor })
            });
            const data = await res.json();
            if (data && data.ok) {
                if (campo === "estado") {
                    badge.innerHTML = `📋 Estado: ${nuevoValor} ✏️`;
                    const estVal = nuevoValor.trim().toLowerCase();
                    if (estVal === "onboarding" || estVal === "ronda equipos" || estVal === "acompañamiento") {
                        badge.style.backgroundColor = "#173D2D";
                    } else if (estVal === "shadow" || estVal === "sacado h") {
                        badge.style.backgroundColor = "#d6a100";
                    } else if (estVal === "libre" || estVal === "libre fase 1" || estVal === "libre fase 2") {
                        badge.style.backgroundColor = "#1a5a96";
                    } else if (estVal === "equipo" || estVal === "mentor") {
                        badge.style.backgroundColor = "#7b1a96";
                    } else if (estVal === "finalizado" || estVal === "terminado") {
                        badge.style.backgroundColor = "#2ecc71";
                    } else if (estVal === "no apto") {
                        badge.style.backgroundColor = "#e74c3c";
                    } else {
                        badge.style.backgroundColor = "#95a5a6";
                    }
                } else if (campo === "departamento") {
                    badge.innerHTML = `🏢 ${nuevoValor || "-"} ✏️`;
                } else if (campo === "riesgo") {
                    const scoreMatch = originalHTML.match(/\(([^)]+)\)/);
                    const scoreStr = scoreMatch ? scoreMatch[1] : "0";
                    badge.innerHTML = `⚠️ Riesgo: ${nuevoValor || "BAJO"} (${scoreStr}) ✏️`;
                    
                    const lblChaleco = document.getElementById("label-chaleco");
                    if (lblChaleco) {
                        lblChaleco.dataset.riesgo = nuevoValor || "BAJO";
                        recalcularFondoFicha(nuevoValor || "BAJO", lblChaleco.dataset.chaleco || "NO");
                    }
                    actualizarCabeceraSemaforo();
                } else if (campo === "lines_limit") {
                    badge.innerHTML = `📋 Líneas Límite: ${nuevoValor} ✏️`;
                    if (typeof cargarTimelineLimites === "function") {
                        cargarTimelineLimites();
                    }
                } else if (campo === "volume_limit") {
                    badge.innerHTML = `📦 Vol. Límite: ${nuevoValor} ✏️`;
                    if (typeof cargarTimelineLimites === "function") {
                        cargarTimelineLimites();
                    }
                } else {
                    badge.innerHTML = `${nuevoValor} ✏️`;
                }
            } else {
                alert(data.error || "No se pudo actualizar");
                badge.innerHTML = originalHTML;
            }
        } catch (err) {
            alert("Error de conexión al actualizar");
            badge.innerHTML = originalHTML;
        } finally {
            badge.style.opacity = "1";
            delete badge.dataset.editing;
        }
    };

    if (esNumerico) {
        inputEl.addEventListener("keypress", (evt) => {
            if (evt.key === "Enter") {
                guardarCambio();
            }
        });
        inputEl.addEventListener("blur", () => {
            setTimeout(() => {
                if (badge.dataset.editing === "true") {
                    badge.innerHTML = originalHTML;
                    delete badge.dataset.editing;
                }
            }, 250);
        });
    } else {
        inputEl.addEventListener("change", guardarCambio);
        inputEl.addEventListener("blur", () => {
            setTimeout(() => {
                if (badge.dataset.editing === "true") {
                    badge.innerHTML = originalHTML;
                    delete badge.dataset.editing;
                }
            }, 150);
        });
    }
});

// =====================================================
// INTEGRACIÓN FICHAJES Y DESVIACIÓN (SPRINT 2)
// =====================================================

async function cargarFichajes() {
    const container = document.getElementById("fichajes-container");
    if (!container) return;

    try {
        const res = await fetch(`/api/trabajador/${id}/fichajes`);
        const data = await res.json();
        
        if (!data.ok) {
            container.innerHTML = `
                <p style="color: #c0392b; font-style: italic; font-size: 0.9em; padding: 10px 0;">
                    ⚠️ Error al obtener los fichajes: ${data.error || "Error desconocido"}
                </p>`;
            return;
        }

        const fichajes = data.fichajes || [];
        if (fichajes.length === 0) {
            container.innerHTML = `
                <p style="color: #999; font-style: italic; font-size: 0.9em; padding: 10px 0; text-align: center;">
                    No hay fichajes registrados en los últimos 30 días.
                </p>`;
            return;
        }

        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em; text-align: left;">
                <thead>
                    <tr style="border-bottom: 2px solid #edf2ee; background: #fafbfc;">
                        <th style="padding: 10px 12px; color: #1f4e3d; font-weight: 700;">Fecha</th>
                        <th style="padding: 10px 12px; color: #1f4e3d; font-weight: 700;">Entrada (1ª)</th>
                        <th style="padding: 10px 12px; color: #1f4e3d; font-weight: 700;">Salida (Últ.)</th>
                        <th style="padding: 10px 12px; color: #1f4e3d; font-weight: 700; text-align: right;">Desviación</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const fichajesMostrados = fichajes.slice(0, 20);
        fichajesMostrados.forEach(f => {
            let colorDesv = "#27ae60"; // Verde para puntual o temprano
            let pesoDesv = "normal";
            
            if (f.es_retraso) {
                colorDesv = "#c0392b"; // Rojo para retraso > 3 mins
                pesoDesv = "bold";
            } else if (f.desviacion.startsWith("-")) {
                colorDesv = "#1a5a96"; // Azul para entrada anticipada
            }

            html += `
                <tr style="border-bottom: 1px solid #edf2ee; transition: background 0.2s;">
                    <td style="padding: 10px 12px; color: #333; font-weight: 500;">${f.fecha}</td>
                    <td style="padding: 10px 12px; color: #555;">${f.entrada}</td>
                    <td style="padding: 10px 12px; color: #555;">${f.salida}</td>
                    <td style="padding: 10px 12px; text-align: right; color: ${colorDesv}; font-weight: ${pesoDesv};">
                        ${f.desviacion}
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        
        // Agregar hover effect dinámico a las filas de la tabla
        const rows = container.querySelectorAll("tbody tr");
        rows.forEach(r => {
            r.addEventListener("mouseenter", () => r.style.background = "#f4f7f5");
            r.addEventListener("mouseleave", () => r.style.background = "transparent");
        });

    } catch (err) {
        console.error("Error al cargar fichajes:", err);
        container.innerHTML = `
            <p style="color: #c0392b; font-style: italic; font-size: 0.9em; padding: 10px 0;">
                ⚠️ Error de conexión al cargar fichajes.
            </p>`;
    }
}


// =====================================================
// HISTÓRICO DE OBSERVACIONES (TIMELINE & VOZ)
// =====================================================

async function cargarObservacionesTimeline(persona) {
    const timelineDiv = document.getElementById("observaciones-timeline");
    if (!timelineDiv) return;

    try {
        const res = await fetch(`/api/trabajador/${persona.id}/observaciones`);
        const obs = await res.json();

        if (obs.length === 0) {
            // Si no hay observaciones en el histórico pero existe nota en el maestro
            if (persona.observaciones) {
                timelineDiv.innerHTML = `
                    <div class="obs-item tipo-general">
                        <div class="obs-header">
                            <div>
                                <span class="obs-author">Nota Inicial</span>
                                <span class="obs-badge General">General</span>
                            </div>
                            <span>-</span>
                        </div>
                        <div class="obs-text">${escapeHtml(persona.observaciones)}</div>
                    </div>
                `;
            } else {
                timelineDiv.innerHTML = `
                    <span style="color:#999; font-style:italic; font-size: 0.9em; display:block; padding: 10px 0;">
                        Aún no hay observaciones en la línea de tiempo. Escribe una arriba para comenzar.
                    </span>
                `;
            }
            return;
        }

        let html = "";
        const obsMostradas = obs.slice(0, 20);
        obsMostradas.forEach(o => {
            const badgeClass = o.tipo || "General";
            const itemClass = "tipo-" + badgeClass.toLowerCase();
            const rrhhIndicator = o.visible_rrhh === "SÍ" 
                ? '<span style="color:#173D2D; font-weight:bold; margin-left:8px;" title="Visible para Recursos Humanos">👥 RRHH</span>' 
                : '<span style="color:#999; margin-left:8px;" title="Solo visible internamente en el departamento">🔒 Privada</span>';

            const isPdaAlert = o.comentario && o.comentario.startsWith("📲");
            const cleanComentario = isPdaAlert ? o.comentario.substring(1).trim() : o.comentario;
            const pdaIndicator = isPdaAlert 
                ? '<span style="color:#2b6cb0; font-weight:bold; margin-left:8px;" title="Enviado como Alerta a la PDA del trabajador"><span style="background:#ebf8ff; color:#2b6cb0; padding:2px 6px; border-radius:4px; font-size:0.85em; font-family:inherit;">📲 Alerta PDA</span></span>'
                : '';

            let displayFecha = o.fecha_registro || "";
            if (o.fecha_creacion) {
                try {
                    const parts = o.fecha_creacion.split(" ");
                    if (parts.length === 2) {
                        const dateParts = parts[0].split("-");
                        const timeParts = parts[1].split(":");
                        displayFecha = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} ${timeParts[0]}:${timeParts[1]}`;
                    } else {
                        displayFecha = o.fecha_creacion;
                    }
                } catch (e) {
                    displayFecha = o.fecha_creacion || o.fecha_registro;
                }
            }

            html += `
                <div class="obs-item ${itemClass}">
                    <div class="obs-header">
                        <div>
                            <span class="obs-author">✍️ ${escapeHtml(o.autor_id || o.creado_por || "Anónimo")}</span>
                            <span class="obs-badge ${badgeClass}">${badgeClass}</span>
                            ${rrhhIndicator}
                            ${pdaIndicator}
                        </div>
                        <span style="color: #888; font-size: 0.85em;">${escapeHtml(displayFecha)}</span>
                    </div>
                    <div class="obs-text">${escapeHtml(cleanComentario || "")}</div>
                </div>
            `;
        });
        timelineDiv.innerHTML = html;

    } catch (err) {
        console.error("Error al cargar observaciones:", err);
        timelineDiv.innerHTML = `<span style="color:red; font-size: 0.9em;">Error al conectar con la base de datos de observaciones.</span>`;
    }
}

// Configurar los listeners del formulario de observaciones
async function inicializarFormularioObservaciones() {
    const btnSave = document.getElementById("btn-guardar-observacion");
    const textarea = document.getElementById("nueva-observacion-texto");
    const selectTipo = document.getElementById("nueva-observacion-tipo");
    const checkRrhh = document.getElementById("nueva-observacion-rrhh");
    const btnMic = document.getElementById("btn-mic-observaciones");
    
    const selectAutor = document.getElementById("nueva-observacion-autor");
    const selectJefe = document.getElementById("nueva-observacion-jefe");
    const checkSalix = document.getElementById("nueva-observacion-salix");

    if (!btnSave || !textarea) return;

    // Cargar formadores y jefes de equipo en los selects
    try {
        // Cargar Formadores con usuario activo
        const resUsuarios = await fetch("/api/usuarios");
        const usuarios = await resUsuarios.json();
        if (selectAutor && Array.isArray(usuarios)) {
            selectAutor.innerHTML = "";
            const usuariosActivos = usuarios.filter(u => u.activo === "Sí");
            const nombresUsuarios = [...new Set(usuariosActivos.map(u => u.nombre).filter(Boolean))].sort();
            nombresUsuarios.forEach(nombre => {
                const opt = document.createElement("option");
                opt.value = nombre;
                opt.textContent = nombre;
                
                let matchesUser = false;
                if (window.currentUser && window.currentUser.nombre) {
                    matchesUser = nombre.toUpperCase().trim() === window.currentUser.nombre.toUpperCase().trim();
                } else {
                    matchesUser = nombre.toUpperCase().includes("FRANCISCO ALBERT ESCUDERO") || nombre.toUpperCase().includes("ALBERT ESCUDERO");
                }
                if (matchesUser) {
                    opt.selected = true;
                }
                selectAutor.appendChild(opt);
            });
        }

        // Cargar Jefes de Equipo
        const resJefes = await fetch("/api/jefes_equipo");
        const jefes = await resJefes.json();
        if (selectJefe && Array.isArray(jefes)) {
            selectJefe.innerHTML = '<option value="">-- Ninguno --</option>';
            jefes.forEach(nombre => {
                const opt = document.createElement("option");
                opt.value = nombre;
                opt.textContent = nombre;
                selectJefe.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Error cargando formadores/jefes para observaciones:", err);
    }

    // 1. Guardar observación
    btnSave.onclick = async function() {
        let comentario = textarea.value.trim();
        if (!comentario) {
            alert("Por favor, escribe un comentario para guardar la observación.");
            return;
        }

        const tipo = selectTipo ? selectTipo.value : "General";
        const visible_rrhh = (checkRrhh && checkRrhh.checked) ? "SÍ" : "NO";
        const autor = selectAutor ? selectAutor.value : "falbert";
        const jefe = selectJefe ? selectJefe.value : "";
        const enviar_salix = (checkSalix && checkSalix.checked) ? true : false;

        // Si se seleccionó un Jefe de Equipo, se añade como referencia en el texto
        if (jefe) {
            comentario = `🗣️ ${jefe} (Jefe de Equipo): ${comentario}`;
        }

        btnSave.disabled = true;
        btnSave.innerText = "Guardando...";

        try {
            const res = await fetch(`/api/trabajador/${window.currentPersonaId}/observaciones`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    comentario: comentario,
                    tipo: tipo,
                    visible_rrhh: visible_rrhh,
                    autor_id: autor,
                    enviar_salix: enviar_salix
                })
            });

            const data = await res.json();
            if (data && data.ok) {
                textarea.value = "";
                // Resetear select de jefe de equipo
                if (selectJefe) selectJefe.value = "";
                // Resetear check de Salix
                if (checkSalix) checkSalix.checked = false;
                
                // Si la alerta falló por token o conexión, lo mostramos como advertencia amistosa
                if (data.warning) {
                    alert(data.warning);
                }
                
                // Recargar el timeline
                const personaMock = { id: window.currentPersonaId, observaciones: window.currentObservaciones };
                await cargarObservacionesTimeline(personaMock);
            } else {
                alert(data.error || "No se pudo guardar la observación.");
            }
        } catch (err) {
            console.error("Error al guardar observación:", err);
            alert("Error de conexión al guardar.");
        } finally {
            btnSave.disabled = false;
            btnSave.innerText = "💾 Guardar";
        }
    };

    // 2. Reconocimiento de Voz
    let recognition = null;
    let isRecording = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        if (btnMic) {
            btnMic.style.opacity = "0.5";
            btnMic.style.cursor = "not-allowed";
            btnMic.title = "Navegador no compatible con dictado de voz.";
            btnMic.onclick = () => alert("Tu navegador no soporta el reconocimiento de voz. Usa Chrome o Edge.");
        }
    } else {
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = true;
        recognition.interimResults = false;

        recognition.onresult = (event) => {
            const resultIndex = event.resultIndex;
            const transcript = event.results[resultIndex][0].transcript;
            const currentVal = textarea.value;
            const space = (currentVal === "" || currentVal.endsWith(" ")) ? "" : " ";
            textarea.value = currentVal + space + transcript;
        };

        recognition.onerror = (event) => {
            console.error("Error en reconocimiento de voz:", event.error);
            detenerGrabacion();
        };

        recognition.onend = () => {
            if (isRecording) detenerGrabacion();
        };

        function iniciarGrabacion() {
            try {
                recognition.start();
                isRecording = true;
                btnMic.style.backgroundColor = "#ffdddd";
                btnMic.style.borderColor = "#c0392b";
                btnMic.style.color = "#c0392b";
                document.getElementById("mic-icon").innerText = "🛑";
                document.getElementById("mic-text").innerText = "Detener";
                btnMic.classList.add("recording-pulse");
            } catch (e) {
                console.error(e);
            }
        }

        function detenerGrabacion() {
            try {
                recognition.stop();
            } catch (e) {}
            isRecording = false;
            btnMic.style.backgroundColor = "#fff";
            btnMic.style.borderColor = "#173D2D";
            btnMic.style.color = "#173D2D";
            document.getElementById("mic-icon").innerText = "🎙️";
            document.getElementById("mic-text").innerText = "Dictar";
            btnMic.classList.remove("recording-pulse");
        }

        btnMic.onclick = function(evt) {
            evt.preventDefault();
            if (isRecording) {
                detenerGrabacion();
            } else {
                iniciarGrabacion();
            }
        };
    }
}


//==================================================
// COLAPSO DEL CHECKLIST (Sprint 2)
//==================================================
function inicializarColapsoChecklist() {
    const panel = document.getElementById("checklist-panel");
    const chHeader = document.getElementById("checklist-header");
    const chArrow = document.getElementById("checklist-arrow");
    const chContent = document.getElementById("checklist");
    
    if (!panel || !chHeader || !chArrow || !chContent) return;

    if (chHeader.dataset.listenerBound === "true") return;
    chHeader.dataset.listenerBound = "true";

    const h2Title = chHeader.querySelector("h2");

    chHeader.addEventListener("click", () => {
        const isCollapsed = panel.style.flex === "0 0 65px" || panel.style.flexBasis === "65px";
        
        if (isCollapsed) {
            // Expandir a la derecha
            panel.style.flex = "0 0 280px";
            panel.style.minWidth = "250px";
            panel.style.padding = "25px";
            
            chHeader.style.justifyContent = "space-between";
            chHeader.style.marginBottom = "15px";
            chHeader.style.borderBottom = "1px solid #eee";
            
            if (h2Title) h2Title.style.display = "block";
            
            chContent.style.maxHeight = "1000px";
            chContent.style.opacity = "1";
            chArrow.style.transform = "rotate(0deg)";
        } else {
            // Colapsar a la izquierda
            panel.style.flex = "0 0 65px";
            panel.style.minWidth = "65px";
            panel.style.padding = "25px 10px";
            
            chHeader.style.justifyContent = "center";
            chHeader.style.marginBottom = "0px";
            chHeader.style.borderBottom = "none";
            
            if (h2Title) h2Title.style.display = "none";
            
            chContent.style.maxHeight = "0px";
            chContent.style.opacity = "0";
            chArrow.style.transform = "rotate(-90deg)"; // Apunta a la derecha
        }
    });
}


//==================================================
// VALORACIÓN ACTITUDINAL Y GRÁFICO DE RADAR
//==================================================

// Variables de control de evaluación 360
window.valoresActitudActuales = {};
window.personaEvalActual = null;

async function cargarValoracionActitudinal(persona) {
    const statusMsg = document.getElementById("actitud-status-msg");
    if (statusMsg) {
        statusMsg.innerHTML = '<span class="loading-spinner" style="border: 2px solid #f3f3f3; border-top: 2px solid #e2a100; border-radius: 50%; width: 12px; height: 12px; display: inline-block; animation: spin 1s linear infinite; vertical-align: middle;"></span> Cargando...';
    }

    // Inicializar valores de actitud a 0
    let valoresActitud = {
        "Rigor y Calidad de Ejecución": 0,
        "Receptividad al Feedback": 0,
        "Iniciativa y Ritmo Operativo": 0,
        "Comprensión y Comunicación (Idioma y Lectura)": 0,
        "Resolución y Agilidad Numérica (Cálculo Operativo)": 0,
        "Manejo Técnico de Herramientas (Terminal PDA)": 0
    };

    try {
        const respuesta = await fetch(`/api/trabajador/${persona.id}/actitud`);
        const data = await respuesta.json();

        if (data.ok) {
            valoresActitud = data.valores;
            if (statusMsg) {
                if (data.error_acceso) {
                    statusMsg.innerHTML = '⚠️ Sin permisos en Google Sheets';
                    statusMsg.style.color = '#c0392b';
                } else {
                    statusMsg.innerHTML = '✓ Sincronizado con Google Sheets';
                    statusMsg.style.color = '#27ae60';
                }
            }
        } else {
            console.error("Error al obtener valoración actitudinal:", data.error);
            if (statusMsg) {
                statusMsg.innerHTML = '⚠️ Error al cargar desde Google Sheets';
                statusMsg.style.color = '#c0392b';
            }
        }
    } catch (err) {
        console.error("Error de red al cargar valoración actitudinal:", err);
        if (statusMsg) {
            statusMsg.innerHTML = '⚠️ Error de red';
            statusMsg.style.color = '#c0392b';
        }
    }

    // Guardar variables globales en window
    window.valoresActitudActuales = valoresActitud;
    window.personaEvalActual = persona;

    // Pintar los botones según los valores recuperados
    actualizarBotonesActitudUI(valoresActitud);

    // Generar informe automático
    generarInformeAutomatico(valoresActitud);

    // Cargar historial de cambios
    cargarTimeline360(persona.id);

    // Dibujar el gráfico de radar
    actualizarRadarChart(valoresActitud);
}

function actualizarBotonesActitudUI(valores) {
    const groups = document.querySelectorAll(".actitud-btn-group");
    groups.forEach(group => {
        const actitud = group.dataset.actitud;
        const valorActivo = valores[actitud] || 0;
        
        const buttons = group.querySelectorAll(".actitud-btn-val");
        buttons.forEach(btn => {
            const btnVal = parseInt(btn.dataset.value);
            
            // Restablecer estilos de botón transparente/por defecto
            btn.style.background = "transparent";
            btn.style.color = "#4a5568";
            btn.style.boxShadow = "none";
            
            if (btnVal === valorActivo) {
                if (btnVal === 1) {
                    btn.style.background = "#fee2e2"; // rojo
                    btn.style.color = "#b91c1c";
                    btn.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";
                } else if (btnVal === 2) {
                    btn.style.background = "#fef3c7"; // amarillo/ámbar
                    btn.style.color = "#b45309";
                    btn.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";
                } else if (btnVal === 3) {
                    btn.style.background = "#dcfce7"; // verde
                    btn.style.color = "#15803d";
                    btn.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";
                }
            }
        });
    });
}

async function guardarActitudBotonDirecto(btnElement, actitud, valor) {
    const statusMsg = document.getElementById("actitud-status-msg");
    const persona = window.personaEvalActual;
    const valoresActitud = window.valoresActitudActuales;
    
    if (!persona) return;
    
    valoresActitud[actitud] = valor;
    
    // Actualizar interfaz de botones
    actualizarBotonesActitudUI(valoresActitud);
    
    // Regenerar informe automático
    generarInformeAutomatico(valoresActitud);
    
    // Actualizar el gráfico
    actualizarRadarChart(valoresActitud);
    
    if (statusMsg) {
        statusMsg.innerHTML = '💾 Guardando en Google Sheets...';
        statusMsg.style.color = '#e2a100';
    }

    try {
        const res = await fetch(`/api/trabajador/${persona.id}/actitud`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                actitud: actitud,
                valor: valor,
                nombre: persona.nombre,
                departamento: persona.departamento
            })
        });
        const responseData = await res.json();
        
        if (responseData.ok) {
            if (statusMsg) {
                statusMsg.innerHTML = '✓ Guardado en Google Sheets';
                statusMsg.style.color = '#27ae60';
            }
            // Recargar timeline de cambios
            cargarTimeline360(persona.id);
        } else {
            console.error("Error al actualizar actitud:", responseData.error);
            if (statusMsg) {
                statusMsg.innerHTML = '⚠️ Error al guardar';
                statusMsg.style.color = '#c0392b';
            }
            alert("No se pudo guardar la valoración: " + (responseData.error || "Error de permisos"));
        }
    } catch (err) {
        console.error("Error de red al actualizar actitud:", err);
        if (statusMsg) {
            statusMsg.innerHTML = '⚠️ Error de red';
            statusMsg.style.color = '#c0392b';
        }
        alert("Error de red al guardar la valoración.");
    }
}

function generarInformeAutomatico(valores) {
    const container = document.getElementById("informe-evaluacion-automatico-texto");
    if (!container) return;
    
    const totalIndicadores = Object.keys(valores).length;
    const evaluados = Object.values(valores).filter(v => v > 0);
    
    if (evaluados.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #718096; padding: 40px 10px; font-style: italic;">
                <p style="margin: 0; font-size: 1.15em;">⚠️ Sin datos suficientes</p>
                <p style="margin: 5px 0 0 0; font-size: 0.9em; line-height: 1.4;">Registre las puntuaciones en el panel izquierdo para generar el informe de evaluación automático.</p>
            </div>
        `;
        return;
    }
    
    const fortalezas = [];
    const estandar = [];
    const mejoras = [];
    
    for (const [key, val] of Object.entries(valores)) {
        if (val === 3) {
            fortalezas.push(key);
        } else if (val === 2) {
            estandar.push(key);
        } else if (val === 1) {
            mejoras.push(key);
        }
    }
    
    let html = "";
    
    // Resumen Global
    const media = (evaluados.reduce((a, b) => a + b, 0) / evaluados.length).toFixed(1);
    let valoracionGlobal = "";
    let colorGlobal = "#718096";
    if (media >= 2.5) {
        valoracionGlobal = "Excelente desempeño general";
        colorGlobal = "#15803d";
    } else if (media >= 1.7) {
        valoracionGlobal = "Desempeño estándar y autónomo";
        colorGlobal = "#b45309";
    } else {
        valoracionGlobal = "Requiere supervisión y soporte";
        colorGlobal = "#b91c1c";
    }
    
    html += `
        <div style="background: #fafbfd; border: 1px solid #eef2f6; border-radius: 8px; padding: 10px; margin-bottom: 5px;">
            <span style="font-size: 0.75em; color: #94a3b8; font-weight: bold; text-transform: uppercase; display: block;">Resumen del Perfil</span>
            <strong style="font-size: 1.05em; color: ${colorGlobal};">${valoracionGlobal}</strong>
            <div style="font-size: 0.85em; color: #475569; margin-top: 3px;">Puntuación media: <strong>${media} / 3</strong> (${evaluados.length} de ${totalIndicadores} evaluados)</div>
        </div>
    `;
    
    // Fortalezas (Excelente - 3)
    if (fortalezas.length > 0) {
        html += `
            <div style="margin-top: 5px;">
                <strong style="color: #15803d; font-size: 0.9em; display: flex; align-items: center; gap: 4px;">🚀 Fortalezas detectadas:</strong>
                <ul style="margin: 4px 0 0 0; padding-left: 18px; font-size: 0.9em; color: #334155; display: flex; flex-direction: column; gap: 3px;">
                    ${fortalezas.map(f => `<li><strong>${f}</strong>: Cumple de forma excelente, mostrando alta iniciativa y autonomía operativa.</li>`).join("")}
                </ul>
            </div>
        `;
    }
    
    // Estándar (Estándar - 2)
    if (estandar.length > 0) {
        html += `
            <div style="margin-top: 8px;">
                <strong style="color: #b45309; font-size: 0.9em; display: flex; align-items: center; gap: 4px;">✓ Nivel estándar:</strong>
                <ul style="margin: 4px 0 0 0; padding-left: 18px; font-size: 0.9em; color: #334155; display: flex; flex-direction: column; gap: 3px;">
                    ${estandar.map(e => `<li><strong>${e}</strong>: Ejecución limpia y autónoma. Se desenvuelve sin incidencias y corrige fallos al vuelo.</li>`).join("")}
                </ul>
            </div>
        `;
    }
    
    // Áreas de mejora (Insuficiente - 1)
    if (mejoras.length > 0) {
        html += `
            <div style="margin-top: 8px;">
                <strong style="color: #b91c1c; font-size: 0.9em; display: flex; align-items: center; gap: 4px;">⚠️ Oportunidades de mejora:</strong>
                <ul style="margin: 4px 0 0 0; padding-left: 18px; font-size: 0.9em; color: #334155; display: flex; flex-direction: column; gap: 3px;">
                    ${mejoras.map(m => `<li><strong>${m}</strong>: Se observan fallos o bloqueos reiterados. Requiere formación adicional o mayor acompañamiento.</li>`).join("")}
                </ul>
            </div>
        `;
    }
    
    // Conclusión y Recomendación
    let recomendacion = "";
    if (mejoras.length > 0) {
        recomendacion = "Se recomienda programar sesiones de feedback guiado centrándose en los puntos críticos marcados en rojo, y acompañamiento específico de un formador en planta.";
    } else if (fortalezas.length > 0) {
        recomendacion = "Trabajador con excelente ritmo y autonomía. Apto para tareas de mayor responsabilidad o para servir de apoyo lingüístico/operativo a compañeros.";
    } else {
        recomendacion = "Desempeño equilibrado y estable. Continuar con el seguimiento ordinario en las tareas asignadas.";
    }
    
    html += `
        <div style="margin-top: 12px; padding: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #166534; font-size: 0.82em; line-height: 1.4;">
            <strong>Recomendación:</strong> ${recomendacion}
        </div>
    `;
    
    container.innerHTML = html;
}

async function cargarTimeline360(personaId) {
    const container = document.getElementById("timeline-modificaciones-360-container");
    if (!container) return;
    
    try {
        const res = await fetch(`/api/trabajador/${personaId}/timeline-360`);
        const data = await res.json();
        
        if (data.ok && data.timeline) {
            container.innerHTML = "";
            const filtered = data.timeline.filter(log => log.indicador !== "Líneas Límite" && log.indicador !== "Volumen Límite");
            
            if (filtered.length === 0) {
                container.innerHTML = '<p style="color: #718096; font-size: 0.82em; font-style: italic; margin: 0;">No hay modificaciones registradas en esta ficha.</p>';
                return;
            }
            
            filtered.forEach(log => {
                let color = "#475569";
                let textVal = "";
                if (log.valor === "1") {
                    color = "#b91c1c";
                    textVal = "Insuficiente (1)";
                } else if (log.valor === "2") {
                    color = "#b45309";
                    textVal = "Estándar (2)";
                } else if (log.valor === "3") {
                    color = "#15803d";
                    textVal = "Excelente (3)";
                } else {
                    textVal = log.valor;
                }
                
                const logRow = document.createElement("div");
                logRow.style.fontSize = "0.82em";
                logRow.style.color = "#4a5568";
                logRow.style.display = "flex";
                logRow.style.gap = "8px";
                logRow.style.alignItems = "flex-start";
                logRow.style.padding = "6px 8px";
                logRow.style.background = "white";
                logRow.style.borderRadius = "6px";
                logRow.style.border = "1px solid #eef2f6";
                logRow.style.boxShadow = "0 1px 2px rgba(0,0,0,0.01)";
                
                logRow.innerHTML = `
                    <span style="color: #94a3b8; font-family: monospace; font-weight: 600;">[${log.fecha}]</span>
                    <span>El usuario <strong>${log.usuario}</strong> actualizó <strong>${log.indicador}</strong> a 
                    <span style="font-weight: bold; color: ${color};">${textVal}</span></span>
                `;
                container.appendChild(logRow);
            });
        }
    } catch (err) {
        console.error("Error al cargar timeline 360:", err);
        container.innerHTML = '<p style="color: #c0392b; font-size: 0.82em; margin: 0;">Error al cargar el historial.</p>';
    }
}

function mostrarExplicacionValoracion(element, actitud, valor) {
    const tooltip = document.getElementById("valoracion-tooltip");
    const title = document.getElementById("tooltip-actitud-title");
    const desc = document.getElementById("tooltip-actitud-desc");
    if (!tooltip || !title || !desc) return;
    
    const explicacion = EXPLICACIONES_VALORACION[actitud] ? EXPLICACIONES_VALORACION[actitud][valor] : "";
    if (!explicacion) return;
    
    let nivelTexto = "";
    let colorBorde = "#10b981";
    let colorTitulo = "#34d399";
    if (valor === 1) {
        nivelTexto = "1 - Insuficiente";
        colorBorde = "#ef4444";
        colorTitulo = "#f87171";
    } else if (valor === 2) {
        nivelTexto = "2 - Estándar";
        colorBorde = "#f59e0b";
        colorTitulo = "#fbbf24";
    } else {
        nivelTexto = "3 - Excelente";
        colorBorde = "#10b981";
        colorTitulo = "#34d399";
    }
    
    title.textContent = `${actitud} (${nivelTexto})`;
    title.style.color = colorTitulo;
    desc.textContent = explicacion;
    tooltip.style.borderLeftColor = colorBorde;
    
    tooltip.style.position = "fixed";
    tooltip.style.display = "block";
    tooltip.style.opacity = "0";
    
    const rect = element.getBoundingClientRect();
    const tooltipHeight = tooltip.offsetHeight;
    
    // Centrar horizontalmente arriba del botón (relativo al viewport ya que es fixed)
    const top = rect.top - tooltipHeight - 10;
    const left = rect.left + (rect.width / 2) - 150;
    
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.opacity = "1";
}

function ocultarExplicacionValoracion() {
    const tooltip = document.getElementById("valoracion-tooltip");
    if (tooltip) {
        tooltip.style.display = "none";
    }
}

const EXPLICACIONES_VALORACION = {
    "Rigor y Calidad de Ejecución": {
        1: "Comete fallos graves de forma reiterada (cantidades incorrectas, productos cambiados, omisión de líneas, mercancía dañada o carros desordenados).",
        2: "Ejecución limpia según el método establecido. Si ocurre un fallo menor (etiqueta o nivel desplazado), lo corrige en el acto sin frenar el flujo.",
        3: "Conteo exacto en el primer pase, estiba ordenada y segura, protección del producto y cero incidencias registradas."
    },
    "Receptividad al Feedback": {
        1: "Actitud defensiva o de bloqueo ante las correcciones del revisor; no subsana el error o vuelve a cometerlo en la siguiente orden.",
        2: "Acepta las observaciones con profesionalidad, arregla la incidencia de inmediato y aplica el aprendizaje en los siguientes carros.",
        3: "Trato colaborativo; agradece la notificación, pregunta dudas para erradicar la causa raíz y facilita activamente la labor de revisión."
    },
    "Iniciativa y Ritmo Operativo": {
        1: "Tiempos muertos no justificados; permanece inactivo tras finalizar una tarea a la espera de instrucciones directas.",
        2: "Flujo de trabajo continuo y autónomo; entrega el carro revisado y acude de inmediato a por la siguiente orden.",
        3: "Dinamismo y anticipación; retira carros vacíos, organiza materiales y ayuda a despejar cuellos de botella sin descuidar su puesto."
    },
    "Comprensión y Comunicación (Idioma y Lectura)": {
        1: "Dificultad para comprender instrucciones verbales básicas o interpretar códigos alfanuméricos en etiquetas/pantalla; requiere traducción constante.",
        2: "Comunicación funcional; comprende órdenes de trabajo habituales, confirma mensajes de seguridad y lee códigos y ubicaciones sin apoyo.",
        3: "Comunicación fluida y precisa; expresa incidencias técnicas con claridad y asiste como puente lingüístico a compañeros con barrera idiomática."
    },
    "Resolución y Agilidad Numérica (Cálculo Operativo)": {
        1: "Bloqueo en operaciones matemáticas elementales (sumas, restas, divisiones simples); comete errores en el conteo de unidades o capas.",
        2: "Resuelve cálculos de picking (descomposición de unidades, paquetes por bulto) en tiempo estándar sin generar descuadres.",
        3: "Rapidez de cálculo mental instantánea; optimiza la distribución y cubicaje de la carga y detecta discrepancias numéricas de inmediato."
    },
    "Manejo Técnico de Herramientas (Terminal PDA)": {
        1: "Uso lento o torpe del dispositivo; comete errores frecuentes de escaneo, se pierde en la navegación o bloquea el flujo digital.",
        2: "Uso fluido y autónomo; escanea en la secuencia correcta, confirma pantallas con soltura y opera sin asistencia técnica.",
        3: "Dominio total de la interfaz; ataja pasos dentro de la operativa, reporta incidencias digitales correctamente y resuelve bloqueos básicos de sesión."
    }
};

function actualizarRadarChart(valores) {
    const ctx = document.getElementById("radarChartActitudinal");
    if (!ctx) {
        console.error("No se encontró el elemento canvas radarChartActitudinal");
        return;
    }

    const labels = [
        "Rigor y Calidad de Ejecución",
        "Receptividad al Feedback",
        "Iniciativa y Ritmo Operativo",
        "Comprensión y Comunicación (Idioma y Lectura)",
        "Resolución y Agilidad Numérica (Cálculo Operativo)",
        "Manejo Técnico de Herramientas (Terminal PDA)"
    ];
    const datos = labels.map(label => valores[label] || 0);

    // Si ya existe el gráfico, simplemente actualizamos sus datos
    if (radarChartActitudinal) {
        radarChartActitudinal.data.datasets[0].data = datos;
        radarChartActitudinal.update();
        return;
    }

    // Detectar la versión de Chart.js
    const version = (typeof Chart !== 'undefined' && Chart.version) ? Chart.version : '3.0.0';
    const isV2 = version.startsWith('2.');

    let options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                enabled: true
            }
        }
    };

    if (isV2) {
        // Opciones para Chart.js v2
        options.scale = {
            ticks: {
                beginAtZero: true,
                max: 3,
                stepSize: 1,
                fontSize: 9,
                fontColor: '#94a3b8',
                showLabelBackdrop: false
            },
            angleLines: {
                color: '#edf2ee'
            },
            gridLines: {
                color: '#edf2ee'
            },
            pointLabels: {
                fontSize: 9,
                fontStyle: '600',
                fontFamily: 'Outfit, sans-serif',
                fontColor: '#2d3748'
            }
        };
        options.legend = { display: false };
        options.tooltips = { enabled: true };
        delete options.plugins;
    } else {
        // Opciones para Chart.js v3/v4
        options.scales = {
            r: {
                angleLines: {
                    color: '#edf2ee'
                },
                grid: {
                    color: '#edf2ee'
                },
                pointLabels: {
                    font: {
                        size: 9,
                        weight: '600',
                        family: 'Outfit, sans-serif'
                    },
                    color: '#2d3748'
                },
                suggestedMin: 0,
                suggestedMax: 3,
                ticks: {
                    stepSize: 1,
                    color: '#94a3b8',
                    backdropColor: 'transparent',
                    font: {
                        size: 8
                    }
                }
            }
        };
    }

    try {
        radarChartActitudinal = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Indicadores de Conducta',
                    data: datos,
                    backgroundColor: 'rgba(23, 61, 45, 0.2)',
                    borderColor: '#173D2D',
                    pointBackgroundColor: '#173D2D',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#173D2D',
                    borderWidth: 2
                }]
            },
            options: options
        });
        console.log("Gráfico de radar actitudinal creado con éxito usando Chart.js v" + version);
    } catch (e) {
        console.error("Error al inicializar el gráfico de radar:", e);
    }
}

async function cargarFormacionTrabajador(persona) {
    const camaraHrs = document.getElementById("horas-recibidas-camara");
    const aulaHrs = document.getElementById("horas-recibidas-aula");
    const totalHrs = document.getElementById("horas-recibidas-total");
    const timeline = document.getElementById("timeline-clases-recibidas");
    
    if (!timeline) return;
    
    try {
        const res = await fetch(`/api/trabajador/${persona.id}/formacion`);
        if (!res.ok) throw new Error("Error al obtener clases");
        const data = await res.json();
        
        // Rellenar métricas de horas
        if (camaraHrs) camaraHrs.textContent = `${data.horas_camara}h`;
        if (aulaHrs) aulaHrs.textContent = `${data.horas_aula}h`;
        if (totalHrs) totalHrs.textContent = `${data.total_horas}h`;
        
        // Rellenar timeline
        timeline.innerHTML = "";
        if (data.clases.length === 0) {
            timeline.innerHTML = '<div style="text-align: center; padding: 20px; color: #7f8c8d; font-style: italic;">No hay clases de formación registradas para este trabajador.</div>';
            return;
        }
        
        data.clases.forEach(c => {
            const item = document.createElement("div");
            item.style.display = "flex";
            item.style.alignItems = "center";
            item.style.justifyContent = "space-between";
            item.style.background = document.body.classList.contains("dark-mode") ? "#1e293b" : "#f8f9fa";
            item.style.padding = "10px 15px";
            item.style.borderRadius = "8px";
            item.style.border = "1px solid " + (document.body.classList.contains("dark-mode") ? "#334155" : "#edf2ee");
            item.style.marginBottom = "8px";
            
            // Si estamos en dark mode, ajustar colores de badges
            const typeLabel = c.tipo === "Cámara" 
                ? `<span style="background: ${document.body.classList.contains("dark-mode") ? "#1e3a5f" : "#e3f2fd"}; color: #2196f3; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">📹 Cámara</span>`
                : `<span style="background: ${document.body.classList.contains("dark-mode") ? "#4a2a00" : "#fff3e0"}; color: #ff9800; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">🏫 Aula</span>`;

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <span style="font-size: 0.82rem; color: #7f8c8d; font-weight: bold; min-width: 75px;">📅 ${c.fecha}</span>
                    ${typeLabel}
                    <span style="font-size: 0.9rem; font-weight: 600;">Docente: <a href="/formador/${c.formador_id}" style="text-decoration: none; color: #1a5c37; font-weight: 700;">${c.formador_nombre}</a></span>
                </div>
                <strong style="font-size: 0.95rem;">⏱️ ${c.duracion}h</strong>
            `;
            timeline.appendChild(item);
        });
    } catch (err) {
        console.error("Error cargando formación de trabajador:", err);
        timeline.innerHTML = '<div style="text-align: center; padding: 20px; color: #e74c3c;">❌ Error al recuperar el historial de formación.</div>';
    }
}

function formatearResumenAnalitico(text, persona) {
    if (!text || text === "Todavía no generado.") {
        return `<p style="color:#999; font-style:italic; font-size:0.92em; margin:0;">Todavía no generado.</p>`;
    }
    
    const lines = text.split("\n");
    
    let html = "";
    let conclusionHeader = "";
    let conclusionParagraphs = [];
    let grupo1Lines = [];
    let grupo2Lines = [];
    let currentSection = "general"; // 'general', 'g1', 'g2'
    
    lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed) return;
        
        let lower = trimmed.toLowerCase();
        if (lower.includes("estado general del periodo de prueba")) {
            currentSection = "general";
            return;
        } else if (lower.includes("grupo 1:") || (lower.includes("grupo 1") && lower.includes("rendimiento"))) {
            currentSection = "g1";
            return;
        } else if (lower.includes("grupo 2:") || (lower.includes("grupo 2") && lower.includes("competencia"))) {
            currentSection = "g2";
            return;
        }
        
        if (currentSection === "general") {
            if (trimmed.includes("⚠️") || lower.includes("conclusión:") || lower.includes("conclusion:")) {
                conclusionHeader = trimmed;
            } else {
                conclusionParagraphs.push(trimmed);
            }
        } else if (currentSection === "g1") {
            grupo1Lines.push(trimmed);
        } else if (currentSection === "g2") {
            grupo2Lines.push(trimmed);
        }
    });
    
    // 1. Cabecera principal
    html += `<h4 style="font-size: 1.1em; font-weight: 800; color: #2b6cb0; margin-top: 5px; margin-bottom: 8px; text-transform: uppercase; font-family: inherit;">ESTADO GENERAL DEL PERIODO DE PRUEBA</h4>`;
    
    // 2. Recuadro de Conclusión y Nota
    if (conclusionHeader) {
        let color = "#b7791f"; // amarillo/naranja por defecto
        let bgColor = "#fefcbf";
        let borderColor = "#fbd38d";
        
        let lowerH = conclusionHeader.toLowerCase();
        if (lowerH.includes("alto")) {
            color = "#c53030"; // rojo
            bgColor = "#fff5f5";
            borderColor = "#feb2b2";
        } else if (lowerH.includes("bajo")) {
            color = "#2f855a"; // verde
            bgColor = "#f0fff4";
            borderColor = "#9ae6b4";
        }
        
        // Intentar extraer la nota sobre 10
        let notaMatch = conclusionHeader.match(/nota\s+global:\s*([\d.,]+)\s*\/\s*10/i);
        let notaHtml = "";
        if (notaMatch && notaMatch[1]) {
            let nota = notaMatch[1];
            let badgeBg = "#edf2f7";
            let badgeColor = "#4a5568";
            let notaNum = parseFloat(nota.replace(",", "."));
            if (notaNum >= 8) {
                badgeBg = "#c6f6d5"; // verde claro
                badgeColor = "#22543d";
            } else if (notaNum >= 5) {
                badgeBg = "#feebc8"; // naranja claro
                badgeColor = "#744210";
            } else {
                badgeBg = "#fed7d7"; // rojo claro
                badgeColor = "#742a2a";
            }
            notaHtml = `<span style="background: ${badgeBg}; color: ${badgeColor}; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.85em; display: inline-block; vertical-align: middle;">Nota: ${nota}/10</span>`;
        }
        
        // Limpiar emojis iniciales, remover la nota global del título para no duplicarla y limpiar formato markdown
        let cleanTitle = conclusionHeader.replace(/\s*\|\s*nota\s+global:\s*[\d.,]+\s*\/\s*10/i, "").trim();
        cleanTitle = cleanTitle.replace(/^[\*\s⚠️]+/, "").replace(/[\*\s]+$/, "").replace(/\*\*/g, "").trim();
        
        html += `<div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-left: 5px solid ${color}; padding: 14px 16px; border-radius: 8px; margin-top: 10px; margin-bottom: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); font-family: inherit; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: flex-start; flex-wrap: wrap; gap: 12px; width: 100%; border-bottom: 1px solid ${borderColor}; padding-bottom: 6px; margin-bottom: 2px;">
                <h5 style="margin: 0; font-size: 1.05em; font-weight: 800; color: ${color}; font-family: inherit; display: flex; align-items: center; gap: 6px;">
                    ⚠️ ${cleanTitle}
                </h5>
                ${notaHtml}
            </div>`;
            
        conclusionParagraphs.forEach(line => {
            let clean = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
            html += `<p style="margin: 0; font-size: 0.95em; color: #4a5568; line-height: 1.5; text-align: justify; font-family: inherit;">${clean}</p>`;
        });
        
        html += `</div>`;
    }
    
    // Función auxiliar para renderizar viñetas de los dos grupos
    const renderGrupoLines = (lines) => {
        let sHtml = "";
        lines.forEach(line => {
            let trimmed = line.trim();
            if (trimmed.startsWith("*") || trimmed.startsWith("•") || trimmed.startsWith("-")) {
                let clean = trimmed.substring(1).trim();
                clean = clean.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
                
                if (clean.includes(":")) {
                    let parts = clean.split(":");
                    let label = parts[0].trim();
                    let desc = parts.slice(1).join(":").trim();
                    clean = `<strong>${label}:</strong> ${desc}`;
                }
                
                sHtml += `<div style="margin-left: 5px; margin-bottom: 8px; font-size: 0.92em; color: #4a5568; line-height: 1.45; display: flex; align-items: flex-start; gap: 6px;">
                    <span style="color:#2b6cb0; font-size: 1.1em; line-height: 1.1;">•</span>
                    <span>${clean}</span>
                </div>`;
            } else {
                let clean = trimmed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
                sHtml += `<p style="margin-top: 6px; margin-bottom: 10px; font-size: 0.92em; color: #4a5568; line-height: 1.45; text-align: justify; font-family: inherit;">${clean}</p>`;
            }
        });
        return sHtml;
    };
    
    // 3. Renderizar los dos grupos
    // Grupo 1: Rendimiento y Producción
    html += `<div style="margin-top: 15px; margin-bottom: 15px; border: 1px solid #edf2ee; border-radius: 8px; padding: 12px; background: #fafcfa;">
        <h4 style="font-size: 0.95em; font-weight: 800; color: #173D2D; margin-top: 0; margin-bottom: 10px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; text-transform: uppercase;">
            📊 Grupo 1: Rendimiento y Producción
        </h4>`;
    if (grupo1Lines.length > 0) {
        html += renderGrupoLines(grupo1Lines);
    } else {
        html += `<p style="font-size:0.9em; color:#718096; font-style:italic; margin:0;">Sin datos de producción registrados.</p>`;
    }
    html += `</div>`;
    
    // Grupo 2: Competencias, Conducta y Seguimiento
    html += `<div style="margin-top: 15px; margin-bottom: 15px; border: 1px solid #edf2ee; border-radius: 8px; padding: 12px; background: #fafcfa;">
        <h4 style="font-size: 0.95em; font-weight: 800; color: #173D2D; margin-top: 0; margin-bottom: 10px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; text-transform: uppercase;">
            🛠️ Grupo 2: Competencias, Conducta y Seguimiento
        </h4>`;
    if (grupo2Lines.length > 0) {
        html += renderGrupoLines(grupo2Lines);
    } else {
        html += `<p style="font-size:0.9em; color:#718096; font-style:italic; margin:0;">Sin registros de seguimiento.</p>`;
    }
    html += `</div>`;
    
    return html;
}

function inicializarResumenIA(persona) {
    const btn = document.getElementById("btn-generar-resumen-ia");
    const btnEdit = document.getElementById("btn-editar-resumen");
    const checkValidado = document.getElementById("check-resumen-validado");
    
    if (!btn) return;
    
    // 1. Configurar check de validación
    if (checkValidado) {
        checkValidado.checked = (persona.resumen_validado === "SÍ");
        checkValidado.onchange = async function() {
            const val = checkValidado.checked ? "SÍ" : "NO";
            try {
                const res = await fetch("/api/persona/actualizar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: window.currentPersonaId,
                        campo: "resumen_validado",
                        valor: val
                    })
                });
                const data = await res.json();
                if (!data.ok) {
                    alert(data.error || "No se pudo guardar la validación");
                    checkValidado.checked = !checkValidado.checked; // Revertir
                }
            } catch (err) {
                console.error(err);
                alert("Error de conexión al guardar validación.");
                checkValidado.checked = !checkValidado.checked; // Revertir
            }
        };
    }
    
    // 2. Configurar botón Editar/Guardar
    let isEditing = false;
    if (btnEdit) {
        btnEdit.onclick = async function() {
            const container = document.getElementById("ia-container");
            if (!container) return;
            
            if (!isEditing) {
                // Entrar en modo edición
                isEditing = true;
                btnEdit.innerHTML = "💾 Guardar";
                btnEdit.style.background = "#173D2D";
                btnEdit.style.color = "#fff";
                
                const rawText = window.rawResumenAnalitico || "";
                container.innerHTML = `
                    <textarea id="edit-resumen-textarea" style="width: 100%; min-height: 320px; font-family: inherit; font-size: 0.92em; padding: 12px; border-radius: 8px; border: 1px solid #ccc; line-height: 1.5; color: #333; outline: none; box-shadow: inset 0 1px 3px rgba(0,0,0,0.05); resize: vertical;">${rawText === "Todavía no generado." ? "" : rawText}</textarea>
                `;
                btn.disabled = true;
            } else {
                // Guardar cambios y volver a lectura
                const textarea = document.getElementById("edit-resumen-textarea");
                if (!textarea) return;
                const newText = textarea.value.trim() || "Todavía no generado.";
                
                btnEdit.disabled = true;
                btnEdit.innerHTML = "💾 Guardando...";
                
                try {
                     const res = await fetch("/api/persona/actualizar", {
                         method: "POST",
                         headers: { "Content-Type": "application/json" },
                         body: JSON.stringify({
                             id: window.currentPersonaId,
                             campo: "resumen_analitico",
                             valor: newText
                         })
                     });
                     const data = await res.json();
                     if (data.ok) {
                         window.rawResumenAnalitico = newText;
                         container.innerHTML = formatearResumenAnalitico(newText, persona);
                         isEditing = false;
                         btnEdit.innerHTML = "✏️ Editar";
                         btnEdit.style.background = "#fff";
                         btnEdit.style.color = "#173D2D";
                         btn.disabled = false;
                     } else {
                         alert(data.error || "No se pudo guardar la modificación.");
                     }
                } catch (err) {
                    console.error(err);
                    alert("Error de conexión al guardar.");
                } finally {
                    btnEdit.disabled = false;
                }
            }
        };
    }
    
    // 3. Configurar botón Generar Informe
    btn.onclick = async function() {
        const id = window.currentPersonaId;
        if (!id) return;
        
        btn.disabled = true;
        if (btnEdit) btnEdit.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = "✨ Generando...";
        const container = document.getElementById("ia-container");
        container.innerHTML = `<span style="color:#666; font-style:italic; font-size: 0.95em; display:flex; align-items:center; gap:8px;">
            <svg style="width:16px; height:16px; animation: spin 1s linear infinite;" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" style="opacity:0.25;"></circle>
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style="opacity:0.75;"></path>
            </svg>
            Analizando datos y redactando informe...
        </span>`;
        
        if (!document.getElementById("spin-keyframes")) {
            const style = document.createElement("style");
            style.id = "spin-keyframes";
            style.textContent = "@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }";
            document.head.appendChild(style);
        }
        
        try {
            const res = await fetch(`/api/trabajador/${id}/generar_resumen_ia`, {
                method: "POST"
            });
            const data = await res.json();
            if (data.ok) {
                window.rawResumenAnalitico = data.resumen;
                container.innerHTML = formatearResumenAnalitico(data.resumen, persona);
                // Si acabamos de generar, desmarcamos el validado para que tengan que revisarlo
                if (checkValidado) {
                    checkValidado.checked = false;
                    await fetch("/api/persona/actualizar", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            id: window.currentPersonaId,
                            campo: "resumen_validado",
                            valor: "NO"
                        })
                    });
                }
            } else {
                let errorMsg = data.error || "Error desconocido";
                if (errorMsg.includes("Gemini API has not been used in project") || errorMsg.includes("SERVICE_DISABLED")) {
                    errorMsg = `El API de Gemini está desactivado en Google Cloud. Por favor, actívalo haciendo clic en el siguiente enlace:<br><br>
                    <a href="https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=140900199627" target="_blank" style="color:#7c3aed; font-weight:bold; text-decoration:underline;">Activar Gemini API en Google Cloud</a><br><br>
                    O bien, define tu propia clave <code>GEMINI_API_KEY</code> en el archivo <code>.env</code> del proyecto.`;
                }
                container.innerHTML = `<span style="color:#e53e3e; font-size:0.9em; display:block; padding:10px 0;">⚠️ Error al generar el informe: ${errorMsg}</span>`;
            }
        } catch (err) {
            console.error("Error al generar resumen IA:", err);
            container.innerHTML = `<span style="color:#e53e3e; font-size:0.95em; display:block; padding:10px 0;">⚠️ Error de conexión: ${err.message}</span>`;
        } finally {
            btn.disabled = false;
            if (btnEdit) btnEdit.disabled = false;
            btn.innerHTML = originalText;
        }
    };
}

// Auto-imprimir expediente si el parámetro print=true está en la URL
(function() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") === "true") {
        window.addEventListener("load", function() {
            setTimeout(function() {
                window.print();
            }, 1000);
        });
    }
})();

let lastSemaforoArgs = null;
function actualizarCabeceraSemaforo(actual_prod, prod_ideal, actual_error, error_ideal) {
    const alertContainer = document.getElementById("alerta-codigo-container");
    if (!alertContainer) return;

    const dept = window.currentPersona && window.currentPersona.departamento 
        ? window.currentPersona.departamento.toUpperCase().trim() 
        : "";
    if (dept && dept.includes("ENCAJADO")) {
        alertContainer.style.display = "none";
        return;
    }
    
    if (actual_prod !== undefined) {
        lastSemaforoArgs = { actual_prod, prod_ideal, actual_error, error_ideal };
    } else if (lastSemaforoArgs) {
        actual_prod = lastSemaforoArgs.actual_prod;
        prod_ideal = lastSemaforoArgs.prod_ideal;
        actual_error = lastSemaforoArgs.actual_error;
        error_ideal = lastSemaforoArgs.error_ideal;
    } else {
        return;
    }
    
    const diff_prod = actual_prod - prod_ideal;
    const diff_error = actual_error - error_ideal;
    
    let color = "";
    let bg = "";
    let border = "";
    let badge = "";
    let desc = "";
    let emoji = "";
    
    // Consultar riesgo manual desde el badge si existe
    const badgeRiesgo = document.getElementById("badge-riesgo");
    let manualRiesgo = "";
    if (badgeRiesgo) {
        const text = badgeRiesgo.textContent.toUpperCase();
        if (text.includes("ALTO")) manualRiesgo = "ROJO";
        else if (text.includes("MEDIO")) manualRiesgo = "AMARILLO";
        else if (text.includes("BAJO")) manualRiesgo = "VERDE";
    }
    
    if (manualRiesgo) {
        badge = manualRiesgo;
    } else if (diff_prod < -15 || diff_error > 1.0) {
        badge = "ROJO";
    } else if (diff_prod >= 0 && diff_error <= 0) {
        badge = "VERDE";
    } else {
        badge = "AMARILLO";
    }
    
    if (badge === "ROJO") {
        color = "#c53030";
        bg = "#fff5f5";
        border = "#feb2b2";
        desc = "Rendimiento crítico. La productividad está significativamente por debajo del modelo ideal o la tasa de errores excede la tolerancia esperada.";
        emoji = "🔴";
    } else if (badge === "VERDE") {
        color = "#2f855a";
        bg = "#f0fff4";
        border = "#9ae6b4";
        desc = "Rendimiento óptimo. El colaborador iguala o supera los objetivos comparativos tanto en productividad como en calidad de operación.";
        emoji = "🟢";
    } else {
        color = "#c05621";
        bg = "#fffaf0";
        border = "#fbd38d";
        badge = "AMARILLO";
        desc = "Rendimiento justo. El desempeño se encuentra en el rango aceptable próximo al modelo ideal, pero requiere seguimiento de áreas específicas.";
        emoji = "🟡";
    }
    
    alertContainer.style.display = "block";
    alertContainer.innerHTML = `
        <div style="background: ${bg}; border: 1.5px solid ${border}; color: ${color}; padding: 10px 16px; border-radius: 10px; display: inline-flex; flex-direction: column; gap: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.02); max-width: 460px; transition: all 0.3s ease;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.05em;">
                <span>${emoji}</span>
                <span>CÓDIGO ${badge}</span>
            </div>
            <div style="font-size: 0.8em; color: #4a5568; line-height: 1.35; font-weight: 500;">
                ${desc}
            </div>
        </div>
    `;
}

function mostrarSemaforoIndeterminado(titulo, mensaje) {
    const alertContainer = document.getElementById("alerta-codigo-container");
    if (!alertContainer) return;
    
    alertContainer.style.display = "block";
    alertContainer.innerHTML = `
        <div style="background: #f8f9fa; border: 1.5px solid #e2e8f0; color: #4a5568; padding: 10px 16px; border-radius: 10px; display: inline-flex; flex-direction: column; gap: 4px; max-width: 460px;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.05em; color: #718096;">
                <span>⚪</span>
                <span>CÓDIGO INDETERMINADO (${titulo})</span>
            </div>
            <div style="font-size: 0.8em; color: #718096; line-height: 1.35; font-weight: 500;">
                ${mensaje}
            </div>
        </div>
    `;
}


async function cargarHistorialSacador() {
    const badgeNota = document.getElementById("nota-sacador-badge");
    const tbody = document.getElementById("historial-sacador-body");
    const panel = document.getElementById("panel-historial-sacador");
    
    const badgeNotaEnc = document.getElementById("nota-encajador-badge");
    const tbodyEnc = document.getElementById("historial-encajador-body");
    const panelEnc = document.getElementById("panel-historial-encajador");
    
    if (!tbody || !panel) return;
    
    // Obtener departamento para validar si debemos mostrar el panel
    const dept = window.currentPersona && window.currentPersona.departamento 
        ? window.currentPersona.departamento.toUpperCase().trim() 
        : "";
        
    // Si es un departamento de encajadores
    if (dept && dept.includes("ENCAJADO")) {
        panel.style.display = "none";
        if (panelEnc) panelEnc.style.display = "flex";
        
        if (!tbodyEnc) return;
        
        try {
            const res = await fetch(`/api/persona/${id}/historial-encajador`);
            const data = await res.json();
            
            if (!data || data.length === 0) {
                tbodyEnc.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 30px; color: #999; font-style: italic;">
                            No hay registros de embalaje para este trabajador en los últimos 14 días.
                        </td>
                    </tr>
                `;
                return;
            }
            
            // Renderizar las filas de la tabla de encajador
            let html = "";
            data.forEach(row => {
                const vol_h = row.volumen_hora !== undefined && row.volumen_hora !== null ? `${parseFloat(row.volumen_hora).toFixed(2)} m³` : "-";
                const lh = row.lineas_hora || "-";
                const tot = row.total_lineas || "0";
                
                // Rendimiento %
                const rendRaw = parseFloat(row.rendimiento) || 0.0;
                const rendPct = Math.round(rendRaw * 100);
                const rendText = `${rendPct}%`;
                
                // Barra de porcentaje visual para líneas/hora (basado en meta excelente de 120 para encajador)
                const pct = Math.min(100, Math.round((parseFloat(lh) || 0) / 120 * 100));
                let barColor = "#e53e3e"; // Rojo
                if (pct >= 85) barColor = "#38a169"; // Verde
                else if (pct >= 60) barColor = "#dd6b20"; // Naranja
                else if (pct >= 40) barColor = "#d69e2e"; // Amarillo
                
                const progressHtml = `
                    <div style="display: flex; align-items: center; gap: 8px; justify-content: flex-end;">
                        <span style="font-weight: 700;">${lh}</span>
                        <div style="width: 50px; background: #e2e8f0; height: 6px; border-radius: 4px; overflow: hidden; display: inline-block; vertical-align: middle;">
                            <div style="background: ${barColor}; width: ${pct}%; height: 100%;"></div>
                        </div>
                    </div>
                `;
                
                html += `
                    <tr style="border-bottom: 1px solid #edf2ee; transition: background 0.2s;">
                        <td style="padding: 12px 6px;">${row.fecha || "-"}</td>
                        <td style="padding: 12px 6px; text-align: right;">${progressHtml}</td>
                        <td style="padding: 12px 6px; text-align: right; font-weight: 600;">${tot}</td>
                        <td style="padding: 12px 6px; text-align: right; color: #4a5568;">${vol_h}</td>
                        <td style="padding: 12px 6px; text-align: right; font-weight: 700; color: ${rendPct >= 85 ? '#2f855a' : '#c53030'};">${rendText}</td>
                    </tr>
                `;
            });
            tbodyEnc.innerHTML = html;
            
            // Mostrar nota si existe en el badge de encajadores
            if (window.currentPersona && window.currentPersona.nota > 0) {
                if (badgeNotaEnc) {
                    badgeNotaEnc.textContent = `Nota General: ${window.currentPersona.nota.toFixed(2)} / 10`;
                    badgeNotaEnc.style.display = "inline-block";
                }
            } else {
                if (badgeNotaEnc) badgeNotaEnc.style.display = "none";
            }
        } catch (err) {
            console.error("Error loading encajador history:", err);
            tbodyEnc.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 20px; color: #e53e3e; font-style: italic;">
                        Error al cargar el historial de embalaje.
                    </td>
                </tr>
            `;
        }
        return;
    }
    
    // Si no es un departamento de sacadores o taller natural, ocultar el panel de sacador y encajador
    if (dept && !dept.includes("SACADO") && !dept.includes("TALLER NATURAL")) {
        panel.style.display = "none";
        if (panelEnc) panelEnc.style.display = "none";
        return;
    }
    
    if (panelEnc) panelEnc.style.display = "none";
    panel.style.display = "flex";
    
    try {
        const res = await fetch(`/api/persona/${id}/historial-sacador`);
        const data = await res.json();
        
        if (!data || data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 30px; color: #999; font-style: italic;">
                        No hay registros de preparación para este trabajador en los últimos 14 días.
                    </td>
                </tr>
            `;
            return;
        }
        
        // Renderizar las filas de la tabla
        let html = "";
        data.forEach(row => {
            const ipt = row.ipt || "-";
            const vol = row.volumen !== undefined && row.volumen !== null ? `${parseFloat(row.volumen).toFixed(2)} m³` : "-";
            const lh = row.lineas_hora || "-";
            
            // Barra de porcentaje visual para líneas/hora (basado en meta excelente de 100)
            const pct = Math.min(100, Math.round((parseFloat(lh) || 0) / 100 * 100));
            let barColor = "#e53e3e"; // Rojo
            if (pct >= 85) barColor = "#38a169"; // Verde
            else if (pct >= 60) barColor = "#dd6b20"; // Naranja
            else if (pct >= 40) barColor = "#d69e2e"; // Amarillo
            
            const progressHtml = `
                <div style="display: flex; align-items: center; gap: 8px; justify-content: flex-end;">
                    <span style="font-weight: 700;">${lh}</span>
                    <div style="width: 50px; background: #e2e8f0; height: 6px; border-radius: 4px; overflow: hidden; display: inline-block; vertical-align: middle;">
                        <div style="background: ${barColor}; width: ${pct}%; height: 100%;"></div>
                    </div>
                </div>
            `;
            
            html += `
                <tr style="border-bottom: 1px solid #edf2ee; transition: background 0.2s;">
                    <td style="padding: 12px 6px;">${row.fecha || "-"}</td>
                    <td style="padding: 12px 6px;"><strong>${row.coleccion || "-"}</strong></td>
                    <td style="padding: 12px 6px; text-align: center;"><span class="badge" style="background: #edf2f7; color: #4a5568; font-size: 0.85em; padding: 2px 6px; border-radius: 4px;">${ipt}</span></td>
                    <td style="padding: 12px 6px; color: #718096;">${row.hora_inicio || "-"}</td>
                    <td style="padding: 12px 6px;">${row.tren || "-"}</td>
                    <td style="padding: 12px 6px; text-align: right; font-weight: 600;">${row.lineas !== undefined ? row.lineas : "-"}</td>
                    <td style="padding: 12px 6px; text-align: right; color: #718096;">${row.lineas_previa !== undefined ? row.lineas_previa : "-"}</td>
                    <td style="padding: 12px 6px; text-align: center; font-family: monospace;">${row.tiempo || "-"}</td>
                    <td style="padding: 12px 6px; text-align: right;">${progressHtml}</td>
                    <td style="padding: 12px 6px; text-align: right; font-weight: 600; color: #2b6cb0;">${vol}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        
        // Mostrar nota si existe
        if (window.currentPersona && window.currentPersona.nota > 0) {
            badgeNota.textContent = `Nota General: ${window.currentPersona.nota.toFixed(2)} / 10`;
            badgeNota.style.display = "inline-block";
        } else {
            badgeNota.style.display = "none";
        }
    } catch (err) {
        console.error("Error al cargar historial sacador:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 20px; color: #e53e3e; font-style: italic;">
                    Error al conectar con la API de historial de sacador.
                </td>
            </tr>
        `;
    }
}

async function inicializarIntervenciones(persona) {
    const btnSave = document.getElementById("btn-guardar-intervencion");
    const selectTipo = document.getElementById("nueva-intervencion-tipo");
    const selectMotivo = document.getElementById("nueva-intervencion-motivo");
    const selectAutor = document.getElementById("nueva-intervencion-autor");
    const dateInput = document.getElementById("nueva-intervencion-fecha-seg");
    const textarea = document.getElementById("nueva-intervencion-desc");
    const checkSalix = document.getElementById("nueva-intervencion-salix");
    
    if (!btnSave) return;
    
    // 1. Fecha por defecto (+3 días)
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    dateInput.value = `${year}-${month}-${day}`;
    
    // 2. Cargar Formadores con usuario activo
    if (selectAutor) {
        selectAutor.innerHTML = "";
        try {
            fetch("/api/usuarios")
                .then(res => res.json())
                .then(usuarios => {
                    if (Array.isArray(usuarios)) {
                        const usuariosActivos = usuarios.filter(u => u.activo === "Sí");
                        const nombresUsuarios = [...new Set(usuariosActivos.map(u => u.nombre).filter(Boolean))].sort();
                        nombresUsuarios.forEach(nombre => {
                            const opt = document.createElement("option");
                            opt.value = nombre;
                            
                            // Nombre abreviado para el label de intervenciones
                            let label = nombre;
                            if (nombre.toUpperCase().includes("FRANCISCO ALBERT")) label = "Kiko";
                            else if (nombre.toUpperCase().includes("VICENTE LLOPIS")) label = "Vicente";
                            else if (nombre.toUpperCase().includes("EUGENIO COLOMER")) label = "Eugenio";
                            else {
                                label = nombre.split(" ")[0]; // Primer nombre
                            }
                            
                            opt.textContent = label;
                            
                            let isSelected = false;
                            if (window.currentUser && window.currentUser.nombre) {
                                isSelected = nombre.toUpperCase().trim() === window.currentUser.nombre.toUpperCase().trim();
                            } else {
                                isSelected = nombre.toUpperCase().includes("FRANCISCO ALBERT ESCUDERO") || nombre.toUpperCase().includes("ALBERT ESCUDERO");
                            }
                            if (isSelected) {
                                opt.selected = true;
                            }
                            selectAutor.appendChild(opt);
                        });
                    }
                });
        } catch (e) {
            console.error("Error al cargar usuarios para intervenciones:", e);
        }
    }
    
    // 3. Listener guardar
    btnSave.onclick = async function() {
        const desc = textarea.value.trim();
        if (!desc) {
            alert("Por favor, escribe una descripción de la intervención.");
            return;
        }
        
        const tipo = selectTipo.value;
        const motivo = selectMotivo.value;
        const autor = selectAutor.value;
        const fechaSeg = dateInput.value;
        const enviarSalix = checkSalix ? checkSalix.checked : false;
        
        if (!fechaSeg) {
            alert("Por favor, selecciona una fecha de seguimiento.");
            return;
        }
        
        btnSave.disabled = true;
        btnSave.innerText = "Registrando...";
        
        try {
            const res = await fetch(`/api/trabajador/${window.currentPersonaId}/intervenciones`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tipo: tipo,
                    motivo: motivo,
                    autor: autor,
                    fecha_seguimiento: fechaSeg,
                    descripcion: desc,
                    enviar_salix: enviarSalix,
                    estado: "Pendiente"
                })
            });
            const data = await res.json();
            if (data && data.ok) {
                textarea.value = "";
                if (checkSalix) checkSalix.checked = false;
                
                if (data.warning) {
                    alert(data.warning);
                }
                
                await cargarIntervencionesTimeline();
            } else {
                alert("Error al guardar: " + data.error);
            }
        } catch (err) {
            alert("Error de conexión: " + err.message);
        } finally {
            btnSave.disabled = false;
            btnSave.innerText = "💾 Registrar Seguimiento";
        }
    };
    
    // 4. Cargar timeline
    await cargarIntervencionesTimeline();
}

async function cargarIntervencionesTimeline() {
    const timelineDiv = document.getElementById("intervenciones-timeline");
    if (!timelineDiv) return;
    
    try {
        const res = await fetch(`/api/trabajador/${window.currentPersonaId}/intervenciones`);
        const data = await res.json();
        
        if (!data || data.length === 0) {
            timelineDiv.innerHTML = `
                <div style="text-align: center; color: #82928a; padding: 30px 10px; font-style: italic; font-size: 0.88em;">
                    🌱 No hay acciones de intervención registradas para este trabajador.
                </div>
            `;
            return;
        }
        
        data.sort((a, b) => b.id_intervencion.localeCompare(a.id_intervencion));
        
        let html = "";
        data.forEach(item => {
            let badgeBg = "#edf2f7";
            let badgeColor = "#4a5568";
            const est = item.estado.toUpperCase().trim();
            
            if (est === "PENDIENTE") {
                badgeBg = "#edf2f7";
                badgeColor = "#4a5568";
            } else if (est === "EN SEGUIMIENTO") {
                badgeBg = "#ebf8ff";
                badgeColor = "#2b6cb0";
            } else if (est === "RESUELTO" || est === "RESUELTA") {
                badgeBg = "#f0fff4";
                badgeColor = "#38a169";
            } else if (est === "NO EVOLUCIONA") {
                badgeBg = "#fff5f5";
                badgeColor = "#c53030";
            }
            
            let actionButtons = "";
            if (est === "PENDIENTE" || est === "EN SEGUIMIENTO") {
                actionButtons = `
                    <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                        <button onclick="resolverIntervencion('${item.id_intervencion}', 'Resuelto')" style="background: #38a169; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.75em; font-weight: bold; cursor: pointer;">✅ Evoluciona</button>
                        <button onclick="resolverIntervencion('${item.id_intervencion}', 'No evoluciona')" style="background: #e53e3e; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.75em; font-weight: bold; cursor: pointer;">❌ No Evoluciona</button>
                    </div>
                `;
            }
            
            let cierreHtml = "";
            if (item.observaciones_cierre) {
                cierreHtml = `
                    <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #edf2ee; font-size: 0.78em; color: #4a5568; font-style: italic;">
                        <strong>Evolución:</strong> ${escapeHtml(item.observaciones_cierre)}
                    </div>
                `;
            }
            
            html += `
                <div style="border: 1px solid #edf2ee; border-radius: 10px; padding: 12px; background: #fafbfc; display: flex; flex-direction: column; gap: 4px; box-sizing: border-box; text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">
                        <div>
                            <span style="font-weight: 800; font-size: 0.82em; color: #2d3748; background: #edf2f7; padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${escapeHtml(item.tipo)}</span>
                            <span style="font-weight: 700; font-size: 0.8em; color: #4a5568; border: 1px solid #cbd5e0; padding: 1px 5px; border-radius: 4px;">${escapeHtml(item.motivo)}</span>
                        </div>
                        <span style="font-size: 0.75em; font-weight: 800; text-transform: uppercase; background: ${badgeBg}; color: ${badgeColor}; padding: 2px 6px; border-radius: 4px;">${escapeHtml(item.estado)}</span>
                    </div>
                    
                    <div style="font-size: 0.8em; color: #2d3748; line-height: 1.35; margin-top: 4px; white-space: pre-line;">
                        ${escapeHtml(item.descripcion)}
                    </div>
                    
                    ${cierreHtml}
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 0.72em; color: #718096; flex-wrap: wrap; gap: 4px;">
                        <span>Fecha: ${escapeHtml(item.fecha_creacion)} | Rechequeo: <strong>${escapeHtml(item.fecha_seguimiento)}</strong></span>
                        <span>Por: ${escapeHtml(item.autor)}</span>
                    </div>
                    
                    ${actionButtons}
                </div>
            `;
        });
        timelineDiv.innerHTML = html;
    } catch (err) {
        console.error("Error al cargar intervenciones:", err);
        timelineDiv.innerHTML = `<span style="color:red; font-size: 0.9em;">Error al conectar con la base de datos de seguimiento.</span>`;
    }
}

window.resolverIntervencion = async function(id_intervencion, nuevoEstado) {
    const notas = prompt(`Introduce comentarios sobre la evolución del trabajador para marcar como "${nuevoEstado}":`);
    if (notas === null) return;
    
    try {
        const res = await fetch(`/api/intervenciones/${id_intervencion}/actualizar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                estado: nuevoEstado,
                observaciones_cierre: notas.trim()
            })
        });
        const data = await res.json();
        if (data && data.ok) {
            await cargarIntervencionesTimeline();
        } else {
            alert("Error al actualizar estado: " + data.error);
        }
    } catch (err) {
        alert("Error de conexión: " + err.message);
    }
}

// REGISTRO DE CLASES DE FORMACIÓN (CÁMARA / AULA)
window.abrirModalRegistrarClase = async function() {
    const modal = document.getElementById("modal-registrar-clase");
    if (!modal) return;
    
    // Poner fecha de hoy por defecto
    const inputFecha = document.getElementById("clase-fecha");
    if (inputFecha) {
        inputFecha.value = new Date().toISOString().split('T')[0];
    }
    
    // Limpiar campos de hora
    const inputInicio = document.getElementById("clase-hora-inicio");
    const inputFin = document.getElementById("clase-hora-fin");
    if (inputInicio) inputInicio.value = "";
    if (inputFin) inputFin.value = "";
    
    // Cargar formadores
    const selectFormador = document.getElementById("clase-formador-select");
    if (selectFormador) {
        selectFormador.innerHTML = '<option value="">Cargando formadores...</option>';
        try {
            const res = await fetch("/api/formadores");
            if (res.ok) {
                const data = await res.json();
                const list = data.formadores || [];
                selectFormador.innerHTML = '<option value="">-- Selecciona Tutor/Docente --</option>';
                list.forEach(f => {
                    const opt = document.createElement("option");
                    opt.value = f.id;
                    opt.textContent = `${f.nombre} (${f.codigo || f.id})`;
                    selectFormador.appendChild(opt);
                });
            } else {
                selectFormador.innerHTML = '<option value="">Error al cargar formadores</option>';
            }
        } catch (e) {
            console.error(e);
            selectFormador.innerHTML = '<option value="">Error de conexión</option>';
        }
    }
    
    modal.style.display = "flex";
}

window.cerrarModalRegistrarClase = function() {
    const modal = document.getElementById("modal-registrar-clase");
    if (modal) modal.style.display = "none";
}

window.guardarClaseForm = async function(e) {
    e.preventDefault();
    
    if (!window.currentPersona || !window.currentPersona.id) {
        alert("Error: No hay datos del trabajador actual.");
        return;
    }
    
    const payload = {
        alumno_id: window.currentPersona.id,
        tipo: document.getElementById("clase-tipo").value,
        formador_id: parseInt(document.getElementById("clase-formador-select").value),
        fecha: document.getElementById("clase-fecha").value,
        hora_inicio: document.getElementById("clase-hora-inicio").value,
        hora_fin: document.getElementById("clase-hora-fin").value
    };
    
    if (!payload.formador_id) {
        alert("Debe seleccionar un formador/docente.");
        return;
    }
    
    try {
        const res = await fetch("/api/trabajador/registrar_clase", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (res.ok && data.ok) {
            window.cerrarModalRegistrarClase();
            // Recargar sección de clases e historial
            await cargarFormacionTrabajador(window.currentPersona);
            // También recargar expediente completo por si cambian métricas en cabecera
            window.location.reload();
        } else {
            alert("Error al registrar la clase: " + (data.error || "Error desconocido"));
        }
    } catch (err) {
        console.error(err);
        alert("Error de conexión al registrar la clase.");
    }
}