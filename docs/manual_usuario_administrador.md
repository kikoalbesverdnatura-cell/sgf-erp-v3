# SGF ERP V3 - Manual de Utilización para Administradores ⚙️

¡Bienvenido al Manual de Usuario de **SGF ERP V3**. Este documento está diseñado para ayudarte a comprender y utilizar al máximo todas las funciones y herramientas de administración del sistema de forma sencilla y práctica, sin tecnicismos.

El propósito principal de esta aplicación es realizar el seguimiento, control, planificación y evaluación del desempeño de los nuevos operarios en período de formación (Sacadores, Encajadores y personal de Taller Natural).

---

## 📌 1. Acceso e Inicio de Sesión
Para acceder al sistema como Administrador:
1. Abre el navegador y dirígete a la dirección del ERP (ej: `http://localhost:8000`).
2. Introduce tu nombre de usuario administrador (por ejemplo, `kiko.albert`) y tu contraseña.
3. Al iniciar sesión, el sistema te redirigirá automáticamente al **Dashboard** (Panel de Mandos).

> [!NOTE]
> A diferencia de los usuarios restringidos (como Norman, Daniel o Dodo, quienes solo tienen acceso a la lista de empleados), tú como **Administrador** tienes acceso completo e ilimitado a todas las secciones del ERP, incluyendo paneles de analíticas, planificación, control de usuarios y auditoría.

---

## 🏠 2. El Dashboard (Panel de Mandos Principal)
El Dashboard es tu centro de operaciones y control. Al entrar, verás un saludo personalizado con tu nombre y el resumen de la actividad diaria.

A continuación se detallan las tarjetas y herramientas del Dashboard:

### 📈 2.1 Tarjetas de KPIs (Indicadores Clave)
En la parte superior verás 4 bloques con métricas en tiempo real:
* **Operarios Activos**: Muestra la cantidad total de personas en fase de formación (días de seguimiento menor o igual a 31).
* **Días de Seguimiento Medio**: El promedio de días que llevan los operarios activos en el programa.
* **Alertas Activas**: Número de avisos automáticos de bajo rendimiento o faltas graves pendientes de revisar.
* **Tasa de Aptos**: Porcentaje acumulado de éxito de los operarios que han superado el período de formación.

### 📊 2.2 Gráfico de Desempeño de Sacadores en Formación
Este gráfico de barras interactivo muestra las calificaciones o notas (de 0 a 10) de los operarios activos en sacado o taller natural. Cuenta con dos vistas que puedes alternar con los botones superiores derechos:
* **`Local (Hoy)`**: Muestra el rendimiento calculado específicamente para el **día de hoy**. Si no hay actividad registrada en la jornada actual, aparecerá vacío de forma temporal.
* **`Local (Histórico)`**: Muestra la nota acumulada y consolidada de los **últimos 14 días**. Es idóneo para supervisar la trayectoria general a corto plazo de cada aprendiz de manera local y estable.

### 📅 2.3 Incorporaciones del Día y Clases Programadas (Agenda)
* **Incorporaciones**: Muestra a los operarios que inician hoy su formación, indicando su departamento asignado y tutor de referencia.
* **Agenda**: Detalla las clases teóricas o prácticas programadas para hoy, con su horario, aula, formador e inscritos.

### ⚠️ 2.4 Avisos Taller Natural (Días ≥ 15 sin Sacar en H)
Esta tarjeta especial te avisa de una situación crítica en el departamento de **Taller Natural**:
* **Criterio de alerta**: Lista a aquellos operarios que llevan **15 días o más** desde su incorporación al ERP, pero tienen **menos de 0.1 horas** de datos registrados preparando en Cámara H (Sacado H).
* **Utilidad**: Te ayuda a detectar de inmediato si un operario de Taller Natural se está retrasando en la formación de sacado H para que puedas intervenir o reasignar sus tareas de aprendizaje.

### 📝 2.5 Actividad de Formadores Restringidos (Timeline Daniel, Norman, Dodo)
Como administrador, necesitas saber qué anotaciones e incidencias registran los formadores que tienen acceso limitado al ERP.
* **Qué muestra**: Un listado cronológico con las últimas anotaciones y comentarios escritos en las fichas de los empleados por los usuarios **Daniel**, **Norman** y **Dodo**.
* **Identificación rápida**: Cada fila muestra el nombre del operario afectado, la fecha, el comentario y una etiqueta con el nombre del formador (ej: `✍️ norman`, `✍️ dodo`) en color azul para facilitar su lectura.
* **Enlace directo**: Puedes pulsar sobre cualquier anotación de este timeline para abrir directamente la ficha del operario afectado.

