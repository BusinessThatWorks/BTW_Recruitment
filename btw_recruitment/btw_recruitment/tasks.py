from datetime import datetime, timedelta

import frappe
from frappe.utils import formatdate, now_datetime, today
# from datetime import datetime, timedelta

# import frappe
# from frappe.utils import add_days, date_diff, formatdate, now_datetime, today

def send_interview_reminders():
	"""
	Scheduler job: Runs every 5 minutes
	Sends reminder emails 25-35 minutes before interview
	"""

	current_time = now_datetime()
	current_date = today()

	# Window: 25 to 35 minutes from now
	reminder_window_start = current_time + timedelta(minutes=25)
	reminder_window_end = current_time + timedelta(minutes=35)

	# Get today's interviews where reminder not sent
	interviews = frappe.db.sql(
		"""
        SELECT
            parent.name as interview_name,
            parent.candidate_name,
            parent.job_opening,
            parent.added_by,
            child.name as child_name,
            child.interview_date,
            child.`from` as from_time,
            child.`to` as to_time,
            child.interview_stage,
            child.interviewer_email,
            child.reminder_sent
        FROM `tabDKP_Interview` parent
        INNER JOIN `tabDKP_Interview_Child` child ON child.parent = parent.name
        WHERE child.interview_date = %s
        AND child.`from` IS NOT NULL
        AND (child.reminder_sent IS NULL OR child.reminder_sent = 0)
    """,
		current_date,
		as_dict=True,
	)

	for interview in interviews:
		try:
			process_single_interview(interview, reminder_window_start, reminder_window_end)
		except Exception as e:
			frappe.log_error(f"Error processing interview reminder: {e!s}", "Interview Reminder Error")


def process_single_interview(interview, window_start, window_end):
	"""Process single interview row"""

	interview_time = interview.from_time
	interview_date = interview.interview_date

	# Handle timedelta format
	if isinstance(interview_time, timedelta):
		total_seconds = int(interview_time.total_seconds())
		hours = total_seconds // 3600
		minutes = (total_seconds % 3600) // 60
		seconds = total_seconds % 60
		interview_time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
	else:
		interview_time_str = str(interview_time)

	# Create datetime
	interview_datetime_str = f"{interview_date} {interview_time_str}"
	interview_datetime = datetime.strptime(interview_datetime_str, "%Y-%m-%d %H:%M:%S")

	# Check if in window
	if not (window_start <= interview_datetime <= window_end):
		return

	# Get candidate details
	candidate_email = None
	candidate_display_name = interview.candidate_name or ""

	if interview.candidate_name:
		candidate_data = frappe.db.get_value(
			"DKP_Candidate", interview.candidate_name, ["email", "candidate_name"], as_dict=True
		)
		if candidate_data:
			candidate_email = candidate_data.get("email")
			candidate_display_name = candidate_data.get("candidate_name") or interview.candidate_name

	# Get job details
	job_title = ""
	company_name = ""
	if interview.job_opening:
		job_data = frappe.db.get_value(
			"DKP_Job_Opening", interview.job_opening, ["designation", "company_name"], as_dict=True
		)
		if job_data:
			job_title = job_data.get("designation", "")
			company_name = job_data.get("company_name", "")

	# Send email
	success = send_reminder_email(
		interview=interview,
		candidate_email=candidate_email,
		candidate_display_name=candidate_display_name,
		job_title=job_title,
		company_name=company_name,
		from_time_str=interview_time_str,
	)

	# Mark as sent in database
	if success:
		frappe.db.set_value("DKP_Interview_Child", interview.child_name, "reminder_sent", 1)
		frappe.db.commit()


# def send_reminder_email(
# 	interview, candidate_email, candidate_display_name, job_title, company_name, from_time_str
# ):
# 	"""Send the reminder email"""

# 	subject = f"Reminder: Interview Coming Up - {candidate_display_name} | {interview.interview_stage}"

# 	# Format times
# 	from_time = from_time_str[:5] if len(from_time_str) > 5 else from_time_str
# 	to_time = interview.to_time

