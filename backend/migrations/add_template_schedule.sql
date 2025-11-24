-- Migration: Add schedule fields to net_templates table
-- Allows templates to define recurring schedules (daily, weekly, monthly) or ad-hoc

ALTER TABLE net_templates ADD COLUMN schedule_type VARCHAR(20) DEFAULT 'ad_hoc';
ALTER TABLE net_templates ADD COLUMN schedule_config TEXT DEFAULT '{}';
