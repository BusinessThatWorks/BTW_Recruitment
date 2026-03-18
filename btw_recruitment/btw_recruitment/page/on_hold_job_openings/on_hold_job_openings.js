frappe.pages['on-hold-job-openings'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'On Hold Job Openings(30 days)',
		single_column: true
	});
}