import frappe
from frappe.model.document import Document


class DKP_Joining_Tracker(Document):
      
	def on_trash(self):
        # ✅ Interview se invoice link hatao before delete
		if self.interview_ref:
				frappe.db.set_value(
					"DKP_Interview", 
					self.interview_ref, 
					"invoice_ref", 
					None
				)
