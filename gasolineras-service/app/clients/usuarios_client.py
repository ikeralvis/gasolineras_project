"""Cliente HTTP para dependencias internas del dominio usuarios."""
import logging
from typing import Optional

import httpx


logger = logging.getLogger(__name__)


class UsuariosClient:
    def __init__(self, base_url: str, timeout_seconds: int = 10) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def fetch_favoritas_ids(
        self,
        internal_secret: Optional[str],
        use_internal_secret: bool,
    ) -> set[str]:
        headers = {"X-Internal-Secret": internal_secret} if (use_internal_secret and internal_secret) else {}
        try:
            response = httpx.get(
                f"{self.base_url}/api/usuarios/favoritos/all-ideess",
                headers=headers,
                timeout=self.timeout_seconds,
            )
        except Exception as exc:
            logger.warning("⚠️ Error obteniendo favoritos (continuando sin histórico): %s", exc)
            return set()

        if response.status_code != 200:
            logger.warning("⚠️ No se pudieron obtener favoritos: %s", response.status_code)
            return set()

        body = response.json() if response.content else {}
        return set(body.get("ideess", []))
