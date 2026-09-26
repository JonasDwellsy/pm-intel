import os
import unittest

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
        with self.assertRaises(Exception):
            dwellsy_db.query("create temporary table should_not_exist (i int)")

    def test_connection_string_is_never_returned(self):
        # A misconfigured error path must not leak the DSN.
        with self.assertRaises(Exception) as ctx:
            dwellsy_db.query("select * from table_that_does_not_exist_12345")
        self.assertNotIn("password", str(ctx.exception).lower())
        self.assertNotIn("@", str(ctx.exception))
        self.assertIsNone(ctx.exception.__context__)


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


if __name__ == "__main__":
    unittest.main()
