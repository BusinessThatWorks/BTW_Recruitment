import frappe


def before_tests() -> None:
	"""Relax app custom mandatory fields that block core Frappe test records."""
	custom_fields = frappe.get_all(
		"Custom Field",
		filters={"module": "BTW Recruitment", "reqd": 1},
		fields=["name", "dt"],
	)
	if not custom_fields:
		return

	for custom_field in custom_fields:
		frappe.db.set_value("Custom Field", custom_field.name, "reqd", 0, update_modified=False)
		frappe.clear_cache(doctype=custom_field.dt)
