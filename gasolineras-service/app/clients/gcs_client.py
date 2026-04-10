"""Cliente de persistencia a Google Cloud Storage."""
import io
import importlib


class GCSClient:
    def upload_parquet(
        self,
        records: list[dict],
        bucket_name: str,
        blob_path: str,
        compression: str,
    ) -> str:
        pyarrow = importlib.import_module("pyarrow")
        parquet = importlib.import_module("pyarrow.parquet")
        storage = importlib.import_module("google.cloud.storage")

        table = pyarrow.Table.from_pylist(records)
        buffer = io.BytesIO()
        parquet.write_table(table, buffer, compression=compression)
        buffer.seek(0)

        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        blob.upload_from_file(buffer, content_type="application/octet-stream")

        return f"gs://{bucket_name}/{blob_path}"
