import re
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import getdate, nowdate, add_days


def get_customer_billing_contact(customer_name):
    contact_info = {
        "name": "",
        "email": "",
        "phone": ""
    }
    
    contact_name = frappe.db.get_value(
        "Dynamic Link",
        {
            "link_doctype": "Customer",
            "link_name": customer_name,
            "parenttype": "Contact"
        },
        "parent"
    )
    
    if not contact_name:
        return contact_info
    
    billing_contact = frappe.db.sql("""
        SELECT c.name 
        FROM `tabContact` c
        INNER JOIN `tabDynamic Link` dl ON dl.parent = c.name
        WHERE dl.link_doctype = 'Customer' 
        AND dl.link_name = %s
        AND c.is_billing_contact = 1
        LIMIT 1
    """, customer_name, as_dict=True)
    
    if billing_contact:
        contact_name = billing_contact[0].name
    else:
        primary_contact = frappe.db.sql("""
            SELECT c.name 
            FROM `tabContact` c
            INNER JOIN `tabDynamic Link` dl ON dl.parent = c.name
            WHERE dl.link_doctype = 'Customer' 
            AND dl.link_name = %s
            AND c.is_primary_contact = 1
            LIMIT 1
        """, customer_name, as_dict=True)
        
        if primary_contact:
            contact_name = primary_contact[0].name
    
    if contact_name:
        contact = frappe.get_doc("Contact", contact_name)
        full_name = f"{contact.first_name or ''} {contact.last_name or ''}".strip()
        contact_info = {
            "name": full_name,
            "email": contact.email_id or "",
            "phone": contact.mobile_no or contact.phone or ""
        }
    
    return contact_info


