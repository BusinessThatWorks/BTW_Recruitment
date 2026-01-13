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

function normalizeSearchTerm(term) {
	if (!term) return "";
	return term.toLowerCase().trim().replace(/\s+/g, " ");
}

function normalMatch(searchTerm, text) {
	if (!searchTerm || !text) return false;
	return normalizeSearchTerm(text)
		.includes(normalizeSearchTerm(searchTerm));
}

function open_job_opening_dialog(selected_candidates) {
	const page_size = 10;
	let current_page = 1;
	let all_openings = [];
	let filtered_openings = [];
	let selected_opening = null;
	let filter_state = {
		search: "",
		status: "",
		priority: "",
		department: "",
		company: ""
	};

	// Build HTML structure
	const openings_html = `
		<div>
			<div class="row mb-2">
				<div class="col-sm-6 mb-2">
					<input type="text" class="form-control" id="candidate-dialog-search"
						   placeholder="Search by name, designation, company, department">
				</div>
				<div class="col-sm-3 mb-2">
					<select class="form-control" id="candidate-dialog-status">
						<option value="">All Status</option>
						<option value="Open">Open</option>
						<option value="On Hold">On Hold</option>
						<option value="Closed – Hired">Closed – Hired</option>
						<option value="Closed – Cancelled">Closed – Cancelled</option>
					</select>
				</div>
				<div class="col-sm-3 mb-2">
					<select class="form-control" id="candidate-dialog-priority">
						<option value="">All Priority</option>
						<option value="Low">Low</option>
						<option value="Medium">Medium</option>
						<option value="High">High</option>
						<option value="Critical">Critical</option>
					</select>
				</div>
			</div>
			<div class="row mb-2 align-items-center">
				<div class="col-sm-4">
					<select class="form-control" id="candidate-dialog-department">
						<option value="">All Departments</option>
					</select>
				</div>

				<div class="col-sm-4">
					<input
						type="text"
						class="form-control"
						id="candidate-dialog-company"
						list="candidate-company-list"
						placeholder="All Companies"
					>
					<datalist id="candidate-company-list"></datalist>
				</div>

				<div class="col-sm-4 text-end">
					<button class="btn btn-sm btn-dark" id="candidate-clear-filters">
						Clear Filters
					</button>
				</div>
			</div>

			<div id="candidate-openings-list" style="max-height: 450px; overflow-y: auto;"></div>
			<div id="candidate-openings-pagination" class="mt-2 d-flex justify-content-between align-items-center"></div>
		</div>
	`;

	const dialog = new frappe.ui.Dialog({
		title: __("Select Job Opening"),
		size: "large",
		fields: [
			{
				fieldtype: "HTML",
				options: openings_html
			}
		],
		primary_action_label: __("Add to Selected Opening"),
		primary_action() {
			if (!selected_opening) {
				frappe.msgprint({
					title: __("No Selection"),
					message: __("Please select a job opening to add candidates."),
					indicator: "orange"
				});
				return;
			}
			add_candidates_to_opening(selected_opening, selected_candidates);
			dialog.hide();
		}
	});

	dialog.show();

	// Load filter options
	load_filter_options(dialog);
	
	// Load job openings
	load_openings(dialog, current_page);

	// Bind filter events
	let searchTimeout;
	dialog.$wrapper.find("#candidate-dialog-search").on("keyup", function() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			filter_state.search = normalizeSearchTerm($(this).val());
			current_page = 1;
			apply_filters(dialog);
		}, 300);
	});

	dialog.$wrapper.find("#candidate-dialog-status, #candidate-dialog-priority, #candidate-dialog-department, #candidate-dialog-company").on("change", function() {
		const id = $(this).attr("id");
		if (id === "candidate-dialog-status") {
			filter_state.status = $(this).val();
		} else if (id === "candidate-dialog-priority") {
			filter_state.priority = $(this).val();
		} else if (id === "candidate-dialog-department") {
			filter_state.department = $(this).val();
		} 
		current_page = 1;
		apply_filters(dialog);
	});
	// ⬇️ SEPARATE handler for company (datalist)
	dialog.$wrapper.find("#candidate-dialog-company").on("input", function () {
	const val = this.value;

	const option = dialog.$wrapper.find(
		`#candidate-company-list option[value="${val}"]`
	);

	filter_state.company = option.length ? option.data("id") : null;

	current_page = 1;
	apply_filters(dialog);
	});
	dialog.$wrapper.find("#candidate-clear-filters").on("click", function () {

	// 🔹 Stop pending search debounce
	clearTimeout(searchTimeout);

	// 1️⃣ Clear UI fields
	dialog.$wrapper.find(
		"#candidate-dialog-status, #candidate-dialog-priority, #candidate-dialog-department, #candidate-dialog-search"
	).val("");

	dialog.$wrapper.find("#candidate-dialog-company").val("");

	// 2️⃣ Reset filter state
	filter_state = {
		status: null,
		priority: null,
		department: null,
		company: null,
		search: null
	};

	// 3️⃣ Reset pagination
	current_page = 1;

	// 4️⃣ Re-render
	apply_filters(dialog);
});


	function load_filter_options(d) {
		// Load departments
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "DKP_Department",
				fields: ["department"],
				distinct: true
			},
			callback(r) {
				if (r.message) {
					const depts = r.message.filter(d => d.department).map(d => d.department);
					const $deptSelect = d.$wrapper.find("#candidate-dialog-department");
					depts.forEach(dept => {
						$deptSelect.append(`<option value="${dept}">${dept}</option>`);
					});
				}
			}
		});

		// Load companies
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "DKP_Company",
				fields: ["name", "company_name"],
				limit_page_length: 1000
			},
			callback(r) {
				if (r.message) {
					const $datalist = d.$wrapper.find("#candidate-company-list");
					$datalist.empty();

					r.message.forEach(comp => {
						$datalist.append(`
							<option value="${comp.company_name || comp.name}" data-id="${comp.name}"></option>
						`);
					});
				}
			}
		});

	}

	function load_openings(d, page) {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.api.candidate_openings.get_job_openings_for_candidate_dialog",
			args: {
				limit: 1000, // Load all for client-side filtering
				offset: 0,
				search: filter_state.search || null,
				status: filter_state.status || null,
				priority: filter_state.priority || null,
				department: filter_state.department || null,
				company: filter_state.company || null
			},
			callback(r) {
				if (r.message && r.message.data) {
					all_openings = r.message.data;
					apply_filters(d);
				}
			}
		});
	}

	function apply_filters(d) {
		// Apply client-side fuzzy search if search term exists
		if (filter_state.search) {
			filtered_openings = all_openings.filter(opening => {
				return normalMatch(filter_state.search, opening.name) ||
					normalMatch(filter_state.search, opening.designation) ||
					normalMatch(filter_state.search, opening.company) ||
					normalMatch(filter_state.search, opening.department);
			});
		} else {
			filtered_openings = [...all_openings];
		}

		// Apply other filters
		if (filter_state.status) {
			filtered_openings = filtered_openings.filter(o => o.status === filter_state.status);
		}
		if (filter_state.priority) {
			filtered_openings = filtered_openings.filter(o => o.priority === filter_state.priority);
		}
		if (filter_state.department) {
			filtered_openings = filtered_openings.filter(o => o.department === filter_state.department);
		}
		if (filter_state.company) {
			filtered_openings = filtered_openings.filter(o => o.company === filter_state.company);
		}

		render_openings(d);
	}

	function render_openings(d) {
		const $list = d.$wrapper.find("#candidate-openings-list");
		$list.empty();

		if (filtered_openings.length === 0) {
			$list.html(`<div class="text-center text-muted p-4">No job openings found</div>`);
			d.$wrapper.find("#candidate-openings-pagination").empty();
			return;
		}

		// Pagination
		const total_pages = Math.ceil(filtered_openings.length / page_size);
		const start_idx = (current_page - 1) * page_size;
		const end_idx = start_idx + page_size;
		const page_openings = filtered_openings.slice(start_idx, end_idx);

		// Render cards
		page_openings.forEach(opening => {
			const isSelected = selected_opening === opening.name;
			const priorityColors = {
				"Low": "#6c757d",
				"Medium": "#ffc107",
				"High": "#fd7e14",
				"Critical": "#dc3545"
			};
			const statusColors = {
				"Open": "#28a745",
				"Closed": "#6c757d",
				"On Hold": "#ffc107"
			};

			const cardHtml = `
				<div class="opening-card mb-3 p-3" 
					 style="border: 2px solid ${isSelected ? "#007bff" : "#dee2e6"}; 
							border-radius: 6px; 
							background: ${isSelected ? "#e7f3ff" : "#fff"};
							cursor: pointer;
							transition: all 0.2s;"
					 data-opening="${opening.name}">
					<div class="d-flex justify-content-between align-items-start">
						<div class="flex-grow-1">
							<div class="d-flex align-items-center mb-2">
								<input type="radio" name="opening-selection" 
									   value="${opening.name}" 
									   id="opening-${opening.name}"
									   ${isSelected ? "checked" : ""}
									   style="margin-right: 8px;">
								<label for="opening-${opening.name}" style="margin: 0; cursor: pointer;">
									<strong style="font-size: 1.1em;">${opening.name}</strong>
								</label>
							</div>
							<div class="mb-2">
								<span class="badge" style="background: ${statusColors[opening.status] || "#6c757d"}; color: white; margin-right: 5px;">
									${opening.status || "N/A"}
								</span>
								${opening.priority ? `
									<span class="badge" style="background: ${priorityColors[opening.priority] || "#6c757d"}; color: white;">
										${opening.priority}
									</span>
								` : ""}
							</div>
							<div style="font-size: 0.9em; color: #495057;">
								<div><strong>Designation:</strong> ${opening.designation || "N/A"}</div>
								<div><strong>Company:</strong> ${opening.company || "N/A"}</div>
								${opening.department ? `<div><strong>Department:</strong> ${opening.department}</div>` : ""}
								${opening.location ? `<div><strong>Location:</strong> ${opening.location}</div>` : ""}
								${opening.number_of_positions ? `<div><strong>Positions:</strong> ${opening.number_of_positions}</div>` : ""}
								${opening.min_experience_years || opening.max_experience_years ? `
									<div><strong>Experience:</strong> 
										${opening.min_experience_years || 0} - ${opening.max_experience_years || "∞"} years
									</div>
								` : ""}
								${opening.min_ctc || opening.max_ctc ? `
									<div><strong>CTC:</strong> 
										${opening.min_ctc ? opening.min_ctc + " - " : ""}${opening.max_ctc || "∞"}
									</div>
								` : ""}
								${opening.assign_recruiter ? `<div><strong>Recruiter:</strong> ${opening.assign_recruiter}</div>` : ""}
							</div>
						</div>
						<div>
							<a href="/app/dkp_job_opening/${opening.name}" target="_blank" 
							   class="btn btn-sm btn-secondary" 
							   onclick="event.stopPropagation();">
								View
							</a>
						</div>
					</div>
				</div>
			`;
			$list.append(cardHtml);
		});

		// Bind click events
		d.$wrapper.find(".opening-card").on("click", function(e) {
			if ($(e.target).is("input[type='radio']") || $(e.target).is("label") || $(e.target).is("a")) {
				return;
			}
			const opening_name = $(this).data("opening");
			selected_opening = opening_name;
			d.$wrapper.find(`input[type='radio'][value='${opening_name}']`).prop("checked", true);
			render_openings(d);
		});

		d.$wrapper.find('input[type="radio"][name="opening-selection"]').on("change", function() {
			selected_opening = $(this).val();
			render_openings(d);
		});

		// Render pagination
		const $pagination = d.$wrapper.find("#candidate-openings-pagination");
		$pagination.empty();
		if (total_pages > 1) {
			$pagination.html(`
				<div class="d-flex align-items-center gap-2">
					<button class="btn btn-sm btn-primary" ${current_page === 1 ? "disabled" : ""} id="candidate-openings-prev">
						Prev
					</button>
					<span>Page ${current_page} of ${total_pages} (${filtered_openings.length} total)</span>
					<button class="btn btn-sm btn-primary" ${current_page === total_pages ? "disabled" : ""} id="candidate-openings-next">
						Next
					</button>
				</div>
			`);

			d.$wrapper.find("#candidate-openings-prev").on("click", () => {
				if (current_page > 1) {
					current_page--;
					render_openings(d);
				}
			});

			d.$wrapper.find("#candidate-openings-next").on("click", () => {
				if (current_page < total_pages) {
					current_page++;
					render_openings(d);
				}
			});
		}
	}
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

			const already_existing = [];

			selected_candidates.forEach(row => {
				const exists = (doc.candidates_table || []).some(
					d => d.candidate_name === row.name
				);

				if (exists) {
					already_existing.push(row.name);
					return;
				}

				doc.candidates_table = doc.candidates_table || [];
				doc.candidates_table.push({
					candidate_name: row.name
				});
			});


			frappe.call({
				method: "frappe.client.save",
				args: { doc },
				callback() {
					let message = __("Candidates added to Job Opening successfully");

					if (already_existing.length) {
						const existing_list = already_existing.join(", ");
						message += "<br><br>" + __("Already there: {0}", [existing_list]);
					}

					frappe.msgprint({
						title: __("Success"),
						message: message,
						indicator: "green"
					});
				}
			});
		}
	});
}