# 	if isinstance(to_time, timedelta):
# 		total_seconds = int(to_time.total_seconds())
# 		hours = total_seconds // 3600
# 		minutes = (total_seconds % 3600) // 60
# 		to_time = f"{hours:02d}:{minutes:02d}"
# 	else:
# 		to_time = str(to_time)[:5] if to_time else "N/A"

# 	message = f"""
#     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
#         <p>Dear Participant,</p>

#         <p>Reminder for your upcoming interview.</p>

#         <h3 style="color: #2c3e50;">📋 Interview Details:</h3>

#         <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
#             <tr style="background-color: #f8f9fa;">
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold; width: 40%;">Candidate Name</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{candidate_display_name}</td>
#             </tr>
#             <tr>
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Interview Stage</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{interview.interview_stage or "N/A"}</td>
#             </tr>
#             <tr style="background-color: #f8f9fa;">
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">📅 Date</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{formatdate(interview.interview_date)}</td>
#             </tr>
#             <tr>
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">🕐 Time</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{from_time} - {to_time}</td>
#             </tr>
#             <tr style="background-color: #f8f9fa;">
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">💼 Position</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{job_title or "N/A"}</td>
#             </tr>
#             <tr>
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">🏢 Company</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{company_name or "N/A"}</td>
#             </tr>
#         </table>

#         <p style="color: #2c3e50; font-weight: bold;">Please be prepared and join on time. Good luck! 🍀</p>

#         <p>Best Regards,<br><strong>HR Team</strong></p>
#     </div>
#     """

# 	recipients = []

# 	# Candidate
# 	if candidate_email and candidate_email not in ["Not provided", "", None]:
# 		recipients.append(candidate_email)

# 	# Interviewer(s)
# 	if interview.interviewer_email:
# 		interviewer_emails = [e.strip() for e in interview.interviewer_email.split(",") if e.strip()]
# 		recipients.extend(interviewer_emails)

# 	# Recruiter
# 	if interview.added_by:
# 		recruiter_email = interview.added_by
# 		if recruiter_email and "@" not in str(recruiter_email):
# 			recruiter_email = frappe.db.get_value("User", interview.added_by, "email")
# 		if recruiter_email:
# 			recipients.append(recruiter_email)

# 	# Remove duplicates
# 	recipients = list(set([r for r in recipients if r and str(r).strip()]))

# 	if not recipients:
# 		return False

# 	try:
# 		frappe.sendmail(recipients=recipients, subject=subject, message=message, now=True)
# 		return True

