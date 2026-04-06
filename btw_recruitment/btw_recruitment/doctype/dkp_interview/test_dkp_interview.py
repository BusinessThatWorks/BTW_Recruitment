# Copyright (c) 2025, Sarim and Contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from btw_recruitment.btw_recruitment.doctype.dkp_interview.dkp_interview import (
	check_interview_freeze_status,
)


class TestDKP_Interview(FrappeTestCase):
	def test_extract_days_from_policy_supports_numeric_text(self):
		doc = frappe.new_doc("DKP_Interview")

		self.assertEqual(doc.extract_days_from_policy("60"), 60)
		self.assertEqual(doc.extract_days_from_policy("90 days replacement"), 90)
		self.assertEqual(doc.extract_days_from_policy("no policy"), 0)

	def test_check_interview_freeze_status_for_bill_sent(self):
		interview_doc = frappe._dict({"stage": "Joined", "joining_date": None, "job_opening": None})

		with (
			patch(
				"btw_recruitment.btw_recruitment.doctype.dkp_interview.dkp_interview.frappe.get_doc",
				return_value=interview_doc,
			),
			patch(
				"btw_recruitment.btw_recruitment.doctype.dkp_interview.dkp_interview.frappe.db.get_value",
				return_value=frappe._dict({"billing_status": "Bill Sent"}),
			),
		):
			result = check_interview_freeze_status("INT-0001")

		self.assertTrue(result["is_frozen"])
		self.assertEqual(result["freeze_type"], "bill_sent")
		self.assertIn("stage", result["allowed_fields"])
		self.assertIn("candidate_left_date", result["allowed_fields"])
