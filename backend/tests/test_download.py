"""Tests for Download Feature - NightCafe Studio Data Bridge
Testing:
- GET /api/gallery-items/download/stats - returns total, local, pending counts  
- POST /api/gallery-items/{id}/download - downloads images from URL to local storage
- POST /api/gallery-items/{id}/download - duplicate download returns 'Al lokaal opgeslagen'
- GET /api/downloads/{item_id}/{filename} - serves downloaded files
"""
import pytest
import requests
import os

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

# ID of the already-downloaded test item
DOWNLOADED_ITEM_ID = "6a041055-297f-4bf9-8450-564619c753d4"


class TestDownloadStats:
    """GET /api/gallery-items/download/stats"""
    
    def test_download_stats_returns_correct_structure(self):
        r = requests.get(f"{BASE_URL}/api/gallery-items/download/stats")
        assert r.status_code == 200
        data = r.json()
        
        # Check all required fields exist
        assert 'total' in data, "Missing 'total' field"
        assert 'local' in data, "Missing 'local' field"
        assert 'pending' in data, "Missing 'pending' field"
        
        # Verify counts are integers
        assert isinstance(data['total'], int)
        assert isinstance(data['local'], int)
        assert isinstance(data['pending'], int)
        
        # Math check: pending = total - local
        assert data['pending'] == data['total'] - data['local']
        print(f"Download stats: total={data['total']}, local={data['local']}, pending={data['pending']}")
    
    def test_download_stats_values(self):
        """Verify stats match expected values (6 total, 1 local, 5 pending)"""
        r = requests.get(f"{BASE_URL}/api/gallery-items/download/stats")
        assert r.status_code == 200
        data = r.json()
        
        # Based on agent context: 6 items, 1 already downloaded
        assert data['total'] == 6, f"Expected 6 total items, got {data['total']}"
        assert data['local'] == 1, f"Expected 1 local item, got {data['local']}"
        assert data['pending'] == 5, f"Expected 5 pending items, got {data['pending']}"


class TestDownloadItem:
    """POST /api/gallery-items/{id}/download"""
    
    def test_duplicate_download_returns_already_stored_message(self):
        """Re-downloading an already-stored item returns 'Al lokaal opgeslagen'"""
        r = requests.post(f"{BASE_URL}/api/gallery-items/{DOWNLOADED_ITEM_ID}/download")
        assert r.status_code == 200
        data = r.json()
        
        assert data.get('success') is True
        assert data.get('downloaded') == 0, "Should not re-download"
        assert 'Al lokaal opgeslagen' in data.get('message', ''), f"Expected 'Al lokaal opgeslagen', got: {data.get('message')}"
        assert 'local_path' in data, "Should return existing local_path"
        print(f"Duplicate download response: {data}")
    
    def test_download_nonexistent_item_returns_404(self):
        """Downloading a non-existent item returns 404"""
        r = requests.post(f"{BASE_URL}/api/gallery-items/nonexistent-xyz/download")
        assert r.status_code == 404
        data = r.json()
        assert 'niet gevonden' in data.get('detail', '').lower() or 'not found' in data.get('detail', '').lower()
    
    def test_download_item_with_fake_url_fails(self):
        """Downloading an item with invalid image URL returns error (502 or 5xx)"""
        # Use one of the bulk items that has a fake nightcafe.studio URL
        bulk_item_id = "403ee885-2f39-42e7-b32f-24b36bc58461"  # bulk003
        
        r = requests.post(f"{BASE_URL}/api/gallery-items/{bulk_item_id}/download")
        # Should return 5xx error because the image URL is fake (502 or 521 cloudflare)
        assert r.status_code >= 500, f"Expected 5xx error for fake URL, got {r.status_code}"
        print(f"Download fake URL returned: {r.status_code}")


class TestServeDownloadedFiles:
    """GET /api/downloads/{item_id}/{filename}"""
    
    def test_serve_downloaded_main_image(self):
        """Serve the main.jpg file from downloaded item"""
        r = requests.get(f"{BASE_URL}/api/downloads/{DOWNLOADED_ITEM_ID}/main.jpg")
        assert r.status_code == 200
        
        # Should be an image
        content_type = r.headers.get('content-type', '')
        assert 'image' in content_type, f"Expected image content-type, got: {content_type}"
        
        # Should have content
        assert len(r.content) > 0, "File should have content"
        print(f"Served main.jpg: {len(r.content)} bytes, content-type: {content_type}")
    
    def test_serve_downloaded_secondary_image(self):
        """Serve the 2.jpg file from downloaded item"""
        r = requests.get(f"{BASE_URL}/api/downloads/{DOWNLOADED_ITEM_ID}/2.jpg")
        assert r.status_code == 200
        
        content_type = r.headers.get('content-type', '')
        assert 'image' in content_type
        assert len(r.content) > 0
        print(f"Served 2.jpg: {len(r.content)} bytes")
    
    def test_serve_nonexistent_file_returns_404(self):
        """Requesting a non-existent file returns 404"""
        r = requests.get(f"{BASE_URL}/api/downloads/{DOWNLOADED_ITEM_ID}/nonexistent.jpg")
        assert r.status_code == 404


class TestGalleryItemWithDownload:
    """Verify gallery item endpoint returns download fields"""
    
    def test_downloaded_item_has_storage_mode_both(self):
        """Downloaded item should have storage_mode='both' and local_path set"""
        r = requests.get(f"{BASE_URL}/api/gallery-items/{DOWNLOADED_ITEM_ID}")
        assert r.status_code == 200
        data = r.json()
        
        assert data.get('storage_mode') == 'both', f"Expected storage_mode='both', got: {data.get('storage_mode')}"
        assert data.get('local_path') is not None, "local_path should be set"
        assert '/api/downloads/' in data.get('local_path', ''), "local_path should contain /api/downloads/"
        
        # Check metadata has local_images array
        meta = data.get('metadata', {})
        assert 'local_images' in meta, "metadata should have local_images"
        assert len(meta['local_images']) >= 1, "Should have at least 1 local image"
        print(f"Downloaded item: storage_mode={data['storage_mode']}, local_path={data['local_path']}")
    
    def test_non_downloaded_item_has_storage_mode_url(self):
        """Non-downloaded item should have storage_mode='url'"""
        non_downloaded_id = "403ee885-2f39-42e7-b32f-24b36bc58461"  # bulk003
        r = requests.get(f"{BASE_URL}/api/gallery-items/{non_downloaded_id}")
        assert r.status_code == 200
        data = r.json()
        
        assert data.get('storage_mode') == 'url', f"Expected storage_mode='url', got: {data.get('storage_mode')}"
        assert data.get('local_path') is None, "local_path should be None for non-downloaded"