# 	except Exception as e:
# 		frappe.log_error(f"Failed to send interview reminder: {e!s}", "Interview Reminder Error")
# 		return False
def send_reminder_email(
	interview, candidate_email, candidate_display_name, job_title, company_name, from_time_str
):
	"""Send the reminder email"""

	subject = f"Reminder: Interview Coming Up - {candidate_display_name} | {interview.interview_stage}"

	# Format times
	from_time = from_time_str[:5] if len(from_time_str) > 5 else from_time_str
	to_time = interview.to_time

	if isinstance(to_time, timedelta):
		total_seconds = int(to_time.total_seconds())
		hours = total_seconds // 3600
		minutes = (total_seconds % 3600) // 60
		to_time = f"{hours:02d}:{minutes:02d}"
	else:
		to_time = str(to_time)[:5] if to_time else "N/A"

	message = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Dear Participant,</p>

        <p>Reminder for your upcoming interview.</p>

        <h3 style="color: #2c3e50;">📋 Interview Details:</h3>

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
                <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">📅 Date</td>
                <td style="padding: 12px; border: 1px solid #dee2e6;">{formatdate(interview.interview_date)}</td>
            </tr>
            <tr>
                <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">🕐 Time</td>
                <td style="padding: 12px; border: 1px solid #dee2e6;">{from_time} - {to_time}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
                <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">💼 Position</td>
                <td style="padding: 12px; border: 1px solid #dee2e6;">{job_title or "N/A"}</td>
            </tr>
            <tr>
                <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">🏢 Company</td>
                <td style="padding: 12px; border: 1px solid #dee2e6;">{company_name or "N/A"}</td>
            </tr>
        </table>

        <p style="color: #2c3e50; font-weight: bold;">Please be prepared and join on time. Good luck! 🍀</p>

        <p>Best Regards,<br><strong>HR Team</strong></p>
    </div>
    """

	recipients = []
	cc_list = []  # 👈 NEW: CC list add ki

	# Candidate - TO me
	if candidate_email and candidate_email not in ["Not provided", "", None]:
		recipients.append(candidate_email)

	# Interviewer(s) - TO me
	if interview.interviewer_email:
		interviewer_emails = [e.strip() for e in interview.interviewer_email.split(",") if e.strip()]
		recipients.extend(interviewer_emails)

	# Recruiter - CC me (changed from TO) 👈 CHANGED
	if interview.added_by:
		recruiter_email = interview.added_by
		if recruiter_email and "@" not in str(recruiter_email):
			recruiter_email = frappe.db.get_value("User", interview.added_by, "email")
		if recruiter_email:
			cc_list.append(recruiter_email)  # 👈 CC me daala

	# Remove duplicates
	recipients = list(set([r for r in recipients if r and str(r).strip()]))
	cc_list = list(set([c for c in cc_list if c and str(c).strip()]))  # 👈 CC cleanup

	# Agar recruiter already TO me hai to CC se hatao 👈 NEW
	cc_list = [c for c in cc_list if c not in recipients]

	if not recipients:
		return False

	try:
		frappe.sendmail(
			recipients=recipients,
			cc=cc_list, 
			subject=subject,
			message=message,
			now=True
		)
		return True

	except Exception as e:
		frappe.log_error(f"Failed to send interview reminder: {e!s}", "Interview Reminder Error")
		return False


# Code for job opening on hold reminder for 30 days to companies. 
# Scheduler runs daily and checks for job openings which are on hold for more than 30 days and 
# sends reminder email to the company and assigned recruiters.
# def send_on_hold_job_reminders():
#     """
#     Scheduler job: Runs daily
#     Sends reminder to companies whose job openings are On Hold for 30+ days
#     """
    
#     thirty_days_ago = add_days(today(), -30)
    
#     # Get On Hold jobs older than 30 days where reminder not sent
#     jobs = frappe.get_all(
#         "DKP_Job_Opening",
#         filters={
#             "status": "On Hold",
#             "creation": ["<=", thirty_days_ago],
#             "hold_reminder_sent": 0
#         },
#         fields=[
#             "name",
#             "company_name",
#             "designation",
#             "location",
#             "number_of_positions",
#             "min_experience_years",
#             "max_experience_years",
#             "min_ctc",
#             "max_ctc",
#             "creation"
#         ]
#     )
    
#     for job in jobs:
#         try:
#             success = send_hold_reminder_email(job)
#             if success:
#                 frappe.db.set_value("DKP_Job_Opening", job.name, "hold_reminder_sent", 1)
#                 frappe.db.commit()
#         except Exception as e:
#             frappe.log_error(
#                 f"Error sending hold reminder for {job.name}: {str(e)}", 
#                 "Hold Reminder Error"
#             )


# def send_hold_reminder_email(job):
#     """Send reminder email to company and assigned recruiters"""
    
#     # Get customer email
#     customer_email = get_customer_email(job.company_name)
    
#     # Get assigned recruiters emails
#     recruiter_emails = get_assigned_recruiters(job.name)
    
#     # Build recipients list
#     recipients = []
#     cc_list = []
    
#     # Customer email - TO me
#     if customer_email:
#         recipients.append(customer_email)
    
#     # Recruiters - CC me
#     if recruiter_emails:
#         cc_list.extend(recruiter_emails)
    
#     # Remove duplicates
#     recipients = list(set([r for r in recipients if r and str(r).strip()]))
#     cc_list = list(set([c for c in cc_list if c and str(c).strip()]))
    
#     # CC se TO wale remove karo
#     cc_list = [c for c in cc_list if c not in recipients]
    
#     if not recipients:
#         frappe.log_error(
#             f"No email found for customer: {job.company_name}", 
#             "Hold Reminder - No Email"
#         )
#         return False
    
#     # Calculate age
#     age_days = date_diff(today(), job.creation)
    
