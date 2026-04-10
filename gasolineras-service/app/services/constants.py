"""Constantes de dominio para gasolineras."""
from datetime import timezone
from zoneinfo import ZoneInfo

KEY_DIRECCION = "Dirección"
KEY_ROTULO = "Rótulo"
KEY_P95 = "Precio Gasolina 95 E5"
KEY_P98 = "Precio Gasolina 98 E5"
KEY_GASOLEO_A = "Precio Gasoleo A"
KEY_GASOLEO_B = "Precio Gasoleo B"
KEY_GASOLEO_PREMIUM = "Precio Gasóleo Premium"

try:
    SPAIN_TZ = ZoneInfo("Europe/Madrid")
except Exception:  # pragma: no cover
    SPAIN_TZ = timezone.utc
