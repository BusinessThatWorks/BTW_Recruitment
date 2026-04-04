// Global filters
let interview_dashboard_filters = {
	from_date: null,
	to_date: null,
};

// Summary table state
let job_openings_table_state = {
	limit: 20,
	offset: 0,
	total: 0,
};
let summary_table_filters = { search: "" };

// Details table state
let interview_details_table_state = {
	limit: 20,
	offset: 0,
	total: 0,
};

// Inline filters for details DataTable
let details_inline_filters = {
	job_opening: "",
	candidate: "",
	mapping_stage: "",
	interview_stage_main: "",
	interview_stage: "",
	interview_date: "",
	time: "",
};

// DataTable instance
let details_datatable = null;
let details_data_cache = []; // Cache for Excel export

let filter_debounce_timer = null;
let summary_search_timer = null;

function getTableLayout() {
	return window.innerWidth < 768 ? "fixed" : "fluid";
}

// ==================== PAGE LOAD ====================
frappe.pages["interview-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Interview Dashboard",
		single_column: true,
	});

	$(frappe.render_template("interview_dashboard")).appendTo(page.body);

	init_interview_tabs();
	bind_global_filters();
	bind_summary_search();
	bind_details_clear_filters();

	// Excel download – Summary uses server export; Details uses filtered DataTable rows
	$(document).off("click.interview", "#download-excel-btn");
	$(document).on("click.interview", "#download-excel-btn", function () {
		const activeTab = $("#interviewTabs .nav-link.active").attr(
			"data-bs-target",
		);
		const tab = activeTab === "#details-pane" ? "details" : "summary";

		// Details tab: export exactly the filtered rows visible in the DataTable
		if (tab === "details") {
			download_details_excel();
			return;
		}

		// Summary tab: server-side export using current date + search filters
		const payload = {
			tab: "summary",
			from_date: interview_dashboard_filters.from_date || null,
			to_date: interview_dashboard_filters.to_date || null,
			search: summary_table_filters.search || null,
		};

		open_url_post(
			"/api/method/btw_recruitment.btw_recruitment.api.interview_dashboard.download_interview_dashboard",
			payload,
			false,
		);
	});

	// Load initial data
	load_interview_dashboard_data();
	load_interview_details_datatable();
};

// ==================== TAB HANDLING ====================
function init_interview_tabs() {
	$("#interviewTabs button[data-bs-toggle='tab']")
		.off("click.interview")
		.on("click.interview", function (e) {
			e.preventDefault();
			const target = $(this).attr("data-bs-target");

			$("#interviewTabs .nav-link").removeClass("active");
			$(this).addClass("active");

			$(".tab-pane").removeClass("show active");
			$(target).addClass("show active");

			// Refresh DataTable when switching to details tab
			if (target === "#details-pane" && details_datatable) {
				details_datatable.refresh();
			}
		});
}

// ==================== GLOBAL DATE FILTERS ====================
function bind_global_filters() {
	$(document).off(
		"change.interview",
		"#interview-from-date, #interview-to-date",
	);
	$(document).off("click.interview", "#interview-clear-dates");

	$(document).on(
		"change.interview",
		"#interview-from-date, #interview-to-date",
		function () {
			clearTimeout(filter_debounce_timer);
			filter_debounce_timer = setTimeout(() => {
				interview_dashboard_filters.from_date =
					$("#interview-from-date").val() || null;
				interview_dashboard_filters.to_date =
					$("#interview-to-date").val() || null;

				// Reset pagination
				job_openings_table_state.offset = 0;
				interview_details_table_state.offset = 0;

				load_interview_dashboard_data();
				load_interview_details_datatable();
			}, 300);
		},
	);

	$(document).on("click.interview", "#interview-clear-dates", function () {
		$("#interview-from-date").val("");
		$("#interview-to-date").val("");
		interview_dashboard_filters.from_date = null;
		interview_dashboard_filters.to_date = null;

		job_openings_table_state.offset = 0;
		interview_details_table_state.offset = 0;

		load_interview_dashboard_data();
		load_interview_details_datatable();
	});
}

// ==================== SUMMARY TAB ====================
function bind_summary_search() {
	$(document).off("input.interview", "#summary-search");
	$(document).off("click.interview", "#summary-search-clear");

	$(document).on("input.interview", "#summary-search", function () {
		clearTimeout(summary_search_timer);
		summary_search_timer = setTimeout(() => {
			summary_table_filters.search = (
				$("#summary-search").val() || ""
			).trim();
			job_openings_table_state.offset = 0;
			load_interview_dashboard_data();
		}, 300);
	});

	$(document).on("click.interview", "#summary-search-clear", function () {
		$("#summary-search").val("");
		summary_table_filters.search = "";
		job_openings_table_state.offset = 0;
		load_interview_dashboard_data();
	});
}

