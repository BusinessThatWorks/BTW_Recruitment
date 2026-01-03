
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
                if (r.message.no_poach) {
                    frappe.msgprint({
                        title: "🚫 No-Poach Restriction",
                        message: `This candidate is currently employed at <b>${r.message.no_poach_company}</b>, which is marked as <b>No-Poach</b>.`,
                        indicator: "red"
                    });
                    row.candidate_name = "";
                    frm.refresh_field("table_akka");
                }
            }
        });
    }
});
frappe.ui.form.on('DKP_Job_Application', {
    refresh: function(frm) {
        // Load job openings when form loads
        if (frm.doc.company_name) {
            load_job_openings(frm);
        }
    },

    company_name: function(frm) {
        // When company is selected, clear and reload job openings
        frm.set_value('job_opening_title', '');
        load_job_openings(frm);
    }
});

function load_job_openings(frm) {
    if (!frm.doc.company_name) {
        frappe.msgprint('Please select a company first');
        return;
    }

    // Show loading indicator
    frm.set_df_property('job_opening_title', 'description', 'Loading job openings...');

    // Call Python API
    frappe.call({
        method: 'btw_recruitment.btw_recruitment.doctype.dkp_job_application.dkp_job_application.get_open_job_openings',
        args: {
            company_name: frm.doc.company_name
        },
        callback: function(r) {
            if (r.message && r.message.success) {
                const job_options = r.message.data;

                if (job_options.length === 0) {
                    frm.set_df_property('job_opening_title', 'description', 'No open positions available');
                    return;
                }

                // Create options string for Select field
                let options = job_options.map(job => job.label).join('\n');

                // Update the field with new options
                frm.set_df_property('job_opening_title', 'options', options);
                frm.set_df_property('job_opening_title', 'description', `Found ${job_options.length} open position(s)`);

                // Refresh the field
                frm.refresh_field('job_opening_title');

            } else {
                frappe.msgprint('Error loading job openings');
                frm.set_df_property('job_opening_title', 'description', 'Error loading positions');
            }
        }
    });
}
frappe.ui.form.on("DKP_JobApplication_Child", {
    candidate_name(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (!row.candidate_name) return;

        check_candidate_mapping(frm, row.candidate_name);
    }
});
function check_candidate_mapping(frm, candidate) {
    frappe.call({
        method: "btw_recruitment.btw_recruitment.api.job_application.check_candidate_existing_applications",
        args: {
            candidate: candidate,
            current_application: frm.doc.name
        },
        callback(r) {
            if (!r.message || !r.message.length) return;

            show_candidate_popover(candidate, r.message);
        }
    });
}
function show_candidate_popover(candidate, data) {
    let html = `
        <div style="line-height:1.6">
            <b>${candidate}</b> is already mapped in:
            <ul style="margin-top:8px">
    `;

    data.forEach(d => {
        let badge = "secondary";

        if (d.stage === "Joined") badge = "danger";
        else badge = "warning";

        html += `
            <li>
                <b>${d.company_name}</b>
                <span class="badge badge-${badge}" style="margin-left:6px">
                    ${d.stage}
                </span>
            </li>
        `;
    });

    html += `
            </ul>
            <div style="margin-top:10px;font-size:12px;color:#666">
                Please verify before proceeding.
            </div>
        </div>
    `;

    frappe.msgprint({
        title: "Candidate Already Mapped",
        message: html,
        indicator: "orange"
    });
}
