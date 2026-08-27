let todosLosTrabajadores = [];
let trabajadoresHistorial = null;
let filtros = {
    id: "",
    nombre: "",
    departamento: "",
    estado: "",
    riesgo: "",
    dias: "",
    chaleco: "",
    rendimiento: "",
    formacion_aula: "",
    formacion_camara: "",
    errores: "",
    salida: "NO"
};
let columnaOrdenada = "id";
let direccionOrdenacion = "asc";

async function cargarPersonas() {
    try {
        const respuesta = await fetch("/api/personas");
        todosLosTrabajadores = await respuesta.json();

        // 1. Poblar los selectores del header dinámicamente
        poblarSelectorHeader("filtro-departamento", "departamento", "🏢 Dept...");
        poblarSelectorHeader("filtro-estado", "estado", "📋 Estado...");
        poblarSelectorHeader("filtro-contrato", "contrato_limitado", "📜 Contrato...");
        poblarSelectorHeader("filtro-riesgo", "riesgo", "⚠️ Riesgo...");

        // 2. Activar event listeners de ordenación y filtrado
        activarListenersHeader();

        // 3. Renderizar y mostrar
        renderizarTabla();
    } catch (e) {
        console.error("Error al cargar personas:", e);
    }
}

function poblarSelectorHeader(selectId, campo, labelTodos, listaTrabajadores) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const sourceList = listaTrabajadores || todosLosTrabajadores;
    const prevVal = select.value;

    // Obtener valores únicos y ordenados
    const valoresUnicos = [...new Set(sourceList.map(p => (p[campo] || "").trim()))]
        .filter(v => v !== "")
        .sort();

    select.innerHTML = `<option value="">${labelTodos}</option>`;
    valoresUnicos.forEach(val => {
        const opt = document.createElement("option");
        opt.value = val;
        let displayVal = val;
        if (campo === "contrato_limitado") {
            displayVal = (val === "SI" || val === "SÍ") ? "Temporal" : "Indefinido";
        }
        opt.textContent = displayVal;
        select.appendChild(opt);
    });

    if (valoresUnicos.includes(prevVal)) {
        select.value = prevVal;
    } else {
        select.value = "";
        filtros[campo] = "";
    }
}

function esFormacionHecha(val) {
    if (!val) return false;
    const clean = String(val).trim().toUpperCase();
    if (clean === "0" || clean === "0:00" || clean === "00:00" || clean === "FALSE" || clean === "PENDIENTE" || clean === "") return false;
    return true;
}

