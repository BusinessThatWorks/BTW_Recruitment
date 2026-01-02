import frappe
from frappe.model.document import Document

class DKP_Job_Opening(Document):

    def on_update(self):
        self.send_job_opening_email()

    def send_job_opening_email(self):
        if not self.assign_recruiter:
            return

        recruiter_email = self.assign_recruiter  # 👈 already email

        subject = f"New Job Opening Assigned – {self.name}"

        html_content = f"""
        <p>Hello,</p>

        <p>A new job opening has been assigned to you.</p>

        <ul>
            <li><b>Company:</b> {self.company}</li>
            <li><b>Designation:</b> {self.designation}</li>
            <li><b>Department:</b> {self.department or "-"}</li>
            <li><b>Location:</b> {self.location or "-"}</li>
        </ul>

        <p>Regards,<br>HR Team</p>
        """

        frappe.sendmail(
            recipients=[recruiter_email],
            subject=subject,
            content=html_content
        )
