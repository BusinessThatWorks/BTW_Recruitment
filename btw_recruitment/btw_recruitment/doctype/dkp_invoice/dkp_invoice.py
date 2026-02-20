# Copyright (c) 2026, Sarim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DKP_Invoice(Document):
      
	def on_trash(self):
        # ✅ Interview se invoice link hatao before delete
		if self.interview_ref:
				frappe.db.set_value(
					"DKP_Interview", 
					self.interview_ref, 
					"invoice_ref", 
					None
				)
