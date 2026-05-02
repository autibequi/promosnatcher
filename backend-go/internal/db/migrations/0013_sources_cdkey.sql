-- Seed Humble Bundle and Kinguin sources in sources table
INSERT OR IGNORE INTO sources (id, name, category, enabled) VALUES
    ('humble',  'Humble Bundle', 'cdkey', 1),
    ('kinguin', 'Kinguin',       'cdkey', 1);
