"""Regression checks use disposable data and model doubles, never user assets."""
import asyncio
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[1]
TEST_HOME = ROOT / ".test-data" / uuid.uuid4().hex
TEST_HOME.mkdir(parents=True)
os.environ["VOXERA_HOME"] = str(TEST_HOME)

from fastapi.testclient import TestClient
from engine import server
from engine.models.base import GenerationResult
from engine.models.downloader import model_ready, model_version, write_manifest
from engine.storage.database import engine
from engine.storage.models import Base, AuditionClip, Character, GenerationBatch


class FakeModel:
    model_name = "Qwen3-TTS 1.7B VoiceDesign"
    model_version = "test-revision"
    calls = []
    failure = False

    def is_downloaded(self):
        return True

    def unload(self):
        pass

    async def generate_single(self, **kwargs):
        self.calls.append(kwargs)
        if self.failure:
            raise RuntimeError("Controlled inference failure")
        target = kwargs["output_path"].with_suffix(".wav")
        target.write_bytes(b"RIFF-test-fixture")
        return GenerationResult(audio_path=str(target), duration_seconds=1,
                                waveform_data=[0.5] * 48, model_name=self.model_name,
                                model_version=self.model_version, seed=kwargs["seed"],
                                elapsed_ms=1, metadata={"mode": "voice_clone" if kwargs.get("reference_audio") else "voice_design"})


class EngineTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(engine)
        server.init_db()
        server.generation_event_history.clear()
        server.generation_subscribers.clear()
        server.active_model = None
        server.generation_lock = asyncio.Lock()
        self.model = FakeModel()
        self.model.calls = []
        self.model.failure = False
        self.registry = patch.dict(server.model_registry, {self.model.model_name: self.model})
        self.registry.start()
        self.addCleanup(self.registry.stop)
        self.client = TestClient(server.app, base_url="http://127.0.0.1:28840")
        self.client.get("/api/session")

    def character(self):
        response = self.client.post("/api/characters", json={"name": "角色🙂", "voice_description": "温和", "sample_text": "你好"})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["id"]

    def generate(self, char_id=None, **changes):
        data = {"character_id": char_id, "prompt": "温和", "sample_text": "你好", "candidate_count": 1}
        data.update(changes)
        return self.client.post("/api/generate", json=data)

    def test_requires_session(self):
        client = TestClient(server.app, base_url="http://127.0.0.1:28840")
        self.assertEqual(client.get("/api/models").status_code, 401)
        self.assertEqual(client.get("/api/health").status_code, 200)

    def test_host_and_origin_rejected(self):
        self.assertEqual(self.client.get("/api/session", headers={"Host": "evil.example"}).status_code, 403)
        self.assertEqual(self.client.get("/api/session", headers={"Origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.client.options("/api/characters/1", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "DELETE"}).status_code, 403)

    def test_trusted_dev_origin_and_cookie(self):
        response = self.client.get("/api/session", headers={"Origin": "http://127.0.0.1:5173"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("HttpOnly", response.headers["set-cookie"])
        self.assertIn("SameSite=strict", response.headers["set-cookie"])

    def test_static_traversal_rejected(self):
        # The guard itself remains testable even when a frontend build is absent.
        from engine.core.security import contained_path
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            contained_path(ROOT / "app/dist", "../../README.md")
        if server.FRONTEND_DIST.exists():
            self.assertEqual(self.client.get("/%2e%2e/%2e%2e/README.md").status_code, 403)

    def test_empty_text_and_count_rejected(self):
        for changes in ({"prompt": "   "}, {"sample_text": ""}, {"candidate_count": 0}, {"candidate_count": 11}):
            self.assertEqual(self.generate(**changes).status_code, 422)

    def test_character_and_model_validation(self):
        self.assertEqual(self.generate(999999).status_code, 404)
        self.assertEqual(self.generate(model_name="invalid").status_code, 400)
        self.assertEqual(self.client.post("/api/system/acceleration/install", json={"variant": "malicious"}).status_code, 422)

    def test_no_arbitrary_executable(self):
        from engine.core.acceleration import test_external_python
        with patch("engine.core.acceleration.subprocess.run") as run:
            result = test_external_python(str(ROOT / "Voxera.exe"))
            self.assertFalse(result.valid)
            run.assert_not_called()

    def test_full_generation_and_real_version(self):
        char_id = self.character()
        response = self.generate(char_id, candidate_count=4)
        self.assertEqual(response.status_code, 200, response.text)
        status = self.client.get(f"/api/generate/{response.json()['batch_id']}/status").json()
        self.assertEqual(status["status"], "completed")
        self.assertEqual(len(status["clips"]), 4)
        self.assertTrue(all(c["model_version"] == "test-revision" for c in status["clips"]))
        self.assertEqual(len(self.model.calls), 4)

    def test_candidate_ten_preserved(self):
        response = self.generate(candidate_count=10)
        self.assertEqual(response.json()["candidate_count"], 10)
        self.assertEqual(len(self.model.calls), 10)

    def test_invalid_pin_and_cross_character_pin(self):
        char_id = self.character()
        self.generate(char_id)
        clip = self.client.get(f"/api/auditions?character_id={char_id}").json()[0]
        another = self.character()
        for clip_id in (99999, clip["id"]):
            self.assertEqual(self.client.put(f"/api/characters/{another}", json={"pinned_clip_id": clip_id}).status_code, 404)

    def test_reference_voice_reaches_adapter(self):
        char_id = self.character()
        self.generate(char_id)
        clip = self.client.get(f"/api/auditions?character_id={char_id}").json()[0]
        self.assertEqual(self.client.post(f"/api/auditions/{clip['id']}/pin").status_code, 200)
        with patch.object(server.model_downloader, "is_model_downloaded", return_value=True):
            response = self.generate(char_id, reuse_pinned_voice=True)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.model.calls[-1]["reference_audio"].endswith(".wav"))
        self.assertEqual(self.model.calls[-1]["reference_text"], "你好")

    def test_reference_requires_base_model(self):
        char_id = self.character()
        self.generate(char_id)
        clip = self.client.get(f"/api/auditions?character_id={char_id}").json()[0]
        self.client.post(f"/api/auditions/{clip['id']}/pin")
        with patch.object(server.model_downloader, "is_model_downloaded", return_value=False):
            self.assertEqual(self.generate(char_id, reuse_pinned_voice=True).status_code, 409)

    def test_delete_character_cleans_audio(self):
        char_id = self.character()
        self.generate(char_id)
        with server.SessionLocal() as db:
            path = Path(db.query(AuditionClip).first().file_path)
        self.assertTrue(path.exists())
        self.assertEqual(self.client.delete(f"/api/characters/{char_id}").status_code, 200)
        self.assertFalse(path.exists())
        self.assertEqual(self.client.get("/api/auditions?include_all=true").json(), [])

    def test_delete_rollback_on_file_error(self):
        char_id = self.character()
        self.generate(char_id, candidate_count=2)
        with server.SessionLocal() as db:
            paths = [Path(c.file_path) for c in db.query(AuditionClip).all()]
        original_rename = Path.rename
        calls = 0
        def controlled_rename(path, target):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise PermissionError("controlled locked file")
            return original_rename(path, target)
        with patch.object(Path, "rename", controlled_rename):
            response = self.client.delete(f"/api/characters/{char_id}")
        self.assertEqual(response.status_code, 500)
        self.assertTrue(all(path.exists() for path in paths))
        self.assertEqual(len(self.client.get(f"/api/auditions?character_id={char_id}").json()), 2)

    def test_failed_status_and_sse_survive_history_loss(self):
        self.model.failure = True
        batch_id = self.generate().json()["batch_id"]
        server.generation_event_history.clear()
        response = self.client.get(f"/api/generate/{batch_id}/events")
        self.assertIn('"status": "failed"', response.text)
        self.assertIn("batch_complete", response.text)
        clip = self.client.get(f"/api/generate/{batch_id}/status").json()["clips"][0]
        self.assertIn("Controlled inference failure", clip["error"])

    def test_missing_sse_batch_returns_404(self):
        self.assertEqual(self.client.get("/api/generate/99999/events").status_code, 404)

    def test_restart_recovers_interrupted_job(self):
        with server.SessionLocal() as db:
            batch = GenerationBatch(prompt="p", sample_text="t", model_name=self.model.model_name,
                                    model_version="test", status="generating", candidate_count=1)
            db.add(batch); db.commit()
            db.add(AuditionClip(batch_id=batch.id, candidate_index=1, file_path="", status="processing",
                               model_name=self.model.model_name, model_version="test", seed=1, prompt="p", sample_text="t"))
            db.commit(); batch_id = batch.id
        server.cleanup_zombie_clips()
        status = self.client.get(f"/api/generate/{batch_id}/status").json()
        self.assertEqual(status["status"], "failed")
        self.assertEqual(status["clips"][0]["status"], "failed")
        self.assertTrue(status["clips"][0]["error"])

    def test_manifest_tracks_files_and_revision(self):
        directory = TEST_HOME / uuid.uuid4().hex
        directory.mkdir()
        (directory / "config.json").write_text('{}')
        (directory / "model.safetensors").write_bytes(b"test-weights")
        write_manifest(directory, "fixture", "huggingface", "fixed-revision")
        self.assertTrue(model_ready(directory))
        self.assertTrue(model_version(directory).startswith("sha256:"))
        (directory / "model.safetensors").write_bytes(b"truncated")
        self.assertFalse(model_ready(directory))

    def test_serial_tasks_do_not_overlap(self):
        active = 0
        maximum = 0
        async def worker(batch_id, count):
            nonlocal active, maximum
            active += 1; maximum = max(active, maximum)
            await asyncio.sleep(0.02)
            active -= 1
        async def run():
            with patch.object(server, "run_generation_serial", worker):
                await asyncio.gather(server.run_generation_task(1, 1), server.run_generation_task(2, 1))
        asyncio.run(run())
        self.assertEqual(maximum, 1)

    def test_checksum_detects_same_size_corruption(self):
        folder = TEST_HOME / uuid.uuid4().hex
        folder.mkdir()
        (folder / "config.json").write_text('{}')
        (folder / "model.safetensors").write_bytes(b"original")
        write_manifest(folder, "fixture", "huggingface", "fixed")
        self.assertTrue(model_ready(folder, verify_hashes=True))
        (folder / "model.safetensors").write_bytes(b"modified")
        self.assertFalse(model_ready(folder, verify_hashes=True))

    def test_additive_migration_preserves_existing_character(self):
        from sqlalchemy import text, inspect
        char_id = self.character()
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE generation_batches DROP COLUMN reference_clip_id"))
            connection.execute(text("ALTER TABLE audition_clips DROP COLUMN metadata_json"))
        server.init_db()
        self.assertIn("reference_clip_id", [c["name"] for c in inspect(engine).get_columns("generation_batches")])
        self.assertIn("metadata_json", [c["name"] for c in inspect(engine).get_columns("audition_clips")])
        self.assertEqual(self.client.get('/api/characters').json()[0]["id"], char_id)

    def test_deletion_recovery_restores_uncommitted_file(self):
        self.generate(self.character())
        with server.SessionLocal() as db:
            clip = db.query(AuditionClip).first()
            original = Path(clip.file_path)
            staged = original.with_name(f".deleting-{clip.id}-fixture-{original.name}")
            original.rename(staged)
            server.recover_staged_deletions(db)
            self.assertTrue(original.is_file())
            self.assertFalse(staged.exists())

    def test_moving_portable_folder_rebinds_local_audio(self):
        self.generate(self.character())
        with server.SessionLocal() as db:
            clip = db.query(AuditionClip).first()
            local = Path(clip.file_path)
            clip.file_path = str(TEST_HOME / "old-folder" / local.name)
            db.commit()
            server.recover_portable_paths(db)
            self.assertEqual(clip.file_path, str(local))

    def test_queued_job_blocks_asset_deletion(self):
        char_id = self.character()
        batch_id = self.generate(char_id).json()["batch_id"]
        with server.SessionLocal() as db:
            db.get(GenerationBatch, batch_id).status = "queued"
            db.commit()
        self.assertEqual(self.client.delete(f'/api/characters/{char_id}').status_code, 409)

    def test_zip_export_has_valid_entries(self):
        import io, zipfile
        char_id = self.character()
        self.generate(char_id, candidate_count=2)
        clips = self.client.get(f'/api/auditions?character_id={char_id}').json()
        response = self.client.post('/api/auditions/export-zip', json={"clip_ids": [c["id"] for c in clips]})
        self.assertEqual(response.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            self.assertEqual(len(archive.namelist()), 2)
            self.assertIsNone(archive.testzip())
        self.assertEqual(self.client.post('/api/auditions/export-zip', json={"clip_ids": []}).status_code, 422)

    def test_process_identity_rejects_reused_pid(self):
        from types import SimpleNamespace
        from engine.core.lifecycle import matches_process
        process = SimpleNamespace(create_time=lambda: 100, exe=lambda: str(ROOT / "runtime/python.exe"),
                                  cmdline=lambda: ["python", "-m", "engine.server"], cwd=lambda: str(ROOT))
        record = {"pid": 123, "created_at": 99, "executable": str(ROOT / "runtime/python.exe"), "project_root": str(ROOT)}
        with patch('engine.core.lifecycle.psutil.Process', return_value=process):
            self.assertFalse(matches_process(record))
            record["created_at"] = 100
            self.assertTrue(matches_process(record))

    def test_update_cannot_clear_required_text_with_null(self):
        char_id = self.character()
        for field in ('name', 'voice_description', 'sample_text'):
            self.assertEqual(self.client.put(f'/api/characters/{char_id}', json={field: None}).status_code, 422)

    def test_unavailable_model_manifest_cannot_escape(self):
        directory = TEST_HOME / uuid.uuid4().hex
        directory.mkdir()
        (directory / "config.json").write_text('{}')
        (directory / "model.safetensors").write_bytes(b"fixture")
        (directory / ".ready").write_text(json.dumps({"files": {"../secret": {"size": 1}}}))
        self.assertFalse(model_ready(directory))

    def test_shutdown_refuses_active_download(self):
        from types import SimpleNamespace
        with patch.dict(server.download_states, {'fixture': SimpleNamespace(status='downloading')}):
            self.assertEqual(self.client.post('/api/system/shutdown').status_code, 409)

    def test_device_selection(self):
        from engine.core.device import select_device
        from types import SimpleNamespace
        torch = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True),
                                backends=SimpleNamespace(mps=SimpleNamespace(is_available=lambda: False)))
        with patch.dict(sys.modules, {"torch": torch}):
            self.assertEqual(select_device("auto"), "cuda")
            self.assertEqual(select_device("cpu"), "cpu")
            with self.assertRaises(RuntimeError): select_device("mps")


if __name__ == "__main__":
    unittest.main()
