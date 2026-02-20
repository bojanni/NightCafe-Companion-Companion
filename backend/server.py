from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# ─── Models ──────────────────────────────────────────────────────────────────

class StatusCheckCreate(BaseModel):
    client_name: str

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CreationImport(BaseModel):
    source: Optional[str] = "NightCafe Studio"
    url: str
    creationId: Optional[str] = None
    title: Optional[str] = None
    prompt: Optional[str] = None
    imageUrl: Optional[str] = None
    model: Optional[str] = None
    style: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    extractedAt: Optional[str] = None

class StoredImport(CreationImport):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    importedAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ─── Existing status routes ───────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "NightCafe Studio Data Bridge"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks

# ─── Import routes ────────────────────────────────────────────────────────────

@api_router.get("/import/health")
async def import_health():
    """Health check endpoint for the extension connection test."""
    return {"status": "ok", "service": "NightCafe Studio Data Bridge", "timestamp": datetime.now(timezone.utc).isoformat()}

@api_router.post("/import", status_code=201)
async def import_creation(creation: CreationImport):
    """Receive a NightCafe creation import from the browser extension."""
    stored = StoredImport(**creation.model_dump())
    doc = stored.model_dump()

    # Check for duplicate by creationId
    if stored.creationId:
        existing = await db.imports.find_one({"creationId": stored.creationId}, {"_id": 0})
        if existing:
            logger.info(f"Duplicate import skipped: {stored.creationId}")
            return {"success": True, "id": existing.get("id"), "duplicate": True, "message": "Al eerder geimporteerd"}

    await db.imports.insert_one(doc)
    logger.info(f"New import: {stored.id} – {stored.title or stored.url}")
    return {"success": True, "id": stored.id, "duplicate": False, "message": "Creatie succesvol geimporteerd"}

@api_router.get("/imports")
async def get_imports():
    """List all imported creations."""
    imports = await db.imports.find({}, {"_id": 0}).sort("importedAt", -1).to_list(500)
    return imports

@api_router.get("/imports/{import_id}")
async def get_import(import_id: str):
    """Get a single import by ID."""
    item = await db.imports.find_one({"id": import_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Import niet gevonden")
    return item

@api_router.delete("/imports/{import_id}")
async def delete_import(import_id: str):
    """Delete an import by ID."""
    result = await db.imports.delete_one({"id": import_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Import niet gevonden")
    return {"success": True}

@api_router.get("/imports/stats/summary")
async def get_stats():
    """Get import statistics."""
    total = await db.imports.count_documents({})
    with_image = await db.imports.count_documents({"imageUrl": {"$ne": None}})
    with_prompt = await db.imports.count_documents({"prompt": {"$ne": None}})
    return {"total": total, "withImage": with_image, "withPrompt": with_prompt}

# ─── App setup ───────────────────────────────────────────────────────────────

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
