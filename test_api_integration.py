#!/usr/bin/env python3
"""
Test script for EOG API integration.
Tests both CauldronAPIClient and TransportLogAPIClient.
"""

import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from potion_agent.data_ingestion import CauldronAPIClient, TransportLogAPIClient


async def test_cauldron_api():
    """Test CauldronAPIClient with EOG API."""
    print("=" * 60)
    print("Testing CauldronAPIClient...")
    print("=" * 60)
    
    client = CauldronAPIClient()
    
    try:
        cauldrons = await client.fetch_current_levels()
        print(f"\n✅ Successfully fetched {len(cauldrons)} cauldrons from EOG API\n")
        
        # Display first 3 cauldrons
        for i, cauldron in enumerate(cauldrons[:3], 1):
            print(f"Cauldron {i}:")
            print(f"  ID: {cauldron.cauldron_id}")
            print(f"  Name: {cauldron.name}")
            print(f"  Level: {cauldron.fill_level_liters:.2f}L / {cauldron.capacity_liters:.2f}L")
            print(f"  Utilization: {cauldron.utilization() * 100:.1f}%")
            print(f"  Location: ({cauldron.latitude:.4f}, {cauldron.longitude:.4f})")
            print(f"  Fill Rate: {cauldron.fill_rate_liters_per_min:.2f} L/min")
            print(f"  Drain Rate: {cauldron.drain_rate_liters_per_min:.2f} L/min")
            print(f"  Last Updated: {cauldron.last_updated}")
            print()
        
        if len(cauldrons) > 3:
            print(f"... and {len(cauldrons) - 3} more cauldrons\n")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error fetching cauldrons: {e}\n")
        import traceback
        traceback.print_exc()
        return False


async def test_tickets_api():
    """Test TransportLogAPIClient with EOG API."""
    print("=" * 60)
    print("Testing TransportLogAPIClient...")
    print("=" * 60)
    
    client = TransportLogAPIClient()
    
    try:
        tickets = await client.fetch_recent_tickets(limit=10)
        print(f"\n✅ Successfully fetched {len(tickets)} tickets from EOG API\n")
        
        # Display first 5 tickets
        for i, ticket in enumerate(tickets[:5], 1):
            print(f"Ticket {i}:")
            print(f"  ID: {ticket.ticket_id}")
            print(f"  Cauldron: {ticket.cauldron_id}")
            print(f"  Volume: {ticket.volume_liters:.2f}L")
            print(f"  Direction: {ticket.direction}")
            print(f"  Courier: {ticket.courier_id}")
            print(f"  Date: {ticket.date}")
            print()
        
        if len(tickets) > 5:
            print(f"... and {len(tickets) - 5} more tickets\n")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error fetching tickets: {e}\n")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all tests."""
    print("\n🧪 Testing EOG API Integration\n")
    
    cauldron_success = await test_cauldron_api()
    tickets_success = await test_tickets_api()
    
    print("=" * 60)
    print("Test Summary:")
    print("=" * 60)
    print(f"Cauldron API: {'✅ PASS' if cauldron_success else '❌ FAIL'}")
    print(f"Tickets API:  {'✅ PASS' if tickets_success else '❌ FAIL'}")
    print()
    
    if cauldron_success and tickets_success:
        print("🎉 All tests passed! API integration is working correctly.")
        return 0
    else:
        print("⚠️  Some tests failed. Check errors above.")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)

