frappe.ui.form.on('DKP_Joining_Tracker', {
    
    refresh: function(frm) {
        // Only show when document is saved (not new)
        if (!frm.is_new()) {
            
            // Primary Button (Blue) - Action bar mein
            frm.add_custom_button(__('Create Sales Invoice'), () => {
                
                if (!frm.doc.company_name) {
                    frappe.msgprint({
                        title: '⚠️ Error',
                        message: 'Fill Company name First',
                        indicator: 'red'
                    });
                    return;
                }
                
                frappe.new_doc('Sales Invoice', {
                    customer: frm.doc.company_name,
                    custom_joining_tracker_link: frm.doc.name
                });
                
                frappe.show_alert({
                    message: `✅ Sales Invoice created for: ${frm.doc.company_name}`,
                    indicator: 'green'
                }, 3);
            });
            
            // Agar Primary (Blue) banana hai to:
            frm.change_custom_button_type('Create Sales Invoice', null, 'primary');
        }
    }
});
