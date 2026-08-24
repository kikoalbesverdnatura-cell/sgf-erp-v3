let vistaActual = "mentores"; // "mentores" o "fases"
let datosCache = null;
let formadoresCache = [];
let trabajadorSeleccionado = null;
let progresoChartInstance = null;

document.addEventListener("DOMContentLoaded", iniciarPlanificacion);

async function iniciarPlanificacion() {
    configurarToggle();
    configurarDrawer();
    await cargarFormadores();
    await cargarTablero();
}

function configurarToggle() {
    const btnMentores = document.getElementById("btn-vista-mentores");
    const btnFases = document.getElementById("btn-vista-fases");
    
    if (btnMentores && btnFases) {
        btnMentores.style.cursor = "pointer";
        btnFases.style.cursor = "pointer";
        
        btnMentores.addEventListener("click", () => {
            if (vistaActual === "mentores") return;
            vistaActual = "mentores";
            btnMentores.style.backgroundColor = "#173D2D";
            btnMentores.style.color = "white";
            btnFases.style.backgroundColor = "#f4f6f8";
            btnFases.style.color = "#173D2D";
            
            document.getElementById("columna-izquierda-novatos").style.display = "block";
            renderizarTablero();
        });
        
        btnFases.addEventListener("click", () => {
            if (vistaActual === "fases") return;
            vistaActual = "fases";
            btnFases.style.backgroundColor = "#173D2D";
            btnFases.style.color = "white";
            btnMentores.style.backgroundColor = "#f4f6f8";
            btnMentores.style.color = "#173D2D";
            
            document.getElementById("columna-izquierda-novatos").style.display = "none";
            renderizarTablero();
        });
    }
}

async function cargarFormadores() {
    try {
        const res = await fetch("/api/formadores");
        if (res.ok) {
            formadoresCache = await res.json();
            const selectFormador = document.getElementById("form-formador-clase");
            if (selectFormador) {
                selectFormador.innerHTML = formadoresCache.map(f => `<option value="${escapeHtml(f.nombre)}">${escapeHtml(f.nombre)}</option>`).join("");
            }
        }
    } catch(err) {
        console.error("Error al cargar formadores:", err);
    }
}

async function cargarTablero() {
    try {
        const respuesta = await fetch("/api/planificacion");
        if (!respuesta.ok) {
            throw new Error("Error HTTP " + respuesta.status);
        }
        
        datosCache = await respuesta.json();
        renderizarTablero();
        await renderizarRecomendaciones();
    } catch (error) {
        console.error(error);
        alert("Error cargando tablero de planificación");
    }
}

function normalizarEstado(estado) {
    const est = (estado || "").trim().toLowerCase();
    if (est === "onboarding" || est === "ronda equipos" || est === "acompañamiento") return "Onboarding";
    if (est === "shadow" || est === "sacado h") return "Shadow";
    if (est === "libre" || est === "libre fase 1" || est === "libre fase 2") return "Libre";
    if (est === "equipo" || est === "mentor") return "Equipo";
    if (est === "terminado" || est === "finalizado") return "Finalizado";
    return "Onboarding";
}

