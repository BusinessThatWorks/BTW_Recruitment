import re
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate, nowdate


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
    # ✅ Set document name = interview_ref
    def autoname(self):
        if self.interview_ref:
            self.name = self.interview_ref
        else:
            frappe.throw(_("Interview Reference is required to create Joining Tracker"))        

    def validate(self):
        self.check_freeze_status()
    
    
    def check_freeze_status(self):
        if self.is_new():
            return
        
        old_doc = self.get_doc_before_save()
        if not old_doc:
            return
        
        if self.is_frozen_due_to_replacement_policy():
            self.handle_full_freeze(old_doc)
    
    
    def is_frozen_due_to_replacement_policy(self):
        if not self.joining_date or not self.company_name:
            return False
        
        # Check if candidate has left
        if self.interview_ref:
            interview_stage = frappe.db.get_value("DKP_Interview", self.interview_ref, "stage")
            if interview_stage == "Joined And Left":
                return False
        
        replacement_policy = frappe.db.get_value(
            "Customer", 
            self.company_name, 
            "custom_replacement_policy_"
        )
        
        if not replacement_policy:
            return False
        
        replacement_days = self.extract_days_from_policy(replacement_policy)
        if not replacement_days:
            return False
        
        policy_end_date = add_days(getdate(self.joining_date), replacement_days)
        
        if getdate(nowdate()) > policy_end_date:
            return True
        
        return False
    
    
    def extract_days_from_policy(self, replacement_policy):
        if not replacement_policy:
            return 0
        
        try:
            return int(replacement_policy)
        except ValueError:
            numbers = re.findall(r'\d+', str(replacement_policy))
            if numbers:
                return int(numbers[0])
            return 0
    
    
    def handle_full_freeze(self, old_doc):
        replacement_policy = frappe.db.get_value(
            "Customer", 
            self.company_name, 
            "custom_replacement_policy_"
        )
        
        replacement_days = self.extract_days_from_policy(replacement_policy)
        policy_end_date = add_days(getdate(self.joining_date), replacement_days)
        
        all_fields = [
            'company_name', 'job_opening', 'hiring_location', 'recipients_name',
            'recipients_mail_id', 'recipients_number', 'candidate_name', 
            'candidate_contact', 'designation', 'recruiter', 'joining_date',
            'gstinuin', 'status', 'billable_ctc', 'billing_fee', 'billing_value',
            'billing_month', 'billing_status', 'remarks_by_recruiter', 'accountant_remarks'
        ]
        
        for field in all_fields:
            old_value = getattr(old_doc, field, None)
            new_value = getattr(self, field, None)
            
            if old_value != new_value:
                frappe.throw(
                    _("FROZEN: {0} day replacement policy ended on {1}. No changes allowed.").format(
                        replacement_days,
                        policy_end_date.strftime("%d-%m-%Y")
                    ),
                    title=_("Document Frozen")
                )


@frappe.whitelist()
def check_joining_tracker_freeze_status(tracker_name):
    doc = frappe.get_doc("DKP_Joining_Tracker", tracker_name)
    
    result = {
        "is_frozen": False,
        "message": ""
    }
    
    if not doc.joining_date or not doc.company_name:
        return result
    
    # Check if candidate has left
    if doc.interview_ref:
        interview_stage = frappe.db.get_value("DKP_Interview", doc.interview_ref, "stage")
        if interview_stage == "Joined And Left":
            return result
    
    replacement_policy = frappe.db.get_value(
        "Customer", 
        doc.company_name, 
        "custom_replacement_policy_"
    )
    
    if replacement_policy:
        try:
            replacement_days = int(replacement_policy)
        except ValueError:
            numbers = re.findall(r'\d+', str(replacement_policy))
            replacement_days = int(numbers[0]) if numbers else 0
        
        if replacement_days:
            policy_end_date = add_days(getdate(doc.joining_date), replacement_days)
            
            if getdate(nowdate()) > policy_end_date:
                result["is_frozen"] = True
                result["message"] = "FROZEN: {} day replacement policy ended on {}. No edits allowed.".format(
                    replacement_days, policy_end_date.strftime('%d-%m-%Y')
                )
    
    return result
