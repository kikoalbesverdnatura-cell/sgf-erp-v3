import os
import time
import gspread
from google.oauth2.service_account import Credentials
from gspread.exceptions import APIError

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Construir ruta absoluta para google.json
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
credentials_path = os.path.join(base_dir, "credentials", "google.json")

credentials = Credentials.from_service_account_file(
    credentials_path,
    scopes=SCOPES,
)

# Decorador para reintentar operaciones de gspread en caso de error 429 (Cuota excedida)
def retry_on_429(func):
    def wrapper(*args, **kwargs):
        retries = 5
        delay = 1.5
        for i in range(retries):
            try:
                return func(*args, **kwargs)
            except APIError as e:
                try:
                    import json
                    err_json = json.loads(e.response.text)
                    status_code = err_json.get("error", {}).get("code", 0)
                except Exception:
                    status_code = getattr(e, "code", 0) or (e.response.status_code if hasattr(e, "response") else 0)
                
                if status_code == 429 or "quota" in str(e).lower():
                    print(f"[gspread] Cuota de API excedida (429). Reintentando en {delay}s (intento {i+1}/{retries})...")
                    time.sleep(delay)
                    delay *= 2
                else:
                    raise
        return func(*args, **kwargs)
    return wrapper

# Aplicar el decorador a los métodos de gspread antes de autorizar
gspread.Client.open = retry_on_429(gspread.Client.open)
gspread.Client.open_by_key = retry_on_429(gspread.Client.open_by_key)
gspread.Spreadsheet.add_worksheet = retry_on_429(gspread.Spreadsheet.add_worksheet)
gspread.Worksheet.get_all_values = retry_on_429(gspread.Worksheet.get_all_values)
gspread.Worksheet.get_all_records = retry_on_429(gspread.Worksheet.get_all_records)
gspread.Worksheet.row_values = retry_on_429(gspread.Worksheet.row_values)
gspread.Worksheet.col_values = retry_on_429(gspread.Worksheet.col_values)
gspread.Worksheet.update_cell = retry_on_429(gspread.Worksheet.update_cell)
gspread.Worksheet.update_cells = retry_on_429(gspread.Worksheet.update_cells)
gspread.Worksheet.append_row = retry_on_429(gspread.Worksheet.append_row)
gspread.Worksheet.delete_rows = retry_on_429(gspread.Worksheet.delete_rows)

client = gspread.authorize(credentials)


# Caché global para spreadsheets y worksheets
_spreadsheet_cache = {}
_worksheet_cache = {}

def abrir_documento(nombre):
    if nombre in _spreadsheet_cache:
        return _spreadsheet_cache[nombre]
    doc = client.open(nombre)
    _spreadsheet_cache[nombre] = doc
    return doc


def abrir_documento_por_key(key):
    if key in _spreadsheet_cache:
        return _spreadsheet_cache[key]
    doc = client.open_by_key(key)
    _spreadsheet_cache[key] = doc
    return doc


def listar_documentos():
    archivos = client.list_spreadsheet_files()
    return [archivo["name"] for archivo in archivos]

# Monkey-patch gspread.Spreadsheet.worksheet para cachear los objetos Worksheet
_original_worksheet = retry_on_429(gspread.Spreadsheet.worksheet)

def _cached_worksheet(self, title):
    cache_key = (self.id, title)
    if cache_key in _worksheet_cache:
        return _worksheet_cache[cache_key]
    sheet = _original_worksheet(self, title)
    _worksheet_cache[cache_key] = sheet
    return sheet

gspread.Spreadsheet.worksheet = _cached_worksheet