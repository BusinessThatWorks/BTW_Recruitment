# Copyright (c) 2025, Sarim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DKP_Department(Document):
	pass
	# def before_insert(self):
	# 	if self.department:
			
	# 			dept_name = self.department.strip()

	# 			if frappe.db.exists("DKP_Department", dept_name):
	# 				frappe.throw(f"Department '{dept_name}' already exists.")

	# 			# 4) Set docname = department field
	# 			self.name = dept_name