#     subject = f"Action Required: Job Opening On Hold - {job.designation} | {job.company_name}"
    
#     message = f"""
#     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
#         <p>Dear Hiring Team,</p>
        
#         <p>We noticed that the following job opening has been <strong>On Hold</strong> on our platform 
#         for <strong>{age_days} days</strong> without any updates from your end.</p>
        
#         <h3 style="color: #2c3e50;">Job Opening Details:</h3>
        
#         <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
#             <tr style="background-color: #f8f9fa;">
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold; width: 40%;">Position</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{job.designation}</td>
#             </tr>
#             <tr>
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Company</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{job.company_name}</td>
#             </tr>
#             <tr style="background-color: #f8f9fa;">
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Location</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{job.location or "N/A"}</td>
#             </tr>
#             <tr>
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">No. of Positions</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{job.number_of_positions or "N/A"}</td>
#             </tr>
#             <tr style="background-color: #f8f9fa;">
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">Experience</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{job.min_experience_years or 0} - {job.max_experience_years or 0} Years</td>
#             </tr>
#             <tr>
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">CTC Range</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">₹{job.min_ctc or 0} - ₹{job.max_ctc or 0} Monthly</td>
#             </tr>
#             <tr>
#                 <td style="padding: 12px; border: 1px solid #dee2e6; font-weight: bold;">On Hold Since</td>
#                 <td style="padding: 12px; border: 1px solid #dee2e6;">{formatdate(job.creation)}</td>
#             </tr>
#         </table>
        
#         <p><strong>Please let us know:</strong></p>
#         <ul>
#             <li>Would you like to <strong>reopen</strong> this position?</li>
#             <li>Should we <strong>close</strong> this opening?</li>
#             <li>Any other updates regarding this requirement?</li>
#         </ul>
        
#         <p>Your response will help us serve you better.</p>
        
#         <p>Best Regards,<br><strong>Recruitment Team</strong></p>
#     </div>
#     """
    
#     try:
#         frappe.sendmail(
#             recipients=recipients,
#             cc=cc_list,
#             subject=subject,
#             message=message,
#             now=True
#         )
#         return True
#     except Exception as e:
#         frappe.log_error(f"Failed to send hold reminder: {str(e)}", "Hold Reminder Error")
#         return False


# def get_customer_email(customer_name):
#     """Get email from Customer, Contact, or Address"""
    
#     if not customer_name:
#         return None
    
#     # Method 1: From linked Contact
#     contact_email = frappe.db.sql("""
#         SELECT c.email_id
#         FROM `tabContact` c
#         INNER JOIN `tabDynamic Link` dl ON dl.parent = c.name
#         WHERE dl.link_doctype = 'Customer' 
#         AND dl.link_name = %s
#         AND c.email_id IS NOT NULL
#         AND c.email_id != ''
#         ORDER BY c.is_primary_contact DESC
#         LIMIT 1
#     """, customer_name)
    
#     if contact_email and contact_email[0][0]:
#         return contact_email[0][0]
    
#     # Method 2: From linked Address
#     address_email = frappe.db.sql("""
#         SELECT a.email_id
#         FROM `tabAddress` a
#         INNER JOIN `tabDynamic Link` dl ON dl.parent = a.name
#         WHERE dl.link_doctype = 'Customer' 
#         AND dl.link_name = %s
#         AND a.email_id IS NOT NULL
#         AND a.email_id != ''
#         ORDER BY a.is_primary_address DESC
#         LIMIT 1
#     """, customer_name)
    
#     if address_email and address_email[0][0]:
#         return address_email[0][0]
    
#     return None


# def get_assigned_recruiters(job_name):
#     """Get emails of assigned recruiters from child table"""
    
#     recruiters = frappe.get_all(
#         "DKP_JobOpeningRecruiter_Child",
#         filters={"parent": job_name},
#         fields=["recruiter_name"]
#     )
    
#     emails = []
#     for r in recruiters:
#         if r.recruiter_name:
#             email = frappe.db.get_value("User", r.recruiter_name, "email")
#             if email:
#                 emails.append(email)
    
#     return emails