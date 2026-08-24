let allFormadores = [];
let allUsuarios = [];

document.addEventListener("DOMContentLoaded", () => {
    cargarFormadores();
    cargarUsuarios();
});

async function cargarFormadores() {
    try {
        const res = await fetch("/api/formadores");
        if (!res.ok) throw new Error();
        allFormadores = await res.json();
        
        const select = document.getElementById("form-usuario-formador");
        if (select) {
            select.innerHTML = '<option value="">-- Selecciona un formador... --</option>';
            allFormadores.forEach(f => {
                const opt = document.createElement("option");
                opt.value = f.id;
                opt.textContent = `${f.nombre} (${f.id})`;
                select.appendChild(opt);
            });
            // Añadir una opción manual al final
            const optManual = document.createElement("option");
            optManual.value = "manual";
            optManual.textContent = "✏️ Escribir manualmente...";
            select.appendChild(optManual);
        }
    } catch (err) {
        console.error("Error al cargar formadores:", err);
    }
}

function actualizarCamposEmpleado(val) {
    const inputId = document.getElementById("form-usuario-id");
    const inputNombre = document.getElementById("form-usuario-nombre");
    
    if (val === "manual") {
        inputId.readOnly = false;
        inputNombre.readOnly = false;
        inputId.style.background = "white";
        inputNombre.style.background = "white";
        inputId.value = "";
        inputNombre.value = "";
    } else if (val) {
        const formador = allFormadores.find(f => String(f.id) === String(val));
        if (formador) {
            inputId.value = formador.id;
            inputNombre.value = formador.nombre;
        }
        inputId.readOnly = true;
        inputNombre.readOnly = true;
        inputId.style.background = "#e2e8f0";
        inputNombre.style.background = "#e2e8f0";
    } else {
        inputId.value = "";
        inputNombre.value = "";
        inputId.readOnly = true;
        inputNombre.readOnly = true;
        inputId.style.background = "#e2e8f0";
        inputNombre.style.background = "#e2e8f0";
    }
}

async function cargarUsuarios() {
    try {
        const res = await fetch("/api/usuarios");
        if (!res.ok) throw new Error();
        allUsuarios = await res.json();
        renderizarTabla();
    } catch (err) {
        console.error("Error al cargar usuarios:", err);
    }
}