function renderizarTabla() {
    const tbody = document.querySelector("#tablaPersonas tbody");
    if (!tbody) return;

    // Actualizar estado visual de los inputs de filtro
    const checkHistorial = document.getElementById("check-todo-historial");
    const mostrarTodoHistorial = checkHistorial && checkHistorial.checked;
    
    document.querySelectorAll("#tablaPersonas th .header-filter").forEach(el => {
        el.disabled = false;
        el.style.opacity = "1";
        el.style.cursor = "default";
    });

    // 1. Filtrar
    const baseTrabajadores = mostrarTodoHistorial ? (trabajadoresHistorial || todosLosTrabajadores) : todosLosTrabajadores;
    let trabajadoresFiltrados = baseTrabajadores.filter(persona => {
        const idStr = String(persona.id || "").toLowerCase();
        const nombreStr = String(persona.nombre || "").toLowerCase();
        const deptStr = String(persona.departamento || "").toLowerCase();
        const estadoStr = String(persona.estado || "").toLowerCase();
        const riesgoStr = String(persona.riesgo || "").toLowerCase();
        const diasStr = String(persona.dias || "").toLowerCase();
        
        // Chaleco filtering
        const chalecoStr = String(persona.chaleco || "").trim().toUpperCase();
        const esChaleco = chalecoStr === "SÍ" || chalecoStr === "SI";
        const filtroChaleco = filtros.chaleco.toUpperCase();
        let matchesChaleco = true;
        if (filtroChaleco === "SÍ") {
            matchesChaleco = esChaleco;
        } else if (filtroChaleco === "NO") {
            matchesChaleco = !esChaleco;
        }

        // Rendimiento filtering
        const rendStr = `${persona.productividad_ultimo_dia || ""} ${persona.productividad_media || ""}`.toLowerCase();
        const matchesRendimiento = rendStr.includes(filtros.rendimiento.toLowerCase());

        // Formación filtering
        const aulaStr = String(persona.formacion_aula || "0:00").toLowerCase();
        const camaraStr = String(persona.formacion_camara || "0:00").toLowerCase();
        const matchesAula = aulaStr.includes(filtros.formacion_aula.toLowerCase());
        const matchesCamara = camaraStr.includes(filtros.formacion_camara.toLowerCase());

        // Errores filtering
        const errStr = String(persona.error_ultimo_dia || "0").toLowerCase();
        const matchesErrores = errStr.includes(filtros.errores.toLowerCase());

        // Salida filtering
        const esBajaSalix = String(persona.finalizado || "").trim().toUpperCase() === "SÍ" || String(persona.finalizado || "").trim().toUpperCase() === "SI";
        const esBajaEstado = ["no apto", "baja"].includes(estadoStr.trim());
        const haSalido = esBajaSalix || esBajaEstado;
        
        let matchesSalida = true;
        if (filtros.salida === "NO") {
            matchesSalida = !haSalido;
        } else if (filtros.salida === "SI") {
            matchesSalida = haSalido;
        }

        return idStr.includes(filtros.id.toLowerCase()) &&
               nombreStr.includes(filtros.nombre.toLowerCase()) &&
               (filtros.departamento === "" || deptStr === filtros.departamento.toLowerCase()) &&
               (filtros.estado === "" || estadoStr === filtros.estado.toLowerCase()) &&
               (filtros.riesgo === "" || riesgoStr === filtros.riesgo.toLowerCase()) &&
               diasStr.includes(filtros.dias.toLowerCase()) &&
               matchesChaleco &&
               matchesRendimiento &&
               matchesAula &&
               matchesCamara &&
               matchesErrores &&
               matchesSalida;
    });

    // 2. Ordenar
    if (direccionOrdenacion !== "none") {
        trabajadoresFiltrados.sort((a, b) => {
            let valA = a[columnaOrdenada];
            let valB = b[columnaOrdenada];

            if (valA === undefined || valA === null) valA = "";
            if (valB === undefined || valB === null) valB = "";

            let comparison = 0;
            if (columnaOrdenada === "id" || columnaOrdenada === "dias" || columnaOrdenada === "nota") {
                const numA = parseFloat(valA) || 0;
                const numB = parseFloat(valB) || 0;
                comparison = numA - numB;
            } else if (columnaOrdenada === "rendimiento") {
                const parsePct = p => {
                    const pct = p.productividad_ultimo_dia;
                    if (!pct) return 0;
                    return parseFloat(pct.replace("%", "").trim()) || 0;
                };
                comparison = parsePct(a) - parsePct(b);
            } else if (columnaOrdenada === "formacion_aula" || columnaOrdenada === "formacion_camara") {
                const parseMins = val => {
                    if (!val || !val.includes(":")) return 0;
                    const pts = val.split(":");
                    return (parseInt(pts[0]) || 0) * 60 + (parseInt(pts[1]) || 0);
                };
                comparison = parseMins(valA) - parseMins(valB);
            } else if (columnaOrdenada === "errores") {
                const parseErr = p => parseInt(p.error_ultimo_dia) || 0;
                comparison = parseErr(a) - parseErr(b);
            } else if (columnaOrdenada === "chaleco") {
                const chalecoA = (a.chaleco || "").trim().toUpperCase();
                const chalecoB = (b.chaleco || "").trim().toUpperCase();
                comparison = chalecoA.localeCompare(chalecoB);
            } else {
                comparison = String(valA).localeCompare(String(valB));
            }

            return direccionOrdenacion === "asc" ? comparison : -comparison;
        });
    }

    // 3. Renderizar filas
    tbody.innerHTML = "";
    if (trabajadoresFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" style="text-align: center; padding: 30px; color: #999; font-style: italic;">No se encontraron personas con los filtros aplicados.</td></tr>`;
        return;
    }

    trabajadoresFiltrados.forEach(persona => {
        let colorEstado = "#666";
        switch ((persona.estado || "").trim()) {
            case "Terminado":
            case "Finalizado":
                colorEstado = "green";
                break;
            case "No apto":
                colorEstado = "red";
                break;
            case "Onboarding":
            case "Ronda equipos":
            case "Acompañamiento":
                colorEstado = "#173D2D";
                break;
            case "Shadow":
            case "Sacado H":
                colorEstado = "#d6a100";
                break;
            case "Libre":
            case "Libre fase 1":
            case "Libre fase 2":
                colorEstado = "#1a5a96";
                break;
            case "Equipo":
            case "Mentor":
                colorEstado = "#7b1a96";
                break;
        }

        let clasesFila = ["fila-persona"];
        let riesgoNorm = (persona.riesgo || "BAJO").trim().toUpperCase();
        const esRiesgoAlto = (riesgoNorm === "ALTO");
        const esChaleco = (persona.chaleco || "").trim().toUpperCase() === "SÍ" || (persona.chaleco || "").trim().toUpperCase() === "SI";

        const esBajaSalix = String(persona.finalizado || "").trim().toUpperCase() === "SÍ" || String(persona.finalizado || "").trim().toUpperCase() === "SI";

        if (esRiesgoAlto && esChaleco) {
            clasesFila.push("chaleco-riesgo-alto");
        } else if (esRiesgoAlto) {
            clasesFila.push("riesgo-alto");
        } else if (esChaleco) {
            clasesFila.push("chaleco-morado");
        }

        if (esRiesgoAlto) {
            if (persona.alertas && persona.alertas.length > 0) {
                if (persona.alertas.length > 1) {
                    clasesFila.push("alerta-multiple");
                } else {
                    let tipoAlerta = persona.alertas[0];
                    if (tipoAlerta === "Sin tutor") {
                        clasesFila.push("alerta-sin-tutor");
                    } else if (tipoAlerta === "Checklist incompleto") {
                        clasesFila.push("alerta-checklist-incompleto");
                    } else if (tipoAlerta === "Impuntualidad") {
                        clasesFila.push("alerta-impuntualidad");
                    }
                }
            }
        }

        tbody.innerHTML += `
        <tr class="${clasesFila.join(' ')}" data-id="${persona.id}" style="cursor: pointer;">
            <td>${persona.id}</td>
            <td>
                <img src="/api/trabajador/${persona.id}/foto" class="tabla-avatar" onerror="this.src='/static/img/avatar.png'">
            </td>
            <td style="text-align: center;" class="celda-chaleco-editable">
                <input type="checkbox" class="check-chaleco" data-id="${persona.id}" ${esChaleco ? 'checked' : ''} style="transform: scale(1.25); cursor: pointer;">
            </td>
            <td>${persona.nombre}</td>
            <td>${persona.departamento || "-"}</td>
            <td style="color:${colorEstado};font-weight:bold;">
                ${persona.estado || "-"}
            </td>
            <td style="text-align: center; font-weight: 500;">
                ${(persona.contrato_limitado === "SI" || persona.contrato_limitado === "SÍ") ? "Temporal" : "Indefinido"}
            </td>
            <td style="text-align: center; font-size: 1.3em;">
                ${esBajaSalix ? '<span title="Baja en Salix (Sin departamento)" style="cursor: help;">🚪</span>' : ''}
            </td>
            <td class="celda-riesgo-editable" data-id="${persona.id}" data-valor="${persona.riesgo || 'BAJO'}">
                <div class="riesgo-display" style="display: flex; align-items: center; gap: 8px;">
                    <span class="riesgo-dot ${riesgoNorm.toLowerCase()}"></span>
                    <span class="riesgo-texto">${persona.riesgo || "BAJO"}</span>
                    <span class="riesgo-edit-pencil" style="opacity: 0; font-size: 0.8em; margin-left: auto; transition: opacity 0.2s;">✏️</span>
                </div>
            </td>
            <td>${persona.dias || "-"}</td>
            <td style="text-align: center;">
                <span style="font-weight: bold; color: ${(function() {
                    const n = parseFloat(persona.nota);
                    if (isNaN(n)) return '#718096';
                    if (n < 5.0) return '#e53e3e';
                    if (n < 8.0) return '#dd6b20';
                    return '#38a169';
                })()}">
                    ${persona.nota ? parseFloat(persona.nota).toFixed(2) : "-"}
                </span>
            </td>
            <td>
                <strong>${(function() {
                    const emojiMap = { "ROJO": "🔴", "AMARILLO": "🟡", "VERDE": "🟢", "GRIS": "⚪" };
                    return (emojiMap[persona.color_code] || "⚪") + " ";
                })()}${persona.productividad_ultimo_dia || "-"}</strong>
                ${persona.productividad_media ? `<span style="font-size: 0.85em; color: #718096; margin-left: 5px;">(${persona.productividad_media} l/h)</span>` : ""}
            </td>
            <td style="text-align: center;">
                <span style="font-weight: bold; color: ${parseInt(persona.error_ultimo_dia) > 0 ? '#e53e3e' : '#718096'}">
                    ${persona.error_ultimo_dia || "0"}
                </span>
            </td>
            <td style="text-align: center;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span class="riesgo-dot ${esFormacionHecha(persona.formacion_aula) ? 'bajo' : 'alto'}" style="margin-top: 2px;"></span>
                    <span style="font-weight: bold; color: #2b6cb0;">${persona.formacion_aula || "0:00"}</span>
                </div>
            </td>
            <td style="text-align: center;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span class="riesgo-dot ${esFormacionHecha(persona.formacion_camara) ? 'bajo' : 'alto'}" style="margin-top: 2px;"></span>
                    <span style="font-weight: bold; color: #2b6cb0;">${persona.formacion_camara || "0:00"}</span>
                </div>
            </td>
        </tr>
        `;
    });

    // 4. Actualizar iconos de ordenación visuales
    document.querySelectorAll("#tablaPersonas th .sort-icon").forEach(icon => {
        icon.textContent = "⇅";
        icon.style.opacity = "0.5";
    });

    const thOrdenado = document.querySelector(`#tablaPersonas th[data-column="${columnaOrdenada}"]`);
    if (thOrdenado) {
        const icon = thOrdenado.querySelector(".sort-icon");
        if (icon) {
            icon.textContent = direccionOrdenacion === "asc" ? "▲" : (direccionOrdenacion === "desc" ? "▼" : "⇅");
            icon.style.opacity = "1";
        }
    }

    activarClicks();
}