function renderizarTablero() {
    if (!datosCache) return;
    
    const tablero = document.getElementById("tablero-equipos");
    tablero.innerHTML = "";
    
    if (vistaActual === "mentores") {
        document.getElementById("titulo-seccion-derecha").innerHTML = "🎓 Equipos y Mentores";
        
        const listaNovatos = document.getElementById("lista-novatos");
        const contadorNovatos = document.getElementById("contador-novatos");
        
        listaNovatos.innerHTML = "";
        const novatos = datosCache.novatos || [];
        contadorNovatos.textContent = novatos.length;
        
        if (novatos.length === 0) {
            listaNovatos.innerHTML = `
                <p style="color: #999; text-align: center; margin-top: 40px; font-style: italic;">
                    Sin personal pendiente de asignación
                </p>
            `;
        } else {
            const dropzoneNovatos = document.createElement("div");
            dropzoneNovatos.className = "dropzone novatos-container";
            dropzoneNovatos.id = "sin-tutor";
            dropzoneNovatos.style.minHeight = "480px";
            
            novatos.forEach(p => {
                dropzoneNovatos.appendChild(crearTarjeta(p));
            });
            listaNovatos.appendChild(dropzoneNovatos);
        }
        
        const equipos = datosCache.equipos || [];
        tablero.style.gridTemplateColumns = "repeat(auto-fill, minmax(260px, 1fr))";
        
        if (equipos.length === 0) {
            tablero.innerHTML = `
                <p style="color: #999; font-style: italic; padding: 20px;">
                    No hay equipos o mentores registrados
                </p>
            `;
        } else {
            equipos.forEach(eq => {
                const col = document.createElement("div");
                col.className = "kanbanColumn panel";
                col.style.background = "#fff";
                col.style.border = "1px solid #edf2ee";
                col.style.borderRadius = "14px";
                col.style.padding = "16px";
                col.style.display = "flex";
                col.style.flexDirection = "column";
                col.style.gap = "10px";
                col.style.minHeight = "250px";
                
                const numNovatos = eq.novatos ? eq.novatos.length : 0;
                
                col.innerHTML = `
                    <div class="columnHeader" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #edf2ee; padding-bottom: 8px; margin-bottom: 10px;">
                        <strong style="color: #173D2D; font-size: 0.95em;">👨‍🏫 ${escapeHtml(eq.tutor)}</strong>
                        <span class="badge" style="background: #edf4ef; color: #173D2D; padding: 2px 8px; border-radius: 999px; font-size: 0.85em; font-weight: 700;">${numNovatos}</span>
                    </div>
                    <div id="tutor-${escapeAttr(eq.tutor)}" class="dropzone" style="min-height: 180px; background: #fbfdfc; border: 1.5px dashed #dbe5df; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                    </div>
                `;
                
                const dz = col.querySelector(".dropzone");
                if (eq.novatos && eq.novatos.length > 0) {
                    eq.novatos.forEach(p => {
                        dz.appendChild(crearTarjeta(p));
                    });
                }
                
                tablero.appendChild(col);
            });
        }
    } else {
        document.getElementById("titulo-seccion-derecha").innerHTML = "📋 Fases y Seguimiento del Programa";
        
        const todasLasPersonas = [];
        if (datosCache.novatos) {
            datosCache.novatos.forEach(p => todasLasPersonas.push(p));
        }
        if (datosCache.equipos) {
            datosCache.equipos.forEach(eq => {
                if (eq.novatos) {
                    eq.novatos.forEach(p => todasLasPersonas.push(p));
                }
            });
        }
        
        const fases = [
            { id: "Onboarding", titulo: "🌱 Onboarding", color: "#173D2D", bg: "#edf4ef", border: "#dbe5df" },
            { id: "Shadow", titulo: "👥 Shadow (Práctica)", color: "#d6a100", bg: "#fffcf0", border: "#f7edd0" },
            { id: "Libre", titulo: "🏃 Libre (Autónomo)", color: "#1a5a96", bg: "#f0f6fa", border: "#d0e2f0" },
            { id: "Equipo", titulo: "🏆 Equipo (Integrado)", color: "#7b1a96", bg: "#fcf0fa", border: "#f0d0f0" }
        ];
        
        tablero.style.gridTemplateColumns = "repeat(4, minmax(220px, 1fr))";
        
        fases.forEach(f => {
            const personasEnFase = todasLasPersonas.filter(p => normalizarEstado(p.estado) === f.id);
            
            const col = document.createElement("div");
            col.className = "kanbanColumn panel";
            col.style.background = f.bg;
            col.style.border = `1.5px solid ${f.border}`;
            col.style.borderRadius = "14px";
            col.style.padding = "16px";
            col.style.display = "flex";
            col.style.flexDirection = "column";
            col.style.gap = "10px";
            col.style.minHeight = "480px";
            
            col.innerHTML = `
                <div class="columnHeader" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${f.border}; padding-bottom: 8px; margin-bottom: 10px;">
                    <strong style="color: ${f.color}; font-size: 0.95em;">${f.titulo}</strong>
                    <span class="badge" style="background: ${f.color}; color: #fff; padding: 2px 8px; border-radius: 999px; font-size: 0.85em; font-weight: 700;">${personasEnFase.length}</span>
                </div>
                <div id="estado-${f.id}" class="dropzone" style="flex: 1; min-height: 380px; background: rgba(255,255,255,0.75); border: 1.5px dashed ${f.border}; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                </div>
            `;
            
            const dz = col.querySelector(".dropzone");
            personasEnFase.forEach(p => {
                dz.appendChild(crearTarjeta(p));
            });
            tablero.appendChild(col);
        });
    }
    
    crearDropzones();
}