### 🔄 2.6 Botón "Actualizar" (Forzar Refresco de Datos)
El ERP almacena temporalmente los datos en caché para no saturar las cuotas de Google Sheets. Sin embargo, si acabas de hacer modificaciones directamente en la hoja de cálculo de Google y quieres verlas reflejadas en el acto:
* Haz clic en el botón **`Actualizar`** en la parte superior del Dashboard. Esto obligará al servidor a descargar los datos directamente del Sheets en ese momento, refrescando todos los indicadores de forma inmediata.

---

## 👥 3. Fichas de Empleados (Sección Personas)
Al hacer clic en **`👥 Empleados`** en el menú de navegación, verás la lista completa de trabajadores en formación.

### 🔍 3.1 Listado y Búsqueda
* Puedes filtrar entre **Activos** e **Historial** (inactivos, terminados o bajas).
* Dispones de un buscador en tiempo real para localizar a cualquier operario por su nombre o ID.
* Cada fila tiene un código de color (Semáforo):
  * **Verde**: Operario con rendimiento excelente y sin alertas.
  * **Amarillo**: Operario en progreso medio o con avisos menores.
  * **Rojo**: Alerta crítica de bajo rendimiento, errores continuados o inactividad.

### 📄 3.2 Ficha Detallada (Expediente)
Al pulsar sobre el nombre de un operario, se abrirá su expediente completo, el cual contiene:

#### A. Métricas Acumuladas
Horas de formación invertidas en las distintas ubicaciones de la planta (Aula de teoría, Cámara H, Cámara V, etc.), así como su rendimiento e histórico de líneas preparadas por hora.

#### B. Checklist de Fases (Fase 1, 2, 3...)
* Es una lista interactiva de destrezas, exámenes y firmas obligatorias.
* Puedes marcar o desmarcar cada ítem según el operario vaya superando los hitos de aprendizaje.
* El sistema guarda el progreso automáticamente y actualiza la barra de porcentaje.

#### C. Registro de Observaciones
* Puedes escribir nuevos comentarios para dejar constancia de cómo evoluciona el operario.
* Cada observación se clasifica con un tipo: `General`, `Progreso`, `Riesgo/Alerta`, o `Felicitación`. 
* Las observaciones de riesgo se marcan en rojo para resaltar visualmente.

#### 📣 D. Enviar Alerta a la PDA del Operario
Si detectas un error grave o quieres enviarle un aviso en tiempo real al operario mientras está en planta preparando pedidos:
1. Haz clic en el botón **`⚡ Alerta PDA`**.
2. Escribe un mensaje corto (ej: *"Verifica cantidades antes de etiquetar, error detectado"*).
3. Pulsa **Enviar**. El mensaje saltará de forma sonora e inmediata en la pantalla de la PDA del operario.

---

## 🗓️ 4. Planificación e Incorporaciones
En esta sección puedes consultar y gestionar la distribución de los cursos de formación en planta:
* Permite programar nuevas sesiones definiendo la temática (Sacado H, Sacado V, Teórica, etc.).
* Asigna formadores, fechas, horas y las salas en las que se impartirán.
* Los formadores asignados verán estas tareas en su agenda diaria automáticamente.

---

## 📚 5. Documentación
Es el centro de conocimiento del departamento de formación. Aquí se unifican enlaces directos a:
* Procedimientos Estándar de Trabajo (SOP) almacenados en Google Drive.
* Guías de formación en Odoo.
* Presentaciones y material audiovisual de apoyo interactivo.

---

## 🎓 6. Formadores
Muestra la lista de los formadores activos en planta, indicando su carga de trabajo (número de alumnos asignados simultáneamente) y permitiéndote evaluar qué tutor está a cargo de cada aprendiz en formación.

---

## ⚙️ 7. Administración y Gestión de Usuarios
Como Administrador, tienes acceso exclusivo a la pestaña **`⚙ Administración`** para gestionar las cuentas del sistema:
* **Crear Usuario**: Permite registrar nuevos formadores en el ERP indicando su ID, Nombre Completo, Nombre de Usuario y Contraseña.
* **Activar/Desactivar**: Puedes apagar temporalmente un usuario (cambiando su estado a "No") para impedirle el acceso al sistema sin necesidad de borrar su historial de trabajo.
* **Cambiar Roles**: Permite asignar si una cuenta es de tipo **`Administrador`** (acceso completo) o **`Formador`** (acceso estándar).

---

## 📊 8. ¿Cómo se sincronizan los datos con Google Sheets?
El sistema utiliza una hoja de cálculo centralizada de **Google Sheets** como base de datos.
* Cada vez que marcas un ítem del checklist, agregas una observación o registras un nuevo usuario, el ERP realiza una llamada en segundo plano y escribe ese dato directamente en el documento de Google.
* Si el sistema detecta que la red falla o que la API de Google tiene latencia, el ERP retendrá los datos de manera interna de forma segura y volverá a intentar la escritura automáticamente para evitar pérdidas de información.
