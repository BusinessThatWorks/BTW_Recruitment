# Copyright (c) 2025, Sarim and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import frappe

class DKP_Job_Opening(Document):
	pass


# def after_insert(self, method=None):
#     if not self.company:
#         return
    
#     try:
#         company_doc = frappe.get_doc("BTW_Company", self.company)

#         # avoid duplicates
#         exists = any(row.job_opening_link == self.name for row in company_doc.table_knls)
#         if exists:
#             return

#         row = company_doc.append("table_knls", {})
#         row.job_opening_link = self.name  # rest fetches automatically

#         company_doc.save(ignore_permissions=True)

#     except Exception:
#         frappe.log_error(frappe.get_traceback(), "Job Opening Auto Add Failed")
# not working
	# def after_save(self):
	# 	if self.has_value_changed("assign_recruiter") and self.assign_recruiter:

	# 		frappe.assign_to.add({
	# 			"doctype": self.doctype,
	# 			"name": self.name,
	# 			"assign_to": [self.assign_recruiter],
	# 			"description": f"You have been assigned a Job Opening: {self.name}"
	# 		})

	# 		message = f"📌 <b>{frappe.session.user}</b> assigned this Job Opening to <b>{self.assign_recruiter}</b>."
	# 		self.add_comment("Comment", message)