function crearTarjeta(persona) {
    const tarjeta = document.createElement("div");
    tarjeta.className = "personaCard";
    tarjeta.dataset.id = persona.id;
    tarjeta.style.background = "#fff";
    tarjeta.style.border = "1px solid #edf2ee";
    tarjeta.style.borderRadius = "12px";
    tarjeta.style.padding = "12px";
    tarjeta.style.boxShadow = "0 4px 12px rgba(0,0,0,0.03)";
    tarjeta.style.cursor = "grab";
    tarjeta.style.display = "flex";
    tarjeta.style.flexDirection = "column";
    tarjeta.style.gap = "6px";
    tarjeta.style.position = "relative";

    // Nota badge
    const notaNum = parseFloat(persona.nota || 0);
    let colorClase = "gris";
    if (notaNum >= 7.0) colorClase = "verde";
    else if (notaNum >= 5.0) colorClase = "amarillo";
    else if (notaNum > 0.0) colorClase = "rojo";

    const labelNota = notaNum > 0 ? `⭐ ${notaNum.toFixed(1)}` : "S/N";

    // Hitos icon classes
    const classroomDone = persona.hitos && persona.hitos.aula_finalizada;
    const practiceDone = persona.hitos && persona.hitos.practica_finalizada;
    
    const aulaCls = classroomDone ? "active" : "";
    const practCls = practiceDone ? "active" : "";
    const checkCls = persona.checklist_porcentaje === 100 ? "active" : "";

    // HTML de retroceso
    const retroHTML = persona.retrocedido ? `<span class="retro-alert-pill">⚠️ Retroceso</span>` : "";

    tarjeta.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <strong style="font-size: 0.9em; color: #173D2D; display: block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(persona.nombre)}">
                ${escapeHtml(persona.nombre)}
            </strong>
            <span class="note-badge ${colorClase}" style="font-size: 0.72em; padding: 2px 6px;">${labelNota}</span>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75em; color: #718096;">
            <span>${escapeHtml(persona.programa)}</span>
            <span style="background: #f4f6f8; padding: 2px 6px; border-radius: 4px; font-weight: 600;">⏱️ ${persona.dias || 0} d</span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 0.75em; border-top: 1px solid #f6f8f6; padding-top: 6px;">
            <span>${escapeHtml(persona.departamento)}</span>
            <div class="milestones-row">
                <span class="milestone-icon ${checkCls}" title="Checklist Onboarding completado">📋</span>
                <span class="milestone-icon ${aulaCls}" title="Sesión de Aula completada">🎓</span>
                <span class="milestone-icon ${practCls}" title="Sesión Práctica/Mili completada">🎥</span>
            </div>
        </div>
        ${retroHTML}
    `;
    
    // Clic para abrir Drawer
    tarjeta.addEventListener("click", () => {
        abrirDrawer(persona);
    });

    // Doble clic para abrir Ficha completa
    tarjeta.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        window.open("/expediente/" + persona.id, "_blank");
    });
    
    return tarjeta;
}

function crearDropzones() {
    document.querySelectorAll(".dropzone").forEach(zona => {
        new Sortable(zona, {
            group: "personas",
            animation: 180,
            ghostClass: "dragGhost",
            chosenClass: "dragChosen",
            dragClass: "dragging",
            onEnd(evt) {
                actualizarContadoresLocales();
                guardarMovimiento(evt);
            }
        });
    });
}

function actualizarContadoresLocales() {
    const sinTutorZone = document.getElementById("sin-tutor");
    const numNovatos = sinTutorZone ? sinTutorZone.querySelectorAll(".personaCard").length : 0;
    const contNovatos = document.getElementById("contador-novatos");
    if (contNovatos) contNovatos.textContent = numNovatos;
    
    document.querySelectorAll(".kanbanColumn").forEach(col => {
        const dz = col.querySelector(".dropzone");
        const badge = col.querySelector(".columnHeader span");
        if (dz && badge) {
            badge.textContent = dz.querySelectorAll(".personaCard").length;
        }
    });
}

async function guardarMovimiento(evt) {
    if (evt.from.id === evt.to.id) return;

    const idNovato = evt.item.dataset.id;
    const targetDz = evt.to;
    
    if (vistaActual === "fases") {
        const nuevoEstado = targetDz.id.replace("estado-", "");
        try {
            const respuesta = await fetch("/api/planificacion/actualizar_estado", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id_novato: idNovato, estado: nuevoEstado })
            });
            const r = await respuesta.json();
            if (!r.ok) {
                alert("Error al actualizar el estado: " + (r.error || "Desconocido"));
                await cargarTablero();
            } else {
                await cargarTablero();
            }
        } catch (error) {
            console.error(error);
            alert("Error de red al actualizar estado");
            await cargarTablero();
        }
    } else {
        const destinoId = targetDz.id;
        let tutor = "";
        if (destinoId.startsWith("tutor-")) {
            tutor = destinoId.replace("tutor-", "");
        }
        
        try {
            const respuesta = await fetch("/api/planificacion/assign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id_novato: idNovato, tutor: tutor })
            });
            const r = await respuesta.json();
            if (!r.ok) {
                // reintentar con endpoint español por compatibilidad
                const resEsp = await fetch("/api/planificacion/asignar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id_novato: idNovato, tutor: tutor })
                });
                const rEsp = await resEsp.json();
                if (!rEsp.ok) {
                    alert("Error al asignar tutor: " + (rEsp.error || "Desconocido"));
                    await cargarTablero();
                } else {
                    await cargarTablero();
                }
            } else {
                await cargarTablero();
            }
        } catch (error) {
            console.error(error);
            alert("Error de red al asignar tutor");
            await cargarTablero();
        }
    }
}

// ======================================================
// MOTOR DE RECOMENDACIONES E HITOS (CON EXCESO DE RETRASOS)
// ======================================================

async function renderizarRecomendaciones() {
    const listContainer = document.getElementById("lista-recomendaciones");
    if (!listContainer || !datosCache) return;

    listContainer.innerHTML = "";

    // Consolidar todos los trabajadores en una lista plana
    const todasLasPersonas = [];
    if (datosCache.novatos) {
        datosCache.novatos.forEach(p => todasLasPersonas.push(p));
    }
    if (datosCache.equipos) {
        datosCache.equipos.forEach(eq => {
            if (eq.novatos) {
                eq.novatos.forEach(p => todasLasPersonas.push(p));
            }
        });
    }

    const recomendaciones = [];

    // Cargar alertas de seguimiento vencidas
    try {
        const resAlerts = await fetch("/api/intervenciones/vencidas");
        const alerts = await resAlerts.json();
        if (Array.isArray(alerts)) {
            alerts.forEach(a => {
                recomendaciones.push({
                    tipo: "urgente",
                    titulo: `⚠️ Seguimiento: ${a.nombre}`,
                    descripcion: `Tiene un plan de <strong>${a.tipo}</strong> por <strong>${a.motivo}</strong> vencido hace <strong>${a.dias_transcurridos} días</strong>. Rechequear evolución.`,
                    accionTexto: "🔍 Ir a Expediente",
                    accionFn: () => {
                        window.open(`/personas?id=${a.id_persona}`, "_blank");
                    }
                });
            });
        }
    } catch (err) {
        console.error("Error al cargar alertas de seguimiento para recomendaciones:", err);
    }

    todasLasPersonas.forEach(p => {
        const dias = parseInt(p.dias || 0);
        const nota = parseFloat(p.nota || 0.0);
        const estadoNorm = normalizarEstado(p.estado);

        // 1. URGENTE: Retrocesos o Excesos de Retrasos en Fases
        if (p.retrocedido) {
            recomendaciones.push({
                tipo: "urgente",
                titulo: `⚠️ Retroceso Detectado: ${p.nombre}`,
                descripcion: `Ha sido devuelto a fase de práctica guiada. Su nota actual es de <strong>${nota.toFixed(1)}/10</strong>. Se recomienda repasar con su mentor.`,
                accionTexto: "📅 Programar Clase de Repaso",
                accionFn: () => abrirDrawer(p, true)
            });
        } else if (estadoNorm === "Onboarding" && dias > 4) {
            recomendaciones.push({
                tipo: "urgente",
                titulo: `⚠️ Exceso de Retraso: ${p.nombre}`,
                descripcion: `Lleva <strong>${dias} días</strong> en fase de Onboarding (límite recomendado: 3 días). Planificar paso a Shadow de inmediato.`,
                accionTexto: "📋 Ver Checklist / Hitos",
                accionFn: () => abrirDrawer(p)
            });
        } else if (estadoNorm === "Shadow" && dias > 15) {
            recomendaciones.push({
                tipo: "urgente",
                titulo: `⚠️ Exceso de Retraso: ${p.nombre}`,
                descripcion: `Lleva <strong>${dias} días</strong> en fase Shadow (límite recomendado: 14 días) y su nota actual es <strong>${nota.toFixed(1)}</strong>. Se sugiere repasar evolución en tableta.`,
                accionTexto: "📈 Analizar Curva",
                accionFn: () => abrirDrawer(p)
            });
        } else if (estadoNorm === "Libre" && dias > 22 && nota < 5.0) {
            recomendaciones.push({
                tipo: "urgente",
                titulo: `⚠️ Exceso de Retraso: ${p.nombre}`,
                descripcion: `Lleva <strong>${dias} días</strong> (Fase 3 finalizada) y su rendimiento no alcanza la meta de 80 l/h (Nota actual: <strong>${nota.toFixed(1)}</strong>). Requiere tutoría.`,
                accionTexto: "👨‍🏫 Asignar Tutor",
                accionFn: () => {
                    vistaActual = "mentores";
                    document.getElementById("btn-vista-mentores").click();
                    destacarTarjeta(p.id);
                }
            });
        }

        // 2. AVISOS: Checklists e hitos pendientes
        if (p.checklist_porcentaje < 100 && dias <= 3) {
            recomendaciones.push({
                tipo: "aviso",
                titulo: `Checklist Incompleto: ${p.nombre}`,
                descripcion: `Lleva ${dias} días y solo tiene el <strong>${p.checklist_porcentaje}%</strong> del checklist de onboarding.`,
                accionTexto: "📋 Completar Checklist",
                accionFn: () => abrirDrawer(p)
            });
        }

        if (p.hitos && !p.hitos.aula_finalizada && !p.hitos.aula_pendiente && dias > 2) {
            recomendaciones.push({
                tipo: "aviso",
                titulo: `Sesión de Aula Pendiente: ${p.nombre}`,
                descripcion: `Aún no tiene agendada la <strong>Formación de Aula inicial</strong>.`,
                accionTexto: "🎓 Programar Aula",
                accionFn: () => abrirDrawer(p, true)
            });
        }

        // 3. SUGERENCIAS: Promociones automáticas por buen desempeño
        if (p.color_code === "VERDE" && estadoNorm === "Shadow" && dias >= 5) {
            recomendaciones.push({
                tipo: "sugerencia",
                titulo: `Promoción Sugerida: ${p.nombre}`,
                descripcion: `Desempeño excelente (<strong>Nota ${nota.toFixed(1)}</strong>) en Shadow. Sugerimos promocionarlo a <strong>Libre (autónomo)</strong>.`,
                accionTexto: "🏃 Promocionar a Libre",
                accionFn: async () => {
                    if (confirm(`¿Promocionar a ${p.nombre} a la fase Libre?`)) {
                        await actualizarEstadoDirecto(p.id, "Libre");
                    }
                }
            });
        }
    });

    if (recomendaciones.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: #82928a; padding: 30px 10px; font-style: italic; font-size: 0.88em;">
                ✅ ¡Todo al día! No hay acciones o retrasos críticos detectados para el personal en formación.
            </div>
        `;
        return;
    }

    // Ordenar por tipo: urgente (0) > aviso (1) > sugerencia (2)
    recomendaciones.sort((a, b) => {
        const orden = { urgente: 0, aviso: 1, sugerencia: 2 };
        return orden[a.tipo] - orden[b.tipo];
    });

    recomendaciones.forEach(rec => {
        const card = document.createElement("div");
        card.className = `rec-card ${rec.tipo}`;
        
        let headerColor = "#718096";
        if (rec.tipo === "urgente") headerColor = "#c0392b";
        else if (rec.tipo === "aviso") headerColor = "#d6a100";
        else if (rec.tipo === "sugerencia") headerColor = "#27ae60";

        card.innerHTML = `
            <strong style="font-size: 0.88em; color: ${headerColor}; display: flex; align-items: center; gap: 6px;">
                ${rec.titulo}
            </strong>
            <p style="margin: 0; font-size: 0.8em; color: #4a5568; line-height: 1.4;">
                ${rec.descripcion}
            </p>
            <button class="primaryButton" style="padding: 6px 12px; font-size: 0.78em; border-radius: 6px; background: ${headerColor}; color: white; border: none; align-self: flex-start; cursor: pointer; margin-top: 4px; font-weight: bold; transition: opacity 0.2s;">
                ${rec.accionTexto}
            </button>
        `;
        
        card.querySelector("button").addEventListener("click", rec.accionFn);
        listContainer.appendChild(card);
    });
}

