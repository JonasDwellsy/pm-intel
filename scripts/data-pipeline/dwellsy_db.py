"""Read-only access to the Dwellsy production database.

The connection string lives in ~/Documents/Dwellsy/secrets/db_connection.txt and
must never be printed, logged, or included in an exception message. Every
session is opened READ ONLY with a statement timeout; this module offers no way
to run a mutating statement.
"""
import os
import re

import psycopg
from psycopg.rows import dict_row

SECRET_PATH = os.path.expanduser("~/Documents/Dwellsy/secrets/db_connection.txt")
STATEMENT_TIMEOUT = "120s"


def _dsn() -> str:
    with open(SECRET_PATH) as fh:
        return fh.read().strip()


def _scrub(msg: str) -> str:
    """Remove anything DSN-shaped from an error before it escapes."""
    msg = re.sub(r"postgres(?:ql)?://\S+", "<dsn redacted>", msg)
    return re.sub(r"\S+:\S+@\S+", "<dsn redacted>", msg)


def connect() -> psycopg.Connection:
    conn = psycopg.connect(_dsn(), row_factory=dict_row, autocommit=False)
    with conn.cursor() as cur:
        cur.execute("SET TRANSACTION READ ONLY")
        cur.execute(f"SET statement_timeout = '{STATEMENT_TIMEOUT}'")
    return conn


def query(sql: str, params: dict | None = None) -> list[dict]:
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute(sql, params or {})
            return list(cur.fetchall())
    except Exception as exc:
        raise type(exc)(_scrub(str(exc))) from None
