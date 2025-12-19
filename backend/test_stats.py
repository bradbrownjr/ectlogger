#!/usr/bin/env python3
"""Test the statistics endpoint to find the error."""
import sys
sys.path.insert(0, '/home/ectlogger/ectlogger/backend')

import sqlite3

# Direct DB check
conn = sqlite3.connect('/home/ectlogger/ectlogger/backend/ectlogger.db')
cursor = conn.cursor()

print("Check-ins for net 1:")
for row in cursor.execute("SELECT id, callsign, status FROM check_ins WHERE net_id = 1"):
    print(f"  {row}")

# Now test the enum
from app.models import StationStatus

print("\nTesting enum matching:")
for row in cursor.execute("SELECT DISTINCT status FROM check_ins WHERE net_id = 1"):
    status = row[0]
    try:
        matched = StationStatus(status)
        print(f"  '{status}' -> {matched}")
    except ValueError as e:
        print(f"  '{status}' -> ERROR: {e}")

conn.close()
