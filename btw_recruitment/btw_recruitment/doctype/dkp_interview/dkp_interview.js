// Copyright (c) 2025, Sarim and contributors
// For license information, please see license.txt

// frappe.ui.form.on("DKP_Interview", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on("DKP_Interview", {
    onload(frm) {
        if (!frm.doc.added_by) {
            frm.set_value("added_by", frappe.session.user);
        }
    },
    after_save(frm) {
        if (frm.doc.job_opening) {
            frappe.db.get_doc("DKP_Job_Opening", frm.doc.job_opening)
                .then(doc => {
                    // 🔁 force reload if opening is open anywhere
                    frappe.model.sync(doc);
                });
        }
    }
});
    