"""
Tests for NightCafe Studio Data Bridge - Schema Update Testing
Tests all new db-init.js schema fields for gallery_items and prompts collections.

Key changes tested:
- prompts: text→content, revised_text→revised_prompt, seed now integer
- gallery_items: start_image_url→start_image, creation_type→media_type, imported_at→created_at
- NightCafe-specific fields moved to metadata JSONB
"""
import pytest
import requests
import os
import uuid

def get_base_url():
    url = os.environ.get('REACT_APP_BACKEND_URL', '')
    if not url:
        env_path = '/app/frontend/.env'
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith('REACT_APP_BACKEND_URL='):
                        url = line.strip().split('=', 1)[1]
                        break
    return url.rstrip('/')

BASE_URL = get_base_url()


class TestImportEndpoint:
    """POST /api/import - creates prompt + gallery_item with correct db-init.js schema"""
    created_id = None
    prompt_id = None
    
    def test_create_import_with_full_schema(self):
        """Test import creates gallery_item with all required schema fields"""
        test_id = f"TEST_schema_{uuid.uuid4().hex[:8]}"
        payload = {
            "url": f"https://creator.nightcafe.studio/creation/{test_id}",
            "creationId": test_id,
            "title": "TEST_Full Schema Import",
            "creationType": "image",
            "prompt": "A majestic mountain landscape at dawn",
            "videoPrompt": None,
            "revisedPrompt": "Enhanced: A majestic snow-capped mountain at golden dawn",
            "imageUrl": "https://images.nightcafe.studio/test.jpg",
            "allImages": [
                "https://images.nightcafe.studio/test1.jpg",
                "https://images.nightcafe.studio/test2.jpg",
                "https://images.nightcafe.studio/test3.jpg"
            ],
            "startImageUrl": "https://images.nightcafe.studio/start.jpg",
            "model": "Flux",
            "style": "Cinematic",
            "initialResolution": "1536x1024",
            "aspectRatio": "3:2",
            "seed": "987654321",
            "isPublished": True,
            "metadata": {
                "samplingMethod": "DPM++ 2M Karras",
                "runtime": "25s",
                "tags": ["landscape", "mountain", "dawn"]
            },
            "extractedAt": "2026-02-20T12:00:00Z"
        }
        r = requests.post(f"{BASE_URL}/api/import", json=payload)
        assert r.status_code == 201, f"Expected 201, got {r.status_code}: {r.text}"
        
        data = r.json()
        assert data['success'] is True
        assert data['duplicate'] is False
        assert 'id' in data
        assert 'prompt_id' in data
        
        TestImportEndpoint.created_id = data['id']
        TestImportEndpoint.prompt_id = data['prompt_id']
    
    def test_verify_gallery_item_schema_fields(self):
        """Verify gallery_items has all required db-init.js schema fields"""
        assert TestImportEndpoint.created_id, "Need created_id from previous test"
        
        r = requests.get(f"{BASE_URL}/api/gallery-items/{TestImportEndpoint.created_id}")
        assert r.status_code == 200
        
        item = r.json()
        
        # Required gallery_items fields from db-init.js
        required_fields = [
            'id', 'user_id', 'title', 'image_url', 'prompt_used', 'model_used',
            'notes', 'is_favorite', 'aspect_ratio', 'use_custom_aspect_ratio',
            'start_image',  # NOT start_image_url
            'created_at',   # NOT imported_at
            'updated_at', 'prompt_id', 'rating', 'model', 'local_path',
            'metadata', 'width', 'height', 'character_id', 'collection_id',
            'media_type',   # NOT creation_type
            'video_url', 'video_local_path', 'thumbnail_url', 
            'duration_seconds', 'storage_mode'
        ]
        
        for field in required_fields:
            assert field in item, f"Missing field: {field}"
        
        # Verify values
        assert item['title'] == "TEST_Full Schema Import"
        assert item['media_type'] == "image"  # NOT creation_type
        assert item['start_image'] == "https://images.nightcafe.studio/start.jpg"  # NOT start_image_url
        assert item['aspect_ratio'] == "3:2"
        assert item['model'] == "Flux"
        assert item['prompt_id'] == TestImportEndpoint.prompt_id
        
        # Verify NightCafe-specific fields in metadata JSONB
        metadata = item['metadata']
        assert metadata['nightcafe_creation_id'] is not None
        assert metadata['source_url'].startswith("https://creator.nightcafe.studio")
        assert metadata['is_published'] is True
        assert metadata['all_images'] is not None
        assert len(metadata['all_images']) == 3
        assert metadata['initial_resolution'] == "1536x1024"
        assert metadata['sampling_method'] == "DPM++ 2M Karras"
        assert metadata['runtime'] == "25s"
        assert metadata['revised_prompt'] == "Enhanced: A majestic snow-capped mountain at golden dawn"
        
        # Verify _prompt embedded data
        assert '_prompt' in item
        prompt = item['_prompt']
        assert prompt['id'] == TestImportEndpoint.prompt_id
        assert prompt['content'] == "A majestic mountain landscape at dawn"  # NOT text
        assert prompt['revised_prompt'] == "Enhanced: A majestic snow-capped mountain at golden dawn"  # NOT revised_text
        assert prompt['seed'] == 987654321  # Integer, NOT string
        assert prompt['model'] == "Flux"
        assert prompt['aspect_ratio'] == "3:2"
    
    def test_verify_prompts_schema_fields(self):
        """Verify prompts collection has all required db-init.js schema fields"""
        r = requests.get(f"{BASE_URL}/api/prompts")
        assert r.status_code == 200
        
        prompts = r.json()
        test_prompt = next((p for p in prompts if p['id'] == TestImportEndpoint.prompt_id), None)
        assert test_prompt is not None, "Test prompt not found"
        
        # Required prompts fields from db-init.js
        required_fields = [
            'id', 'user_id', 'title', 'content',  # NOT text
            'notes', 'rating', 'is_favorite', 'is_template',
            'created_at', 'updated_at', 'model', 'category',
            'revised_prompt',  # NOT revised_text
            'seed',  # Integer type
            'aspect_ratio', 'use_custom_aspect_ratio', 'gallery_item_id',
            'use_count', 'last_used_at', 'suggested_model'
        ]
        
        for field in required_fields:
            assert field in test_prompt, f"Missing prompt field: {field}"
        
        # Verify seed is integer (not string)
        assert isinstance(test_prompt['seed'], int), f"seed should be int, got {type(test_prompt['seed'])}"
        assert test_prompt['seed'] == 987654321
    
    def test_cleanup_test_data(self):
        """Cleanup test data"""
        if TestImportEndpoint.created_id:
            r = requests.delete(f"{BASE_URL}/api/gallery-items/{TestImportEndpoint.created_id}")
            assert r.status_code == 200