class DKP_Interview(Document):
    
    def autoname(self):
        if not self.job_opening or not self.candidate_name:
            self.name = make_autoname("INT-.#####")
            return

        company = frappe.db.get_value("DKP_Job_Opening", self.job_opening, "company_name") or ""
        candidate_display = frappe.db.get_value("DKP_Candidate", self.candidate_name, "candidate_name") or self.candidate_name

        company = (company or "").strip()
        candidate_display = (candidate_display or "").strip()
        base = f"{company} - {candidate_display}".strip(" -")

        if frappe.db.exists("DKP_Interview", base):
            self.name = make_autoname(base + "-.##")
        else:
            self.name = base

    def validate(self):
        self.check_freeze_status()

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
        self.sync_stage_to_opening()

    def on_update(self):
        self.sync_stage_to_opening()
        
        # Create/Update invoice when Joined
        if self.stage == "Joined":
            self.create_invoice_on_joined()
        
        # Update invoice status when Left
        elif self.stage == "Joined And Left" and self.invoice_ref:
            self.update_invoice_on_left()

    def update_invoice_on_left(self):
        """Update invoice status when candidate leaves"""
        if not self.invoice_ref:
            return
        
        try:
            frappe.db.set_value(
                "DKP_Joining_Tracker", 
                self.invoice_ref, 
                "status", 
                "Joined And Left"
            )
        except Exception as e:
            frappe.log_error(f"Error updating invoice on left: {e}")

    def sync_stage_to_opening(self):
        if not self.job_opening or not self.candidate_name:
            return

        update_values = {}
        if self.stage:
            update_values["sub_stages_interview"] = self.stage

        if update_values:
            frappe.db.set_value(
                "DKP_JobApplication_Child",
                {
                    "parent": self.job_opening,
                    "candidate_name": self.candidate_name
                },
                update_values
            )
        self.check_and_close_job_opening()

    def check_and_close_job_opening(self):
        if not self.job_opening:
            return

        job = frappe.get_doc("DKP_Job_Opening", self.job_opening)

        if self.stage == "Joined And Left":
            if job.status != "Open":
                frappe.db.set_value("DKP_Job_Opening", job.name, "status", "Open")
            return

        if not job.number_of_positions:
            return

        total_positions = int(job.number_of_positions)
        selected_count = frappe.db.count(
            "DKP_JobApplication_Child",
            {"parent": job.name, "sub_stages_interview": "Joined"}
        )

        if selected_count >= total_positions:
            if job.status != "Closed – Hired":
                frappe.db.set_value("DKP_Job_Opening", job.name, "status", "Closed – Hired")

    def create_invoice_on_joined(self):
        if self.stage != "Joined":
            return

        existing_invoice = frappe.db.exists("DKP_Joining_Tracker", {"interview_ref": self.name})
        
        if existing_invoice:
            self.update_existing_invoice(existing_invoice)
            if not self.invoice_ref:
                self.db_set("invoice_ref", existing_invoice)
            return

        if not self.joining_date or not self.offered_amount:
            frappe.msgprint("⚠️ Fill Joining Date and Offered Amount to create Joining Tracker!")
            return

        job_opening = frappe.get_doc("DKP_Job_Opening", self.job_opening)
        customer = frappe.get_doc("Customer", job_opening.company_name)
        fee_percentage = customer.custom_standard_fee_value or 0
        candidate = frappe.get_doc("DKP_Candidate", self.candidate_name)
        contact_info = get_customer_billing_contact(job_opening.company_name)

        billable_ctc = self.offered_amount or 0
        billing_value = (billable_ctc * fee_percentage) / 100

        billing_month = ""
        if self.joining_date:
            joining = self.joining_date
            if isinstance(joining, str):
                from datetime import datetime
                joining = datetime.strptime(joining, "%Y-%m-%d")
            billing_month = joining.strftime("%B %Y")

        invoice = frappe.new_doc("DKP_Joining_Tracker")
        invoice.interview_ref = self.name
        invoice.job_opening = self.job_opening
        invoice.candidate_name = self.candidate_name
        invoice.status = self.stage
        invoice.joining_date = self.joining_date
        invoice.billable_ctc = str(billable_ctc)
        invoice.recruiter = self.added_by
        invoice.remarks_by_recruiter = self.remarks_for_invoice
        invoice.company_name = job_opening.company_name
        invoice.designation = job_opening.designation
        invoice.hiring_location = job_opening.location
        invoice.candidate_contact = candidate.mobile_number
        invoice.recipients_name = contact_info.get("name", "")
        invoice.recipients_mail_id = contact_info.get("email", "")
        invoice.recipients_number = contact_info.get("phone", "")
        invoice.billing_fee = fee_percentage
        invoice.gstinuin = customer.custom_gstin or ""
        invoice.billing_value = str(billing_value)
        invoice.billing_month = billing_month
        invoice.billing_status = "Yet to Bill"

        invoice.insert(ignore_permissions=True)
        self.db_set("invoice_ref", invoice.name)
        frappe.msgprint(f"✅ Invoice Created: {invoice.name}")

    def update_existing_invoice(self, invoice_name):
        job_opening = frappe.get_doc("DKP_Job_Opening", self.job_opening)
        customer = frappe.get_doc("Customer", job_opening.company_name)
        fee_percentage = customer.custom_standard_fee_value or 0
        contact_info = get_customer_billing_contact(job_opening.company_name)

        billable_ctc = self.offered_amount or 0
        billing_value = (billable_ctc * fee_percentage) / 100

        billing_month = ""
        if self.joining_date:
            joining = self.joining_date
            if isinstance(joining, str):
                from datetime import datetime
                joining = datetime.strptime(joining, "%Y-%m-%d")
            billing_month = joining.strftime("%B %Y")

        invoice = frappe.get_doc("DKP_Joining_Tracker", invoice_name)
        invoice.status = self.stage
        invoice.joining_date = self.joining_date
        invoice.billable_ctc = str(billable_ctc)
        invoice.billing_value = str(billing_value)
        invoice.billing_month = billing_month
        invoice.remarks_by_recruiter = self.remarks_for_invoice
        invoice.recruiter = self.added_by
        invoice.recipients_name = contact_info.get("name", "")
        invoice.recipients_mail_id = contact_info.get("email", "")
        invoice.recipients_number = contact_info.get("phone", "")
        invoice.billing_fee = fee_percentage
        invoice.gstinuin = customer.custom_gstin or ""
        invoice.save(ignore_permissions=True)
        frappe.msgprint(f"✅ Joining Tracker Updated: {invoice_name}")

    # ==================== FREEZE LOGIC ====================
    
    def check_freeze_status(self):
        if self.is_new():
            return
        
        old_doc = self.get_doc_before_save()
        if not old_doc:
            return
        
        is_policy_frozen = self.is_frozen_due_to_replacement_policy()
        if is_policy_frozen:
            self.handle_full_freeze(old_doc)
            return
        
        is_bill_sent_frozen = self.is_frozen_due_to_bill_sent()
        if is_bill_sent_frozen:
            self.handle_bill_sent_freeze(old_doc)

    def is_frozen_due_to_bill_sent(self):
        joining_tracker = frappe.db.get_value(
            "DKP_Joining_Tracker",
            {"interview_ref": self.name},
            ["billing_status"],
            as_dict=True
        )
        return joining_tracker and joining_tracker.billing_status == "Bill Sent"

    def is_frozen_due_to_replacement_policy(self):
        if self.stage != "Joined":
            return False
        
        if not self.joining_date or not self.job_opening:
            return False
        
        company_name = frappe.db.get_value("DKP_Job_Opening", self.job_opening, "company_name")
        if not company_name:
            return False
        
        replacement_policy = frappe.db.get_value("Customer", company_name, "custom_replacement_policy_")
        if not replacement_policy:
            return False
        
        replacement_days = self.extract_days_from_policy(replacement_policy)
        if not replacement_days:
            return False
        
        policy_end_date = add_days(getdate(self.joining_date), replacement_days)
        return getdate(nowdate()) > policy_end_date

    def extract_days_from_policy(self, replacement_policy):
        if not replacement_policy:
            return 0
        try:
            return int(replacement_policy)
        except ValueError:
            numbers = re.findall(r'\d+', str(replacement_policy))
            return int(numbers[0]) if numbers else 0

    def handle_bill_sent_freeze(self, old_doc):
        """
        Bill Sent Freeze Logic:
        - Only allow: Joined → Joined And Left (stage change)
        - Only allow: candidate_left_date to be filled
        - Block: Everything else
        """
        
        is_leaving = (old_doc.stage == "Joined" and self.stage == "Joined And Left")
        stage_changed = (old_doc.stage != self.stage)
        
        # Stage change validation
        if stage_changed and not is_leaving:
            frappe.throw(
                _("Bill sent. Only 'Joined' to 'Joined And Left' allowed."),
                title=_("Document Frozen")
            )
        
        # Fields that should NEVER change after Bill Sent
        never_change = ['candidate_name', 'job_opening', 'added_by', 'offered_amount', 'invoice_ref']
        
        for field in never_change:
            old_val = str(getattr(old_doc, field, "") or "")
            new_val = str(getattr(self, field, "") or "")
            
            if old_val != new_val:
                frappe.throw(
                    _("Bill sent. '{0}' cannot be modified.").format(field),
                    title=_("Document Frozen")
                )
        
        # joining_date - should never change
        if str(old_doc.joining_date or "") != str(self.joining_date or ""):
            frappe.throw(
                _("Bill sent. 'joining_date' cannot be modified."),
                title=_("Document Frozen")
            )
        
        # remarks_for_invoice - should never change
        if str(old_doc.remarks_for_invoice or "") != str(self.remarks_for_invoice or ""):
            frappe.throw(
                _("Bill sent. 'remarks_for_invoice' cannot be modified."),
                title=_("Document Frozen")
            )
        
        # candidate_left_date - ONLY allow when stage changing to "Joined And Left"
        old_left = str(old_doc.candidate_left_date or "")
        new_left = str(self.candidate_left_date or "")
        
        if old_left != new_left and not is_leaving:
            frappe.throw(
                _("Bill sent. 'candidate_left_date' cannot be modified."),
                title=_("Document Frozen")
            )
        
        # Child table - should never change
        if self.has_child_table_changed(old_doc):
            frappe.throw(
                _("Bill sent. Interview rounds cannot be modified."), 
                title=_("Document Frozen")
            )
    def handle_full_freeze(self, old_doc):
        company_name = frappe.db.get_value("DKP_Job_Opening", self.job_opening, "company_name")
        replacement_policy = frappe.db.get_value("Customer", company_name, "custom_replacement_policy_")
        replacement_days = self.extract_days_from_policy(replacement_policy)
        policy_end_date = add_days(getdate(self.joining_date), replacement_days)
        
        all_fields = ['candidate_name', 'job_opening', 'added_by', 'stage', 'joining_date',
                      'candidate_left_date', 'offered_amount', 'remarks_for_invoice', 'invoice_ref']
        
        for field in all_fields:
            if getattr(old_doc, field, None) != getattr(self, field, None):
                frappe.throw(
                    _("FROZEN: {0} day policy ended on {1}.").format(replacement_days, policy_end_date.strftime("%d-%m-%Y")),
                    title=_("Document Frozen")
                )
        
        if self.has_child_table_changed(old_doc):
            frappe.throw(_("FROZEN: Policy ended. No changes allowed."), title=_("Document Frozen"))

    def has_child_table_changed(self, old_doc):
        old_children = {d.name: d for d in old_doc.interview_child_table}
        new_children = {d.name: d for d in self.interview_child_table}
        
        if set(old_children.keys()) != set(new_children.keys()):
            return True
        
        for name, old_row in old_children.items():
            new_row = new_children.get(name)
            if new_row:
                for field in old_row.as_dict():
                    if field not in ['modified', 'modified_by', 'idx']:
                        if old_row.get(field) != new_row.get(field):
                            return True
        return False


