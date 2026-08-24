import os
import gspread
from google.oauth2.service_account import Credentials

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
_original_worksheet = gspread.Spreadsheet.worksheet

def _cached_worksheet(self, title):
    cache_key = (self.id, title)
    if cache_key in _worksheet_cache:
        return _worksheet_cache[cache_key]
    sheet = _original_worksheet(self, title)
    _worksheet_cache[cache_key] = sheet
    return sheet

gspread.Spreadsheet.worksheet = _cached_worksheet