function destacarTarjeta(id) {
    const cardEl = document.querySelector(`.personaCard[data-id="${id}"]`);
    if (cardEl) {
        cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
        cardEl.style.outline = "3px solid #27ae60";
        cardEl.style.transform = "scale(1.05)";
        setTimeout(() => {
            cardEl.style.outline = "none";
            cardEl.style.transform = "none";
        }, 3000);
    }
}

async function actualizarEstadoDirecto(idNovato, nuevoEstado) {
    try {
        const res = await fetch("/api/planificacion/actualizar_estado", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_novato: idNovato, estado: nuevoEstado })
        });
        const r = await res.json();
        if (r.ok) {
            await cargarTablero();
        } else {
            alert(r.error || "Error al actualizar estado");
        }
    } catch(err) {
        console.error(err);
        alert("Error de conexión");
    }
}


// ======================================================
// PANEL LATERAL (DRAWER DE DETALLES Y GRÁFICO PARA TABLET)
// ======================================================

function configurarDrawer() {
    const overlay = document.getElementById("drawer-overlay");
    const closeBtn = document.getElementById("drawer-close-btn");
    
    if (overlay && closeBtn) {
        overlay.addEventListener("click", cerrarDrawer);
        closeBtn.addEventListener("click", cerrarDrawer);
    }

    const btnGuardar = document.getElementById("btn-guardar-formacion-rapida");
    if (btnGuardar) {
        btnGuardar.addEventListener("click", guardarFormacionRapida);
    }
}

