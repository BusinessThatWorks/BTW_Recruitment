
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


class DKP_Interview(Document):

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

            

