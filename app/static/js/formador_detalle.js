document.addEventListener("DOMContentLoaded", () => {
    const formadorId = document.getElementById("formador-id-holder").textContent.trim();

    const avatarDet = document.getElementById("formador-avatar-det");
    const nombreDet = document.getElementById("formador-nombre-det");
    const codigoDet = document.getElementById("formador-codigo-det");
    const idDet = document.getElementById("formador-id-det");
    const horasTotal = document.getElementById("formador-horas-total");

    const listaAlumnos = document.getElementById("lista-alumnos-cuerpo");
    const timeline = document.getElementById("timeline-clases");

    let chartInstance = null;

    function durationToDecimal(durationStr) {
        if (!durationStr) return 0;
        const parts = durationStr.split(":");
        if (parts.length >= 2) {
            return parseInt(parts[0]) + parseInt(parts[1]) / 60;
        }
        return 0;
    }

    async function cargarDetalleFormador() {
        try {
            const res = await fetch(`/api/formador/${formadorId}/detalle`);
            if (!res.ok) throw new Error("Error cargando detalle");
            const data = await res.json();
            
            // 1. Renderizar Cabecera
            const f = data.formador;
            avatarDet.textContent = f.codigo || "?";
            nombreDet.textContent = f.nombre;
            codigoDet.textContent = f.codigo;
            idDet.textContent = f.id;
            horasTotal.textContent = `${data.total_horas_calc}h`;

            // 2. Renderizar Tabla de Alumnos
            listaAlumnos.innerHTML = "";
            if (data.alumnos.length === 0) {
                listaAlumnos.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #7f8c8d;">No hay alumnos registrados.</td></tr>';
            } else {
                data.alumnos.forEach(a => {
                    const row = document.createElement("tr");
                    row.style.borderBottom = "1px solid #f1f2f6";
                    
                    const estadoDot = a.activo ? '<span style="color: #2ecc71; font-size: 1.1rem; cursor: default;" title="Activo">🟢</span>' : '<span style="color: #95a5a6; font-size: 1.1rem; cursor: default;" title="Inactivo (Finalizado)">⚫</span>';
                    
                    row.innerHTML = `
                        <td style="padding: 12px 10px; text-align: center;">${estadoDot}</td>
                        <td style="padding: 12px 10px;">
                            <a href="/expediente/${a.id}" style="text-decoration: none; color: #1a5c37; font-weight: 700; transition: color 0.15s;">${a.nombre}</a>
                        </td>
                        <td style="padding: 12px 10px; color: #7f8c8d; font-size: 0.9rem;">${a.departamento || "-"}</td>
                        <td style="padding: 12px 10px; text-align: center; font-weight: 600;">${a.horas_camara}</td>
                        <td style="padding: 12px 10px; text-align: center; font-weight: 600;">${a.horas_aula}</td>
                    `;
                    listaAlumnos.appendChild(row);
                });
            }

            // 3. Renderizar Timeline de Clases
            timeline.innerHTML = "";
            if (data.timeline.length === 0) {
                timeline.innerHTML = '<div style="text-align: center; padding: 20px; color: #7f8c8d;">No hay sesiones impartidas registradas.</div>';
            } else {
                data.timeline.forEach(t => {
                    const item = document.createElement("div");
                    item.className = "timeline-item";
                    
                    const labelBadge = t.tipo === "Cámara" ? '<span style="background: #e3f2fd; color: #2196f3; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; margin-right: 8px;">📹 Cámara</span>' : '<span style="background: #fff3e0; color: #ff9800; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; margin-right: 8px;">🏫 Aula</span>';
                    
                    item.innerHTML = `
                        <div class="timeline-content">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                                <span style="font-size: 0.85rem; color: #7f8c8d; font-weight: bold;">📅 ${t.fecha}</span>
                                <span style="font-weight: 700; color: #2c3e50;">⏱️ ${t.duracion}h</span>
                            </div>
                            <div style="font-size: 0.95rem;">
                                ${labelBadge} Enseñó a <a href="/expediente/${t.alumno_id}" style="text-decoration: none; color: #1a5c37; font-weight: 700;">${t.alumno_nombre}</a>
                            </div>
                            <div style="font-size: 0.8rem; color: #7f8c8d; margin-top: 4px;">🏢 Dpto: ${t.departamento || "-"}</div>
                        </div>
                    `;
                    timeline.appendChild(item);
                });
            }

            // 4. Renderizar Gráfico Chart.js
            renderChart(data);

        } catch (err) {
            console.error("Error cargando detalle de formador:", err);
        }
    }

    function renderChart(data) {
        const ctx = document.getElementById("chart-formador-horas").getContext("2d");
        
        const valCamara = durationToDecimal(data.horas_camara_calc);
        const valAula = durationToDecimal(data.horas_aula_calc);

        if (chartInstance) {
            chartInstance.destroy();
        }

        // Determinar modo oscuro para colores de texto
        const isDarkMode = document.body.classList.contains("dark-mode");
        const textColor = isDarkMode ? "#f1f5f9" : "#2c3e50";

        chartInstance = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels: ["Cámara (Práctico)", "Aula (Teórico)"],
                datasets: [{
                    data: [valCamara.toFixed(1), valAula.toFixed(1)],
                    backgroundColor: ["#1a5c37", "#ff9800"],
                    borderWidth: isDarkMode ? 2 : 1,
                    borderColor: isDarkMode ? "#1e293b" : "#ffffff"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "right",
                        labels: {
                            color: textColor,
                            font: {
                                weight: "bold",
                                family: "Segoe UI, Arial"
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.label}: ${context.raw} horas`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Escuchar cambios de modo oscuro para refrescar colores del gráfico
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === "class") {
                cargarDetalleFormador();
            }
        });
    });
    observer.observe(document.body, { attributes: true });

    cargarDetalleFormador();
});