function getIdealTargetForDay(day) {
    if (day <= 3) return 40; // Onboarding
    if (day <= 13) return 60; // Shadow
    if (day <= 21) {
        // Progresión del día 14 al 21 (de 60 a 80 lines/hour)
        const pct = (day - 14) / 7;
        return Math.round(60 + (20 * pct));
    }
    // Progresión del día 22 al 31 (de 80 a 90 lines/hour)
    const pct = (day - 22) / 9;
    return Math.round(80 + (10 * pct));
}

function drawProgresoChart(persona, datesArray) {
    const canvas = document.getElementById("drawer-progreso-chart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    
    if (progresoChartInstance) {
        progresoChartInstance.destroy();
    }
    
    let labels = [];
    let actualData = [];
    let idealData = [];
    
    if (datesArray.length === 0) {
        // Curva ideal general de fallback
        labels = ["Día 1", "Día 5", "Día 10", "Día 15", "Día 21", "Día 31"];
        actualData = [null, null, null, null, null, null];
        idealData = [40, 60, 60, 71, 80, 90];
    } else {
        // Evolución cronológica real vs ideal
        labels = datesArray.map(item => {
            const p = item.dateStr.split("/");
            return `${p[0]}/${p[1]}`;
        });
        actualData = datesArray.map(item => item.actual);
        idealData = datesArray.map(item => item.ideal);
    }
    
    progresoChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Rendimiento Real (L/H)',
                    data: actualData,
                    borderColor: '#1a5a96',
                    backgroundColor: 'rgba(26, 90, 150, 0.08)',
                    borderWidth: 3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.2,
                    spanGaps: true
                },
                {
                    label: 'Curva Ideal (L/H)',
                    data: idealData,
                    borderColor: '#27ae60',
                    borderDash: [5, 5],
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 10,
                        font: { size: 9, family: 'Inter' }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 9 } }
                },
                y: {
                    min: 20,
                    max: 120,
                    ticks: { 
                        stepSize: 20,
                        font: { size: 9 }
                    }
                }
            }
        }
    });
}

