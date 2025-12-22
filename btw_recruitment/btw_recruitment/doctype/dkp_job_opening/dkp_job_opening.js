// Copyright (c) 2025, Sarim and contributors
// For license information, please see license.txt

// frappe.ui.form.on("DKP_Job_Opening", {
// 	refresh(frm) {

// 	},
// });
// frappe.ui.form.on('DKP_Job_Opening', {
//     refresh(frm) {
//         console.log("Setting query for assign_recruiter...");  // DEBUG

//         frm.set_query("assign_recruiter", function() {
//             console.log("assign_recruiter query fired");  // DEBUG
//             return {
//                 query: "frappe.core.doctype.user.user.user_query",
//                 filters: {
//                     role: "DKP Recruiter"
//                 }
//             };
//         });
//     }
// });
frappe.ui.form.on('DKP_Job_Opening', {
    refresh(frm) {

       frm.set_query("assign_recruiter", function() {
            return {
                filters: {
                    "role_profile_name": "DKP Recruiter"
                }
            };
        });

    }
});
frappe.ui.form.on("Job Opening", {
    refresh(frm) {
        toggle_closed_cancel_reason(frm);
    },
    status(frm) {
        toggle_closed_cancel_reason(frm);
    }
});

function toggle_closed_cancel_reason(frm) {
    const show_field = frm.doc.status === "Closed – Cancelled";

    // show / hide
    frm.set_df_property(
        "closed_cancel_reason",
        "hidden",
        !show_field
    );

    // mandatory only when visible
    frm.set_df_property(
        "closed_cancel_reason",
        "reqd",
        show_field
    );

    // cleanup when status changes back
    if (!show_field) {
        frm.set_value("closed_cancel_reason", null);
    }
}

