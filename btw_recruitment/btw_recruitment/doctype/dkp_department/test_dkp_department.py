# Copyright (c) 2025, Sarim and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestDKP_Department(FrappeTestCase):
	def test_department_can_be_created(self):
		department_name = f"QA-{frappe.generate_hash(length=6)}"
		doc = frappe.get_doc({"doctype": "DKP_Department", "department": department_name}).insert()

		self.assertEqual(doc.name, department_name)
		self.assertEqual(doc.department, department_name)

	def test_duplicate_department_is_not_allowed(self):
		department_name = f"QA-{frappe.generate_hash(length=6)}"
		frappe.get_doc({"doctype": "DKP_Department", "department": department_name}).insert()

		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({"doctype": "DKP_Department", "department": department_name}).insert()
