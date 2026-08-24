import requests
import json
import sys
import os

# Añadir el directorio raíz del proyecto al path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

# Reconfigurar stdout para soportar caracteres unicode en Windows
sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(dotenv_path=os.path.join(base_dir, ".env"))

token_multi = os.getenv("SALIX_TOKEN") or "CyvFtxKTERRA7qDOKc3AcBFAbiW7g6eYD1sE8VdNVBXwtO4xNHATd2vTzFfMuzTD"

def ejecutar_sincronizacion():
    print("--- INICIANDO SINCRONIZACIÓN DE DEPARTAMENTOS CON SALIX ---")
    
    # 1. Obtener todos los trabajadores desde Grafana MySQL (Salix Mirror)
    print("1. Cargando trabajadores y sus departamentos desde Grafana MySQL...")
    salix_by_id = {}
    try:
        from app.services.grafana.client import GrafanaClient
        from app.services.grafana.config import GRAFANA_URL
        
        client = GrafanaClient(base_url=GRAFANA_URL)
        sql = """
            SELECT 
                w.id AS id_trabajador,
                d.name AS departamento_salix
            FROM worker w
            LEFT JOIN business b ON b.workerFk = w.id 
                AND b.started <= NOW() 
                AND (b.ended IS NULL OR b.ended >= NOW())
            LEFT JOIN department d ON d.id = b.departmentFk
        """
        payload = [{
            "refId": "A",
            "datasource": {"uid": "000000003"},
            "rawSql": sql,
            "format": "table"
        }]
        res = client.query_datasource(payload)
        frames = res.get("results", {}).get("A", {}).get("frames", [])
        
        if frames:
            data = frames[0].get("data", {})
            values = data.get("values", [])
            if values and len(values) >= 2:
                ids = values[0]
                depts = values[1]
                for i in range(len(ids)):
                    w_id = str(ids[i]).strip()
                    dept = str(depts[i]).strip() if depts[i] else ""
                    salix_by_id[w_id] = {"id": w_id, "department": dept}
                    
        print(f"Se obtuvieron {len(salix_by_id)} trabajadores activos desde la base de datos de Salix.")
    except Exception as e:
        print(f"Error consultando departamentos en Grafana: {e}")
        return False
    
    # 2. Obtener todas las personas de Google Sheets
    print("2. Cargando trabajadores activos de Google Sheets...")
    from app.services.persona_service import obtener_personas, guardar_overrides_batch
    try:
        personas = obtener_personas(excluir_equipo=False)
        print(f"Se cargaron {len(personas)} personas desde las hojas de cálculo.")
    except Exception as e:
        print(f"Error cargando personas: {e}")
        return False
        
    # 3. Analizar diferencias y preparar lote de actualizaciones
    updates = []
    inactive_updates = []  # IDs de trabajadores a dar de baja (salida)
    reactivate_updates = []  # IDs de trabajadores a reactivar en el ERP
    skipped_same = 0
    not_found = 0
    empty_salix_dept = 0
    already_inactive = 0
    
    print("3. Analizando discrepancias de departamento y estado...")
    for p in personas:
        p_id = str(p.get("id")).strip()
        p_name = p.get("nombre") or ""
        p_dept_actual = p.get("departamento") or ""
        p_finalizado = str(p.get("finalizado") or "").strip().upper()
        
        if not p_id:
            continue
            
        is_active = p_finalizado not in ("SÍ", "SI")
        salix_worker = salix_by_id.get(p_id)
        
        if salix_worker:
            salix_dept = (salix_worker.get("department") or "").strip()
            if not salix_dept:
                # Si no tiene departamento en Salix, ya no trabaja (salida)
                if is_active:
                    print(f"  Trabajador {p_name} (ID: {p_id}) no tiene departamento en Salix. Se marcará como Salida (Finalizado).")
                    inactive_updates.append(p_id)
                else:
                    already_inactive += 1
                empty_salix_dept += 1
                continue
                
            # Si estaba marcado como inactivo (salida) en el ERP pero tiene departamento en Salix, lo reactivamos
            if not is_active:
                print(f"  Trabajador {p_name} (ID: {p_id}) existe en Salix con departamento '{salix_dept}' pero figura como salida en el ERP. Se reactivará.")
                reactivate_updates.append(p_id)
                is_active = True
                p_finalizado = ""
                
            # Si tiene departamento en Salix, comparamos
            dept_actual_norm = p_dept_actual.strip().upper()
            salix_dept_norm = salix_dept.strip().upper()
            
            if dept_actual_norm != salix_dept_norm:
                print(f"  Diferencia detectada en {p_name} (ID: {p_id}):")
                print(f"    Actual ERP: '{p_dept_actual}' | Salix: '{salix_dept}'")
                updates.append((p_id, "departamento", salix_dept))
            else:
                skipped_same += 1
        else:
            # Si está activo en el ERP pero no se encuentra en Salix
            if is_active:
                print(f"  Trabajador {p_name} (ID: {p_id}) no se encuentra en Salix. Se marcará como Salida (Finalizado).")
                inactive_updates.append(p_id)
            else:
                already_inactive += 1
            not_found += 1
            
    print(f"\nResumen de análisis:")
    print(f"  - Trabajadores con departamento idéntico: {skipped_same}")
    print(f"  - Trabajadores no encontrados en Salix (inactivos): {not_found}")
    print(f"  - Trabajadores con dpto vacío en Salix: {empty_salix_dept}")
    print(f"  - Trabajadores ya inactivos anteriormente: {already_inactive}")
    print(f"  - Trabajadores para reactivar: {len(reactivate_updates)}")
    print(f"  - Trabajadores para dar de baja: {len(inactive_updates)}")
    print(f"  - Trabajadores con departamento para actualizar: {len(updates)}")
    
    # 4. Guardar los cambios
    success = True
    
    # 4a. Guardar overrides de departamento en lote
    if updates:
        print(f"\n4a. Guardando {len(updates)} actualizaciones de departamento en EDICIONES_OVERRIDE...")
        ok = guardar_overrides_batch(updates)
        if not ok:
            print("Error al guardar las modificaciones de departamento.")
            success = False
            
    # 4b. Actualizar estados de trabajadores inactivos y reactivados en MAESTRO_PERSONAS en lote
    if inactive_updates or reactivate_updates:
        print(f"\n4b. Actualizando estados de trabajadores (bajas/reactivaciones) en MAESTRO_PERSONAS...")
        try:
            import gspread
            from gspread.cell import Cell
            from app.services.google_service import abrir_documento
            from app.services.persona_service import DOCUMENTO
            
            documento = abrir_documento(DOCUMENTO)
            hoja_maestro = documento.worksheet("MAESTRO_PERSONAS")
            
            # Obtener datos de la hoja
            registros_maestro = hoja_maestro.get_all_records()
            encabezados = hoja_maestro.row_values(1)
            
            try:
                col_finalizado_idx = encabezados.index("FINALIZADO") + 1
                col_activo_idx = encabezados.index("ACTIVO") + 1
                col_fecha_baja_idx = encabezados.index("FECHA_BAJA") + 1
                col_motivo_baja_idx = encabezados.index("MOTIVO_BAJA") + 1
            except ValueError:
                print("Error: Columnas de estado no encontradas en MAESTRO_PERSONAS.")
                return False
                
            # Mapear ID a índice de fila
            id_to_row = {}
            for idx, r in enumerate(registros_maestro):
                w_id = str(r.get("ID_Trabajador", "")).strip()
                if w_id:
                    id_to_row[w_id] = idx + 2
                    
            cells_to_update = []
            
            # Procesar bajas
            for p_id in inactive_updates:
                row_idx = id_to_row.get(p_id)
                if row_idx:
                    cells_to_update.append(Cell(row=row_idx, col=col_finalizado_idx, value="SÍ"))
                    cells_to_update.append(Cell(row=row_idx, col=col_activo_idx, value="NO"))
                    print(f"  - Preparado cambio a FINALIZADO = 'SÍ' y ACTIVO = 'NO' para ID {p_id} en fila {row_idx}")
            
            # Procesar reactivaciones
            for p_id in reactivate_updates:
                row_idx = id_to_row.get(p_id)
                if row_idx:
                    cells_to_update.append(Cell(row=row_idx, col=col_finalizado_idx, value=""))
                    cells_to_update.append(Cell(row=row_idx, col=col_activo_idx, value="SÍ"))
                    cells_to_update.append(Cell(row=row_idx, col=col_fecha_baja_idx, value=""))
                    cells_to_update.append(Cell(row=row_idx, col=col_motivo_baja_idx, value=""))
                    print(f"  - Preparado cambio para REACTIVAR ID {p_id} en fila {row_idx}")
                    
            if cells_to_update:
                hoja_maestro.update_cells(cells_to_update)
                print("¡Estados de Google Sheets actualizados con éxito en lote!")
            else:
                print("No se encontraron filas coincidentes en el maestro para actualizar.")
        except Exception as e:
            print(f"Error actualizando estados en lote: {e}")
            success = False
            
    if not updates and not inactive_updates and not reactivate_updates:
        print("\nNo se detectó ninguna discrepancia de departamento ni de estado. Todo está al día.")
        
    return success

if __name__ == "__main__":
    ejecutar_sincronizacion()
