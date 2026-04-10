"""Cliente de fuente externa Ministerio de Energia."""
from app.services.fetch_gobierno import fetch_data_gobierno, parse_float


class GobiernoClient:
    def fetch_gasolineras(self) -> list[dict]:
        return fetch_data_gobierno()


__all__ = ["GobiernoClient", "parse_float"]
