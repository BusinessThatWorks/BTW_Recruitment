frappe.pages['invoice-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Invoice Dashboard',
		single_column: true
	});
}