function load_interview_dashboard_data() {
	const $container = $("#interview-dashboard-table");
	$container.html(
		'<div class="loading-state"><i class="fa fa-spinner fa-spin"></i> Loading...</div>',
	);

	frappe.call({
		method: "btw_recruitment.btw_recruitment.api.interview_dashboard.get_interview_dashboard_data",
		args: {
			from_date: interview_dashboard_filters.from_date,
			to_date: interview_dashboard_filters.to_date,
			search: summary_table_filters.search,
			limit: job_openings_table_state.limit,
			offset: job_openings_table_state.offset,
		},
		callback: function (r) {
			if (r.message) {
				job_openings_table_state.total = r.message.total || 0;
				render_interview_dashboard_table(
					r.message.data,
					r.message.total,
				);
			} else {
				$container.html(
					'<div class="empty-state">Unable to load data</div>',
				);
			}
		},
		error: function () {
			$container.html(
				'<div class="empty-state">Error loading data</div>',
			);
		},
	});
}

function render_interview_dashboard_table(data, total) {
	const $container = $("#interview-dashboard-table");
	$container.empty();

	if (!data || data.length === 0) {
		$container.html(
			'<div class="empty-state">No job openings data available</div>',
		);
		return;
	}

	const table = $(`
		<table class="table table-bordered table-striped table-hover">
			<thead>
				<tr>
					<th>Job Opening</th>
					<th>Status</th>
					<th>Open Positions</th>
					<th>CVs Mapped</th>
					<th>Candidates' Stages</th>
					<th>Interviews Today</th>
					<th>Joined</th>
				</tr>
			</thead>
			<tbody></tbody>
		</table>
	`);

	const tbody = table.find("tbody");

	data.forEach((row) => {
		const stages =
			row.stages && row.stages.length > 0
				? row.stages.map((s) => `${s.stage} (${s.count})`).join(", ")
				: "-";

		tbody.append(`
			<tr>
				<td><a href="/app/dkp_job_opening/${row.job_opening}">${row.job_opening || "-"}</a></td>
				<td>${row.status || "-"}</td>
				<td>${row.open_positions || 0}</td>
				<td>${row.cvs_mapped || 0}</td>
				<td style="max-width: 200px;">${stages}</td>
				<td>${row.interviews_scheduled_today || 0}</td>
				<td>${row.joined || 0}</td>
			</tr>
		`);
	});

	const wrapper = $('<div class="summary-table-wrapper"></div>');
	wrapper.append(table);
	$container.append(wrapper);
	render_summary_pagination($container);
}

function render_summary_pagination($container) {
	const state = job_openings_table_state;
	const total_pages = Math.ceil(state.total / state.limit) || 1;
	const current_page = Math.floor(state.offset / state.limit) + 1;
	const start = state.total === 0 ? 0 : state.offset + 1;
	const end = Math.min(state.offset + state.limit, state.total);

	const pagination = $(`
		<div class="pagination-container" style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding:12px;background:#f8f9fa;border-radius:4px;">
			<div class="pagination-info">Showing ${start} to ${end} of ${state.total} entries</div>
			<div class="pagination-buttons">
				<button class="prev-btn" ${state.offset === 0 ? "disabled" : ""}>Previous</button>
				<span style="padding:6px 12px;">Page ${current_page} of ${total_pages}</span>
				<button class="next-btn" ${current_page >= total_pages ? "disabled" : ""}>Next</button>
			</div>
		</div>
	`);

	$container.append(pagination);

	pagination.find(".prev-btn").on("click", function () {
		if (state.offset > 0) {
			job_openings_table_state.offset -= state.limit;
			load_interview_dashboard_data();
		}
	});

	pagination.find(".next-btn").on("click", function () {
		if (current_page < total_pages) {
			job_openings_table_state.offset += state.limit;
			load_interview_dashboard_data();
		}
	});
}

// ==================== DETAILS TAB (FRAPPE DATATABLE) ====================
function load_interview_details_datatable() {
	const $container = $("#interview-details-table");
	$container.html('<div class="loading-state">Loading...</div>');

	frappe.call({
		method: "btw_recruitment.btw_recruitment.api.interview_dashboard.get_interview_details",
		args: {
			from_date: interview_dashboard_filters.from_date,
			to_date: interview_dashboard_filters.to_date,
			limit: 1000, // Load more for client-side filtering
			offset: 0,
		},
		callback: function (r) {
			if (r.message && r.message.data) {
				render_details_datatable(r.message.data);
			} else {
				$container.html(
					'<div class="empty-state">No data available</div>',
				);
			}
		},
		error: function () {
			$container.html(
				'<div class="empty-state">Error loading data</div>',
			);
		},
	});
}

