import frappe


def execute():
	updated = 0
	blank = 0

	openings = frappe.get_all("DKP_Job_Opening", pluck="name")

	for opening in openings:
		existing = frappe.db.get_value("DKP_Job_Opening", opening, "recruiter")
		if existing:
			continue

		rows = frappe.get_all(
			"DKP_JobOpeningRecruiter_Child",
			filters={
				"parent": opening,
				"parenttype": "DKP_Job_Opening",
				"parentfield": "assign_recruiter",
			},
			fields=["recruiter_name"],
			order_by="idx asc",
			limit=1,
		)

		recruiter = rows[0].recruiter_name if rows and rows[0].recruiter_name else None

		if recruiter:
			frappe.db.set_value(
				"DKP_Job_Opening",
				opening,
				"recruiter",
				recruiter,
				update_modified=False,
			)
			updated += 1
		else:
			blank += 1

	frappe.db.commit()
	print(f"Recruiter migration done. Updated: {updated}, Blank: {blank}")