async function abrirDrawer(persona, enfocarFormulario = false) {
    trabajadorSeleccionado = persona;

    // Completar información
    document.getElementById("drawer-trabajador-nombre").textContent = persona.nombre;
    document.getElementById("drawer-trabajador-programa").textContent = persona.programa;
    document.getElementById("drawer-trabajador-departamento").textContent = persona.departamento;
    document.getElementById("drawer-trabajador-dias").textContent = `⏱️ ${persona.dias || 0} días en seguimiento`;

    // Nota
    const badgeNota = document.getElementById("drawer-trabajador-badge-nota");
    const notaNum = parseFloat(persona.nota || 0);
    badgeNota.textContent = notaNum > 0 ? `⭐ ${notaNum.toFixed(1)}` : "S/N";
    badgeNota.className = "note-badge";
    if (notaNum >= 7.0) badgeNota.classList.add("verde");
    else if (notaNum >= 5.0) badgeNota.classList.add("amarillo");
    else if (notaNum > 0.0) badgeNota.classList.add("rojo");
    else badgeNota.classList.add("gris");

    // Alertas
    const alertasContainer = document.getElementById("drawer-alertas-container");
    alertasContainer.innerHTML = "";
    
    const estadoNorm = normalizarEstado(persona.estado);
    const dias = parseInt(persona.dias || 0);
    
    let alertHTML = "";
    if (persona.retrocedido) {
        alertHTML += `<div class="retro-alert-pill" style="font-size: 0.8em; justify-content: center; width: 100%; padding: 8px;">⚠️ RETROCESO DETECTADO: El empleado ha sido bajado de fase. Repasar urgentemente.</div>`;
    }
    if (estadoNorm === "Onboarding" && dias > 4) {
        alertHTML += `<div class="retro-alert-pill" style="font-size: 0.8em; justify-content: center; width: 100%; padding: 8px;">⚠️ EXCESO DE TIEMPO: Lleva ${dias} días en Onboarding (máximo sugerido: 3 días).</div>`;
    }
    if (estadoNorm === "Shadow" && dias > 15) {
        alertHTML += `<div class="retro-alert-pill" style="font-size: 0.8em; justify-content: center; width: 100%; padding: 8px;">⚠️ EXCESO DE TIEMPO: Lleva ${dias} días en Shadow (máximo sugerido: 14 días).</div>`;
    }

    if (alertHTML) {
        alertasContainer.innerHTML = alertHTML;
        alertasContainer.style.display = "flex";
    } else {
        alertasContainer.style.display = "none";
    }

    // Dibujar gráfico de evolución en caliente (Tableta)
    try {
        const res = await fetch(`/api/persona/${persona.id}/historial-sacador`);
        const history = res.ok ? await res.json() : [];
        
        // Agrupar
        const grouped = {};
        history.forEach(item => {
            const d = item.fecha;
            if (!grouped[d]) grouped[d] = { sum: 0, count: 0 };
            grouped[d].sum += parseFloat(item.lineas_hora || 0);
            grouped[d].count += 1;
        });
        
        const datesArray = Object.keys(grouped).map(d => {
            return {
                dateStr: d,
                actual: Math.round(grouped[d].sum / grouped[d].count)
            };
        });
        
        datesArray.sort((a, b) => {
            const partsA = a.dateStr.split("/");
            const partsB = b.dateStr.split("/");
            return new Date(partsA[2], partsA[1]-1, partsA[0]) - new Date(partsB[2], partsB[1]-1, partsB[0]);
        });
        
        const today = new Date();
        datesArray.forEach(item => {
            const parts = item.dateStr.split("/");
            const itemDate = new Date(parts[2], parts[1]-1, parts[0]);
            const diffTime = Math.abs(today - itemDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const itemDay = Math.max(1, parseInt(persona.dias || 0) - diffDays);
            item.ideal = getIdealTargetForDay(itemDay);
        });
        
        drawProgresoChart(persona, datesArray);
    } catch(err) {
        console.error("Error cargando histórico:", err);
        drawProgresoChart(persona, []);
    }

    // Inicializar checklist e hitos
    renderizarChecklistDrawer(persona);
    await cargarAgendaClasesDrawer(persona);

    // Abrir Drawer
    document.getElementById("quick-view-drawer").classList.add("open");
    document.getElementById("drawer-overlay").classList.add("open");

    // Autofill fecha
    const inputFecha = document.getElementById("form-fecha-clase");
    if (inputFecha) {
        inputFecha.value = new Date().toISOString().split("T")[0];
    }

    if (enfocarFormulario) {
        setTimeout(() => {
            const form = document.getElementById("form-tipo-clase");
            if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 350);
    }
}

function cerrarDrawer() {
    document.getElementById("quick-view-drawer").classList.remove("open");
    document.getElementById("drawer-overlay").classList.remove("open");
    if (progresoChartInstance) {
        progresoChartInstance.destroy();
        progresoChartInstance = null;
    }
    trabajadorSeleccionado = null;
}

// Checklist drawer interctivo
function renderizarChecklistDrawer(persona) {
    const container = document.getElementById("drawer-checklist-items");
    const pctSpan = document.getElementById("drawer-checklist-pct");
    if (!container) return;

    container.innerHTML = "";

    fetch(`/api/persona/${persona.id}`)
        .then(res => res.json())
        .then(fullWorker => {
            const checks = [
                ["rrhh", "RRHH"],
                ["almuerzo", "Almuerzo"],
                ["uniforme", "Uniforme"],
                ["psicotecnico", "Psicotécnico"],
                ["formacion", "Bienvenida"],
                ["tour", "Tour Empresa"]
            ];

            let completados = 0;

            checks.forEach(([campo, label]) => {
                const checked = fullWorker[campo] === true || String(fullWorker[campo] || "").toUpperCase() in {"TRUE":1, "SI":1, "SÍ":1, "1":1, "X":1};
                if (checked) completados++;

                const div = document.createElement("div");
                div.style.display = "flex";
                div.style.alignItems = "center";
                div.style.gap = "6px";
                div.style.background = "#f8f9fa";
                div.style.padding = "8px";
                div.style.borderRadius = "6px";
                div.style.fontSize = "0.82em";

                div.innerHTML = `
                    <input type="checkbox" id="chk-drawer-${campo}" ${checked ? "checked" : ""} style="cursor: pointer;">
                    <label for="chk-drawer-${campo}" style="cursor: pointer; color: #333; user-select: none;">${label}</label>
                `;

                div.querySelector("input").addEventListener("change", async (e) => {
                    const val = e.target.checked;
                    try {
                        const res = await fetch("/api/persona/checklist", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: persona.id, campo: campo, valor: val })
                        });
                        const r = await res.json();
                        if (r.ok) {
                            renderizarChecklistDrawer(persona);
                            setTimeout(cargarTablero, 1000);
                        } else {
                            alert("Error al actualizar checklist");
                        }
                    } catch(err) {
                        console.error(err);
                    }
                });

                container.appendChild(div);
            });

            const pct = Math.round((completados / checks.length) * 100);
            pctSpan.textContent = `${pct}%`;
        })
        .catch(err => {
            console.error("Error cargando checklist:", err);
            container.innerHTML = `<p style="color: red; font-size: 0.8em;">No se pudo cargar</p>`;
        });
}

