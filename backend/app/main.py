from fastapi import FastAPI

from app import errors, logs
from app.routers import health, items, trips

app = FastAPI(title="PACK QUEST API")
errors.register(app)
logs.register(app)

app.include_router(health.router)
app.include_router(trips.router)
app.include_router(items.router)
