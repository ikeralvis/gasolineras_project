import os
import re
from datetime import datetime, timedelta, timezone

from google.cloud import storage

BUCKET_NAME = os.environ.get("GCS_BUCKET", "").strip()
SRC_PREFIX = os.environ.get("GCS_RAW_PREFIX", "precios-gasolineras/").strip()
DEST_PREFIX = os.environ.get("GCS_SNAPSHOT_PREFIX", SRC_PREFIX).strip()
DAYS_BACK = int(os.environ.get("MIGRATE_DAYS", "365"))
DRY_RUN = os.environ.get("DRY_RUN", "false").lower() == "true"

FILENAME_RE = re.compile(r"prices_(\d{2})-(\d{2})-(\d{4})\.parquet$")


def parse_date_from_name(name: str):
    match = FILENAME_RE.search(name)
    if not match:
        return None
    day, month, year = match.groups()
    try:
        return datetime(int(year), int(month), int(day), tzinfo=timezone.utc).date()
    except ValueError:
        return None


def main():
    if not BUCKET_NAME:
        raise RuntimeError("GCS_BUCKET is required")

    client = storage.Client()
    bucket = client.bucket(BUCKET_NAME)

    cutoff = (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)).date()
    print(f"Migrating files since {cutoff.isoformat()} (days_back={DAYS_BACK})")

    copied = 0
    skipped = 0

    for blob in bucket.list_blobs(prefix=SRC_PREFIX):
        name = blob.name
        if "snapshot_date=" in name:
            continue
        snapshot_date = parse_date_from_name(name)
        if snapshot_date is None:
            continue
        if snapshot_date < cutoff:
            continue

        dest_name = f"{DEST_PREFIX}snapshot_date={snapshot_date.isoformat()}/gasolineras.parquet"
        dest_blob = bucket.blob(dest_name)
        if dest_blob.exists():
            skipped += 1
            continue

        print(f"{name} -> {dest_name}")
        if not DRY_RUN:
            bucket.copy_blob(blob, bucket, new_name=dest_name)
        copied += 1

    print(f"Done. copied={copied} skipped={skipped}")


if __name__ == "__main__":
    main()
