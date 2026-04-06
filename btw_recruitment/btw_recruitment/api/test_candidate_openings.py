from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from btw_recruitment.btw_recruitment.api.candidate_openings import (
	get_job_openings_for_candidate_dialog,
)


class TestCandidateOpeningsApi(FrappeTestCase):
	def test_search_filter_includes_all_like_placeholders(self):
		sql_calls = []

		def _sql_side_effect(query, values=None, as_dict=False):
			sql_calls.append((query, values, as_dict))
			if "COUNT(*)" in query:
				return [[1]]
			return [{"name": "JOB-001"}] if as_dict else []

		with patch(
			"btw_recruitment.btw_recruitment.api.candidate_openings.frappe.db.sql",
			side_effect=_sql_side_effect,
		):
			result = get_job_openings_for_candidate_dialog(search="python", limit=10, offset=0)

		self.assertEqual(result["total"], 1)
		self.assertEqual(len(result["data"]), 1)
		self.assertEqual(len(sql_calls), 2)

		count_values = sql_calls[0][1]
		list_values = sql_calls[1][1]

		self.assertEqual(len(count_values), 5)
		self.assertEqual(len(list_values), 5)
