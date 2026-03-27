import frappe


def execute():
	"""Normalize `resume_parsed` values before DocType sync alters the column to tinyint.

	Existing rows may contain text/empty values from earlier experiments or custom SQL,
	which causes: Data truncated for column 'resume_parsed' when applying Check field schema.
	"""
	if not frappe.db.has_column("DKP_Candidate", "resume_parsed"):
		return

	if frappe.db.db_type == "mariadb":
		frappe.db.sql(
			"""
			UPDATE `tabDKP_Candidate`
			SET `resume_parsed` = IF(
				`resume_parsed` IS NOT NULL
				AND (
					`resume_parsed` IN (1, '1')
					OR LOWER(TRIM(CAST(`resume_parsed` AS CHAR))) IN ('yes', 'true', 'y')
				),
				1,
				0
			)
			"""
		)
	elif frappe.db.db_type == "postgres":
		frappe.db.sql(
			"""
			UPDATE "tabDKP_Candidate"
			SET "resume_parsed" = CASE
				WHEN LOWER(TRIM(CAST("resume_parsed" AS TEXT))) IN ('1', 'yes', 'true', 'y') THEN 1
				ELSE 0
			END
			"""
		)
	else:
		return

	frappe.db.commit()
