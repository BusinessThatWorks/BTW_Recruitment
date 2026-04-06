# Copyright (c) 2026, Sarim and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestDKP_Joining_Tracker(FrappeTestCase):
	def test_autoname_uses_interview_reference(self):
		doc = frappe.new_doc("DKP_Joining_Tracker")
		doc.interview_ref = "INT-0001"

		doc.autoname()

		self.assertEqual(doc.name, "INT-0001")

	def test_extract_days_from_policy_parses_number(self):
		doc = frappe.new_doc("DKP_Joining_Tracker")

		self.assertEqual(doc.extract_days_from_policy("30"), 30)
		self.assertEqual(doc.extract_days_from_policy("60 days"), 60)
		self.assertEqual(doc.extract_days_from_policy("none"), 0)
