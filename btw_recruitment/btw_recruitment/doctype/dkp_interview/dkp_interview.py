import frappe
from frappe.model.document import Document
from frappe.model.naming import make_autoname

def get_customer_billing_contact(customer_name):
    # """
    # Customer ka Primary/Billing Contact fetch karo
    # """
    contact_info = {
        "name": "",
        "email": "",
        "phone": ""
    }
    
    # Step 1: Find linked contact via Dynamic Link
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
    
    # Step 2: Try to find Billing Contact first, else Primary Contact
    # Check for billing contact
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
        # Fallback to primary contact
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
    
    # Step 3: Fetch contact details
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
        """
        Name Format:
        <Company> - <Candidate Name>
        if duplicate -> add -01, -02...
        """

        if not self.job_opening or not self.candidate_name:
            # fallback safe naming
            self.name = make_autoname("INT-.#####")
            return

        # 1) Company from Job Opening
        company = frappe.db.get_value("DKP_Job_Opening", self.job_opening, "company_name") or ""

        # 2) Candidate Display Name (not ID)
        # candidate_name field is Link to DKP_Candidate, so it stores docname.
        candidate_display = frappe.db.get_value("DKP_Candidate", self.candidate_name, "candidate_name") \
            or self.candidate_name

        # cleanup
        company = (company or "").strip()
        candidate_display = (candidate_display or "").strip()

        base = f"{company} - {candidate_display}".strip(" -")

        # 3) unique naming with suffix -01, -02...
        # pattern expects # at end
        # if base exists -> base-01, base-02...
        if frappe.db.exists("DKP_Interview", base):
            self.name = make_autoname(base + "-.##")
        else:
            self.name = base

    def after_insert(self):
        # 🔗 Interview link set
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
        self.create_invoice_on_joined() 
        # self.update_existing_invoice()

    def sync_stage_to_opening(self):
        if not self.job_opening or not self.candidate_name:
            return

        update_values = {}

        # Interview.stage -> Job Opening child table: sub_stages_interview
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

        # FORCE REOPEN CASE
        if self.stage == "Joined And Left":
            if job.status != "Open":
                frappe.db.set_value(
                    "DKP_Job_Opening",
                    job.name,
                    "status",
                    "Open"
                )
            return   # stop here — no counting needed

        # JOINED LOGIC
        if not job.number_of_positions:
            return

        total_positions = int(job.number_of_positions)

        selected_count = frappe.db.count(
            "DKP_JobApplication_Child",
            {
                "parent": job.name,
                "sub_stages_interview": "Joined"
            }
        )

        if selected_count >= total_positions:
            if job.status != "Closed – Hired":
                frappe.db.set_value(
                    "DKP_Job_Opening",
                    job.name,
                    "status",
                    "Closed – Hired"
                )

    def create_invoice_on_joined(self):
        # ✅ Only when stage = "Joined"
        if self.stage != "Joined":
            return

        # ✅ Check if invoice already exists
        existing_invoice = frappe.db.exists("DKP_Joining_Tracker", {"interview_ref": self.name})
        
        if existing_invoice:
            # ✅ Invoice exists - UPDATE karo
            self.update_existing_invoice(existing_invoice)
            
            # Link set karo agar missing hai
            if not self.invoice_ref:
                self.db_set("invoice_ref", existing_invoice)
            return

        # ✅ Validation for new invoice
        if not self.joining_date or not self.offered_amount:
            frappe.msgprint("⚠️ Fill Joining Date and Offered Amount to create Joining Tracker!")
            return

        # Fetch Job Opening
        job_opening = frappe.get_doc("DKP_Job_Opening", self.job_opening)

        # Fetch Customer for fee
        customer = frappe.get_doc("Customer", job_opening.company_name)
        fee_percentage = customer.custom_standard_fee_value or 0

        # Fetch Candidate
        candidate = frappe.get_doc("DKP_Candidate", self.candidate_name)

        # ✅ NEW: Fetch Primary Billing Contact from Customer
        contact_info = get_customer_billing_contact(job_opening.company_name)

        # Calculate
        billable_ctc = self.offered_amount or 0
        billing_value = (billable_ctc * fee_percentage) / 100

        # Billing month
        billing_month = ""
        if self.joining_date:
            joining = self.joining_date
            if isinstance(joining, str):
                from datetime import datetime
                joining = datetime.strptime(joining, "%Y-%m-%d")
            billing_month = joining.strftime("%B %Y")

        # ✅ Create Invoice
        invoice = frappe.new_doc("DKP_Joining_Tracker")
        invoice.interview_ref = self.name
        invoice.job_opening = self.job_opening
        invoice.candidate_name = self.candidate_name
        invoice.status = self.stage
        invoice.joining_date = self.joining_date
        invoice.billable_ctc = str(billable_ctc)
        invoice.recruiter = self.added_by
        invoice.remarks_by_recruiter = self.remarks_for_invoice

        # From Job Opening
        invoice.company_name = job_opening.company_name
        invoice.designation = job_opening.designation
        invoice.hiring_location = job_opening.location

        # From Candidate
        invoice.candidate_contact = candidate.mobile_number

         # ✅ NEW: From Customer's Billing Contact
        invoice.recipients_name = contact_info.get("name", "")
        invoice.recipients_mail_id = contact_info.get("email", "")
        invoice.recipients_number = contact_info.get("phone", "")

        invoice.billing_fee = fee_percentage
        invoice.gstinuin = customer.custom_gstin or ""

        # Calculated
        invoice.billing_value = str(billing_value)
        invoice.billing_month = billing_month
        invoice.billing_status = "Yet to Bill"

        invoice.insert(ignore_permissions=True)

        # ✅ Link back to Interview
        self.db_set("invoice_ref", invoice.name)

        frappe.msgprint(f"✅ Invoice Created: {invoice.name}")

    def update_existing_invoice(self, invoice_name):
        """Update existing invoice when interview is updated"""
        
        # Fetch Job Opening for recalculation
        job_opening = frappe.get_doc("DKP_Job_Opening", self.job_opening)
        
        # Fetch Customer for fee
        customer = frappe.get_doc("Customer", job_opening.company_name)
        fee_percentage = customer.custom_standard_fee_value or 0
        
        # ✅ NEW: Fetch Contact Info
        contact_info = get_customer_billing_contact(job_opening.company_name)
        
        # Recalculate billing
        billable_ctc = self.offered_amount or 0
        billing_value = (billable_ctc * fee_percentage) / 100
        
        # Billing month
        billing_month = ""
        if self.joining_date:
            joining = self.joining_date
            if isinstance(joining, str):
                from datetime import datetime
                joining = datetime.strptime(joining, "%Y-%m-%d")
            billing_month = joining.strftime("%B %Y")
        
        # ✅ Update invoice
        invoice = frappe.get_doc("DKP_Joining_Tracker", invoice_name)
        invoice.status = self.stage
        invoice.joining_date = self.joining_date
        invoice.billable_ctc = str(billable_ctc)
        invoice.billing_value = str(billing_value)
        invoice.billing_month = billing_month
        invoice.remarks_by_recruiter = self.remarks_for_invoice
        invoice.recruiter = self.added_by
        
        # ✅ NEW: Update contact info also
        invoice.recipients_name = contact_info.get("name", "")
        invoice.recipients_mail_id = contact_info.get("email", "")
        invoice.recipients_number = contact_info.get("phone", "")

        # ✅ NEW: Update Fee Value & GSTIN also
        invoice.billing_fee = fee_percentage
        invoice.gstinuin = customer.custom_gstin or ""
                
        invoice.save(ignore_permissions=True)
        
        frappe.msgprint(f"✅ Joining Tracker Updated: {invoice_name}")

    