function renderizarTabla() {
    const tbody = document.getElementById("tbody-usuarios");
    if (!tbody) return;
    
    if (allUsuarios.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: #718096; padding: 20px; font-style: italic;">
                    No hay usuarios registrados en el sistema.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = allUsuarios.map(u => {
        const rolClass = getRolClass(u.rol);
        const estadoClass = u.activo === "Sí" ? "estado-activo" : "estado-inactivo";
        
        return `
            <tr id="tr-user-${u.fila_idx}">
                <td style="padding: 12px 10px;">${escapeHtml(u.id)}</td>
                <td style="padding: 12px 10px; font-weight: 600; color: #2d3748;">${escapeHtml(u.nombre)}</td>
                <td style="padding: 12px 10px;"><code>${escapeHtml(u.usuario)}</code></td>
                <td style="padding: 12px 10px; color: #718096; font-family: monospace;">••••••••</td>
                <td style="padding: 12px 10px;">
                    <span class="rol-badge ${rolClass}">${escapeHtml(u.rol)}</span>
                </td>
                <td style="padding: 12px 10px;">
                    <span class="estado-badge ${estadoClass}">${u.activo === "Sí" ? "Activo" : "Inactivo"}</span>
                </td>
                <td style="padding: 12px 10px; text-align: right;">
                    <button class="action-btn" onclick="abrirModalEditar(${u.fila_idx})" title="Editar usuario">✏️</button>
                    <button class="action-btn" onclick="eliminarUsuario(${u.fila_idx})" title="Eliminar usuario" style="margin-left: 8px;">❌</button>
                </td>
            </tr>
        `;
    }).join("");
}

function getRolClass(rol) {
    const r = String(rol).toUpperCase().trim();
    if (r === "ADMINISTRADOR") return "rol-administrador";
    if (r === "RRHH") return "rol-rrhh";
    if (r === "RESPONSABLE") return "rol-responsable";
    return "rol-formador";
}

function abrirModalCrear() {
    document.getElementById("modal-titulo").textContent = "Crear Nuevo Usuario";
    document.getElementById("form-fila-idx").value = "";
    document.getElementById("form-usuario-formador").value = "";
    document.getElementById("form-usuario-formador").style.display = "block";
    actualizarCamposEmpleado("");
    
    document.getElementById("form-usuario-username").value = "";
    document.getElementById("form-usuario-password").value = "";
    document.getElementById("form-usuario-rol").value = "Formador";
    document.getElementById("form-usuario-activo").value = "Sí";
    
    document.getElementById("modal-usuario").style.display = "flex";
}

function abrirModalEditar(filaIdx) {
    const u = allUsuarios.find(x => x.fila_idx === filaIdx);
    if (!u) return;
    
    document.getElementById("modal-titulo").textContent = "Editar Usuario";
    document.getElementById("form-fila-idx").value = filaIdx;
    
    // Ocultar selector para edición
    const select = document.getElementById("form-usuario-formador");
    if (select) {
        select.style.display = "none";
    }
    
    const inputId = document.getElementById("form-usuario-id");
    const inputNombre = document.getElementById("form-usuario-nombre");
    inputId.value = u.id;
    inputNombre.value = u.nombre;
    inputId.readOnly = true;
    inputNombre.readOnly = true;
    inputId.style.background = "#e2e8f0";
    inputNombre.style.background = "#e2e8f0";
    
    document.getElementById("form-usuario-username").value = u.usuario;
    document.getElementById("form-usuario-password").value = u.contrasena;
    document.getElementById("form-usuario-rol").value = u.rol;
    document.getElementById("form-usuario-activo").value = u.activo;
    
    document.getElementById("modal-usuario").style.display = "flex";
}

function cerrarModal() {
    document.getElementById("modal-usuario").style.display = "none";
}

async function guardarUsuarioForm(e) {
    e.preventDefault();
    
    const filaIdx = document.getElementById("form-fila-idx").value;
    const payload = {
        id: document.getElementById("form-usuario-id").value,
        nombre: document.getElementById("form-usuario-nombre").value,
        usuario: document.getElementById("form-usuario-username").value,
        contrasena: document.getElementById("form-usuario-password").value,
        rol: document.getElementById("form-usuario-rol").value,
        activo: document.getElementById("form-usuario-activo").value
    };
    
    if (!payload.id || !payload.nombre || !payload.usuario || !payload.contrasena) {
        alert("Todos los campos obligatorios deben estar rellenos.");
        return;
    }
    
    try {
        let res;
        if (filaIdx) {
            res = await fetch(`/api/usuarios/${filaIdx}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch("/api/usuarios", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }
        
        const result = await res.json();
        if (res.ok && result.ok) {
            cerrarModal();
            await cargarUsuarios();
        } else {
            alert("Error al guardar: " + (result.error || "Error desconocido"));
        }
    } catch (err) {
        console.error("Error al guardar usuario:", err);
        alert("Error de conexión al guardar el usuario");
    }
}

async function eliminarUsuario(filaIdx) {
    if (!confirm("¿Estás seguro de que deseas eliminar este acceso de usuario?")) return;
    
    try {
        const res = await fetch(`/api/usuarios/${filaIdx}`, { method: "DELETE" });
        const result = await res.json();
        if (res.ok && result.ok) {
            await cargarUsuarios();
        } else {
            alert("Error al eliminar: " + (result.error || "Error desconocido"));
        }
    } catch (err) {
        console.error("Error al eliminar usuario:", err);
        alert("Error de conexión al eliminar");
    }
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
