import frappe
from frappe.model.document import Document

class DKP_Candidate(Document):

    def before_insert(self):
        if not self.added_by:
            self.added_by = frappe.session.user

    def validate(self):
        # Prevent duplicate candidate by email OR phone
        if self.email or self.mobile_number:
            duplicate = frappe.db.sql("""
                SELECT name FROM `tabDKP_Candidate`
                WHERE (email=%s OR mobile_number=%s)
                AND name != %s
                LIMIT 1
            """, (self.email, self.mobile_number, self.name))

            if duplicate:
                frappe.throw("Candidate with this email or phone number already exists.")
