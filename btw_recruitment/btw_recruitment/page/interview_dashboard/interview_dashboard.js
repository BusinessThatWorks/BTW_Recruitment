let interview_dashboard_filters = {
	from_date: null,
	to_date: null
};

// Pagination state for job openings table
let job_openings_table_state = {
	limit: 20,
	offset: 0,
	total: 0
};

// Pagination state for interview details table
let interview_details_table_state = {
	limit: 20,
	offset: 0,
	total: 0
};

// Debounce timer for live filtering
let filter_debounce_timer = null;

frappe.pages['interview-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Interview Dashboard',
		single_column: true
	});

	// Load HTML template
	$(frappe.render_template("interview_dashboard")).appendTo(page.body);

	// Load initial data
	load_kpi_cards();
	load_interview_dashboard_data();
	// load_interview_details_data();

	// Live date filtering (debounced)
	$(document).on("change", "#interview-from-date, #interview-to-date", function() {
		clearTimeout(filter_debounce_timer);
		filter_debounce_timer = setTimeout(function() {
			interview_dashboard_filters.from_date = $("#interview-from-date").val() || null;
			interview_dashboard_filters.to_date = $("#interview-to-date").val() || null;
			
			// Reset pagination
			job_openings_table_state.offset = 0;
			interview_details_table_state.offset = 0;
			
			// Reload all data
			load_kpi_cards();
			load_interview_dashboard_data();
			// load_interview_details_data();
		}, 300); // 300ms debounce
	});

	// Clear dates button
	$(document).on("click", "#interview-clear-dates", function() {
		$("#interview-from-date").val("");
		$("#interview-to-date").val("");
		interview_dashboard_filters.from_date = null;
		interview_dashboard_filters.to_date = null;
		
		// Reset pagination
		job_openings_table_state.offset = 0;
		interview_details_table_state.offset = 0;
		
		// Reload all data
		load_kpi_cards();
		load_interview_dashboard_data();
		// load_interview_details_data();
	});
}

function load_kpi_cards() {
	const $container = $("#interview-kpi-cards");
	$container.html('<div class="loading-state">Loading KPIs...</div>');
	
	frappe.call({
		method: "btw_recruitment.btw_recruitment.api.interview_dashboard.get_interview_dashboard_kpis",
		args: {
			from_date: interview_dashboard_filters.from_date,
			to_date: interview_dashboard_filters.to_date
		},
		callback: function(r) {
			if (r.message) {
				render_kpi_cards(r.message);
			} else {
				$container.html('<div class="empty-state">Unable to load KPIs</div>');
			}
		},
		error: function() {
			$container.html('<div class="empty-state">Error loading KPIs</div>');
		}
	});
}

function render_kpi_cards(data) {
	const $container = $("#interview-kpi-cards");
	$container.empty();

	const kpis = [
		// {
		// 	label: "Total Interviews Scheduled For Today",
		// 	value: data.interviews_scheduled_today || 0,
		// 	color: "#3b82f6"
		// },
		// {
		// 	label: "Candidates Joined",
		// 	value: data.joined_candidates || 0,
		// 	color: "#10b981"
		// }
	];

	kpis.forEach(kpi => {
		$container.append(`
			<div class="kpi-card-interview">
				<div class="kpi-value-interview" style="color: ${kpi.color}">
					${kpi.value}
				</div>
				<div class="kpi-label-interview">
					${kpi.label}
				</div>
			</div>
		`);
	});
}

function load_interview_dashboard_data() {
	const $container = $("#interview-dashboard-table");
	$container.html('<div class="loading-state">Loading job openings data...</div>');
	
	frappe.call({
		method: "btw_recruitment.btw_recruitment.api.interview_dashboard.get_interview_dashboard_data",
		args: {
			from_date: interview_dashboard_filters.from_date,
			to_date: interview_dashboard_filters.to_date,
			limit: job_openings_table_state.limit,
			offset: job_openings_table_state.offset
		},
		callback: function(r) {
			if (r.message) {
				job_openings_table_state.total = r.message.total || 0;
				render_interview_dashboard_table(r.message.data, r.message.total);
			} else {
				$container.html('<div class="empty-state">Unable to load data</div>');
			}
		},
		error: function() {
			$container.html('<div class="empty-state">Error loading data</div>');
		}
	});
}

function render_interview_dashboard_table(data, total) {
	const $container = $("#interview-dashboard-table");
	$container.empty();

	if (!data || data.length === 0) {
		$container.html(`
			<div class="empty-state">
				No job openings data available
			</div>
		`);
		return;
	}

	// Create table
	const table = $(`
		<table class="table table-bordered table-striped table-hover">
			<thead>
				<tr>
					<th>Job Opening</th>
					
					<th>Status</th>
					<th>No. of Open Positions</th>
					<th>No. of CVs Mapped</th>
					<th>Candidates' Stages</th>
					<th>Interviews Scheduled For Today</th>
					
					<th>Joined</th>
				</tr>
			</thead>
			<tbody></tbody>
		</table>
	`);

	const tbody = table.find("tbody");

	data.forEach(row => {
		// Format stages as comma-separated list
		const stages = row.stages && row.stages.length > 0 
			? row.stages.map(s => `${s.stage} (${s.count})`).join(", ")
			: "-";

		tbody.append(`
			<tr>
				<td>
					<a href="/app/dkp_job_opening/${row.job_opening}">
						${row.job_opening || "-"}
					</a>
				</td>
				
				<td>${row.status || "-"}</td>
				<td>${row.open_positions || 0}</td>
				<td>${row.cvs_mapped || 0}</td>
				<td style="max-width: 200px; word-wrap: break-word;">${stages}</td>
				<td>${row.interviews_scheduled_today || 0}</td>
				<td>${row.joined || 0}</td>
			</tr>
		`);
	});

	$container.append(table);
	
	// Add pagination
	render_pagination($container, job_openings_table_state, function(direction) {
		if (direction === 'prev') {
			job_openings_table_state.offset = Math.max(0, job_openings_table_state.offset - job_openings_table_state.limit);
		} else if (direction === 'next') {
			job_openings_table_state.offset += job_openings_table_state.limit;
		}
		load_interview_dashboard_data();
	});
}

