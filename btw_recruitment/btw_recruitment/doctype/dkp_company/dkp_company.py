# Copyright (c) 2025, Sarim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DKP_Company(Document):
	# pass
	def autoname(self):
		self.name = self.company_name.strip()

		def validate(self):
				# Check duplicate company name
				if frappe.db.exists(
					"Company",
					{
						"company_name": self.company_name,
						"name": ["!=", self.name]
					}
				):
					frappe.throw(
						f"Company '{self.company_name}' already exists.",
						frappe.DuplicateEntryError
					)					
