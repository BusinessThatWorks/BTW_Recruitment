frappe.ui.form.on("DKP_Candidate", {
    resume_attachment(frm) {
        if (frm.doc.resume_attachment) {

            frm.save().then(() => {
                frappe.call({
                    method: "btw_recruitment.btw_recruitment.api.resume_parser.process_resume",
                    args: { docname: frm.doc.name },
                    freeze: true,
                    freeze_message: "Extracting data from resume..."
                }).then(r => {

                    // backend returned current docname
                    const currentDocname = r.message?.docname || frm.doc.name;

                    // Now call the separate renamer
                    frappe.call({
                        method: "btw_recruitment.btw_recruitment.api.naming.rename_candidate_after_parse",
                        args: { docname: currentDocname },
                    }).then(res => {
                        const payload = res.message || {};
                        if (payload.renamed && payload.new_name) {
                            // Navigate to the renamed document so UI shows parsed fields
                            frappe.set_route("Form", "DKP_Candidate", payload.new_name);
                        } else {
                            // Either not renamed or rename failed - reload current
                            frm.reload_doc();
                            // Optionally show reason
                            if (payload.reason) {
                                console.log("Rename skipped:", payload.reason);
                            }
                        }
                    }).catch(err => {
                        // If renaming call itself fails, at least reload current doc
                        console.error("Rename API error", err);
                        frm.reload_doc();
                    });
                    frappe.msgprint("Resume processed successfully! Please review highlighted fields.");

                });

            });
        }
    },

    // REFRESH - HIGHLIGHT
    refresh(frm) {

        // ALWAYS remove old highlights first
        removeHighlights(frm);

        // highlight only AFTER resume parsing
        if (!frm.doc.resume_parsed) return;

        const manual_fields = [
            "alternate_phone",
            "gender",
            "current_ctc",
            "expected_ctc",
            "notice_period_days",
            "last_working_day",
            "resume_source",
            "currently_employed",
            "official_notice_period_days",
            "serving_notice",
            "marital_status",
            "primary_skill_set",
            "secondary_skill_set",
            "communication_skill",
            "remarks"
        ];

        manual_fields.forEach(fieldname => {

            const field = frm.get_field(fieldname);
            const value = frm.doc[fieldname];

            const isEmpty =
                value === null ||
                value === undefined ||
                value === "" ||
                value === 0;

            if (field && isEmpty) {
                // field input
                if (field.$input) {
                    field.$input.css({
                        "border": "2px solid #ff4d4d",
                        "background-color": "#ffecec",
                        "border-radius": "4px"
                    });
                }
            }
        });
    }
});


// CLEAR ALL HIGHLIGHTS (GLOBAL CLEANER)
function removeHighlights(frm) {
    Object.values(frm.fields_dict).forEach(field => {

        if (field.$input) {
            field.$input.css({
                "border": "",
                "background-color": "",
                "border-radius": ""
            });
        }

    });
}
    
frappe.ui.form.on("DKP_Candidate", {
    after_save(frm) {
        // Only run rename logic when resume is NOT parsed
        if (!frm.doc.resume_parsed) {
            frappe.call({
                method: "btw_recruitment.btw_recruitment.api.naming.rename_candidate_after_parse",
                args: { docname: frm.doc.name },
            }).then(res => {
                const payload = res.message || {};
                if (payload.renamed && payload.new_name) {
                    frappe.set_route("Form", "DKP_Candidate", payload.new_name);
                }
            });
        }
    }
});