class TestDuplicateDetection:
    """POST /api/import - duplicate detection via metadata.nightcafe_creation_id"""
    created_id = None
    
    def test_create_first_import(self):
        test_id = "TEST_dup_check_001"
        payload = {
            "url": f"https://creator.nightcafe.studio/creation/{test_id}",
            "creationId": test_id,
            "title": "TEST_First Import"
        }
        r = requests.post(f"{BASE_URL}/api/import", json=payload)
        assert r.status_code == 201
        data = r.json()
        assert data['duplicate'] is False
        TestDuplicateDetection.created_id = data['id']
    
    def test_duplicate_via_metadata_nightcafe_creation_id(self):
        """Duplicate detection uses metadata.nightcafe_creation_id"""
        payload = {
            "url": "https://creator.nightcafe.studio/creation/TEST_dup_check_001",
            "creationId": "TEST_dup_check_001",  # Same creationId
            "title": "TEST_Duplicate Attempt"
        }
        r = requests.post(f"{BASE_URL}/api/import", json=payload)
        assert r.status_code == 201
        data = r.json()
        assert data['duplicate'] is True
        assert data['id'] == TestDuplicateDetection.created_id
    
    def test_cleanup(self):
        if TestDuplicateDetection.created_id:
            requests.delete(f"{BASE_URL}/api/gallery-items/{TestDuplicateDetection.created_id}")


class TestImportStatus:
    """GET /api/import/status?creationId=X - checks metadata.nightcafe_creation_id"""
    created_id = None
    
    def test_status_exists(self):
        # First create an import
        test_id = "TEST_status_check_001"
        payload = {
            "url": f"https://creator.nightcafe.studio/creation/{test_id}",
            "creationId": test_id,
            "title": "TEST_Status Check"
        }
        r = requests.post(f"{BASE_URL}/api/import", json=payload)
        assert r.status_code == 201
        TestImportStatus.created_id = r.json()['id']
        
        # Check status
        r = requests.get(f"{BASE_URL}/api/import/status?creationId={test_id}")
        assert r.status_code == 200
        data = r.json()
        assert data['exists'] is True
        assert data['id'] == TestImportStatus.created_id
    
    def test_status_not_exists(self):
        r = requests.get(f"{BASE_URL}/api/import/status?creationId=NONEXISTENT_XYZ")
        assert r.status_code == 200
        data = r.json()
        assert data['exists'] is False
    
    def test_cleanup(self):
        if TestImportStatus.created_id:
            requests.delete(f"{BASE_URL}/api/gallery-items/{TestImportStatus.created_id}")


