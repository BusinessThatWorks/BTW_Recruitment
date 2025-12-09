// Copyright (c) 2025, Sarim and contributors
// For license information, please see license.txt

// frappe.ui.form.on("DKP_Job_Application", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on("DKP_Job_Application", {
    company_name: function(frm) {
        // Clear current value
        frm.set_value("job_opening_title", "");

        // Refresh query for job opening
        frm.set_query("job_opening_title", function() {
            return {
                filters: {
                    company: frm.doc.company_name
                }
            };
        });
    }
});