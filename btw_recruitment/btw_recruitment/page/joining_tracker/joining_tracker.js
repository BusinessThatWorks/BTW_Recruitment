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

frappe.pages["joining-tracker"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Joining Tracker",
		single_column: true,
	});

	// Render HTML template
	$(frappe.render_template("joining_tracker", {})).appendTo(page.body);

	const $body = $(page.body);
	const $table_container = $body.find("#jt-table");
	const $page_info = $body.find(".jt-page-info");
	const $btn_prev = $body.find(".jt-prev");
	const $btn_next = $body.find(".jt-next");
	const $btn_download = $body.find("#jt-download-excel");

	let state = {
		from_date: null,
		to_date: null,
		page: 1,
		page_length: 20,
		total: 0,
	};

	let jtDataTable = null;
	let jtInlineFilters = {};
	let jtFilterTimeout = null;

	const jtColumns = [
		"Tracker ID",
		"Company",
		"Job Opening",
		"Candidate Name",
		"Designation",
		"Joining Date",
		"Status",
		"Billing Status",
		"Billable CTC",
		"Billing Value",
		"Billing Fee %",
		"Billing Month",
		"Candidate Contact",
		"Hiring Location",
		"Recruiter",
		"Recipient Name",
		"Recipient Mail",
		"Recipient No.",
		"GSTIN/UIN",
		"Recruiter Remarks",
		"Accountant Remarks",
	];

	const from_control = frappe.ui.form.make_control({
		parent: $body.find(".jt-filter-from"),
		df: {
			fieldtype: "Date",
			label: "Joining From",
			change() {
				state.from_date = from_control.get_value() || null;
				state.page = 1;
				load_dashboard();
			},
		},
		render_input: true,
	});

	const to_control = frappe.ui.form.make_control({
		parent: $body.find(".jt-filter-to"),
		df: {
			fieldtype: "Date",
			label: "Joining To",
			change() {
				state.to_date = to_control.get_value() || null;
				state.page = 1;
				load_dashboard();
			},
		},
		render_input: true,
	});

	$body.on("click", ".jt-clear-btn", function () {
		from_control.set_value("");
		to_control.set_value("");

		state = {
			from_date: null,
			to_date: null,
			page: 1,
			page_length: 20,
			total: 0,
		};

		jtInlineFilters = {};
		jtDataTable = null;

		reset_dashboard();
		load_dashboard();
	});

	function load_dashboard() {
		const offset = (state.page - 1) * state.page_length;

		frappe.call({
			method: "btw_recruitment.btw_recruitment.api.joining_tracker_dashboard.get_joining_tracker_dashboard",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				limit: state.page_length,
				offset: offset,
				filters: JSON.stringify(jtInlineFilters || {}),
			},
			freeze: true,
			freeze_message: __("Loading joining data..."),
			callback: function (r) {
				if (!r.message) {
					reset_dashboard();
					return;
				}

				const resp = r.message;
				state.total = resp.total || 0;

				render_summary(resp.summary || {});
				render_table(resp.rows || []);
				update_pagination(state.total);
			},
		});
	}

	function reset_dashboard() {
		render_summary({});
		render_table([]);
		update_pagination(0);
	}

	function fmtInt(val) {
		return Number(val || 0).toLocaleString("en-IN");
	}
	function fmtCurr(val) {
		return (
			"₹ " +
			Number(val || 0).toLocaleString("en-IN", {
				minimumFractionDigits: 2,
			})
		);
	}

	function render_summary(s) {
		$("#kpi-total-count").text(fmtInt(s.total_count));
		$("#kpi-yet-count").text(fmtInt(s.yet_to_bill_count));
		$("#kpi-yet-value").text(fmtCurr(s.yet_to_bill_value));
		$("#kpi-sent-count").text(fmtInt(s.bill_sent_count));
		$("#kpi-sent-value").text(fmtCurr(s.bill_sent_value));
		$("#kpi-paid-count").text(fmtInt(s.paid_count));
		$("#kpi-paid-value").text(fmtCurr(s.paid_value));
	}

	function render_table(rows) {
		$table_container.empty();

		if (!rows || !rows.length) {
			$table_container.html(
				'<p class="text-muted text-center mb-0">No joining records found</p>',
			);
			jtDataTable = null;
			return;
		}

		const columns = [
			{
				name: "Tracker ID",
				width: 160,
				format: (v) =>
					v
						? `<a href="/app/dkp_joining_tracker/${v}" target="_blank" style="color: #2490ef; font-weight: bold; text-decoration: underline;">${v}</a>`
						: "-",
			},
			{ name: "Company", width: 180 },
			{ name: "Job Opening", width: 150 },
			{ name: "Candidate Name", width: 160 },
			{ name: "Designation", width: 140 },
			{ name: "Joining Date", width: 110 },
			{ name: "Status", width: 100 },
			{
				name: "Billing Status",
				width: 140,
				format: (v) => {
					if (!v) return "-";
					let cls = "status-yet";
					if (v === "Bill Sent") cls = "status-sent";
					if (v === "Payment Received") cls = "status-paid";
					return `<span class="status-badge ${cls}">${v}</span>`;
				},
			},
			{ name: "Billable CTC", width: 120, format: (v) => fmtCurr(v) },
			{ name: "Billing Value", width: 120, format: (v) => fmtCurr(v) },
			{ name: "Billing Fee %", width: 100 },
			{ name: "Billing Month", width: 110 },
			{ name: "Candidate Contact", width: 130 },
			{ name: "Hiring Location", width: 130 },
			{ name: "Recruiter", width: 130 },
			{ name: "Recipient Name", width: 150 },
			{ name: "Recipient Mail", width: 180 },
			{ name: "Recipient No.", width: 130 },
			{ name: "GSTIN/UIN", width: 130 },
			{ name: "Recruiter Remarks", width: 200 },
			{ name: "Accountant Remarks", width: 200 },
		];

		const data = rows.map((r) => [
			r.name,
			r.company_name || "-",
			r.job_opening || "-",
			r.candidate_name || "-",
			r.designation || "-",
			r.joining_date || "-",
			r.status || "-",
			r.billing_status || "Yet to Bill",
			r.billable_ctc || 0,
			r.billing_value || 0,
			r.billing_fee || "-",
			r.billing_month || "-",
			r.candidate_contact || "-",
			r.hiring_location || "-",
			r.recruiter || "-",
			r.recipients_name || "-",
			r.recipients_mail_id || "-",
			r.recipients_number || "-",
			r.gstinuin || "-",
			r.remarks_by_recruiter || "-",
			r.accountant_remarks || "-",
		]);

		jtDataTable = new frappe.DataTable($table_container[0], {
			columns: columns,
			data: data,
			inlineFilters: true,
			noDataMessage: __("No joining records found"),
			// Use fixed layout so table can grow horizontally and scroll instead of squeezing
			layout: "fixed",
			serialNoColumn: false,
		});

		setTimeout(() => {
			restore_inline_filters();
			attach_inline_filter_listeners();
		}, 100);
	}

	function restore_inline_filters() {
		if (!jtDataTable) return;
		if (!jtInlineFilters || Object.keys(jtInlineFilters).length === 0)
			return;

		$("#jt-table .dt-filter").each(function (index) {
			const colName = jtColumns[index];
			if (jtInlineFilters[colName]) {
				$(this).val(jtInlineFilters[colName]);
			}
		});
	}

	function attach_inline_filter_listeners() {
		$("#jt-table .dt-filter")
			.off("input.backend")
			.on("input.backend", function () {
				clearTimeout(jtFilterTimeout);

				jtFilterTimeout = setTimeout(() => {
					const filters = {};

					$("#jt-table .dt-filter").each(function (index) {
						const value = $(this).val()?.trim();
						const colName = jtColumns[index];
						if (value) {
							filters[colName] = value;
						}
					});

					state.page = 1;
					jtInlineFilters = filters;
					load_dashboard();
				}, 500);
			});
	}

	function update_pagination(total_count) {
		const max_page = Math.max(
			1,
			Math.ceil((total_count || 0) / state.page_length),
		);

		if (!total_count) {
			$page_info.text("Showing 0 of 0 entries");
		} else {
			const start = (state.page - 1) * state.page_length + 1;
			const end = Math.min(state.page * state.page_length, total_count);
			$page_info.text(`Showing ${start}–${end} of ${total_count}`);
		}

		$btn_prev.prop("disabled", state.page <= 1);
		$btn_next.prop("disabled", state.page >= max_page);
	}

	$btn_prev.on("click", function () {
		if (state.page > 1) {
			state.page--;
			load_dashboard();
		}
	});

	$btn_next.on("click", function () {
		const max_page = Math.ceil((state.total || 0) / state.page_length) || 1;
		if (state.page < max_page) {
			state.page++;
			load_dashboard();
		}
	});

	function download_joining_excel() {
		const filters_payload = jtInlineFilters || {};

		frappe.call({
			method: "btw_recruitment.btw_recruitment.api.joining_tracker_dashboard.get_joining_tracker_dashboard",
			args: {
				from_date: state.from_date,
				to_date: state.to_date,
				limit: 0, // 0 => all rows for export
				offset: 0,
				filters: JSON.stringify(filters_payload),
			},
			callback(r) {
				const resp = r.message || {};
				const rows = resp.rows || [];

				if (!rows.length) {
					frappe.msgprint(__("No data to download."));
					return;
				}

				const headers = jtColumns.slice();

				const data_rows = rows.map((r) => [
					r.name,
					r.company_name || "-",
					r.job_opening || "-",
					r.candidate_name || "-",
					r.designation || "-",
					r.joining_date || "-",
					r.status || "-",
					r.billing_status || "Yet to Bill",
					r.billable_ctc || 0,
					r.billing_value || 0,
					r.billing_fee || "-",
					r.billing_month || "-",
					r.candidate_contact || "-",
					r.hiring_location || "-",
					r.recruiter || "-",
					r.recipients_name || "-",
					r.recipients_mail_id || "-",
					r.recipients_number || "-",
					r.gstinuin || "-",
					r.remarks_by_recruiter || "-",
					r.accountant_remarks || "-",
				]);

				download_excel_from_rows(
					"joining_tracker.xls",
					headers,
					data_rows,
				);

				frappe.show_alert({
					message: __("Downloaded {0} joining records", [
						data_rows.length,
					]),
					indicator: "green",
				});
			},
		});
	}

	$btn_download.off("click").on("click", function () {
		download_joining_excel();
	});

	// Initial load
	reset_dashboard();
	load_dashboard();
};
