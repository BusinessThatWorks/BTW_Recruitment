# Copyright (c) 2025, Sarim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from datetime import datetime


class DKP_Company(Document):
	def autoname(self):
		self.name = self.company_name.strip()

	def before_insert(self):
		# Set created_by with the current user's email
		user_email = frappe.db.get_value("User", frappe.session.user, "email")
		if user_email:
			self.created_by = user_email
		
		# Set created_by_time in 12-hour format
		now = datetime.now()
		self.created_by_time = now.strftime("%I:%M:%S %p")

	def before_save(self):
		# Set last_modified_by with the current user's email
		user_email = frappe.db.get_value("User", frappe.session.user, "email")
		if user_email:
			self.last_modified_by = user_email
		
		# Set last_modified_by_time in 12-hour format
		now = datetime.now()
		self.last_modified_by_time = now.strftime("%I:%M:%S %p")

	def validate(self):
		# Check duplicate company name
		if frappe.db.exists(
			"DKP Company",
			{
				"company_name": self.company_name,
				"name": ["!=", self.name]
			}
		):
			frappe.throw(
				f"Company '{self.company_name}' already exists.",
				frappe.DuplicateEntryError
			)
