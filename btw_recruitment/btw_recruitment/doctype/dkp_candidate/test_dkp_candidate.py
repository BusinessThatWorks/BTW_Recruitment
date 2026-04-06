# Copyright (c) 2025, Sarim and Contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase


class TestDKP_Candidate(FrappeTestCase):
	def test_before_insert_sets_added_by_when_missing(self):
		doc = frappe.new_doc("DKP_Candidate")
		doc.candidate_name = "Test Candidate"
		doc.added_by = None

		with patch(
			"btw_recruitment.btw_recruitment.doctype.dkp_candidate.dkp_candidate.frappe.session",
			frappe._dict(user="qa.user@example.com"),
		):
			doc.before_insert()

		self.assertEqual(doc.added_by, "qa.user@example.com")

	def test_validate_throws_on_duplicate_email_or_phone(self):
		doc = frappe.new_doc("DKP_Candidate")
		doc.name = "CAND-0001"
		doc.email = "dup@example.com"
		doc.mobile_number = "9999999999"

		with patch("frappe.db.sql", return_value=[("CAND-0002",)]):
			with self.assertRaises(frappe.ValidationError):
				doc.validate()

	def test_validate_passes_when_no_duplicate_found(self):
		doc = frappe.new_doc("DKP_Candidate")
		doc.name = "CAND-0003"
		doc.email = "unique@example.com"
		doc.mobile_number = "8888888888"

		with patch("frappe.db.sql", return_value=[]):
			doc.validate()
