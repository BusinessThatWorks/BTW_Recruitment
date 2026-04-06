# Copyright (c) 2025, Sarim and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestDKP_Job_Opening(FrappeTestCase):
	def test_get_field_changes_tracks_real_changes_only(self):
		doc = frappe.new_doc("DKP_Job_Opening")
		doc.designation = "Backend Engineer"
		doc.status = "Open"
		doc.notes = "Updated notes"

		previous_doc = frappe._dict(
			{
				"designation": "Frontend Engineer",
				"status": "Open",
				"notes": "",
			}
		)

		changes = doc.get_field_changes(previous_doc)

		self.assertTrue(any(c["field"] == "Designation" for c in changes))
		self.assertTrue(any(c["field"] == "Additional Information" for c in changes))
		self.assertFalse(any(c["field"] == "Status" for c in changes))

	def test_get_candidate_table_changes_detects_added_removed_modified(self):
		doc = frappe.new_doc("DKP_Job_Opening")
		doc.candidates_table = [
			frappe._dict(
				{
					"candidate_name": "CAND-2",
					"stage": "Screening",
					"sub_stages_interview": "",
					"remarks": "",
					"added_by": "recruiter@example.com",
				}
			),
			frappe._dict(
				{
					"candidate_name": "CAND-3",
					"stage": "Interview",
					"sub_stages_interview": "Round 1",
					"remarks": "Strong profile",
					"added_by": "recruiter@example.com",
				}
			),
		]

		previous_doc = frappe._dict(
			{
				"candidates_table": [
					frappe._dict(
						{
							"candidate_name": "CAND-1",
							"stage": "Screening",
							"sub_stages_interview": "",
							"remarks": "",
							"added_by": "old@example.com",
						}
					),
					frappe._dict(
						{
							"candidate_name": "CAND-3",
							"stage": "Screening",
							"sub_stages_interview": "",
							"remarks": "",
							"added_by": "recruiter@example.com",
						}
					),
				]
			}
		)

		changes = doc.get_candidate_table_changes(previous_doc)

		self.assertIn("CAND-2", [row["candidate"] for row in changes["added"]])
		self.assertIn("CAND-1", [row["candidate"] for row in changes["removed"]])
		self.assertIn("CAND-3", [row["candidate"] for row in changes["modified"]])

	def test_get_recruiter_changes_returns_none_when_unchanged(self):
		doc = frappe.new_doc("DKP_Job_Opening")
		doc.assign_recruiter = [frappe._dict({"recruiter_name": "a@example.com"})]

		previous_doc = frappe._dict(
			{
				"assign_recruiter": [frappe._dict({"recruiter_name": "a@example.com"})],
			}
		)

		self.assertIsNone(doc.get_recruiter_changes(previous_doc))
