"""Tests for MediaStorage — write_atomic, delete, from_url, path traversal."""
from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path

import pytest

from app.services.lesson.storage import MediaStorage


@pytest.fixture
def tmp_storage(tmp_path: Path) -> MediaStorage:
    """MediaStorage backed by a temporary directory."""
    return MediaStorage(base_dir=tmp_path)


# ── write_atomic ───────────────────────────────────────────────────────────────


def test_write_atomic_creates_file(tmp_storage: MediaStorage, tmp_path: Path) -> None:
    target = tmp_path / "courses" / "ep.pdf"
    content = b"Hello PDF content"
    size = tmp_storage.write_atomic(target, iter([content]))
    assert target.exists()
    assert size == len(content)
    assert target.read_bytes() == content


def test_write_atomic_returns_total_bytes(tmp_storage: MediaStorage, tmp_path: Path) -> None:
    target = tmp_path / "test.pdf"
    chunks = [b"abc", b"de", b"fghi"]
    size = tmp_storage.write_atomic(target, iter(chunks))
    assert size == 9
    assert target.read_bytes() == b"abcdefghi"


def test_write_atomic_no_tmp_file_left_on_success(
    tmp_storage: MediaStorage, tmp_path: Path
) -> None:
    target = tmp_path / "file.bin"
    tmp_storage.write_atomic(target, iter([b"data"]))
    tmp_file = target.with_suffix(target.suffix + ".tmp")
    assert not tmp_file.exists()


def test_write_atomic_creates_parent_dirs(tmp_storage: MediaStorage, tmp_path: Path) -> None:
    target = tmp_path / "a" / "b" / "c" / "file.pdf"
    tmp_storage.write_atomic(target, iter([b"x"]))
    assert target.exists()


# ── delete ─────────────────────────────────────────────────────────────────────


def test_delete_existing_file_returns_true(tmp_storage: MediaStorage, tmp_path: Path) -> None:
    f = tmp_path / "file.txt"
    f.write_bytes(b"data")
    result = tmp_storage.delete(f)
    assert result is True
    assert not f.exists()


def test_delete_missing_file_returns_true(tmp_storage: MediaStorage, tmp_path: Path) -> None:
    """missing_ok=True means delete of non-existent file returns True (no error)."""
    missing = tmp_path / "nonexistent.pdf"
    result = tmp_storage.delete(missing)
    assert result is True


def test_delete_accepts_string_path(tmp_storage: MediaStorage, tmp_path: Path) -> None:
    f = tmp_path / "str.txt"
    f.write_bytes(b"hello")
    result = tmp_storage.delete(str(f))
    assert result is True
    assert not f.exists()


# ── public_url ─────────────────────────────────────────────────────────────────


def test_public_url_converts_abs_path(tmp_storage: MediaStorage, tmp_path: Path) -> None:
    abs_path = tmp_path / "courses" / "abc" / "ep.pdf"
    abs_path.parent.mkdir(parents=True)
    abs_path.touch()
    url = tmp_storage.public_url(abs_path)
    assert url.startswith("/media/")
    assert "courses/abc/ep.pdf" in url


# ── from_url ───────────────────────────────────────────────────────────────────


def test_from_url_resolves_valid_url(tmp_storage: MediaStorage, tmp_path: Path) -> None:
    # Create a file and get its URL, then resolve back
    course_id = uuid.uuid4()
    course_dir = tmp_storage.course_dir(course_id)
    f = course_dir / "ep.pdf"
    f.write_bytes(b"pdf")
    url = tmp_storage.public_url(f)
    resolved = tmp_storage.from_url(url)
    assert resolved is not None
    assert resolved == f


def test_from_url_returns_none_for_non_media_url(tmp_storage: MediaStorage) -> None:
    assert tmp_storage.from_url("/static/image.png") is None
    assert tmp_storage.from_url(None) is None
    assert tmp_storage.from_url("") is None


def test_from_url_rejects_path_traversal(tmp_storage: MediaStorage, tmp_path: Path) -> None:
    """Ensure /media/../../etc/passwd cannot escape the base dir."""
    malicious = "/media/../../etc/passwd"
    result = tmp_storage.from_url(malicious)
    # Must return None (path traversal blocked)
    assert result is None


def test_from_url_rejects_traversal_in_segment(
    tmp_storage: MediaStorage, tmp_path: Path
) -> None:
    malicious = "/media/courses/../../../etc/shadow"
    result = tmp_storage.from_url(malicious)
    assert result is None


# ── course_dir ─────────────────────────────────────────────────────────────────


def test_course_dir_creates_directory(tmp_storage: MediaStorage) -> None:
    course_id = uuid.uuid4()
    d = tmp_storage.course_dir(course_id)
    assert d.exists()
    assert d.is_dir()
    assert str(course_id) in str(d)


def test_course_dir_idempotent(tmp_storage: MediaStorage) -> None:
    course_id = uuid.uuid4()
    d1 = tmp_storage.course_dir(course_id)
    d2 = tmp_storage.course_dir(course_id)
    assert d1 == d2
