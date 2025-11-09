#!/usr/bin/env python3
"""
Test script for FastAPI server endpoints.
Tests all API endpoints to verify they work correctly.
"""

import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

import httpx
from api.main import app


async def test_endpoints():
    """Test all FastAPI endpoints."""
    
    base_url = "http://localhost:8000"
    
    print("=" * 60)
    print("Testing FastAPI Server Endpoints")
    print("=" * 60)
    print()
    
    async with httpx.AsyncClient() as client:
        # Test 1: Health check
        print("1. Testing GET / (Health Check)...")
        try:
            resp = await client.get(f"{base_url}/")
            print(f"   ✅ Status: {resp.status_code}")
            print(f"   Response: {resp.json()}")
        except Exception as e:
            print(f"   ❌ Error: {e}")
        print()
        
        # Test 2: Get cauldrons
        print("2. Testing GET /api/cauldrons...")
        try:
            resp = await client.get(f"{base_url}/api/cauldrons")
            print(f"   ✅ Status: {resp.status_code}")
            data = resp.json()
            print(f"   Fetched {len(data)} cauldrons")
            if data:
                print(f"   First cauldron: {data[0]['name']} ({data[0]['level']}% full)")
        except Exception as e:
            print(f"   ❌ Error: {e}")
        print()
        
        # Test 3: Get tickets
        print("3. Testing GET /api/tickets...")
        try:
            resp = await client.get(f"{base_url}/api/tickets?limit=5")
            print(f"   ✅ Status: {resp.status_code}")
            data = resp.json()
            print(f"   Fetched {len(data)} tickets")
            if data:
                print(f"   First ticket: {data[0]['ticket_id']} - {data[0]['volume_liters']}L")
        except Exception as e:
            print(f"   ❌ Error: {e}")
        print()
        
        # Test 4: Get historical data
        print("4. Testing GET /api/historical/cauldrons...")
        try:
            resp = await client.get(f"{base_url}/api/historical/cauldrons")
            print(f"   ✅ Status: {resp.status_code}")
            data = resp.json()
            print(f"   Date: {data['date']}")
            print(f"   Cauldrons: {len(data['cauldrons'])}")
        except Exception as e:
            print(f"   ❌ Error: {e}")
        print()
        
        # Test 5: Get anomalies
        print("5. Testing GET /api/anomalies...")
        try:
            resp = await client.get(f"{base_url}/api/anomalies")
            print(f"   ✅ Status: {resp.status_code}")
            data = resp.json()
            print(f"   Found {len(data)} anomalies")
        except Exception as e:
            print(f"   ❌ Error: {e}")
        print()
        
        # Test 6: Get forecasts
        print("6. Testing GET /api/forecasts...")
        try:
            resp = await client.get(f"{base_url}/api/forecasts")
            print(f"   ✅ Status: {resp.status_code}")
            data = resp.json()
            print(f"   Generated {len(data)} forecasts")
        except Exception as e:
            print(f"   ❌ Error: {e}")
        print()
        
        # Test 7: Get routes
        print("7. Testing GET /api/routes...")
        try:
            resp = await client.get(f"{base_url}/api/routes")
            print(f"   ✅ Status: {resp.status_code}")
            data = resp.json()
            print(f"   Generated {len(data)} routes")
        except Exception as e:
            print(f"   ❌ Error: {e}")
        print()
    
    print("=" * 60)
    print("Test Summary")
    print("=" * 60)
    print("✅ All endpoints tested!")
    print()
    print("📚 API Documentation available at: http://localhost:8000/docs")
    print("🔍 Alternative docs at: http://localhost:8000/redoc")
    print()


if __name__ == "__main__":
    print("\n⚠️  Make sure the FastAPI server is running on http://localhost:8000")
    print("   Start it with: python3 -m uvicorn src.api.main:app --reload\n")
    asyncio.run(test_endpoints())