// function render_details_datatable(data) {
// 	const $container = $("#interview-details-table");
// 	$container.empty();

// 	if (!data || data.length === 0) {
// 		$container.html('<div class="empty-state">No interview details available</div>');
// 		return;
// 	}

// 	// Transform data
// 	const tableData = data.map(row => [
// 		row.job_opening || "-",
// 		row.candidate_display_name || row.candidate_name || "-",
// 		row.job_application_stage || "-",
// 		row.interview_stage_main || "-",
// 		row.interview_stage || "-",
// 		row.interview_date ? frappe.datetime.str_to_user(row.interview_date) : "-",
// 		row.interview_time_range || "-"
// 	]);

// 	// Columns
// 	const columns = [
// 		{ name: "Job Opening", width: 200, editable: false },
// 		{ name: "Candidate", width: 180, editable: false },
// 		{ name: "Mapping Stage", width: 140, editable: false },
// 		{ name: "Interview Stage Main", width: 160, editable: false },
// 		{ name: "Interview Stage", width: 140, editable: false },
// 		{ name: "Interview Date", width: 120, editable: false },
// 		{ name: "Time", width: 140, editable: false }
// 	];

// 	// ✅ destroy previous
// 	if (details_datatable) {
// 		details_datatable.destroy();
// 	}

// 	// ✅ create with dynamic layout
// 	details_datatable = new frappe.DataTable($container[0], {
// 		columns,
// 		data: tableData,
// 		inlineFilters: true,
// 		layout: getTableLayout(),
// 		noDataMessage: "No records found"
// 	});
// }
// global flag
let detailsResizeAttached = false;
let detailsResizeTimeout;

function render_details_datatable(data) {
	const $container = $("#interview-details-table");
	$container.empty();

	if (!data || data.length === 0) {
		$container.html(
			'<div class="empty-state">No interview details available</div>',
		);
		return;
	}

	const tableData = data.map((row) => [
		row.job_opening || "-",
		row.candidate_display_name || row.candidate_name || "-",
		row.job_application_stage || "-",
		row.interview_stage_main || "-",
		row.interview_stage || "-",
		row.interview_date
			? frappe.datetime.str_to_user(row.interview_date)
			: "-",
		row.interview_time_range || "-",
	]);

	const columns = [
		{ name: "Job Opening", width: 200 },
		{ name: "Candidate", width: 180 },
		{ name: "Mapping Stage", width: 140 },
		{ name: "Interview Stage Main", width: 160 },
		{ name: "Interview Stage", width: 140 },
		{ name: "Interview Date", width: 120 },
		{ name: "Time", width: 140 },
	];

	// destroy previous
	if (details_datatable) {
		details_datatable.destroy();
	}

	// create table
	details_datatable = new frappe.DataTable($container[0], {
		columns,
		data: tableData,
		inlineFilters: true,
		layout: getTableLayout(),
		noDataMessage: "No records found",
	});

	// ✅ attach resize ONLY ONCE
	if (!detailsResizeAttached) {
		detailsResizeAttached = true;

		window.addEventListener("resize", () => {
			clearTimeout(detailsResizeTimeout);

			detailsResizeTimeout = setTimeout(() => {
				const activeTab = $("#interviewTabs .nav-link.active").attr(
					"data-bs-target",
				);

				if (activeTab === "#details-pane") {
					load_interview_details_datatable();
				}
			}, 300);
		});
	}
}
function update_details_record_count(count, filtered = false) {
	const total = interview_details_table_state.total;
	const text = filtered
		? `Showing ${count} filtered of ${total} total records`
		: `Showing ${count} of ${total} total records`;
	$("#details-record-count").text(text);
}

function render_details_pagination() {
	const $container = $("#details-pagination");
	$container.empty();

	const state = interview_details_table_state;
	const total_pages = Math.ceil(state.total / state.limit) || 1;
	const current_page = Math.floor(state.offset / state.limit) + 1;
	const start = state.total === 0 ? 0 : state.offset + 1;
	const end = Math.min(state.offset + state.limit, state.total);

	$container.html(`
		<div class="pagination-info">Showing ${start} to ${end} of ${state.total} entries</div>
		<div class="pagination-buttons">
			<button class="prev-btn" ${state.offset === 0 ? "disabled" : ""}>Previous</button>
			<span style="padding:6px 12px;">Page ${current_page} of ${total_pages}</span>
			<button class="next-btn" ${current_page >= total_pages ? "disabled" : ""}>Next</button>
		</div>
	`);

	$container.find(".prev-btn").on("click", function () {
		if (state.offset > 0) {
			interview_details_table_state.offset -= state.limit;
			load_interview_details_datatable();
		}
	});

	$container.find(".next-btn").on("click", function () {
		if (current_page < total_pages) {
			interview_details_table_state.offset += state.limit;
			load_interview_details_datatable();
		}
	});
}

