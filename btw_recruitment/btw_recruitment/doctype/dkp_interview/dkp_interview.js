// Copyright (c) 2025, Sarim and contributors
// For license information, please see license.txt

frappe.ui.form.on("DKP_Interview", {
	onload: function (frm) {
		// Set default recruiter
		if (!frm.doc.added_by) {
			frm.set_value("added_by", frappe.session.user);
		}
	},

	refresh: function (frm) {
		// Clear previous comments to avoid duplicates
		frm.dashboard.clear_comment();

		// Apply freeze logic for existing documents
		if (!frm.is_new()) {
			check_and_apply_freeze(frm);
		}
		// Filter is_replacement_for - show only "Joined And Left" interviews of same job opening
		frm.set_query("is_replacement_for", function () {
			return {
				filters: {
					job_opening: frm.doc.job_opening,
					stage: "Joined And Left",
					name: ["!=", frm.doc.name],
				},
			};
		});
	},

	after_save: function (frm) {
		// Sync Job Opening after save
		if (frm.doc.job_opening) {
			frappe.db
				.get_doc("DKP_Job_Opening", frm.doc.job_opening)
				.then((doc) => {
					frappe.model.sync(doc);
				});
		}
	},
});

// ==================== FREEZE FUNCTIONS ====================

function check_and_apply_freeze(frm) {
	frappe.call({
		method: "btw_recruitment.btw_recruitment.doctype.dkp_interview.dkp_interview.check_interview_freeze_status",
		args: {
			interview_name: frm.doc.name,
		},
		callback: function (r) {
			if (r.message && r.message.is_frozen) {
				apply_freeze(frm, r.message);
			}
		},
	});
}

function apply_freeze(frm, freeze_info) {
	if (freeze_info.freeze_type === "bill_sent") {
		// Make protected fields read-only
		let protected_fields = [
			"candidate_name",
			"job_opening",
			"added_by",
			"joining_date",
			"offered_amount",
			"remarks_for_invoice",
			"invoice_ref",
		];

		protected_fields.forEach(function (field) {
			frm.set_df_property(field, "read_only", 1);
		});

		// Stage and candidate_left_date remain editable
		frm.set_df_property("stage", "read_only", 0);
		frm.set_df_property("candidate_left_date", "read_only", 0);

		// Limit stage options
		frm.set_df_property("stage", "options", "Joined\nJoined And Left");

		// Show warning
		frm.dashboard.add_comment(
			'🔒 Bill Sent: Only "Joined And Left" stage change is allowed.',
			"yellow",
			true,
		);

		// Freeze child table
		if (
			frm.fields_dict["interview_child_table"] &&
			frm.fields_dict["interview_child_table"].grid
		) {
			frm.fields_dict["interview_child_table"].grid.cannot_add_rows =
				true;
			frm.fields_dict["interview_child_table"].grid.cannot_delete_rows =
				true;
			frm.set_df_property("interview_child_table", "read_only", 1);
		}
	} else if (freeze_info.freeze_type === "replacement_policy") {
		// Full freeze
		frm.disable_form();
		frm.disable_save();

		frm.dashboard.add_comment("🔒 " + freeze_info.message, "red", true);
	}
}
