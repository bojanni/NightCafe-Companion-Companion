"""Tests for NightCafe Studio Data Bridge API"""
import pytest
import requests
import os
import json

def get_base_url():
    url = os.environ.get('REACT_APP_BACKEND_URL', '')
    if not url:
        # Try reading from frontend .env
        env_path = '/app/frontend/.env'
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith('REACT_APP_BACKEND_URL='):
                        url = line.strip().split('=', 1)[1]
                        break
    return url.rstrip('/')

BASE_URL = get_base_url()

# Health check
class TestHealth:
    def test_import_health(self):
        r = requests.get(f"{BASE_URL}/api/import/health")
        assert r.status_code == 200
        data = r.json()
        assert data.get('status') == 'ok'

# Import CRUD
class TestImports:
    created_id = None

    def test_post_import(self):
        payload = {
            "url": "https://creator.nightcafe.studio/creation/TEST_abc123",
            "creationId": "TEST_abc123",
            "title": "TEST_Creation",
            "prompt": "a beautiful sunset over the ocean",
            "imageUrl": "https://example.com/image.jpg",
            "model": "Stable Diffusion XL"
        }
        r = requests.post(f"{BASE_URL}/api/import", json=payload)
        assert r.status_code == 201
        data = r.json()
        assert data.get('success') is True
        assert 'id' in data
        assert data.get('duplicate') is False
        TestImports.created_id = data['id']

    def test_duplicate_detection(self):
        payload = {
            "url": "https://creator.nightcafe.studio/creation/TEST_abc123",
            "creationId": "TEST_abc123",
            "title": "TEST_Duplicate"
        }
        r = requests.post(f"{BASE_URL}/api/import", json=payload)
        assert r.status_code == 201
        data = r.json()
        assert data.get('duplicate') is True

    def test_get_imports(self):
        r = requests.get(f"{BASE_URL}/api/imports")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_post_import_new_fields(self):
        """Test all new fields: revisedPrompt, allImages, initialResolution, aspectRatio, seed, isPublished"""
        payload = {
            "url": "https://creator.nightcafe.studio/creation/TEST_newfields",
            "creationId": "TEST_newfields_001",
            "title": "TEST_NewFields",
            "prompt": "test prompt",
            "revisedPrompt": "revised test prompt",
            "allImages": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
            "initialResolution": "512x512",
            "aspectRatio": "16:9",
            "seed": "12345678",
            "isPublished": True,
            "model": "SDXL"
        }
        r = requests.post(f"{BASE_URL}/api/import", json=payload)
        assert r.status_code == 201
        data = r.json()
        assert data.get('success') is True
        new_id = data['id']

        # Verify fields persisted via GET
        r2 = requests.get(f"{BASE_URL}/api/imports/{new_id}")
        assert r2.status_code == 200
        item = r2.json()
        assert item['revisedPrompt'] == 'revised test prompt'
        assert item['initialResolution'] == '512x512'
        assert item['aspectRatio'] == '16:9'
        assert item['seed'] == '12345678'
        assert item['isPublished'] is True
        assert len(item['allImages']) == 2

        # Cleanup
        requests.delete(f"{BASE_URL}/api/imports/{new_id}")

    def test_get_stats(self):
        r = requests.get(f"{BASE_URL}/api/imports/stats/summary")
        assert r.status_code == 200
        data = r.json()
        assert 'total' in data
        assert 'withImage' in data
        assert 'withPrompt' in data
        assert 'withMultipleImages' in data
        assert 'published' in data
        assert data['total'] >= 1

    def test_delete_import(self):
        assert TestImports.created_id is not None, "No created_id from previous test"
        r = requests.delete(f"{BASE_URL}/api/imports/{TestImports.created_id}")
        assert r.status_code == 200
        data = r.json()
        assert data.get('success') is True

    def test_delete_nonexistent(self):
        r = requests.delete(f"{BASE_URL}/api/imports/nonexistent-id-xyz")
        assert r.status_code == 404

# Extension files
class TestExtensionFiles:
    def test_manifest_valid_json(self):
        with open('/app/extension/manifest.json') as f:
            data = json.load(f)
        assert data['manifest_version'] == 3
        assert 'name' in data
        assert 'version' in data
        assert 'permissions' in data
        assert 'action' in data
        assert 'content_scripts' in data
        assert 'background' in data

    def test_extension_files_exist(self):
        import pathlib
        base = pathlib.Path('/app/extension')
        required = ['manifest.json', 'popup.html', 'popup.js', 'popup.css', 'content.js', 'content.css', 'background.js']
        for f in required:
            assert (base / f).exists(), f"Missing: {f}"

    def test_extension_icons_exist(self):
        import pathlib
        icons_dir = pathlib.Path('/app/extension/icons')
        for size in [16, 32, 48, 128]:
            icon = icons_dir / f"icon{size}.png"
            assert icon.exists(), f"Missing icon: icon{size}.png"
