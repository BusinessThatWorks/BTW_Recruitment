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
// frappe.ui.form.on("DKP_Candidate", {
//     resume_attachment: function(frm) {
//         if (frm.doc.resume_attachment) {

//             // ensure file is saved first
//             frm.save().then(() => {
//                 frappe.call({
//                     method: "btw_recruitment.btw_recruitment.api.resume_parser.process_resume",
//                     args: {
//                         docname: frm.doc.name
//                     },
//                     freeze: true,
//                     freeze_message: "Extracting data from resume..."
//                 }).then(r => {
//                     frappe.msgprint("Resume processed successfully!");
//                     frm.reload_doc();
//                 });
//             });
//         }
//     }
// });

// frappe.ui.form.on("DKP_Candidate", {
//     refresh(frm) {
//         const manual_fields = [
//             "alternate_phone",
//             "gender",
//             "current_ctc",
//             "expected_ctc",
//             "notice_period_days",
//             "last_working_day",
//             "resume_source"
//         ];

//         manual_fields.forEach(fieldname => {
//             const field = frm.get_field(fieldname);

//             if (field && (!frm.doc[fieldname] || frm.doc[fieldname] === "")) {
//                 $(field.input_area).css({
//                     "border": "2px solid #ff4d4d",
//                     "background-color": "#ffecec",
//                     "border-radius": "4px"
//                 });
//             }
//         });
//     }
// });
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
                    frappe.msgprint("Resume processed successfully!");

                    // Set flag on client side also (safe)
                    frm.doc.resume_parsed = 1;

                    // Reload & highlight
                    frm.reload_doc();
                });
            });
        }
    },

    refresh(frm) {
        // highlight only AFTER resume parsing
        if (!frm.doc.resume_parsed) return;

        const manual_fields = [
            "alternate_phone",
            "gender",
            "current_ctc",
            "expected_ctc",
            "notice_period_days",
            "last_working_day",
            "resume_source"
        ];

        manual_fields.forEach(fieldname => {
            const field = frm.get_field(fieldname);

            if (field && (!frm.doc[fieldname] || frm.doc[fieldname] === "")) {
                $(field.input_area).css({
                    "border": "2px solid #ff4d4d",
                    "background-color": "#ffecec",
                    "border-radius": "4px"
                });
            }
        });
    }
});

