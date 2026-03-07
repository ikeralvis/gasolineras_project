"""
EV Charging microservice — FastAPI application entry point.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.charging import router as charging_router
from app.db.connection import close_db_connection, test_db_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🔋 Starting EV Charging microservice...")
    try:
        test_db_connection()
        logger.info("✅ PostgreSQL connected (ev-charging)")
    except Exception as exc:
        logger.warning(
            "⚠️  DB unavailable at startup — charging_points cache disabled: %s", exc
        )
    yield
    logger.info("🛑 Shutting down EV Charging microservice...")
    close_db_connection()


app = FastAPI(
    title="EV Charging Points Service",
    description=(
        "Microservice for real-time EV charging station data.\n\n"
        "Proxies the mapareve.es public API and caches location details."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS is enforced at the Gateway level; here we allow everything so the
# service works both behind the gateway and in standalone development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(charging_router, prefix="/api")


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "service": "ev-charging"}
