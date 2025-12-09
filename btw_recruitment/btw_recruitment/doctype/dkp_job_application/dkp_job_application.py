# Copyright (c) 2025, Sarim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document



class DKP_Job_Application(Document):
	pass

# def update_job_opening_child(doc, method):
#     if not doc.job_opening_title:
#         return

#     # Load Job Opening document
#     job_opening = frappe.get_doc("DKP_Job_Opening", doc.job_opening_title)

#     # Check if row for this candidate already exists
#     existing_row = None
#     for row in job_opening.table_dmjx:
#         if row.job_application == doc.name:
#             existing_row = row
#             break

#     if existing_row:
#         # Update existing row
#         existing_row.candidate_name = doc.candidate_name
#         existing_row.stage = doc.stage
#         existing_row.interview_date = doc.datetime_tisc
#         existing_row.interview_feedback = doc.interview_feedback
#     else:
#         # Add new row
#         job_opening.append("table_dmjx", {
#             "job_application": doc.name,
#             "candidate_name": doc.candidate_name,
#             "stage": doc.stage,
#             "interview_date": doc.datetime_tisc,
#             "interview_feedback": doc.interview_feedback
#         })

#     job_opening.save(ignore_permissions=True)



