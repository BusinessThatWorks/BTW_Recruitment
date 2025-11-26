# Copyright (c) 2025, Sarim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document



class DKP_Job_Application(Document):
	pass

import frappe

# def after_insert(self, method=None):

#     # Safety check
#     if not self.candidate_id:
#         return

#     try:
#         candidate_doc = frappe.get_doc("BTW_Candidate", self.candidate_id)

#         # Prevent duplicates
#         exists = any(
#             row.job_application_id == self.name
#             for row in candidate_doc.table_nxdk
#         )
#         if exists:
#             return

#         # Append child row
#         row = candidate_doc.append("table_nxdk", {})
#         row.job_application_id = self.name  # Other fields auto-fetch

#         candidate_doc.save(ignore_permissions=True)

#     except Exception:
#         frappe.log_error(frappe.get_traceback(), "Auto Add Candidate Job Application Failed")
