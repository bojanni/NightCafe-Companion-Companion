from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.staticfiles import StaticFiles
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
import httpx


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# ═══════════════════════════════════════════════════════════════════════════════
# INPUT MODEL  (wat de extensie stuurt – camelCase)
# ═══════════════════════════════════════════════════════════════════════════════

class CreationImport(BaseModel):
    source: Optional[str] = "NightCafe Studio"
    url: str
    creationId: Optional[str] = None
    title: Optional[str] = None
    creationType: Optional[str] = None        # 'image' | 'video'
    prompt: Optional[str] = None
    videoPrompt: Optional[str] = None
    revisedPrompt: Optional[str] = None
    imageUrl: Optional[str] = None
    allImages: Optional[List[str]] = None
    startImageUrl: Optional[str] = None
    model: Optional[str] = None
    style: Optional[str] = None
    initialResolution: Optional[str] = None
    aspectRatio: Optional[str] = None
    seed: Optional[str] = None
    isPublished: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None
    extractedAt: Optional[str] = None

# ═══════════════════════════════════════════════════════════════════════════════
# DB MODELS  (matcht db-init.js schema exact)
# ═══════════════════════════════════════════════════════════════════════════════

class Prompt(BaseModel):
    """Prompts tabel – matcht db-init.js schema."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    notes: Optional[str] = None
    rating: float = 0
    is_favorite: bool = False
    is_template: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    model: Optional[str] = None
    category: Optional[str] = None
    revised_prompt: Optional[str] = None
    seed: Optional[int] = None
    aspect_ratio: Optional[str] = None
    use_custom_aspect_ratio: bool = False
    gallery_item_id: Optional[str] = None
    use_count: int = 0
    last_used_at: Optional[str] = None
    suggested_model: Optional[str] = None

class GalleryItem(BaseModel):
    """gallery_items tabel – matcht db-init.js schema."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    title: Optional[str] = None
    image_url: Optional[str] = None
    prompt_used: Optional[str] = None
    model_used: Optional[str] = None
    notes: Optional[str] = None
    is_favorite: bool = False
    aspect_ratio: Optional[str] = None
    use_custom_aspect_ratio: bool = False
    start_image: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    prompt_id: Optional[str] = None
    rating: float = 0
    model: Optional[str] = None
    local_path: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    width: Optional[int] = None
    height: Optional[int] = None
    character_id: Optional[str] = None
    collection_id: Optional[str] = None
    media_type: str = "image"
    video_url: Optional[str] = None
    video_local_path: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration_seconds: Optional[int] = None
    storage_mode: str = "url"

# ─── Field mapping helper ──────────────────────────────────────────────────────

def _parse_seed(val: Optional[str]) -> Optional[int]:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def map_to_db(creation: CreationImport, gallery_id: str) -> tuple[dict, dict]:
    """
    Vertaalt camelCase extensie-data naar db-init.js schema documenten.
    NightCafe-specifieke data wordt opgeslagen in metadata (gallery_items) of
    als extra velden (prompts) zodat niets verloren gaat.
    """
    ext_meta = creation.metadata or {}
    prompt_text = creation.prompt or creation.videoPrompt

    prompt = Prompt(
        title=creation.title,
        content=prompt_text,
        revised_prompt=creation.revisedPrompt,
        model=creation.model,
        seed=_parse_seed(creation.seed),
        aspect_ratio=creation.aspectRatio,
        gallery_item_id=gallery_id,
    )

    # NightCafe-specifieke metadata voor gallery_items
    nc_metadata = {
        "source": creation.source or "NightCafe Studio",
        "source_url": creation.url,
        "nightcafe_creation_id": creation.creationId,
        "all_images": creation.allImages,
        "is_published": creation.isPublished,
        "video_prompt": creation.videoPrompt,
        "revised_prompt": creation.revisedPrompt,
        "initial_resolution": creation.initialResolution,
        "sampling_method": ext_meta.get("samplingMethod"),
        "runtime": ext_meta.get("runtime"),
        "extracted_at": creation.extractedAt,
    }
    # Voeg overige extensie-metadata toe
    for k, v in ext_meta.items():
        if k not in ("samplingMethod", "runtime") and k not in nc_metadata:
            nc_metadata[k] = v
    # Verwijder None waarden
    nc_metadata = {k: v for k, v in nc_metadata.items() if v is not None}

    gallery_item = GalleryItem(
        id=gallery_id,
        title=creation.title,
        image_url=creation.imageUrl,
        prompt_used=prompt_text,
        model_used=creation.model,
        model=creation.model,
        aspect_ratio=creation.aspectRatio,
        start_image=creation.startImageUrl,
        prompt_id=prompt.id,
        metadata=nc_metadata,
        media_type=creation.creationType or "image",
    )

    return prompt.model_dump(), gallery_item.model_dump()


# ═══════════════════════════════════════════════════════════════════════════════
# STATUS ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

class StatusCheckCreate(BaseModel):
    client_name: str

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