// function load_interview_details_data() {
// 	const $container = $("#interview-details-table");
// 	$container.html('<div class="loading-state">Loading interview details...</div>');
	
// 	frappe.call({
// 		method: "btw_recruitment.btw_recruitment.api.interview_dashboard.get_interview_details",
// 		args: {
// 			from_date: interview_dashboard_filters.from_date,
// 			to_date: interview_dashboard_filters.to_date,
// 			limit: interview_details_table_state.limit,
// 			offset: interview_details_table_state.offset
// 		},
// 		callback: function(r) {
// 			if (r.message) {
// 				interview_details_table_state.total = r.message.total || 0;
// 				render_interview_details_table(r.message.data, r.message.total);
// 			} else {
// 				$container.html('<div class="empty-state">Unable to load interview details</div>');
// 			}
// 		},
// 		error: function() {
// 			$container.html('<div class="empty-state">Error loading interview details</div>');
// 		}
// 	});
// }

// function render_interview_details_table(data, total) {
// 	const $container = $("#interview-details-table");
// 	$container.empty();

// 	if (!data || data.length === 0) {
// 		$container.html(`
// 			<div class="empty-state">
// 				No interview details available
// 			</div>
// 		`);
// 		return;
// 	}

// 	// Create table
// 	const table = $(`
// 		<table class="table table-bordered table-striped table-hover">
// 			<thead>
// 				<tr>
// 					<th>Interview Date</th>
// 					<th>Time</th>
// 					<th>Candidate</th>
// 					<th>Job Opening</th>
// 					<th>Company</th>
// 					<th>Designation</th>
// 					<th>Interview Stage</th>
// 					<th>Interviewer Email</th>
// 					<th>Feedback</th>
// 					<th>Status</th>
// 				</tr>
// 			</thead>
// 			<tbody></tbody>
// 		</table>
// 	`);

// 	const tbody = table.find("tbody");

// 	data.forEach(row => {
// 		// Format time
// 		const time_str = row.interview_from_time && row.interview_to_time
// 			? `${row.interview_from_time} - ${row.interview_to_time}`
// 			: row.interview_from_time || row.interview_to_time || "-";
		
// 		// Format date
// 		const date_str = row.interview_date 
// 			? frappe.datetime.str_to_user(row.interview_date)
// 			: "-";
		
// 		// Candidate link
// 		const candidate_link = row.candidate_name
// 			? `<a href="/app/dkp_candidate/${row.candidate_name}">${row.candidate_display_name || row.candidate_name}</a>`
// 			: "-";
		
// 		// Job opening link
// 		const job_link = row.job_opening
// 			? `<a href="/app/dkp_job_opening/${row.job_opening}">${row.job_opening}</a>`
// 			: "-";
		
// 		// Status
// 		const status = row.substage || row.interview_stage_main || "-";

// 		tbody.append(`
// 			<tr>
// 				<td>${date_str}</td>
// 				<td>${time_str}</td>
// 				<td>${candidate_link}</td>
// 				<td>${job_link}</td>
// 				<td>${row.company_name || "-"}</td>
// 				<td>${row.designation || "-"}</td>
// 				<td>${row.interview_stage || "-"}</td>
// 				<td>${row.interviewer_email || "-"}</td>
// 				<td style="max-width: 200px; word-wrap: break-word;">${row.feedback || "-"}</td>
// 				<td>${status}</td>
// 			</tr>
// 		`);
// 	});

// 	$container.append(table);
	
// 	// Add pagination
// 	render_pagination($container, interview_details_table_state, function(direction) {
// 		if (direction === 'prev') {
// 			interview_details_table_state.offset = Math.max(0, interview_details_table_state.offset - interview_details_table_state.limit);
// 		} else if (direction === 'next') {
// 			interview_details_table_state.offset += interview_details_table_state.limit;
// 		}
// 		load_interview_details_data();
// 	});
// }

function render_pagination($container, state, callback) {
	const total_pages = Math.ceil(state.total / state.limit) || 1;
	const current_page = Math.floor(state.offset / state.limit) + 1;
	const start_record = state.total === 0 ? 0 : state.offset + 1;
	const end_record = Math.min(state.offset + state.limit, state.total);

	const pagination = $(`
		<div class="pagination-container">
			<div class="pagination-info">
				Showing ${start_record} to ${end_record} of ${state.total} entries
			</div>
			<div class="pagination-buttons">
				<button class="pagination-prev-btn" ${state.offset === 0 ? 'disabled' : ''}>Previous</button>
				<span style="padding: 6px 12px; font-size: 14px;">Page ${current_page} of ${total_pages}</span>
				<button class="pagination-next-btn" ${current_page >= total_pages ? 'disabled' : ''}>Next</button>
			</div>
		</div>
	`);

	$container.append(pagination);

	pagination.find(".pagination-prev-btn").on("click", function() {
		if (state.offset > 0) callback('prev');
	});
	pagination.find(".pagination-next-btn").on("click", function() {
		if (current_page < total_pages) callback('next');
	});
}
