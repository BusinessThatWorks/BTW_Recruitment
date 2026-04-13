import re

import frappe
import requests
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import add_days, getdate, nowdate

# ACCESS_TOKEN = "EAARiY2L9nm4BQ4Ba3cbxJ02ZBVBeplydPQlaKY7iNyZCn51Da0R5TIe7uG8QZCD6ctRi0ZBj4W7nxBqSpgZBlTtSEiGlW35vNkmZA1MvJNWE2dKsv976MOYKb04nsFm0KZCVlnV41asLcD9SlzYZA3bKF6TV2xrVKQ0ZBaDza1tGKrfZCANsDWiOzoJWGoxfeaI9Ugs78Ek8Tw2VsQIF3fnnYmKPdYYhpLGHCH0hWzzcIZD"
# PHONE_NUMBER_ID = "929234290283533"

# def send_whatsapp(phone):

#     url = f"https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages"

#     headers = {
#         "Authorization": f"Bearer {ACCESS_TOKEN}",
#         "Content-Type": "application/json"
#     }

#     payload = {
#         "messaging_product": "whatsapp",
#         "to": phone,
#         "type": "template",
#         "template": {
#             "name": "hello_world",
#             "language": {
#                 "code": "en_US"
#             }
#         }
#     }

#     response = requests.post(url, headers=headers, json=payload)

#     print(response.status_code)
#     print(response.text)


def get_customer_billing_contact(customer_name):
	contact_info = {"name": "", "email": "", "phone": ""}

	contact_name = frappe.db.get_value(
		"Dynamic Link",
		{"link_doctype": "Customer", "link_name": customer_name, "parenttype": "Contact"},
		"parent",
	)

	if not contact_name:
		return contact_info

	billing_contact = frappe.db.sql(
		"""
        SELECT c.name
        FROM `tabContact` c
        INNER JOIN `tabDynamic Link` dl ON dl.parent = c.name
        WHERE dl.link_doctype = 'Customer'
        AND dl.link_name = %s
        AND c.is_billing_contact = 1
        LIMIT 1
    """,
		customer_name,
		as_dict=True,
	)

	if billing_contact:
		contact_name = billing_contact[0].name
	else:
		primary_contact = frappe.db.sql(
			"""
            SELECT c.name
            FROM `tabContact` c
            INNER JOIN `tabDynamic Link` dl ON dl.parent = c.name
            WHERE dl.link_doctype = 'Customer'
            AND dl.link_name = %s
            AND c.is_primary_contact = 1
            LIMIT 1
        """,
			customer_name,
			as_dict=True,
		)

		if primary_contact:
			contact_name = primary_contact[0].name

	if contact_name:
		contact = frappe.get_doc("Contact", contact_name)
		full_name = f"{contact.first_name or ''} {contact.last_name or ''}".strip()
		contact_info = {
			"name": full_name,
			"email": contact.email_id or "",
			"phone": contact.mobile_no or contact.phone or "",
		}

	return contact_info


