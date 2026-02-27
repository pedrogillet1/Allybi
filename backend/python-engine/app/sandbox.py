"""Restricted execution environment for user-supplied expressions.

Uses AST inspection to block dangerous constructs before evaluation.
"""

from __future__ import annotations

import ast
import math
from typing import Any

# Functions / names that are explicitly forbidden at the AST level.
_BLOCKED_MODULES = frozenset({"os", "subprocess", "socket", "sys", "shutil", "pathlib"})
_BLOCKED_BUILTINS = frozenset({"open", "exec", "eval", "compile", "__import__", "globals", "locals"})

# Safe builtins exposed to evaluated expressions.
_SAFE_BUILTINS: dict[str, Any] = {
    "abs": abs,
    "bool": bool,
    "float": float,
    "int": int,
    "len": len,
    "max": max,
    "min": min,
    "round": round,
    "str": str,
    "sum": sum,
    "True": True,
    "False": False,
    "None": None,
    # A few math helpers
    "sqrt": math.sqrt,
    "ceil": math.ceil,
    "floor": math.floor,
    "log": math.log,
    "log10": math.log10,
    "pi": math.pi,
}


class SandboxViolation(Exception):
    """Raised when an expression attempts a forbidden operation."""


def _check_ast(tree: ast.AST) -> None:
    """Walk *tree* and raise :class:`SandboxViolation` on dangerous nodes."""

    for node in ast.walk(tree):
        # Block import statements
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif node.module:
                names = [node.module]
            for name in names:
                top = name.split(".")[0]
                if top in _BLOCKED_MODULES:
                    raise SandboxViolation(f"Import of '{top}' is not allowed")
            # Block all imports in sandbox context
            raise SandboxViolation("Import statements are not allowed in sandbox expressions")

        # Block calls to dangerous builtins
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id in _BLOCKED_BUILTINS:
                raise SandboxViolation(f"Call to '{func.id}()' is not allowed")
            # Block getattr/setattr/delattr on dunder attributes
            if isinstance(func, ast.Attribute) and func.attr.startswith("__"):
                raise SandboxViolation(f"Access to dunder attribute '{func.attr}' is not allowed")

        # Block attribute access to dunders (read)
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise SandboxViolation(f"Access to dunder attribute '{node.attr}' is not allowed")


def safe_eval(expression: str, context: dict[str, Any] | None = None) -> Any:
    """Evaluate *expression* in a restricted environment.

    Parameters
    ----------
    expression:
        A Python expression string (single expression, **not** statements).
    context:
        Additional name bindings available to the expression.

    Returns
    -------
    The result of evaluating *expression*.

    Raises
    ------
    SandboxViolation
        If the expression contains forbidden constructs.
    """
    if not expression or not expression.strip():
        raise ValueError("Expression must not be empty")

    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise SandboxViolation(f"Invalid expression syntax: {exc}") from exc

    _check_ast(tree)

    safe_globals: dict[str, Any] = {"__builtins__": {}}
    safe_globals.update(_SAFE_BUILTINS)
    if context:
        safe_globals.update(context)

    code = compile(tree, filename="<sandbox>", mode="eval")
    return eval(code, safe_globals)  # noqa: S307 — guarded by AST check
