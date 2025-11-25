// Copyright (c) 2025, Sarim and contributors
// For license information, please see license.txt

// frappe.ui.form.on("DKP_Candidate", {
// 	refresh(frm) {

// 	},
// });
// frappe.ui.form.on("DKP_Candidate", {
//     resume_attachment: function(frm) {
//         if (frm.doc.resume_attachment) {
//             frappe.call({
//                 method: "btw_recruitment.btw_recruitment.api.resume_parser.process_resume",
//                 args: {
//                     docname: frm.doc.name
//                 },
//                 freeze: true,
//                 freeze_message: "Extracting data from resume..."
//             }).then(r => {
//                 frappe.msgprint("Resume processed successfully!");
//                 frm.reload_doc();
//             });
//         }
//     }
// });
frappe.ui.form.on("DKP_Candidate", {
    resume_attachment: function(frm) {
        if (frm.doc.resume_attachment) {

            // ensure file is saved first
            frm.save().then(() => {
                frappe.call({
                    method: "btw_recruitment.btw_recruitment.api.resume_parser.process_resume",
                    args: {
                        docname: frm.doc.name
                    },
                    freeze: true,
                    freeze_message: "Extracting data from resume..."
                }).then(r => {
                    frappe.msgprint("Resume processed successfully!");
                    frm.reload_doc();
                });
            });
        }
    }
});