@api_router.get("/")
async def root():
    return {"message": "NightCafe Studio Data Bridge"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    obj = StatusCheck(**input.model_dump())
    doc = obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for c in checks:
        if isinstance(c['timestamp'], str):
            c['timestamp'] = datetime.fromisoformat(c['timestamp'])
    return checks

# ═══════════════════════════════════════════════════════════════════════════════
# IMPORT ROUTES  (health + status VOOR parameterized routes)
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/import/health")
async def import_health():
    return {
        "status": "ok",
        "service": "NightCafe Studio Data Bridge",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@api_router.get("/import/status")
async def check_import_status(creationId: str):
    """Controleer of een creatie al geïmporteerd is (gebruikt door de browser extensie)."""
    item = await db.gallery_items.find_one(
        {"metadata.nightcafe_creation_id": creationId},
        {"_id": 0, "id": 1, "title": 1, "created_at": 1, "media_type": 1}
    )
    if item:
        return {
            "exists": True,
            "id": item.get("id"),
            "title": item.get("title"),
            "importedAt": item.get("created_at"),
            "creationType": item.get("media_type"),
        }
    return {"exists": False}

@api_router.post("/import", status_code=201)
async def import_creation(creation: CreationImport):
    """
    Ontvang een NightCafe creatie en sla op in:
      - prompts        → prompt-tekst + AI-instellingen
      - gallery_items  → afbeelding + koppeling prompt_id (matcht app-schema)
    """
    # ── Duplicate check op nightcafe_creation_id (nu in metadata) ──
    if creation.creationId:
        existing = await db.gallery_items.find_one(
            {"metadata.nightcafe_creation_id": creation.creationId},
            {"_id": 0, "id": 1, "title": 1, "created_at": 1}
        )
        if existing:
            logger.info(f"Duplicate: {creation.creationId}")
            return {
                "success": True,
                "id": existing["id"],
                "prompt_id": None,
                "duplicate": True,
                "message": "Al eerder geïmporteerd"
            }

    gallery_id = str(uuid.uuid4())
    prompt_doc, gallery_doc = map_to_db(creation, gallery_id)

    # Schrijf naar prompts tabel
    await db.prompts.insert_one(prompt_doc)
    logger.info(f"Prompt aangemaakt: {prompt_doc['id']} – {(prompt_doc.get('text') or '')[:60]}")

    # Schrijf naar gallery_items tabel
    await db.gallery_items.insert_one(gallery_doc)
    logger.info(f"Gallery item aangemaakt: {gallery_doc['id']} – {gallery_doc.get('title')}")

    return {
        "success": True,
        "id": gallery_doc["id"],
        "prompt_id": prompt_doc["id"],
        "duplicate": False,
        "message": "Creatie succesvol geïmporteerd",
        "mapping": {
            "prompts": prompt_doc["id"],
            "gallery_items": gallery_doc["id"]
        }
    }

# ═══════════════════════════════════════════════════════════════════════════════
# GALLERY ITEMS ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/gallery-items/stats/summary")
async def get_gallery_stats():
    total = await db.gallery_items.count_documents({})
    with_image = await db.gallery_items.count_documents({"image_url": {"$ne": None}})
    with_prompt = await db.gallery_items.count_documents({"prompt_used": {"$ne": None}})
    with_multi = await db.gallery_items.count_documents({"metadata.all_images.1": {"$exists": True}})
    published = await db.gallery_items.count_documents({"metadata.is_published": True})
    total_prompts = await db.prompts.count_documents({})
    return {
        "total": total,
        "withImage": with_image,
        "withPrompt": with_prompt,
        "withMultipleImages": with_multi,
        "published": published,
        "totalPrompts": total_prompts,
    }

@api_router.get("/gallery-items")
async def list_gallery_items():
    items = await db.gallery_items.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.get("/gallery-items/{item_id}")
async def get_gallery_item(item_id: str):
    item = await db.gallery_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item niet gevonden")
    # Voeg bijbehorende prompt toe
    if item.get("prompt_id"):
        prompt = await db.prompts.find_one({"id": item["prompt_id"]}, {"_id": 0})
        if prompt:
            item["_prompt"] = prompt
    return item

@api_router.delete("/gallery-items/{item_id}")
async def delete_gallery_item(item_id: str):
    item = await db.gallery_items.find_one({"id": item_id}, {"_id": 0, "prompt_id": 1})
    if not item:
        raise HTTPException(404, "Item niet gevonden")
    # Verwijder gallery item en bijbehorende prompt
    await db.gallery_items.delete_one({"id": item_id})
    if item.get("prompt_id"):
        await db.prompts.delete_one({"id": item["prompt_id"]})
    return {"success": True}

# ─── Backward compat: /api/imports → gallery_items ───────────────────────────

@api_router.get("/imports/stats/summary")
async def get_stats_compat():
    return await get_gallery_stats()

@api_router.get("/imports")
async def list_imports_compat():
    return await list_gallery_items()

@api_router.get("/imports/{item_id}")
async def get_import_compat(item_id: str):
    return await get_gallery_item(item_id)

@api_router.delete("/imports/{item_id}")
async def delete_import_compat(item_id: str):
    return await delete_gallery_item(item_id)

# ═══════════════════════════════════════════════════════════════════════════════
# PROMPTS ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get("/prompts")
async def list_prompts():
    prompts = await db.prompts.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return prompts

# ─── App ─────────────────────────────────────────────────────────────────────

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
