frappe.ui.form.on("DKP_Department", {
	after_save(frm) {
		if (frm.doc.department && frm.doc.name !== frm.doc.department) {
			frappe.set_route("Form", "DKP_Department", frm.doc.department);
		}
	},
});