function activarListenersHeader() {
    const checkHistorial = document.getElementById("check-todo-historial");
    if (checkHistorial) {
        checkHistorial.addEventListener("change", async () => {
            const selectSalida = document.getElementById("filtro-salida");
            if (checkHistorial.checked) {
                if (selectSalida) {
                    selectSalida.value = "";
                    filtros.salida = "";
                }
                if (!trabajadoresHistorial) {
                    try {
                        const tbody = document.querySelector("#tablaPersonas tbody");
                        if (tbody) {
                            tbody.innerHTML = `<tr><td colspan="15" style="text-align: center; padding: 30px; color: #666; font-weight: bold;">Cargando historial completo...</td></tr>`;
                        }
                        const respuesta = await fetch("/api/personas?historial=true");
                        trabajadoresHistorial = await respuesta.json();
                    } catch (e) {
                        console.error("Error al cargar historial completo:", e);
                        alert("Error al cargar el historial completo de personas.");
                        checkHistorial.checked = false;
                        if (selectSalida) {
                            selectSalida.value = "NO";
                            filtros.salida = "NO";
                        }
                        return;
                    }
                }
            } else {
                if (selectSalida) {
                    selectSalida.value = "NO";
                    filtros.salida = "NO";
                }
            }
            
            // Repoblar selectores con la lista correspondiente
            const list = checkHistorial.checked ? (trabajadoresHistorial || todosLosTrabajadores) : todosLosTrabajadores;
            poblarSelectorHeader("filtro-departamento", "departamento", "🏢 Dept...", list);
            poblarSelectorHeader("filtro-estado", "estado", "📋 Estado...", list);
            poblarSelectorHeader("filtro-contrato", "contrato_limitado", "📜 Contrato...", list);
            poblarSelectorHeader("filtro-riesgo", "riesgo", "⚠️ Riesgo...", list);
            
            renderizarTabla();
        });
    }

    const inputsFiltro = document.querySelectorAll("#tablaPersonas th .header-filter");
    inputsFiltro.forEach(el => {
        const campo = el.dataset.campo;
        const eventType = el.tagName === "SELECT" ? "change" : "keyup";
        
        el.addEventListener(eventType, () => {
            filtros[campo] = el.value;
            renderizarTabla();
        });
        
        if (eventType === "keyup") {
            el.addEventListener("search", () => {
                filtros[campo] = el.value;
                renderizarTabla();
            });
            el.addEventListener("change", () => {
                filtros[campo] = el.value;
                renderizarTabla();
            });
        }
    });

    const thsSort = document.querySelectorAll("#tablaPersonas th .header-sort");
    thsSort.forEach(el => {
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => {
            if (e.target.closest(".header-filter")) return;

            const th = el.closest("th");
            const columna = th.dataset.column;

            if (columnaOrdenada === columna) {
                direccionOrdenacion = (direccionOrdenacion === "asc") ? "desc" : "asc";
            } else {
                columnaOrdenada = columna;
                direccionOrdenacion = "asc";
            }

            renderizarTabla();
        });
    });
}

