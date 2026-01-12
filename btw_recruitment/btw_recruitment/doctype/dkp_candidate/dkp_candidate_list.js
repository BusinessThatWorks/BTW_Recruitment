frappe.listview_settings["DKP_Candidate"] = {
	onload(listview) {

		const mark_btn = listview.page.add_inner_button(
			__("Add to openings"),
			() => {
				const selected = listview.get_checked_items();

				if (!selected.length) {
					frappe.msgprint(__("Please select at least one record"));
					return;
				}

				open_job_opening_dialog(selected);
			}
		);
	}
};

function open_job_opening_dialog(selected_candidates) {

	const dialog = new frappe.ui.Dialog({
		title: __("Add Candidates to Job Opening"),
		fields: [
			{
				label: __("Job Opening"),
				fieldname: "job_opening",
				fieldtype: "Link",
				options: "DKP_Job_Opening",
				reqd: 1
			}
		],
		primary_action_label: __("Add"),
		primary_action(values) {

			if (!values.job_opening) return;

			add_candidates_to_opening(values.job_opening, selected_candidates);
			dialog.hide();
		}
	});

	dialog.show();
}

function add_candidates_to_opening(job_opening, selected_candidates) {

	frappe.call({
		method: "frappe.client.get",
		args: {
			doctype: "DKP_Job_Opening",
			name: job_opening
		},
		callback(r) {
			if (!r.message) return;

			const doc = r.message;

			selected_candidates.forEach(row => {
	const exists = (doc.candidates_table || []).some(
		d => d.candidate_name === row.name
	);

	if (!exists) {
		doc.candidates_table = doc.candidates_table || [];
		doc.candidates_table.push({
			candidate_name: row.name
		});
	}
});


			frappe.call({
				method: "frappe.client.save",
				args: { doc },
				callback() {
					frappe.msgprint({
						title: __("Success"),
						message: __("Candidates added to Job Opening successfully"),
						indicator: "green"
					});
				}
			});
		}
	});
}
