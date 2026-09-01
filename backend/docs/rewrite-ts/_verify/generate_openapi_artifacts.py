"""Deterministically render the checked-in OpenAPI contract artifacts.

Run from ``backend``:
    uv run python docs/rewrite-ts/_verify/generate_openapi_artifacts.py
    uv run python docs/rewrite-ts/_verify/generate_openapi_artifacts.py --check

The generator reads only the live FastAPI app and the explicit mapping rules in
this module. It never treats generated artifacts as source metadata.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
from collections.abc import Mapping
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[3]
DOCS = ROOT / "docs" / "rewrite-ts"
MANIFEST = DOCS / "types" / "endpoint-manifest.json"
SCHEMAS = DOCS / "types" / "openapi-schemas.d.ts"
sys.path.insert(0, str(ROOT))
os.environ.setdefault("APP_ENV", "development")

from fastapi.routing import APIRoute  # noqa: E402
from app.main import app  # noqa: E402

METHODS = ("get", "post", "put", "patch", "delete")
GENERATED_FROM = (
    "app.openapi() plus app.routes include_in_schema=False; regenerate with "
    "docs/rewrite-ts/_verify/generate_openapi_artifacts.py"
)
TAG_CHAPTERS = {
    "Xác thực": "20-endpoints-auth-users.md",
    "Người dùng": "20-endpoints-auth-users.md",
    "Sức khỏe hệ thống": "20-endpoints-auth-users.md",
    "Premium": "21-endpoints-premium-thanh-toan.md",
    "Admin - IPN Logs": "21b-endpoints-quan-tri-thanh-toan.md",
    "Admin - Payments": "21b-endpoints-quan-tri-thanh-toan.md",
    "Admin - Subscriptions": "21b-endpoints-quan-tri-thanh-toan.md",
    "Dữ liệu thị trường: Báo giá": "22-endpoints-market-tham-chieu-bao-gia.md",
    "Dữ liệu thị trường: Bộ lọc cổ phiếu": "22-endpoints-market-tham-chieu-bao-gia.md",
    "Dữ liệu thị trường: Tham chiếu": "22-endpoints-market-tham-chieu-bao-gia.md",
    "Dữ liệu thị trường: Công ty": "23-endpoints-market-cong-ty-giao-dich.md",
    "Dữ liệu thị trường: Giao dịch": "23-endpoints-market-cong-ty-giao-dich.md",
    "Dữ liệu thị trường: Ngành": "24-endpoints-market-tong-quan-nganh.md",
    "Dữ liệu thị trường: Phân tích": "24-endpoints-market-tong-quan-nganh.md",
    "Dữ liệu thị trường: Tổng quan": "24-endpoints-market-tong-quan-nganh.md",
    "Dữ liệu thị trường: Google Sheets": "25-endpoints-market-vi-mo-quoc-te-quy.md",
    "Dữ liệu thị trường: Quốc tế": "25-endpoints-market-vi-mo-quoc-te-quy.md",
    "Dữ liệu thị trường: Quỹ": "25-endpoints-market-vi-mo-quoc-te-quy.md",
    "Dữ liệu thị trường: Sự kiện": "25-endpoints-market-vi-mo-quoc-te-quy.md",
    "Dữ liệu thị trường: Vĩ mô": "25-endpoints-market-vi-mo-quoc-te-quy.md",
    "Dữ liệu thị trường: Tin AI": "26-endpoints-market-tin-tuc.md",
    "Dữ liệu thị trường: Tin tức": "26-endpoints-market-tin-tuc.md",
    "Dữ liệu thị trường: Cơ bản": "27-endpoints-market-bctc.md",
    "Nhận định thị trường": "28-endpoints-nhan-dinh-thi-truong.md",
    "AI Mô hình dự báo": "29-endpoints-ai.md",
    "AI Mẫu hình": "29-endpoints-ai.md",
    "AI Phân tích": "29-endpoints-ai.md",
    "Quản lý danh mục": "30-endpoints-quan-ly-danh-muc.md",
    "Giao dịch ảo": "31-endpoints-giao-dich-ao.md",
    "Giao dịch ảo (quản trị)": "31-endpoints-giao-dich-ao.md",
    "Quản trị: Giao dịch ảo": "31-endpoints-giao-dich-ao.md",
    "Cấp 0": "32-endpoints-cap-0-2.md",
    "Cấp 1": "32-endpoints-cap-0-2.md",
    "Cấp 2": "32-endpoints-cap-0-2.md",
    "Cấp 3": "33-endpoints-cap-3-4.md",
    "Cấp 4": "33-endpoints-cap-3-4.md",
    "Cấp 5": "34-endpoints-cap-5-6.md",
    "Cấp 6": "34-endpoints-cap-5-6.md",
    "Cấp 7": "35-endpoints-cap-7-8.md",
    "Cấp 8": "35-endpoints-cap-7-8.md",
    "Backtest": "36-endpoints-watchlist-ban-ve-backtest.md",
    "Bản vẽ biểu đồ": "36-endpoints-watchlist-ban-ve-backtest.md",
    "Danh mục theo dõi": "36-endpoints-watchlist-ban-ve-backtest.md",
    "Admin · Cảnh báo": "37-endpoints-canh-bao-telegram.md",
    "Cảnh báo": "37-endpoints-canh-bao-telegram.md",
    "Telegram": "37-endpoints-canh-bao-telegram.md",
    "Bài học": "38-endpoints-bai-hoc.md",
    "Quản trị: Bài học": "38-endpoints-bai-hoc.md",
    "Admin - Audit": "39-endpoints-quan-tri.md",
    "Quản trị: Hệ thống": "39-endpoints-quan-tri.md",
    "Quản trị: Người dùng": "39-endpoints-quan-tri.md",
    "Quản trị: Số liệu": "39-endpoints-quan-tri.md",
}
HIDDEN_ROUTES: dict[tuple[str, str], dict[str, Any]] = {
    ("GET", "/api/v1/auth/reset-password"): {
        "tag": "Xác thực",
        "operationId": "reset_password_page_api_v1_auth_reset_password_get",
        "summary": "Trang đặt lại mật khẩu",
        "auth": False,
        "chapter": "20-endpoints-auth-users.md",
        "pathParams": [],
        "queryParams": [{"name": "token", "required": False, "schema": {"type": "string"}}],
        "hasBody": False,
        "statuses": ["200"],
        "hiddenFromOpenApi": True,
    },
    ("GET", "/api/v1/auth/verify-email"): {
        "tag": "Xác thực",
        "operationId": "verify_email_page_api_v1_auth_verify_email_get",
        "summary": "Trang xác thực email",
        "auth": False,
        "chapter": "20-endpoints-auth-users.md",
        "pathParams": [],
        "queryParams": [{"name": "token", "required": False, "schema": {"type": "string"}}],
        "hasBody": False,
        "statuses": ["200"],
        "hiddenFromOpenApi": True,
    },
}


def operation_parameters(operation: Mapping[str, Any], location: str) -> list[dict[str, Any]]:
    return [
        {
            "name": parameter["name"],
            "required": bool(parameter.get("required", False)),
            "schema": parameter.get("schema", {}),
        }
        for parameter in operation.get("parameters", [])
        if parameter.get("in") == location
    ]


def live_operations(spec: Mapping[str, Any]) -> list[dict[str, Any]]:
    operations: list[dict[str, Any]] = []
    for path in sorted(spec["paths"]):
        path_item = spec["paths"][path]
        for method in METHODS:
            operation = path_item.get(method)
            if operation is None:
                continue
            tag = (operation.get("tags") or [""])[0]
            try:
                chapter = TAG_CHAPTERS[tag]
            except KeyError as error:
                raise RuntimeError(f"No chapter rule for tag {tag!r} on {method.upper()} {path}") from error
            operations.append(
                {
                    "method": method.upper(),
                    "path": path,
                    "tag": tag,
                    "operationId": operation.get("operationId", ""),
                    "summary": operation.get("summary", ""),
                    "auth": bool(operation.get("security")),
                    "chapter": chapter,
                    "pathParams": operation_parameters(operation, "path"),
                    "queryParams": operation_parameters(operation, "query"),
                    "hasBody": "requestBody" in operation,
                    "statuses": sorted(operation.get("responses", {})),
                }
            )
    for (method, path), hidden in HIDDEN_ROUTES.items():
        operations.append({"method": method, "path": path, **hidden})
    live_routes = {
        (method, route.path)
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods
        if method not in {"HEAD", "OPTIONS"}
    }
    generated_routes = {(operation["method"], operation["path"]) for operation in operations}
    if generated_routes != live_routes:
        raise RuntimeError(f"Unmapped live routes: {sorted(live_routes - generated_routes)}")
    return sorted(operations, key=lambda operation: (operation["chapter"], operation["path"], operation["method"]))


def render_manifest(spec: Mapping[str, Any]) -> str:
    return json.dumps(
        {"generatedFrom": GENERATED_FROM, "operations": live_operations(spec)},
        ensure_ascii=False,
        indent=2,
    ) + "\n"


def schema_type(schema: Mapping[str, Any]) -> str:
    if schema.get("nullable") is True:
        non_nullable = dict(schema)
        non_nullable.pop("nullable")
        return f"{schema_type(non_nullable)} | null"
    if "$ref" in schema:
        return str(schema["$ref"]).rsplit("/", 1)[-1]
    if "const" in schema:
        return json.dumps(schema["const"], ensure_ascii=False)
    if "enum" in schema:
        return " | ".join(json.dumps(value, ensure_ascii=False) for value in schema["enum"])
    if "allOf" in schema:
        return " & ".join(schema_type(item) for item in schema["allOf"])
    for union_key in ("anyOf", "oneOf"):
        if union_key in schema:
            return " | ".join(schema_type(item) for item in schema[union_key])
    schema_type_name = schema.get("type")
    if schema_type_name == "null":
        return "null"
    if schema_type_name == "string":
        return {
            "uuid": "UUID",
            "date": "IsoDate",
            "date-time": "IsoDateTime",
        }.get(schema.get("format"), "string")
    if schema_type_name in {"integer", "number"}:
        return "number"
    if schema_type_name == "boolean":
        return "boolean"
    if schema_type_name == "array":
        item_type = schema_type(schema.get("items", {}))
        return f"({item_type})[]" if " | " in item_type else f"{item_type}[]"
    if schema_type_name == "object" or "properties" in schema or "additionalProperties" in schema:
        required = set(schema.get("required", []))
        fields = [
            f"{name}{'' if name in required else '?'}: {schema_type(value)};"
            for name, value in sorted(schema.get("properties", {}).items())
        ]
        additional = schema.get("additionalProperties")
        if isinstance(additional, Mapping):
            fields.append(f"[key: string]: {schema_type(additional)};")
        elif additional is True:
            fields.append("[key: string]: unknown;")
        return "{ " + " ".join(fields) + " }"
    return "unknown"


def schema_comment(description: object) -> list[str]:
    if not isinstance(description, str) or not description.strip():
        return []
    escaped = description.replace("*/", "* /").splitlines()
    return ["/**", *(f" * {line}" if line else " *" for line in escaped), " */"]


def render_schemas(spec: Mapping[str, Any]) -> str:
    schemas = spec.get("components", {}).get("schemas", {})
    lines = [
        "/**",
        " * IQX Backend — TypeScript declarations generated from the live FastAPI OpenAPI schema.",
        " * Do not edit by hand; regenerate with `uv run python docs/rewrite-ts/_verify/generate_openapi_artifacts.py`.",
        " */",
        "",
        "export type UUID = string;",
        "export type IsoDateTime = string;",
        "export type IsoDate = string;",
        "export type SessionDate = string;",
        "export type DecimalString = string;",
        "",
    ]
    for name, schema in sorted(schemas.items()):
        lines.extend(schema_comment(schema.get("description")))
        lines.append(f"export type {name} = {schema_type(schema)};")
        lines.append("")
    return "\n".join(lines)


def expected_artifacts() -> dict[pathlib.Path, str]:
    spec = app.openapi()
    return {MANIFEST: render_manifest(spec), SCHEMAS: render_schemas(spec)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail when checked-in artifacts are stale")
    args = parser.parse_args()
    expected = expected_artifacts()
    stale = [path for path, contents in expected.items() if path.read_text() != contents]
    if args.check:
        if stale:
            print("Stale generated artifacts:", *(str(path.relative_to(ROOT)) for path in stale), sep="\n")
            return 1
        return 0
    for path, contents in expected.items():
        path.write_text(contents)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