// Cargar historial de clases de Aula/Mili
async function cargarAgendaClasesDrawer(persona) {
    const container = document.getElementById("drawer-historial-clases");
    if (!container) return;

    container.innerHTML = `<p style="color: #999; font-style: italic; font-size: 0.85em;">Cargando historial formativo...</p>`;

    try {
        const resMili = await fetch("/api/mili");
        const miliEvs = resMili.ok ? await resMili.json() : [];

        const clasesTrainee = miliEvs.filter(ev => String(ev.nombre || "").trim().toUpperCase() === String(persona.nombre || "").trim().toUpperCase());

        if (clasesTrainee.length === 0) {
            container.innerHTML = `<p style="color: #999; font-style: italic; font-size: 0.85em; margin: 5px 0;">No tiene clases registradas en el calendario formativo.</p>`;
            return;
        }

        container.innerHTML = "";
        clasesTrainee.forEach(cl => {
            const isFin = String(cl.estado || "").toUpperCase() in {"FINALIZADA":1, "HECHO":1, "TRUE":1, "SI":1, "SÍ":1};
            const div = document.createElement("div");
            div.style.background = isFin ? "#edf4ef" : "#fdfbf5";
            div.style.border = isFin ? "1px solid #dbe5df" : "1px solid #f7ecd0";
            div.style.borderRadius = "8px";
            div.style.padding = "10px";
            div.style.display = "flex";
            div.style.justifyContent = "space-between";
            div.style.alignItems = "center";

            div.innerHTML = `
                <div style="font-size: 0.82em;">
                    <strong style="color: #173D2D; display: block;">${escapeHtml(cl.departamento)}</strong>
                    <span style="color: #666; font-size: 0.9em;">📅 ${escapeHtml(cl.fecha)} a las ${escapeHtml(cl.hora)}</span>
                    <span style="color: #718096; font-size: 0.95em; display: block; margin-top: 2px;">Tutor: ${escapeHtml(cl.formador || "Sin asignar")}</span>
                </div>
                <span class="note-badge ${isFin ? 'verde' : 'amarillo'}" style="font-size: 0.72em;">
                    ${isFin ? '✓ Realizada' : '⏳ Pendiente'}
                </span>
            `;
            container.appendChild(div);
        });

    } catch(err) {
        console.error("Error:", err);
        container.innerHTML = `<p style="color: red; font-size: 0.8em;">Error al cargar historial</p>`;
    }
}