function activarClicks() {
    // 1. Clic en fila para navegar al expediente
    document.querySelectorAll(".fila-persona").forEach(fila => {
        const nuevaFila = fila.cloneNode(true);
        fila.parentNode.replaceChild(nuevaFila, fila);
        
        nuevaFila.addEventListener("click", function (e) {
            if (
                e.target.closest(".header-filter") || 
                e.target.closest(".celda-riesgo-editable") || 
                e.target.closest(".celda-chaleco-editable") || 
                e.target.closest(".check-chaleco")
            ) return;
            const id = this.dataset.id;
            window.open("/expediente/" + id, "_blank");
        });
    });

    // 1.5. Clic/Cambio en el checkbox de Chaleco
    document.querySelectorAll(".check-chaleco").forEach(check => {
        check.addEventListener("click", function(e) {
            e.stopPropagation(); // Evitar click en la fila
        });
        check.addEventListener("change", async function(e) {
            e.stopPropagation();
            const id = this.dataset.id;
            const checked = this.checked;
            const valor = checked ? "SÍ" : "NO";
            
            // Efecto visual inmediato (Optimistic UI)
            const fila = this.closest(".fila-persona");
            const esRiesgoAlto = fila.classList.contains("riesgo-alto") || fila.classList.contains("chaleco-riesgo-alto");
            
            if (checked) {
                fila.classList.remove("riesgo-alto");
                if (esRiesgoAlto) {
                    fila.classList.add("chaleco-riesgo-alto");
                } else {
                    fila.classList.add("chaleco-morado");
                }
            } else {
                fila.classList.remove("chaleco-morado");
                if (esRiesgoAlto) {
                    fila.classList.remove("chaleco-riesgo-alto");
                    fila.classList.add("riesgo-alto");
                }
            }
            
            try {
                const res = await fetch("/api/persona/actualizar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: id, campo: "chaleco", valor: valor })
                });
                const data = await res.json();
                if (!data || !data.ok) {
                    alert("Error al actualizar chaleco: " + (data.error || "Error desconocido"));
                    // Revertir
                    this.checked = !checked;
                    if (this.checked) {
                        fila.classList.remove("riesgo-alto");
                        if (esRiesgoAlto) fila.classList.add("chaleco-riesgo-alto");
                        else fila.classList.add("chaleco-morado");
                    } else {
                        fila.classList.remove("chaleco-morado", "chaleco-riesgo-alto");
                        if (esRiesgoAlto) fila.classList.add("riesgo-alto");
                    }
                } else {
                    // Actualizar en memoria local
                    const pLocal = todosLosTrabajadores.find(p => String(p.id) === String(id));
                    if (pLocal) pLocal.chaleco = valor;
                    if (trabajadoresHistorial) {
                        const pHisto = trabajadoresHistorial.find(p => String(p.id) === String(id));
                        if (pHisto) pHisto.chaleco = valor;
                    }
                }
            } catch (err) {
                console.error("Error al actualizar chaleco:", err);
                alert("Error de conexión al guardar el chaleco.");
                // Revertir
                this.checked = !checked;
                if (this.checked) {
                    fila.classList.remove("riesgo-alto");
                    if (esRiesgoAlto) fila.classList.add("chaleco-riesgo-alto");
                    else fila.classList.add("chaleco-morado");
                } else {
                    fila.classList.remove("chaleco-morado", "chaleco-riesgo-alto");
                    if (esRiesgoAlto) fila.classList.add("riesgo-alto");
                }
            }
        });
    });

    // 2. Clic en celda de riesgo para editar inline
    document.querySelectorAll(".celda-riesgo-editable").forEach(cell => {
        cell.addEventListener("click", function(e) {
            e.stopPropagation(); // Evitar navegación al expediente
            
            if (this.dataset.editing === "true") return;
            this.dataset.editing = "true";

            const idTrabajador = this.dataset.id;
            const valorActual = this.dataset.valor || "BAJO";
            const originalHTML = this.innerHTML;

            const select = document.createElement("select");
            select.style.padding = "4px 8px";
            select.style.fontSize = "0.95em";
            select.style.borderRadius = "6px";
            select.style.border = "1px solid #ccc";
            select.style.width = "100%";
            select.style.boxSizing = "border-box";
            select.style.background = "white";
            select.style.color = "#333";

            ["BAJO", "MEDIO", "ALTO"].forEach(optVal => {
                const opt = document.createElement("option");
                opt.value = optVal;
                opt.textContent = optVal;
                if (optVal === valorActual) opt.selected = true;
                select.appendChild(opt);
            });

            this.innerHTML = "";
            this.appendChild(select);
            select.focus();

            const guardarCambio = async () => {
                const nuevoValor = select.value;
                if (nuevoValor === valorActual) {
                    this.innerHTML = originalHTML;
                    delete this.dataset.editing;
                    return;
                }

                try {
                    this.style.opacity = "0.5";
                    const res = await fetch("/api/persona/actualizar", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: idTrabajador, campo: "riesgo", valor: nuevoValor })
                    });
                    const data = await res.json();
                    if (data && data.ok) {
                        this.dataset.valor = nuevoValor;

                        const personaObj = todosLosTrabajadores.find(p => String(p.id) === String(idTrabajador));
                        if (personaObj) {
                            personaObj.riesgo = nuevoValor;
                        }

                        renderizarTabla();
                    } else {
                        alert(data.error || "No se pudo actualizar");
                        this.innerHTML = originalHTML;
                    }
                } catch (err) {
                    console.error("Error al actualizar riesgo:", err);
                    alert("Error al conectar con el servidor");
                    this.innerHTML = originalHTML;
                } finally {
                    this.style.opacity = "1";
                    delete this.dataset.editing;
                }
            };

            select.addEventListener("change", guardarCambio);
            select.addEventListener("blur", () => {
                setTimeout(() => {
                    if (this.dataset.editing === "true") {
                        this.innerHTML = originalHTML;
                        delete this.dataset.editing;
                    }
                }, 150);
            });
        });
    });
}

cargarPersonas();