
# import frappe
# from frappe.model.document import Document


# class DKP_Interview(Document):

#     # def after_insert(self):
#     #     frappe.db.set_value(
#     #         "DKP_JobApplication_Child",
#     #         {
#     #             "parent": self.job_opening,
#     #             "candidate_name": self.candidate_name
#     #         },
#     #         "interview",
#     #         self.name
#     #     )
#     import frappe
# from frappe.model.document import Document


# class DKP_Interview(Document):

#     def after_insert(self):
#         # 🔗 Interview link child table me set karo
#         frappe.db.set_value(
#             "DKP_JobApplication_Child",
#             {
#                 "parent": self.job_opening,
#                 "candidate_name": self.candidate_name
#             },
#             "interview",
#             self.name
#         )

#         # 🟢 Initial stage sync (first time create pe)
#         self.sync_stage_to_opening()

#     def on_update(self):
#         # 🔁 Jab bhi interview update ho (stage change etc.)
#         self.sync_stage_to_opening()

#     def sync_stage_to_opening(self):
#         if not self.job_opening or not self.candidate_name or not self.stage:
#             return

#         frappe.db.set_value(
#             "DKP_JobApplication_Child",
#             {
#                 "parent": self.job_opening,
#                 "candidate_name": self.candidate_name
#             },
#             "stage",
#             self.stage
#         )
import frappe
from frappe.model.document import Document
from frappe.model.naming import make_autoname

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

    def sync_stage_to_opening(self):
        if not self.job_opening or not self.candidate_name:
            return

        update_values = {}

        if self.stage:
            update_values["stage"] = self.stage

        if self.substage:
            update_values["sub_stages_interview"] = self.substage  # ✅ correct fieldname

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
        job = frappe.get_doc("DKP_Job_Opening", self.job_opening)

        if not job.number_of_positions:
            return

        # 🔥 IMPORTANT: cast to int
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