// Programar formación rápida
async function guardarFormacionRapida() {
    if (!trabajadorSeleccionado) return;

    const tipo = document.getElementById("form-tipo-clase").value;
    const fechaInput = document.getElementById("form-fecha-clase").value;
    const hora = document.getElementById("form-hora-clase").value;
    const formador = document.getElementById("form-formador-clase").value;

    if (!fechaInput) {
        alert("La fecha es requerida.");
        return;
    }

    const parts = fechaInput.split("-");
    const fecha = `${parts[2]}/${parts[1]}/${parts[0]}`;

    const btn = document.getElementById("btn-guardar-formacion-rapida");
    btn.disabled = true;
    btn.textContent = "⌛ Programando...";

    try {
        const res = await fetch("/api/mili/programar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                nombre: trabajadorSeleccionado.nombre,
                departamento: tipo,
                fecha: fecha,
                hora: hora,
                formador: formador,
                estado: "Pendiente"
            })
        });

        const r = await res.json();
        if (r.ok) {
            alert("¡Formación programada con éxito en el calendario!");
            await cargarAgendaClasesDrawer(trabajadorSeleccionado);
            await cargarTablero();
        } else {
            alert(r.error || "No se pudo programar la formación");
        }
    } catch(err) {
        console.error(err);
        alert("Error de red");
    } finally {
        btn.disabled = false;
        btn.textContent = "💾 Programar Formación";
    }
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