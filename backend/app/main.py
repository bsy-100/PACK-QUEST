from fastapi import FastAPI

from app import errors
from app.routers import health

app = FastAPI(title="PACK QUEST API")
errors.register(app)

app.include_router(health.router)
