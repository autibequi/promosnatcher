-- 0012_sources_cb.sql
-- Add cross-border marketplace sources: AliExpress, Shein, AWIN
-- These sources complement the Brazil-specific sources (Mercado Livre, Amazon BR) from 0011
-- AWIN is a multi-merchant affiliate network; each product includes source_subid for merchant identification

INSERT OR IGNORE INTO sources (id, name, category, enabled) VALUES
    ('aliexpress', 'AliExpress', 'ecommerce', 1),
    ('shein',      'Shein',      'ecommerce', 1),
    ('awin',       'AWIN Network','ecommerce', 1);
