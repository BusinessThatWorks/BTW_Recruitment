
import frappe
from frappe.model.document import Document


class DKP_Interview(Document):

    def after_insert(self):
        frappe.db.set_value(
            "DKP_JobApplication_Child",
            {
                "parent": self.job_opening,
                "candidate_name": self.candidate_name
            },
            "interview",
            self.name
        )