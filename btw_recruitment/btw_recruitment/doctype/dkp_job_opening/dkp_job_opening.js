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

