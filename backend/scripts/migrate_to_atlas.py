"""
Migrate local MongoDB (campus_pulse) -> MongoDB Atlas
Usage: python scripts/migrate_to_atlas.py
"""

import sys
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, BulkWriteError

import os

# CONFIG
LOCAL_URI   = "mongodb://localhost:27017"
LOCAL_DB    = "campus_pulse"

ATLAS_URI   = os.getenv("ATLAS_URI", "")
ATLAS_DB    = "campus_pulse"

def migrate():
    print("\n Connecting to LOCAL MongoDB...")
    try:
        local_client = MongoClient(LOCAL_URI, serverSelectionTimeoutMS=5000)
        local_client.admin.command("ping")
        print("   OK - Local connection OK")
    except ConnectionFailure as e:
        print(f"   FAIL - Cannot connect to local MongoDB: {e}")
        sys.exit(1)

    print(" Connecting to MongoDB ATLAS...")
    try:
        atlas_client = MongoClient(ATLAS_URI, serverSelectionTimeoutMS=10000)
        atlas_client.admin.command("ping")
        print("   OK - Atlas connection OK\n")
    except ConnectionFailure as e:
        print(f"   FAIL - Cannot connect to Atlas: {e}")
        sys.exit(1)

    local_db = local_client[LOCAL_DB]
    atlas_db = atlas_client[ATLAS_DB]

    collections = local_db.list_collection_names()
    if not collections:
        print("WARNING: No collections found in local database. Nothing to migrate.")
        sys.exit(0)

    print(f"Found {len(collections)} collection(s): {', '.join(collections)}\n")

    total_migrated = 0

    for col_name in collections:
        local_col = local_db[col_name]
        atlas_col = atlas_db[col_name]
        documents = list(local_col.find({}))
        count = len(documents)

        if count == 0:
            print(f"   SKIP [{col_name}] - empty")
            continue

        print(f"   MIGRATING [{col_name}] {count} document(s)...", end=" ")
        try:
            atlas_col.delete_many({})
            result = atlas_col.insert_many(documents, ordered=False)
            inserted = len(result.inserted_ids)
            print(f"OK {inserted}/{count} inserted.")
            total_migrated += inserted
        except BulkWriteError as bwe:
            inserted = bwe.details.get("nInserted", 0)
            print(f"WARN {inserted}/{count} inserted (some duplicates skipped).")
            total_migrated += inserted
        except Exception as e:
            print(f"ERROR: {e}")

    print(f"\nMigration complete! Total documents migrated: {total_migrated}")
    local_client.close()
    atlas_client.close()

if __name__ == "__main__":
    migrate()