@frappe.whitelist()
def check_interview_freeze_status(interview_name):
    doc = frappe.get_doc("DKP_Interview", interview_name)
    
    result = {
        "is_frozen": False,
        "freeze_type": None,
        "allowed_fields": [],
        "allowed_stage_options": [],
        "message": ""
    }
    
    # Check Replacement Policy first
    if doc.stage == "Joined" and doc.joining_date and doc.job_opening:
        company_name = frappe.db.get_value("DKP_Job_Opening", doc.job_opening, "company_name")
        if company_name:
            replacement_policy = frappe.db.get_value("Customer", company_name, "custom_replacement_policy_")
            if replacement_policy:
                replacement_days = 0
                try:
                    replacement_days = int(replacement_policy)
                except ValueError:
                    numbers = re.findall(r'\d+', str(replacement_policy))
                    replacement_days = int(numbers[0]) if numbers else 0
                
                if replacement_days:
                    policy_end_date = add_days(getdate(doc.joining_date), replacement_days)
                    if getdate(nowdate()) > policy_end_date:
                        result["is_frozen"] = True
                        result["freeze_type"] = "replacement_policy"
                        result["message"] = "FROZEN: {} day policy ended on {}.".format(
                            replacement_days, policy_end_date.strftime('%d-%m-%Y')
                        )
                        return result
    
    # Check Bill Sent
    joining_tracker = frappe.db.get_value(
        "DKP_Joining_Tracker",
        {"interview_ref": interview_name},
        ["billing_status"],
        as_dict=True
    )
    
    if joining_tracker and joining_tracker.billing_status == "Bill Sent":
        if doc.stage == "Joined":
            result["is_frozen"] = True
            result["freeze_type"] = "bill_sent"
            result["allowed_fields"] = ["stage", "candidate_left_date"]
            result["allowed_stage_options"] = ["Joined", "Joined And Left"]
            result["message"] = "Bill sent. Only stage to 'Joined And Left' allowed."
    
    return result
# /comment for push