function bind_details_clear_filters() {
	$(document).off("click.interview", "#details-clear-filters");
	$(document).on("click.interview", "#details-clear-filters", function () {
		// Reset inline filters
		details_inline_filters = {
			job_opening: "",
			candidate: "",
			mapping_stage: "",
			interview_stage_main: "",
			interview_stage: "",
			interview_date: "",
			time: "",
		};

		// Clear filter inputs in DataTable
		$("#interview-details-datatable .dt-filter").val("");

		// Reload data
		interview_details_table_state.offset = 0;
		load_interview_details_datatable();
	});
}

// ==================== EXCEL DOWNLOAD ====================
function bind_excel_download() {
	$(document).off("click.interview", "#download-excel-btn");
	$(document).on("click.interview", "#download-excel-btn", function () {
		const activeTab = $("#interviewTabs .nav-link.active").attr(
			"data-bs-target",
		);

		if (activeTab === "#details-pane") {
			download_details_excel();
		} else {
			download_summary_excel();
		}
	});
}

function download_summary_excel() {
	open_url_post(
		"/api/method/btw_recruitment.btw_recruitment.api.interview_dashboard.download_interview_dashboard",
		{
			tab: "summary",
			from_date: interview_dashboard_filters.from_date || null,
			to_date: interview_dashboard_filters.to_date || null,
			search: summary_table_filters.search || null,
		},
		false,
	);
}
function download_details_excel() {
	if (!details_datatable) {
		frappe.msgprint("No data to export");
		return;
	}

	const rows = details_datatable.datamanager.getRows(true);

	if (!rows || rows.length === 0) {
		frappe.msgprint("No data to export");
		return;
	}

	// Extract values properly
	const filtered_data = rows.map((row) => ({
		job_opening: row[0]?.content || row[0] || "",
		candidate: row[1]?.content || row[1] || "",
		mapping_stage: row[2]?.content || row[2] || "",
		interview_stage_main: row[3]?.content || row[3] || "",
		interview_stage: row[4]?.content || row[4] || "",
		interview_date: row[5]?.content || row[5] || "",
		time: row[6]?.content || row[6] || "",
	}));

	// Direct download
	open_url_post(
		"/api/method/btw_recruitment.btw_recruitment.api.interview_dashboard.download_filtered_excel",
		{
			data: JSON.stringify(filtered_data),
		},
	);
}

// Update Excel button handler
$(document).off("click.interview", "#download-excel-btn");
$(document).on("click.interview", "#download-excel-btn", function () {
	const activeTab = $("#interviewTabs .nav-link.active").attr(
		"data-bs-target",
	);

	if (activeTab === "#details-pane") {
		download_details_excel();
	} else {
		// Summary tab - server side
		open_url_post(
			"/api/method/btw_recruitment.btw_recruitment.api.interview_dashboard.download_interview_dashboard",
			{
				tab: "summary",
				from_date: interview_dashboard_filters.from_date || null,
				to_date: interview_dashboard_filters.to_date || null,
				search: summary_table_filters.search || null,
			},
		);
	}
});

function export_details_to_excel_client(data) {
	// Use frappe's built-in export or create CSV
	const headers = [
		"Job Opening",
		"Candidate",
		"Mapping Stage",
		"Interview Stage Main",
		"Interview Stage",
		"Interview Date",
		"Time",
	];

	let csv_content = headers.join(",") + "\n";

	data.forEach((row) => {
		const values = [
			escape_csv(row.job_opening),
			escape_csv(row.candidate),
			escape_csv(row.mapping_stage),
			escape_csv(row.interview_stage_main),
			escape_csv(row.interview_stage),
			escape_csv(row.interview_date),
			escape_csv(row.time),
		];
		csv_content += values.join(",") + "\n";
	});

	// Download CSV
	const blob = new Blob([csv_content], { type: "text/csv;charset=utf-8;" });
	const link = document.createElement("a");
	const url = URL.createObjectURL(blob);
	link.setAttribute("href", url);
	link.setAttribute("download", "interview_details_filtered.csv");
	link.style.visibility = "hidden";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	frappe.show_alert(
		{
			message: `Exported ${data.length} filtered records`,
			indicator: "green",
		},
		3,
	);
}

function escape_csv(value) {
	if (value === null || value === undefined) return '""';
	const str = String(value);
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return '"' + str.replace(/"/g, '""') + '"';
	}
	return str;
}
