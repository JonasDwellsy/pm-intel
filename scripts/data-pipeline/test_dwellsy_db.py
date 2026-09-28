import os
import unittest

import psycopg

import dwellsy_db

SECRET = os.path.expanduser("~/Documents/Dwellsy/secrets/db_connection.txt")


@unittest.skipUnless(os.path.isfile(SECRET), "no Dwellsy credentials on this machine")
class DwellsyDbConnection(unittest.TestCase):
    def test_session_is_read_only(self):
        rows = dwellsy_db.query("select current_setting('transaction_read_only') as ro")
        self.assertEqual(rows[0]["ro"], "on")

    def test_query_returns_dicts_keyed_by_column(self):
        rows = dwellsy_db.query("select 1 as a, 'x' as b")
        self.assertEqual(rows, [{"a": 1, "b": "x"}])

    def test_writes_are_rejected(self):
        with self.assertRaises(psycopg.errors.ReadOnlySqlTransaction):
            dwellsy_db.query("create temporary table should_not_exist (i int)")

    def test_connection_string_is_never_returned(self):
        # A misconfigured error path must not leak the DSN.
        with self.assertRaises(Exception) as ctx:
            dwellsy_db.query("select * from table_that_does_not_exist_12345")
        self.assertNotIn("password", str(ctx.exception).lower())
        self.assertNotIn("@", str(ctx.exception))
        self.assertIsNone(ctx.exception.__context__)

    def test_stream_yields_all_rows_across_batches(self):
        rows = list(
            dwellsy_db.stream(
                "select g as n from generate_series(1, 7) g", batch_size=3
            )
        )
        self.assertEqual(rows, [{"n": n} for n in range(1, 8)])

    def test_stream_session_is_read_only(self):
        gen = dwellsy_db.stream("select current_setting('transaction_read_only') as ro")
        try:
            self.assertEqual(next(gen), {"ro": "on"})
        finally:
            gen.close()

    def test_stream_errors_are_scrubbed_with_no_chain(self):
        with self.assertRaises(Exception) as ctx:
            next(dwellsy_db.stream("select * from table_that_does_not_exist_12345"))
        self.assertIsNone(ctx.exception.__context__)
        self.assertIsNone(ctx.exception.__cause__)

    def test_stream_early_close_releases_the_connection(self):
        gen = dwellsy_db.stream(
            "select g as n from generate_series(1, 20000) g", batch_size=10
        )
        self.assertEqual(next(gen), {"n": 1})
        gen.close()
        rows = dwellsy_db.query("select 1 as x")
        self.assertEqual(rows, [{"x": 1}])


class DwellsyDbScrub(unittest.TestCase):
    """Unit test for _scrub() directly. No network, no credentials required."""

    def test_scrub_redacts_dsn_shaped_text(self):
        synthetic = "could not connect: postgresql://user:hunter2@db.example.com:5432/x"
        scrubbed = dwellsy_db._scrub(synthetic)
        self.assertNotIn("hunter2", scrubbed)
        self.assertNotIn("db.example.com", scrubbed)

    def test_scrub_redacts_libpq_host_and_user(self):
        msg = ('connection to server at "db.example.com" (10.1.2.3), port 5432 failed: '
               'FATAL:  password authentication failed for user "agent_x"')
        scrubbed = dwellsy_db._scrub(msg)
        self.assertNotIn("db.example.com", scrubbed)
        self.assertNotIn("10.1.2.3", scrubbed)
        self.assertNotIn("agent_x", scrubbed)

    def test_scrub_redacts_could_not_translate_host_name(self):
        msg = ('could not translate host name "db.internal.example.com" to '
               'address: Name or service not known')
        scrubbed = dwellsy_db._scrub(msg)
        self.assertNotIn("db.internal.example.com", scrubbed)
        self.assertIn("could not translate host name", scrubbed)

    def test_scrubbed_preserves_the_exception_type(self):
        # A specific error type (e.g. psycopg.errors.ReadOnlySqlTransaction)
        # must survive _scrubbed unchanged -- only its message is rewritten.
        original = psycopg.errors.ReadOnlySqlTransaction(
            'could not translate host name "db.example.com" to address'
        )
        scrubbed = dwellsy_db._scrubbed(original)
        self.assertIsInstance(scrubbed, psycopg.errors.ReadOnlySqlTransaction)
        self.assertNotIn("db.example.com", str(scrubbed))

    def test_query_error_carries_no_exception_chain(self):
        # Force a failure before any network I/O by pointing the secret at a missing file.
        original = dwellsy_db.SECRET_PATH
        dwellsy_db.SECRET_PATH = "/nonexistent/postgresql://u:hunter2@db.example.com/x"
        try:
            with self.assertRaises(Exception) as ctx:
                dwellsy_db.query("SELECT 1")
        finally:
            dwellsy_db.SECRET_PATH = original
        exc = ctx.exception
        self.assertIsNone(exc.__context__)
        self.assertIsNone(exc.__cause__)
        self.assertNotIn("hunter2", str(exc))


class ConnectRetry(unittest.TestCase):
    """Opening a connection is retried on OperationalError; nothing touches
    the network (psycopg.connect, the secret read and sleep are replaced)."""

    def setUp(self):
        self._orig = (dwellsy_db.psycopg.connect, dwellsy_db._dsn, dwellsy_db.time.sleep)
        dwellsy_db._dsn = lambda: "fake-dsn"
        self.sleeps = []
        dwellsy_db.time.sleep = self.sleeps.append

    def tearDown(self):
        dwellsy_db.psycopg.connect, dwellsy_db._dsn, dwellsy_db.time.sleep = self._orig

    def _connect_failing(self, failures):
        calls = {"n": 0}
        sentinel = object()

        def fake_connect(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] <= failures:
                raise dwellsy_db.psycopg.OperationalError("could not receive data from server")
            return sentinel

        dwellsy_db.psycopg.connect = fake_connect
        return calls, sentinel

    def test_a_transient_failure_is_retried(self):
        calls, sentinel = self._connect_failing(2)
        self.assertIs(dwellsy_db._open_with_retry(), sentinel)
        self.assertEqual(calls["n"], 3)
        self.assertEqual(self.sleeps, list(dwellsy_db.CONNECT_RETRY_DELAYS))

    def test_gives_up_after_the_last_retry(self):
        calls, _ = self._connect_failing(99)
        with self.assertRaises(dwellsy_db.psycopg.OperationalError):
            dwellsy_db._open_with_retry()
        self.assertEqual(calls["n"], len(dwellsy_db.CONNECT_RETRY_DELAYS) + 1)


if __name__ == "__main__":
    unittest.main()
