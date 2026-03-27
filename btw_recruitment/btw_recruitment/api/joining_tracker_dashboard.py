import json

import frappe
from frappe.utils import cint


@frappe.whitelist()
def get_joining_tracker_dashboard(from_date=None, to_date=None, limit=20, offset=0, filters=None):
	"""
	Joining Tracker dashboard data with:
	- KPIs for the selected date range
	- Paginated table rows
	- Optional inline filters on all columns (DataTable)
	"""
	limit = cint(limit)
	offset = cint(offset)

	# -----------------------------
	# Base filters (date range)
	# -----------------------------
	base_filters = []
	if from_date and to_date:
		base_filters.append(["joining_date", "between", [from_date, to_date]])

	# -----------------------------
	# Summary KPIs (date filters only)
	# -----------------------------
	summary_rows = frappe.get_all(
		"DKP_Joining_Tracker",
		filters=base_filters,
		fields=["name", "billing_value", "billing_status"],
	)

	summary = {
		"total_count": len(summary_rows),
		"yet_to_bill_count": 0,
		"yet_to_bill_value": 0.0,
		"bill_sent_count": 0,
		"bill_sent_value": 0.0,
		"paid_count": 0,
		"paid_value": 0.0,
	}

	for r in summary_rows:
		val = r.billing_value or 0.0
		status = r.billing_status

		if status == "Yet to Bill" or not status:
			summary["yet_to_bill_count"] += 1
			summary["yet_to_bill_value"] += val
		elif status == "Bill Sent":
			summary["bill_sent_count"] += 1
			summary["bill_sent_value"] += val
		elif status == "Payment Received":
			summary["paid_count"] += 1
			summary["paid_value"] += val

	# -----------------------------
	# Parse inline filters (DataTable)
	# -----------------------------
	parsed_filters = {}
	if filters:
		if isinstance(filters, str):
			try:
				parsed_filters = json.loads(filters) or {}
			except Exception:
				parsed_filters = {}
		elif isinstance(filters, dict):
			parsed_filters = filters

	# Build filters for table rows: date range + inline filters
	table_filters = list(base_filters)

	filter_mapping = {
		"Tracker ID": "name",
		"Company": "company_name",
		"Job Opening": "job_opening",
		"Candidate Name": "candidate_name",
		"Designation": "designation",
		"Joining Date": "joining_date",
		"Status": "status",
		"Billing Status": "billing_status",
		"Billing Month": "billing_month",
		"Candidate Contact": "candidate_contact",
		"Hiring Location": "hiring_location",
		"Recruiter": "recruiter",
		"Recipient Name": "recipients_name",
		"Recipient Mail": "recipients_mail_id",
		"Recipient No.": "recipients_number",
		"GSTIN/UIN": "gstinuin",
	}

	for col_name, fieldname in filter_mapping.items():
		value = (parsed_filters or {}).get(col_name)
		if not value:
			continue

		# Special handling for date field: expect exact date match
		if fieldname == "joining_date":
			table_filters.append([fieldname, "=", value])
		else:
			table_filters.append([fieldname, "like", f"%{value}%"])

	# -----------------------------
	# Total count for pagination
	# -----------------------------
	total = frappe.db.count("DKP_Joining_Tracker", filters=table_filters)

	common_fields = [
		"name",
		"company_name",
		"job_opening",
		"recipients_name",
		"recipients_mail_id",
		"recipients_number",
		"designation",
		"candidate_name",
		"candidate_contact",
		"hiring_location",
		"joining_date",
		"gstinuin",
		"status",
		"billable_ctc",
		"billing_fee",
		"billing_value",
		"billing_month",
		"billing_status",
		"recruiter",
		"remarks_by_recruiter",
		"accountant_remarks",
	]

	# -----------------------------
	# Fetch rows (paginated or full for export)
	# -----------------------------
	if limit == 0:
		rows = frappe.get_all(
			"DKP_Joining_Tracker",
			filters=table_filters,
			fields=common_fields,
			order_by="joining_date desc",
		)
	else:
		rows = frappe.get_all(
			"DKP_Joining_Tracker",
			filters=table_filters,
			fields=common_fields,
			order_by="joining_date desc",
			limit_start=offset,
			limit_page_length=limit,
		)

	return {
		"rows": rows,
		"summary": summary,
		"total": total,
	}
