// Copyright (c) 2026, Sarim and contributors
// For license information, please see license.txt

frappe.query_reports["Job Opening"] = {
    filters: [
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
            width: "80"
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            width: "80"
        },
        {
            fieldname: "company_name",
            label: __("Company"),
            fieldtype: "Link",
            options: "DKP_Lead",
            width: "100"
        },
        {
            fieldname: "designation",
            label: __("Designation"),
            fieldtype: "Link",
            options: "Designation",
            width: "100"
        },
        {
            fieldname: "department",
            label: __("Department"),
            fieldtype: "Link",
            options: "Department",
            width: "100"
        },
        {
            fieldname: "recruiter",
            label: __("Recruiter"),
            fieldtype: "Link",
            options: "User",
            width: "100"
        },
        {
            fieldname: "status",
            label: __("Status"),
            fieldtype: "Select",
            options: "\nOpen\nClosed – Hired\nOn Hold\nCancelled",
            width: "80"
        },
        {
            fieldname: "priority",
            label: __("Priority"),
            fieldtype: "Select",
            options: "\nLow\nMedium\nHigh\nCritical",
            width: "80"
        },
        {
            fieldname: "ageing",
            label: __("Min Ageing (Days)"),
            fieldtype: "Int",
            width: "80"
        },
        // 👇 Sorting Filters (visible so user can also manually select)
        {
            fieldname: "sort_by",
            label: __("Sort By"),
            fieldtype: "Select",
            options: "\nname\ncompany_name\ndesignation\ndepartment\nstatus\npriority\nnumber_of_positions\ncreation\nageing",
            default: "creation",
            width: "100"
        },
        {
            fieldname: "sort_order",
            label: __("Sort Order"),
            fieldtype: "Select",
            options: "\nDesc\nAsc",
            default: "Desc",
            width: "80"
        }
    ]
};