"""Read-only access to the Dwellsy production database.

Operator IQ has its own database account, which lands on a read replica. The
connection string comes from the DWELLSY_DB_URL environment variable (set from
the cloud runner's secret store) or, on a workstation, from
~/Documents/Dwellsy/secrets/operator_iq_db.txt (owner-only). It must never be
printed, logged, or included in an exception message. There is deliberately no
fallback to the shared db_connection.txt used for ad-hoc exploration, so the
pipeline can't drift onto another account unnoticed.

Every session is opened READ ONLY with a statement timeout; this module offers
no way to run a mutating statement.
"""
import os
import re
import time
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

ENV_VAR = "DWELLSY_DB_URL"
SECRET_PATH = os.path.expanduser("~/Documents/Dwellsy/secrets/operator_iq_db.txt")
STATEMENT_TIMEOUT = "120s"
STREAM_BATCH = 5000
# Opening a connection is retried; queries never are. A market pull opens a
# fresh connection per lookup batch (hundreds for Los Angeles), and a single
# transient "could not receive data from server: Operation timed out" at
# connect time would otherwise abort the whole pull. Retrying the connect is
# safe because nothing has run yet, and every session is read-only anyway.
CONNECT_RETRY_DELAYS = (2.0, 5.0)


class MissingCredentials(RuntimeError):
    pass


def has_credentials() -> bool:
    return bool(os.environ.get(ENV_VAR, "").strip()) or os.path.isfile(SECRET_PATH)


def _dsn() -> str:
    from_env = os.environ.get(ENV_VAR, "").strip()
    if from_env:
        return from_env
    if os.path.isfile(SECRET_PATH):
        with open(SECRET_PATH) as fh:
            dsn = fh.read().strip()
        if dsn:
            return dsn
    raise MissingCredentials(
        f"no Dwellsy database connection: set {ENV_VAR}, or save the "
        f"connection string to {SECRET_PATH} (owner-only)"
    )


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
    # psycopg resolves host names itself and reports them single-quoted.
    msg = re.sub(r"host '[^']*'", "host '<redacted>'", msg)
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


def _open_with_retry() -> psycopg.Connection:
    for delay in (*CONNECT_RETRY_DELAYS, None):
        try:
            return psycopg.connect(
                _dsn(),
                row_factory=dict_row,
                autocommit=False,
                options=f"-c default_transaction_read_only=on -c statement_timeout={STATEMENT_TIMEOUT}",
            )
        except psycopg.OperationalError:
            if delay is None:
                raise
            time.sleep(delay)


def connect() -> psycopg.Connection:
    # Session-level defaults set at connect time, on top of (not instead of)
    # the per-transaction SETs below: belt and suspenders. A libpq `options`
    # startup parameter applies before this session runs any SQL at all, so
    # a caller that got a raw connection some other way still can't write or
    # run past the timeout even if the per-transaction SETs below were ever
    # skipped or reordered.
    conn = _open_with_retry()
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
