from fastapi import FastAPI

from app import errors
from app.routers import health, items, trips

app = FastAPI(title="PACK QUEST API")
errors.register(app)

app.include_router(health.router)
app.include_router(trips.router)
app.include_router(items.router)
