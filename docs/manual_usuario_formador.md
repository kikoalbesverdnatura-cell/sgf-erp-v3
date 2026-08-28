# SGF ERP V3 - Manual de Utilización para Formadores y Supervisores 🎓

¡Bienvenido al Manual de Usuario de **SGF ERP V3** para Formadores y Supervisores de Planta. Este documento te guiará de manera sencilla en el uso diario de la aplicación para hacer el seguimiento y registrar el progreso de tus alumnos en formación.

---

## 📌 1. Acceso y Filosofía de Interfaz Simplificada
Para iniciar sesión en el sistema:
1. Abre el navegador web en tu dispositivo o tablet de planta.
2. Introduce tu nombre de usuario (ej: `norman`, `daniel`, `dodo`) y tu contraseña.

Al entrar con tu cuenta de formador, el sistema **simplificará automáticamente la interfaz**:
* No verás pantallas complejas de administración ni configuraciones de base de datos.
* El ERP te redirigirá directamente a la sección de **`👥 Empleados`** (`/personas`), que será tu pantalla principal de trabajo.
* En el menú lateral izquierdo solo dispondrás del acceso a la lista de operarios y el botón de cerrar sesión para agilizar tu trabajo diario en planta.

---

## 👥 2. Listado de Empleados (`/personas`)
En esta pantalla verás el listado de operarios en período de formación. Puedes buscar operarios por su nombre o ID escribiendo en la caja de búsqueda superior.

### 2.1 Restricciones de Acceso según tu Usuario
Para facilitar tu labor y proteger la privacidad de la planta, el sistema filtra de forma automática los empleados que puedes ver y evaluar según tu cuenta de acceso:
* **Norman**: Solo verás y podrás abrir fichas de operarios pertenecientes a los departamentos de **`SACADO H`** y **`SACADO H-`**.
* **Dodo**: Solo verás y podrás abrir fichas de operarios pertenecientes al departamento de **`TALLER NATURAL`**.
* **Daniel y Formadores Estándar**: Verán la lista de todos los operarios en formación de la planta de manera global.

> [!IMPORTANT]
> Si intentas acceder de forma manual (escribiendo la dirección) al expediente de un operario de otro departamento al cual no tienes permiso de acceso, el ERP denegará la visualización y te devolverá automáticamente a tu listado permitido.

### 2.2 Filtro "Activos" e "Historial"
* **Activos**: Muestra los operarios que se encuentran actualmente en formación (primeros 31 días de seguimiento).
* **Historial**: Permite consultar registros pasados de operarios que ya terminaron su período de prueba, fueron aptos o causaron baja.

---

## 📄 3. Cómo Evaluar a un Alumno (Expediente)
Al hacer clic sobre el nombre de un operario de tu listado, accederás a su **Expediente de Formación**. Desde aquí registrarás toda su evolución a través de tres herramientas clave:

### 3.1 Consulta de Rendimiento y Horas en Planta
En la parte superior de la ficha verás los datos acumulados de su trabajo, recopilados directamente desde la base de datos de planta:
* **Horas de formación** divididas por áreas (Aula, Cámara H, Cámara V, etc.).
* **Rendimiento medio** expresado en porcentaje y el histórico de líneas/hora del alumno.

### 3.2 Checklist de Fases de Aprendizaje (Fase 1, Fase 2, Fase 3...)
El Checklist representa la hoja de ruta formativa del alumno (explicación teórica, prácticas en planta, medidas de seguridad y firmas de tutor).
* **Cómo marcarlo**: Cuando tu alumno domine una destreza o supere un examen, haz clic en la casilla de verificación correspondiente (`☑`).
* **Sincronización**: Al pulsar sobre cualquier casilla, el sistema se sincroniza de forma inmediata con Google Sheets y recalcula la barra de porcentaje completado de la fase en tiempo real.

### 3.3 Registro de Observaciones (Diario de Formación)
Es fundamental dejar notas escritas sobre el comportamiento y técnica del alumno para que los administradores y otros tutores conozcan su evolución:
1. Localiza el formulario de **Observaciones** en el expediente.
2. Escribe tu comentario detallando lo ocurrido (ej: *"Realiza la preparación con buena postura pero le falta velocidad en el etiquetado"*).
3. Selecciona una **Categoría**:
   * `General`: Anotaciones rutinarias.
   * `Progreso`: El alumno muestra mejoras notables.
   * `Riesgo / Alerta`: Úsalo para registrar errores graves, posturas incorrectas o incidencias de seguridad. El sistema lo resaltará en color rojo en la ficha del operario.
   * `Felicitación`: Destacar hitos excepcionales del operario.
4. Haz clic en **Guardar Observación**. Tu nombre de usuario quedará registrado automáticamente como el autor de dicha nota.

### ⚡ 3.4 Enviar Alertas PDA en Planta
Si observas en tiempo real que tu alumno está cometiendo un error grave en la preparación de pedidos y necesitas alertarlo sin desplazarte físicamente:
1. Haz clic en el botón verde **`⚡ Alerta PDA`** dentro de su expediente.
2. Introduce un mensaje corto y claro de instrucción (ej: *"Recuerda verificar el lote de la flor antes de encajar"*).
3. Haz clic en **Enviar**.
4. El mensaje saltará de forma sonora e instantánea en la pantalla del escáner PDA del operario en planta, obligándolo a leerlo antes de continuar con su tarea.

---

## 💾 4. Guardado Automático de Datos
Todo el trabajo que realizas dentro del ERP (marcar checklists, escribir observaciones, enviar alertas) se escribe automáticamente en la base de datos centralizada de Google Sheets. 
No necesitas pulsar ningún botón global de "Guardar cambios", el sistema lo gestiona en segundo plano para que puedas centrarte en la formación en planta.
