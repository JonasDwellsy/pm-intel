"""Read-only access to the Dwellsy production database.

The connection string lives in ~/Documents/Dwellsy/secrets/db_connection.txt and
must never be printed, logged, or included in an exception message. Every
session is opened READ ONLY with a statement timeout; this module offers no way
to run a mutating statement.
"""
import os
import re
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

SECRET_PATH = os.path.expanduser("~/Documents/Dwellsy/secrets/db_connection.txt")
STATEMENT_TIMEOUT = "120s"
STREAM_BATCH = 5000


def _dsn() -> str:
    with open(SECRET_PATH) as fh:
        return fh.read().strip()


def _scrub(msg: str) -> str:
    """Remove anything DSN-shaped from an error before it escapes."""
    msg = re.sub(r"postgres(?:ql)?://\S+", "<dsn redacted>", msg)
    msg = re.sub(r"\S+:\S+@\S+", "<dsn redacted>", msg)
    msg = re.sub(r'server at "[^"]*"(?: \([^)]*\))?', "server at <host redacted>", msg)
    msg = re.sub(
        r'could not translate host name "[^"]*"',
        'could not translate host name "<host redacted>"',
        msg,
    )
    return re.sub(r'user "[^"]*"', "user <redacted>", msg)


def _scrubbed(exc: Exception) -> Exception:
    """A same-type copy of exc with DSN-shaped text removed.

    Raise the result OUTSIDE the except block that caught exc: raising inside it
    makes Python attach the original, unscrubbed exception as __context__.
    """
    msg = _scrub(str(exc))
    try:
        return type(exc)(msg)
    except TypeError:
        return RuntimeError(msg)


def connect() -> psycopg.Connection:
    # Session-level defaults set at connect time, on top of (not instead of)
    # the per-transaction SETs below: belt and suspenders. A libpq `options`
    # startup parameter applies before this session runs any SQL at all, so
    # a caller that got a raw connection some other way still can't write or
    # run past the timeout even if the per-transaction SETs below were ever
    # skipped or reordered.
    conn = psycopg.connect(
        _dsn(),
        row_factory=dict_row,
        autocommit=False,
        options=f"-c default_transaction_read_only=on -c statement_timeout={STATEMENT_TIMEOUT}",
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SET TRANSACTION READ ONLY")
            cur.execute(f"SET statement_timeout = '{STATEMENT_TIMEOUT}'")
    except BaseException:
        conn.close()
        raise
    return conn


def query(sql: str, params: dict | None = None) -> list[dict]:
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute(sql, params or {})
            return list(cur.fetchall())
    except Exception as exc:
        err = _scrubbed(exc)
    raise err


def stream(sql: str, params: dict | None = None, batch_size: int = STREAM_BATCH) -> Iterator[dict]:
    """Yield rows through a server-side cursor, batch_size at a time.

    Each FETCH is its own statement, so statement_timeout bounds one batch,
    not the whole market. The session is the same READ ONLY transaction
    connect() opens. Closing the generator early closes the connection.
    """
    err = None
    try:
        with connect() as conn, conn.cursor(name="dwellsy_stream") as cur:
            cur.execute(sql, params or {})
            while True:
                rows = cur.fetchmany(batch_size)
                if not rows:
                    break
                yield from rows
    except Exception as exc:
        err = _scrubbed(exc)
    if err is not None:
        raise err
