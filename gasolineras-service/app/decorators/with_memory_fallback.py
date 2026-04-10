"""Decoradores reutilizables para comportamiento de fallback."""
from functools import wraps
from fastapi import HTTPException


def with_memory_fallback(reason: str):
    """
    Reintenta una operacion habilitando modo memoria cuando falla la capa DB.

    La clase que usa el decorador debe implementar:
    - enable_memory_fallback(reason: str, exc: Exception) -> bool
    """

    def decorator(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            try:
                return func(self, *args, **kwargs)
            except HTTPException:
                raise
            except Exception as exc:
                should_retry = False
                if hasattr(self, "enable_memory_fallback"):
                    should_retry = bool(self.enable_memory_fallback(reason, exc))
                if should_retry:
                    return func(self, *args, **kwargs)
                raise

        return wrapper

    return decorator
