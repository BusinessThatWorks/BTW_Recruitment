function download_excel_from_rows(filename, headers, rows) {
	let html = "<table><thead><tr>";
	headers.forEach((h) => {
		const safeHeader = frappe.utils?.escape_html?.(h) || h;
		html += `<th>${safeHeader}</th>`;
	});
	html += "</tr></thead><tbody>";

	rows.forEach((row) => {
		html += "<tr>";
		row.forEach((cell) => {
			const text = cell == null ? "" : String(cell);
			const safeText = frappe.utils?.escape_html?.(text) || text;
			html += `<td>${safeText}</td>`;
		});
		html += "</tr>";
	});
	html += "</tbody></table>";

	const blob = new Blob([html], {
		type: "application/vnd.ms-excel;charset=utf-8;",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename || "export.xls";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
function getCellValue(cell) {
	if (cell == null) return "-";

	if (typeof cell === "string" || typeof cell === "number") {
		return stripHTML(String(cell)) || "-";
	}

	if (typeof cell === "object") {
		const value =
			cell.content || cell.value || cell.text || cell.data || "";
		return stripHTML(String(value)) || "-";
	}

	return "-";
}

function stripHTML(value) {
	if (value == null || value === "") return "";
	const str = String(value);
	const tmp = document.createElement("div");
	tmp.innerHTML = str;
	return tmp.textContent || tmp.innerText || str;
}
frappe.pages["recruiter-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Recruiter Dashboard"),
		single_column: true,
	});

	$(frappe.render_template("recruiter_dashboard", {})).appendTo(page.body);

	// =============================
	// STATE VARIABLES
	// =============================
	// let state = {
	// 	recruiter: null,
	// 	from_date: null,
	// 	to_date: null,
	// 	status: null,
	// 	page: 1,
	// 	page_length: 20,
	// 	total: 0,
	// };
	let state = {
		recruiter: null,
		from_date: null,
		to_date: null,
		status: null,
	};

	// =============================
	// DOM REFERENCES
	// =============================
	const $body = $(page.body);
	const $openings_container = $body.find("#recruiter-openings-table");
	// const $page_info = $body.find(".recruiter-page-info");
	// const $btn_prev = $body.find(".recruiter-prev");
	// const $btn_next = $body.find(".recruiter-next");

	// DataTable state
	let openingsDataTable = null;
	// let openingsInlineFilters = {};
	// let openingsFilterTimeout = null;
	// const openingsColumns = [
	// 	"#",
	// 	"Job Opening",
	// 	"Company",
	// 	"Designation",
	// 	"Status",
	// 	"Positions",
	// 	"Candidates Mapped",
	// 	"Joined",
	// 	"Replacements",
	// 	"Stable Join",
	// 	"Joined Candidates",
	// ];

	// KPI elements
	const $kpi_openings = $body.find(".kpi-openings");
	const $kpi_positions = $body.find(".kpi-positions");
	const $kpi_candidates = $body.find(".kpi-candidates");
	const $kpi_joined = $body.find(".kpi-joined");
	const $kpi_conversion = $body.find(".kpi-conversion");
	const $kpi_join_rate = $body.find(".kpi-join-rate");

	// ✅ TWO Funnel container references
	const $mapping_funnel = $body.find("#mapping-funnel");
	const $interview_funnel = $body.find("#interview-funnel");

	// =============================
	// DEBOUNCE FUNCTION
	// =============================
	let debounce_timer;
	function debounced_refresh() {
		clearTimeout(debounce_timer);
		debounce_timer = setTimeout(() => {
			refresh_dashboard();
		}, 300);
	}
	// =============================
	// MAIN REFRESH FUNCTION
	// =============================
	function refresh_dashboard() {
		// ✅ REMOVED: recruiter check - now loads all data if no recruiter

		if (state.from_date && state.to_date) {
			if (state.from_date > state.to_date) {
				frappe.show_alert({
					message: "From Date cannot be greater than To Date",
					indicator: "red",
				});
				return;
			}
		}

		load_data();
		load_kpis();
		load_funnels();
	}

	// =============================
	// FILTER CONTROLS
	// =============================

	const recruiter_control = frappe.ui.form.make_control({
		parent: $body.find(".recruiter-control-slot"),
		df: {
			fieldtype: "Link",
			options: "User",
			placeholder: "Select Recruiter",
			get_query: () => ({
				filters: {
					role_profile_name: [
						"in",
						["DKP Recruiter", "DKP Recruiter - Exclusive", "Admin"],
					],
					enabled: 1,
				},
			}),
			change: function () {
				state.recruiter = recruiter_control.get_value() || null;
				debounced_refresh();
			},
		},
		render_input: true,
	});

	const from_date_control = frappe.ui.form.make_control({
		parent: $body.find(".from-date-slot"),
		df: {
			fieldtype: "Date",
			placeholder: "From Date",
			change: function () {
				state.from_date = from_date_control.get_value() || null;
				debounced_refresh();
			},
		},
		render_input: true,
	});

	const to_date_control = frappe.ui.form.make_control({
		parent: $body.find(".to-date-slot"),
		df: {
			fieldtype: "Date",
			placeholder: "To Date",
			change: function () {
				state.to_date = to_date_control.get_value() || null;
				debounced_refresh();
			},
		},
		render_input: true,
	});

	const status_control = frappe.ui.form.make_control({
		parent: $body.find(".status-slot"),
		df: {
			fieldtype: "Select",
			options: "\nOpen\nClosed – Hired",
			placeholder: "All Status",
			change: function () {
				state.status = status_control.get_value() || null;
				debounced_refresh();
			},
		},
		render_input: true,
	});
	// setTimeout(() => {
	// 	from_date_control.set_value(frappe.datetime.get_today());
	// 	to_date_control.set_value(frappe.datetime.get_today());
	// }, 100);
	setTimeout(() => {
		// Get current year's January 1st
		const today = frappe.datetime.get_today(); // "YYYY-MM-DD"
		const currentYear = today.split("-")[0]; // "YYYY"
		const jan_first = `${currentYear}-01-01`; // "YYYY-01-01"

		// Set state
		state.from_date = jan_first;
		state.to_date = today;

		// Set controls (UI)
		from_date_control.set_value(jan_first);
		to_date_control.set_value(today);
	}, 100);
	// =============================
	// CLEAR BUTTON
	// =============================
	// $body.find(".recruiter-clear").on("click", function () {
	// 	recruiter_control.set_value("");
	// 	from_date_control.set_value("");
	// 	to_date_control.set_value("");
	// 	status_control.set_value("");

	// 	state = {
	// 		recruiter: null,
	// 		from_date: null,
	// 		to_date: null,
	// 		status: null,
	// 	};

	// 	refresh_dashboard();
	// 	frappe.show_alert({
	// 		message: "Filters cleared",
	// 		indicator: "blue",
	// 	});
	// });
	$body.find(".recruiter-clear").on("click", function () {
		const today = frappe.datetime.get_today();
		const currentYear = today.split("-")[0];
		const jan_first = `${currentYear}-01-01`;

		recruiter_control.set_value("");
		from_date_control.set_value(jan_first);
		to_date_control.set_value(today);
		status_control.set_value("");

		state = {
			recruiter: null,
			from_date: jan_first,
			to_date: today,
			status: null,
		};

		refresh_dashboard();
		frappe.show_alert({
			message: "Filters cleared",
			indicator: "blue",
		});
	});

	// =============================
	// KPI FUNCTIONS
	// =============================
	function reset_kpis() {
		$kpi_openings.text(0);
		$kpi_positions.text(0);
		$kpi_candidates.text(0);
		$kpi_joined.text(0);
		$kpi_conversion.text("0%");
		$kpi_join_rate.text("0%");
	}

	function load_kpis() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiter_kpis",
			args: {
				recruiter: state.recruiter || "", // ✅ Empty string if no recruiter
				from_date: state.from_date,
				to_date: state.to_date,
				status: state.status,
			},
			callback(r) {
				const k = r.message || {};

				$kpi_openings.text(k.total_openings || 0);
				$kpi_positions.text(k.total_positions || 0);
				$kpi_candidates.text(k.total_candidates || 0);
				$kpi_joined.text(k.total_joined || 0);
				$kpi_conversion.text((k.avg_conversion || 0) + "%");
				$kpi_join_rate.text((k.candidate_join_rate || 0) + "%");
			},
		});
	}

	// =============================
	// ✅ FUNNEL FUNCTIONS (Two Separate Funnels)
	// =============================
	function reset_funnels() {
		const empty_html = `
        <div class="funnel-empty">
            <div class="funnel-empty-icon">📊</div>
            <div class="funnel-empty-text">Select a recruiter</div>
        </div>
    `;
		$mapping_funnel.html(empty_html);
		$interview_funnel.html(empty_html);
	}

	function load_funnels() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_funnel_data",
			args: {
				recruiter: state.recruiter || "",
				from_date: state.from_date,
				to_date: state.to_date,
				status: state.status,
			},
			callback(r) {
				const data = r.message || {};
				render_mapping_funnel(data.mapping_stages || {});
				render_interview_funnel(data.interview_stages || {});
			},
		});
	}

	function render_mapping_funnel(data) {
		const stages = [
			{
				name: "Total Mapped",
				value: data.total_mapped || 0,
				color: "#8b5cf6",
				isFirst: true,
			},
			{
				name: "No Response",
				value: data.no_response || 0,
				color: "#6b7280",
			},
			{
				name: "Submitted To Client",
				value: data.submitted_to_client || 0,
				color: "#ec4899",
			},
			{
				name: "Client Rejected",
				value: data.client_rejected || 0,
				color: "#ef4444",
			},
			{
				name: "Schedule Interview",
				value: data.schedule_interview || 0,
				color: "#3b82f6",
			},
		];

		// ✅ Sort and separate: active stages first, then zero stages
		const sorted = sortFunnelStagesWithZeros(stages);

		render_horizontal_bars($mapping_funnel, sorted);
	}

	function render_interview_funnel(data) {
		const stages = [
			{
				name: "Total Interview",
				value: data.total_interview || 0,
				color: "#8b5cf6",
				isFirst: true,
			},
			{
				name: "No Show",
				value: data.interview_no_show || 0,
				color: "#f97316",
			},
			{
				name: "Selected",
				value: data.selected_for_offer || 0,
				color: "#22c55e",
			},
			{
				name: "Rejected",
				value: data.rejected_by_client || 0,
				color: "#ef4444",
			},
			{ name: "Offered", value: data.offered || 0, color: "#eab308" },
			{
				name: "Accepted",
				value: data.offer_accepted || 0,
				color: "#a855f7",
			},
			{
				name: "Declined",
				value: data.offer_declined || 0,
				color: "#f43f5e",
			},
			{ name: "Joined", value: data.joined || 0, color: "#10b981" },
			{
				name: "Left",
				value: data.joined_and_left || 0,
				color: "#f59e0b",
			},
		];

		// ✅ Sort and separate: active stages first, then zero stages
		const sorted = sortFunnelStagesWithZeros(stages);

		render_horizontal_bars($interview_funnel, sorted);
	}

	// ✅ NEW Sort function - Active stages first (sorted desc), then zero stages at bottom
	function sortFunnelStagesWithZeros(stages) {
		if (stages.length <= 1) return stages;

		const first = stages[0]; // Always keep first stage at top
		const rest = stages.slice(1);

		// Separate active (value > 0) and zero stages
		const activeStages = rest.filter((s) => s.value > 0);
		const zeroStages = rest.filter((s) => s.value === 0);

		// Sort active stages by value descending
		activeStages.sort((a, b) => b.value - a.value);

		// Mark zero stages as inactive for styling
		zeroStages.forEach((s) => (s.isZero = true));

		return [first, ...activeStages, ...zeroStages];
	}

	// ✅ Updated Horizontal Bars Renderer with greyed out zero stages
	// ✅ Updated Horizontal Bars Renderer with greyed out zero stages
	function render_horizontal_bars($container, stages) {
		$container.empty();

		const total = stages[0]?.value || 0;

		if (total === 0) {
			$container.html(`
            <div class="funnel-empty">
                <div class="funnel-empty-icon">📭</div>
                <div class="funnel-empty-text">No data</div>
            </div>
        `);
			return;
		}

		// ✅ Max value for width calculation (only from non-zero stages)
		const nonZeroValues = stages
			.filter((s) => s.value > 0)
			.map((s) => s.value);
		const maxValue = Math.max(...nonZeroValues, 1);

		stages.forEach((stage) => {
			const percentage = ((stage.value / total) * 100).toFixed(1);

			const isZero = stage.isZero || stage.value === 0;

			// ✅ CHANGED: Smaller width for zero stages (5% instead of 15%)
			const width = isZero ? 5 : (stage.value / maxValue) * 100;

			const bgColor = isZero ? "#d1d5db" : stage.color;
			const textColor = isZero ? "#9ca3af" : "#ffffff";
			const zeroClass = isZero ? "zero-stage" : "";

			const $bar = $(`
            <div class="h-bar-row ${zeroClass}">
                <div class="h-bar-label" style="${isZero ? "color: #9ca3af;" : ""}">${
					stage.name
				}</div>
                <div class="h-bar-track">
                    <div class="h-bar ${zeroClass}" style="width: ${width}%; background: ${bgColor};">
                        <span class="h-bar-value" style="color: ${textColor};">${
							stage.value
						}</span>
                    </div>
                </div>
                <div class="h-bar-percent" style="${
					isZero ? "color: #9ca3af;" : ""
				}">${percentage}%</div>
            </div>
        `);

			$container.append($bar);
		});
	}

	// =============================
	// PAGINATION BUTTONS
	// =============================
	// $btn_prev.on("click", function () {
	// 	if (state.page > 1) {
	// 		state.page--;
	// 		load_data();
	// 	}
	// });

	// $btn_next.on("click", function () {
	// 	const max_page = Math.ceil(state.total / state.page_length) || 1;
	// 	if (state.page < max_page) {
	// 		state.page++;
	// 		load_data();
	// 	}
	// });

	// =============================
	// MAIN DATA LOADER
	// =============================
	// function load_data() {
	// 	// ✅ REMOVED recruiter check

	// 	const offset = (state.page - 1) * state.page_length;

	// 	frappe.call({
	// 		method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiter_openings",
	// 		args: {
	// 			recruiter: state.recruiter || "", // ✅ Empty string if no recruiter
	// 			from_date: state.from_date,
	// 			to_date: state.to_date,
	// 			status: state.status,
	// 			limit: state.page_length,
	// 			offset: offset,
	// 			filters: JSON.stringify(openingsInlineFilters || {}),
	// 		},
	// 		freeze: true,
	// 		freeze_message: __("Loading data..."),
	// 		callback(r) {
	// 			const resp = r.message || {};
	// 			const rows = resp.data || [];
	// 			state.total = resp.total || 0;

	// 			render_openings_table(rows);
	// 			update_pagination(state.total);
	// 		},
	// 	});
	// }
	function load_data() {
		frappe.call({
			method: "btw_recruitment.btw_recruitment.api.recruiter_dashboard.get_recruiter_openings",
			args: {
				recruiter: state.recruiter || "",
				from_date: state.from_date,
				to_date: state.to_date,
				status: state.status,
				limit: 0,
				offset: 0,
			},
			freeze: true,
			freeze_message: __("Loading data..."),
			callback(r) {
				const resp = r.message || {};
				const rows = resp.data || [];
				render_openings_table(rows);
			},
		});
	}
	// =============================
	// DATATABLE RENDER
	// =============================
	function render_openings_table(rows) {
		$openings_container.empty();

		// if (!rows.length) {
		// 	$openings_container.html(
		// 		'<p class="text-muted text-center mb-0">No openings found</p>',
		// 	);
		// 	openingsDataTable = null;
		// 	return;
		// }

		// ✅ Store rows reference for format function to access
		const rowsRef = rows;

		const columns = [
			{ name: "#", width: 50 },
			{
				name: "Job Opening",
				width: 150,
				format: (value) => {
					const name = value || "";
					const url = `/app/dkp_job_opening/${encodeURIComponent(name)}`;
					const label = frappe.utils.escape_html(name || "-");
					return `<a href="${url}" target="_blank" style="color:#2490ef;font-weight:600;">${label}</a>`;
				},
			},
			{ name: "Company", width: 120 },
			{ name: "Designation", width: 120 },
			{
				name: "Status",
				width: 100,
				format: (value) => {
					const status = value || "";
					let status_class = "";
					if (status === "Open") status_class = "badge badge-success";
					else if (status === "Closed – Hired")
						status_class = "badge badge-info";
					else if (status === "On Hold")
						status_class = "badge badge-warning";
					else if (status === "Closed – Cancelled")
						status_class = "badge badge-danger";
					return `<span class="${status_class}">${frappe.utils.escape_html(
						status,
					)}</span>`;
				},
			},
			{ name: "Positions", width: 80 },
			{ name: "Candidates Mapped", width: 120 },
			{ name: "Joined", width: 80 },
			{ name: "Replacements", width: 100 },
			{
				name: "Joined Candidates",
				width: 200,
				focusable: false,
				format: (value, row, column, data) => {
					const rowIndex = row?.meta?.rowIndex ?? row?.[0]?.rowIndex;
					const joinedList =
						rowsRef[rowIndex]?.joined_candidate_list || [];

					if (!Array.isArray(joinedList) || !joinedList.length) {
						return "-";
					}

					// ✅ Simple comma separated names
					const names = joinedList.map(
						(c) => c.candidate_name || c.name || "Unknown",
					);
					return names.join(", ");
				},
			},
		];

		const tableData = rows.map((row, index) => [
			index + 1,
			row.job_opening || "",
			row.company_name || "",
			row.designation || "",
			row.status || "",
			row.number_of_positions || 0,
			row.total_candidates || 0,
			row.joined_candidates || 0,
			row.replacements || 0,
			"", // joined candidates placeholder
		]);
		function getTableLayout() {
			return window.innerWidth < 768 ? "fixed" : "fluid";
		}
		function renderOpeningsTable() {
			if (openingsDataTable) {
				openingsDataTable.destroy();
			}

			openingsDataTable = new frappe.DataTable($openings_container[0], {
				columns,
				data: tableData,
				inlineFilters: true,
				noDataMessage: __("No openings found"),
				layout: getTableLayout(),
				serialNoColumn: false,
				editing: false,
			});
		}
		renderOpeningsTable();
		let resizeTimeout;

		window.addEventListener("resize", () => {
			clearTimeout(resizeTimeout);

			resizeTimeout = setTimeout(() => {
				renderOpeningsTable();
			}, 300);
		});
	}

	// =============================
	// TOOLTIP INIT
	// =============================
	setTimeout(() => {
		$('[data-toggle="tooltip"]').tooltip();
	}, 300);

	// =============================
	// EXCEL DOWNLOAD (single button)
	// =============================
	function download_openings_excel() {
		if (!openingsDataTable) {
			frappe.msgprint(__("No data available to download."));
			return;
		}

		let rowsToExport = [];

		try {
			const dm = openingsDataTable.datamanager;
			const allRows = dm.getRows();
			const totalRows = allRows.length;

			const rowViewOrder = dm.rowViewOrder || [];
			const filteredIndices = dm.getFilteredRowIndices() || [];

			let finalIndices = [];

			const isSorted =
				rowViewOrder.length > 0 &&
				!rowViewOrder.every((val, idx) => val === idx);

			const isFiltered =
				filteredIndices.length > 0 &&
				filteredIndices.length < totalRows;

			console.log("isSorted:", isSorted, "isFiltered:", isFiltered);

			if (isSorted && isFiltered) {
				const filterSet = new Set(filteredIndices);
				finalIndices = rowViewOrder.filter((idx) => filterSet.has(idx));
				console.log("Using: Sorted + Filtered:", finalIndices.length);
			} else if (isSorted) {
				finalIndices = rowViewOrder;
				console.log("Using: Only Sorted:", finalIndices.length);
			} else if (isFiltered) {
				finalIndices = filteredIndices;
				console.log("Using: Only Filtered:", finalIndices.length);
			} else {
				finalIndices = allRows.map((_, i) => i);
				console.log("Using: All rows:", finalIndices.length);
			}

			rowsToExport = finalIndices.map((i) => allRows[i]);
		} catch (e) {
			console.log("Error getting rows:", e);
			frappe.msgprint(__("Error getting data."));
			return;
		}

		if (!rowsToExport || rowsToExport.length === 0) {
			frappe.msgprint(__("No data to download."));
			return;
		}

		const headers = [
			"#",
			"Job Opening",
			"Company",
			"Designation",
			"Status",
			"Positions",
			"Candidates Mapped",
			"Joined",
			"Replacements",
			"Joined Candidates",
		];

		const excelRows = rowsToExport.map((row) => {
			return [
				getCellValue(row[0]),
				getCellValue(row[1]),
				getCellValue(row[2]),
				getCellValue(row[3]),
				getCellValue(row[4]),
				getCellValue(row[5]),
				getCellValue(row[6]),
				getCellValue(row[7]),
				getCellValue(row[8]),
				getCellValue(row[9]),
			];
		});

		download_excel_from_rows("recruiter_openings.xls", headers, excelRows);

		frappe.show_alert({
			message: __("Downloaded {0} openings", [excelRows.length]),
			indicator: "green",
		});
	}

	$body
		.find("#download-recruiter-excel")
		.off("click")
		.on("click", function () {
			download_openings_excel();
		});

	// =============================
	// INITIAL STATE
	// =============================
	reset_funnels();
	refresh_dashboard();
};
