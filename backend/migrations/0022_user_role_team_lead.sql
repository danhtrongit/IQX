-- Admin spec v1.1 §1.1: new `team_lead` role (Trưởng nhóm), ranked after `admin`.
-- The migration runner wraps each file in one transaction, and PostgreSQL forbids using a
-- freshly added enum value inside the transaction that added it. This file therefore holds
-- only the ADD VALUE; every statement that mentions 'team_lead' lives in a later file.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'team_lead';
