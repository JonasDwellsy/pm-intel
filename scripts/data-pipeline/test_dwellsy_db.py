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


class DwellsyDbScrub(unittest.TestCase):
    """Unit test for _scrub() directly. No network, no credentials required."""

    def test_scrub_redacts_dsn_shaped_text(self):
        synthetic = "could not connect: postgresql://user:hunter2@db.example.com:5432/x"
        scrubbed = dwellsy_db._scrub(synthetic)
        self.assertNotIn("hunter2", scrubbed)
        self.assertNotIn("db.example.com", scrubbed)


if __name__ == "__main__":
    unittest.main()
