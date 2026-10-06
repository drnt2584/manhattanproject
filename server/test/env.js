// Imported first by every test file: point the app at the test database.
process.env.ENV_FILE = '/dev/null';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://notify:notify@localhost:5432/notify_test';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'correct-horse-battery';
process.env.ADMIN_NOTIFY_EMAILS = 'boss@test.local';
process.env.DEFAULT_COUNTRY_CODE = '60';
process.env.APP_TIMEZONE = 'Asia/Kuala_Lumpur';
process.env.DATE_FORMAT = 'DMY';
process.env.AMOUNT_LOCALE = 'en-MY';
process.env.AMOUNT_CURRENCY = 'MYR';
process.env.WHATSAPP_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'mock';
process.env.LOG_LEVEL = 'silent';
process.env.SEND_RETRY_BASE_MS = '1';
process.env.PUBLIC_URL = 'http://localhost:4000';
