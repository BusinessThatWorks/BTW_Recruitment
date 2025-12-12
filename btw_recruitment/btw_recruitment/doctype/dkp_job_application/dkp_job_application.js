
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

frappe.ui.form.on("DKP_JobApplication_Child", {
    candidate_name: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (!row.candidate_name) return;

        frappe.call({
            method: "btw_recruitment.btw_recruitment.doctype.dkp_job_application.dkp_job_application.get_candidate_status",
            args: {
                candidate: row.candidate_name
            },
            callback: function(r) {
                if (!r.message) return;

                if (r.message.blacklisted) {
                    frappe.msgprint({
                        title: "🚫 Candidate Blacklisted",
                        message: `This candidate is blacklisted and cannot be added.`,
                        indicator: "red"
                    });
                    row.candidate_name = "";
                    frm.refresh_field("table_akka");
                }

                if (r.message.cooling) {
                    frappe.msgprint({
                        title: "❄️ Cooling Period Active",
                        message: `Cooling period remaining: <b>${r.message.remaining_days} days</b>`,
                        indicator: "orange"
                    });
                    row.candidate_name = "";
                    frm.refresh_field("table_akka");
                }
            }
        });
    }
});