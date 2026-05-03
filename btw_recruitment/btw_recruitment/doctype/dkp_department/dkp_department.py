import frappe
from frappe import _
from frappe.model.document import Document


class DKP_Department(Document):
	def validate(self):
		self.department = " ".join((self.department or "").split()).strip()

		if not self.department:
			frappe.throw(_("Department name is required."))

		duplicate = frappe.db.sql(
			"""
			SELECT name
			FROM `tabDKP_Department`
			WHERE LOWER(TRIM(department)) = LOWER(TRIM(%s))
			  AND name != %s
			LIMIT 1
			""",
			(self.department, self.name or ""),
			as_dict=True,
		)

		if duplicate:
			frappe.throw(
				_("Department <b>{0}</b> already exists.").format(self.department),
				title=_("Duplicate Department"),
			)

	def on_update(self):
		if getattr(frappe.flags, "in_department_auto_rename", False):
			return

		if self.is_new():
			return

		new_name = (self.department or "").strip()
		if not new_name or self.name == new_name:
			return

		if frappe.db.exists("DKP_Department", new_name):
			frappe.throw(
				_("Cannot rename. Department ID <b>{0}</b> already exists.").format(new_name),
				title=_("Duplicate Department"),
			)

		old_name = self.name

		frappe.flags.in_department_auto_rename = True
		try:
			frappe.rename_doc(
				"DKP_Department",
				old_name,
				new_name,
				merge=False,
				force=True,
			)
		finally:
			frappe.flags.in_department_auto_rename = False
