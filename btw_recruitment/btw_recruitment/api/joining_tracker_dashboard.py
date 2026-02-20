import frappe

@frappe.whitelist()
def get_joining_tracker_dashboard(from_date=None, to_date=None):
    filters = {}
    
    if from_date and to_date:
        filters["joining_date"] = ["between", [from_date, to_date]]

    # 🟢 Fetching ALL fields now
    rows = frappe.get_all(
        "DKP_Joining_Tracker",
        filters=filters,
        fields=[
            "name", "company_name", "job_opening", "recipients_name",
            "recipients_mail_id", "recipients_number", "designation",
            "candidate_name", "candidate_contact", "hiring_location",
            "joining_date", "gstinuin", "status", "billable_ctc",
            "billing_fee", "billing_value", "billing_month",
            "billing_status", "recruiter", "remarks_by_recruiter",
            "accountant_remarks"
        ],
        order_by="joining_date desc"
    )

    summary = {
        "total_count": len(rows),
        "yet_to_bill_count": 0, "yet_to_bill_value": 0.0,
        "bill_sent_count": 0, "bill_sent_value": 0.0,
        "paid_count": 0, "paid_value": 0.0
    }

    for r in rows:
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

    return {
        "rows": rows,
        "summary": summary
    }