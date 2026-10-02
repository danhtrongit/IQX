-- The mobile app and its API were removed. Drop the tables and enum types
-- created by 0005_mobile_account.sql; 0005 is kept so applied checksums stay valid.
DROP TABLE IF EXISTS mobile_account_requests;
DROP TABLE IF EXISTS mobile_notification_preferences;
DROP TABLE IF EXISTS mobile_devices;
DROP TYPE IF EXISTS mobile_account_request_status;
DROP TYPE IF EXISTS mobile_account_request_kind;
