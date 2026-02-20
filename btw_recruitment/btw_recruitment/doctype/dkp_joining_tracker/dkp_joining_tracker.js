// Copyright (c) 2026, Sarim and contributors
// For license information, please see license.txt

// frappe.ui.form.on("DKP_Joining_Tracker", {
// 	refresh(frm) {

// 	},
// });

frappe.ui.form.on('DKP_Joining_Tracker', {
    
    refresh: function(frm) {
        // Button visible only when document is saved
        if (!frm.is_new()) {
            frm.fields_dict.create_sales_order_btn.$input.addClass('btn-primary');
        }
    },
    
    create_sales_order_btn: function(frm) {
        // ✅ Check if company_name exists
        if (!frm.doc.company_name) {
            frappe.msgprint({
                title: '⚠️ Error',
                message: 'Fill Company name First',
                indicator: 'red'
            });
            return;
        }
        
        // ✅ Navigate to new Sales Invoice with Customer pre-filled
        frappe.new_doc('Sales Invoice', {
            customer: frm.doc.company_name
        });
        
        frappe.show_alert({
            message: `✅ Sales Invoice created for: ${frm.doc.company_name}`,
            indicator: 'green'
        }, 3);
         // ✅ Open Sales Invoice with Customer + Joining Tracker Link filled
        frappe.new_doc('Sales Invoice', {
            customer: frm.doc.company_name,
            custom_joining_tracker_link: frm.doc.name
        });
    }
});
