#!/usr/bin/env python3
"""Generate the legacy FastAPI route baseline without importing legacy code.

Only Python's AST and source files are read.  This deliberately avoids importing
``backend/app`` because doing so would load settings, ``.env`` files and provider
initialisation as a side effect.
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY_ROUTER = REPO_ROOT / "backend/app/api/v1/router.py"
ENDPOINTS_DIR = REPO_ROOT / "backend/app/api/v1/endpoints"
OUTPUT = REPO_ROOT / "backend-v2/contracts/legacy-v1-endpoints.json"
DISPOSITIONS = REPO_ROOT / "backend-v2/contracts/legacy-v1-dispositions.json"

HTTP_DECORATORS = {
    "get": ["GET"],
    "post": ["POST"],
    "put": ["PUT"],
    "patch": ["PATCH"],
    "delete": ["DELETE"],
    "options": ["OPTIONS"],
    "head": ["HEAD"],
    "trace": ["TRACE"],
}
ROUTE_DECORATORS = {*HTTP_DECORATORS, "api_route", "websocket"}
UNSUPPORTED_REGISTRATION_METHODS = {
    "add_api_route",
    "add_api_websocket_route",
    "route",
    "websocket_route",
    "include_router",
}


class ContractExtractionError(RuntimeError):
    """Raised rather than silently omitting a route we cannot prove statically."""


@dataclass(frozen=True)
class MountedRouter:
    module: str
    source: Path
    prefix: str


def parse_file(path: Path) -> ast.Module:
    try:
        return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except (OSError, SyntaxError) as error:
        raise ContractExtractionError(f"Cannot parse {path}: {error}") from error


def keyword(call: ast.Call, name: str) -> ast.expr | None:
    for item in call.keywords:
        if item.arg == name:
            return item.value
        if item.arg is None:
            raise ContractExtractionError(
                f"Dynamic **kwargs are unsupported at line {getattr(item, 'lineno', '?')}"
            )
    return None


def static_string(node: ast.expr, *, context: str) -> str:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    raise ContractExtractionError(f"{context} must be a string literal, got {ast.unparse(node)!r}")


def static_bool(node: ast.expr, *, context: str) -> bool:
    if isinstance(node, ast.Constant) and isinstance(node.value, bool):
        return node.value
    raise ContractExtractionError(f"{context} must be a bool literal, got {ast.unparse(node)!r}")


def static_string_list(node: ast.expr, *, context: str) -> list[str]:
    if not isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        raise ContractExtractionError(f"{context} must be a literal list of strings")
    return [static_string(value, context=context) for value in node.elts]


def join_route_path(*parts: str) -> str:
    non_empty = [part.strip("/") for part in parts if part.strip("/")]
    return "/" + "/".join(non_empty)


def aggregate_modules() -> list[str]:
    """Resolve only ``endpoints.<module>.router`` mounted by the v1 aggregator."""

    tree = parse_file(LEGACY_ROUTER)
    imports: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "app.api.v1.endpoints":
            for imported in node.names:
                imports[imported.asname or imported.name] = imported.name

    aggregate_declarations = [
        (target.id, node.value)
        for node in tree.body
        if isinstance(node, (ast.Assign, ast.AnnAssign))
        for target in (
            node.targets if isinstance(node, ast.Assign) else [node.target]
        )
        if isinstance(target, ast.Name)
        and isinstance(node.value, ast.Call)
        and isinstance(node.value.func, ast.Name)
        and node.value.func.id == "APIRouter"
    ]
    aggregate_names = {name for name, _ in aggregate_declarations}
    if aggregate_names != {"api_v1_router"} or len(aggregate_declarations) != 1:
        raise ContractExtractionError(
            f"Expected exactly api_v1_router in {LEGACY_ROUTER}, found {sorted(aggregate_names)}"
        )
    aggregate_call = aggregate_declarations[0][1]
    prefix_node = keyword(aggregate_call, "prefix")
    if prefix_node is None or static_string(
        prefix_node, context=f"aggregate prefix in {LEGACY_ROUTER}"
    ) != "/api/v1":
        raise ContractExtractionError("The legacy aggregate prefix must be the literal '/api/v1'")

    modules: list[str] = []
    recognised_calls: set[int] = set()
    for statement in tree.body:
        if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
            continue
        node = statement.value
        if not isinstance(node.func, ast.Attribute):
            continue
        if not isinstance(node.func.value, ast.Name) or node.func.value.id != "api_v1_router":
            continue
        if node.func.attr != "include_router":
            if node.func.attr in ROUTE_DECORATORS | UNSUPPORTED_REGISTRATION_METHODS:
                raise ContractExtractionError(
                    f"Unsupported aggregate route registration api_v1_router.{node.func.attr} "
                    f"at {LEGACY_ROUTER}:{node.lineno}"
                )
            continue
        recognised_calls.add(id(node))
        if len(node.args) != 1 or not isinstance(node.args[0], ast.Attribute):
            raise ContractExtractionError(
                f"Dynamic include_router at {LEGACY_ROUTER}:{node.lineno} is unsupported"
            )
        reference = node.args[0]
        if reference.attr != "router" or not isinstance(reference.value, ast.Name):
            raise ContractExtractionError(
                f"Expected <endpoint_module>.router at {LEGACY_ROUTER}:{node.lineno}"
            )
        local_name = reference.value.id
        if local_name not in imports:
            raise ContractExtractionError(
                f"Mounted router {local_name!r} is not a static endpoints import"
            )
        if len(node.keywords) > 0:
            raise ContractExtractionError(
                f"include_router options at {LEGACY_ROUTER}:{node.lineno} need explicit support"
            )
        modules.append(imports[local_name])

    for call in (node for node in ast.walk(tree) if isinstance(node, ast.Call)):
        if not isinstance(call.func, ast.Attribute):
            continue
        if not isinstance(call.func.value, ast.Name) or call.func.value.id != "api_v1_router":
            continue
        if call.func.attr in ROUTE_DECORATORS | UNSUPPORTED_REGISTRATION_METHODS:
            if id(call) not in recognised_calls:
                raise ContractExtractionError(
                    f"Dynamic or nested api_v1_router.{call.func.attr} at "
                    f"{LEGACY_ROUTER}:{call.lineno} is unsupported"
                )

    if len(modules) != len(set(modules)):
        raise ContractExtractionError("The v1 aggregate mounts a router more than once")
    if not modules:
        raise ContractExtractionError("The v1 aggregate mounts no endpoint routers")
    return modules


def router_from_module(module: str) -> tuple[MountedRouter, ast.Module]:
    source = ENDPOINTS_DIR / f"{module}.py"
    if not source.is_file():
        raise ContractExtractionError(f"Mounted endpoint module is missing: {source}")
    tree = parse_file(source)
    declarations: list[ast.Call] = []
    for node in tree.body:
        if not isinstance(node, (ast.Assign, ast.AnnAssign)) or node.value is None:
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        if not any(isinstance(target, ast.Name) and target.id == "router" for target in targets):
            continue
        if not isinstance(node.value, ast.Call):
            raise ContractExtractionError(f"router in {source} is not a static APIRouter call")
        call = node.value
        if not isinstance(call.func, ast.Name) or call.func.id != "APIRouter":
            raise ContractExtractionError(f"router in {source} is not APIRouter(...)")
        declarations.append(call)
    if len(declarations) != 1:
        raise ContractExtractionError(
            f"Expected one router = APIRouter(...) in {source}, found {len(declarations)}"
        )
    call = declarations[0]
    prefix_node = keyword(call, "prefix")
    prefix = "" if prefix_node is None else static_string(prefix_node, context=f"router prefix in {source}")
    return MountedRouter(module=module, source=source, prefix=prefix), tree


def decorator_call(decorator: ast.expr) -> ast.Call | None:
    if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
        return None
    owner = decorator.func.value
    if not isinstance(owner, ast.Name) or owner.id != "router":
        return None
    if decorator.func.attr not in ROUTE_DECORATORS:
        return None
    return decorator


def route_methods(call: ast.Call, decorator_name: str, *, source: Path) -> tuple[str, list[str]]:
    if len(call.args) != 1:
        raise ContractExtractionError(
            f"router.{decorator_name} at {source}:{call.lineno} must have one literal path argument"
        )
    path = static_string(call.args[0], context=f"route path at {source}:{call.lineno}")
    if decorator_name in HTTP_DECORATORS:
        return path, HTTP_DECORATORS[decorator_name]
    if decorator_name == "websocket":
        return path, ["WEBSOCKET"]
    methods_node = keyword(call, "methods")
    if methods_node is None:
        return path, ["GET"]
    methods = [method.upper() for method in static_string_list(
        methods_node, context=f"api_route methods at {source}:{call.lineno}"
    )]
    if not methods:
        raise ContractExtractionError(f"api_route methods cannot be empty at {source}:{call.lineno}")
    return path, methods


def auth_hint(function: ast.FunctionDef | ast.AsyncFunctionDef, call: ast.Call) -> dict[str, Any]:
    fragments: list[str] = []
    for argument in [*function.args.posonlyargs, *function.args.args, *function.args.kwonlyargs]:
        if argument.annotation is not None:
            fragments.append(ast.unparse(argument.annotation))
    for default in [*function.args.defaults, *function.args.kw_defaults]:
        if default is not None:
            fragments.append(ast.unparse(default))
    dependencies = keyword(call, "dependencies")
    if dependencies is not None:
        fragments.append(ast.unparse(dependencies))
    evidence = sorted({fragment for fragment in fragments if any(
        marker.lower() in fragment.lower()
        for marker in (
            "AdminUser", "PremiumUser", "CurrentUser", "OptionalUser",
            "get_current", "require_auth", "require_premium", "require_admin",
        )
    )})
    joined = " ".join(evidence).lower()
    if "adminuser" in joined or "get_current_admin" in joined or "require_admin" in joined:
        level = "admin"
    elif "premiumuser" in joined or "require_premium" in joined:
        level = "premium"
    elif "optionaluser" in joined or "optional_user" in joined:
        level = "optional"
    elif "currentuser" in joined or "get_current_user" in joined or "require_auth" in joined:
        level = "authenticated"
    else:
        # Absence of a recognised dependency is not proof that an endpoint is public.
        level = "unknown"
    return {"level": level, "evidence": evidence}


def response_model_hint(
    function: ast.FunctionDef | ast.AsyncFunctionDef, call: ast.Call
) -> dict[str, str] | None:
    response_model = keyword(call, "response_model")
    if response_model is not None:
        return {"source": "decorator", "expression": ast.unparse(response_model)}
    if function.returns is not None:
        return {"source": "returnAnnotation", "expression": ast.unparse(function.returns)}
    return None


def extract_routes(router: MountedRouter, tree: ast.Module) -> list[dict[str, Any]]:
    routes: list[dict[str, Any]] = []
    recognised_calls: set[int] = set()
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            call = decorator_call(decorator)
            if call is None:
                continue
            recognised_calls.add(id(call))
            assert isinstance(call.func, ast.Attribute)
            decorator_name = call.func.attr
            path, methods = route_methods(call, decorator_name, source=router.source)
            include_node = keyword(call, "include_in_schema")
            include_in_schema = (
                True
                if include_node is None
                else static_bool(include_node, context=f"include_in_schema at {router.source}:{call.lineno}")
            )
            for method in methods:
                route: dict[str, Any] = {
                    "method": method,
                    "path": join_route_path("/api/v1", router.prefix, path),
                    "protocol": "websocket" if method == "WEBSOCKET" else "http",
                    "includeInSchema": include_in_schema,
                    "authHint": auth_hint(node, call),
                    "responseModelHint": None if method == "WEBSOCKET" else response_model_hint(node, call),
                    "source": {
                        "file": router.source.relative_to(REPO_ROOT).as_posix(),
                        "line": call.lineno,
                        "handler": node.name,
                    },
                    "router": {"module": router.module, "prefix": router.prefix},
                }
                routes.append(route)

    for call in (node for node in ast.walk(tree) if isinstance(node, ast.Call)):
        if not isinstance(call.func, ast.Attribute):
            continue
        if not isinstance(call.func.value, ast.Name) or call.func.value.id != "router":
            continue
        registration = call.func.attr
        if registration in ROUTE_DECORATORS and id(call) not in recognised_calls:
            raise ContractExtractionError(
                f"Route registration outside a function decorator at {router.source}:{call.lineno}"
            )
        if registration in UNSUPPORTED_REGISTRATION_METHODS:
            raise ContractExtractionError(
                f"Unsupported router.{registration} at {router.source}:{call.lineno}"
            )
    if not routes:
        raise ContractExtractionError(f"Mounted router {router.module} contains no routes")
    return routes


def read_dispositions(valid_route_keys: set[str]) -> dict[str, Any]:
    try:
        contents = json.loads(DISPOSITIONS.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ContractExtractionError(f"Cannot read disposition file {DISPOSITIONS}: {error}") from error
    if contents.get("defaultDisposition") != "pending":
        raise ContractExtractionError("Disposition default must be 'pending'")
    overrides = contents.get("overrides")
    if not isinstance(overrides, dict):
        raise ContractExtractionError("Disposition overrides must be an object")
    unknown = set(overrides) - valid_route_keys
    if unknown:
        raise ContractExtractionError(f"Disposition entries do not match legacy routes: {sorted(unknown)}")
    allowed = {"pending", "implemented", "deprecated", "retained"}
    for key, value in overrides.items():
        if not isinstance(value, dict) or value.get("disposition") not in allowed:
            raise ContractExtractionError(f"Invalid disposition for {key}")
        if value["disposition"] == "implemented" and not value.get("replacement"):
            raise ContractExtractionError(f"Implemented route {key} requires a replacement")
    return contents


def render() -> str:
    modules = aggregate_modules()
    routes: list[dict[str, Any]] = []
    for module in modules:
        router, tree = router_from_module(module)
        routes.extend(extract_routes(router, tree))
    routes.sort(key=lambda route: (route["path"], route["method"], route["source"]["file"]))

    keys = [f'{route["method"]} {route["path"]}' for route in routes]
    duplicates = sorted({key for key in keys if keys.count(key) > 1})
    if duplicates:
        raise ContractExtractionError(f"Duplicate mounted route keys: {duplicates}")
    read_dispositions(set(keys))

    http_count = sum(route["protocol"] == "http" for route in routes)
    websocket_count = sum(route["protocol"] == "websocket" for route in routes)
    document = {
        "schemaVersion": 1,
        "generatedBy": "backend-v2/scripts/generate-legacy-contract.py",
        "source": "backend/app/api/v1/router.py (static AST; legacy application is never imported)",
        "counts": {
            "routers": len(modules),
            "routes": len(routes),
            "http": http_count,
            "websocket": websocket_count,
        },
        "routes": routes,
    }
    return json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail when the committed snapshot has drifted")
    args = parser.parse_args()
    try:
        expected = render()
    except ContractExtractionError as error:
        print(f"legacy contract extraction failed: {error}", file=sys.stderr)
        return 2

    if args.check:
        try:
            actual = OUTPUT.read_text(encoding="utf-8")
        except OSError as error:
            print(f"legacy contract snapshot missing: {error}", file=sys.stderr)
            return 1
        if actual != expected:
            print(
                "legacy contract snapshot is stale; run "
                "`python3 backend-v2/scripts/generate-legacy-contract.py`",
                file=sys.stderr,
            )
            return 1
        print("legacy contract snapshot is current")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(expected, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