class DKP_Interview(Document):
	# def after_save(self):

	#     for row in self.interview_child_table:

	#         if not row.reminder_sent and row.interview_date:

	#             candidate = frappe.get_doc("DKP_Candidate", self.candidate_name)

	#             phone = re.sub(r"\D", "", candidate.mobile_number)

	#             if not phone:
	#                 continue

	#             send_whatsapp(
	#                 candidate_name=candidate.candidate_name,
	#                 position=self.job_opening,
	#                 date=row.interview_date,
	#                 time=row.get("from"),
	#                 company="ABC",
	#                 phone=phone
	#             )

	#             row.db_set("reminder_sent", 1)

	def autoname(self):
		if not self.job_opening or not self.candidate_name:
			self.name = make_autoname("INT-.#####")
			return

		company = frappe.db.get_value("DKP_Job_Opening", self.job_opening, "company_name") or ""
		candidate_display = (
			frappe.db.get_value("DKP_Candidate", self.candidate_name, "candidate_name") or self.candidate_name
		)

		company = (company or "").strip()
		candidate_display = (candidate_display or "").strip()
		base = f"{company} - {candidate_display}".strip(" -")

		if frappe.db.exists("DKP_Interview", base):
			self.name = make_autoname(base + "-.##")
		else:
			self.name = base

	def validate(self):
		self.check_freeze_status()
		self.validate_replacement_dates()

	def validate_replacement_dates(self):
		"""Validate dates for Joined And Left stage"""
		if self.stage == "Joined And Left":
			if not self.joining_date:
				frappe.throw(
					_(
						"Joining Date is required when stage is 'Joined And Left' to update Replacement Policies"
					)
				)
			if not self.candidate_left_date:
				frappe.throw(_("Candidate Left Date is required when stage is 'Joined And Left'"))
			if getdate(self.candidate_left_date) < getdate(self.joining_date):
				frappe.throw(_("Candidate Left Date cannot be before Joining Date"))

		if self.stage == "Joined" and not self.joining_date:
			frappe.msgprint(_("Please fill Joining Date"), alert=True)

	def after_insert(self):
		frappe.db.set_value(
			"DKP_JobApplication_Child",
			{"parent": self.job_opening, "candidate_name": self.candidate_name},
			"interview",
			self.name,
		)
		self.sync_stage_to_opening()

		# Send interview scheduled emails for new interviews
		self.send_new_interview_emails()

	def on_update(self):
		# Handle replacement tracking
		if self.stage in ("Joined", "Joined And Left"):
			self.handle_replacement_tracking()

		self.sync_stage_to_opening()

		# Check for new interview rows added
		self.check_and_send_interview_emails()

		# Create/Update invoice when Joined
		if self.stage == "Joined":
			self.create_invoice_on_joined()

		# Update invoice status when Left
		elif self.stage == "Joined And Left" and self.invoice_ref:
			self.update_invoice_on_left()
			self.send_left_email_to_accountant()  # ✅ NEW

	# ==================== INTERVIEW EMAIL FUNCTIONS ====================

	def send_new_interview_emails(self):
		"""Send emails for all interviews when document is first created"""
		candidate_email = self.get_candidate_email()

		for interview in self.interview_child_table:
			if interview.interview_date and interview.get("from"):
				self.send_interview_scheduled_email(interview, candidate_email)

	def check_and_send_interview_emails(self):
		"""Check for newly added interview rows and send emails"""
		old_doc = self.get_doc_before_save()

		if not old_doc:
			return

		# Get old interview row names
		old_interview_names = set()
		for row in old_doc.interview_child_table:
			if row.name and not row.name.startswith("new-"):
				old_interview_names.add(row.name)

		candidate_email = self.get_candidate_email()

		# Check each current interview
		for interview in self.interview_child_table:
			is_new_row = (
				not interview.name
				or interview.name.startswith("new-")
				or interview.name not in old_interview_names
			)

			if is_new_row and interview.interview_date and interview.get("from"):
				self.send_interview_scheduled_email(interview, candidate_email)

	def get_candidate_email(self):
		"""Get candidate email from DKP_Candidate"""
		if self.candidate_name:
			return frappe.db.get_value("DKP_Candidate", self.candidate_name, "email")
		return None

	def send_interview_scheduled_email(self, interview, candidate_email):
		"""Send interview scheduled email to candidate and interviewer"""

		candidate_display_name = ""
		if self.candidate_name:
			candidate_display_name = (
				frappe.db.get_value("DKP_Candidate", self.candidate_name, "candidate_name")
				or self.candidate_name
			)

		job_title = ""
		company_name = ""
		if self.job_opening:
			job_data = frappe.db.get_value(
				"DKP_Job_Opening", self.job_opening, ["designation", "company_name"], as_dict=True
			)
			if job_data:
				job_title = job_data.get("designation", "")
				company_name = job_data.get("company_name", "")

		from_time = interview.get("from") or "N/A"
		to_time = interview.get("to") or "N/A"

		subject = f"Interview Scheduled - {candidate_display_name} | {interview.interview_stage}"

		message = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <p>Dear Participant,</p>

            <p>An interview has been scheduled with the following details:</p>

            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background-color: #f8f9fa;">
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold; width: 40%;">Candidate Name</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{candidate_display_name}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Interview Stage</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{interview.interview_stage or "N/A"}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Date</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{frappe.utils.formatdate(interview.interview_date)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Time</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{from_time} - {to_time}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Position</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{job_title or "N/A"}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Company</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{company_name or "N/A"}</td>
                </tr>
            </table>

            <p style="color: #e74c3c; font-weight: bold;">⏰ Please be available on time.</p>

            <p>Best Regards,<br><strong>HR Team</strong></p>
        </div>
        """

		recipients = []

		if candidate_email:
			recipients.append(candidate_email)

		if interview.interviewer_email:
			interviewer_emails = [e.strip() for e in interview.interviewer_email.split(",") if e.strip()]
			recipients.extend(interviewer_emails)

		if recipients:
			try:
				frappe.sendmail(recipients=recipients, subject=subject, message=message, now=True)
				frappe.msgprint(f"✅ Interview email sent to: {', '.join(recipients)}", alert=True)
			except Exception as e:
				frappe.log_error(f"Failed to send interview email: {e!s}", "Interview Email Error")

	# ==================== NEW: ACCOUNTANT EMAIL FUNCTION ====================
	def send_left_email_to_accountant(self):
		"""Send email to accountant when candidate leaves"""

		# Get candidate details
		candidate_display_name = ""
		if self.candidate_name:
			candidate_display_name = (
				frappe.db.get_value("DKP_Candidate", self.candidate_name, "candidate_name")
				or self.candidate_name
			)

		# Get job details
		job_title = ""
		company_name = ""
		if self.job_opening:
			job_data = frappe.db.get_value(
				"DKP_Job_Opening", self.job_opening, ["designation", "company_name"], as_dict=True
			)
			if job_data:
				job_title = job_data.get("designation", "")
				company_name = job_data.get("company_name", "")

		# Format dates
		joining_date = frappe.utils.formatdate(self.joining_date) if self.joining_date else "N/A"
		left_date = frappe.utils.formatdate(self.candidate_left_date) if self.candidate_left_date else "N/A"

		subject = f"⚠️ Candidate Left - {candidate_display_name} | {company_name}"

		message = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e74c3c;">⚠️ Candidate Left Alert!</h2>

            <p>Dear Accounts Team,</p>

            <p>A candidate has left the organization. Please review the billing status:</p>

            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background-color: #f8d7da;">
                    <td style="padding: 12px; border: 1px solid #f5c6cb; font-weight: bold; width: 40%;">Candidate Name</td>
                    <td style="padding: 12px; border: 1px solid #f5c6cb;">{candidate_display_name}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Company</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{company_name or "N/A"}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Designation</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{job_title or "N/A"}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">📅 Joining Date</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{joining_date}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">📅 Left Date</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{left_date}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">💰 Offered CTC (Yearly)</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">₹ {self.offered_amount or 0:,}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">📄 Invoice Reference</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{self.invoice_ref or "N/A"}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">👤 Recruiter</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{self.added_by or "N/A"}</td>
                </tr>
            </table>

            <p style="color: #e74c3c;"><strong>Action Required:</strong> Please review and update billing accordingly.</p>

            <p>Best Regards,<br><strong>HR Team</strong></p>
        </div>
        """

		accountant_email = "account@duaspotli.com"

		try:
			frappe.sendmail(recipients=[accountant_email], subject=subject, message=message, now=True)
			frappe.msgprint(f"✅ Left notification sent to Accounts: {accountant_email}", alert=True)
		except Exception as e:
			frappe.log_error(f"Failed to send accountant email: {e!s}", "Accountant Email Error")

	def send_update_email_to_accountant(self, invoice_name, changes):
		"""Send email to accountant when invoice details are updated"""

		# Get candidate details
		candidate_display_name = ""
		if self.candidate_name:
			candidate_display_name = (
				frappe.db.get_value("DKP_Candidate", self.candidate_name, "candidate_name")
				or self.candidate_name
			)

		# Get job details
		company_name = ""
		if self.job_opening:
			company_name = frappe.db.get_value("DKP_Job_Opening", self.job_opening, "company_name") or ""

		# Format changes list
		changes_html = "<ul>"
		for change in changes:
			changes_html += f"<li>{change}</li>"
		changes_html += "</ul>"

		subject = f"📝 Invoice Updated - {candidate_display_name} | {company_name}"

		message = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3498db;">📝 Invoice Details Updated</h2>

            <p>Dear Accounts Team,</p>

            <p>The following changes have been made to an existing invoice:</p>

            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background-color: #d1ecf1;">
                    <td style="padding: 12px; border: 1px solid #bee5eb; font-weight: bold; width: 40%;">Invoice Reference</td>
                    <td style="padding: 12px; border: 1px solid #bee5eb;">{invoice_name}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Candidate Name</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{candidate_display_name}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Company</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{company_name or "N/A"}</td>
                </tr>
            </table>

            <h3 style="color: #2c3e50;">🔄 Changes Made:</h3>
            {changes_html}

            <h3 style="color: #2c3e50;">📋 Current Details:</h3>

            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background-color: #f8f9fa;">
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold; width: 40%;">📅 Joining Date</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{frappe.utils.formatdate(self.joining_date) if self.joining_date else "N/A"}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">💰 Offered CTC (Yearly)</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">₹ {self.offered_amount or 0:,}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                    <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">📝 Remarks</td>
                    <td style="padding: 12px; border: 1px solid #dee2e6;">{self.remarks_for_invoice or "N/A"}</td>
                </tr>
            </table>

            <p>Please update your records accordingly.</p>

            <p>Best Regards,<br><strong>HR Team</strong></p>
        </div>
        """

		accountant_email = "account@duaspotli.com"

		try:
			frappe.sendmail(recipients=[accountant_email], subject=subject, message=message, now=True)
			frappe.msgprint(f"✅ Update notification sent to Accounts: {accountant_email}", alert=True)
		except Exception as e:
			frappe.log_error(f"Failed to send accountant update email: {e!s}", "Accountant Email Error")

	# ==================== EXISTING CODE BELOW ====================

	def update_invoice_on_left(self):
		"""Update invoice status when candidate leaves"""
		if not self.invoice_ref:
			return

		try:
			# ✅ Status aur Left Date dono update karo
			update_fields = {"status": "Joined And Left"}

			# Agar candidate_left_date hai Interview mein toh Joining Tracker mein bhi daalo
			if self.candidate_left_date:
				update_fields["candidate_left_date"] = self.candidate_left_date

			frappe.db.set_value("DKP_Joining_Tracker", self.invoice_ref, update_fields)

		except Exception as e:
			frappe.log_error(f"Error updating invoice on left: {e}")

	# def sync_stage_to_opening(self):
	# 	if not self.job_opening or not self.candidate_name:
	# 		return

	# 	update_values = {}
	# 	if self.stage:
	# 		update_values["sub_stages_interview"] = self.stage

	# 	if update_values:
	# 		frappe.db.set_value(
	# 			"DKP_JobApplication_Child",
	# 			{"parent": self.job_opening, "candidate_name": self.candidate_name},
	# 			update_values,
	# 		)
	# 	self.check_and_close_job_opening()
	def sync_stage_to_opening(self):
		if not self.job_opening or not self.candidate_name:
			return

		if self.stage:
			frappe.db.set_value(
				"DKP_JobApplication_Child",
				{"parent": self.job_opening, "candidate_name": self.candidate_name},
				"sub_stages_interview",
				self.stage,
			)

		self.evaluate_job_opening_status()

	def evaluate_job_opening_status(self):
		"""Single source of truth for job opening status"""
		if not self.job_opening:
			return

		job = frappe.get_doc("DKP_Job_Opening", self.job_opening)

		# Don't touch manually set statuses
		if job.status in ("On Hold", "Closed – Cancelled"):  # noqa: RUF001
			return

		if not job.number_of_positions:
			return

		total_positions = int(job.number_of_positions)

		# Count CURRENTLY joined candidates (not "Joined And Left")
		joined_count = frappe.db.count(
			"DKP_JobApplication_Child",
			{"parent": job.name, "sub_stages_interview": "Joined"},
		)

		# Count pending replacements from replacement history
		pending_count = frappe.db.count(
			"DKP_Replacement_Log",
			{"parent": job.name, "status": "Pending"},
		)

		# Decision logic
		if joined_count >= total_positions and pending_count == 0:
			# All positions filled, no pending replacements
			if job.status != "Closed \u2013 Hired":
				frappe.db.set_value("DKP_Job_Opening", job.name, "status", "Closed \u2013 Hired")
		else:
			# Either not enough joins or pending replacements exist
			if job.status == "Closed \u2013 Hired":
				frappe.db.set_value("DKP_Job_Opening", job.name, "status", "Open")

	def handle_replacement_tracking(self):
		"""Handle replacement history when stage changes"""
		if not self.job_opening:
			return

		job = frappe.get_doc("DKP_Job_Opening", self.job_opening)
		company = job.company_name

		replacement_policy = frappe.db.get_value("Customer", company, "custom_replacement_policy_")
		replacement_days = self.extract_days_from_policy(replacement_policy)

		if self.stage == "Joined And Left":
			self._handle_candidate_left(job, replacement_days)

		elif self.stage == "Joined" and self.is_replacement_for:
			self._handle_replacement_joined(job)

		# Update counts on job opening
		self.update_replacement_counts(job.name)

	def _handle_candidate_left(self, job, replacement_days):
		"""When candidate leaves - add to replacement history"""

		# Calculate days worked
		days_worked = 0
		within_policy = 0

		if self.joining_date and self.candidate_left_date:
			days_worked = frappe.utils.date_diff(self.candidate_left_date, self.joining_date)

		if replacement_days and days_worked <= replacement_days:
			within_policy = 1
			status = "Pending"
		else:
			status = "Not Required"

		# Update interview fields
		self.db_set("days_before_left", days_worked, update_modified=False)
		self.db_set("within_replacement_policy", within_policy, update_modified=False)
		self.db_set("replacement_policy_days", replacement_days or 0, update_modified=False)

		# Check if entry already exists in replacement history
		existing = frappe.db.exists(
			"DKP_Replacement_Log",
			{"parent": job.name, "left_interview": self.name},
		)

		if existing:
			# Update existing row
			frappe.db.set_value(
				"DKP_Replacement_Log",
				existing,
				{
					"left_date": self.candidate_left_date,
					"days_worked": days_worked,
					"within_policy": within_policy,
					"policy_days": replacement_days or 0,
					"status": status,
				},
			)
		else:
			# Add new row to replacement history
			job.reload()
			job.append(
				"replacement_history",
				{
					"left_candidate": self.candidate_name,
					"left_interview": self.name,
					"joined_date": self.joining_date,
					"left_date": self.candidate_left_date,
					"days_worked": days_worked,
					"policy_days": replacement_days or 0,
					"within_policy": within_policy,
					"replacement_candidate": None,
					"replacement_interview": None,
					"status": status,
				},
			)
			job.save(ignore_permissions=True)

	def _handle_replacement_joined(self, job):
		"""When replacement candidate joins - mark history as Replaced"""

		# Find the pending replacement row for the original interview
		log_name = frappe.db.get_value(
			"DKP_Replacement_Log",
			{"parent": job.name, "left_interview": self.is_replacement_for, "status": "Pending"},
			"name",
		)

		if log_name:
			frappe.db.set_value(
				"DKP_Replacement_Log",
				log_name,
				{
					"replacement_candidate": self.candidate_name,
					"replacement_interview": self.name,
					"status": "Replaced",
				},
			)

	def update_replacement_counts(self, job_opening_name):
		"""Update pending and total replacement counts on job opening"""
		pending = frappe.db.count(
			"DKP_Replacement_Log",
			{"parent": job_opening_name, "status": "Pending"},
		)

		total_replaced = frappe.db.count(
			"DKP_Replacement_Log",
			{"parent": job_opening_name, "status": "Replaced"},
		)

		frappe.db.set_value(
			"DKP_Job_Opening",
			job_opening_name,
			{
				"pending_replacements": pending,
				"total_replacements": total_replaced,
			},
		)

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
		frappe.msgprint(f"✅ Joining Tracker Created: {invoice.name}")

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

		# ✅ Track what changed
		changes = []
		if invoice.joining_date != self.joining_date:
			changes.append(f"Joining Date: {invoice.joining_date} → {self.joining_date}")
		if invoice.billable_ctc != str(billable_ctc):
			changes.append(f"CTC: {invoice.billable_ctc} → {billable_ctc}")
		if invoice.remarks_by_recruiter != self.remarks_for_invoice:
			changes.append("Remarks changed")

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

		# ✅ Send email to accountant if something changed
		if changes:
			self.send_update_email_to_accountant(invoice_name, changes)

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
			"DKP_Joining_Tracker", {"interview_ref": self.name}, ["billing_status"], as_dict=True
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
			numbers = re.findall(r"\d+", str(replacement_policy))
			return int(numbers[0]) if numbers else 0

	def handle_bill_sent_freeze(self, old_doc):
		is_leaving = old_doc.stage == "Joined" and self.stage == "Joined And Left"
		stage_changed = old_doc.stage != self.stage

		if stage_changed and not is_leaving:
			frappe.throw(
				_("Bill sent. Only 'Joined' to 'Joined And Left' allowed."), title=_("Document Frozen")
			)

		never_change = ["candidate_name", "job_opening", "added_by", "offered_amount", "invoice_ref"]

		for field in never_change:
			old_val = str(getattr(old_doc, field, "") or "")
			new_val = str(getattr(self, field, "") or "")

			if old_val != new_val:
				frappe.throw(
					_("Bill sent. '{0}' cannot be modified.").format(field), title=_("Document Frozen")
				)

		if str(old_doc.joining_date or "") != str(self.joining_date or ""):
			frappe.throw(_("Bill sent. 'joining_date' cannot be modified."), title=_("Document Frozen"))

		if str(old_doc.remarks_for_invoice or "") != str(self.remarks_for_invoice or ""):
			frappe.throw(
				_("Bill sent. 'remarks_for_invoice' cannot be modified."), title=_("Document Frozen")
			)

		old_left = str(old_doc.candidate_left_date or "")
		new_left = str(self.candidate_left_date or "")

		if old_left != new_left and not is_leaving:
			frappe.throw(
				_("Bill sent. 'candidate_left_date' cannot be modified."), title=_("Document Frozen")
			)

		if self.has_child_table_changed(old_doc):
			frappe.throw(_("Bill sent. Interview rounds cannot be modified."), title=_("Document Frozen"))

	def handle_full_freeze(self, old_doc):
		company_name = frappe.db.get_value("DKP_Job_Opening", self.job_opening, "company_name")
		replacement_policy = frappe.db.get_value("Customer", company_name, "custom_replacement_policy_")
		replacement_days = self.extract_days_from_policy(replacement_policy)
		policy_end_date = add_days(getdate(self.joining_date), replacement_days)

		all_fields = [
			"candidate_name",
			"job_opening",
			"added_by",
			"stage",
			"joining_date",
			"candidate_left_date",
			"offered_amount",
			"remarks_for_invoice",
			"invoice_ref",
		]

		for field in all_fields:
			if getattr(old_doc, field, None) != getattr(self, field, None):
				frappe.throw(
					_("FROZEN: {0} day policy ended on {1}.").format(
						replacement_days, policy_end_date.strftime("%d-%m-%Y")
					),
					title=_("Document Frozen"),
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
					if field not in ["modified", "modified_by", "idx"]:
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
		"message": "",
	}

	if doc.stage == "Joined" and doc.joining_date and doc.job_opening:
		company_name = frappe.db.get_value("DKP_Job_Opening", doc.job_opening, "company_name")
		if company_name:
			replacement_policy = frappe.db.get_value("Customer", company_name, "custom_replacement_policy_")
			if replacement_policy:
				replacement_days = 0
				try:
					replacement_days = int(replacement_policy)
				except ValueError:
					numbers = re.findall(r"\d+", str(replacement_policy))
					replacement_days = int(numbers[0]) if numbers else 0

				if replacement_days:
					policy_end_date = add_days(getdate(doc.joining_date), replacement_days)
					if getdate(nowdate()) > policy_end_date:
						result["is_frozen"] = True
						result["freeze_type"] = "replacement_policy"
						result["message"] = "FROZEN: {} day policy ended on {}.".format(
							replacement_days, policy_end_date.strftime("%d-%m-%Y")
						)
						return result

	joining_tracker = frappe.db.get_value(
		"DKP_Joining_Tracker", {"interview_ref": interview_name}, ["billing_status"], as_dict=True
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
