app_name = "btw_recruitment"
app_title = "BTW Recruitment"
app_publisher = "Sarim"
app_description = "An app designed to solve HR recruitment problems"
app_email = "sarim.khan@clapgrow.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "btw_recruitment",
# 		"logo": "/assets/btw_recruitment/logo.png",
# 		"title": "BTW Recruitment",
# 		"route": "/btw_recruitment",
# 		"has_permission": "btw_recruitment.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/btw_recruitment/css/btw_recruitment.css"
# app_include_js = "/assets/btw_recruitment/js/btw_recruitment.js"

# include js, css files in header of web template
# web_include_css = "/assets/btw_recruitment/css/btw_recruitment.css"
# web_include_js = "/assets/btw_recruitment/js/btw_recruitment.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "btw_recruitment/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "btw_recruitment/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "btw_recruitment.utils.jinja_methods",
# 	"filters": "btw_recruitment.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "btw_recruitment.install.before_install"
# after_install = "btw_recruitment.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "btw_recruitment.uninstall.before_uninstall"
# after_uninstall = "btw_recruitment.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "btw_recruitment.utils.before_app_install"
# after_app_install = "btw_recruitment.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "btw_recruitment.utils.before_app_uninstall"
# after_app_uninstall = "btw_recruitment.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "btw_recruitment.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"btw_recruitment.tasks.all"
# 	],
# 	"daily": [
# 		"btw_recruitment.tasks.daily"
# 	],
# 	"hourly": [
# 		"btw_recruitment.tasks.hourly"
# 	],
# 	"weekly": [
# 		"btw_recruitment.tasks.weekly"
# 	],
# 	"monthly": [
# 		"btw_recruitment.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "btw_recruitment.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "btw_recruitment.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "btw_recruitment.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["btw_recruitment.utils.before_request"]
# after_request = ["btw_recruitment.utils.after_request"]

# Job Events
# ----------
# before_job = ["btw_recruitment.utils.before_job"]
# after_job = ["btw_recruitment.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"btw_recruitment.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }
# doc_events = {
#     "BTW_Job_Opening": {
#         "after_insert": "btw_recruitment.btw_recruitment.doctype.btw_job_opening.btw_job_opening.after_insert"
#     },
#     "BTW_Job_Application": {
#         "after_insert": "btw_recruitment.btw_recruitment.doctype.btw_job_application.btw_job_application.after_insert"
#     }
# }


