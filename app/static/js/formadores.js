document.addEventListener("DOMContentLoaded", () => {
    let formadoresList = [];
    let totalAlumnosCount = 0;
    let chartInstance = null;

    const kpiTotal = document.getElementById("kpi-total-formadores");
    const kpiCamara = document.getElementById("kpi-horas-camara");
    const kpiAula = document.getElementById("kpi-horas-aula");
    const kpiAlumnos = document.getElementById("kpi-empleados-asignados");
    const grid = document.getElementById("grid-formadores");
    const buscador = document.getElementById("buscador-formadores");

    // Función para convertir duración "HH:MM" a minutos
    function parseDurationToMins(durationStr) {
        if (!durationStr) return 0;
        const parts = durationStr.split(":");
        if (parts.length >= 2) {
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
        return 0;
    }

    // Convertir minutos a formato HH:MM
    function minsToDurationStr(totalMins) {
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        return `${h}:${m.toString().padStart(2, "0")}h`;
    }

    // Cargar datos del API
    async function cargarFormadores() {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #7f8c8d; font-size: 1.1rem;">⏳ Cargando formadores...</div>';
        try {
            const res = await fetch("/api/formadores");
            if (!res.ok) throw new Error("Error de conexión");
            const data = await res.json();
            formadoresList = data.formadores || [];
            totalAlumnosCount = data.total_alumnos || 0;
            
            calcularKpis();
            renderChart(formadoresList);
            renderGrid(formadoresList);
        } catch (err) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #e74c3c; font-size: 1.1rem;">❌ Error cargando formadores: ${err.message}</div>`;
        }
    }

    // Calcular KPIs de cabecera
    function calcularKpis() {
        kpiTotal.textContent = formadoresList.length;

        let totalMinsCamara = 0;
        let totalMinsAula = 0;

        formadoresList.forEach(f => {
            totalMinsCamara += parseDurationToMins(f.horas_camara);
            totalMinsAula += parseDurationToMins(f.horas_aula);
        });

        kpiCamara.textContent = minsToDurationStr(totalMinsCamara);
        kpiAula.textContent = minsToDurationStr(totalMinsAula);
        if (kpiAlumnos) {
            kpiAlumnos.textContent = totalAlumnosCount;
        }
    }

    // Renderizar Gráfico Comparativo
    function renderChart(list) {
        const ctx = document.getElementById("grafico-formadores");
        if (!ctx) return;

        if (chartInstance) {
            chartInstance.destroy();
        }

        // Sort by total hours descending
        const sorted = [...list].sort((a, b) => {
            const totalA = parseDurationToMins(a.horas_camara) + parseDurationToMins(a.horas_aula);
            const totalB = parseDurationToMins(b.horas_camara) + parseDurationToMins(b.horas_aula);
            return totalB - totalA;
        });

        const labels = sorted.map(f => f.nombre.split(" ").slice(0, 2).join(" "));
        const dataCamara = sorted.map(f => parseFloat((parseDurationToMins(f.horas_camara) / 60.0).toFixed(1)));
        const dataAula = sorted.map(f => parseFloat((parseDurationToMins(f.horas_aula) / 60.0).toFixed(1)));

        // Determinar colores según modo oscuro
        const isDark = document.body.classList.contains("dark-mode");
        const gridColor = isDark ? "#334155" : "#edf2f7";
        const textColor = isDark ? "#f1f5f9" : "#2c3e50";

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Horas Cámara',
                        data: dataCamara,
                        backgroundColor: '#2196f3',
                        borderColor: '#2196f3',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Horas Aula',
                        data: dataAula,
                        backgroundColor: '#ff9800',
                        borderColor: '#ff9800',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: textColor,
                            font: { weight: 'bold', size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${context.raw}h`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { size: 10 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: { color: textColor },
                        title: {
                            display: true,
                            text: 'Horas Impartidas',
                            color: textColor,
                            font: { weight: 'bold' }
                        }
                    }
                }
            }
        });
    }

    // Renderizar tarjetas en el Grid
    function renderGrid(list) {
        grid.innerHTML = "";
        if (list.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #7f8c8d; font-size: 1.1rem;">🔍 No se encontraron formadores.</div>';
            return;
        }

        list.forEach(f => {
            const card = document.createElement("div");
            card.className = "formador-card";
            card.dataset.id = f.id;
            
            card.innerHTML = `
                <div>
                    <div class="formador-header">
                        <div class="formador-avatar">${f.codigo || "?"}</div>
                        <div class="formador-title">
                            <h3>${f.nombre}</h3>
                            <span>ID: ${f.id}</span>
                        </div>
                    </div>
                </div>
                <div class="formador-stats">
                    <div class="stat-item">
                        <span class="stat-label">Cámara</span>
                        <span class="stat-value">📹 ${f.horas_camara}h</span>
                        <span class="stat-label" style="font-size: 0.65rem; margin-top: 1px;">(${f.dias_camara} días)</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Aula</span>
                        <span class="stat-value">🏫 ${f.horas_aula}h</span>
                        <span class="stat-label" style="font-size: 0.65rem; margin-top: 1px;">(${f.dias_aula} días)</span>
                    </div>
                </div>
                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #edf2f7; font-size: 0.85rem; color: #7f8c8d; display: flex; align-items: center; gap: 5px;">
                    👥 Empleados formados: <strong style="color: #2c3e50;" class="alumno-count-val">${f.alumnos_unicos || 0}</strong>
                </div>
            `;
            
            card.addEventListener("click", () => {
                window.location.href = `/formador/${f.id}`;
            });
            
            grid.appendChild(card);
        });

        // Add dark-mode adjustments to trainee count inside grid
        if (document.body.classList.contains("dark-mode")) {
            document.querySelectorAll(".alumno-count-val").forEach(el => el.style.color = "#f1f5f9");
        }
    }

    // Buscador interactivo
    buscador.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const filtered = formadoresList.filter(f => {
            const nameNorm = f.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const codeNorm = (f.codigo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const idStr = String(f.id);
            return nameNorm.includes(query) || codeNorm.includes(query) || idStr.includes(query);
        });
        renderChart(filtered);
        renderGrid(filtered);
    });

    cargarFormadores();
});