class TestGalleryItems:
    """GET /api/gallery-items - returns items sorted by created_at (not imported_at)"""
    
    def test_list_sorted_by_created_at(self):
        r = requests.get(f"{BASE_URL}/api/gallery-items")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        
        # Verify sorted descending by created_at
        if len(items) >= 2:
            for i in range(len(items) - 1):
                assert 'created_at' in items[i], "Field created_at missing (not imported_at)"
                assert items[i]['created_at'] >= items[i+1]['created_at'], "Not sorted by created_at desc"
    
    def test_get_item_with_embedded_prompt(self):
        """GET /api/gallery-items/{id} returns item with embedded _prompt data"""
        r = requests.get(f"{BASE_URL}/api/gallery-items")
        items = r.json()
        assert len(items) > 0
        
        item_id = items[0]['id']
        r = requests.get(f"{BASE_URL}/api/gallery-items/{item_id}")
        assert r.status_code == 200
        item = r.json()
        
        # Verify _prompt is embedded
        if item.get('prompt_id'):
            assert '_prompt' in item, "Missing embedded _prompt data"
            assert item['_prompt']['id'] == item['prompt_id']


class TestStatsSummary:
    """GET /api/gallery-items/stats/summary - counts using metadata.all_images and metadata.is_published"""
    
    def test_stats_fields(self):
        r = requests.get(f"{BASE_URL}/api/gallery-items/stats/summary")
        assert r.status_code == 200
        data = r.json()
        
        required_fields = ['total', 'withImage', 'withPrompt', 'withMultipleImages', 'published', 'totalPrompts']
        for field in required_fields:
            assert field in data, f"Missing stats field: {field}"
    
    def test_multiple_images_count(self):
        """withMultipleImages uses metadata.all_images"""
        r = requests.get(f"{BASE_URL}/api/gallery-items/stats/summary")
        data = r.json()
        
        # Get items with multiple images
        r2 = requests.get(f"{BASE_URL}/api/gallery-items")
        items = r2.json()
        count_multi = sum(1 for item in items if len(item.get('metadata', {}).get('all_images', [])) > 1)
        
        assert data['withMultipleImages'] == count_multi
    
    def test_published_count(self):
        """published uses metadata.is_published"""
        r = requests.get(f"{BASE_URL}/api/gallery-items/stats/summary")
        data = r.json()
        
        r2 = requests.get(f"{BASE_URL}/api/gallery-items")
        items = r2.json()
        count_published = sum(1 for item in items if item.get('metadata', {}).get('is_published') is True)
        
        assert data['published'] == count_published


class TestDeleteGalleryItem:
    """DELETE /api/gallery-items/{id} - deletes both gallery_item and linked prompt"""
    
    def test_delete_removes_both_collections(self):
        # Create a new import
        test_id = f"TEST_delete_{uuid.uuid4().hex[:8]}"
        payload = {
            "url": f"https://creator.nightcafe.studio/creation/{test_id}",
            "creationId": test_id,
            "title": "TEST_Delete Test"
        }
        r = requests.post(f"{BASE_URL}/api/import", json=payload)
        assert r.status_code == 201
        data = r.json()
        item_id = data['id']
        prompt_id = data['prompt_id']
        
        # Verify both exist
        r = requests.get(f"{BASE_URL}/api/gallery-items/{item_id}")
        assert r.status_code == 200
        
        r = requests.get(f"{BASE_URL}/api/prompts")
        prompts = r.json()
        assert any(p['id'] == prompt_id for p in prompts)
        
        # Delete
        r = requests.delete(f"{BASE_URL}/api/gallery-items/{item_id}")
        assert r.status_code == 200
        assert r.json()['success'] is True
        
        # Verify both deleted
        r = requests.get(f"{BASE_URL}/api/gallery-items/{item_id}")
        assert r.status_code == 404
        
        r = requests.get(f"{BASE_URL}/api/prompts")
        prompts = r.json()
        assert not any(p['id'] == prompt_id for p in prompts)


class TestVideoCreation:
    """Test video media_type and video-specific fields"""
    created_id = None
    
    def test_create_video_import(self):
        test_id = f"TEST_video_{uuid.uuid4().hex[:8]}"
        payload = {
            "url": f"https://creator.nightcafe.studio/creation/{test_id}",
            "creationId": test_id,
            "title": "TEST_Video Creation",
            "creationType": "video",  # Should become media_type
            "videoPrompt": "A dragon flying through clouds",
            "model": "Kling",
            "aspectRatio": "16:9",
            "metadata": {
                "duration": "5s",
                "runtime": "30s"
            }
        }
        r = requests.post(f"{BASE_URL}/api/import", json=payload)
        assert r.status_code == 201
        TestVideoCreation.created_id = r.json()['id']
    
    def test_verify_video_fields(self):
        r = requests.get(f"{BASE_URL}/api/gallery-items/{TestVideoCreation.created_id}")
        assert r.status_code == 200
        item = r.json()
        
        assert item['media_type'] == "video"  # NOT creation_type
        assert item['metadata']['video_prompt'] == "A dragon flying through clouds"
        
        # Prompt should use videoPrompt as content
        assert '_prompt' in item
        assert item['_prompt']['content'] == "A dragon flying through clouds"
    
    def test_cleanup(self):
        if TestVideoCreation.created_id:
            requests.delete(f"{BASE_URL}/api/gallery-items/{TestVideoCreation.created_id}")
