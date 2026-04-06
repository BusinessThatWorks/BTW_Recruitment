# Copyright (c) 2025, Sarim and Contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase


class TestDKP_Company(FrappeTestCase):
	def test_validate_checks_duplicate_using_correct_doctype(self):
		doc = frappe.new_doc("DKP_Company")
		doc.name = "Test Co"
		doc.company_name = "Test Co"

		with patch("frappe.db.exists", return_value=False) as exists_mock:
			doc.validate()

		exists_mock.assert_called_once_with(
			"DKP_Company", {"company_name": "Test Co", "name": ["!=", "Test Co"]}
		)

	def test_validate_throws_when_duplicate_company_exists(self):
		doc = frappe.new_doc("DKP_Company")
		doc.name = "Test Co"
		doc.company_name = "Test Co"

		with patch("frappe.db.exists", return_value=True):
			with self.assertRaises(frappe.DuplicateEntryError):
				doc.validate()
