// Copyright (c) 2026, Sarim and contributors
// For license information, please see license.txt

frappe.ui.form.on("DKP_Joining_Tracker", {
	refresh: function (frm) {
		// Clear previous comments to avoid duplicates
		frm.dashboard.clear_comment();

		// Check freeze status first
		if (!frm.is_new()) {
			check_joining_tracker_freeze(frm);

			// Add Sales Invoice button (only if not frozen)
			add_sales_invoice_button(frm);
		}
	},
});

// ==================== FREEZE FUNCTIONS ====================

function check_joining_tracker_freeze(frm) {
	frappe.call({
		method: "btw_recruitment.btw_recruitment.doctype.dkp_joining_tracker.dkp_joining_tracker.check_joining_tracker_freeze_status",
		args: {
			tracker_name: frm.doc.name,
		},
		callback: function (r) {
			if (r.message && r.message.is_frozen) {
				frm.disable_form();
				frm.disable_save();

				frm.dashboard.add_comment("🔒 " + r.message.message, "red", true);
			}
		},
	});
}

// ==================== SALES INVOICE BUTTON ====================

function add_sales_invoice_button(frm) {
	frm.add_custom_button(__("Create Sales Invoice"), () => {
		if (!frm.doc.company_name) {
			frappe.msgprint({
				title: "⚠️ Error",
				message: "Fill Company name First",
				indicator: "red",
			});
			return;
		}

		frappe.new_doc("Sales Invoice", {
			customer: frm.doc.company_name,
			custom_joining_tracker_link: frm.doc.name,
		});

		frappe.show_alert(
			{
				message: `✅ Sales Invoice created for: ${frm.doc.company_name}`,
				indicator: "green",
			},
			3
		);
	});

	// Make it Primary (Blue) button
	frm.change_custom_button_type("Create Sales Invoice", null, "primary");
}
