#!/usr/bin/env python3
"""
Migration 011: Add Topic of the Week and Poll features

Adds columns to support informal community net features:
- Net/NetTemplate: topic_of_week_enabled, topic_of_week_prompt, poll_enabled, poll_question
- CheckIn: topic_response, poll_response
"""

import sqlite3
import os

def migrate():
    # Find the database
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')
    if not os.path.exists(db_path):
        db_path = os.path.join(os.path.dirname(__file__), '..', 'app', 'ectlogger.db')
    
    if not os.path.exists(db_path):
        print("Database not found, skipping migration")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check what columns already exist in nets table
    cursor.execute("PRAGMA table_info(nets)")
    net_columns = {row[1] for row in cursor.fetchall()}
    
    # Add columns to nets table
    if 'topic_of_week_enabled' not in net_columns:
        cursor.execute("ALTER TABLE nets ADD COLUMN topic_of_week_enabled BOOLEAN DEFAULT 0")
        print("Added topic_of_week_enabled to nets")
    
    if 'topic_of_week_prompt' not in net_columns:
        cursor.execute("ALTER TABLE nets ADD COLUMN topic_of_week_prompt VARCHAR(500)")
        print("Added topic_of_week_prompt to nets")
    
    if 'poll_enabled' not in net_columns:
        cursor.execute("ALTER TABLE nets ADD COLUMN poll_enabled BOOLEAN DEFAULT 0")
        print("Added poll_enabled to nets")
    
    if 'poll_question' not in net_columns:
        cursor.execute("ALTER TABLE nets ADD COLUMN poll_question VARCHAR(500)")
        print("Added poll_question to nets")
    
    # Check what columns already exist in net_templates table
    cursor.execute("PRAGMA table_info(net_templates)")
    template_columns = {row[1] for row in cursor.fetchall()}
    
    # Add columns to net_templates table
    if 'topic_of_week_enabled' not in template_columns:
        cursor.execute("ALTER TABLE net_templates ADD COLUMN topic_of_week_enabled BOOLEAN DEFAULT 0")
        print("Added topic_of_week_enabled to net_templates")
    
    if 'topic_of_week_prompt' not in template_columns:
        cursor.execute("ALTER TABLE net_templates ADD COLUMN topic_of_week_prompt VARCHAR(500)")
        print("Added topic_of_week_prompt to net_templates")
    
    if 'poll_enabled' not in template_columns:
        cursor.execute("ALTER TABLE net_templates ADD COLUMN poll_enabled BOOLEAN DEFAULT 0")
        print("Added poll_enabled to net_templates")
    
    if 'poll_question' not in template_columns:
        cursor.execute("ALTER TABLE net_templates ADD COLUMN poll_question VARCHAR(500)")
        print("Added poll_question to net_templates")
    
    # Check what columns already exist in check_ins table
    cursor.execute("PRAGMA table_info(check_ins)")
    checkin_columns = {row[1] for row in cursor.fetchall()}
    
    # Add columns to check_ins table
    if 'topic_response' not in checkin_columns:
        cursor.execute("ALTER TABLE check_ins ADD COLUMN topic_response TEXT")
        print("Added topic_response to check_ins")
    
    if 'poll_response' not in checkin_columns:
        cursor.execute("ALTER TABLE check_ins ADD COLUMN poll_response VARCHAR(255)")
        print("Added poll_response to check_ins")
    
    conn.commit()
    conn.close()
    print("Migration 011 completed successfully!")

if __name__ == "__main__":
    migrate()
